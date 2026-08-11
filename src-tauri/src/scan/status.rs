use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScanPhase {
    Idle,
    Scanning,
    Resolving,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanStatus {
    pub phase: ScanPhase,
    pub active_root_label: Option<String>,
    pub queued: usize,
}

type StatusCallback = Arc<dyn Fn(&ScanStatus) + Send + Sync>;

struct RegistryState {
    app_handle: Option<AppHandle>,
    active_scans: Vec<(PathBuf, ScanPhase)>,
    queued_count: usize,
    subscribers: Vec<StatusCallback>,
}

static ROOT_LOCKS: OnceLock<Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>> = OnceLock::new();
static REGISTRY: OnceLock<Mutex<RegistryState>> = OnceLock::new();

fn get_registry() -> &'static Mutex<RegistryState> {
    REGISTRY.get_or_init(|| {
        Mutex::new(RegistryState {
            app_handle: None,
            active_scans: Vec::new(),
            queued_count: 0,
            subscribers: Vec::new(),
        })
    })
}

fn get_root_mutex(root: &Path) -> Arc<Mutex<()>> {
    let canonical = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let map = ROOT_LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut guard = map.lock().unwrap_or_else(|e| e.into_inner());
    guard
        .entry(canonical)
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone()
}

pub fn set_app_handle(app: AppHandle) {
    let mut reg = get_registry().lock().unwrap_or_else(|e| e.into_inner());
    reg.app_handle = Some(app);
}

pub fn subscribe_status<F>(callback: F) -> Arc<dyn Fn(&ScanStatus) + Send + Sync>
where
    F: Fn(&ScanStatus) + Send + Sync + 'static,
{
    let cb: StatusCallback = Arc::new(callback);
    let mut reg = get_registry().lock().unwrap_or_else(|e| e.into_inner());
    reg.subscribers.push(cb.clone());
    cb
}

pub fn format_root_label(path: &Path) -> String {
    path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_else(|| path.to_str().unwrap_or(""))
        .to_string()
}

fn compute_status_from_state(state: &RegistryState) -> ScanStatus {
    let queued = state.queued_count;
    if state.active_scans.is_empty() && queued == 0 {
        ScanStatus {
            phase: ScanPhase::Idle,
            active_root_label: None,
            queued: 0,
        }
    } else {
        let active_root_label = state
            .active_scans
            .last()
            .map(|(path, _)| format_root_label(path));

        let has_scanning = state
            .active_scans
            .iter()
            .any(|(_, phase)| *phase == ScanPhase::Scanning);

        let has_resolving = state
            .active_scans
            .iter()
            .any(|(_, phase)| *phase == ScanPhase::Resolving);

        let phase = if has_scanning {
            ScanPhase::Scanning
        } else if has_resolving {
            ScanPhase::Resolving
        } else {
            ScanPhase::Scanning
        };

        ScanStatus {
            phase,
            active_root_label,
            queued,
        }
    }
}

pub fn get_status() -> ScanStatus {
    let reg = get_registry().lock().unwrap_or_else(|e| e.into_inner());
    compute_status_from_state(&reg)
}

fn notify_mutation(state: &RegistryState) {
    let status = compute_status_from_state(state);
    if let Some(ref app) = state.app_handle {
        let _ = app.emit("scan-status", &status);
    }
    for sub in &state.subscribers {
        sub(&status);
    }
}

fn on_queue() {
    let mut reg = get_registry().lock().unwrap_or_else(|e| e.into_inner());
    reg.queued_count += 1;
    notify_mutation(&reg);
}

fn on_acquire(root: &Path, phase: ScanPhase, was_queued: bool) {
    let mut reg = get_registry().lock().unwrap_or_else(|e| e.into_inner());
    if was_queued && reg.queued_count > 0 {
        reg.queued_count -= 1;
    }
    reg.active_scans.push((root.to_path_buf(), phase));
    notify_mutation(&reg);
}

fn on_release(root: &Path) {
    let mut reg = get_registry().lock().unwrap_or_else(|e| e.into_inner());
    if let Some(pos) = reg.active_scans.iter().rposition(|(p, _)| p == root) {
        reg.active_scans.remove(pos);
    }
    notify_mutation(&reg);
}

pub struct ScanLockGuard {
    root: PathBuf,
    _guard: Option<std::sync::MutexGuard<'static, ()>>,
}

impl Drop for ScanLockGuard {
    fn drop(&mut self) {
        self._guard.take();
        on_release(&self.root);
    }
}

pub fn acquire_scan_lock(root: &Path, phase: ScanPhase) -> ScanLockGuard {
    let canonical = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let mutex = get_root_mutex(&canonical);

    let (guard, was_queued) = match mutex.try_lock() {
        Ok(g) => (g, false),
        Err(_) => {
            on_queue();
            let g = mutex.lock().unwrap_or_else(|e| e.into_inner());
            (g, true)
        }
    };

    let static_guard: std::sync::MutexGuard<'static, ()> = unsafe { std::mem::transmute(guard) };

    on_acquire(&canonical, phase, was_queued);

    ScanLockGuard {
        root: canonical,
        _guard: Some(static_guard),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;
    use std::sync::{Arc, Mutex};
    use std::thread;
    use std::time::Duration;

    static TEST_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn test_scan_status_queue_depth() {
        let _test_guard = TEST_LOCK.lock().unwrap();
        let test_dir = tempfile::tempdir().unwrap();
        let root = test_dir.path().join("test_root_queue");
        fs::create_dir_all(&root).unwrap();

        let captured_sequence = Arc::new(Mutex::new(Vec::new()));
        let seq_clone = captured_sequence.clone();

        let _sub = subscribe_status(move |status| {
            seq_clone.lock().unwrap().push(status.clone());
        });

        captured_sequence.lock().unwrap().clear();

        let root_clone1 = root.clone();
        let root_clone2 = root.clone();

        let guard1 = acquire_scan_lock(&root_clone1, ScanPhase::Scanning);

        let handle2 = thread::spawn(move || {
            let _guard2 = acquire_scan_lock(&root_clone2, ScanPhase::Scanning);
            thread::sleep(Duration::from_millis(50));
        });

        // Wait for thread 2 to queue
        thread::sleep(Duration::from_millis(100));

        drop(guard1);
        handle2.join().unwrap();

        let sequence = captured_sequence.lock().unwrap().clone();

        let evidence_dir = std::env::temp_dir().join("hanger_test_evidence/cockpit-3h");
        fs::create_dir_all(&evidence_dir).unwrap();
        let evidence_file = evidence_dir.join("status-sequence.txt");

        let json_seq = serde_json::to_string_pretty(&sequence).unwrap();
        fs::write(&evidence_file, &json_seq).unwrap();

        let has_queued_1 = sequence.iter().any(|s| s.queued == 1);
        let has_queued_0 = sequence.iter().any(|s| s.queued == 0);

        assert!(has_queued_1, "Sequence must contain queued == 1");
        assert!(has_queued_0, "Sequence must contain queued == 0");
    }

    #[test]
    fn test_scan_status_idle_requires_drain() {
        let _test_guard = TEST_LOCK.lock().unwrap();
        let test_dir = tempfile::tempdir().unwrap();
        let root = test_dir.path().join("test_root_drain");
        fs::create_dir_all(&root).unwrap();

        let captured_statuses = Arc::new(Mutex::new(Vec::new()));
        let seq_clone = captured_statuses.clone();

        let _sub = subscribe_status(move |status| {
            seq_clone.lock().unwrap().push(status.clone());
        });

        let root1 = root.clone();
        let root2 = root.clone();

        let guard1 = acquire_scan_lock(&root1, ScanPhase::Scanning);

        let handle2 = thread::spawn(move || {
            let _guard2 = acquire_scan_lock(&root2, ScanPhase::Scanning);
        });

        thread::sleep(Duration::from_millis(100));

        let statuses = captured_statuses.lock().unwrap().clone();
        for s in &statuses {
            if s.queued > 0 {
                assert_ne!(
                    s.phase,
                    ScanPhase::Idle,
                    "Phase must never be idle while any waiter exists"
                );
            }
        }

        drop(guard1);
        handle2.join().unwrap();
    }

    #[test]
    fn test_scan_status_resolving_phase() {
        let _test_guard = TEST_LOCK.lock().unwrap();
        let test_dir = tempfile::tempdir().unwrap();
        let root = test_dir.path().join("test_root_resolving");
        fs::create_dir_all(&root).unwrap();

        let guard = acquire_scan_lock(&root, ScanPhase::Resolving);
        let status = get_status();
        assert_eq!(
            status.phase,
            ScanPhase::Resolving,
            "Phase must be 'resolving' during pass-2 link resolution"
        );
        drop(guard);
    }

    #[test]
    fn test_scan_status_label_composed_in_rust() {
        let root_path = Path::new("~/Work/Labs/hanger-ai");
        let label = format_root_label(root_path);
        assert_eq!(
            label, "hanger-ai",
            "activeRootLabel must be display label 'hanger-ai', not raw path"
        );
    }
}
