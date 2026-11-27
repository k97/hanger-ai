//! Antigravity CLI as its own engine, end to end through a scan.
//!
//! `agy` 1.5.18 reads `~/.gemini/config`, which sits inside Gemini CLI's
//! `~/.gemini`. Ownership splits by the longest root
//! (`agents::engine_for_path`), so every asset under `~/.gemini/config` is
//! Antigravity's and the rest of `~/.gemini` stays Gemini's. Plan:
//! `docs/plans/2026-11-27-antigravity-engine.md`, Task 1.
//!
//! Deliberately its own test binary: `HANGER_TEST_HOME` is process-global.

use std::fs;
use std::os::unix::fs as unix_fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};

use tauri_app_lib::preferences::PreferencesStore;
use tauri_app_lib::scanner::{DirectoryScanner, Scanner};

static ENV_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();

fn env_lock() -> MutexGuard<'static, ()> {
    ENV_MUTEX
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// A canonical temp base holding `home/` and `proj/`, with
/// `HANGER_TEST_HOME` pointed at the home.
fn fresh_base(name: &str) -> (PathBuf, PathBuf) {
    let base = std::env::temp_dir().join(name);
    let _ = fs::remove_dir_all(&base);
    fs::create_dir_all(base.join("home")).unwrap();
    fs::create_dir_all(base.join("proj")).unwrap();
    let base = fs::canonicalize(&base).unwrap();
    let home = base.join("home");
    std::env::set_var("HANGER_TEST_HOME", &home);
    (base, home)
}

fn write(home: &Path, rel: &str, body: &str) {
    let p = home.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, body).unwrap();
}

fn md(name: &str) -> String {
    format!("---\nname: {name}\ndescription: d\n---\n\nbody\n")
}

fn scan(base: &Path) -> (PathBuf, tauri_app_lib::domain::Inventory) {
    let db = base.join("store.db");
    let scanner = DirectoryScanner {
        db_path: db.clone(),
        cancellation_token: Arc::new(AtomicBool::new(false)),
    };
    let inventory = scanner.scan(&base.join("proj")).expect("scan");
    (db, inventory)
}

/// Engine key of every asset whose path ends with `suffix`, as `"NULL"` for
/// a store-owned row.
fn keys_at(db: &Path, category: &str, suffix: &str) -> Vec<String> {
    let conn = PreferencesStore::new(db).unwrap().connect().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT coalesce(e.key, 'NULL') FROM assets a LEFT JOIN engines e ON e.id = a.engine_id
             WHERE a.category = ?1 AND a.abs_path LIKE '%' || ?2",
        )
        .unwrap();
    let rows = stmt
        .query_map([category, suffix], |r| r.get::<_, String>(0))
        .unwrap()
        .map(Result::unwrap)
        .collect();
    rows
}

fn both_engines_home(home: &Path) {
    write(home, ".gemini/settings.json", r#"{"mcpServers":{"g1":{"command":"/usr/bin/true"}}}"#);
    write(home, ".gemini/GEMINI.md", "# rules\n");
    write(
        home,
        ".gemini/config/mcp_config.json",
        r#"{"mcpServers":{"a1":{"command":"/usr/bin/true"},"a2":{"command":"/usr/bin/true"}}}"#,
    );
    write(home, ".gemini/config/skills/real/SKILL.md", &md("real"));
    write(home, ".gemini/config/agents/sub.md", &md("sub"));
    write(home, ".gemini/config/plugins/p/agents/plug.md", &md("plug"));
}

#[test]
fn both_engines_file_each_asset_under_their_own_key() {
    let _g = env_lock();
    let (base, home) = fresh_base("hanger_antigravity_both");
    both_engines_home(&home);
    let (db, _) = scan(&base);

    assert_eq!(keys_at(&db, "tool", "/.gemini/settings.json:g1"), vec!["gemini"], "g1");
    assert_eq!(keys_at(&db, "rule", "/.gemini/GEMINI.md"), vec!["gemini"], "GEMINI.md");
    assert_eq!(keys_at(&db, "tool", "/.gemini/config/mcp_config.json:a1"), vec!["antigravity"], "a1");
    assert_eq!(keys_at(&db, "tool", "/.gemini/config/mcp_config.json:a2"), vec!["antigravity"], "a2");
    assert_eq!(keys_at(&db, "skill", "/.gemini/config/skills/real"), vec!["antigravity"], "skill real");
    assert_eq!(keys_at(&db, "subagent", "/.gemini/config/agents/sub.md"), vec!["antigravity"], "sub");
    assert_eq!(
        keys_at(&db, "subagent", "/.gemini/config/plugins/p/agents/plug.md"),
        vec!["antigravity"],
        "plug"
    );

    let conn = PreferencesStore::new(&db).unwrap().connect().unwrap();
    let misfiled: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM assets a JOIN engines e ON e.id = a.engine_id
             WHERE e.key = 'gemini' AND a.abs_path LIKE '%/.gemini/config/%'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(misfiled, 0, "an asset under ~/.gemini/config is still filed under gemini");
}

#[test]
fn the_two_rows_filed_under_gemini_move_on_the_next_scan() {
    let _g = env_lock();
    let (base, home) = fresh_base("hanger_antigravity_move");
    both_engines_home(&home);
    let plug = home.join(".gemini/config/plugins/p/agents/plug.md");
    let plug_str = plug.to_string_lossy().to_string();

    // The store as main's code left it: the plugin subagent under gemini.
    let db = base.join("store.db");
    {
        let store = PreferencesStore::new(&db).unwrap();
        let gemini_root = home.join(".gemini").to_string_lossy().to_string();
        let eid = store.upsert_engine("gemini", "Gemini / Antigravity", &gemini_root, 1).unwrap();
        let rid = store.upsert_root("engine_global", &gemini_root, Some(eid), "Gemini / Antigravity", 1).unwrap();
        store
            .upsert_asset(rid, Some(eid), "subagent", "global", "plug", &plug_str, None, None, "ok", None, 1, 1)
            .unwrap();
    }
    assert_eq!(keys_at(&db, "subagent", "/plugins/p/agents/plug.md"), vec!["gemini"], "seed");

    let (db, _) = scan(&base);

    assert_eq!(
        keys_at(&db, "subagent", "/plugins/p/agents/plug.md"),
        vec!["antigravity"],
        "the seeded row did not move to antigravity, or a second row appeared"
    );
    let conn = PreferencesStore::new(&db).unwrap().connect().unwrap();
    let root_path: String = conn
        .query_row(
            "SELECT r.abs_path FROM assets a JOIN roots r ON r.id = a.root_id WHERE a.abs_path = ?1",
            [&plug_str],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(root_path, home.join(".gemini/config").to_string_lossy());
}

#[test]
fn a_gemini_only_home_has_no_antigravity_engine() {
    let _g = env_lock();
    let (base, home) = fresh_base("hanger_antigravity_gemini_only");
    write(&home, ".gemini/settings.json", r#"{"mcpServers":{"g1":{"command":"/usr/bin/true"}}}"#);
    let (db, _) = scan(&base);

    let conn = PreferencesStore::new(&db).unwrap().connect().unwrap();
    let count = |key: &str| -> i64 {
        conn.query_row("SELECT COUNT(*) FROM engines WHERE key = ?1", [key], |r| r.get(0))
            .unwrap()
    };
    assert_eq!(count("gemini"), 1, "Gemini CLI should be detected by ~/.gemini");
    assert_eq!(count("antigravity"), 0, "no ~/.gemini/config, so no Antigravity CLI engine");
}

#[test]
fn symlinked_store_skills_in_the_config_dir_keep_their_owner() {
    let _g = env_lock();
    let (base, home) = fresh_base("hanger_antigravity_symlinks");
    write(&home, ".agents/skills/s/SKILL.md", &md("s"));
    fs::create_dir_all(home.join(".claude")).unwrap();
    unix_fs::symlink(home.join(".agents/skills"), home.join(".claude/skills")).unwrap();
    fs::create_dir_all(home.join(".gemini/config/skills")).unwrap();
    unix_fs::symlink("../../../.agents/skills/s", home.join(".gemini/config/skills/s")).unwrap();
    let (db, _) = scan(&base);

    let canonical = home.join(".agents/skills/s").to_string_lossy().to_string();
    let conn = PreferencesStore::new(&db).unwrap().connect().unwrap();
    let rows: Vec<(Option<i64>, String)> = conn
        .prepare(
            "SELECT a.engine_id, r.abs_path FROM assets a JOIN roots r ON r.id = a.root_id
             WHERE a.abs_path = ?1",
        )
        .unwrap()
        .query_map([&canonical], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap()
        .map(Result::unwrap)
        .collect();
    // Fails here, never passes on an empty query, if the fixture records nothing.
    assert_eq!(rows.len(), 1, "expected one store row at {canonical}, got {rows:?}");
    assert_eq!(rows[0].0, None, "the store row gained an engine: {rows:?}");
    assert_eq!(rows[0].1, home.join(".agents").to_string_lossy(), "the store row left the ~/.agents root");

    let under_config: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM assets WHERE abs_path LIKE '%/.gemini/config/skills/s%'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(under_config, 0, "the symlink itself was recorded as an asset");
}

#[test]
fn the_config_sweep_keeps_the_antigravity_host() {
    let _g = env_lock();
    let (base, home) = fresh_base("hanger_antigravity_sweep_host");
    both_engines_home(&home);
    let (_, inventory) = scan(&base);

    let a1: Vec<&str> = inventory
        .tools
        .iter()
        .filter(|t| t.name == "a1")
        .map(|t| t.owning_agent.as_str())
        .collect();
    assert_eq!(a1, vec!["antigravity"], "the sweep runs first and must carry the host id");
}

/// Per-kind counts for `shared-asset-machinery.md`, without writing the real
/// store: copy it, print the counts the copy holds (main's last scan), run
/// this branch's machine pass against the real home into the copy, and print
/// them again. Reaping is off by default (`HANGER_ENABLE_REAP`), so the copy
/// keeps every row main's scan wrote: the diff shows additions and moves
/// between engines, never losses. A row this branch would stop finding still
/// counts in "after". Run by hand (plan Task 1 Step 9):
/// `cargo test --test antigravity_engine_tests real_machine_counts_on_a_store_copy -- --ignored --nocapture`
#[test]
#[ignore]
fn real_machine_counts_on_a_store_copy() {
    let _g = env_lock();
    std::env::remove_var("HANGER_TEST_HOME");
    let home = PathBuf::from(std::env::var("HOME").unwrap());
    let real = home.join("Library/Application Support/com.rkarthik.hanger/hanger.db");
    let tmp = tempfile::tempdir().unwrap();
    let copy = tmp.path().join("hanger.db");
    let status = std::process::Command::new("sqlite3")
        .arg("-readonly")
        .arg("-cmd")
        .arg(".timeout 30000")
        .arg(&real)
        .arg(format!(".backup '{}'", copy.display()))
        .status()
        .unwrap();
    assert!(status.success(), "sqlite3 .backup failed");

    let print = |label: &str| {
        let conn = PreferencesStore::new(&copy).unwrap().connect().unwrap();
        println!("== {label}: category|scope|count");
        let mut s = conn
            .prepare("select category, scope, count(*) from assets group by category, scope order by category, scope")
            .unwrap();
        for row in s
            .query_map([], |r| Ok(format!("{}|{}|{}", r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?)))
            .unwrap()
        {
            println!("{}", row.unwrap());
        }
        println!("== {label}: engine|category|count");
        let mut s = conn
            .prepare("select coalesce(e.key,'NULL'), a.category, count(*) from assets a left join engines e on e.id=a.engine_id group by 1,2")
            .unwrap();
        for row in s
            .query_map([], |r| Ok(format!("{}|{}|{}", r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?)))
            .unwrap()
        {
            println!("{}", row.unwrap());
        }
    };

    print("before");
    let scanner = DirectoryScanner {
        db_path: copy.clone(),
        cancellation_token: Arc::new(AtomicBool::new(false)),
    };
    let _ = scanner.global_pass();
    print("after");
}
