pub mod domain;
pub mod scanner;
mod transactional;
pub mod preferences;
pub mod watcher;
pub mod scan;

use domain::Inventory;
use scanner::{DirectoryScanner, Scanner};
use transactional::write_transactional;
use preferences::PreferencesStore;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager};

pub static CRASH_CONSENT_ENABLED: AtomicBool = AtomicBool::new(false);
pub static USAGE_CONSENT_ENABLED: AtomicBool = AtomicBool::new(false);
static SENTRY_GUARD: Mutex<Option<sentry::ClientInitGuard>> = Mutex::new(None);

fn lock_sentry_guard() -> std::sync::MutexGuard<'static, Option<sentry::ClientInitGuard>> {
    SENTRY_GUARD.lock().unwrap_or_else(|e| e.into_inner())
}

#[derive(Default)]
pub struct ScanManager {
    pub active_scans: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl ScanManager {
    pub fn lock_active_scans(&self) -> std::sync::MutexGuard<'_, HashMap<String, Arc<AtomicBool>>> {
        self.active_scans.lock().unwrap_or_else(|e| e.into_inner())
    }
}

static SCAN_COUNTER: AtomicU64 = AtomicU64::new(1);

fn next_scan_id() -> String {
    let id = SCAN_COUNTER.fetch_add(1, Ordering::SeqCst);
    format!("scan-{}", id)
}

fn sanitise_stacktrace(stacktrace: &mut sentry::protocol::Stacktrace) {
    for frame in stacktrace.frames.iter_mut() {
        if let Some(ref mut abs_path) = frame.abs_path {
            *abs_path = preferences::sanitise_msg(abs_path);
        }
        if let Some(ref mut package) = frame.package {
            *package = preferences::sanitise_msg(package);
        }
    }
}

pub fn before_send_sanitised(mut event: sentry::protocol::Event<'static>) -> Option<sentry::protocol::Event<'static>> {
    if !CRASH_CONSENT_ENABLED.load(Ordering::SeqCst) {
        return None;
    }

    if let Some(ref mut msg) = event.message {
        *msg = preferences::sanitise_msg(msg);
    }

    for exception in event.exception.values.iter_mut() {
        if let Some(ref mut val) = exception.value {
            let clean = preferences::sanitise_msg(val);
            *val = clean;
        }
        if let Some(ref mut stacktrace) = exception.stacktrace {
            sanitise_stacktrace(stacktrace);
        }
        if let Some(ref mut raw_stacktrace) = exception.raw_stacktrace {
            sanitise_stacktrace(raw_stacktrace);
        }
    }

    for thread in event.threads.values.iter_mut() {
        if let Some(ref mut stacktrace) = thread.stacktrace {
            sanitise_stacktrace(stacktrace);
        }
        if let Some(ref mut raw_stacktrace) = thread.raw_stacktrace {
            sanitise_stacktrace(raw_stacktrace);
        }
    }

    for breadcrumb in event.breadcrumbs.values.iter_mut() {
        if let Some(ref mut msg) = breadcrumb.message {
            let clean = preferences::sanitise_msg(msg);
            *msg = clean;
        }
    }

    for value in event.extra.values_mut() {
        if let serde_json::Value::String(ref mut s) = value {
            let clean = preferences::sanitise_msg(s);
            *s = clean;
        }
    }

    for value in event.tags.values_mut() {
        let clean = preferences::sanitise_msg(value);
        *value = clean;
    }

    let debug_meta = event.debug_meta.to_mut();
    for image in debug_meta.images.iter_mut() {
        match image {
            sentry::protocol::DebugImage::Apple(ref mut img) => {
                img.name = preferences::sanitise_msg(&img.name);
            }
            sentry::protocol::DebugImage::Symbolic(ref mut img) => {
                img.name = preferences::sanitise_msg(&img.name);
                if let Some(ref mut debug_file) = img.debug_file {
                    *debug_file = preferences::sanitise_msg(debug_file);
                }
            }
            sentry::protocol::DebugImage::Wasm(ref mut img) => {
                img.name = preferences::sanitise_msg(&img.name);
                img.code_file = preferences::sanitise_msg(&img.code_file);
                if let Some(ref mut debug_file) = img.debug_file {
                    *debug_file = preferences::sanitise_msg(debug_file);
                }
            }
            _ => {}
        }
    }

    Some(event)
}

fn init_sentry_client(enabled: bool) {
    let mut guard_lock = lock_sentry_guard();
    *guard_lock = None;

    if enabled {
        if let Some(dsn) = option_env!("SENTRY_DSN") {
            if !dsn.is_empty() {
                println!("[Telemetry] Sentry compiling: DSN present, length = {}", dsn.len());
                let options = sentry::ClientOptions {
                    dsn: dsn.parse().ok(),
                    debug: true,
                    before_send: Some(Arc::new(Box::new(before_send_sanitised))),
                    ..Default::default()
                };
                let guard = sentry::init(options);
                *guard_lock = Some(guard);
            } else {
                println!("[Telemetry] Sentry compiling: DSN is empty string");
            }
        } else {
            println!("[Telemetry] Sentry compiling: DSN is None");
        }
    } else {
        sentry::Hub::current().bind_client(None);
    }
}

fn get_telemetry_client_id(store: &PreferencesStore) -> Option<String> {
    if let Ok(Some(client_id)) = store.get_preference("telemetry_client_id") {
        if !client_id.is_empty() {
            return Some(client_id);
        }
    }
    if USAGE_CONSENT_ENABLED.load(Ordering::SeqCst) {
        let new_id = uuid::Uuid::new_v4().to_string();
        let _ = store.set_preference("telemetry_client_id", &new_id);
        Some(new_id)
    } else {
        None
    }
}

pub async fn track_event_async(app: AppHandle, name: &str, params: serde_json::Value) {
    if !USAGE_CONSENT_ENABLED.load(Ordering::SeqCst) {
        return;
    }

    let measurement_id = option_env!("GA4_MEASUREMENT_ID").unwrap_or("");
    let api_secret = option_env!("GA4_API_SECRET").unwrap_or("");

    if measurement_id.is_empty() || api_secret.is_empty() {
        return;
    }

    let store = match get_store(&app) {
        Ok(s) => s,
        Err(_) => return,
    };

    let client_id = match get_telemetry_client_id(&store) {
        Some(cid) => cid,
        None => return,
    };

    let is_debug = option_env!("GA4_DEBUG_ENDPOINT").is_some() || cfg!(test);
    let url = if is_debug {
        format!(
            "https://www.google-analytics.com/debug/mp/collect?measurement_id={}&api_secret={}",
            measurement_id, api_secret
        )
    } else {
        format!(
            "https://www.google-analytics.com/mp/collect?measurement_id={}&api_secret={}",
            measurement_id, api_secret
        )
    };

    let body = serde_json::json!({
        "client_id": client_id,
        "events": [{
            "name": name,
            "params": params
        }]
    });

    let client = reqwest::Client::new();
    match client.post(&url).json(&body).send().await {
        Ok(resp) => {
            if is_debug {
                if let Ok(text) = resp.text().await {
                    println!("[Telemetry Debug Validation] Response: {}", text);
                }
            }
        }
        Err(e) => {
            eprintln!("[Telemetry] GA4 dispatch failed: {:?}", e);
        }
    }
}

pub fn track_event(app: AppHandle, name: &str, params: serde_json::Value) {
    let name_str = name.to_string();
    tauri::async_runtime::spawn(async move {
        track_event_async(app, &name_str, params).await;
    });
}

fn get_db_path(app: &AppHandle) -> std::path::PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("hanger.db")
}

fn get_store(app: &AppHandle) -> Result<PreferencesStore, String> {
    let db_path = get_db_path(app);
    PreferencesStore::new(&db_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn link_directory(app: AppHandle, path: String) -> Result<(), String> {
    let store = get_store(&app)?;
    store.link_directory(&path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn unlink_directory(app: AppHandle, path: String) -> Result<(), String> {
    let store = get_store(&app)?;
    store.unlink_directory(&path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_linked_directories(app: AppHandle) -> Result<Vec<String>, String> {
    let store = get_store(&app)?;
    store.get_linked_directories().map_err(|e| e.to_string())
}

#[tauri::command]
fn run_scan(app: AppHandle) -> Result<Inventory, String> {
    let store = get_store(&app)?;
    let dirs = store.get_linked_directories().map_err(|e| e.to_string())?;

    let mut combined_inventory = Inventory::default();
    let db_path = get_db_path(&app);
    let scanner = DirectoryScanner {
        db_path,
        cancellation_token: Arc::new(AtomicBool::new(false)),
    };

    for dir in dirs {
        if let Ok(inv) = scanner.scan(Path::new(&dir)) {
            combined_inventory.skills.extend(inv.skills);
            combined_inventory.agents.extend(inv.agents);
            combined_inventory.tools.extend(inv.tools);
            combined_inventory.rules.extend(inv.rules);
            combined_inventory.subagents.extend(inv.subagents);
            combined_inventory.project_scans.extend(inv.project_scans);
        }
    }

    // Backend Scan Deduplication to prevent double-scanned duplicate keys
    let mut skill_paths = std::collections::HashSet::new();
    combined_inventory.skills.retain(|s| skill_paths.insert(s.path.clone()));

    let mut agent_ids = std::collections::HashSet::new();
    combined_inventory.agents.retain(|a| agent_ids.insert(a.id.clone()));

    let mut tool_configs = std::collections::HashSet::new();
    combined_inventory.tools.retain(|t| tool_configs.insert(t.config_path.clone()));

    let mut rule_paths = std::collections::HashSet::new();
    combined_inventory.rules.retain(|r| rule_paths.insert(r.path.clone()));

    let mut subagent_paths = std::collections::HashSet::new();
    combined_inventory.subagents.retain(|sa| subagent_paths.insert(sa.path.clone()));

    let mut scan_paths = std::collections::HashSet::new();
    combined_inventory.project_scans.retain(|p| scan_paths.insert(p.path.clone()));

    Ok(combined_inventory)
}

#[derive(serde::Serialize)]
pub struct PreflightResult {
    pub target_exists: bool,
    pub collision: bool,
    pub has_permissions: bool,
    pub warning: Option<String>,
}

fn resolve_target_path(
    source_path: &str,
    target_project_path: &str,
    linked_dirs: &[String],
) -> PathBuf {
    let src = Path::new(source_path);
    let tgt_project = Path::new(target_project_path);

    for dir in linked_dirs {
        if let Ok(rel) = src.strip_prefix(dir) {
            return tgt_project.join(rel);
        }
    }

    let filename = src.file_name().and_then(|n| n.to_str()).unwrap_or("");
    let src_str = src.to_string_lossy();

    if src_str.contains(".claude") {
        tgt_project.join(".claude").join(filename)
    } else if src_str.contains(".codex") {
        tgt_project.join(".codex").join(filename)
    } else if src_str.contains(".gemini") || src_str.contains(".agents") {
        tgt_project.join(".agents").join(filename)
    } else {
        tgt_project.join(filename)
    }
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dst.join(entry.file_name()))?;
        } else {
            fs::copy(entry.path(), dst.join(entry.file_name()))?;
        }
    }
    Ok(())
}

fn write_transactional_dir(src: &Path, dst: &Path) -> Result<(), String> {
    let temp_dir_name = format!("{}.tmp", dst.to_string_lossy());
    let temp_dir = Path::new(&temp_dir_name);
    if temp_dir.exists() {
        fs::remove_dir_all(temp_dir).map_err(|e| e.to_string())?;
    }
    copy_dir_all(src, temp_dir).map_err(|e| e.to_string())?;

    if dst.exists() {
        if dst.is_dir() {
            fs::remove_dir_all(dst).map_err(|e| e.to_string())?;
        } else {
            fs::remove_file(dst).map_err(|e| e.to_string())?;
        }
    }
    fs::rename(temp_dir, dst).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn check_deploy_target(
    app: AppHandle,
    source_path: String,
    target_project_path: String,
) -> Result<PreflightResult, String> {
    let store = get_store(&app)?;
    let linked_dirs = store.get_linked_directories().map_err(|e| e.to_string())?;
    let target_path = resolve_target_path(&source_path, &target_project_path, &linked_dirs);

    let target_exists = target_path.exists();
    let collision = target_exists;

    let parent = target_path.parent().unwrap_or(Path::new(&target_project_path));
    let has_permissions = match fs::metadata(parent) {
        Ok(meta) => !meta.permissions().readonly(),
        Err(_) => false,
    };

    let filename = Path::new(&source_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    let is_rule = scanner::RULE_FILENAMES.contains(&filename);

    let warning = if is_rule && collision {
        Some("handled in Rules deploy".to_string())
    } else {
        None
    };

    Ok(PreflightResult {
        target_exists,
        collision,
        has_permissions,
        warning,
    })
}

#[tauri::command]
fn execute_deploy(
    app: AppHandle,
    source_path: String,
    target_project_path: String,
    deploy_type: String, // "symlink" | "copy"
) -> Result<(), String> {
    let store = get_store(&app)?;
    let linked_dirs = store.get_linked_directories().map_err(|e| e.to_string())?;
    let target_path = resolve_target_path(&source_path, &target_project_path, &linked_dirs);

    let src = Path::new(&source_path);
    let dst = &target_path;

    if !src.exists() {
        return Err("Source path does not exist".to_string());
    }

    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    if deploy_type == "symlink" {
        write_transactional(dst, &[], |_temp_path| {
            let _ = fs::remove_file(_temp_path);
            #[cfg(unix)]
            {
                std::os::unix::fs::symlink(src, _temp_path)
                    .map_err(|e| format!("Failed to create symlink: {}", e))?;
            }
            #[cfg(windows)]
            {
                if src.is_dir() {
                    std::os::windows::fs::symlink_dir(src, _temp_path)
                        .map_err(|e| format!("Failed to create symlink directory: {}", e))?;
                } else {
                    std::os::windows::fs::symlink_file(src, _temp_path)
                        .map_err(|e| format!("Failed to create symlink file: {}", e))?;
                }
            }
            Ok(())
        })
        .map_err(|e| e.to_string())?;
    } else if deploy_type == "copy" {
        let hash_target = if src.is_dir() {
            src.join("SKILL.md")
        } else {
            src.to_path_buf()
        };

        let content = fs::read(&hash_target)
            .map_err(|e| format!("Failed to read source: {}", e))?;
        let hash = blake3::hash(&content).to_hex().to_string();

        if src.is_dir() {
            write_transactional_dir(src, dst)?;
        } else {
            write_transactional(dst, &content, |_temp_path| {
                if !_temp_path.exists() {
                    return Err("Temporary file does not exist".to_string());
                }
                Ok(())
            })
            .map_err(|e| e.to_string())?;
        }

        // Store blake3 hash inpreferences Tier 5 store
        store
            .set_deploy_checksum(&source_path, &dst.to_string_lossy(), &hash)
            .map_err(|e| e.to_string())?;
    } else {
        return Err(format!("Unknown deploy type: {}", deploy_type));
    }

    let category = if source_path.contains("skills") {
        "skills"
    } else if source_path.contains("rules") || source_path.ends_with(".cursorrules") || source_path.ends_with("AGENTS.md") {
        "rules"
    } else if source_path.contains("agents") {
        "agents"
    } else if source_path.contains("tools") {
        "tools"
    } else {
        "unknown"
    };

    let is_project_scoped = linked_dirs.iter().any(|d| source_path.starts_with(d));
    let source_scope = if is_project_scoped { "Project" } else { "Global" };

    track_event(app, "asset_deployed", serde_json::json!({
        "category": category,
        "mode": deploy_type,
        "source_scope": source_scope
    }));

    Ok(())
}

#[tauri::command]
fn deploy_asset(
    app: AppHandle,
    source_path: String,
    target_path: String,
    deploy_type: String,
) -> Result<(), String> {
    // Keep backward compatible shim
    execute_deploy(app, source_path, target_path, deploy_type)
}

#[tauri::command]
fn remove_deployed_asset(app: AppHandle, target_path: String) -> Result<(), String> {
    let store = get_store(&app)?;
    let linked_dirs = store.get_linked_directories().map_err(|e| e.to_string())?;
    let backups_dir = Path::new(".hanger/backups");
    remove_deployed_asset_internal(&store, &linked_dirs, &target_path, backups_dir)
}

pub fn remove_deployed_asset_internal(
    store: &crate::preferences::PreferencesStore,
    linked_dirs: &[String],
    target_path: &str,
    backups_dir: &Path,
) -> Result<(), String> {
    let path = Path::new(target_path);
    if !path.exists() {
        return Err("Target path does not exist".to_string());
    }

    // Unlink safety check: Target must be inside one of the linked repository paths
    let is_inside_linked_repo = linked_dirs.iter().any(|repo_root| {
        let repo_path = Path::new(repo_root);
        path.starts_with(repo_path)
    });
    if !is_inside_linked_repo {
        return Err("Permission denied: Target path is outside linked repositories.".to_string());
    }

    // Determine target metadata
    let p_metadata = fs::symlink_metadata(path).map_err(|e| format!("Failed to read metadata: {}", e))?;
    let is_symlink = p_metadata.file_type().is_symlink();

    // Check deploy_checksums for copy provenance
    let checksums = store.get_all_deploy_checksums().map_err(|e| e.to_string())?;
    // We check if destination_path matches canonicalized path
    let abs_path = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let abs_path_str = abs_path.to_string_lossy().to_string();

    let matched_record = checksums.iter().find(|(_, dest, _)| dest == &abs_path_str);

    // No provenance = error, never deletion.
    if !is_symlink && matched_record.is_none() {
        return Err("Cannot unlink: File has no deploy provenance record and is not a symlink.".to_string());
    }

    // Deletion:
    if is_symlink {
        // Symlinks can be deleted immediately without backup
        fs::remove_file(path).map_err(|e| format!("Failed to remove symlink: {}", e))?;
    } else {
        // Hard copy! Perform backup before deletion.
        fs::create_dir_all(backups_dir).map_err(|e| format!("Failed to create backups directory: {}", e))?;

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let filename = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file");
        let backup_file = backups_dir.join(format!("{}_{}.bak", timestamp, filename));

        if path.is_dir() {
            copy_dir_all(path, &backup_file).map_err(|e| format!("Failed to backup folder: {}", e))?;
            fs::remove_dir_all(path).map_err(|e| format!("Failed to remove folder: {}", e))?;
        } else {
            fs::copy(path, &backup_file).map_err(|e| format!("Failed to backup file: {}", e))?;
            fs::remove_file(path).map_err(|e| format!("Failed to remove file: {}", e))?;
        }
    }

    // Clear database deploy_checksums entry if it exists
    if matched_record.is_some() {
        store.remove_deploy_checksum(&abs_path_str).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[derive(Clone, serde::Serialize)]
struct ProgressPayload {
    scan_id: String,
    dirs_visited: usize,
    files_visited: usize,
    current_path: String,
}

#[derive(Clone, serde::Serialize)]
struct CompletePayload {
    scan_id: String,
    inventory: Inventory,
}

#[derive(Clone, serde::Serialize)]
struct ErrorPayload {
    scan_id: String,
    error: String,
}

#[tauri::command]
fn start_scan(
    app: AppHandle,
    state: tauri::State<'_, ScanManager>,
) -> Result<String, String> {
    let scan_id = next_scan_id();
    let cancel_token = Arc::new(AtomicBool::new(false));

    {
        let mut scans = state.lock_active_scans();
        scans.insert(scan_id.clone(), cancel_token.clone());
    }

    let scan_id_clone = scan_id.clone();
    let cancel_token_clone = cancel_token.clone();
    let app_clone = app.clone();

    tauri::async_runtime::spawn(async move {
        let store = match get_store(&app_clone) {
            Ok(s) => s,
            Err(e) => {
                app_clone.emit("scan://error", ErrorPayload {
                    scan_id: scan_id_clone,
                    error: e,
                }).ok();
                return;
            }
        };

        let dirs = match store.get_linked_directories() {
            Ok(d) => d,
            Err(e) => {
                app_clone.emit("scan://error", ErrorPayload {
                    scan_id: scan_id_clone,
                    error: e.to_string(),
                }).ok();
                return;
            }
        };

        let db_path = get_db_path(&app_clone);
        let scanner = DirectoryScanner {
            db_path,
            cancellation_token: cancel_token_clone,
        };

        let mut combined_inventory = Inventory::default();

        let mut scan_targets = vec![PathBuf::from("")];
        for dir in dirs {
            let p = PathBuf::from(&dir);
            if !scan_targets.contains(&p) {
                scan_targets.push(p);
            }
        }

        for target in scan_targets {
            let app_emitter = app_clone.clone();
            let scan_id_progress = scan_id_clone.clone();

            let res = scanner.scan_with_progress(&target, |dirs_v, files_v, current| {
                if (dirs_v + files_v) % 100 == 0 {
                    app_emitter.emit("scan://progress", ProgressPayload {
                        scan_id: scan_id_progress.clone(),
                        dirs_visited: dirs_v,
                        files_visited: files_v,
                        current_path: current.to_string(),
                    }).ok();
                }
            });

            match res {
                Ok(inv) => {
                    combined_inventory.skills.extend(inv.skills);
                    combined_inventory.tools.extend(inv.tools);
                    combined_inventory.rules.extend(inv.rules);
                    combined_inventory.subagents.extend(inv.subagents);
                    combined_inventory.project_scans.extend(inv.project_scans);
                }
                Err(e) => {
                    app_clone.emit("scan://error", ErrorPayload {
                        scan_id: scan_id_clone,
                        error: e.to_string(),
                    }).ok();
                    return;
                }
            }
        }

        // Deduplicate lists before emitting
        let mut skill_paths = std::collections::HashSet::new();
        combined_inventory.skills.retain(|s| skill_paths.insert(s.path.clone()));

        let mut tool_configs = std::collections::HashSet::new();
        combined_inventory.tools.retain(|t| tool_configs.insert(t.config_path.clone()));

        let mut rule_paths = std::collections::HashSet::new();
        combined_inventory.rules.retain(|r| rule_paths.insert(r.path.clone()));

        let mut subagent_paths = std::collections::HashSet::new();
        combined_inventory.subagents.retain(|sa| subagent_paths.insert(sa.path.clone()));

        let mut scan_paths = std::collections::HashSet::new();
        combined_inventory.project_scans.retain(|p| scan_paths.insert(p.path.clone()));

        {
            if let Some(state_scans) = app_clone.try_state::<ScanManager>() {
                let mut scans = state_scans.lock_active_scans();
                scans.remove(&scan_id_clone);
            }
        }

        track_event(
            app_clone.clone(),
            "scan_completed",
            serde_json::json!({
                "skills_count": combined_inventory.skills.len(),
                "agents_count": combined_inventory.agents.len(),
                "tools_count": combined_inventory.tools.len(),
                "rules_count": combined_inventory.rules.len(),
            }),
        );

        app_clone.emit("scan://complete", CompletePayload {
            scan_id: scan_id_clone,
            inventory: combined_inventory,
        }).ok();
    });

    Ok(scan_id)
}

#[tauri::command]
fn cancel_scan(
    state: tauri::State<'_, ScanManager>,
    scan_id: String,
) -> Result<(), String> {
    let scans = state.lock_active_scans();
    if let Some(token) = scans.get(&scan_id) {
        token.store(true, Ordering::SeqCst);
    }
    Ok(())
}

#[derive(Clone, serde::Serialize)]
struct RepoProgressPayload {
    scan_id: String,
    dirs_visited: usize,
    files_visited: usize,
    current_path: String,
}

#[derive(Clone, serde::Serialize)]
struct RepoCompletePayload {
    scan_id: String,
    candidates: Vec<String>,
    warnings: Vec<String>,
}

#[tauri::command]
fn start_repo_scan(
    app: AppHandle,
    path: String,
    state: tauri::State<'_, ScanManager>,
) -> Result<String, String> {
    let scan_id = next_scan_id();
    let cancel_token = Arc::new(AtomicBool::new(false));

    {
        let mut scans = state.lock_active_scans();
        scans.insert(scan_id.clone(), cancel_token.clone());
    }

    let scan_id_clone = scan_id.clone();
    let cancel_token_clone = cancel_token.clone();
    let app_clone = app.clone();

    tauri::async_runtime::spawn(async move {
        let root = std::path::Path::new(&path);
        if !root.exists() {
            app_clone.emit("reposcan://error", ErrorPayload {
                scan_id: scan_id_clone,
                error: "Root path does not exist".to_string(),
            }).ok();
            return;
        }

        let is_broad = scanner::is_broad_root(root);
        let mut warnings = Vec::new();
        if is_broad {
            warnings.push("Scan depth capped at 6 levels for broad root directory. Deeper folders skipped.".to_string());
        }

        let walker = ignore::WalkBuilder::new(root)
            .hidden(false)
            .git_ignore(true)
            .build();

        let mut candidates = Vec::new();
        let mut dirs_visited = 0;
        let mut files_visited = 0;

        let mut candidate_set = std::collections::HashSet::new();

        for entry in walker {
            if cancel_token_clone.load(Ordering::SeqCst) {
                return;
            }

            let entry = match entry {
                Ok(e) => e,
                Err(e) => {
                    let err_str = e.to_string();
                    if err_str.contains("Permission denied") || err_str.contains("permission denied") {
                        warnings.push(format!("Permission denied: {}", root.to_string_lossy()));
                    }
                    continue;
                }
            };

            let entry_path = entry.path();
            if scanner::is_excluded(entry_path) {
                continue;
            }

            if is_broad {
                if let Ok(rel) = entry_path.strip_prefix(root) {
                    if rel.components().count() > 6 {
                        continue;
                    }
                }
            }

            let is_dir = entry_path.is_dir();
            if is_dir {
                dirs_visited += 1;
            } else {
                files_visited += 1;
            }

            if (dirs_visited + files_visited) % 100 == 0 {
                app_clone.emit("reposcan://progress", RepoProgressPayload {
                    scan_id: scan_id_clone.clone(),
                    dirs_visited,
                    files_visited,
                    current_path: entry_path.to_string_lossy().to_string(),
                }).ok();
            }

            if is_dir {
                // Check if this directory qualifies as a repository
                let mut qualifies = false;
                if entry_path.join(".git").exists()
                    || entry_path.join(".claude").exists()
                    || entry_path.join(".agents").exists()
                    || entry_path.join(".codex").exists()
                    || entry_path.join(".gemini").exists()
                {
                    qualifies = true;
                } else {
                    for r_file in scanner::RULE_FILENAMES {
                        if entry_path.join(r_file).exists() {
                            qualifies = true;
                            break;
                        }
                    }
                }

                if qualifies {
                    if let Ok(abs) = std::fs::canonicalize(entry_path) {
                        let abs_str = abs.to_string_lossy().to_string();
                        if !candidate_set.contains(&abs_str) {
                            candidate_set.insert(abs_str.clone());
                            candidates.push(abs_str);
                        }
                    } else {
                        let path_str = entry_path.to_string_lossy().to_string();
                        if !candidate_set.contains(&path_str) {
                            candidate_set.insert(path_str.clone());
                            candidates.push(path_str);
                        }
                    }
                }
            }
        }

        {
            if let Some(state_scans) = app_clone.try_state::<ScanManager>() {
                let mut scans = state_scans.lock_active_scans();
                scans.remove(&scan_id_clone);
            }
        }

        app_clone.emit("reposcan://complete", RepoCompletePayload {
            scan_id: scan_id_clone,
            candidates,
            warnings,
        }).ok();
    });

    Ok(scan_id)
}


#[tauri::command]
fn get_detected_engines() -> Vec<domain::Agent> {
    scanner::get_global_agents()
}

#[tauri::command]
fn check_broad_root(path: String) -> Result<bool, String> {
    let p = Path::new(&path);
    Ok(scanner::is_broad_root(p))
}

#[tauri::command]
fn get_rule_sections(source_path: String, target_path: String) -> Result<domain::ParsedRuleMergeData, String> {
    let src_content = fs::read_to_string(&source_path).map_err(|e| format!("Failed to read source rule: {}", e))?;
    let tgt_content = fs::read_to_string(&target_path).map_err(|e| format!("Failed to read target rule: {}", e))?;

    Ok(domain::ParsedRuleMergeData {
        source_sections: scanner::split_rule_sections(&src_content),
        target_sections: scanner::split_rule_sections(&tgt_content),
    })
}

#[tauri::command]
fn execute_deploy_merged_rule(
    app: AppHandle,
    target_path: String,
    merged_content: String,
) -> Result<(), String> {
    let dst = Path::new(&target_path);
    write_transactional(dst, merged_content.as_bytes(), |_temp_path| {
        if !_temp_path.exists() {
            return Err("Temporary merged file does not exist".to_string());
        }
        Ok(())
    })
    .map_err(|e| e.to_string())?;

    track_event(app, "rules_merge_completed", serde_json::json!({
        "merged_size": merged_content.len()
    }));

    Ok(())
}

#[tauri::command]
fn get_rules_target_memory(
    app: AppHandle,
    project_path: String,
    rule_path: String,
) -> Result<Option<String>, String> {
    let store = get_store(&app)?;
    store.get_rules_target_memory(&project_path, &rule_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_rules_target_memory(
    app: AppHandle,
    project_path: String,
    rule_path: String,
    target_file: String,
) -> Result<(), String> {
    let store = get_store(&app)?;
    store.set_rules_target_memory(&project_path, &rule_path, &target_file).map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_rules_target_memory(
    app: AppHandle,
    project_path: String,
    rule_path: String,
) -> Result<(), String> {
    let store = get_store(&app)?;
    store.clear_rules_target_memory(&project_path, &rule_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_preference(app: AppHandle, key: String) -> Result<Option<String>, String> {
    let store = get_store(&app)?;
    store.get_preference(&key).map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_preference(app: AppHandle, key: String, value: String) -> Result<(), String> {
    let store = get_store(&app)?;

    let previous_value = store.get_preference(&key).ok().flatten();
    let has_changed = previous_value.as_deref() != Some(value.as_str());

    store.set_preference(&key, &value).map_err(|e| e.to_string())?;

    if has_changed {
        if key == "onboarding_complete" && value == "true" {
            track_event(app.clone(), "onboarding_completed", serde_json::json!({}));
        }

        if key == "consent_crash" {
            let enabled = value == "true";
            CRASH_CONSENT_ENABLED.store(enabled, Ordering::SeqCst);
            init_sentry_client(enabled);

            track_event(app.clone(), "consent_changed", serde_json::json!({
                "crash_consent": enabled,
                "usage_consent": USAGE_CONSENT_ENABLED.load(Ordering::SeqCst),
                "state": if enabled { "crash_on" } else { "crash_off" }
            }));
        }

        if key == "consent_usage" {
            let enabled = value == "true";
            if enabled {
                USAGE_CONSENT_ENABLED.store(true, Ordering::SeqCst);
                // Ensure client_id is generated
                let _cid = get_telemetry_client_id(&store).unwrap_or_default();
                track_event(app.clone(), "consent_changed", serde_json::json!({
                    "crash_consent": CRASH_CONSENT_ENABLED.load(Ordering::SeqCst),
                    "usage_consent": true,
                    "state": "on"
                }));
            } else {
                // Revoking usage consent sends consent_changed(off) as the FINAL event
                let app_clone = app.clone();
                let params = serde_json::json!({
                    "crash_consent": CRASH_CONSENT_ENABLED.load(Ordering::SeqCst),
                    "usage_consent": false,
                    "state": "off"
                });

                let timeout_duration = std::time::Duration::from_millis(1000);
                let _ = tokio::time::timeout(timeout_duration, async move {
                    track_event_async(app_clone, "consent_changed", params).await;
                }).await;

                USAGE_CONSENT_ENABLED.store(false, Ordering::SeqCst);
                let _ = store.set_preference("telemetry_client_id", "");
            }
        }
    }

    Ok(())
}

#[tauri::command]
fn get_inventory(app: AppHandle) -> Result<Inventory, String> {
    run_scan(app)
}

#[tauri::command]
fn get_asset_counts(app: AppHandle, root: Option<String>) -> Result<crate::domain::AssetCounts, String> {
    let db_path = get_db_path(&app);
    scanner::count_assets(&db_path, root.as_deref())
}

#[tauri::command]
fn get_tree_counts(app: AppHandle) -> Result<crate::domain::TreeCounts, String> {
    let db_path = get_db_path(&app);
    scanner::count_tree_assets(&db_path)
}

#[tauri::command]
fn export_preferences(app: AppHandle, target_path: String) -> Result<(), String> {
    let store = get_store(&app)?;
    store
        .export_store(Path::new(&target_path))
        .map_err(|e| e.to_string())?;
    track_event(app, "settings_export", serde_json::json!({}));
    Ok(())
}

#[tauri::command]
fn import_preferences(app: AppHandle, source_path: String) -> Result<(), String> {
    let store = get_store(&app)?;
    store
        .import_store(Path::new(&source_path))
        .map_err(|e| e.to_string())?;
    track_event(app, "settings_import", serde_json::json!({}));
    Ok(())
}

#[tauri::command]
fn get_scan_status() -> scan::status::ScanStatus {
    scan::status::get_status()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    // Dev-only automation bridge for tauri-mcp; never registered in release builds.
    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(tauri_plugin_mcp_bridge::init());
    }
    builder
        .manage(ScanManager::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_log::Builder::new().targets([
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir { file_name: None }),
        ]).build())
        .setup(|app| {
            let handle = app.handle();
            scan::status::set_app_handle(handle.clone());
            if let Ok(store) = get_store(handle) {
                let crash = store.get_preference("consent_crash").ok().flatten().unwrap_or_default() == "true";
                let usage = store.get_preference("consent_usage").ok().flatten().unwrap_or_default() == "true";

                CRASH_CONSENT_ENABLED.store(crash, Ordering::SeqCst);
                USAGE_CONSENT_ENABLED.store(usage, Ordering::SeqCst);

                init_sentry_client(crash);
            }

            let next = std::panic::take_hook();
            std::panic::set_hook(Box::new(move |info| {
                next(info);
                if let Some(client) = sentry::Hub::current().client() {
                    client.flush(Some(std::time::Duration::from_secs(2)));
                }
            }));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            link_directory,
            unlink_directory,
            get_linked_directories,
            run_scan,
            get_inventory,
            get_asset_counts,
            get_tree_counts,
            deploy_asset,
            check_deploy_target,
            execute_deploy,
            start_scan,
            cancel_scan,
            start_repo_scan,
            check_broad_root,
            get_rule_sections,
            execute_deploy_merged_rule,
            get_rules_target_memory,
            set_rules_target_memory,
            clear_rules_target_memory,
            get_preference,
            set_preference,
            export_preferences,
            import_preferences,
            remove_deployed_asset,
            get_scan_status,
            get_detected_engines
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
