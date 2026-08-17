// Derived containers (a linked root is a container iff another linked root is
// a strict path-descendant of it) rest on prefix comparison, and prefix
// comparison is only sound on canonical paths. link_directory stored whatever
// the directory picker returned while the scan walk canonicalised, so a root
// linked through a symlink could never prefix-match its own children.
//
// These pin both halves: canonicalisation at link time, and the v3 backfill
// that repairs rows written before it.

use std::fs;
use std::os::unix::fs as unix_fs;
use std::path::PathBuf;
use tauri_app_lib::preferences::PreferencesStore;

fn fresh_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(name);
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

/// Builds `<base>/real/proj` and a `<base>/via -> <base>/real` symlink,
/// returning the canonical form of the real project directory.
fn symlinked_project(base: &PathBuf) -> (String, String) {
    let real = base.join("real");
    let real_proj = real.join("proj");
    fs::create_dir_all(&real_proj).unwrap();
    unix_fs::symlink(&real, base.join("via")).unwrap();

    let via_proj = base.join("via").join("proj").to_string_lossy().to_string();
    let canonical = fs::canonicalize(&real_proj)
        .unwrap()
        .to_string_lossy()
        .to_string();
    (via_proj, canonical)
}

fn linked_paths(store: &PreferencesStore) -> Vec<String> {
    store.get_linked_directories().expect("query linked dirs")
}

#[test]
fn test_link_directory_stores_canonical_path() {
    let base = fresh_dir("hanger_test_canonical_link");
    let (via_proj, canonical) = symlinked_project(&base);

    let store = PreferencesStore::new(&base.join("store.db")).expect("store init");

    // Link through the symlink, exactly as the directory picker would hand it over.
    store.link_directory(&via_proj).expect("link via symlink");

    assert_eq!(
        linked_paths(&store),
        vec![canonical],
        "link_directory must store the canonical path, not the symlinked one it was handed"
    );
}

#[test]
fn test_link_directory_leaves_nonexistent_path_intact() {
    // Control: canonicalize() fails on a path that does not exist. That must
    // degrade to storing the path as given, never to dropping or mangling it.
    let base = fresh_dir("hanger_test_canonical_missing");
    let store = PreferencesStore::new(&base.join("store.db")).expect("store init");

    let ghost = base.join("does-not-exist").to_string_lossy().to_string();
    store.link_directory(&ghost).expect("link nonexistent");

    assert_eq!(
        linked_paths(&store),
        vec![ghost],
        "a path that cannot be canonicalised must be stored verbatim"
    );
}

#[test]
fn test_v3_migration_backfills_non_canonical_root_paths() {
    let base = fresh_dir("hanger_test_canonical_backfill");
    let (via_proj, canonical) = symlinked_project(&base);
    let db = base.join("store.db");

    // Simulate a row written before link-time canonicalisation existed: insert
    // the symlinked path directly and wind user_version back to 2.
    {
        let store = PreferencesStore::new(&db).expect("store init");
        let conn = store.connect().expect("connect");
        conn.execute(
            "INSERT INTO roots (kind, abs_path, engine_id, label, added_at)
             VALUES ('project', ?1, NULL, 'proj', 1)",
            [&via_proj],
        )
        .expect("insert legacy root");
        conn.execute_batch("PRAGMA user_version = 2;")
            .expect("rewind version");
    }

    // Re-opening runs the v3 migration.
    let store = PreferencesStore::new(&db).expect("store migrate");
    let conn = store.connect().expect("connect");

    let version: i32 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .expect("version query");
    assert_eq!(version, 5, "migration must land on user_version 5");

    assert_eq!(
        linked_paths(&store),
        vec![canonical],
        "v3 must rewrite pre-existing non-canonical root paths"
    );
}

#[test]
fn test_v3_migration_merges_rows_that_canonicalise_to_the_same_path() {
    // roots.abs_path is UNIQUE. A store holding both the symlinked and the real
    // path for one directory would make a naive UPDATE violate the constraint,
    // failing the migration and leaving PreferencesStore::new unable to open
    // the database at all. The duplicate must be merged, not collided with.
    let base = fresh_dir("hanger_test_canonical_collision");
    let (via_proj, canonical) = symlinked_project(&base);
    let db = base.join("store.db");

    {
        let store = PreferencesStore::new(&db).expect("store init");
        let conn = store.connect().expect("connect");
        for (path, added_at) in [(&via_proj, 1), (&canonical, 2)] {
            conn.execute(
                &format!(
                    "INSERT INTO roots (kind, abs_path, engine_id, label, added_at)
                     VALUES ('project', ?1, NULL, 'proj', {})",
                    added_at
                ),
                [path],
            )
            .expect("insert root");
        }
        conn.execute_batch("PRAGMA user_version = 2;")
            .expect("rewind version");
    }

    let store = PreferencesStore::new(&db).expect("store must still open after v3");
    assert_eq!(
        linked_paths(&store),
        vec![canonical],
        "the two rows must collapse to one canonical root"
    );
}

#[test]
fn test_v3_migration_preserves_root_id_and_assets() {
    // The backfill must be an UPDATE, not a delete-and-reinsert: assets
    // reference roots(id), so a new id would orphan every asset under it.
    let base = fresh_dir("hanger_test_canonical_fk");
    let (via_proj, _canonical) = symlinked_project(&base);
    let db = base.join("store.db");
    let root_id: i64;

    {
        let store = PreferencesStore::new(&db).expect("store init");
        let conn = store.connect().expect("connect");
        conn.execute(
            "INSERT INTO roots (kind, abs_path, engine_id, label, added_at)
             VALUES ('project', ?1, NULL, 'proj', 1)",
            [&via_proj],
        )
        .expect("insert legacy root");
        root_id = conn.last_insert_rowid();

        let asset_path = format!("{}/CLAUDE.md", via_proj);
        conn.execute(
            &format!(
                "INSERT INTO assets (root_id, engine_id, category, scope, name, abs_path,
                                     version, content_hash, parse_status, parse_error,
                                     first_seen, last_seen)
                 VALUES ({}, NULL, 'rule', 'project', 'CLAUDE.md', ?1, NULL, NULL, 'ok', NULL, 1, 1)",
                root_id
            ),
            [&asset_path],
        )
        .expect("insert asset");

        conn.execute_batch("PRAGMA user_version = 2;")
            .expect("rewind version");
    }

    let store = PreferencesStore::new(&db).expect("store migrate");
    let conn = store.connect().expect("connect");

    let surviving_id: i64 = conn
        .query_row("SELECT id FROM roots WHERE kind = 'project'", [], |r| {
            r.get(0)
        })
        .expect("root survives");
    assert_eq!(
        surviving_id, root_id,
        "v3 must update in place, preserving roots.id"
    );

    let asset_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM assets WHERE root_id = ?1",
            [root_id],
            |r| r.get(0),
        )
        .expect("asset count");
    assert_eq!(asset_count, 1, "assets under the migrated root must survive");
}
