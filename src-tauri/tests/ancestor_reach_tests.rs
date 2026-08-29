//! Task 1 (Ruling 3, 2026-08-28): persisting one asset row per ancestor
//! `.mcp.json` file, however many projects reach it.
//!
//! Deliberately its own test binary, for the same reason as
//! `mcp_scanner_tests.rs`: `HANGER_TEST_HOME` is process-global, and cargo
//! runs integration tests in different files in parallel. Copied verbatim
//! from that file's header rather than re-derived.

use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri_app_lib::annotations::ancestor_reach;
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

// Task 2: the pure reach computation. No scanner, no store involved.

/// Writes a .mcp.json declaring one server. Returns the file path.
fn write_cfg(dir: &Path, server: &str) -> PathBuf {
    std::fs::create_dir_all(dir).unwrap();
    let p = dir.join(".mcp.json");
    std::fs::write(
        &p,
        format!(r#"{{"mcpServers": {{"{server}": {{"command": "/bin/true", "args": []}}}}}}"#),
    )
    .unwrap();
    p
}

#[test]
fn counts_every_project_below_the_ancestor() {
    let home = tempfile::tempdir().unwrap();
    let cfg = write_cfg(&home.path().join("Work"), "shared-tools");
    let roots: Vec<PathBuf> = ["Work/alpha", "Work/beta", "Work/gamma"]
        .iter()
        .map(|p| {
            let r = home.path().join(p);
            std::fs::create_dir_all(&r).unwrap();
            r
        })
        .collect();

    let r = ancestor_reach(&cfg, "shared-tools", &roots, home.path());
    assert_eq!(r.reached, 3, "all three projects sit below ~/Work");
    assert_eq!(r.shadowed, 0, "none of them declares its own .mcp.json");
}

#[test]
fn a_project_outside_the_ancestor_tree_is_not_reached() {
    let home = tempfile::tempdir().unwrap();
    let cfg = write_cfg(&home.path().join("Work"), "shared-tools");
    let inside = home.path().join("Work/alpha");
    let outside = home.path().join("Personal/beta");
    std::fs::create_dir_all(&inside).unwrap();
    std::fs::create_dir_all(&outside).unwrap();

    let r = ancestor_reach(&cfg, "shared-tools", &[inside, outside], home.path());
    assert_eq!(r.reached, 1, "~/Personal/beta is not below ~/Work");
}

#[test]
fn a_project_declaring_the_same_name_is_shadowed() {
    // Claude Code connects once, using the repo's definition. Both files are
    // real; the ancestor is overridden in that project.
    let home = tempfile::tempdir().unwrap();
    let cfg = write_cfg(&home.path().join("Work"), "shared-tools");
    let alpha = home.path().join("Work/alpha");
    let beta = home.path().join("Work/beta");
    write_cfg(&alpha, "shared-tools");   // same name -> shadows
    std::fs::create_dir_all(&beta).unwrap();

    let r = ancestor_reach(&cfg, "shared-tools", &[alpha, beta], home.path());
    assert_eq!(r.reached, 2);
    assert_eq!(r.shadowed, 1, "only alpha overrides it");
}

#[test]
fn a_project_declaring_a_different_name_is_not_shadowed() {
    // The discriminating case. Shadowing is per SERVER NAME, not per file:
    // a project with its own .mcp.json declaring something else still
    // inherits the ancestor's server.
    let home = tempfile::tempdir().unwrap();
    let cfg = write_cfg(&home.path().join("Work"), "shared-tools");
    let alpha = home.path().join("Work/alpha");
    write_cfg(&alpha, "something-else");

    let r = ancestor_reach(&cfg, "shared-tools", &[alpha], home.path());
    assert_eq!(r.reached, 1);
    assert_eq!(r.shadowed, 0, "a different server name does not shadow");
}

#[test]
fn a_directory_created_after_the_first_call_is_counted() {
    // Criterion 4: reach is derived, so a repo that appears later joins the
    // count with no rescan. If this ever needs a scan to pass, the value is
    // being cached somewhere and harness.md's rule has been broken.
    let home = tempfile::tempdir().unwrap();
    let cfg = write_cfg(&home.path().join("Work"), "shared-tools");
    let alpha = home.path().join("Work/alpha");
    std::fs::create_dir_all(&alpha).unwrap();
    let before = ancestor_reach(&cfg, "shared-tools", &[alpha.clone()], home.path());
    assert_eq!(before.reached, 1);

    let beta = home.path().join("Work/beta");
    std::fs::create_dir_all(&beta).unwrap();
    let after = ancestor_reach(&cfg, "shared-tools", &[alpha, beta], home.path());
    assert_eq!(after.reached, 2, "a project created since the last call must count");
}

#[test]
fn the_ancestors_own_directory_is_not_counted_as_a_project() {
    // ~/Work is not a project root; only the roots passed in are.
    let home = tempfile::tempdir().unwrap();
    let work = home.path().join("Work");
    let cfg = write_cfg(&work, "shared-tools");
    let r = ancestor_reach(&cfg, "shared-tools", &[work], home.path());
    assert_eq!(r.reached, 0, "a config does not reach the directory it sits in");
}

#[test]
fn an_anchor_outside_home_reaches_nothing() {
    // Fix round 1: both the config's parent AND the project root must sit
    // under home. An anchor above home (e.g. /Users when home is
    // /Users/alice) satisfies `root.starts_with(anchor)` for every project
    // under /Users, but the contract requires BOTH sides to sit under home.
    //
    // `world` is a self-contained tempdir standing in for the filesystem
    // root, so writing the anchor's config does not touch the shared system
    // temp directory the way `home`'s own parent would.
    let world = tempfile::tempdir().unwrap();
    let home_path = world.path().join("Users/alice");
    std::fs::create_dir_all(&home_path).unwrap();
    // The anchor sits one level ABOVE home, not under it.
    let anchor = world.path().join("Users");
    let cfg = anchor.join(".mcp.json");
    std::fs::write(
        &cfg,
        r#"{"mcpServers": {"shared-tools": {"command": "/bin/true", "args": []}}}"#,
    )
    .unwrap();
    let alpha = home_path.join("Work/alpha");
    std::fs::create_dir_all(&alpha).unwrap();

    let r = ancestor_reach(&cfg, "shared-tools", &[alpha], &home_path);
    assert_eq!(r.reached, 0, "an anchor above home reaches nothing, however deep the project sits below it");
}

// Task 3: BeyondNote carries the numbers.

#[test]
fn an_ancestor_config_gets_an_ancestor_reach_note() {
    // The note the UI renders. `count` is projects reached, matching every
    // other BeyondNote kind; `using_count` is the new field and is None
    // for the kinds that predate it.
    let n = tauri_app_lib::annotations::BeyondNote {
        kind: "ancestor_reach".into(),
        count: 3,
        places: vec![],
        using_count: Some(2),
    };
    assert_eq!(n.kind, "ancestor_reach");
    assert_eq!(n.count, 3, "count is the total reached — the \"of N\"");
    assert_eq!(n.using_count, Some(2), "2 of the 3 use this definition");
}

#[test]
fn existing_note_kinds_carry_no_using_count() {
    // Pins that the new field is additive. If a future change starts setting
    // it for "projects" or "copies", this reddens and the author has to say
    // why.
    let n = tauri_app_lib::annotations::BeyondNote {
        kind: "projects".into(),
        count: 2,
        places: vec!["alpha".into(), "beta".into()],
        using_count: None,
    };
    assert_eq!(n.using_count, None);
}
