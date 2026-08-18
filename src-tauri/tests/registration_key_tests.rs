//! A registration's id is the key the store wrote, or the join cannot land.
//!
//! `ProfilePane` looks annotations up by the row's key against
//! `AssetAnnotation.asset_path`, which is `assets.abs_path` (`annotations.rs:293`).
//! For an MCP registration the store writes `{path}:{name}`
//! (`scanner.rs:1280`, canonicalised by `upsert_asset`), while
//! `Tool::registration_key` produced `{raw path}-{name}` — a different
//! separator over a different spelling. Nothing matched, so Reach rendered
//! blank for every MCP row.
//!
//! Recomputing the key on either side is what let the two drift. The contract
//! asserted here is that the id the frontend receives *is* the stored key.

use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;
use tauri_app_lib::domain::{Scope, Tool};
use tauri_app_lib::preferences::PreferencesStore;

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

fn fresh_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(name);
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn tool_at(config_path: &str, name: &str) -> Tool {
    Tool {
        id: String::new(),
        name: name.into(),
        command: "npx".into(),
        args: vec![],
        launch_display: String::new(),
        transport: "stdio".into(),
        config_path: config_path.into(),
        scope: Scope::Global { agent: "claude-code".into() },
        owning_agent: "claude-code".into(),
        drifted: None,
        is_symlink: None,
        source_path: None,
        parse_status: Some("ok".into()),
        parse_error: None,
        link_state: None,
    }
}

#[test]
fn a_registrations_id_is_the_key_the_store_wrote() {
    let base = fresh_dir("hanger-regkey-id");
    let db = base.join("store.db");
    let store = PreferencesStore::new(&db).unwrap();

    let config = base.join("claude.json");
    fs::write(&config, "{}").unwrap();
    let raw = config.to_string_lossy().to_string();

    let root_id = store
        .upsert_root("engine_global", base.to_str().unwrap(), None, "fixture", now())
        .unwrap();

    // The scanner's global write path, verbatim (scanner.rs:1280).
    store
        .upsert_asset(
            root_id, None, "tool", "global", "srv",
            &format!("{}:{}", raw, "srv"),
            None, None, "ok", None, now(), now(),
        )
        .unwrap();

    let stored: String = Connection::open(&db)
        .unwrap()
        .query_row(
            "SELECT abs_path FROM assets WHERE category = 'tool'",
            [],
            |r| r.get(0),
        )
        .unwrap();

    assert_eq!(
        tool_at(&raw, "srv").registration_key().as_str(),
        stored,
        "the id the frontend joins annotations with must be the key the store wrote"
    );
}

/// A config file declares many servers. Two of them must not collapse.
#[test]
fn two_servers_in_one_file_are_two_keys() {
    let a = tool_at("/home/u/.claude.json", "github");
    let b = tool_at("/home/u/.claude.json", "linear");
    assert_ne!(a.registration_key(), b.registration_key());
}
