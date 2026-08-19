//! Persisted probe results: read and write.
//!
//! `probe_results` (v7) was created by an earlier task and had no reader or
//! writer before this file. `put_probe_result`/`get_probe_result` are the
//! store's boundary for it — the same `SanitisedError` shape every other
//! `preferences.rs` accessor uses, keyed by `mcp::identity::launch_hash` so
//! the same launch always lands on the same row.

use std::fs;

use tauri_app_lib::mcp::identity::{launch_hash, normalise_launch};
use tauri_app_lib::mcp::probe::{ProbeResult, ProbedTool};
use tauri_app_lib::preferences::{get_probe_result, put_probe_result};

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn sample_success() -> ProbeResult {
    ProbeResult {
        server_name: Some("demo".to_string()),
        server_version: Some("1.2.3".to_string()),
        protocol_version: Some("2025-06-18".to_string()),
        capabilities: vec!["prompts".to_string(), "tools".to_string()],
        tools: vec![
            ProbedTool {
                name: "search".to_string(),
                description: Some("Searches the index".to_string()),
            },
            ProbedTool {
                name: "no_description".to_string(),
                description: None,
            },
        ],
        error: None,
    }
}

#[test]
fn round_trip_preserves_the_tool_list_and_its_descriptions() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("prefs.db");

    let result = sample_success();
    let before = now_ms();
    put_probe_result(&db_path, "hash-a", &result, Some(604_800_000), Some("session"), Some(1_700_000_000))
        .unwrap();
    let after = now_ms();

    let cached = get_probe_result(&db_path, "hash-a").unwrap().expect("row must exist");

    assert_eq!(cached.result.tools, result.tools, "tool list, including descriptions, must round-trip exactly");
    assert_eq!(cached.result.server_version, result.server_version);
    assert_eq!(cached.result.protocol_version, result.protocol_version);
    assert_eq!(cached.result.capabilities, result.capabilities);
    assert_eq!(cached.result.error, None);
    assert_eq!(cached.ttl_ms, Some(604_800_000));
    assert_eq!(cached.launch_mtime, Some(1_700_000_000));
    // `verified_at` is stamped by `put_probe_result` itself (wall-clock at
    // write time), not supplied by the caller, so it can only be pinned to a
    // window rather than an exact literal. It is also the one field that
    // shares its type (`i64`/`Option<i64>`) with its SELECT-list neighbours
    // `ttl_ms` and `launch_mtime` — a column reordered in the query without
    // the destructuring tuple following would compile clean and silently
    // hand back the wrong value. This bounds check is what would catch that,
    // since nothing else in this test produces a value in this range.
    assert!(
        cached.verified_at >= before && cached.verified_at <= after,
        "verified_at ({}) must fall within [{}, {}], the window put_probe_result ran in",
        cached.verified_at,
        before,
        after
    );
}

#[test]
fn a_second_put_for_the_same_hash_replaces_rather_than_duplicates() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("prefs.db");

    let first = sample_success();
    put_probe_result(&db_path, "hash-b", &first, None, None, None).unwrap();

    let mut second = sample_success();
    second.server_version = Some("9.9.9".to_string());
    second.tools = vec![ProbedTool { name: "only_tool".to_string(), description: None }];
    put_probe_result(&db_path, "hash-b", &second, Some(1_000), None, None).unwrap();

    // Primary key: exactly one row survives, and it holds the SECOND put's
    // values, not a fossil of the first.
    let store = tauri_app_lib::preferences::PreferencesStore::new(&db_path).unwrap();
    let conn = store.connect().unwrap();
    let row_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM probe_results WHERE launch_hash = 'hash-b'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(row_count, 1, "the same launch_hash must never produce two rows");

    let cached = get_probe_result(&db_path, "hash-b").unwrap().expect("row must exist");
    assert_eq!(cached.result.server_version, Some("9.9.9".to_string()));
    assert_eq!(cached.result.tools.len(), 1);
    assert_eq!(cached.result.tools[0].name, "only_tool");
    assert_eq!(cached.ttl_ms, Some(1_000));
}

#[test]
fn get_on_an_unknown_hash_is_ok_none() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("prefs.db");

    // Touch the store once so the database (and the table) exist, without
    // ever writing a row for this hash.
    tauri_app_lib::preferences::PreferencesStore::new(&db_path).unwrap();

    let cached = get_probe_result(&db_path, "never-written").unwrap();
    assert!(cached.is_none(), "an unknown launch_hash must read back as Ok(None), not an error");
}

/// The most important test in this file: a cached FAILURE must stay a
/// failure. A `ProbeResult` carrying `error: Some(..)` is a real, useful
/// result — it's how the panel explains an OAuth-protected endpoint instead
/// of showing an unexplained empty tool list. If a round-trip turns a cached
/// error into an empty tool list with no error, the panel silently lies.
#[test]
fn a_cached_error_round_trips_as_an_error_not_an_empty_tool_list() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("prefs.db");

    let failed = ProbeResult {
        server_name: None,
        server_version: None,
        protocol_version: None,
        capabilities: vec![],
        tools: vec![],
        error: Some(
            "This server is protected by OAuth and refuses the handshake without a token."
                .to_string(),
        ),
    };
    put_probe_result(&db_path, "hash-oauth", &failed, None, None, None).unwrap();

    let cached = get_probe_result(&db_path, "hash-oauth").unwrap().expect("row must exist");

    assert_eq!(
        cached.result.error.as_deref(),
        Some("This server is protected by OAuth and refuses the handshake without a token."),
        "a cached failure must round-trip as an error, not silently become a success"
    );
    assert!(
        cached.result.tools.is_empty(),
        "an empty tool list is expected here, but ONLY alongside the error above, never in its place"
    );
}

/// Step 4: the secret boundary. A launch whose argv carries a credential is
/// hashed (per `mcp::identity::launch_hash`) long before it reaches
/// `put_probe_result` — only the hash, never the raw command line, is ever
/// handed to the writer. `ProbeResult` itself carries only what the server
/// reported: tool names and descriptions, never launch arguments. This test
/// greps the raw database FILE (not a parsed row) for a secret that only
/// ever existed in the launch argv, never in anything the writer persists.
///
/// `put_probe_result` writes `launch_hash` and `cache_scope` to their
/// columns verbatim — neither is validated as looking like a hash. The
/// hazard this test exists to catch is a caller (Task 6 is the first one)
/// that skips hashing and passes the raw launch straight through where a
/// hash belongs. That was proven capable of failing, not just of passing:
/// with `REDACT_ME_1` passed directly as `launch_hash` in place of `&hash`
/// below (simulating exactly that caller mistake), this same test failed —
/// the string reached the `launch_hash` column and the grep caught it. See
/// task-4-report.md for the red transcript. Reverted before commit; an
/// earlier version of this test planted the secret into `tools[0].description`
/// instead, which only proved the grep mechanism works, not that this
/// function's actual boundary (an unvalidated `launch_hash`/`cache_scope`
/// pass-through) is guarded — corrected per review.
#[test]
fn a_probe_result_never_persists_launch_arguments_to_the_database_file() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("prefs.db");

    // The shape a real caller (Task 6) builds: a launch whose argv carries a
    // credential, reduced to a hash before anything touches the store.
    let launch = normalise_launch(
        "node",
        &["--api-key".to_string(), "REDACT_ME_1".to_string()],
        &[],
        None,
    );
    let hash = launch_hash(&launch);
    assert!(!hash.contains("REDACT_ME_1"), "sanity: a SHA-256 hex digest cannot contain the plaintext it hashed");

    // What the server actually reported: tool names/descriptions only, the
    // exact shape `mcp::probe` produces. No launch argument anywhere in it.
    let result = sample_success();
    put_probe_result(&db_path, &hash, &result, None, None, None).unwrap();

    let raw = fs::read(&db_path).expect("database file must exist after a put");
    let raw_str = String::from_utf8_lossy(&raw);
    assert!(
        !raw_str.contains("REDACT_ME_1"),
        "a launch argument reached the probe_results database file"
    );
}
