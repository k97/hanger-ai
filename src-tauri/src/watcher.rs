use crate::domain::{Mechanism, LinkState, resolve_state};
use crate::preferences::PreferencesStore;
use notify::{Watcher, RecursiveMode, RecommendedWatcher, Event};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub const WATCHER_DEBOUNCE_DURATION: Duration = Duration::from_millis(500);

pub struct TrackedCopyWatcher {
    pub db_path: PathBuf,
    registered_sources: Arc<Mutex<HashSet<PathBuf>>>,
    last_event_time: Arc<Mutex<HashMap<PathBuf, Instant>>>,
    rederivation_counter: Arc<Mutex<usize>>,
    _watcher: Option<RecommendedWatcher>,
}

impl TrackedCopyWatcher {
    pub fn new(db_path: PathBuf) -> Self {
        Self {
            db_path,
            registered_sources: Arc::new(Mutex::new(HashSet::new())),
            last_event_time: Arc::new(Mutex::new(HashMap::new())),
            rederivation_counter: Arc::new(Mutex::new(0)),
            _watcher: None,
        }
    }

    pub fn start_active_watcher(&mut self) -> Result<(), String> {
        self.refresh_registrations()?;

        let registered_sources = self.registered_sources.clone();
        let db_path = self.db_path.clone();
        let last_event_time = self.last_event_time.clone();
        let rederivation_counter = self.rederivation_counter.clone();

        let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                for path in event.paths {
                    let handler = TrackedCopyWatcher {
                        db_path: db_path.clone(),
                        registered_sources: registered_sources.clone(),
                        last_event_time: last_event_time.clone(),
                        rederivation_counter: rederivation_counter.clone(),
                        _watcher: None,
                    };
                    handler.handle_path_change(&path);
                }
            }
        }).map_err(|e| format!("Failed to create notify watcher: {}", e))?;

        let sources = self.registered_sources.lock().unwrap_or_else(|e| e.into_inner());
        for path in sources.iter() {
            if path.exists() {
                let _ = watcher.watch(path, RecursiveMode::NonRecursive);
            }
        }

        self._watcher = Some(watcher);
        Ok(())
    }

    pub fn refresh_registrations(&self) -> Result<usize, String> {
        let store = PreferencesStore::new(&self.db_path)
            .map_err(|e| format!("Failed to open store: {}", e))?;

        let links = store.get_hydrated_links()
            .map_err(|e| format!("Failed to fetch links: {}", e))?;

        let mut sources = self.registered_sources.lock().unwrap_or_else(|e| e.into_inner());
        sources.clear();

        for link in links {
            if link.mechanism == Mechanism::TrackedCopy {
                let p = PathBuf::from(&link.source_path);
                sources.insert(p);
            }
        }

        Ok(sources.len())
    }

    pub fn is_path_registered(&self, path: &Path) -> bool {
        let sources = self.registered_sources.lock().unwrap_or_else(|e| e.into_inner());
        sources.contains(path)
    }

    pub fn rederivation_count(&self) -> usize {
        *self.rederivation_counter.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn handle_path_change(&self, path: &Path) -> Option<LinkState> {
        // 1. Filter: Key ONLY on source_path for tracked_copy links
        if !self.is_path_registered(path) {
            return None;
        }

        // 2. Named Constant Debounce Check
        {
            let mut times = self.last_event_time.lock().unwrap_or_else(|e| e.into_inner());
            let now = Instant::now();
            if let Some(prev) = times.get(path) {
                if now.duration_since(*prev) < WATCHER_DEBOUNCE_DURATION {
                    // Debounced: event arrives within WATCHER_DEBOUNCE_DURATION window -> ignore duplicate execution
                    return None;
                }
            }
            times.insert(path.to_path_buf(), now);
        }

        // Increment rederivation counter
        {
            let mut count = self.rederivation_counter.lock().unwrap_or_else(|e| e.into_inner());
            *count += 1;
        }

        // 3. Re-run state derivation for affected links ONLY (never a full rescan)
        let store = PreferencesStore::new(&self.db_path).ok()?;
        let links = store.get_hydrated_links().ok()?;
        let now_sec = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let path_str = path.to_string_lossy().to_string();
        let mut final_state = None;

        for link in links {
            if link.source_path == path_str && link.mechanism == Mechanism::TrackedCopy {
                let dest_path = Path::new(&link.dest_path);
                let dest_exists = dest_path.exists() || dest_path.is_symlink();
                let symlink_target = std::fs::read_link(dest_path).ok();

                let source_hash_now = if path.exists() {
                    std::fs::read(path).ok().map(|c| blake3::hash(&c).to_hex().to_string())
                } else {
                    None
                };

                let dest_hash = if dest_exists && dest_path.is_file() && !dest_path.is_symlink() {
                    std::fs::read(dest_path).ok().map(|c| blake3::hash(&c).to_hex().to_string())
                } else {
                    None
                };

                let state = resolve_state(
                    &link,
                    source_hash_now.as_deref(),
                    dest_exists,
                    symlink_target.as_deref(),
                );

                let _ = store.update_link_state(link.id, dest_hash.as_deref(), now_sec);
                final_state = Some(state);
            }
        }

        final_state
    }
}
