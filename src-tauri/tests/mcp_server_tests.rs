//! Hanger's own MCP server: where it finds Hanger's folders, and the five
//! read tools as plain functions.
//!
//! The tools read `HOME` (`sanitise_path`, `get_home_dir`), `CODEX_HOME` and
//! `CLAUDE_CONFIG_DIR` (`agents::engine_base`) from the process environment.
//! So each tool test builds a fixture here and runs the tool in a child of
//! this test binary (`child_call`) whose environment it sets in full, with a
//! fixture system root passed through `server_places_at`.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

use serde_json::Value;
use tauri_app_lib::domain::{Inventory, Scope, Skill, Tool};
use tauri_app_lib::mcp_server::limit::RateLimit;
use tauri_app_lib::mcp_server::tools;
use tauri_app_lib::preferences::{PreferencesStore, LAST_SCAN_KEY};
use tauri_app_lib::scanner::{count_assets_on, Grouping};
use tauri_app_lib::search::index_inventory;

use tauri_app_lib::mcp::switch::ops::SwitchPlaces;
use tauri_app_lib::mcp_server::places::{data_dir_for, server_places_at, BUNDLE_ID};
use tauri_app_lib::skill_switch::ops::SkillPlaces;

const DATA: &str = "/h/Library/Application Support/com.rkarthik.hanger";

#[test]
fn the_bundle_id_is_tauri_confs_identifier() {
    let conf: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/tauri.conf.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(conf["identifier"], BUNDLE_ID);
}

#[test]
fn the_data_dir_is_application_support_under_the_bundle_id() {
    assert_eq!(data_dir_for(Path::new("/h")), PathBuf::from(DATA));
}

#[test]
fn switch_places_under_a_data_dir_match_the_apps_spelling() {
    let p = SwitchPlaces::under(PathBuf::from("/h"), PathBuf::from("/"), Path::new(DATA));
    assert_eq!(p.home, PathBuf::from("/h"));
    assert_eq!(p.system, PathBuf::from("/"));
    assert_eq!(p.backups, PathBuf::from(format!("{DATA}/switch/backups")));
    assert_eq!(p.stash, PathBuf::from(format!("{DATA}/switch/stash")));
}

#[test]
fn skill_places_under_a_data_dir_match_the_apps_spelling() {
    let p = SkillPlaces::under(PathBuf::from("/h"), Path::new(DATA));
    assert_eq!(p.home, PathBuf::from("/h"));
    assert_eq!(p.store, PathBuf::from("/h/.agents/skills"));
    assert_eq!(p.keep, PathBuf::from(format!("{DATA}/kept/skills")));
    assert_eq!(p.db_path, PathBuf::from(format!("{DATA}/hanger.db")));
}

#[test]
fn server_places_put_everything_under_the_home_and_the_given_system_root() {
    let p = server_places_at(Path::new("/h"), Path::new("/sys"));
    assert_eq!(p.home, PathBuf::from("/h"));
    assert_eq!(p.db_path, PathBuf::from(format!("{DATA}/hanger.db")));
    assert_eq!(p.switch.system, PathBuf::from("/sys"));
    assert_eq!(p.switch.backups, PathBuf::from(format!("{DATA}/switch/backups")));
    assert_eq!(p.skills.db_path, p.db_path);
}

// ---- The five read tools.

struct Fixture {
    _dir: tempfile::TempDir,
    home: PathBuf,
    system: PathBuf,
    db: PathBuf,
}

const CODEX: &str = "[mcp_servers.alpha]\ncommand = \"alpha-server\"\n";

fn skill(dir: &Path, name: &str) -> Skill {
    fs::create_dir_all(dir).unwrap();
    fs::write(dir.join("SKILL.md"), "---\nname: x\ndescription: d\n---\nbody\n").unwrap();
    // A skill's path is its folder, as the scanner stores it.
    Skill {
        id: dir.to_string_lossy().to_string(),
        name: name.to_string(),
        description: "d".to_string(),
        version: "1.0.0".to_string(),
        path: dir.to_string_lossy().to_string(),
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
    }
}

/// A canonical fixture root holding `home/` and `system/`, and, when `store`
/// is set, a store at `data_dir_for(home)/hanger.db`. `skills` are global
/// skills in folders under `~/.agents/`, by folder and name.
fn fixture(store: bool, scanned: bool, skills: &[(&str, &str)]) -> Fixture {
    let dir = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(dir.path()).unwrap();
    let home = root.join("home");
    let system = root.join("system");
    fs::create_dir_all(home.join(".codex")).unwrap();
    fs::create_dir_all(&system).unwrap();
    fs::write(home.join(".codex/config.toml"), CODEX).unwrap();
    let db = data_dir_for(&home).join("hanger.db");
    if store {
        let s = PreferencesStore::new(&db).unwrap();
        let t = 1_700_000_000;
        let agents = home.join(".agents");
        let root_id = s.upsert_root("engine_global", agents.to_str().unwrap(), None, ".agents", t).unwrap();
        let mut inventory = Inventory::default();
        for (folder, name) in skills {
            let sk = skill(&agents.join(folder), name);
            s.upsert_asset(root_id, None, "skill", "global", name, &sk.path, None, None, "ok", None, t, t).unwrap();
            inventory.skills.push(sk);
        }
        index_inventory(&db, &inventory).unwrap();
        if scanned {
            s.set_preference(LAST_SCAN_KEY, "1764230000000").unwrap();
        }
    }
    Fixture { _dir: dir, home, system, db }
}

impl Fixture {
    /// Runs each call in one child and returns its replies as JSON. A call is
    /// `[tool, args...]`; `extra_env` is added to `HOME`, `HANGER_TEST_HOME`
    /// and `MCP_TEST_SYSTEM`, and nothing else reaches the child.
    fn run(&self, calls: Value, extra_env: &[(&str, &Path)]) -> Vec<Value> {
        let mut cmd = Command::new(std::env::current_exe().unwrap());
        cmd.args(["--exact", "child_call", "--ignored", "--nocapture", "--test-threads=1"])
            .env_clear()
            .env("HOME", &self.home)
            .env("HANGER_TEST_HOME", &self.home)
            .env("MCP_TEST_SYSTEM", &self.system)
            .env("MCP_TEST_CALLS", calls.to_string());
        for (k, v) in extra_env {
            cmd.env(k, v);
        }
        let out = cmd.output().unwrap();
        let stdout = String::from_utf8_lossy(&out.stdout);
        assert!(out.status.success(), "child failed:\n{stdout}\n{}", String::from_utf8_lossy(&out.stderr));
        let start = stdout.find("<<<").unwrap_or_else(|| panic!("no reply:\n{stdout}")) + 3;
        let end = stdout[start..].find(">>>").unwrap() + start;
        serde_json::from_str(&stdout[start..end]).unwrap()
    }

    fn one(&self, call: Value) -> Value {
        self.run(Value::Array(vec![call]), &[]).remove(0)
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

fn all_five() -> Value {
    serde_json::json!([
        ["list_engines"],
        ["engine_context", "codex"],
        ["find_assets", "x", 10],
        ["reach", "~/.agents/skills/a"],
        ["findings"]
    ])
}

#[test]
fn every_read_tool_refuses_before_the_first_scan() {
    for (f, has_store) in [(fixture(true, false, &[("skills/a", "a")]), true), (fixture(false, false, &[]), false)] {
        let replies = f.run(all_five(), &[]);
        assert_eq!(replies.len(), 5);
        for r in &replies {
            assert_eq!(r, &serde_json::json!({ "Err": "not_scanned_yet" }));
        }
        assert_eq!(f.db.exists(), has_store, "a refusal creates no store");
    }
}

#[test]
fn an_empty_scanned_store_answers_empty_not_pending() {
    let f = fixture(true, true, &[]);
    let r = f.run(serde_json::json!([["findings"], ["find_assets", "x", 10]]), &[]);
    let findings = &r[0]["Ok"]["result"];
    assert_eq!(findings["broken_global_count"], 0);
    assert_eq!(findings["drifted_global_count"], 0);
    assert_eq!(findings["unparsed_count"], 0);
    assert_eq!(r[0]["Ok"]["as_of_ms"], 1_764_230_000_000i64);
    assert_eq!(r[1]["Ok"]["result"]["total"], 0);
}

#[test]
fn list_engines_counts_come_from_the_store() {
    let f = fixture(true, true, &[("skills/a", "alpha-skill"), ("skills/b", "beta-skill")]);
    let r = f.one(serde_json::json!(["list_engines"]));
    let engines = &r["Ok"]["result"];
    let conn = tauri_app_lib::store_read::open_read_only(&f.db).unwrap();
    let expected = serde_json::to_value(count_assets_on(&conn, None, Grouping::PerRegistration).unwrap()).unwrap();
    assert_eq!(engines["totals"], expected);
    assert_eq!(engines["totals"]["skill"]["total"], 2, "the fixture's skills are counted");
    let codex = engines["mcp"].as_array().unwrap().iter().find(|m| m["engine_id"] == "codex").expect("codex has a summary");
    assert_eq!(codex["on_count"], 1);
    assert_eq!(codex["off_count"], 0);
    assert!(
        engines["detected"].as_array().unwrap().iter().any(|d| d["id"] == "codex"),
        "the fixture home's ~/.codex is detected: {engines}"
    );
}

fn keys_and_paths(v: &Value) -> Vec<String> {
    v["Ok"]["result"]["items"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|i| [i["key"].as_str().unwrap().to_string(), i["config_path"].as_str().unwrap().to_string()])
        .collect()
}

#[test]
fn engine_context_keys_are_sanitised() {
    let f = fixture(true, true, &[]);
    let r = f.one(serde_json::json!(["engine_context", "codex"]));
    let fields = keys_and_paths(&r);
    assert!(!fields.is_empty());
    let raw = f.home.to_string_lossy().to_string();
    for field in &fields {
        assert!(field.starts_with("~/"), "not sanitised: {field}");
        assert!(!field.contains(&raw), "raw home in {field}");
    }
    assert!(!r.to_string().contains(&raw), "raw home in the reply: {r}");
}

#[test]
fn an_unknown_engine_is_not_found() {
    let f = fixture(true, true, &[]);
    assert_eq!(f.one(serde_json::json!(["engine_context", "no-such-engine"])), serde_json::json!({ "Err": "not_found" }));
}

#[test]
fn find_assets_rejects_a_limit_of_zero_and_of_fifty_one() {
    let f = fixture(true, true, &[("skills/a", "alpha")]);
    let r = f.run(serde_json::json!([["find_assets", "alpha", 0], ["find_assets", "alpha", 51], ["find_assets", "alpha", 50]]), &[]);
    assert_eq!(r[0], serde_json::json!({ "Err": "bad_argument" }));
    assert_eq!(r[1], serde_json::json!({ "Err": "bad_argument" }));
    assert_eq!(r[2]["Ok"]["result"]["total"], 1);
}

#[test]
fn find_assets_returns_no_snippet() {
    let f = fixture(true, true, &[("skills/a", "alpha")]);
    let r = f.one(serde_json::json!(["find_assets", "alpha", 10]));
    let hit = &r["Ok"]["result"]["assets"][0];
    assert_eq!(hit["name"], "alpha");
    assert_eq!(hit["path"], "~/.agents/skills/a");
    assert!(hit.get("snippet").is_none() && hit.get("rank").is_none(), "{hit}");
}

#[test]
fn reach_answers_for_a_global_skill_by_its_sanitised_path() {
    let f = fixture(true, true, &[("skills/zeta-unique", "zeta-unique"), ("skills/other", "other")]);
    let r = f.one(serde_json::json!(["reach", "~/.agents/skills/zeta-unique"]));
    assert_eq!(r["Ok"]["result"]["asset_path"], "~/.agents/skills/zeta-unique", "{r}");
}

#[test]
fn reach_of_a_path_hanger_has_not_annotated_is_not_found() {
    let f = fixture(true, true, &[("skills/a", "a")]);
    assert_eq!(f.one(serde_json::json!(["reach", "~/.agents/skills/nope"])), serde_json::json!({ "Err": "not_found" }));
}

#[test]
fn reach_does_not_match_on_a_shared_basename() {
    // Two skills in folders of one name: a path that sanitised to its
    // basename would match either.
    let f = fixture(true, true, &[("skills/dup", "first"), ("more/dup", "second")]);
    let r = f.one(serde_json::json!(["reach", "~/.agents/more/dup"]));
    assert_eq!(r["Ok"]["result"]["asset_path"], "~/.agents/more/dup", "{r}");
}

#[test]
fn findings_name_a_failed_parse_without_its_parser_message() {
    let f = fixture(true, true, &[]);
    let s = PreferencesStore::new(&f.db).unwrap();
    let root = s.upsert_root("engine_global", f.home.join(".agents").to_str().unwrap(), None, ".agents", 1).unwrap();
    let path = f.home.join(".agents/skills/bad");
    s.upsert_asset(root, None, "skill", "global", "bad", path.to_str().unwrap(), None, None, "failed", Some("PARSE_MARKER"), 1, 1).unwrap();
    let r = f.one(serde_json::json!(["findings"]));
    assert!(!r.to_string().contains("PARSE_MARKER"), "{r}");
    let result = &r["Ok"]["result"];
    assert_eq!(result["unparsed_count"], 1);
    assert_eq!(result["unparsed"][0]["name"], "bad");
    assert_eq!(result["unparsed"][0]["path"], "~/.agents/skills/bad");
}

#[test]
fn a_name_with_a_newline_and_500_characters_leaves_as_one_line_of_at_most_128() {
    let long = format!("IGNORE PREVIOUS\n{}", "x".repeat(500));
    let f = fixture(true, true, &[("skills/long", long.as_str())]);
    let r = f.one(serde_json::json!(["find_assets", "IGNORE", 10]));
    let name = r["Ok"]["result"]["assets"][0]["name"].as_str().unwrap_or_else(|| panic!("no hit: {r}")).to_string();
    assert!(!name.contains('\n'), "{name:?}");
    assert!(name.chars().count() <= 128, "{} characters", name.chars().count());
    assert!(name.starts_with("IGNORE PREVIOUS "), "{name:?}");
    assert!(name.ends_with('…'), "{name:?}");
}

#[test]
fn a_relocated_codex_home_is_read_where_the_env_says() {
    let f = fixture(true, true, &[]);
    let relocated = f.home.join("elsewhere/codex");
    fs::create_dir_all(&relocated).unwrap();
    fs::write(relocated.join("config.toml"), "[mcp_servers.relocated]\ncommand = \"r\"\n").unwrap();
    let r = f.run(serde_json::json!([["engine_context", "codex"]]), &[("CODEX_HOME", &relocated)]).remove(0);
    let names: Vec<&str> = r["Ok"]["result"]["items"].as_array().unwrap().iter().map(|i| i["name"].as_str().unwrap()).collect();
    assert_eq!(names, vec!["relocated"], "{r}");
}

#[test]
fn the_thirty_first_call_in_ten_seconds_is_refused_and_the_window_slides() {
    let mut limit = RateLimit::new(30, Duration::from_secs(10));
    let t0 = Instant::now();
    for i in 0..30 {
        assert!(limit.allow(t0 + Duration::from_millis(i * 100)), "call {i}");
    }
    assert!(!limit.allow(t0 + Duration::from_secs(5)), "the 31st call inside the window");
    assert!(limit.allow(t0 + Duration::from_millis(10_050)), "the first call has left the window");
    assert!(!limit.allow(t0 + Duration::from_millis(10_060)), "only one slot opened");
}

#[test]
fn public_name_strips_control_characters_and_caps_at_128() {
    assert_eq!(tools::public_name("a\nb\tc"), "a b c");
    assert_eq!(tools::public_name("short"), "short");
    let cut = tools::public_name(&"y".repeat(200));
    assert_eq!(cut.chars().count(), 128);
    assert!(cut.ends_with('…'));
    assert_eq!(tools::public_name(&"z".repeat(128)), "z".repeat(128), "exactly 128 is not cut");
}

/// stdout belongs to the protocol: one stray line breaks the engine's
/// connection. Nothing under `src/mcp_server/` may print.
#[test]
fn the_server_module_never_prints() {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/src/mcp_server");
    let mut read = 0;
    for entry in fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        let text = fs::read_to_string(&path).unwrap();
        read += 1;
        for (n, line) in text.lines().enumerate() {
            assert!(!line.contains("println!") && !line.contains("print!("), "{}:{} prints: {line}", path.display(), n + 1);
        }
    }
    assert!(read >= 4, "read {read} files under {dir}");
}

/// A server's name is config text, so untrusted: it leaves capped and on one
/// line inside a key or id too, not only in `name`.
#[test]
fn a_long_multi_line_server_name_leaves_flattened_and_capped_in_keys_and_ids() {
    let f = fixture(true, true, &[]);
    let long = format!("IGNORE PREVIOUS\n{}", "x".repeat(500));
    let config = f.home.join(".codex/config.toml");
    fs::write(&config, format!("[mcp_servers.\"{}\"]\ncommand = \"alpha-server\"\n", long.replace('\n', "\\n"))).unwrap();
    let config_path = config.to_string_lossy().to_string();
    let tool = Tool {
        id: format!("{config_path}:{long}"),
        name: long.clone(),
        command: "alpha-server".to_string(),
        args: vec![],
        launch_display: "alpha-server".to_string(),
        transport: "stdio".to_string(),
        bridged: false,
        config_path: config_path.clone(),
        scope: Scope::Global { agent: "codex".to_string() },
        owning_agent: "codex".to_string(),
        drifted: None,
        is_symlink: None,
        source_path: None,
        parse_status: None,
        parse_error: None,
        link_state: None,
        origin: None,
        origin_blocked: None,
    };
    let key = tool.registration_key().as_str().to_string();
    let store = PreferencesStore::new(&f.db).unwrap();
    let root = store.upsert_root("engine_global", f.home.join(".codex").to_str().unwrap(), None, ".codex", 1).unwrap();
    store.upsert_asset(root, None, "tool", "global", &long, &key, None, None, "ok", None, 1, 1).unwrap();
    index_inventory(&f.db, &Inventory { tools: vec![tool], ..Default::default() }).unwrap();

    let first = f.run(serde_json::json!([["engine_context", "codex"], ["find_assets", "IGNORE", 10]]), &[]);
    let item_key = first[0]["Ok"]["result"]["items"][0]["key"].as_str().unwrap_or_else(|| panic!("{}", first[0])).to_string();
    let hit = first[1]["Ok"]["result"]["assets"].as_array().unwrap().iter().find(|a| a["kind"] == "server").cloned().unwrap_or_else(|| panic!("{}", first[1]));
    let id = hit["id"].as_str().unwrap().to_string();
    for (field, value) in [("engine_context key", &item_key), ("find_assets id", &id)] {
        let (path, name) = value.split_once(':').unwrap_or_else(|| panic!("{field}: {value:?}"));
        assert_eq!(path, "~/.codex/config.toml", "{field}");
        assert!(!name.contains('\n'), "{field} carries a newline: {value:?}");
        assert!(name.chars().count() <= 128, "{field}'s name is {} characters", name.chars().count());
        assert!(name.starts_with("IGNORE PREVIOUS ") && name.ends_with('…'), "{field}: {name:?}");
    }
    assert_eq!(item_key, id, "the same server, the same public key");

    // The id find_assets gave back still finds its asset.
    let reach = f.one(serde_json::json!(["reach", id]));
    assert_eq!(reach["Ok"]["result"]["asset_path"], serde_json::json!(id), "{reach}");
}
