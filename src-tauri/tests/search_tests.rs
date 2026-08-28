//! The search palette's index. Four kinds share one table and one writer,
//! so each kind gets its own body-text assertion: a partial fix that indexes
//! three kinds and silently drops the fourth is the failure shape to fear
//! (`.claude/rules/shared-asset-machinery.md`).
use std::fs;
use std::path::Path;
use tauri_app_lib::domain::{Inventory, Rule, Scope, Skill, Subagent, Tool};
use tauri_app_lib::mcp::probe::ProbedTool;
use tauri_app_lib::preferences::PreferencesStore;
use tauri_app_lib::search::{fts_query, index_inventory, index_probe_tools, search, MARK_CLOSE, MARK_OPEN};

fn skill(dir: &Path, name: &str, description: &str, body: &str, scope: Scope) -> Skill {
    fs::create_dir_all(dir).unwrap();
    fs::write(
        dir.join("SKILL.md"),
        format!("---\nname: {name}\ndescription: {description}\n---\n{body}\n"),
    )
    .unwrap();
    Skill {
        id: dir.to_string_lossy().to_string(),
        name: name.to_string(),
        description: description.to_string(),
        version: "1.0.0".to_string(),
        path: dir.to_string_lossy().to_string(),
        source_origin: None,
        scope: Some(scope),
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

fn rule(path: &Path, content: &str) -> Rule {
    Rule {
        id: path.to_string_lossy().to_string(),
        name: path.file_name().unwrap().to_string_lossy().to_string(),
        path: path.to_string_lossy().to_string(),
        content: content.to_string(),
        scope: Some(Scope::Global { agent: "claude".to_string() }),
        drifted: None,
        is_symlink: None,
        source_path: None,
        parse_status: None,
        parse_error: None,
        link_state: None,
        origin: None,
        origin_blocked: None,
    }
}

fn subagent(path: &Path, name: &str, body: &str) -> Subagent {
    fs::write(path, format!("---\nname: {name}\ndescription: reviews\n---\n{body}\n")).unwrap();
    Subagent {
        id: path.to_string_lossy().to_string(),
        name: name.to_string(),
        description: "reviews".to_string(),
        path: path.to_string_lossy().to_string(),
        declared_tools: vec![],
        scope: Some(Scope::Global { agent: "claude".to_string() }),
        source_path: None,
        parse_status: Some("ok".to_string()),
        parse_error: None,
        link_state: None,
        origin: None,
        origin_blocked: None,
    }
}

fn server(config_path: &str, name: &str, args: Vec<&str>, launch_display: &str) -> Tool {
    Tool {
        id: format!("{config_path}:{name}"),
        name: name.to_string(),
        command: "npx".to_string(),
        args: args.into_iter().map(String::from).collect(),
        launch_display: launch_display.to_string(),
        transport: "stdio".to_string(),
        bridged: false,
        config_path: config_path.to_string(),
        scope: Scope::Global { agent: "claude".to_string() },
        owning_agent: "claude".to_string(),
        drifted: None,
        is_symlink: None,
        source_path: None,
        parse_status: None,
        parse_error: None,
        link_state: None,
        origin: None,
        origin_blocked: None,
    }
}

/// A store at the latest version plus a scratch directory for bodies.
fn fresh() -> (tempfile::TempDir, std::path::PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("hanger.db");
    PreferencesStore::new(&db).unwrap();
    (dir, db)
}

fn tool(name: &str, description: Option<&str>) -> ProbedTool {
    ProbedTool { name: name.to_string(), description: description.map(String::from) }
}

#[test]
fn every_kind_hits_on_body_text_absent_from_name_and_description() {
    let (dir, db) = fresh();
    let mut inv = Inventory::default();
    inv.skills.push(skill(&dir.path().join("skills/alpha"), "alpha", "plain", "Only the body says quokka.", Scope::Global { agent: "claude".to_string() }));
    inv.rules.push(rule(&dir.path().join("CLAUDE.md"), "Only the rule body says wombat."));
    inv.subagents.push(subagent(&dir.path().join("reviewer.md"), "reviewer", "Only the subagent body says numbat."));
    inv.tools.push(server("/home/u/.claude.json", "spades", vec!["-y", "@acme/spades"], "npx -y @acme/spades"));

    index_inventory(&db, &inv).unwrap();

    for (term, kind) in [("quokka", "skill"), ("wombat", "rule"), ("numbat", "subagent"), ("@acme/spades", "server")] {
        let res = search(&db, term, 10).unwrap();
        assert_eq!(res.total, 1, "{term} must hit exactly one row");
        assert_eq!(res.hits[0].kind, kind, "{term} must hit a {kind}");
    }
}

#[test]
fn hits_carry_the_identity_the_frontend_selects_by() {
    let (dir, db) = fresh();
    let mut inv = Inventory::default();
    let skill_dir = dir.path().join("proj/.claude/skills/alpha");
    inv.skills.push(skill(&skill_dir, "alpha", "plain", "quokka", Scope::Project { agent: "claude".to_string(), root: "/proj".to_string() }));
    inv.tools.push(server("/home/u/.claude.json", "spades", vec![], "npx spades"));
    index_inventory(&db, &inv).unwrap();

    let hit = &search(&db, "quokka", 10).unwrap().hits[0];
    assert_eq!(hit.id, skill_dir.to_string_lossy());
    assert_eq!(hit.path, skill_dir.to_string_lossy());
    assert_eq!(hit.place, "/proj");
    assert_eq!(hit.name, "alpha");
    assert_eq!(hit.server, None);

    let hit = &search(&db, "spades", 10).unwrap().hits[0];
    assert_eq!(hit.id, "/home/u/.claude.json:spades", "server ref is the registration key");
    assert_eq!(hit.path, "/home/u/.claude.json");
    assert_eq!(hit.place, "global");
}

#[test]
fn snippet_wraps_the_match_in_private_use_markers() {
    let (dir, db) = fresh();
    let mut inv = Inventory::default();
    inv.rules.push(rule(&dir.path().join("CLAUDE.md"), "Before you deploy anything, read the rules."));
    index_inventory(&db, &inv).unwrap();

    let hit = &search(&db, "deploy", 10).unwrap().hits[0];
    let expected = format!("{MARK_OPEN}deploy{MARK_CLOSE}");
    assert!(hit.snippet.contains(&expected), "snippet was {:?}", hit.snippet);
}

#[test]
fn a_body_that_cannot_be_read_still_indexes_name_and_description() {
    let (dir, db) = fresh();
    let mut inv = Inventory::default();
    let mut s = skill(&dir.path().join("skills/alpha"), "alpha", "describes quokka", "body", Scope::Global { agent: "claude".to_string() });
    s.path = dir.path().join("skills/missing").to_string_lossy().to_string();
    inv.skills.push(s);
    index_inventory(&db, &inv).unwrap();
    assert_eq!(search(&db, "quokka", 10).unwrap().total, 1);
    assert_eq!(search(&db, "body", 10).unwrap().total, 0, "nothing is invented for an unreadable body");
}

#[test]
fn a_name_hit_outranks_a_body_hit_and_a_prefix_finds_the_word() {
    let (dir, db) = fresh();
    let mut inv = Inventory::default();
    inv.skills.push(skill(&dir.path().join("skills/deploy-helper"), "deploy-helper", "ships things", "nothing relevant here", Scope::Global { agent: "claude".to_string() }));
    inv.skills.push(skill(&dir.path().join("skills/notes"), "notes", "keeps notes", "you may also deploy from here", Scope::Global { agent: "claude".to_string() }));
    index_inventory(&db, &inv).unwrap();

    let res = search(&db, "deploy", 10).unwrap();
    assert_eq!(res.total, 2);
    assert_eq!(res.hits[0].name, "deploy-helper", "name weighs more than body");

    let res = search(&db, "depl", 10).unwrap();
    assert_eq!(res.total, 2, "a prefix matches both");
}

#[test]
fn fts_syntax_from_the_keyboard_never_reaches_the_parser() {
    assert_eq!(fts_query("deploy"), Some("\"deploy\"*".to_string()));
    assert_eq!(fts_query("  two   words "), Some("\"two\"* \"words\"*".to_string()));
    assert_eq!(fts_query("a\"b (c OR NOT d) *"), Some("\"ab\"* \"c\"* \"OR\"* \"NOT\"* \"d\"*".to_string()));
    assert_eq!(fts_query("\"\"\" ((( ***"), None);
    assert_eq!(fts_query("   "), None);
    assert_eq!(fts_query("@acme/spades-mcp_v2.1"), Some("\"@acme/spades-mcp_v2.1\"*".to_string()));
}

#[test]
fn hostile_and_blank_queries_return_ok() {
    let (dir, db) = fresh();
    let mut inv = Inventory::default();
    inv.rules.push(rule(&dir.path().join("CLAUDE.md"), "deploy carefully"));
    index_inventory(&db, &inv).unwrap();

    for q in ["", "   ", "\"", "(", "NOT", "*", "a\"b (c OR", "deploy NOT careful"] {
        let res = search(&db, q, 10);
        assert!(res.is_ok(), "query {q:?} must not error: {:?}", res.err());
    }
    let blank = search(&db, "   ", 10).unwrap();
    assert!(blank.hits.is_empty());
    assert_eq!(blank.total, 0);
}

#[test]
fn limit_caps_hits_but_not_total() {
    let (dir, db) = fresh();
    let mut inv = Inventory::default();
    for i in 0..5 {
        inv.rules.push(rule(&dir.path().join(format!("r{i}.md")), "the same word: quokka"));
    }
    index_inventory(&db, &inv).unwrap();
    let res = search(&db, "quokka", 2).unwrap();
    assert_eq!(res.hits.len(), 2);
    assert_eq!(res.total, 5);
}

#[test]
fn a_probed_tool_hits_on_its_description_and_names_its_server() {
    let (_dir, db) = fresh();
    let mut inv = Inventory::default();
    inv.tools.push(server("/home/u/.claude.json", "spades", vec![], "npx spades"));
    index_inventory(&db, &inv).unwrap();

    index_probe_tools(
        &db,
        "/home/u/.claude.json:spades",
        "spades",
        "/home/u/.claude.json",
        &[tool("set_volume", Some("Adjust the loudness of one app")), tool("mute", None)],
    )
    .unwrap();

    let res = search(&db, "loudness", 10).unwrap();
    assert_eq!(res.total, 1);
    let hit = &res.hits[0];
    assert_eq!(hit.kind, "mcp_tool");
    assert_eq!(hit.name, "set_volume");
    assert_eq!(hit.server.as_deref(), Some("spades"));
    assert_eq!(hit.id, "/home/u/.claude.json:spades");
    assert_eq!(hit.path, "/home/u/.claude.json", "path and place come from the server row");
    assert_eq!(hit.place, "global");

    // A tool with no description still hits on its name.
    assert_eq!(search(&db, "mute", 10).unwrap().total, 1);
}

#[test]
fn reprobing_replaces_the_registrations_tool_rows() {
    let (_dir, db) = fresh();
    let key = "/home/u/.claude.json:spades";
    index_probe_tools(&db, key, "spades", "/home/u/.claude.json", &[tool("old_tool", None)]).unwrap();
    index_probe_tools(&db, key, "spades", "/home/u/.claude.json", &[tool("new_tool", None)]).unwrap();
    assert_eq!(search(&db, "old_tool", 10).unwrap().total, 0);
    assert_eq!(search(&db, "new_tool", 10).unwrap().total, 1);
}

#[test]
fn a_rescan_prunes_tools_of_registrations_it_no_longer_finds_and_keeps_the_rest() {
    let (_dir, db) = fresh();
    index_probe_tools(&db, "/a.json:gone", "gone", "/a.json", &[tool("ghost", None)]).unwrap();
    index_probe_tools(&db, "/b.json:kept", "kept", "/b.json", &[tool("survivor", None)]).unwrap();

    let mut inv = Inventory::default();
    inv.tools.push(server("/b.json", "kept", vec![], "npx kept"));
    index_inventory(&db, &inv).unwrap();

    assert_eq!(search(&db, "ghost", 10).unwrap().total, 0, "a vanished registration's tools go with it");
    assert_eq!(search(&db, "survivor", 10).unwrap().total, 1, "a live registration's tools survive the scan");
}

#[test]
fn indexing_the_same_inventory_twice_leaves_one_row_per_asset() {
    let (dir, db) = fresh();
    let mut inv = Inventory::default();
    inv.rules.push(rule(&dir.path().join("CLAUDE.md"), "quokka"));
    inv.tools.push(server("/home/u/.claude.json", "quokka-server", vec![], "npx quokka"));
    index_inventory(&db, &inv).unwrap();
    index_inventory(&db, &inv).unwrap();
    assert_eq!(search(&db, "quokka", 10).unwrap().total, 2);
}

#[test]
fn an_index_write_waits_out_a_lock_held_longer_than_rusqlites_default() {
    // The rescan a server-detail open triggers holds the store's write lock
    // for seconds; with rusqlite's 5 s default the index write gave up and
    // the tools half of the palette stayed empty (app log, 2026-08-28).
    let (_dir, db) = fresh();
    let holder = rusqlite::Connection::open(&db).unwrap();
    holder.execute_batch("BEGIN IMMEDIATE;").unwrap();

    let started = std::time::Instant::now();
    let writer = {
        let db = db.clone();
        std::thread::spawn(move || {
            index_probe_tools(&db, "/home/u/.claude.json:spades", "spades", "/home/u/.claude.json", &[tool("waits", None)])
        })
    };
    std::thread::sleep(std::time::Duration::from_secs(7));
    holder.execute_batch("COMMIT;").unwrap();
    drop(holder);

    let result = writer.join().unwrap();
    assert!(result.is_ok(), "the index write must outwait a 7 s lock: {:?}", result.err());
    assert!(started.elapsed() >= std::time::Duration::from_secs(6), "the writer waited for the lock, it did not skip it");
}

#[test]
fn a_credential_in_launch_args_is_not_searchable() {
    // The property ipc_boundary_tests.rs pins for serialisation, pinned here
    // for the index: `args` never reaches the table, `launch_display` does.
    let (_dir, db) = fresh();
    let mut inv = Inventory::default();
    inv.tools.push(server(
        "/home/u/.claude.json",
        "remote",
        vec!["mcp-remote", "https://example.com/sse", "--header", "Authorization: Bearer sk-live-quokka-9f8e7d"],
        "npx mcp-remote https://example.com/sse --header Authorization: <redacted>",
    ));
    index_inventory(&db, &inv).unwrap();
    assert_eq!(search(&db, "sk-live-quokka-9f8e7d", 10).unwrap().total, 0, "the token must not be indexed");
    assert_eq!(search(&db, "quokka", 10).unwrap().total, 0, "nor any fragment of it");
    assert_eq!(search(&db, "mcp-remote", 10).unwrap().total, 1, "the redacted launch is");
}
