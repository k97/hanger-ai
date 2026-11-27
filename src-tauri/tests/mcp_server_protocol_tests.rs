//! Hanger's own MCP server over stdio: `<binary> mcp`, spoken to as an engine
//! would, in both protocol eras.
//!
//! Each test launches the built binary with `env_clear()` and `HOME` set to a
//! fixture home whose store has finished a scan. The binary reads the real
//! `/` for system-wide config, so nothing here asserts what an engine context
//! holds, only the protocol's shape and the tool names (content is
//! `mcp_server_tests.rs`'s and `mcp_server_boundary_tests.rs`'s job).

use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tauri_app_lib::mcp_server::places::data_dir_for;
use tauri_app_lib::mcp_server::run_from_args;
use tauri_app_lib::preferences::{PreferencesStore, LAST_SCAN_KEY};

const BUILT: &str = env!("CARGO_BIN_EXE_tauri-app");

/// The built binary, copied once to a temp path. Another session's capture
/// script finds its dev app with `pgrep -f target/debug/tauri-app`, so these
/// servers must not run from that path.
fn bin() -> &'static Path {
    static COPY: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();
    COPY.get_or_init(|| {
        let dir = std::env::temp_dir().join(format!("hanger-mcp-protocol-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let copy = dir.join("hanger-mcp-under-test");
        // A hard link costs no space and leaves nothing to clean up; a copy
        // only where the temp dir is on another volume.
        let _ = fs::remove_file(&copy);
        if fs::hard_link(BUILT, &copy).is_err() {
            fs::copy(BUILT, &copy).unwrap();
        }
        copy
    })
}
const TOOLS: [&str; 5] = ["list_engines", "engine_context", "find_assets", "reach", "findings"];

fn scanned_home() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let home = fs::canonicalize(dir.path()).unwrap().join("home");
    let db = data_dir_for(&home).join("hanger.db");
    PreferencesStore::new(&db).unwrap().set_preference(LAST_SCAN_KEY, "1764230000000").unwrap();
    (dir, home)
}

/// One server process and every line it printed on stdout.
struct Session {
    child: Child,
    stdin: Option<ChildStdin>,
    lines: mpsc::Receiver<String>,
    seen: Vec<String>,
}

impl Session {
    fn start(bin: &Path, home: &Path) -> Session {
        let mut child = Command::new(bin)
            .arg("mcp")
            .env_clear()
            .env("HOME", home)
            .env("HANGER_TEST_HOME", home)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        let stdin = child.stdin.take();
        let stdout = child.stdout.take().unwrap();
        let (tx, lines) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if tx.send(line).is_err() {
                    break;
                }
            }
        });
        Session { child, stdin, lines, seen: Vec::new() }
    }

    fn send(&mut self, message: Value) {
        let stdin = self.stdin.as_mut().unwrap();
        writeln!(stdin, "{message}").unwrap();
        stdin.flush().unwrap();
    }

    /// The response to request `id`, skipping anything else the server sends.
    fn reply(&mut self, id: i64) -> Value {
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            let left = deadline.saturating_duration_since(Instant::now());
            let line = self.lines.recv_timeout(left).unwrap_or_else(|_| panic!("no reply to {id}; saw {:?}", self.seen));
            self.seen.push(line.clone());
            let message: Value = serde_json::from_str(&line).unwrap_or_else(|_| panic!("not JSON on stdout: {line}"));
            if message["id"] == id {
                return message;
            }
        }
    }

    fn request(&mut self, id: i64, method: &str, params: Value) -> Value {
        self.send(json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }));
        self.reply(id)
    }

    /// A legacy-era session: `initialize`, then `notifications/initialized`.
    fn initialized(bin: &Path, home: &Path) -> Session {
        let mut s = Session::start(bin, home);
        let init = s.request(
            1,
            "initialize",
            json!({ "protocolVersion": "2025-11-25", "capabilities": {}, "clientInfo": { "name": "test", "version": "0" } }),
        );
        assert!(init.get("result").is_some(), "initialize failed: {init}");
        s.send(json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }));
        s
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn tool_names(list: &Value) -> Vec<String> {
    list["result"]["tools"].as_array().unwrap_or_else(|| panic!("no tools: {list}")).iter().map(|t| t["name"].as_str().unwrap().to_string()).collect()
}

#[test]
fn only_the_mcp_argument_starts_the_server() {
    assert!(run_from_args(&["Hanger AI".to_string()]).is_none());
    assert!(run_from_args(&["Hanger AI".to_string(), "--other".to_string()]).is_none());
}

#[test]
fn a_legacy_client_initializes_lists_and_calls() {
    let (_dir, home) = scanned_home();
    let mut s = Session::initialized(bin(), &home);
    let list = s.request(2, "tools/list", json!({}));
    assert_eq!(tool_names(&list), TOOLS);
    for tool in list["result"]["tools"].as_array().unwrap() {
        assert!(tool["title"].is_string() && tool["description"].is_string(), "{tool}");
        assert_eq!(tool["inputSchema"]["additionalProperties"], false, "{tool}");
    }

    let call = s.request(3, "tools/call", json!({ "name": "list_engines", "arguments": {} }));
    let result = &call["result"];
    assert_eq!(result["isError"], false, "{call}");
    let structured = &result["structuredContent"];
    assert_eq!(structured["as_of_ms"], 1_764_230_000_000i64);
    let text: Value = serde_json::from_str(result["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(&text, structured, "the text block is the structured content");
}

#[test]
fn a_modern_client_discovers_then_lists() {
    let (_dir, home) = scanned_home();
    let mut s = Session::start(bin(), &home);
    let meta = json!({
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientInfo": { "name": "test", "version": "0" },
        "io.modelcontextprotocol/clientCapabilities": {}
    });
    let discover = s.request(1, "server/discover", json!({ "_meta": meta }));
    let versions = discover["result"]["supportedVersions"].as_array().unwrap_or_else(|| panic!("{discover}"));
    assert!(versions.contains(&json!("2026-07-28")), "{discover}");
    let list = s.request(2, "tools/list", json!({ "_meta": meta }));
    assert_eq!(tool_names(&list), TOOLS);
}

#[test]
fn hangers_own_probe_measures_hangers_own_server() {
    let probed = tokio::runtime::Runtime::new()
        .unwrap()
        .block_on(tauri_app_lib::mcp::probe::probe(bin().to_str().unwrap(), &["mcp".to_string()], Duration::from_secs(10)));
    assert_eq!(probed.error, None);
    let names: Vec<&str> = probed.tools.iter().map(|t| t.name.as_str()).collect();
    assert_eq!(names, TOOLS);
}

#[test]
fn a_refusal_is_a_tool_error_not_a_protocol_error() {
    let (_dir, home) = scanned_home();
    let mut s = Session::initialized(bin(), &home);
    let call = s.request(2, "tools/call", json!({ "name": "find_assets", "arguments": { "query": "x", "limit": 0 } }));
    assert!(call.get("error").is_none(), "{call}");
    assert_eq!(call["result"]["isError"], true, "{call}");
    assert_eq!(call["result"]["content"][0]["text"], FIND_ASSETS_ARGS);
}

#[test]
fn every_stdout_line_is_one_json_rpc_message() {
    let (_dir, home) = scanned_home();
    let mut s = Session::initialized(bin(), &home);
    s.request(2, "tools/list", json!({}));
    s.request(3, "tools/call", json!({ "name": "list_engines", "arguments": {} }));
    s.request(4, "tools/call", json!({ "name": "findings", "arguments": {} }));
    drop(s.stdin.take());
    let deadline = Instant::now() + Duration::from_secs(5);
    while let Ok(line) = s.lines.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
        s.seen.push(line);
    }
    assert!(s.seen.len() >= 4, "{:?}", s.seen);
    for line in &s.seen {
        let message: Value = serde_json::from_str(line).unwrap_or_else(|_| panic!("not JSON: {line}"));
        assert!(message.is_object() && message["jsonrpc"] == "2.0", "{line}");
    }
}

#[test]
fn the_server_exits_when_stdin_closes() {
    let (_dir, home) = scanned_home();
    let mut s = Session::initialized(bin(), &home);
    drop(s.stdin.take());
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        if let Some(status) = s.child.try_wait().unwrap() {
            assert!(status.success(), "{status}");
            return;
        }
        assert!(Instant::now() < deadline, "still running 2 s after stdin closed");
        std::thread::sleep(Duration::from_millis(20));
    }
}

#[test]
fn the_server_launches_from_a_path_with_a_space() {
    let dir = tempfile::tempdir().unwrap();
    let bin = dir.path().join("Hanger AI").join("Hanger AI");
    fs::create_dir_all(bin.parent().unwrap()).unwrap();
    fs::copy(BUILT, &bin).unwrap();
    let probed = tokio::runtime::Runtime::new()
        .unwrap()
        .block_on(tauri_app_lib::mcp::probe::probe(bin.to_str().unwrap(), &["mcp".to_string()], Duration::from_secs(10)));
    assert_eq!(probed.error, None);
    assert_eq!(probed.tools.len(), TOOLS.len());
}

// ---- Arguments, unknown tools and the rate limit, over the protocol.

const LIST_ENGINES_ARGS: &str = "Those arguments don't fit list_engines. It takes none.";
const FINDINGS_ARGS: &str = "Those arguments don't fit findings. It takes none.";
const ENGINE_CONTEXT_ARGS: &str = "Those arguments don't fit engine_context. It takes engine_id, an id from list_engines.";
const FIND_ASSETS_ARGS: &str = "Those arguments don't fit find_assets. It takes query, the text to search for, and an optional limit from 1 to 50.";
const REACH_ARGS: &str = "Those arguments don't fit reach. It takes asset_path, a path as find_assets returns it.";

/// A scanned store holding one global skill, and a Codex config declaring
/// one server, so `engine_context` and `reach` have something real to say.
fn home_with_data() -> (tempfile::TempDir, PathBuf) {
    let (dir, home) = scanned_home();
    fs::create_dir_all(home.join(".codex")).unwrap();
    fs::write(home.join(".codex/config.toml"), "[mcp_servers.alpha]\ncommand = \"alpha-server\"\n").unwrap();
    let skill = home.join(".agents/skills/solo");
    fs::create_dir_all(&skill).unwrap();
    let store = PreferencesStore::new(&data_dir_for(&home).join("hanger.db")).unwrap();
    let root = store.upsert_root("engine_global", home.join(".agents").to_str().unwrap(), None, ".agents", 1).unwrap();
    store.upsert_asset(root, None, "skill", "global", "solo", skill.to_str().unwrap(), None, None, "ok", None, 1, 1).unwrap();
    (dir, home)
}

/// A tool error carrying `text`, never a protocol error.
fn assert_tool_error(call: &Value, text: &str) {
    assert!(call.get("error").is_none(), "a protocol error: {call}");
    assert_eq!(call["result"]["isError"], true, "{call}");
    assert_eq!(call["result"]["content"][0]["text"], text, "{call}");
}

fn call(s: &mut Session, id: i64, name: &str, arguments: Value) -> Value {
    s.request(id, "tools/call", json!({ "name": name, "arguments": arguments }))
}

#[test]
fn an_unknown_key_is_a_tool_error_naming_what_the_tool_takes() {
    let (_dir, home) = home_with_data();
    let mut s = Session::initialized(bin(), &home);
    let r = call(&mut s, 2, "engine_context", json!({ "engine_id": "codex", "extra": 1 }));
    assert_tool_error(&r, ENGINE_CONTEXT_ARGS);
}

#[test]
fn a_misspelled_key_is_refused_for_every_tool() {
    let (_dir, home) = home_with_data();
    let mut s = Session::initialized(bin(), &home);
    let cases = [
        ("list_engines", json!({ "engine": "codex" }), LIST_ENGINES_ARGS),
        ("findings", json!({ "scope": "global" }), FINDINGS_ARGS),
        ("engine_context", json!({ "engine": "codex" }), ENGINE_CONTEXT_ARGS),
        ("find_assets", json!({ "querry": "solo" }), FIND_ASSETS_ARGS),
        ("reach", json!({ "assetpath": "~/.agents/skills/solo" }), REACH_ARGS),
    ];
    for (i, (name, args, text)) in cases.into_iter().enumerate() {
        let r = call(&mut s, 10 + i as i64, name, args);
        assert_tool_error(&r, text);
    }
}

#[test]
fn a_wrong_type_or_an_out_of_range_limit_is_a_tool_error() {
    let (_dir, home) = home_with_data();
    let mut s = Session::initialized(bin(), &home);
    assert_tool_error(&call(&mut s, 2, "engine_context", json!({ "engine_id": 7 })), ENGINE_CONTEXT_ARGS);
    assert_tool_error(&call(&mut s, 3, "find_assets", json!({ "query": "solo", "limit": "5" })), FIND_ASSETS_ARGS);
    assert_tool_error(&call(&mut s, 4, "find_assets", json!({ "query": "solo", "limit": 51 })), FIND_ASSETS_ARGS);
    assert_tool_error(&call(&mut s, 5, "reach", json!({})), REACH_ARGS);
}

#[test]
fn the_find_assets_limit_is_bounded_in_the_schema() {
    let (_dir, home) = scanned_home();
    let mut s = Session::initialized(bin(), &home);
    let list = s.request(2, "tools/list", json!({}));
    let find = list["result"]["tools"].as_array().unwrap().iter().find(|t| t["name"] == "find_assets").unwrap().clone();
    let limit = &find["inputSchema"]["properties"]["limit"];
    assert_eq!(limit["type"], "integer", "{find}");
    assert_eq!(limit["minimum"], 1, "{find}");
    assert_eq!(limit["maximum"], 50, "{find}");
    assert_eq!(find["inputSchema"]["required"], json!(["query"]), "{find}");
}

#[test]
fn an_unknown_tool_is_a_protocol_error_naming_it() {
    let (_dir, home) = scanned_home();
    let mut s = Session::initialized(bin(), &home);
    let r = call(&mut s, 2, "nope", json!({}));
    assert!(r.get("result").is_none(), "{r}");
    assert_eq!(r["error"]["message"], "Unknown tool: nope", "{r}");
}

#[test]
fn the_thirty_first_call_in_ten_seconds_is_told_to_slow_down() {
    let (_dir, home) = scanned_home();
    let mut s = Session::initialized(bin(), &home);
    for id in 0..30 {
        let r = call(&mut s, 100 + id, "findings", json!({}));
        assert_eq!(r["result"]["isError"], false, "call {id}: {r}");
    }
    let r = call(&mut s, 200, "findings", json!({}));
    assert_tool_error(&r, "More than 30 calls in 10 seconds. Wait a few seconds, then try again.");
}

#[test]
fn engine_context_and_reach_answer_over_the_protocol() {
    let (_dir, home) = home_with_data();
    let mut s = Session::initialized(bin(), &home);
    let ctx = call(&mut s, 2, "engine_context", json!({ "engine_id": "codex" }));
    assert_eq!(ctx["result"]["isError"], false, "{ctx}");
    let names: Vec<&str> = ctx["result"]["structuredContent"]["result"]["items"].as_array().unwrap().iter().map(|i| i["name"].as_str().unwrap()).collect();
    assert_eq!(names, ["alpha"], "{ctx}");
    let reach = call(&mut s, 3, "reach", json!({ "asset_path": "~/.agents/skills/solo" }));
    assert_eq!(reach["result"]["isError"], false, "{reach}");
    assert_eq!(reach["result"]["structuredContent"]["result"]["asset_path"], "~/.agents/skills/solo", "{reach}");
}
