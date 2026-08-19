//! The two rules that decide whether opening a panel starts a server.
//!
//! 1. **Cache fresh → render it, spawn nothing.**
//! 2. **Cache stale or absent AND the server is already running → do not
//!    auto-probe.** Return whatever is cached and leave the re-check to the
//!    user.
//!
//! Neither is an optimisation. `anthropics/claude-code#40220` documents a
//! Telegram MCP whose long-polling allows one connection per bot token: a
//! second instance steals the connection and kills the first session.
//! `google_workspace_mcp#546` is the same class over an OAuth callback port.
//! A panel that probes on open, without these rules, breaks a host's live
//! session by being looked at.
//!
//! **How "did it spawn?" is observed here.** Every fixture launches
//! `hanger-probe-must-not-run`, a program that exists nowhere on this machine
//! or its PATH. A spawn therefore cannot succeed and cannot hang — it fails
//! at `Command::spawn` with ENOENT and `probe` returns
//! `error: Some("Could not start …")`. So an `error: None` result carrying
//! the seeded tool list proves the cache answered; an `error: Some(…)` result
//! proves a spawn was attempted. That is a positive signal in both
//! directions, not an absence of evidence, and it costs no child process and
//! no wall-clock time.

use std::path::Path;

use tauri_app_lib::cached_probe;
use tauri_app_lib::mcp::dialect::McpServer;
use tauri_app_lib::mcp::probe::{cache_key, ProbeResult, ProbedTool};
use tauri_app_lib::preferences::{get_probe_result, put_probe_result};

const DAY_MS: i64 = 24 * 60 * 60 * 1000;

/// A program that is not installed, so a spawn is observable and instant.
const UNRUNNABLE: &str = "hanger-probe-must-not-run";

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

/// A stdio declaration whose launch has no absolute path in it, so
/// `freshness::stat_target` returns `None` and the TTL alone decides
/// freshness. That is what lets these tests move time with `now_ms` instead
/// of touching a file's mtime.
fn stdio_server() -> McpServer {
    McpServer {
        name: "demo".to_string(),
        command: UNRUNNABLE.to_string(),
        args: vec!["--serve".to_string()],
        transport: "stdio".to_string(),
        env_keys: vec![],
        project_root: None,
        bridged: false,
        url_fingerprint: None,
    }
}

fn remote_server(url: &str) -> McpServer {
    McpServer {
        name: "remote".to_string(),
        command: String::new(),
        args: vec![],
        transport: url.to_string(),
        env_keys: vec![],
        project_root: None,
        bridged: false,
        url_fingerprint: None,
    }
}

fn cached_tools() -> ProbeResult {
    ProbeResult {
        server_name: None,
        server_version: Some("1.2.3".to_string()),
        protocol_version: Some("2025-06-18".to_string()),
        capabilities: vec!["tools".to_string()],
        tools: vec![ProbedTool {
            name: "from_the_cache".to_string(),
            description: Some("Only a cache hit can produce this name".to_string()),
        }],
        error: None,
    }
}

fn seed(db_path: &Path, server: &McpServer, verified_at: i64) -> String {
    let key = cache_key(
        &server.command,
        &server.args,
        &server.env_keys,
        server.project_root.as_deref(),
        &server.transport,
    );
    put_probe_result(db_path, &key, &cached_tools(), None, None, None).unwrap();
    // `put_probe_result` stamps `verified_at` itself from the wall clock, so
    // move it directly for the tests that need a row older than the TTL.
    let conn = rusqlite::Connection::open(db_path).unwrap();
    conn.execute(
        "UPDATE probe_results SET verified_at = ?1 WHERE launch_hash = ?2",
        rusqlite::params![verified_at, key],
    )
    .unwrap();
    key
}

// ---------------------------------------------------------------------------
// Rule 1: fresh cache renders, and nothing is spawned.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn a_fresh_cache_answers_without_spawning_anything() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("prefs.db");
    let server = stdio_server();
    let now = now_ms();
    seed(&db, &server, now);

    let out = cached_probe(&db, &server, false, false, now).await;

    let result = out.result.expect("a fresh row must be served");
    assert_eq!(result.error, None, "a spawn would have failed with ENOENT; error must stay None");
    assert_eq!(result.tools[0].name, "from_the_cache", "the tool list must come from the row, not a handshake");
    assert!(out.from_cache, "a fresh row is a cache hit");
    assert_eq!(out.verified_at, Some(now), "the panel dates the answer from when it was learned, not now");
}

/// A running server with a fresh row still gets its answer.
///
/// This one discriminates a STATE, not a rule, and the distinction is worth
/// stating so nobody counts it as a second control on Rule 1. With the server
/// running, Rules 1 and 2 produce the identical observable answer, so removing
/// either alone leaves this green — verified by mutation. What it does pin is
/// a real regression shape: an implementation that answers "nothing to show,
/// the server is running" whenever a server is running, even while holding a
/// perfectly good row. Making a running server ALWAYS probe kills it.
#[tokio::test]
async fn a_fresh_cache_answers_for_a_running_server_too() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("prefs.db");
    let server = stdio_server();
    let now = now_ms();
    seed(&db, &server, now);

    let out = cached_probe(&db, &server, false, true, now).await;

    assert_eq!(out.result.expect("row").tools[0].name, "from_the_cache");
    assert!(out.from_cache);
}

// ---------------------------------------------------------------------------
// Rule 2: stale or absent, and the server is running → ask nothing.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn a_stale_cache_on_a_running_server_is_served_as_is_and_nothing_is_spawned() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("prefs.db");
    let server = stdio_server();
    let learned = now_ms();
    seed(&db, &server, learned);

    // Eight days on: past the seven-day default TTL, with no stat target to
    // overrule it.
    let out = cached_probe(&db, &server, false, true, learned + 8 * DAY_MS).await;

    let result = out.result.expect("a stale row is still the best answer there is");
    assert_eq!(result.error, None, "nothing may be spawned at a running server");
    assert_eq!(result.tools[0].name, "from_the_cache");
    assert!(out.from_cache);
    assert_eq!(out.verified_at, Some(learned), "the age shown must be the row's real age");
}

#[tokio::test]
async fn no_cache_on_a_running_server_returns_nothing_and_writes_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("prefs.db");
    let server = stdio_server();
    let now = now_ms();

    let out = cached_probe(&db, &server, false, false, now).await;
    // Control: with the server stopped, this same call DOES probe — so the
    // assertion below is about the running flag, not about the fixture being
    // unable to produce a result at all.
    assert!(out.result.expect("stopped: probed").error.is_some());

    let dir2 = tempfile::tempdir().unwrap();
    let db2 = dir2.path().join("prefs.db");
    let out = cached_probe(&db2, &server, false, true, now).await;

    assert!(out.result.is_none(), "with nothing cached and the server running there is no answer to give");
    assert_eq!(out.verified_at, None);
    assert!(!out.from_cache);

    let key = cache_key(&server.command, &server.args, &server.env_keys, None, &server.transport);
    assert!(
        get_probe_result(&db2, &key).unwrap().is_none(),
        "declining must leave the store untouched — a row here would mean a handshake happened"
    );
}

// ---------------------------------------------------------------------------
// The other side of Rule 2: stopped, so asking is safe.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn a_stale_cache_on_a_stopped_server_is_re_probed_and_the_row_is_replaced() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("prefs.db");
    let server = stdio_server();
    let learned = now_ms();
    let key = seed(&db, &server, learned);

    let out = cached_probe(&db, &server, false, false, learned + 8 * DAY_MS).await;

    let result = out.result.expect("a probe always produces a result, success or explained failure");
    assert!(
        result.error.as_deref().unwrap_or_default().contains("Could not start"),
        "a stopped server past its TTL must actually be asked; got {:?}",
        result.error
    );
    assert!(!out.from_cache);

    let row = get_probe_result(&db, &key).unwrap().expect("the probe's answer is written back");
    assert!(row.result.error.is_some(), "a failed handshake replaces a stale success rather than leaving a lie on screen");
    assert!(row.result.tools.is_empty());
}

// ---------------------------------------------------------------------------
// force: the user asked, and that overrides both rules.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn force_probes_a_running_server_whose_cache_is_fresh() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("prefs.db");
    let server = stdio_server();
    let now = now_ms();
    seed(&db, &server, now);

    // Fresh row AND a running server: both rules say "do not spawn". The
    // reload control is exactly the case that is allowed to.
    let out = cached_probe(&db, &server, true, true, now).await;

    let result = out.result.expect("result");
    assert!(
        result.error.as_deref().unwrap_or_default().contains("Could not start"),
        "force must reach the handshake; got {:?}",
        result.error
    );
    assert!(!out.from_cache);
}

// ---------------------------------------------------------------------------
// The cache key. Task 6 is `probe_results`' first real caller, so this is the
// first time a wrong key would be visible to anyone.
// ---------------------------------------------------------------------------

/// A remote server has an empty `command` and empty `args`. Keyed on those
/// alone, EVERY remote server on a machine hashes identically and the first
/// one probed answers for all of them — Notion's tools shown under Linear's
/// name. The URL is what a remote probe actually dials, so the URL is what
/// the key has to carry.
#[test]
fn two_remote_servers_do_not_share_a_cache_row() {
    let a = remote_server("https://mcp.notion.com/mcp");
    let b = remote_server("https://mcp.linear.app/mcp");

    let ka = cache_key(&a.command, &a.args, &a.env_keys, None, &a.transport);
    let kb = cache_key(&b.command, &b.args, &b.env_keys, None, &b.transport);

    assert_ne!(ka, kb, "two endpoints must never share one probe row");
    assert!(!ka.is_empty());
}

/// `~/.claude.json` writes `{"command": "npx @hypothesi/tauri-mcp-server"}`
/// with no args; `~/.codex/config.toml` writes the same server as command
/// plus `args = []`. `probe::split_launch` already reconciles the two before
/// spawning, so the cache key is taken after that split — otherwise the same
/// server is probed twice and cached twice depending on which host's
/// declaration you opened.
#[test]
fn a_whitespace_command_and_its_split_twin_share_one_cache_row() {
    let joined = cache_key("npx @hypothesi/tauri-mcp-server", &[], &[], None, "stdio");
    let split = cache_key(
        "npx",
        &["@hypothesi/tauri-mcp-server".to_string()],
        &[],
        None,
        "stdio",
    );

    assert_eq!(joined, split);
}

/// The mtime side of freshness is wired: a launch with a real absolute path
/// in it records that file's mtime on the row, which is what lets a
/// floating-tag spec (`npx foo@latest`, whose hash never moves) still be
/// caught changing underneath. Nothing else exercises this end of
/// `freshness::stat_target`.
#[tokio::test]
async fn a_probe_records_the_mtime_of_what_it_launched() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("prefs.db");
    let script = dir.path().join("server.js");
    std::fs::write(&script, "// not run: the interpreter does not exist").unwrap();

    let server = McpServer {
        args: vec![script.to_string_lossy().to_string()],
        ..stdio_server()
    };
    let now = now_ms();

    let out = cached_probe(&db, &server, false, false, now).await;
    assert!(out.result.expect("result").error.is_some(), "the fixture cannot start; the point is the row it leaves");

    let key = cache_key(&server.command, &server.args, &server.env_keys, None, &server.transport);
    let row = get_probe_result(&db, &key).unwrap().expect("row");
    let on_disk = std::fs::metadata(&script)
        .unwrap()
        .modified()
        .unwrap()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;
    assert_eq!(row.launch_mtime, Some(on_disk), "the script's mtime, not the interpreter's and not None");
}
