//! Task 1 (Ruling 3, 2026-08-28): persisting one asset row per ancestor
//! `.mcp.json` file, however many projects reach it.
//!
//! Deliberately its own test binary, for the same reason as
//! `mcp_scanner_tests.rs`: `HANGER_TEST_HOME` is process-global, and cargo
//! runs integration tests in different files in parallel. Copied verbatim
//! from that file's header rather than re-derived.

use std::sync::{Mutex, OnceLock};
use tauri_app_lib::scanner::{DirectoryScanner, Scanner};

static ENV_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();

/// Restores HANGER_TEST_HOME on drop, including on panic. See
/// mcp_scanner_tests.rs for why this matters.
struct TestHome;
impl Drop for TestHome {
    fn drop(&mut self) {
        std::env::set_var("HANGER_TEST_HOME", "tests/fixtures/home");
    }
}

/// One ancestor config file is one asset row, however many projects
/// underneath it are scanned.
///
/// `DirectoryScanner::scan` (see `mcp_scanner_tests.rs`) takes one project
/// root at a time and has no built-in notion of "scan several projects at
/// once" -- every existing test in that file calls `.scan()` exactly once.
/// No sibling test registers multiple project roots, so this loops
/// `scanner.scan()` once per project against the same database, mirroring
/// the shape `run_scan` (`lib.rs`) uses over `get_linked_directories()`.
#[test]
fn an_ancestor_config_yields_one_row_however_many_projects_it_reaches() {
    // Ruling 3, 2026-08-28: one asset row per config FILE, not per reached
    // project. assets.abs_path is UNIQUE NOT NULL, so N rows is forbidden by
    // the schema; reach is derived at read time instead (Task 2).
    let _lock = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap_or_else(|e| e.into_inner());
    let _restore = TestHome;
    let home_dir = tempfile::tempdir().unwrap();
    // Canonicalised, not the raw tempdir path: on macOS a tempdir sits under
    // `/var/folders/...`, a symlink to `/private/var/folders/...`.
    // `discover_repo_ancestors` checks `repo_root.starts_with(home)` against
    // `project_path_abs`, which the scanner builds via `fs::canonicalize` —
    // so a raw, non-canonical `HANGER_TEST_HOME` never matches and every
    // ancestor walk here returns nothing, silently.
    let home = std::fs::canonicalize(home_dir.path()).unwrap();
    std::env::set_var("HANGER_TEST_HOME", &home);

    // An empty `.claude` directory is enough for Claude Code to be detected
    // as installed (`AGENT_CONFIGS`'s `global_roots`), which is what gives
    // the ancestor registration an `engine_global` root to attach to.
    // Without it `agent_root_ids` has no entry for "claude-code" and the new
    // code's `continue` (a correct skip for an MCP-only host) would skip
    // this row too, for an unrelated reason.
    std::fs::create_dir_all(home.join(".claude")).unwrap();

    for p in ["Work/alpha", "Work/beta", "Work/gamma"] {
        std::fs::create_dir_all(home.join(p).join(".git")).unwrap();
    }
    std::fs::write(
        home.join("Work/.mcp.json"),
        r#"{"mcpServers": {"shared-tools": {"command": "/bin/true", "args": []}}}"#,
    )
    .unwrap();

    // Scan with all three projects registered, then read the store back.
    // Copies the invocation shape from tests/mcp_scanner_tests.rs -- same
    // DirectoryScanner construction, same `.scan(Path::new(..))` call --
    // looped once per project root against one shared database, the same
    // way `run_scan` loops `scanner.scan()` over `get_linked_directories()`.
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("hanger.db");
    let scanner = DirectoryScanner {
        db_path: db_path.clone(),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    for p in ["Work/alpha", "Work/beta", "Work/gamma"] {
        let root = home.join(p);
        scanner.scan(&root).unwrap();
    }

    let conn = rusqlite::Connection::open(&db_path).unwrap();
    let mut stmt = conn
        .prepare("SELECT abs_path FROM assets WHERE name = 'shared-tools'")
        .unwrap();
    let rows: Vec<String> = stmt
        .query_map([], |r| r.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    assert_eq!(
        rows.len(),
        1,
        "one ancestor config is ONE row regardless of how many projects it reaches — got {:?}",
        rows
    );
}
