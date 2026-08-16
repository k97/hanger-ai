pub mod agents;
pub mod annotations;
pub mod dev_icon;
pub mod diagnostics;
pub mod domain;
pub mod linkmap;
pub mod mcp;
pub mod menu;
pub mod scanner;
pub mod updates;
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

/// An engine key the webview could not map to a brand mark, shaped for the
/// `engine_icon_unmapped` event. Keys are product identifiers the backend
/// itself minted (`cursor`, `kiro`), never paths or user text; anything
/// outside that shape is dropped here, before it can reach `track_event`.
pub fn sanitise_engine_key(raw: &str) -> Option<String> {
    let key = raw.trim().to_ascii_lowercase();
    if key.is_empty() || key.chars().count() > 48 {
        return None;
    }
    if !key
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-'))
    {
        return None;
    }
    Some(key)
}

/// `{ engine_key, engine_name? }` — the name is a backend display_name or the
/// raw identifier the UI held, trimmed and capped at 64 chars; a path is never
/// a name and is dropped.
pub fn unmapped_engine_payload(engine_key: &str, engine_name: Option<&str>) -> serde_json::Value {
    let name: Option<String> = engine_name
        .map(str::trim)
        .filter(|n| !n.is_empty() && !n.contains('/') && !n.contains('\\'))
        .map(|n| n.chars().take(64).collect());
    match name {
        Some(n) => serde_json::json!({ "engine_key": engine_key, "engine_name": n }),
        None => serde_json::json!({ "engine_key": engine_key }),
    }
}

/// The webview drew the generic mark for an engine it could not map. Consent,
/// client id and the debug endpoint are all `track_event`'s concern.
#[tauri::command]
fn report_unmapped_engine(app: AppHandle, engine_key: String, engine_name: Option<String>) {
    let Some(key) = sanitise_engine_key(&engine_key) else {
        return;
    };
    track_event(
        app,
        "engine_icon_unmapped",
        unmapped_engine_payload(&key, engine_name.as_deref()),
    );
}

pub(crate) fn get_db_path(app: &AppHandle) -> std::path::PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("hanger.db")
}

pub(crate) fn get_store(app: &AppHandle) -> Result<PreferencesStore, String> {
    let db_path = get_db_path(app);
    PreferencesStore::new(&db_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn link_directory(app: AppHandle, path: String) -> Result<String, String> {
    scanner::guard_engine_root(&path)?;
    let store = get_store(&app)?;
    store.link_directory(&path).map_err(|e| e.to_string())?;
    // The stored path is canonical, which may differ from what the directory
    // picker handed over. Return it so the caller can select the row that
    // actually exists rather than the path the user clicked.
    Ok(crate::preferences::PreferencesStore::canonical_root_path(&path))
}

/// Start a private copy of an MCP server, ask what it provides, and stop it.
///
/// A config file declares how to *start* a server, never what it provides, and
/// nothing on disk records a tool list. This handshake is the only way to learn
/// one. It touches no other host's session — Hanger spawns its own child and
/// kills it before returning.
///
/// Always `Ok`; a failed probe is reported inside `ProbeResult.error` so the
/// panel can explain itself rather than showing an unaccountably empty list.
#[tauri::command]
async fn verify_mcp_server(
    command: String,
    args: Vec<String>,
    transport: Option<String>,
) -> Result<crate::mcp::probe::ProbeResult, String> {
    // 20s is generous for a handshake and short enough that a wedged server
    // does not look like a frozen panel.
    let timeout = std::time::Duration::from_secs(20);

    // A remote server is dialled, not launched. Routing on the transport keeps
    // one Verify control meaning one thing to the user, whatever the server is.
    let url = transport.filter(|t| t.starts_with("http://") || t.starts_with("https://"));
    Ok(match (command.trim().is_empty(), url) {
        (true, Some(u)) => crate::mcp::probe::probe_http(&u, timeout).await,
        _ => crate::mcp::probe::probe(&command, &args, timeout).await,
    })
}

/// Which MCP servers are running right now, and which are running unaccounted.
///
/// Read-only. Nothing is started or stopped — see spec §8 for why start/stop is
/// meaningless here: stdio servers are not daemons, each host spawns a private
/// child, and killing one breaks that host's session rather than stopping a
/// service.
///
/// Rescans rather than taking registrations from the caller, so the keys it
/// returns are the ones `Tool::registration_key` produces and identity stays in
/// one place. That costs a filesystem walk per call, which is why this is
/// invoked on demand and not on a timer.
///
/// `(async)` is not decoration. Tauri runs a plain sync command on the main
/// thread, and this one measured 11.2s against the real machine — the whole
/// window froze for eleven seconds, which is how the freeze was found at all
/// (the automation bridge's own script timeout fired). The annotation moves the
/// body off the main thread; `start_scan` reaches the same end by returning
/// immediately and doing its work in `async_runtime::spawn`.
#[tauri::command(async)]
fn get_mcp_processes(app: AppHandle) -> Result<Vec<crate::mcp::observe::ProcessMatch>, String> {
    let inventory = run_scan(app)?;
    let regs: Vec<(String, String, Vec<String>)> = inventory
        .tools
        .iter()
        .map(|t| (t.registration_key(), t.command.clone(), t.args.clone()))
        .collect();
    let procs = crate::mcp::observe::running_processes();
    Ok(crate::mcp::observe::match_processes(&regs, &procs))
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

/// Collapse duplicates after combining the per-root scans.
///
/// A root can be scanned more than once (nested linked directories, a re-scan
/// mid-flight), so the same asset can arrive twice and must be collapsed.
///
/// Every category but one is keyed on its path, because one path is one asset.
/// Tools are the exception: a config FILE holds many servers, so keying tools
/// on `config_path` kept one server per file and discarded the rest. That put
/// 23 servers in the database and 7 rows on screen under a heading reading 23.
/// `Tool.id` is `{config_path}-{name}`, which identifies a registration.
pub fn dedupe_combined(inventory: &mut Inventory) {
    let mut skill_paths = std::collections::HashSet::new();
    inventory.skills.retain(|s| skill_paths.insert(s.path.clone()));

    let mut agent_ids = std::collections::HashSet::new();
    inventory.agents.retain(|a| agent_ids.insert(a.id.clone()));

    let mut tool_ids = std::collections::HashSet::new();
    inventory.tools.retain(|t| tool_ids.insert(t.registration_key()));

    let mut rule_paths = std::collections::HashSet::new();
    inventory.rules.retain(|r| rule_paths.insert(r.path.clone()));

    let mut subagent_paths = std::collections::HashSet::new();
    inventory.subagents.retain(|sa| subagent_paths.insert(sa.path.clone()));
}

/// The link map's one data source. Computed in Rust end to end: the
/// frontend renders what it is given (see linkmap.rs for why).
///
/// `(async)` because a plain command runs on the main thread and this one
/// does filesystem work — per-root counts, engine-root read_dirs, a stat
/// per link destination. Small today; the same shape froze the webview
/// for 11 seconds in get_mcp_processes (93e2b90) once the payload grew.
#[tauri::command(async)]
fn link_graph(app: AppHandle, focus_asset_id: Option<i64>) -> Result<linkmap::LinkGraph, String> {
    linkmap::build_link_graph(&get_db_path(&app), focus_asset_id)
}

/// Per-asset mechanism, engine reach and the beyond-the-store note — all
/// derived at read time in Rust; the frontend renders what it is given
/// (see annotations.rs for why).
#[tauri::command]
fn get_asset_annotations(app: AppHandle) -> Result<Vec<annotations::AssetAnnotation>, String> {
    annotations::asset_annotations(&get_db_path(&app))
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

    dedupe_combined(&mut combined_inventory);

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
    /// Where the asset would land. The panel lists this per destination, and
    /// only this module knows how a source path maps onto a project, so the
    /// answer travels with the check rather than being re-derived up front.
    pub target_path: String,
    /// True when a link back to this exact source already sits at the target.
    /// Distinguishing it from a plain collision is what lets the panel say
    /// "Already linked" instead of offering to replace a file with itself.
    pub already_linked: bool,
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

/// Whether the destination is already a link resolving to this exact source.
///
/// Deliberately checks the link itself before following it: a regular file
/// that merely happens to have identical contents is a copy, not a link, and
/// replacing it is a real change the panel must still offer.
fn links_to_source(target: &Path, source: &Path) -> bool {
    match fs::symlink_metadata(target) {
        Ok(meta) if meta.file_type().is_symlink() => {}
        _ => return false,
    }
    match (fs::canonicalize(target), fs::canonicalize(source)) {
        (Ok(resolved), Ok(origin)) => resolved == origin,
        _ => false,
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

    // symlink_metadata, not exists(): a symlink whose target has been deleted
    // still occupies the destination and would still have to be replaced.
    let target_exists = fs::symlink_metadata(&target_path).is_ok();
    let already_linked = links_to_source(&target_path, Path::new(&source_path));
    let collision = target_exists && !already_linked;

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
        target_path: target_path.to_string_lossy().to_string(),
        already_linked,
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

        // Record the deployment as a link row. Non-fatal by design: the
        // files are already on disk, so failing the deploy over bookkeeping
        // would lie in the other direction; the scan-time backfill is the
        // reconciler for anything missed here. Hash is best-effort for
        // symlinks — resolve_state judges a symlink by its target, not its
        // hash.
        let hash_target = if src.is_dir() { src.join("SKILL.md") } else { src.to_path_buf() };
        let source_hash = fs::read(&hash_target)
            .map(|c| blake3::hash(&c).to_hex().to_string())
            .unwrap_or_default();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        let _ = store.record_deploy_link(
            &source_path,
            &dst.to_string_lossy(),
            "symlink",
            &source_hash,
            now,
        );
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

        // Record the deployment as a link row alongside the checksum.
        // deploy_checksums keeps working in parallel; retiring it is a
        // separate decision. Non-fatal for the same reason as the symlink
        // branch — the backfill reconciles.
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        let _ = store.record_deploy_link(
            &source_path,
            &dst.to_string_lossy(),
            "tracked_copy",
            &hash,
            now,
        );
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

        // Deduplicate lists before emitting. Shared with run_scan -- this was a
        // second copy of the same logic, and so a second copy of the same bug.
        dedupe_combined(&mut combined_inventory);

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
fn get_detected_engines() -> Vec<domain::Agent> {
    scanner::get_global_agents()
}

// Same action as File → Copy Diagnostics, reachable from the webview so a
// future settings surface (and automated verification) can trigger it.
#[tauri::command]
fn copy_diagnostics(app: AppHandle) {
    diagnostics::copy_to_clipboard(&app);
}

/// The largest document the inspector will pull into the webview. A SKILL.md
/// is prose; past this it is not something the panel can usefully show, and
/// reading it would stall the UI on the main thread.
const MAX_ASSET_BODY_BYTES: u64 = 512 * 1024;

/// True when `path` sits inside one of the roots Hanger already scans.
///
/// A path arriving from the webview is never trusted on its own: the inspector
/// may only read files the scanner could itself have surfaced. `starts_with`
/// compares whole path components, so `/srv/data` does not match `/srv/database`.
fn is_within_known_root(path: &Path, roots: &[PathBuf]) -> bool {
    roots.iter().any(|root| path.starts_with(root))
}

/// The file to show for an asset.
///
/// A skill is identified by the folder that holds it, not by the document
/// inside — the folder is the unit that gets linked, and the Agent Skills
/// standard lets it carry scripts and references alongside SKILL.md. So the
/// path an asset records is a directory, and the reader steps in one level to
/// find the document. Every other kind records its file and passes straight
/// through.
fn document_for(path: &Path) -> Option<PathBuf> {
    if !path.is_dir() {
        return Some(path.to_path_buf());
    }
    let entry = path.join("SKILL.md");
    entry.is_file().then_some(entry)
}

#[derive(serde::Serialize)]
pub struct AssetBody {
    /// What was read. A skill's folder resolves to the document inside it, and
    /// the panel shows the file it is actually displaying rather than the
    /// directory it started from.
    pub path: String,
    pub text: String,
}

/// Reads an asset's file so the inspector can show it. Bounded three ways:
/// the path must canonicalise inside a scanned root, the file must be within
/// MAX_ASSET_BODY_BYTES, and it must be valid UTF-8.
#[tauri::command]
fn read_asset_body(app: AppHandle, path: String) -> Result<AssetBody, String> {
    let store = get_store(&app)?;
    let linked = store.get_linked_directories().map_err(|e| e.to_string())?;

    let mut roots: Vec<PathBuf> = Vec::new();
    for dir in &linked {
        if let Ok(canonical) = fs::canonicalize(dir) {
            roots.push(canonical);
        }
    }
    // The scanner's own list, not a second one assembled here. Reading the
    // engine config directories alone missed the shared ~/.agents container
    // that engines symlink their skills/ into — which is where the assets
    // actually are, so every one of them was refused.
    for root in scanner::global_asset_roots() {
        if let Ok(canonical) = fs::canonicalize(&root) {
            roots.push(canonical);
        }
    }

    // Canonicalise before comparing, so a path reaching the root through a
    // symlink cannot be used to step outside it.
    let canonical = fs::canonicalize(&path).map_err(|_| "File not found".to_string())?;
    if !is_within_known_root(&canonical, &roots) {
        return Err("Refusing to read a file outside the folders Hanger scans".to_string());
    }

    // A skill's path is the folder that holds it, so the document is one level
    // in. Resolved after the root check, which the folder has already passed.
    let document = document_for(&canonical)
        .ok_or_else(|| "This folder has no SKILL.md to show".to_string())?;

    let meta = fs::metadata(&document).map_err(|_| "File not readable".to_string())?;
    if meta.len() > MAX_ASSET_BODY_BYTES {
        return Err("File is too large to preview".to_string());
    }

    let text = fs::read_to_string(&document).map_err(|_| "File is not text".to_string())?;
    Ok(AssetBody {
        path: document.to_string_lossy().to_string(),
        text,
    })
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
        .plugin(tauri_plugin_clipboard_manager::init())
        // Info globally (kills tao/hyper TRACE spam), Debug for our own
        // crate. 5MB × 3 rotated files so Copy Diagnostics has real history
        // to export — the 40KB discard-on-rotate default self-wipes in
        // minutes.
        .plugin(tauri_plugin_log::Builder::new()
            .level(log::LevelFilter::Info)
            .level_for("tauri_app_lib", log::LevelFilter::Debug)
            .max_file_size(5_000_000)
            .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(3))
            .timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseLocal)
            .targets([
                tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir { file_name: None }),
            ]).build())
        .setup(|app| {
            let handle = app.handle();
            scan::status::set_app_handle(handle.clone());

            // Native menu (update check + diagnostics), then the updater's
            // silent launch check and periodic re-check.
            menu::install(app)?;
            updates::spawn_background_checks(handle.clone());
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
            verify_mcp_server,
            get_mcp_processes,
            get_linked_directories,
            run_scan,
            get_inventory,
            get_asset_counts,
            read_asset_body,
            get_tree_counts,
            link_graph,
            get_asset_annotations,
            deploy_asset,
            check_deploy_target,
            execute_deploy,
            start_scan,
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
            get_detected_engines,
            copy_diagnostics,
            report_unmapped_engine
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| match event {
            // Tauri sets the dev Dock icon from bundle.icon while converting the
            // runtime's Ready event, so ours has to land after that — setup() is
            // too early and gets overwritten. See src/dev_icon.rs.
            tauri::RunEvent::Ready => dev_icon::install(),

            // The dev icon is resolved for the appearance current at the time it
            // was fetched, so it has to be re-fetched when the system flips.
            tauri::RunEvent::WindowEvent {
                event: tauri::WindowEvent::ThemeChanged(_),
                ..
            } => dev_icon::install(),

            _ => {}
        });
}

#[cfg(test)]
mod deploy_target_tests {
    use super::{links_to_source, resolve_target_path};
    use std::fs;
    use std::path::Path;

    #[test]
    fn mirrors_the_path_relative_to_a_known_root() {
        let roots = vec!["/home/me/.agents".to_string()];
        let target = resolve_target_path(
            "/home/me/.agents/skills/agent-browser/SKILL.md",
            "/work/mei-recipes",
            &roots,
        );
        assert_eq!(
            target,
            Path::new("/work/mei-recipes/skills/agent-browser/SKILL.md")
        );
    }

    #[test]
    fn falls_back_to_the_engine_folder_the_source_lives_under() {
        let target = resolve_target_path(
            "/home/me/.claude/skills/agent-browser",
            "/work/mei-recipes",
            &[],
        );
        assert_eq!(
            target,
            Path::new("/work/mei-recipes/.claude/agent-browser")
        );
    }

    #[test]
    fn a_symlink_pointing_at_the_source_is_recognised_as_already_linked() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("SKILL.md");
        fs::write(&source, "body").unwrap();
        let link = dir.path().join("linked");
        std::os::unix::fs::symlink(&source, &link).unwrap();

        assert!(links_to_source(&link, &source));
    }

    #[test]
    fn a_plain_copy_is_not_a_link_even_with_identical_contents() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("SKILL.md");
        fs::write(&source, "body").unwrap();
        let copy = dir.path().join("copy.md");
        fs::write(&copy, "body").unwrap();

        // Replacing a copy is a real change; the panel must still offer it.
        assert!(!links_to_source(&copy, &source));
    }

    #[test]
    fn a_symlink_to_some_other_file_is_not_a_link_to_this_source() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("ours.md");
        let other = dir.path().join("theirs.md");
        fs::write(&source, "a").unwrap();
        fs::write(&other, "b").unwrap();
        let link = dir.path().join("linked");
        std::os::unix::fs::symlink(&other, &link).unwrap();

        assert!(!links_to_source(&link, &source));
    }

    #[test]
    fn a_broken_symlink_is_not_reported_as_already_linked() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("SKILL.md");
        fs::write(&source, "body").unwrap();
        let link = dir.path().join("linked");
        std::os::unix::fs::symlink(dir.path().join("gone.md"), &link).unwrap();

        // It still occupies the destination, so it is a collision — but it is
        // emphatically not the job already done.
        assert!(!links_to_source(&link, &source));
        assert!(fs::symlink_metadata(&link).is_ok());
    }

    #[test]
    fn nothing_at_the_destination_is_not_a_link() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("SKILL.md");
        fs::write(&source, "body").unwrap();

        assert!(!links_to_source(&dir.path().join("absent"), &source));
    }
}

#[cfg(test)]
mod asset_body_tests {
    use super::{document_for, is_within_known_root};
    use std::fs;
    use std::path::{Path, PathBuf};

    #[test]
    fn a_skill_folder_resolves_to_the_document_inside_it() {
        let dir = tempfile::tempdir().unwrap();
        let skill = dir.path().join("agent-browser");
        fs::create_dir(&skill).unwrap();
        fs::write(skill.join("SKILL.md"), "body").unwrap();

        // The scanner identifies a skill by its folder, so this is the path
        // the panel hands over; reading it directly is EISDIR.
        assert_eq!(document_for(&skill), Some(skill.join("SKILL.md")));
    }

    #[test]
    fn a_file_is_its_own_document() {
        let dir = tempfile::tempdir().unwrap();
        let rule = dir.path().join("CLAUDE.md");
        fs::write(&rule, "body").unwrap();

        assert_eq!(document_for(&rule), Some(rule));
    }

    #[test]
    fn a_folder_with_no_skill_document_resolves_to_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let empty = dir.path().join("scripts");
        fs::create_dir(&empty).unwrap();

        // Better a plain "no document here" than reading the directory and
        // reporting that it is not text.
        assert_eq!(document_for(&empty), None);
    }

    #[test]
    fn a_directory_named_skill_md_is_not_a_document() {
        let dir = tempfile::tempdir().unwrap();
        let skill = dir.path().join("odd");
        fs::create_dir_all(skill.join("SKILL.md")).unwrap();

        assert_eq!(document_for(&skill), None);
    }

    #[test]
    fn accepts_a_file_inside_a_scanned_root() {
        let roots = vec![PathBuf::from("/home/me/.claude")];
        assert!(is_within_known_root(
            Path::new("/home/me/.claude/skills/agent-browser/SKILL.md"),
            &roots
        ));
    }

    #[test]
    fn rejects_a_file_outside_every_root() {
        let roots = vec![PathBuf::from("/home/me/.claude")];
        assert!(!is_within_known_root(Path::new("/etc/passwd"), &roots));
        assert!(!is_within_known_root(
            Path::new("/home/me/.ssh/id_rsa"),
            &roots
        ));
    }

    #[test]
    fn compares_whole_components_so_a_sibling_prefix_does_not_match() {
        let roots = vec![PathBuf::from("/srv/data")];
        assert!(!is_within_known_root(
            Path::new("/srv/database/secret.md"),
            &roots
        ));
    }

    #[test]
    fn accepts_a_file_in_any_one_of_several_roots() {
        let roots = vec![
            PathBuf::from("/home/me/.claude"),
            PathBuf::from("/home/me/Work/repo"),
        ];
        assert!(is_within_known_root(
            Path::new("/home/me/Work/repo/.claude/skills/x/SKILL.md"),
            &roots
        ));
    }

    #[test]
    fn rejects_everything_when_no_root_is_known() {
        assert!(!is_within_known_root(Path::new("/home/me/a.md"), &[]));
    }

    #[test]
    fn the_shared_agents_container_is_a_root_the_reader_accepts() {
        // An engine's skills/ is commonly a symlink into ~/.agents, and the
        // scanner records those assets under the container they resolve to.
        // Leaving it out of the reader's roots refused every one of them.
        let roots = crate::scanner::global_asset_roots();
        assert!(
            roots.iter().any(|root| root.ends_with(".agents")),
            "expected ~/.agents among {roots:?}"
        );
    }

    #[test]
    fn the_reader_and_the_scanner_agree_on_which_folders_are_ours() {
        // Two lists that must never drift: one decides what may be read, the
        // other what may not be unlinked.
        let readable = crate::scanner::global_asset_roots();
        let protected: Vec<_> = crate::scanner::protected_roots()
            .into_iter()
            .map(|(path, _)| path)
            .collect();
        assert_eq!(readable, protected);
    }
}

#[cfg(test)]
mod unmapped_engine_tests {
    use super::{sanitise_engine_key, unmapped_engine_payload};

    #[test]
    fn accepts_a_backend_shaped_key_and_lowercases_it() {
        assert_eq!(sanitise_engine_key(" Kiro "), Some("kiro".to_string()));
        assert_eq!(sanitise_engine_key("claude-code"), Some("claude-code".to_string()));
        assert_eq!(sanitise_engine_key("claude_desktop"), Some("claude_desktop".to_string()));
        assert_eq!(sanitise_engine_key("claude.ai"), Some("claude.ai".to_string()));
        assert_eq!(sanitise_engine_key(&"k".repeat(48)), Some("k".repeat(48)));
    }

    #[test]
    fn drops_anything_that_is_not_a_key() {
        assert_eq!(sanitise_engine_key(""), None);
        assert_eq!(sanitise_engine_key("   "), None);
        assert_eq!(sanitise_engine_key("../etc/passwd"), None);
        assert_eq!(sanitise_engine_key("/Users/k/.claude"), None);
        assert_eq!(sanitise_engine_key("Claude Code"), None);
        assert_eq!(sanitise_engine_key(&"k".repeat(49)), None);
    }

    #[test]
    fn payload_carries_the_key_and_an_optional_trimmed_truncated_name() {
        assert_eq!(
            unmapped_engine_payload("kiro", None),
            serde_json::json!({ "engine_key": "kiro" })
        );
        assert_eq!(
            unmapped_engine_payload("kiro", Some("   ")),
            serde_json::json!({ "engine_key": "kiro" })
        );
        assert_eq!(
            unmapped_engine_payload("kiro", Some(" Kiro IDE ")),
            serde_json::json!({ "engine_key": "kiro", "engine_name": "Kiro IDE" })
        );
        let long = "n".repeat(100);
        let p = unmapped_engine_payload("kiro", Some(&long));
        assert_eq!(p["engine_name"].as_str().unwrap().chars().count(), 64);
    }

    #[test]
    fn payload_never_carries_a_path_as_a_name() {
        let p = unmapped_engine_payload("kiro", Some("/Users/k/.kiro"));
        assert_eq!(p, serde_json::json!({ "engine_key": "kiro" }));
        let p = unmapped_engine_payload("kiro", Some("C:\\Users\\k"));
        assert_eq!(p, serde_json::json!({ "engine_key": "kiro" }));
    }
}
