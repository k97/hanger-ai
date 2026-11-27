//! Reading Hanger's store from a second process: Hanger's own MCP server,
//! which an engine launches while the app may be open, mid-scan, or closed.
//!
//! Three things a second process must not do: create or migrate the store,
//! write to it, or hold a read long enough to make the app's writers give up
//! (rusqlite's default busy timeout is 5 s, and the store runs a rollback
//! journal, so a writer cannot commit while any reader holds SHARED).

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use rusqlite::Connection;
use tauri_app_lib::annotations::{asset_annotations, asset_annotations_on};
use tauri_app_lib::domain::{Inventory, Scope, Skill};
use tauri_app_lib::mcp::probe::{ProbeResult, ProbedTool};
use tauri_app_lib::mcp::switch::ops::{cached_measure, cached_measure_on};
use tauri_app_lib::preferences::{put_probe_result, PreferencesStore, LAST_SCAN_KEY};
use tauri_app_lib::scanner::{count_assets, count_assets_on, Grouping};
use tauri_app_lib::search::{index_inventory, search, search_on};
use tauri_app_lib::store_read::{last_scan_ms, open_read_only, with_read_deadline, StoreUnavailable, READ_DEADLINE};

fn now() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64
}

fn fresh_store() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("hanger.db");
    PreferencesStore::new(&db).unwrap();
    (dir, db)
}

#[test]
fn a_missing_store_is_not_scanned_yet_and_is_not_created() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("hanger.db");
    assert_eq!(open_read_only(&db).err(), Some(StoreUnavailable::NotScannedYet));
    assert!(!db.exists(), "a read-only open must not create the store");
}

#[test]
fn a_read_only_store_refuses_a_write() {
    let (_dir, db) = fresh_store();
    let conn = open_read_only(&db).unwrap();
    assert!(conn.execute("INSERT INTO preferences VALUES ('k','v')", []).is_err());
}

#[test]
fn a_store_at_another_version_is_refused_and_left_unmigrated() {
    let (_dir, db) = fresh_store();
    Connection::open(&db).unwrap().execute_batch("PRAGMA user_version = 7;").unwrap();

    assert_eq!(open_read_only(&db).err(), Some(StoreUnavailable::OtherVersion));

    let version: i32 = Connection::open(&db).unwrap().query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
    assert_eq!(version, 7, "the server must not migrate the store");
}

#[test]
fn a_read_waits_out_a_writer_holding_the_lock() {
    let (_dir, db) = fresh_store();
    let (held, wait_for_hold) = mpsc::channel();
    let writer_db = db.clone();
    let writer = thread::spawn(move || {
        let conn = Connection::open(&writer_db).unwrap();
        conn.execute_batch("BEGIN EXCLUSIVE;").unwrap();
        held.send(()).unwrap();
        // Longer than rusqlite's 5 s default, so the server's own 30 s
        // timeout is what this exercises.
        thread::sleep(Duration::from_secs(6));
        conn.execute_batch("COMMIT;").unwrap();
    });
    wait_for_hold.recv().unwrap();

    let started = Instant::now();
    let conn = open_read_only(&db).expect("the open waits for the writer");
    let last = last_scan_ms(&conn);
    let waited = started.elapsed();
    writer.join().unwrap();

    assert_eq!(last, Ok(None));
    assert!(waited >= Duration::from_millis(5500), "the read waited only {waited:?}");
}

/// 2,000 asset rows, so the unbounded query below has a table to cross.
fn store_with_assets(count: usize) -> (tempfile::TempDir, PathBuf) {
    let (dir, db) = fresh_store();
    let store = PreferencesStore::new(&db).unwrap();
    let root = store.upsert_root("engine_global", "/r", None, ".agents", now()).unwrap();
    let mut conn = store.connect().unwrap();
    let tx = conn.transaction().unwrap();
    for i in 0..count {
        PreferencesStore::upsert_asset_on(
            &tx, root, None, "skill", "global", &format!("s{i}"), &format!("/r/s{i}"),
            None, None, "ok", None, now(), now(),
        )
        .unwrap();
    }
    tx.commit().unwrap();
    (dir, db)
}

/// A query that runs until it is interrupted, reading `assets` the whole time
/// so the connection holds SHARED.
const ENDLESS: &str = "WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT count(*) FROM c, assets";

#[test]
fn an_app_write_succeeds_while_a_server_read_is_in_progress() {
    let (_dir, db) = store_with_assets(2000);
    let reader_db = db.clone();
    let reader = thread::spawn(move || {
        let conn = open_read_only(&reader_db).unwrap();
        with_read_deadline(&conn, READ_DEADLINE, |c| {
            c.query_row(ENDLESS, [], |r| r.get::<_, i64>(0)).map_err(|_| StoreUnavailable::Unreadable)
        })
    });

    thread::sleep(Duration::from_millis(200));
    let started = Instant::now();
    // The app's own writer, with rusqlite's default 5 s busy timeout.
    let write = PreferencesStore::new(&db).and_then(|s| s.set_preference("k", "v"));
    let took = started.elapsed();

    assert!(write.is_ok(), "the app's write failed: {write:?}");
    assert!(took < Duration::from_secs(5), "the write took {took:?}");
    assert_eq!(reader.join().unwrap(), Err(StoreUnavailable::Busy));
}

#[test]
fn a_store_never_scanned_has_no_last_scan() {
    let (_dir, db) = fresh_store();
    assert_eq!(last_scan_ms(&open_read_only(&db).unwrap()), Ok(None));
}

#[test]
fn a_scanned_store_reports_when() {
    let (_dir, db) = fresh_store();
    PreferencesStore::new(&db).unwrap().set_preference(LAST_SCAN_KEY, "1764230000000").unwrap();
    assert_eq!(last_scan_ms(&open_read_only(&db).unwrap()), Ok(Some(1_764_230_000_000)));
}

// ---- The `_on` variants against their path functions, in a child process,
// because `annotations` reads `HOME` through `scanner::get_home_dir()`.

/// Runs the `#[ignore]` helper `name` in a child of this test binary, with an
/// environment the test sets in full, and returns what it printed between
/// `<<<` and `>>>`.
fn run_child(name: &str, env: &[(&str, &Path)]) -> String {
    let mut cmd = Command::new(std::env::current_exe().unwrap());
    cmd.args(["--exact", name, "--ignored", "--nocapture", "--test-threads=1"]).env_clear();
    for (k, v) in env {
        cmd.env(k, v);
    }
    let out = cmd.output().unwrap();
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(out.status.success(), "child {name} failed:\n{stdout}\n{}", String::from_utf8_lossy(&out.stderr));
    let start = stdout.find("<<<").unwrap_or_else(|| panic!("child {name} printed no reply:\n{stdout}")) + 3;
    let end = stdout[start..].find(">>>").unwrap() + start;
    stdout[start..end].to_string()
}

fn skill(dir: &Path, name: &str) -> Skill {
    fs::create_dir_all(dir).unwrap();
    fs::write(dir.join("SKILL.md"), format!("---\nname: {name}\ndescription: d\n---\nbody\n")).unwrap();
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

#[test]
fn the_on_variants_answer_what_the_path_variants_answer() {
    let dir = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(dir.path()).unwrap();
    let home = root.join("home");
    let shared = home.join(".agents/skills");
    let claude = home.join(".claude");
    fs::create_dir_all(&shared).unwrap();
    fs::create_dir_all(&claude).unwrap();
    std::os::unix::fs::symlink(&shared, claude.join("skills")).unwrap();
    let db = root.join("hanger.db");
    let store = PreferencesStore::new(&db).unwrap();
    let t = now();
    let engine = store.upsert_engine("claude", "Claude Code", claude.to_str().unwrap(), t).unwrap();
    let store_root = store.upsert_root("engine_global", shared.parent().unwrap().to_str().unwrap(), None, ".agents", t).unwrap();
    store.upsert_root("engine_global", claude.to_str().unwrap(), Some(engine), ".claude", t).unwrap();
    let alpha = skill(&shared.join("alpha"), "alpha");
    for (name, eng) in [("alpha", None), ("beta", Some(engine))] {
        let p = shared.join(name);
        fs::create_dir_all(&p).unwrap();
        store.upsert_asset(store_root, eng, "skill", "global", name, p.to_str().unwrap(), None, None, "ok", None, t, t).unwrap();
    }
    index_inventory(&db, &Inventory { skills: vec![alpha], ..Default::default() }).unwrap();
    let probe = ProbeResult {
        tools: vec![ProbedTool { name: "t".into(), description: Some("does t".into()) }],
        ..Default::default()
    };
    put_probe_result(&db, "launch-1", &probe, None, None, None).unwrap();

    let reply = run_child(
        "child_the_on_variants_answer_what_the_path_variants_answer",
        &[("HOME", &home), ("HANGER_TEST_HOME", &home), ("STORE_READ_TEST_DB", &db)],
    );
    let pairs: Vec<(String, String)> = serde_json::from_str(&reply).unwrap();
    assert_eq!(pairs.len(), 5);
    for (path_answer, on_answer) in &pairs {
        assert_eq!(path_answer, on_answer);
    }
    assert!(pairs[2].0.contains("alpha"), "the search found the fixture skill: {}", pairs[2].0);
    assert!(pairs[3].0.contains("beta"), "annotations cover the fixture: {}", pairs[3].0);
    assert!(pairs[4].0.contains("tool_count: 1"), "the probe row was measured: {}", pairs[4].0);
}

#[test]
#[ignore = "child helper for the_on_variants_answer_what_the_path_variants_answer"]
fn child_the_on_variants_answer_what_the_path_variants_answer() {
    let db = PathBuf::from(std::env::var("STORE_READ_TEST_DB").unwrap());
    let conn = open_read_only(&db).unwrap();
    let json = |v: serde_json::Value| v.to_string();
    let pairs = vec![
        (
            json(serde_json::to_value(count_assets(&db, None, Grouping::PerRegistration).unwrap()).unwrap()),
            json(serde_json::to_value(count_assets_on(&conn, None, Grouping::PerRegistration).unwrap()).unwrap()),
        ),
        (
            json(serde_json::to_value(count_assets(&db, None, Grouping::Grouped).unwrap()).unwrap()),
            json(serde_json::to_value(count_assets_on(&conn, None, Grouping::Grouped).unwrap()).unwrap()),
        ),
        (
            json(serde_json::to_value(search(&db, "alpha", 10).unwrap()).unwrap()),
            json(serde_json::to_value(search_on(&conn, "alpha", 10).unwrap()).unwrap()),
        ),
        (
            json(serde_json::to_value(asset_annotations(&db).unwrap()).unwrap()),
            json(serde_json::to_value(asset_annotations_on(&conn).unwrap()).unwrap()),
        ),
        (format!("{:?}", cached_measure(&db, "launch-1")), format!("{:?}", cached_measure_on(&conn, "launch-1"))),
    ];
    println!("<<<{}>>>", serde_json::to_string(&pairs).unwrap());
}
