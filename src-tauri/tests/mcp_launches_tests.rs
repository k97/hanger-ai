//! Opening an MCP server panel reads the last scan's launches instead of
//! rescanning.
//!
//! `get_mcp_processes` used to run `run_scan` on every call: a full writing
//! scan of every linked directory, queued behind any scan already running,
//! each time a server panel opened. Now `start_scan` records
//! `(registration_key, command, args)` for every tool of the inventory it
//! finished with (`McpLaunches::record`), and the panel's read path
//! (`mcp_processes_from`) matches running processes against that.
//!
//! Its own test binary: it sets `HANGER_TEST_HOME`, which is process-global,
//! and cargo gives each test file its own process. `ENV_MUTEX` serialises the
//! tests in this file, which point it at different temp homes.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, SystemTime};
use tauri_app_lib::domain::Inventory;
use tauri_app_lib::mcp::observe::RunningProcess;
use tauri_app_lib::preferences::PreferencesStore;
use tauri_app_lib::scanner::{scan_targets, DirectoryScanner};
use tauri_app_lib::{mcp_processes_from, McpLaunch, McpLaunches};

static ENV_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();

/// Clears `HANGER_TEST_HOME` on drop, including on panic.
struct TestHome;
impl Drop for TestHome {
    fn drop(&mut self) {
        std::env::remove_var("HANGER_TEST_HOME");
    }
}

struct Fixture {
    _home: tempfile::TempDir,
    _project: tempfile::TempDir,
    project: PathBuf,
    db: tempfile::TempDir,
}

impl Fixture {
    fn db_path(&self) -> PathBuf {
        self.db.path().join("hanger.db")
    }

    fn scanner(&self) -> DirectoryScanner {
        DirectoryScanner {
            db_path: self.db_path(),
            cancellation_token: Arc::new(AtomicBool::new(false)),
        }
    }

    /// The targets `start_scan` builds: `""` for the machine, then each
    /// linked directory.
    fn start_scan_targets(&self) -> Vec<PathBuf> {
        let store = PreferencesStore::new(&self.db_path()).unwrap();
        let mut targets = vec![PathBuf::from("")];
        targets.extend(store.get_linked_directories().unwrap().into_iter().map(PathBuf::from));
        targets
    }

    /// What `run_scan` scans: the linked directories, and no `""` target.
    fn run_scan(&self) -> Result<Inventory, String> {
        let store = PreferencesStore::new(&self.db_path()).map_err(|e| e.to_string())?;
        let targets: Vec<PathBuf> = store
            .get_linked_directories()
            .map_err(|e| e.to_string())?
            .into_iter()
            .map(PathBuf::from)
            .collect();
        scan_targets(&self.scanner(), &targets, |_, _, _| {}).map_err(|e| e.to_string())
    }

    /// A completed `start_scan`: scan, then record the launches.
    fn start_scan(&self, launches: &McpLaunches) -> Inventory {
        let inventory = scan_targets(&self.scanner(), &self.start_scan_targets(), |_, _, _| {}).unwrap();
        launches.record(&inventory);
        inventory
    }
}

/// A temp home whose `~/.claude.json` declares `alpha`, and a project whose
/// `.mcp.json` declares `beta`. The project is linked only when `link` is set.
fn fixture(link: bool) -> Fixture {
    for var in ["CLAUDE_CONFIG_DIR", "CODEX_HOME", "COPILOT_HOME"] {
        std::env::remove_var(var);
    }
    let home = tempfile::tempdir().unwrap();
    fs::create_dir_all(home.path().join(".claude")).unwrap();
    fs::write(home.path().join(".claude/CLAUDE.md"), "# Global rules\n").unwrap();
    fs::write(
        home.path().join(".claude.json"),
        r#"{"mcpServers":{"alpha":{"command":"node","args":["alpha-server.js","--port","4100"]}}}"#,
    )
    .unwrap();

    let project_dir = tempfile::tempdir().unwrap();
    let project = project_dir.path().join("repo");
    fs::create_dir_all(&project).unwrap();
    fs::write(
        project.join(".mcp.json"),
        r#"{"mcpServers":{"beta":{"command":"uvx","args":["beta-mcp"]}}}"#,
    )
    .unwrap();

    std::env::set_var("HANGER_TEST_HOME", home.path());

    let db = tempfile::tempdir().unwrap();
    let f = Fixture { _home: home, _project: project_dir, project, db };
    let store = PreferencesStore::new(&f.db_path()).unwrap();
    if link {
        store.link_directory(&f.project.to_string_lossy()).unwrap();
    }
    f
}

fn launches_of(inventory: &Inventory) -> Vec<McpLaunch> {
    inventory
        .tools
        .iter()
        .map(|t| (t.registration_key().to_string(), t.command.clone(), t.args.clone()))
        .collect()
}

fn key_of(inventory: &Inventory, name: &str) -> String {
    inventory
        .tools
        .iter()
        .find(|t| t.name == name)
        .unwrap_or_else(|| panic!("no tool named {name} in the inventory"))
        .registration_key()
        .to_string()
}

fn process(pid: u32, command_line: &str) -> RunningProcess {
    RunningProcess {
        pid,
        parent_pid: 1,
        command_line: command_line.to_string(),
        spawning_host: Some("Claude Code".to_string()),
    }
}

/// Every table's row count, by name.
fn row_counts(db: &Path) -> Vec<(String, i64)> {
    let conn = rusqlite::Connection::open(db).unwrap();
    let tables: Vec<String> = conn
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    tables
        .into_iter()
        .map(|t| {
            let n: i64 = conn
                .query_row(&format!("SELECT count(*) FROM \"{}\"", t.replace('"', "\"\"")), [], |r| r.get(0))
                .unwrap();
            (t, n)
        })
        .collect()
}

fn mtime(db: &Path) -> SystemTime {
    fs::metadata(db).unwrap().modified().unwrap()
}

#[test]
fn a_completed_scan_records_every_tools_launch_under_its_registration_key() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap_or_else(|e| e.into_inner());
    let _home = TestHome;
    let f = fixture(true);
    let launches = McpLaunches::default();

    let inventory = f.start_scan(&launches);

    let names: Vec<&str> = inventory.tools.iter().map(|t| t.name.as_str()).collect();
    assert!(names.contains(&"alpha"), "the machine-level server is in the inventory: {names:?}");
    assert!(names.contains(&"beta"), "the linked project's server is in the inventory: {names:?}");
    let expected = launches_of(&inventory);
    assert!(
        expected.iter().any(|(_, _, args)| args == &["alpha-server.js", "--port", "4100"]),
        "the fixture carries real launch arguments, so a dropped `args` would show"
    );
    assert_eq!(
        launches.last_scan(),
        Some(expected),
        "the recorded launches are the inventory's tools: Tool::registration_key, command, args"
    );
}

#[test]
fn reading_the_launches_writes_nothing_to_the_store() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap_or_else(|e| e.into_inner());
    let _home = TestHome;
    let f = fixture(true);
    let launches = McpLaunches::default();
    let inventory = f.start_scan(&launches);

    let counts_before = row_counts(&f.db_path());
    let mtime_before = mtime(&f.db_path());
    // The store file's mtime has nanosecond resolution on APFS; the pause
    // keeps a write inside this test from landing in the same tick.
    std::thread::sleep(Duration::from_millis(50));

    let procs = [process(41, "node alpha-server.js --port 4100"), process(42, "uvx beta-mcp")];
    let matches = mcp_processes_from(&launches, &procs, || f.run_scan()).unwrap();

    assert_eq!(mtime(&f.db_path()), mtime_before, "opening a panel must not write the store");
    assert_eq!(row_counts(&f.db_path()), counts_before, "opening a panel must not change any table");

    let keys: Vec<Vec<String>> = matches.iter().map(|m| m.registration_keys.clone()).collect();
    assert_eq!(
        keys,
        vec![vec![key_of(&inventory, "alpha")], vec![key_of(&inventory, "beta")]],
        "each process matches the registration that declares its launch"
    );
}

#[test]
fn before_any_scan_has_completed_the_panel_rescans() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap_or_else(|e| e.into_inner());
    let _home = TestHome;
    let f = fixture(true);
    let launches = McpLaunches::default();
    assert_eq!(launches.last_scan(), None, "nothing is recorded before a scan completes");

    let mut rescanned = None;
    let procs = [process(42, "uvx beta-mcp")];
    let matches = mcp_processes_from(&launches, &procs, || {
        let inv = f.run_scan()?;
        rescanned = Some(inv.clone());
        Ok(inv)
    })
    .unwrap();

    let inventory = rescanned.expect("with nothing recorded, the panel falls back to run_scan");
    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0].registration_keys, vec![key_of(&inventory, "beta")]);
}

/// The defect this removes: `run_scan` scans the linked directories only, and
/// `scan_targets` over no targets returns an empty inventory. So with no
/// directory linked, `get_mcp_processes` saw no tools at all and called every
/// running server unaccounted for. `start_scan` always scans `""` first.
#[test]
fn with_no_directory_linked_the_machine_servers_are_still_matched() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap_or_else(|e| e.into_inner());
    let _home = TestHome;
    let f = fixture(false);

    let old_path = f.run_scan().unwrap();
    assert!(old_path.tools.is_empty(), "the old path, recorded: run_scan with nothing linked finds no tools");

    let launches = McpLaunches::default();
    let inventory = f.start_scan(&launches);
    let procs = [process(41, "node alpha-server.js --port 4100")];
    let matches = mcp_processes_from(&launches, &procs, || f.run_scan()).unwrap();

    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0].registration_keys, vec![key_of(&inventory, "alpha")]);
}
