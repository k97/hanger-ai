pub mod agents;
pub mod annotations;
pub mod dev_icon;
pub mod diagnostics;
pub mod domain;
pub mod linkmap;
pub mod mcp;
pub mod menu;
pub mod provenance;
pub mod scanner;
pub mod search;
pub mod updates;
mod transactional;
pub mod preferences;
pub mod watcher;
pub mod scan;

use domain::Inventory;
use scanner::{DirectoryScanner, Scanner};
use transactional::write_transactional;
use preferences::{PreferencesStore, SanitisedError};
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

/// How an unset `consent_usage` preference reads at startup.
///
/// The row does not exist until the user passes the onboarding consent step,
/// so `None` has to mean something. It meant off, through
/// `unwrap_or_default() == "true"` flattening `None` to `""`. It now means on:
/// Hanger is a local utility and usage events are what tell its development
/// where to go (Karthik's ruling, 2026-08-26). The onboarding screen carries
/// the box pre-ticked, so the choice is still shown before anything is sent.
///
/// An explicitly stored value always wins. A user who turned analytics off
/// stays off across restarts, and an empty string is a written value rather
/// than an absent one.
pub fn usage_consent_from_stored(stored: Option<String>) -> bool {
    match stored {
        Some(value) => value == "true",
        None => true,
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

/// The GA4 property Hanger's desktop builds report into.
///
/// A measurement ID is a public identifier, not a credential: it appears in
/// the page source of every site running GA, and `SECURITY.md` already draws
/// this same line for the Sentry DSN. Baking it in removes a build-time secret
/// that had to be kept in sync with the API secret, and getting that pairing
/// wrong is silent — the two must belong to the same data stream or GA4
/// answers 401.
///
/// `GA4_MEASUREMENT_ID` still overrides it at build time, for reporting a
/// build into a different property.
pub const DEFAULT_MEASUREMENT_ID: &str = "G-FSF08F45QS";

/// The measurement ID this build reports into.
pub fn measurement_id() -> &'static str {
    option_env!("GA4_MEASUREMENT_ID").unwrap_or(DEFAULT_MEASUREMENT_ID)
}

/// The log line for a GA4 response that was delivered but not accepted, or
/// `None` when it was.
///
/// GA4 answers an accepted event with 204, and a bad `measurement_id` /
/// `api_secret` pair with 401. The dispatch used to match only on transport
/// errors, so a 401 and a delivered event produced identical output — nothing
/// — and "are analytics working?" could not be answered from the running app.
///
/// The status is all this carries. The request URL holds the API secret in its
/// query string and is never part of a log line.
pub fn dispatch_status_line(status: u16) -> Option<String> {
    if (200..300).contains(&status) {
        None
    } else {
        Some(format!(
            "[Telemetry] GA4 did not accept the event: HTTP {}",
            status
        ))
    }
}

/// The log line for a GA4 request that never completed, with the URL stripped.
///
/// `reqwest::Error`'s `Debug` embeds the URL the request was built from, and
/// that URL carries `api_secret`. Printing the error whole wrote the
/// credential into the app log. `without_url` is reqwest's own affordance for
/// exactly this; `leak_tests.rs` asserts the raw error really does carry the
/// secret before asserting this line does not, so the control cannot pass by
/// accident.
pub fn dispatch_error_line(e: reqwest::Error) -> String {
    format!("[Telemetry] GA4 dispatch failed: {:?}", e.without_url())
}

pub async fn track_event_async(app: AppHandle, name: &str, params: serde_json::Value) {
    if !USAGE_CONSENT_ENABLED.load(Ordering::SeqCst) {
        return;
    }

    let measurement_id = measurement_id();
    // No default, deliberately: the ID is public but the secret is not, and an
    // absent secret is what stops an unconfigured developer build from
    // reporting into the production property.
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
            let status = resp.status().as_u16();
            if is_debug {
                // The debug endpoint validates the payload and describes what
                // it disliked, which the status alone does not.
                if let Ok(text) = resp.text().await {
                    println!("[Telemetry Debug Validation] HTTP {} — {}", status, text);
                }
            } else if let Some(line) = dispatch_status_line(status) {
                eprintln!("{}", line);
            }
        }
        Err(e) => {
            eprintln!("{}", dispatch_error_line(e));
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

/// What the panel gets back when it asks a registration what it provides.
///
/// `result` is `None` on exactly one path: the server is already running,
/// nothing usable was cached, and Hanger declined to start a second copy (see
/// [`cached_probe`]). Every other path — cache hit, successful handshake,
/// failed handshake — carries a `ProbeResult`, because a failure that
/// explains itself is an answer.
///
/// `verified_at` is when the answer was *learned*, not when it was fetched
/// from the store: a row read back three days later must date as three days
/// old, or the panel's "verified 3d ago" becomes a lie the moment caching
/// starts working.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedProbeResponse {
    pub result: Option<crate::mcp::probe::ProbeResult>,
    pub verified_at: Option<i64>,
    pub from_cache: bool,
    /// Rule 2 stopped this: the server is running, so nothing was started.
    ///
    /// Not derivable from `result` alone, and that is the point. The caller's
    /// own snapshot of what is running can be stale or missing, so the panel
    /// can believe a server is stopped while the live process table says
    /// otherwise. When that happens the panel would have no way to know it had
    /// been declined, and would explain an empty block by saying nobody has
    /// asked yet — which is false, and hides the one thing worth saying.
    pub declined: bool,
    /// The description-bytes accounting of `result`; `None` exactly when
    /// `result` is.
    pub cost: Option<crate::mcp::probe::ToolCost>,
}

/// Answer from the store when the store can answer, and start the server only
/// when starting it is safe.
///
/// The panel calls this on open, for every launch spec it shows, which is why
/// two rules bound it. Neither is an optimisation.
///
/// 1. **A fresh row is served and nothing is spawned.** `mcp::freshness`
///    decides fresh: an unchanged launch mtime beats an expired TTL, a
///    changed one beats a live TTL, and where there is no path to stat the
///    seven-day default decides alone.
/// 2. **A stale or missing row is NOT re-probed while the server is
///    running.** Probing means starting a real second copy of a third-party
///    server. `anthropics/claude-code#40220` documents a Telegram MCP whose
///    long-polling permits one connection per bot token, where the second
///    instance steals the connection and kills the first session;
///    `google_workspace_mcp#546` is the same class over an OAuth callback
///    port. Opening a panel must not end someone's session. Whatever is
///    cached is rendered, and asking again is left to the user.
///
/// `force` is that user, and it overrides both. `running` is supplied by the
/// caller rather than recomputed here: the panel is already rendering
/// `running · pid N` from `get_mcp_processes`, and a spawn decision that
/// contradicts what is on screen would be worse than the process-table
/// refresh it saves. It is a plain `bool`, not an `Option`, so a caller that
/// omits it fails to deserialise rather than defaulting to "stopped".
///
/// `now_ms` is a parameter for the same reason `freshness::verdict`'s is: the
/// whole decision matrix is then testable without sleeping.
///
/// A failed handshake replaces a stale success in the store rather than
/// leaving the old tool list in place. The list would be a lie about a server
/// that no longer starts, and `put_probe_result` round-trips an error as an
/// error by design.
pub async fn cached_probe(
    db_path: &Path,
    server: &crate::mcp::dialect::McpServer,
    force: bool,
    running: bool,
    now_ms: i64,
) -> CachedProbeResponse {
    cached_probe_confirmed(db_path, server, force, running, now_ms, launch_is_running).await
}

/// Whether this exact launch is already running, according to the machine.
///
/// Delegates to `mcp::observe`, which compares against the RAW argv it already
/// holds. Going through `running_processes()` instead — the obvious-looking
/// version, and what this was — compares against the REDACTED line, so any
/// launch carrying a credential reads as not running and the spawn is
/// permitted. That is the exact shape of `anthropics/claude-code#40220`, the
/// issue Rule 2 cites. See `observe::launch_is_running` for the measurement.
fn launch_is_running(program: &str, argv: &[String]) -> bool {
    crate::mcp::observe::launch_is_running(program, argv)
}

/// [`cached_probe`] with the liveness check supplied, so the decision matrix
/// is testable without depending on what happens to be running on the machine
/// the tests are on.
pub async fn cached_probe_confirmed<F>(
    db_path: &Path,
    server: &crate::mcp::dialect::McpServer,
    force: bool,
    running: bool,
    now_ms: i64,
    still_running: F,
) -> CachedProbeResponse
where
    F: FnOnce(&str, &[String]) -> bool,
{
    let key = crate::mcp::probe::cache_key(
        &server.command,
        &server.args,
        &server.env_keys,
        server.project_root.as_deref(),
        &server.transport,
    );
    let current_mtime =
        crate::mcp::probe::launch_mtime_ms(&server.command, &server.args, &server.transport);
    let launch =
        crate::mcp::probe::probe_launch(&server.command, &server.args, &server.transport);

    // A dial starts no process, so Rule 2 has nothing to protect and the
    // caller's `running` never applies to it. Saying so here rather than
    // letting the flag fall through matters twice: a remote server is never
    // wrongly declined, and it never waits on an answer about a process it
    // does not have.
    let spawns = matches!(launch, crate::mcp::probe::ProbeLaunch::Spawn { .. });

    if !force {
        // A store error reads as "nothing cached": the cache is an
        // accelerator, and a panel that refuses to answer because SQLite
        // hiccuped is worse than one that asks the server again.
        let cached = crate::preferences::get_probe_result(db_path, &key).ok().flatten();
        let fresh = cached.as_ref().is_some_and(|c| {
            crate::mcp::freshness::verdict(
                c.verified_at,
                now_ms,
                c.ttl_ms,
                c.launch_mtime,
                current_mtime,
            ) == crate::mcp::freshness::Freshness::Fresh
        });

        // Rule 1 first, and on its own: a fresh row is the answer whatever is
        // running, and costs nothing to give.
        if let (true, Some(c)) = (fresh, cached.as_ref()) {
            return CachedProbeResponse {
                result: Some(c.result.clone()),
                verified_at: Some(c.verified_at),
                from_cache: true,
                declined: false,
                cost: Some(crate::mcp::probe::tool_cost(&c.result)),
            };
        }

        // Rule 2. `running` is the caller's snapshot and is trusted only in
        // the direction that declines — a caller saying "it is running" costs
        // nothing to believe. Saying "it is stopped" is the direction that
        // ends in a spawn, and a snapshot can be missing (the scan failed or
        // has not run) or old (a host started the server since it was taken).
        // Both read as stopped, and the servers that cannot survive a second
        // copy are the long-lived ones most likely to have started since. So
        // that direction is confirmed against the live process table, at 61ms,
        // only on the path that was about to start a process anyway.
        let declined = spawns
            && match &launch {
                crate::mcp::probe::ProbeLaunch::Spawn { program, argv } => {
                    running || still_running(program, argv)
                }
                crate::mcp::probe::ProbeLaunch::Dial { .. } => false,
            };

        if declined {
            return match cached {
                Some(c) => {
                    let cost = Some(crate::mcp::probe::tool_cost(&c.result));
                    CachedProbeResponse {
                        result: Some(c.result),
                        verified_at: Some(c.verified_at),
                        from_cache: true,
                        declined: true,
                        cost,
                    }
                }
                // Nothing to give and no safe way to get it. The panel says
                // why and offers the re-check.
                None => CachedProbeResponse {
                    result: None,
                    verified_at: None,
                    from_cache: false,
                    declined: true,
                    cost: None,
                },
            };
        }
    }

    // 20s is generous for a handshake and short enough that a wedged server
    // does not look like a frozen panel.
    let timeout = std::time::Duration::from_secs(20);
    let result = match launch {
        crate::mcp::probe::ProbeLaunch::Dial { url } => {
            crate::mcp::probe::probe_http(&url, timeout).await
        }
        crate::mcp::probe::ProbeLaunch::Spawn { program, argv } => {
            crate::mcp::probe::probe(&program, &argv, timeout).await
        }
    };

    // `ttl_ms`/`cache_scope` are `None` because no server sends them: they
    // arrived in the MCP 2026-07-28 revision and `probe.rs` does not read
    // them. NULL is what makes `verdict` fall back to its seven-day default,
    // which is the intended path, not a gap.
    //
    // A failure is written like any other answer, and that cuts both ways: a
    // network blip on a dial, or an EADDRINUSE from a port already held,
    // replaces a good tool list and then reads as FRESH for the full seven
    // days. It is recoverable — the re-check forces past it — but nothing
    // expires it on its own, and the asymmetry is deliberate rather than
    // overlooked: keeping the old list would state a tool surface for a server
    // that no longer starts, which is the more dangerous of the two lies.
    let _ = crate::preferences::put_probe_result(db_path, &key, &result, None, None, current_mtime);

    let cost = Some(crate::mcp::probe::tool_cost(&result));
    CachedProbeResponse {
        result: Some(result),
        verified_at: Some(now_ms),
        from_cache: false,
        declined: false,
        cost,
    }
}

/// The panel's own question: what does this registration provide?
///
/// Unlike `mcp_probe` this does not always start anything — see
/// [`cached_probe`] for the two rules. `Err` means the key matched no
/// registration; a failed handshake is `Ok` with the reason inside
/// `result.error`, as before.
#[tauri::command]
async fn mcp_cached_probe(
    app: AppHandle,
    registration_key: String,
    force: bool,
    running: bool,
) -> Result<CachedProbeResponse, String> {
    let db_path = get_db_path(&app);
    let registration = crate::mcp::discover::resolve_registration(&registration_key)?;
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let response = cached_probe(&db_path, &registration.server, force, running, now_ms).await;
    // Cached or fresh, the answer is the tool list the palette should see.
    if let Some(result) = &response.result {
        if let Err(e) = search::index_probe_tools(
            &db_path,
            &registration_key,
            &registration.server.name,
            &registration.config_path,
            &result.tools,
        ) {
            eprintln!("search index not updated for {}: {}", registration_key, e);
        }
    }
    Ok(response)
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
        .map(|t| (t.registration_key().to_string(), t.command.clone(), t.args.clone()))
        .collect();
    let procs = crate::mcp::observe::running_processes();
    Ok(crate::mcp::observe::match_processes(&regs, &procs))
}

/// The server list: one row per server name, grouped and counted in Rust
/// (`.claude/rules/invariants.md` forbids the frontend computing a count).
///
/// Machine-level registrations only — `discover_machine`, not the per-repo
/// sweep — matching what §5.6's list renders: the global server set. Reads
/// config files directly by absolute path, the same walk-free access
/// `run_scan`'s machine-level MCP pass uses, so it costs a handful of file
/// reads rather than a directory walk. Still `(async)`: `get_mcp_processes`
/// measured its filesystem-bound work at 11s on a real machine and a plain
/// sync command runs on the main thread, freezing the window for the
/// duration.
#[tauri::command(async)]
fn get_mcp_servers() -> Result<Vec<crate::mcp::servers::McpServerRow>, String> {
    Ok(mcp_server_rows_for(&scanner::get_home_dir()))
}

/// `get_mcp_servers`'s testable core: `home` is a parameter here, not read
/// from `HANGER_TEST_HOME` internally, so its own unit test can hand it a
/// fixture path directly rather than mutating a process-global env var that
/// `cargo test --lib` shares across every unit test's thread — a fixture
/// swap here cannot race a concurrent test that reads `get_home_dir()`
/// through some other path, which an earlier version of this test did.
fn mcp_server_rows_for(home: &std::path::Path) -> Vec<crate::mcp::servers::McpServerRow> {
    let discovered = crate::mcp::discover::discover_machine(home);
    let mut rows = crate::mcp::servers::group_servers(&machine_wide(&discovered.registrations));
    // The rows are the machine-wide population; the override note is not.
    // A Local registration gets no row and joins no count, but it IS what
    // makes a wider row an override, and `group_servers` derives that note
    // from the registrations it is handed — so filtering first left every
    // row's `project_override` permanently `None` and §6.3 state 9's
    // sentence unreachable on any real machine. The full set answers that
    // one question, and only that one.
    let overrides = crate::mcp::servers::project_overrides(&discovered.registrations);
    for row in &mut rows {
        row.project_override = overrides.get(&row.name).cloned();
    }
    rows
}

/// What a machine-wide MCP surface describes: every registration except
/// `ScopeTier::Local`.
///
/// Local tier is keyed to a repository (`claude mcp add -s local` writes it
/// into `~/.claude.json`'s `projects.<repo_root>.mcpServers`), so it is not
/// part of what this machine carries by default. `run_scan`'s machine pass
/// applies the same filter (`scanner.rs`) before these registrations reach
/// the database, which is what the header count above the list is built
/// from; skipping it put a Local row on screen under a header that did not
/// count it.
///
/// Both surfaces under that header read through here — the server list
/// (`mcp_server_rows_for`) and the empty inspector's per-engine summary
/// (`mcp_engine_summary_for`). They used to disagree: the list filtered and
/// the summary did not, so the summary's total counted (host, server name)
/// pairs the adjacent list would never show, with nothing on screen
/// explaining the difference.
fn machine_wide(
    registrations: &[crate::mcp::discover::Registration],
) -> Vec<crate::mcp::discover::Registration> {
    registrations
        .iter()
        .filter(|reg| reg.tier != crate::mcp::registry::ScopeTier::Local)
        .cloned()
        .collect()
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

    // Search is a convenience: an index failure never fails the scan.
    if let Err(e) = search::index_inventory(&get_db_path(&app), &combined_inventory) {
        eprintln!("search index not rebuilt: {}", e);
    }

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

/// Where a deployed asset lands in the target project.
///
/// Returns `Err` when nothing claims the source. The prior version fell
/// through to `tgt_project.join(filename)`, writing the asset into the
/// project root — a silent wrong write on a stranger's disk. Per-agent
/// directories come from `agents::AGENT_CONFIGS`, the same table the read
/// side uses; there is no second source of truth.
///
/// Three answers, in order: an explicitly linked directory, the shared
/// `.agents/` store, then the owning agent's own directory. The middle one is
/// not an ownership answer — `engine_for_path` returns `None` for `.agents/`
/// paths and must keep doing so (spec §4.4) — it is a *destination* answer to
/// a different question. Without it every asset in `~/.agents` is
/// undeployable with no workaround, because `~/.agents` is a protected root
/// and so can never appear in `linked_dirs` either
/// (`scanner::protected_roots`).
fn resolve_target_path(
    source_path: &str,
    target_project_path: &str,
    linked_dirs: &[String],
) -> Result<PathBuf, SanitisedError> {
    let src = Path::new(source_path);
    let tgt_project = Path::new(target_project_path);

    for dir in linked_dirs {
        if let Ok(rel) = src.strip_prefix(dir) {
            return Ok(tgt_project.join(rel));
        }
    }

    if let Some(below) = crate::agents::shared_agents_subpath(src) {
        return Ok(tgt_project
            .join(crate::agents::SHARED_AGENTS_DIR)
            .join(below));
    }

    let filename = src
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| SanitisedError("Source path has no filename".to_string()))?;

    match crate::agents::engine_for_path(src) {
        Some(config) => {
            let root = config
                .project_roots
                .first()
                .ok_or_else(|| SanitisedError(format!(
                    "{} declares no project directory to deploy into",
                    config.name
                )))?;
            Ok(tgt_project.join(root).join(filename))
        }
        None => Err(SanitisedError(
            "Cannot deploy: no agent claims this asset's source directory".to_string(),
        )),
    }
}

/// Test-only re-export. Integration tests live outside the crate and cannot
/// reach a private fn.
#[doc(hidden)]
pub fn resolve_target_path_for_test(
    source_path: &str,
    target_project_path: &str,
    linked_dirs: &[String],
) -> Result<PathBuf, SanitisedError> {
    resolve_target_path(source_path, target_project_path, linked_dirs)
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
    let target_path = resolve_target_path(&source_path, &target_project_path, &linked_dirs)
        .map_err(|e| e.to_string())?;

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
    let target_path = resolve_target_path(&source_path, &target_project_path, &linked_dirs)
        .map_err(|e| e.to_string())?;

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

        if let Err(e) = search::index_inventory(&get_db_path(&app_clone), &combined_inventory) {
            eprintln!("search index not rebuilt: {}", e);
        }

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

#[tauri::command]
fn get_known_engines() -> Vec<domain::Agent> {
    agents::known_engines()
}

/// Appendix A.1's "Checked {n} config files across {m} engines" figures and
/// its `[Show files]` disclosure — a fresh `discover_machine`, the same
/// pattern `get_mcp_servers`/`mcp_server_rows_for` already uses (re-derive
/// from disk rather than cache scan state). `(async)`: filesystem-bound, and
/// `get_mcp_processes`'s doc comment already measured a plain sync command
/// freezing the window for the duration of comparable work.
#[tauri::command(async)]
fn get_mcp_coverage() -> Result<mcp::discover::McpCoverage, String> {
    let home = scanner::get_home_dir();
    let discovered = mcp::discover::discover_machine(&home);
    // The same population the headline's `{engine list}` draws from
    // (`get_detected_engines`) — passed in so `coverage()` counts against
    // exactly what the sentence names, never a `HostKind` proxy for it.
    let detected: std::collections::HashSet<String> =
        scanner::get_global_agents().into_iter().map(|a| a.id).collect();
    Ok(mcp::discover::coverage(&discovered, &detected))
}

/// Task 15's empty inspector: one row per host that registers at least one
/// server, what it registers, and what is known of what it exposes.
///
/// Population is every host `discover_machine` finds a registration for —
/// NOT `get_global_agents()`'s detected-engine set. Fix round 1
/// (2026-08-20) ruled out the detected-engine restriction this command
/// shipped with originally: it silently dropped every MCP-only host
/// (Claude Desktop, Cursor, VS Code, Claude.ai, Devin Desktop) from a
/// machine that had real registrations under them. `mcp::engine_summary`'s
/// own doc comment carries the full reasoning; this command no longer
/// builds a `detected` set at all.
///
/// The probe half reads `preferences::get_probe_result` per distinct
/// launch, which is the same cache `mcp_cached_probe` reads and writes —
/// this command starts no probe of its own, so most launches on a real
/// machine answer `None` here, by construction. `(async)`: same
/// filesystem-bound reasoning as `get_mcp_coverage`.
#[tauri::command(async)]
fn get_mcp_engine_summary(app: AppHandle) -> Result<mcp::engine_summary::McpEngineSummary, String> {
    let db_path = get_db_path(&app);
    Ok(mcp_engine_summary_for(&scanner::get_home_dir(), |key| {
        preferences::get_probe_result(&db_path, key)
            .ok()
            .flatten()
            .map(|cached| cached.result.tools.len())
    }))
}

/// `get_mcp_engine_summary`'s testable core, the same division of labour
/// `mcp_server_rows_for` uses for the server list: `home` and the probe
/// lookup are parameters, so a test can hand it a fixture home and an empty
/// cache instead of a database and a process-global env var.
fn mcp_engine_summary_for<F>(
    home: &std::path::Path,
    probe_of: F,
) -> mcp::engine_summary::McpEngineSummary
where
    F: FnMut(&str) -> Option<usize>,
{
    let mut discovered = mcp::discover::discover_machine(home);
    discovered.registrations = machine_wide(&discovered.registrations);
    mcp::engine_summary::engine_summary(&discovered, probe_of)
}

/// Appendix A.2's "Checked {n} locations" figure and its `[Show locations]`
/// disclosure. `agents::known_engine_locations()` is pure registry data
/// (home-relative, no I/O by that module's own contract); the home-join and
/// sanitisation happen here, at the IPC boundary, same division of labour as
/// `get_global_agents` vs. its callers.
#[derive(Debug, Clone, serde::Serialize)]
pub struct EngineLocationSummary {
    pub location_count: usize,
    pub locations: Vec<String>,
}

#[tauri::command]
fn get_known_engine_locations() -> EngineLocationSummary {
    let home = scanner::get_home_dir();
    let rels = agents::known_engine_locations();
    let locations = agents::dedupe_and_sanitise_locations(&home, &rels);
    EngineLocationSummary {
        location_count: locations.len(),
        locations,
    }
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

#[derive(Debug, serde::Serialize)]
pub struct AssetBody {
    /// What was read. A skill's folder resolves to the document inside it, and
    /// the panel shows the file it is actually displaying rather than the
    /// directory it started from.
    pub path: String,
    pub text: String,
    /// The document's size on disk — the figure the Size row and the Context line show.
    pub bytes: u64,
    /// `text.split('\n').count()`, the line count the panel has always shown.
    pub lines: usize,
    /// mtime, milliseconds since the epoch, read at request time — never
    /// stored. `None` when the platform reports no mtime, so no caller can
    /// render a fabricated epoch date in its place.
    pub modified_ms: Option<i64>,
    /// bytes / 4, integer division: an estimate, labelled as one on screen.
    pub estimated_tokens: u64,
    /// UTF-8 bytes of the frontmatter name + description — the share of this
    /// document in every engine's startup list, whether or not it ever fires.
    /// `None` when the document does not parse as skill frontmatter.
    pub always_on_bytes: Option<u64>,
    /// bytes / 4, integer division, same estimate rule as `estimated_tokens`.
    pub always_on_estimated_tokens: Option<u64>,
}

/// Reads one document for the inspector: the text, and the figures the panel
/// renders beside it. mtime is read here, at request time, like link state —
/// nothing is stored.
pub fn asset_body_of(document: &Path) -> Result<AssetBody, String> {
    let meta = fs::metadata(document).map_err(|_| "File not readable".to_string())?;
    if meta.len() > MAX_ASSET_BODY_BYTES {
        return Err("File is too large to preview".to_string());
    }
    let text = fs::read_to_string(document).map_err(|_| "File is not text".to_string())?;
    let bytes = meta.len();
    let modified_ms = meta
        .modified()
        .ok()
        .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64);
    // Runs for every document `asset_body_of` reads -- rules, agents and
    // commands included -- because this function has no category to gate
    // the parse on. The result is `None` for anything without a `name`/
    // `description` frontmatter pair; that is accepted rather than
    // threading a category through just to skip it.
    let always_on_bytes = scanner::parse_skill_frontmatter(&text)
        .ok()
        .map(|fm| (fm.name.len() + fm.description.len()) as u64);
    Ok(AssetBody {
        path: document.to_string_lossy().to_string(),
        lines: text.split('\n').count(),
        bytes,
        modified_ms,
        estimated_tokens: bytes / 4,
        always_on_bytes,
        always_on_estimated_tokens: always_on_bytes.map(|b| b / 4),
        text,
    })
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

    asset_body_of(&document)
}

#[derive(serde::Serialize, Debug, PartialEq)]
pub struct AssetDirEntry {
    pub name: String,
    pub kind: String,
    pub bytes: Option<u64>,
    pub file_count: Option<usize>,
}

/// Walks a folder counting the files beneath it, the figure a folder row
/// shows. Classifies each entry with `symlink_metadata`, which does not
/// follow the link, so a symlink — whether it points at a file or a
/// directory — is never recursed into: no cycle from a link back into its
/// own ancestry, and no size or count read from something outside every
/// scanned root. A symlink still counts as one entry here, the same as any
/// other file; only what is behind it goes uncounted.
fn count_files_beneath(dir: &Path) -> usize {
    let mut n = 0;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(meta) = fs::symlink_metadata(&path) else { continue };
            if meta.is_dir() {
                n += count_files_beneath(&path);
            } else {
                n += 1;
            }
        }
    }
    n
}

/// A skill folder's top level, SKILL.md first, hidden entries skipped. A
/// folder carries how many files sit beneath it — the frontend lists and
/// never counts.
///
/// Every entry is classified with `symlink_metadata`, which does not follow
/// the link, so a symlink is never treated as a directory: it is listed by
/// name, but nothing recurses into it and no size or count is read from
/// whatever it points at. Root-checking every entry was considered and not
/// chosen — this is the classification that makes it unnecessary.
pub fn list_asset_dir_of(folder: &Path) -> Result<Vec<AssetDirEntry>, String> {
    if !folder.is_dir() {
        return Err("Not a folder".to_string());
    }
    let mut entries: Vec<AssetDirEntry> = fs::read_dir(folder)
        .map_err(|_| "Folder not readable".to_string())?
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                return None;
            }
            let path = entry.path();
            let meta = fs::symlink_metadata(&path).ok()?;
            if meta.file_type().is_symlink() {
                return Some(AssetDirEntry { name, kind: "symlink".to_string(), bytes: None, file_count: None });
            }
            if meta.is_dir() {
                Some(AssetDirEntry {
                    name: format!("{name}/"),
                    kind: "dir".to_string(),
                    bytes: None,
                    file_count: Some(count_files_beneath(&path)),
                })
            } else {
                Some(AssetDirEntry { name, kind: "file".to_string(), bytes: Some(meta.len()), file_count: None })
            }
        })
        .collect();
    entries.sort_by(|a, b| {
        let lead = |e: &AssetDirEntry| if e.name == "SKILL.md" { 0 } else { 1 };
        lead(a).cmp(&lead(b)).then_with(|| a.name.cmp(&b.name))
    });
    Ok(entries)
}

/// Lists a skill's folder for the inspector's "Contents" card. Same
/// boundary as `read_asset_body`: the path must canonicalise inside a root
/// the scanner reads.
#[tauri::command]
fn list_asset_dir(app: AppHandle, path: String) -> Result<Vec<AssetDirEntry>, String> {
    let store = get_store(&app)?;
    let linked = store.get_linked_directories().map_err(|e| e.to_string())?;
    let mut roots: Vec<PathBuf> = Vec::new();
    for dir in &linked {
        if let Ok(canonical) = fs::canonicalize(dir) {
            roots.push(canonical);
        }
    }
    for root in scanner::global_asset_roots() {
        if let Ok(canonical) = fs::canonicalize(&root) {
            roots.push(canonical);
        }
    }
    let canonical = fs::canonicalize(&path).map_err(|_| "File not found".to_string())?;
    if !is_within_known_root(&canonical, &roots) {
        return Err("Refusing to read a file outside the folders Hanger scans".to_string());
    }
    list_asset_dir_of(&canonical)
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

/// The search palette's query. Ranked by the index, snippets marked with
/// `search::MARK_OPEN`/`MARK_CLOSE`; `total` is the backend's count.
#[tauri::command]
fn search_assets(app: AppHandle, query: String, limit: Option<usize>) -> Result<search::SearchResponse, String> {
    search::search(&get_db_path(&app), &query, limit.unwrap_or(50)).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_asset_counts(
    app: AppHandle,
    root: Option<String>,
    grouping: Option<scanner::Grouping>,
) -> Result<crate::domain::AssetCounts, String> {
    let db_path = get_db_path(&app);
    // `App.tsx`'s global-scope caller (`refreshGlobalCounts`) passes the MCP
    // server list's grouping toggle; the repo-scope caller (`fetchRepoCounts`)
    // deliberately does not, since `get_mcp_servers` is machine-global and a
    // repo's Tools rows never regroup (see that call site's own comment).
    // Absent, today's per-registration behaviour holds.
    scanner::count_assets(&db_path, root.as_deref(), grouping.unwrap_or(scanner::Grouping::PerRegistration))
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

            // Name the window after the build it came from. Dev-only in
            // effect: `window_title(false)` is what tauri.conf.json already
            // set, so a release build renames itself to the same string.
            // See src/dev_icon.rs for why the window, not just the Dock tile,
            // has to carry this.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title(dev_icon::window_title(cfg!(debug_assertions)));
            }

            // Native menu (update check + diagnostics), then the updater's
            // silent launch check and periodic re-check.
            menu::install(app)?;
            updates::spawn_background_checks(handle.clone());
            if let Ok(store) = get_store(handle) {
                let crash = store.get_preference("consent_crash").ok().flatten().unwrap_or_default() == "true";
                let usage = usage_consent_from_stored(store.get_preference("consent_usage").ok().flatten());

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
            mcp_cached_probe,
            get_mcp_processes,
            get_mcp_servers,
            get_mcp_coverage,
            get_mcp_engine_summary,
            get_linked_directories,
            run_scan,
            get_inventory,
            search_assets,
            get_asset_counts,
            read_asset_body,
            list_asset_dir,
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
            get_known_engines,
            get_known_engine_locations,
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
        )
        .expect("an explicitly linked dir must resolve");
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
        )
        .expect("a source under a known agent root must resolve");
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

#[cfg(test)]
mod get_mcp_servers_tests {
    use super::mcp_server_rows_for;

    /// `run_scan`'s machine pass filters `ScopeTier::Local` out before it
    /// reaches the profile (`scanner.rs`, the machine-level MCP registration
    /// loop) because a local-tier registration in `~/.claude.json` belongs to
    /// one repository, not the global store. `get_mcp_servers` reads the same
    /// `discover_machine` output but skipped that filter, so a project-local
    /// server leaked into the Global list's rows while the backend-owned
    /// header count (which does exclude Local) did not count it — a header
    /// reading 1 with three rows underneath. `tests/fixtures/mcp_home/.claude.json`
    /// already carries exactly this shape: three user-scope servers under
    /// `mcpServers`, plus `repo-local` and `stray` under two different
    /// `projects.*.mcpServers` entries — the shape `claude mcp add -s local`
    /// writes.
    /// §6.3 state 9's override note was a dead surface. `project_override`
    /// is computed INSIDE `group_servers`, from the registrations it is
    /// handed — and `mcp_server_rows_for` stripped every `ScopeTier::Local`
    /// registration before handing them over, so no row on a real machine
    /// could ever carry one, however many project pins the user had. Both
    /// of the field's own tests call `group_servers` directly, which is
    /// exactly why a whole dead surface stayed green; this one goes through
    /// the command's core, where the filter lives.
    ///
    /// A Local registration still gets no row and joins no count — the list
    /// is the machine-wide population. Its only job here is the note.
    #[test]
    fn a_project_pin_of_a_user_scope_name_reaches_the_list_as_an_override() {
        let home = tempfile::tempdir().expect("tempdir");
        std::fs::write(
            home.path().join(".claude.json"),
            r#"{
              "mcpServers": {
                "tauri": { "command": "npx", "args": ["-y", "@tauri/mcp@2.9.1"] }
              },
              "projects": {
                "/opt/repos/hanger-ai": {
                  "mcpServers": {
                    "tauri": { "command": "npx", "args": ["-y", "@tauri/mcp@latest"] }
                  }
                }
              }
            }"#,
        )
        .expect("write");

        let rows = mcp_server_rows_for(home.path());
        let tauri = rows
            .iter()
            .find(|r| r.name == "tauri")
            .expect("the user-scope server must still be a row");
        assert_eq!(
            tauri.project_override,
            Some("<sanitised>/hanger-ai".to_string()),
            "the project pin never reached group_servers, so the note can never render"
        );
        assert_eq!(
            tauri.registration_count, 1,
            "the Local registration explains the row; it does not join it"
        );
    }

    /// m1, settled with the same decision: the empty inspector's per-engine
    /// summary sits beside this list under the same header and read a
    /// DIFFERENT population — `get_mcp_engine_summary` passed
    /// `discover_machine`'s output unfiltered, so its total counted (host,
    /// server name) pairs the adjacent list will never show, with nothing on
    /// screen to explain the difference. The fixture's `repo-local` and
    /// `stray` are exactly that shape: Local-tier, and declared at no wider
    /// tier anywhere.
    #[test]
    fn the_engine_summary_counts_the_same_population_the_list_shows() {
        let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/mcp_home");

        let summary = super::mcp_engine_summary_for(&fixture, |_| None);
        let claude_code = summary
            .rows
            .iter()
            .find(|r| r.engine_id == "claude-code")
            .expect("the fixture's claude-code registrations must produce a row");

        // claude-code's distinct names in this fixture: spades-audio,
        // chrome-devtools and tauri from `.claude.json`'s user-scope
        // `mcpServers`, spades-audio again from `.claude/mcp.json` (one
        // name, counted once), and github + context7 from the plugin
        // marketplace. `repo-local` and `stray` are the two Local-tier
        // names, and are the whole difference between this figure and 7.
        assert_eq!(
            claude_code.server_count, 5,
            "a project-pinned server is not part of what this machine carries by default"
        );
    }

    #[test]
    fn local_tier_servers_do_not_reach_the_global_server_list() {
        let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/mcp_home");

        let rows = mcp_server_rows_for(&fixture);
        let names: Vec<&str> = rows.iter().map(|r| r.name.as_str()).collect();

        assert!(names.contains(&"chrome-devtools"), "user-scope server missing: {:?}", names);
        assert!(names.contains(&"tauri"), "user-scope server missing: {:?}", names);
        assert!(
            !names.contains(&"repo-local"),
            "local-tier server leaked into the global list: {:?}",
            names
        );
        assert!(
            !names.contains(&"stray"),
            "local-tier server leaked into the global list: {:?}",
            names
        );
    }
}
