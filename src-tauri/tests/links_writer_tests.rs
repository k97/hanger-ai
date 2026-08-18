//! The links writer chain (v4): migration, real upsert, deploy recording.
//!
//! The v3 fixture is built by hand at PRAGMA user_version = 3 with duplicate
//! (asset_id, dest_path) rows planted, because that is exactly the state the
//! INSERT-only upsert_link could produce. Opening the store must dedupe
//! keeping the newest row, pin the pair unique, backfill tracked copies from
//! deploy_checksums, land at user_version 4, then replay straight through to
//! v5 (`.agents/` misattribution clear) since that migration also runs on
//! open.

use rusqlite::{params, Connection};
use tauri_app_lib::preferences::PreferencesStore;

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

/// A store as v3 left it: schema per the v1 CREATEs, version stamped 3,
/// one root + one asset, duplicate link rows, one checksum row to backfill.
fn build_v3_fixture(db_path: &std::path::Path, store_dir: &std::path::Path, project_dir: &std::path::Path) {
    let conn = Connection::open(db_path).unwrap();
    conn.execute_batch(
        "CREATE TABLE engines (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             key TEXT UNIQUE NOT NULL,
             display_name TEXT NOT NULL,
             config_root TEXT NOT NULL,
             detected_at INTEGER NOT NULL
         );
         CREATE TABLE roots (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             kind TEXT NOT NULL,
             abs_path TEXT UNIQUE NOT NULL,
             engine_id INTEGER REFERENCES engines(id),
             label TEXT NOT NULL,
             added_at INTEGER NOT NULL
         );
         CREATE TABLE assets (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             root_id INTEGER NOT NULL REFERENCES roots(id),
             engine_id INTEGER REFERENCES engines(id),
             category TEXT NOT NULL,
             scope TEXT NOT NULL,
             name TEXT NOT NULL,
             abs_path TEXT NOT NULL,
             version TEXT,
             content_hash TEXT,
             parse_status TEXT NOT NULL,
             parse_error TEXT,
             first_seen INTEGER NOT NULL,
             last_seen INTEGER NOT NULL
         );
         CREATE TABLE links (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             asset_id INTEGER NOT NULL REFERENCES assets(id),
             dest_root_id INTEGER NOT NULL REFERENCES roots(id),
             dest_path TEXT NOT NULL,
             mechanism TEXT NOT NULL,
             source_hash TEXT NOT NULL,
             dest_hash TEXT,
             created_at INTEGER NOT NULL,
             last_verified_at INTEGER
         );
         CREATE TABLE deploy_checksums (
             source_path TEXT NOT NULL,
             destination_path TEXT NOT NULL,
             blake3_hash TEXT NOT NULL,
             PRIMARY KEY (source_path, destination_path)
         );
         PRAGMA user_version = 3;",
    )
    .unwrap();

    let t = now();
    let store_path = store_dir.to_str().unwrap();
    let project_path = project_dir.to_str().unwrap();
    conn.execute(
        "INSERT INTO roots (kind, abs_path, engine_id, label, added_at) VALUES ('engine_global', ?1, NULL, '.agents', ?2)",
        params![store_path, t],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO roots (kind, abs_path, engine_id, label, added_at) VALUES ('project', ?1, NULL, 'project', ?2)",
        params![project_path, t],
    )
    .unwrap();

    let asset_file = store_dir.join("skill.md");
    std::fs::write(&asset_file, "# v3 asset").unwrap();
    conn.execute(
        "INSERT INTO assets (root_id, engine_id, category, scope, name, abs_path, parse_status, first_seen, last_seen)
         VALUES (1, NULL, 'skill', 'global', 'skill.md', ?1, 'ok', ?2, ?2)",
        params![asset_file.to_str().unwrap(), t],
    )
    .unwrap();

    // Duplicate link rows for one (asset_id, dest_path) — the INSERT-only era.
    let dup_dest = project_dir.join("skill.md");
    for (i, hash) in ["old-hash", "mid-hash", "new-hash"].iter().enumerate() {
        conn.execute(
            "INSERT INTO links (asset_id, dest_root_id, dest_path, mechanism, source_hash, created_at)
             VALUES (1, 2, ?1, 'symlink', ?2, ?3)",
            params![dup_dest.to_str().unwrap(), hash, t + i as i64],
        )
        .unwrap();
    }

    // One checksummed copy deployment with no link row: the backfill target.
    let copy_dest = project_dir.join("copied-skill.md");
    std::fs::write(&copy_dest, "# copy").unwrap();
    conn.execute(
        "INSERT INTO deploy_checksums (source_path, destination_path, blake3_hash) VALUES (?1, ?2, 'copyhash')",
        params![asset_file.to_str().unwrap(), copy_dest.to_str().unwrap()],
    )
    .unwrap();
}

#[test]
fn test_v4_migration_dedupes_pins_unique_and_backfills_checksums() {
    let tmp = tempfile::tempdir().unwrap();
    let db_path = tmp.path().join("v3.db");
    let store_dir = tmp.path().join("store");
    let project_dir = tmp.path().join("project");
    std::fs::create_dir_all(&store_dir).unwrap();
    std::fs::create_dir_all(&project_dir).unwrap();
    build_v3_fixture(&db_path, &store_dir, &project_dir);

    // Opening the store runs the migration.
    let store = PreferencesStore::new(&db_path).unwrap();
    let conn = store.connect().unwrap();

    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
    assert_eq!(version, 6, "PRAGMA user_version must be 6 after migration");

    // Duplicates collapsed keeping the newest (source_hash 'new-hash').
    let dup_dest = project_dir.join("skill.md");
    let (count, surviving_hash): (i64, String) = conn
        .query_row(
            "SELECT COUNT(*), MAX(source_hash) FROM links WHERE dest_path = ?1",
            params![dup_dest.to_str().unwrap()],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(count, 1, "three duplicate rows collapse to one");
    assert_eq!(surviving_hash, "new-hash", "the newest row survives");

    // The unique index exists and enforces.
    let idx: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_links_asset_dest'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(idx, 1, "unique index on (asset_id, dest_path) exists");
    let raw_duplicate = conn.execute(
        "INSERT INTO links (asset_id, dest_root_id, dest_path, mechanism, source_hash, created_at)
         VALUES (1, 2, ?1, 'symlink', 'x', 0)",
        params![dup_dest.to_str().unwrap()],
    );
    assert!(raw_duplicate.is_err(), "a raw duplicate INSERT now violates the constraint");

    // The checksummed copy gained a link row: mechanism tracked_copy, the
    // stored hash carried over.
    let copy_dest = project_dir.join("copied-skill.md");
    let (mech, hash): (String, String) = conn
        .query_row(
            "SELECT mechanism, source_hash FROM links WHERE dest_path = ?1",
            params![copy_dest.to_str().unwrap()],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(mech, "tracked_copy");
    assert_eq!(hash, "copyhash");

    // Idempotent: reopening changes nothing.
    drop(conn);
    drop(store);
    let store2 = PreferencesStore::new(&db_path).unwrap();
    let conn2 = store2.connect().unwrap();
    let total: i64 = conn2.query_row("SELECT COUNT(*) FROM links", [], |r| r.get(0)).unwrap();
    assert_eq!(total, 2, "reopening the store does not grow links");
}

#[test]
fn test_redeploy_same_destination_is_one_row_with_created_at_preserved() {
    let tmp = tempfile::tempdir().unwrap();
    let store = PreferencesStore::new(&tmp.path().join("w.db")).unwrap();
    let t = now();

    let root_dir = tmp.path().join("store");
    let project_dir = tmp.path().join("project");
    std::fs::create_dir_all(&root_dir).unwrap();
    std::fs::create_dir_all(&project_dir).unwrap();
    let root_id = store
        .upsert_root("engine_global", root_dir.to_str().unwrap(), None, ".agents", t)
        .unwrap();
    let project_id = store
        .upsert_root("project", project_dir.to_str().unwrap(), None, "project", t)
        .unwrap();
    let asset_file = root_dir.join("a.md");
    std::fs::write(&asset_file, "# a").unwrap();
    let asset_id = store
        .upsert_asset(root_id, None, "skill", "global", "a.md", asset_file.to_str().unwrap(), None, None, "ok", None, t, t)
        .unwrap();

    let dest = project_dir.join("a.md");
    let first = store
        .upsert_link(asset_id, project_id, dest.to_str().unwrap(), "symlink", "h1", None, t, Some(t))
        .unwrap();
    let second = store
        .upsert_link(asset_id, project_id, dest.to_str().unwrap(), "tracked_copy", "h2", None, t + 100, Some(t + 100))
        .unwrap();
    assert_eq!(first, second, "re-deploy updates the same row");

    let conn = store.connect().unwrap();
    let (count, mech, created, verified): (i64, String, i64, i64) = conn
        .query_row(
            "SELECT COUNT(*), mechanism, created_at, last_verified_at FROM links WHERE asset_id = ?1",
            params![asset_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .unwrap();
    assert_eq!(count, 1, "no duplicate row on re-deploy");
    assert_eq!(mech, "tracked_copy", "mechanism refreshed");
    assert_eq!(created, t, "created_at records the FIRST deployment");
    assert_eq!(verified, t + 100, "last_verified_at advanced");
}

#[test]
fn test_record_deploy_link_resolves_or_declines() {
    let tmp = tempfile::tempdir().unwrap();
    let store = PreferencesStore::new(&tmp.path().join("r.db")).unwrap();
    let t = now();

    let root_dir = tmp.path().join("store");
    let project_dir = tmp.path().join("project");
    std::fs::create_dir_all(&root_dir).unwrap();
    std::fs::create_dir_all(&project_dir).unwrap();
    let root_id = store
        .upsert_root("engine_global", root_dir.to_str().unwrap(), None, ".agents", t)
        .unwrap();
    let project_id = store
        .upsert_root("project", project_dir.to_str().unwrap(), None, "project", t)
        .unwrap();
    let asset_file = root_dir.join("b.md");
    std::fs::write(&asset_file, "# b").unwrap();
    store
        .upsert_asset(root_id, None, "skill", "global", "b.md", asset_file.to_str().unwrap(), None, None, "ok", None, t, t)
        .unwrap();

    // Scanned source, known destination root: records, with the right root.
    let dest = project_dir.join("b.md");
    let recorded = store
        .record_deploy_link(asset_file.to_str().unwrap(), dest.to_str().unwrap(), "symlink", "h", t)
        .unwrap();
    assert!(recorded.is_some(), "deploy of a scanned asset records a link");
    let conn = store.connect().unwrap();
    let dest_root: i64 = conn
        .query_row("SELECT dest_root_id FROM links WHERE id = ?1", params![recorded.unwrap()], |r| r.get(0))
        .unwrap();
    assert_eq!(dest_root, project_id, "destination resolved to the project root");

    // Unscanned source: declines rather than inventing an asset row (F26).
    let stranger = tmp.path().join("never-scanned.md");
    std::fs::write(&stranger, "# ?").unwrap();
    let declined = store
        .record_deploy_link(stranger.to_str().unwrap(), dest.to_str().unwrap(), "symlink", "h", t)
        .unwrap();
    assert!(declined.is_none(), "unscanned source records nothing");
    let total: i64 = conn.query_row("SELECT COUNT(*) FROM links", [], |r| r.get(0)).unwrap();
    assert_eq!(total, 1, "no partial rows for unresolvable deploys");
}

/// Real-machine accounting, run explicitly against a COPY of the live store:
///
///   cp "~/Library/Application Support/com.rkarthik.hanger/hanger.db" /tmp/copy.db
///   HANGER_ACCOUNTING_DB=/tmp/copy.db cargo test --test links_writer_tests -- --ignored --nocapture
///
/// Never pointed at the live DB — opening it migrates it.
#[test]
#[ignore]
fn accounting_against_store_copy() {
    let db = std::env::var("HANGER_ACCOUNTING_DB").expect("set HANGER_ACCOUNTING_DB to a COPY of the store");
    let store = PreferencesStore::new(std::path::Path::new(&db)).unwrap();
    let conn = store.connect().unwrap();

    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
    let checksums: i64 = conn.query_row("SELECT COUNT(*) FROM deploy_checksums", [], |r| r.get(0)).unwrap();
    let links: i64 = conn.query_row("SELECT COUNT(*) FROM links", [], |r| r.get(0)).unwrap();
    let backfilled: i64 = conn
        .query_row("SELECT COUNT(*) FROM links WHERE mechanism = 'tracked_copy'", [], |r| r.get(0))
        .unwrap();

    println!("user_version:            {version}");
    println!("deploy_checksums rows:   {checksums}");
    println!("links rows:              {links}");
    println!("  of which tracked_copy: {backfilled}");

    // Per-row accounting: every checksum row has a link row or a reason.
    let mut stmt = conn
        .prepare("SELECT source_path, destination_path FROM deploy_checksums")
        .unwrap();
    let rows: Vec<(String, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap()
        .flatten()
        .collect();
    for (src, dst) in rows {
        let linked: i64 = conn
            .query_row("SELECT COUNT(*) FROM links WHERE dest_path = ?1", params![dst], |r| r.get(0))
            .unwrap();
        if linked > 0 {
            println!("ACCOUNTED  {dst}");
        } else {
            let asset: i64 = conn
                .query_row("SELECT COUNT(*) FROM assets WHERE abs_path = ?1", params![src], |r| r.get(0))
                .unwrap();
            let reason = if asset == 0 {
                "source never scanned as an asset (no assets row)"
            } else {
                "destination outside every known root"
            };
            println!("UNACCOUNTED {dst} — {reason}");
        }
    }
    assert_eq!(version, 6, "PRAGMA user_version must be 6 after migration");
}
