//! Scanner integration for MCP discovery.
//!
//! Deliberately a separate test binary. `HANGER_TEST_HOME` is a process-global
//! env var, and cargo runs integration tests in parallel within a binary. The
//! ENV_MUTEX in scanner_tests.rs only appears to protect it — every test there
//! sets the *same* home, so interleaving is invisible. A test pointing at a
//! different home makes the race real and corrupts unrelated tests.
//!
//! Cargo gives each test file its own process, so these tests can own the
//! variable outright without touching anyone else's.

use std::path::Path;
use std::sync::{Mutex, OnceLock};
use tauri_app_lib::domain::Scope;
use tauri_app_lib::scanner::{DirectoryScanner, Scanner};

static ENV_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();

/// Restores HANGER_TEST_HOME on drop, including on panic.
///
/// The variable is process-global. Every other test in this file either sets it
/// to `tests/fixtures/home` or inherits that value from a test that ran before
/// it, so a test pointing it somewhere else must put it back or it silently
/// corrupts whatever runs next.
struct TestHome;
impl Drop for TestHome {
    fn drop(&mut self) {
        std::env::set_var("HANGER_TEST_HOME", "tests/fixtures/home");
    }
}

/// The five MCP-only hosts have no agent config root, so the per-agent
/// filename sweep can never reach them. Only the registry pass does.
#[test]
fn scanner_surfaces_mcp_only_hosts_via_the_registry() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();
    let _home = TestHome;
    std::env::set_var("HANGER_TEST_HOME", "tests/fixtures/mcp_home");

    let dir = tempfile::tempdir().unwrap();
    let scanner = DirectoryScanner {
        db_path: dir.path().join("hanger.db"),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    let inventory = scanner.scan(Path::new("tests/fixtures/project")).unwrap();

    let global: Vec<&str> = inventory
        .tools
        .iter()
        .filter(|t| matches!(t.scope, Scope::Global { .. }))
        .map(|t| t.name.as_str())
        .collect();

    // Under ~/Library, which the directory walk excludes outright.
    assert!(global.contains(&"figma"), "VS Code server missing: {:?}", global);
    assert!(global.contains(&"spades-audio"), "Claude Desktop server missing: {:?}", global);
    // In ~/.claude.json -- beside the agent config dir, never inside it.
    assert!(global.contains(&"chrome-devtools"), "user-scope server missing: {:?}", global);
    // Behind the plugin-marketplace glob.
    assert!(global.contains(&"github"), "plugin server missing: {:?}", global);

    // spades-audio is declared three times: twice by Claude Code
    // (~/.claude/mcp.json via the sweep, ~/.claude.json via the registry) and
    // once by Claude Desktop. Three registrations, three rows -- cross-host
    // coverage is the feature, and duplicate registration within one host is a
    // real condition worth showing, not noise to collapse.
    //
    // This mirrors the development machine exactly, which is why the panel
    // study in docs/hanger-mcp-panel.html shows three rows for this server.
    let spades: Vec<&str> = inventory
        .tools
        .iter()
        .filter(|t| t.name == "spades-audio")
        .map(|t| t.config_path.as_str())
        .collect();
    assert_eq!(spades.len(), 3, "expected three spades-audio registrations, got {:?}", spades);
}

/// Local tier lives in a machine-level file but belongs to a repository, so it
/// must not appear in the profile's global list.
#[test]
fn local_tier_servers_do_not_leak_into_global_scope() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();
    let _home = TestHome;
    std::env::set_var("HANGER_TEST_HOME", "tests/fixtures/mcp_home");

    let dir = tempfile::tempdir().unwrap();
    let scanner = DirectoryScanner {
        db_path: dir.path().join("hanger.db"),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    let inventory = scanner.scan(Path::new("tests/fixtures/project")).unwrap();

    let global: Vec<&str> = inventory
        .tools
        .iter()
        .filter(|t| matches!(t.scope, Scope::Global { .. }))
        .map(|t| t.name.as_str())
        .collect();

    assert!(!global.contains(&"repo-local"), "local-tier server leaked into global: {:?}", global);
    assert!(!global.contains(&"stray"), "local-tier server leaked into global: {:?}", global);
}

/// The full data path: config file -> dialect -> Tool -> frontend.
///
/// Without this, `command` reaches the panel and `args` do not, and the Verify
/// probe starts the wrong process. Tests of the probe alone cannot catch it --
/// they supply args by hand.
#[test]
fn a_scanned_tool_carries_the_arguments_its_command_needs() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();
    let _home = TestHome;
    std::env::set_var("HANGER_TEST_HOME", "tests/fixtures/mcp_home");

    let dir = tempfile::tempdir().unwrap();
    let scanner = DirectoryScanner {
        db_path: dir.path().join("hanger.db"),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    let inventory = scanner.scan(Path::new("tests/fixtures/project")).unwrap();

    let spades = inventory
        .tools
        .iter()
        .find(|t| t.name == "spades-audio" && t.config_path.ends_with(".claude.json"))
        .expect("spades-audio from ~/.claude.json");

    assert_eq!(spades.command, "node");
    assert_eq!(
        spades.args,
        vec!["/Applications/Spades Audio.app/Contents/Resources/mcp-server/dist/index.js"],
        "a command without its arguments starts the wrong process"
    );
}

/// Connectors must reach the profile like any other global server.
#[test]
fn claude_ai_connectors_reach_the_global_inventory() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();
    let _home = TestHome;
    std::env::set_var("HANGER_TEST_HOME", "tests/fixtures/mcp_home");

    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("hanger.db");
    let scanner = DirectoryScanner {
        db_path: db.clone(),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    let inventory = scanner.scan(Path::new("tests/fixtures/project")).unwrap();

    let global: Vec<&str> = inventory
        .tools
        .iter()
        .filter(|t| matches!(t.scope, Scope::Global { .. }))
        .map(|t| t.name.as_str())
        .collect();
    assert!(global.contains(&"Notion"), "connector missing from inventory: {:?}", global);

    // And it must be COUNTED, not merely listed. get_asset_counts reads the
    // database; if the row never lands there the pane renders more rows than
    // its own heading claims.
    let conn = rusqlite::Connection::open(&db).unwrap();
    let persisted: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM assets WHERE category='tool' AND name='Notion'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(persisted, 1, "connector discovered but never persisted");
}

/// Diagnostic against the REAL home directory, not a fixture.
///
/// #[ignore] because it depends on the developer's own machine. Run when the
/// app disagrees with the database:
///   cargo test --test mcp_scanner_tests -- --ignored --nocapture real_home
#[test]
#[ignore]
fn real_home_profile_inventory() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();
    std::env::remove_var("HANGER_TEST_HOME");

    let dir = tempfile::tempdir().unwrap();
    let scanner = DirectoryScanner {
        db_path: dir.path().join("hanger.db"),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    let inventory = scanner.scan(Path::new("/Users/karthik/Work/Labs/hanger-ai")).unwrap();

    let mut global: Vec<(&str, &str)> = inventory
        .tools
        .iter()
        .filter(|t| matches!(t.scope, Scope::Global { .. }))
        .map(|t| (t.name.as_str(), t.transport.as_str()))
        .collect();
    global.sort();
    println!("GLOBAL TOOLS IN INVENTORY: {}", global.len());
    for (n, tr) in &global {
        println!("  {:<24} {}", n, tr);
    }
}

/// The merge step run_scan applies after combining per-root inventories.
///
/// Every other test in this file calls scanner.scan() directly and therefore
/// never reaches this code. That gap let a dedup keyed on config_path survive
/// here long after the same bug was fixed in the frontend: the database held 23
/// servers, the pane's own heading said 23, and seven rows rendered -- one per
/// config FILE.
#[test]
fn merging_scans_keeps_every_server_not_one_per_config_file() {
    use tauri_app_lib::domain::{Inventory, Scope, Tool};

    let tool = |name: &str, path: &str| Tool {
        id: format!("{}-{}", path, name),
        name: name.to_string(),
        command: "node".to_string(),
        args: vec![],
        launch_display: String::new(),
        transport: "stdio".to_string(),
        config_path: path.to_string(),
        scope: Scope::Global { agent: "claude-code".to_string() },
        owning_agent: "claude-code".to_string(),
        drifted: None,
        is_symlink: None,
        source_path: None,
        parse_status: Some("ok".to_string()),
        parse_error: None,
        link_state: None,
    };

    let mut inv = Inventory::default();
    // One file declaring three servers -- the real shape of ~/.codex/config.toml
    // and of ~/.claude.json.
    inv.tools.push(tool("node_repl", "/home/.codex/config.toml"));
    inv.tools.push(tool("computer-use", "/home/.codex/config.toml"));
    inv.tools.push(tool("tauri", "/home/.codex/config.toml"));
    // A genuine duplicate from scanning two roots: same file, same server.
    inv.tools.push(tool("node_repl", "/home/.codex/config.toml"));

    tauri_app_lib::dedupe_combined(&mut inv);

    let mut names: Vec<&str> = inv.tools.iter().map(|t| t.name.as_str()).collect();
    names.sort();
    assert_eq!(
        names,
        vec!["computer-use", "node_repl", "tauri"],
        "a config file is not an asset; each server in it is"
    );
}

#[test]
fn a_tool_carries_a_redacted_launch_for_display() {
    // Spec §4.1: the panel renders this string instead of joining args, so the
    // redaction happens once, in Rust, rather than at each render site.
    use tauri_app_lib::mcp::dialect::McpServer;
    use tauri_app_lib::mcp::discover::Registration;
    use tauri_app_lib::mcp::registry::ScopeTier;

    let reg = Registration {
        server: McpServer {
            name: "protected".to_string(),
            command: "npx".to_string(),
            args: vec![
                "mcp-remote".to_string(),
                "https://example.com/sse".to_string(),
                "--header".to_string(),
                "Authorization: Bearer REDACT_ME_1".to_string(),
            ],
            transport: "stdio".to_string(),
            env_keys: vec![],
            project_root: None,
            bridged: false,
        },
        host_id: "claude-code",
        tier: ScopeTier::Global,
        config_path: "/tmp/mcp.json".to_string(),
    };

    let tool = tauri_app_lib::scanner::tool_from_registration(
        &reg,
        tauri_app_lib::domain::Scope::Global { agent: "claude-code".to_string() },
    );

    assert!(!tool.launch_display.contains("REDACT_ME_1"));
    assert!(tool.launch_display.contains("Authorization: <redacted>"));
    assert!(tool.launch_display.starts_with("npx mcp-remote"));
}
