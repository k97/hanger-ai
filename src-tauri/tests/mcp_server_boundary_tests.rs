//! What leaves Hanger's own MCP server. Its five read tools are called over a
//! fixture that carries a marker in every place a secret or untrusted text
//! could sit: a server's command, argument, env name and env value, a skill's
//! description and body, a parser's message, and a measured tool's
//! description. No reply may carry any of them, or the fixture home in either
//! spelling, and every path a reply carries starts with `~/`.
//!
//! Each fixture runs in a child of this test binary (`child_call`) with
//! `env_clear()` and `HOME` set to the fixture home, so a raw home in a reply
//! is the fixture's and can be seen.

use std::fs;
use std::path::PathBuf;
use std::process::Command;

use serde_json::{json, Value};
use tauri_app_lib::domain::{Inventory, Scope, Skill};
use tauri_app_lib::mcp::probe::ProbedTool;
use tauri_app_lib::mcp_server::places::{data_dir_for, server_places_at};
use tauri_app_lib::mcp_server::tools;
use tauri_app_lib::preferences::{PreferencesStore, LAST_SCAN_KEY};
use tauri_app_lib::search::{index_inventory, index_probe_tools};

// The four switch markers `ipc_boundary_tests.rs` uses.
const SWITCH_COMMAND: &str = "switch-marker-command";
const SWITCH_ARG: &str = "switch-marker-arg";
const SWITCH_ENV_NAME: &str = "SWITCH_MARKER_SETTING";
const SWITCH_ENV_VALUE: &str = "switch-marker-env-value";
// One token each, so a search snippet that highlights one still carries it
// whole.
const SKILL_MARKER: &str = "skillbodymarker";
const PARSE_MARKER: &str = "parsemessagemarker";
const TOOL_MARKER: &str = "tooldescmarker";
const MARKERS: [&str; 7] = [SWITCH_COMMAND, SWITCH_ARG, SWITCH_ENV_NAME, SWITCH_ENV_VALUE, SKILL_MARKER, PARSE_MARKER, TOOL_MARKER];

struct Fixture {
    dir: tempfile::TempDir,
    home: PathBuf,
    system: PathBuf,
    db: PathBuf,
}

fn bare() -> Fixture {
    let dir = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(dir.path()).unwrap();
    let home = root.join("home");
    let system = root.join("system");
    fs::create_dir_all(&home).unwrap();
    fs::create_dir_all(&system).unwrap();
    let db = data_dir_for(&home).join("hanger.db");
    Fixture { dir, home, system, db }
}

/// Every marker in place, and a store whose last scan has finished.
fn marked() -> Fixture {
    let f = bare();
    let codex = f.home.join(".codex/config.toml");
    fs::create_dir_all(codex.parent().unwrap()).unwrap();
    fs::write(
        &codex,
        format!("[mcp_servers.alpha]\ncommand = \"{SWITCH_COMMAND}\"\nargs = [\"{SWITCH_ARG}\"]\n\n[mcp_servers.alpha.env]\n{SWITCH_ENV_NAME} = \"{SWITCH_ENV_VALUE}\"\n"),
    )
    .unwrap();

    let skill_dir = f.home.join(".agents/skills/marked");
    fs::create_dir_all(&skill_dir).unwrap();
    fs::write(skill_dir.join("SKILL.md"), format!("---\nname: marked\ndescription: {SKILL_MARKER}\n---\n{SKILL_MARKER}\n")).unwrap();
    let skill_path = skill_dir.to_string_lossy().to_string();
    let bad = f.home.join(".agents/skills/broken");

    let store = PreferencesStore::new(&f.db).unwrap();
    let root = store.upsert_root("engine_global", f.home.join(".agents").to_str().unwrap(), None, ".agents", 1).unwrap();
    store.upsert_asset(root, None, "skill", "global", "marked", &skill_path, None, None, "ok", None, 1, 1).unwrap();
    store.upsert_asset(root, None, "skill", "global", "broken", bad.to_str().unwrap(), None, None, "failed", Some(PARSE_MARKER), 1, 1).unwrap();
    let skill = Skill {
        id: skill_path.clone(),
        name: "marked".to_string(),
        description: SKILL_MARKER.to_string(),
        version: "1.0.0".to_string(),
        path: skill_path,
        source_origin: None,
        scope: Some(Scope::Global { agent: "claude".to_string() }),
        drifted: None,
        is_symlink: None,
        source_path: None,
        parse_status: Some("ok".to_string()),
        parse_error: None,
        link_state: None,
        origin: None,
        origin_blocked: None,
    };
    index_inventory(&f.db, &Inventory { skills: vec![skill], ..Default::default() }).unwrap();
    let config = codex.to_string_lossy().to_string();
    index_probe_tools(
        &f.db,
        &format!("{config}:alpha"),
        "alpha",
        &config,
        &[ProbedTool { name: "lookup".to_string(), description: Some(TOOL_MARKER.to_string()) }],
    )
    .unwrap();
    store.set_preference(LAST_SCAN_KEY, "1764230000000").unwrap();
    f
}

impl Fixture {
    fn run(&self, calls: &Value) -> Vec<Value> {
        let out = Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "child_call", "--ignored", "--nocapture", "--test-threads=1"])
            .env_clear()
            .env("HOME", &self.home)
            .env("HANGER_TEST_HOME", &self.home)
            .env("MCP_TEST_SYSTEM", &self.system)
            .env("MCP_TEST_CALLS", calls.to_string())
            .output()
            .unwrap();
        let stdout = String::from_utf8_lossy(&out.stdout);
        assert!(out.status.success(), "child failed:\n{stdout}\n{}", String::from_utf8_lossy(&out.stderr));
        let start = stdout.find("<<<").unwrap_or_else(|| panic!("no reply:\n{stdout}")) + 3;
        let end = stdout[start..].find(">>>").unwrap() + start;
        serde_json::from_str(&stdout[start..end]).unwrap()
    }

    /// The fixture home as the temp dir spelled it, and canonically.
    fn home_spellings(&self) -> [String; 2] {
        [self.dir.path().join("home").to_string_lossy().to_string(), self.home.to_string_lossy().to_string()]
    }
}

#[test]
#[ignore = "child helper: runs MCP_TEST_CALLS against server_places_at(HOME, MCP_TEST_SYSTEM)"]
fn child_call() {
    let home = PathBuf::from(std::env::var("HOME").unwrap());
    let system = PathBuf::from(std::env::var("MCP_TEST_SYSTEM").unwrap());
    let p = server_places_at(&home, &system);
    let calls: Vec<Vec<Value>> = serde_json::from_str(&std::env::var("MCP_TEST_CALLS").unwrap()).unwrap();
    let s = |v: &Value| v.as_str().unwrap().to_string();
    let replies: Vec<Value> = calls
        .iter()
        .map(|c| match s(&c[0]).as_str() {
            "list_engines" => serde_json::to_value(tools::list_engines(&p)),
            "engine_context" => serde_json::to_value(tools::engine_context(&p, &s(&c[1]))),
            "find_assets" => serde_json::to_value(tools::find_assets(&p, &s(&c[1]), c[2].as_u64().unwrap() as usize)),
            "reach" => serde_json::to_value(tools::reach(&p, &s(&c[1]))),
            "findings" => serde_json::to_value(tools::findings(&p)),
            other => panic!("no tool {other}"),
        }
        .unwrap())
        .collect();
    println!("<<<{}>>>", serde_json::to_string(&replies).unwrap());
}

/// Every field that names a path, at any depth, with its value.
fn path_fields(v: &Value, out: &mut Vec<(String, String)>) {
    match v {
        Value::Object(map) => {
            for (k, val) in map {
                if let (true, Some(text)) = (["path", "asset_path", "config_path", "via_root", "key"].contains(&k.as_str()), val.as_str()) {
                    out.push((k.clone(), text.to_string()));
                }
                path_fields(val, out);
            }
        }
        Value::Array(items) => items.iter().for_each(|i| path_fields(i, out)),
        _ => {}
    }
}

fn all_five() -> Value {
    json!([["list_engines"], ["engine_context", "codex"], ["find_assets", "marked", 10], ["reach", "~/.agents/skills/marked"], ["findings"]])
}

#[test]
fn no_reply_carries_a_config_value_asset_text_or_raw_home() {
    let f = marked();
    // A guard that cannot fail proves nothing: the fixture carries every marker.
    let config = fs::read_to_string(f.home.join(".codex/config.toml")).unwrap();
    for m in [SWITCH_COMMAND, SWITCH_ARG, SWITCH_ENV_NAME, SWITCH_ENV_VALUE] {
        assert!(config.contains(m), "the config lacks {m}");
    }
    assert_eq!(fs::read_to_string(f.home.join(".agents/skills/marked/SKILL.md")).unwrap().matches(SKILL_MARKER).count(), 2);
    let conn = rusqlite::Connection::open(&f.db).unwrap();
    let stored: String = conn.query_row("SELECT parse_error FROM assets WHERE name = 'broken'", [], |r| r.get(0)).unwrap();
    assert_eq!(stored, PARSE_MARKER);
    let indexed: i64 = conn
        .query_row("SELECT count(*) FROM asset_search WHERE description IN (?1, ?2)", [SKILL_MARKER, TOOL_MARKER], |r| r.get(0))
        .unwrap();
    assert_eq!(indexed, 2, "the skill and the tool are indexed with their markers");
    drop(conn);

    let mut calls = all_five().as_array().unwrap().clone();
    for m in MARKERS {
        calls.push(json!(["find_assets", m, 50]));
    }
    calls.push(json!(["find_assets", "lookup", 50]));
    calls.push(json!(["engine_context", "no-such-engine"]));
    calls.push(json!(["reach", "~/.agents/skills/nope"]));
    calls.push(json!(["find_assets", "marked", 0]));
    let mut seen = f.run(&Value::Array(calls.clone()));
    assert_eq!(seen.len(), calls.len());
    let mut calls_made = calls.len();

    // Every store refusal a fixture can produce: no scan finished, no store,
    // a store at another version, and one that is not a database.
    let unscanned = bare();
    PreferencesStore::new(&unscanned.db).unwrap();
    let missing = bare();
    let other = bare();
    PreferencesStore::new(&other.db).unwrap();
    rusqlite::Connection::open(&other.db).unwrap().execute_batch("PRAGMA user_version = 7;").unwrap();
    let garbage = bare();
    fs::create_dir_all(garbage.db.parent().unwrap()).unwrap();
    fs::write(&garbage.db, b"not a database, just bytes long enough to have a header page").unwrap();
    for (fx, code) in [(&unscanned, "not_scanned_yet"), (&missing, "not_scanned_yet"), (&other, "other_version"), (&garbage, "unreadable")] {
        let replies = fx.run(&all_five());
        calls_made += 5;
        for r in &replies {
            assert_eq!(r, &json!({ "Err": code }));
        }
        seen.extend(replies);
    }
    assert_eq!(seen.len(), calls_made);

    let ok = |i: usize| seen[i].get("Ok").unwrap_or_else(|| panic!("call {i} refused: {}", seen[i]));
    assert!(!ok(1)["result"]["items"].as_array().unwrap().is_empty(), "codex's server is listed");
    assert_eq!(ok(4)["result"]["unparsed_count"], 1, "the failed parse is listed");
    assert_eq!(ok(5 + 4)["result"]["total"], 1, "the skill's body marker finds the skill");
    assert_eq!(ok(5 + 6)["result"]["total"], 1, "the tool's description marker finds the tool");
    for expected in [json!({ "Err": "not_found" }), json!({ "Err": "bad_argument" })] {
        assert!(seen.contains(&expected), "{expected} was exercised");
    }

    let homes = f.home_spellings();
    let mut paths = Vec::new();
    for reply in &seen {
        let text = reply.to_string();
        for m in MARKERS {
            assert!(!text.contains(m), "{m} left the server: {text}");
        }
        for h in &homes {
            assert!(!text.contains(h.as_str()), "the raw home {h} left the server: {text}");
        }
        path_fields(reply, &mut paths);
    }
    assert!(paths.len() >= 6, "the replies carry paths to check: {paths:?}");
    for (field, value) in &paths {
        assert!(value.starts_with("~/"), "{field} is not under ~/: {value}");
    }
}

