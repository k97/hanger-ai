//! Guard for the upsert_asset re-parenting fix (findings.md F26).
//!
//! The project walk canonicalizes a symlinked asset's path before upserting
//! (scanner.rs::canonicalize_asset_path resolves symlinks), so a store asset
//! symlinked into a project arrives at upsert_asset carrying the STORE's
//! canonical path with the PROJECT's root_id and scope="project". Before the
//! fix, the update branch re-parented the existing row to the project while
//! scope stayed frozen at INSERT — the store's count silently lost the asset
//! and the project gained it in its *global* bucket (the 121-vs-329 class of
//! disagreement).
//!
//! The rule now guarded: when the existing row's canonical path lies outside
//! every project root, the row keeps its root_id. A project walk that reaches
//! a path outside all project roots has, by definition, followed a symlink
//! out of the project — that is a link to record, never a row to steal.

use tauri_app_lib::preferences::PreferencesStore;
use tauri_app_lib::scanner::{count_assets, Grouping};

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

#[test]
fn test_project_walk_upsert_leaves_store_row_with_the_store() {
    let tmp = tempfile::tempdir().unwrap();
    let db_path = tmp.path().join("probe.db");
    let store = PreferencesStore::new(&db_path).unwrap();

    // A store root and a project root, both real directories.
    let store_dir = tmp.path().join("agents-store");
    let project_dir = tmp.path().join("project");
    std::fs::create_dir_all(store_dir.join("skills")).unwrap();
    std::fs::create_dir_all(&project_dir).unwrap();
    let store_abs = std::fs::canonicalize(&store_dir).unwrap();
    let project_abs = std::fs::canonicalize(&project_dir).unwrap();

    let t = now();
    let store_root_id = store
        .upsert_root("engine_global", store_abs.to_str().unwrap(), None, ".agents", t)
        .unwrap();
    let project_root_id = store
        .upsert_root("project", project_abs.to_str().unwrap(), None, "project", t)
        .unwrap();

    // The canonical asset, discovered first by the global walk.
    let asset_file = store_abs.join("skills").join("probe-skill.md");
    std::fs::write(&asset_file, "# probe").unwrap();
    let asset_abs = std::fs::canonicalize(&asset_file).unwrap();
    let asset_path = asset_abs.to_str().unwrap();

    let global_id = store
        .upsert_asset(
            store_root_id, None, "skill", "global", "probe-skill.md", asset_path,
            None, None, "ok", None, t, t,
        )
        .unwrap();

    // Baseline: the store owns it, the project does not.
    let store_counts = count_assets(&db_path, Some(store_abs.to_str().unwrap()), Grouping::PerRegistration).unwrap();
    let project_counts = count_assets(&db_path, Some(project_abs.to_str().unwrap()), Grouping::PerRegistration).unwrap();
    assert_eq!(store_counts.total_assets, 1, "store owns the asset before the project walk");
    assert_eq!(project_counts.total_assets, 0, "project owns nothing before the project walk");

    // The project walk finds a symlink to it inside the project and — after
    // canonicalize_asset_path resolves the link — upserts the STORE path
    // under the PROJECT root with scope="project". This is the exact call
    // shape scanner.rs produces for a deployed symlink.
    let project_walk_id = store
        .upsert_asset(
            project_root_id, None, "skill", "project", "probe-skill.md", asset_path,
            None, None, "ok", None, t + 1, t + 1,
        )
        .unwrap();

    // 1. Not a second row: abs_path dedup returns the same row.
    assert_eq!(
        global_id, project_walk_id,
        "dedup by abs_path must return the existing store row, not create a second one"
    );
    let conn = store.connect().unwrap();
    let row_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM assets", [], |r| r.get(0))
        .unwrap();
    assert_eq!(row_count, 1, "exactly one asset row exists for one canonical file");

    // 2. THE FIX: the canonical path lies outside every project root, so the
    //    row keeps the store's root_id — the project walk records nothing here.
    let (root_id, scope): (i64, String) = conn
        .query_row(
            "SELECT root_id, scope FROM assets WHERE id = ?1",
            [global_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(
        root_id, store_root_id,
        "a project walk over a symlink must not steal the store row's root_id"
    );
    // 3. scope stays global — and now agrees with the root it sits under.
    assert_eq!(
        scope, "global",
        "scope=global under the store root is the coherent pair the fix restores"
    );

    // 4. Counting consequence: both counts survive the project walk unchanged.
    let store_counts_after = count_assets(&db_path, Some(store_abs.to_str().unwrap()), Grouping::PerRegistration).unwrap();
    let project_counts_after = count_assets(&db_path, Some(project_abs.to_str().unwrap()), Grouping::PerRegistration).unwrap();
    assert_eq!(
        store_counts_after.total_assets, 1,
        "the store still counts its own asset after the project walk"
    );
    assert_eq!(
        project_counts_after.total_assets, 0,
        "the project counts nothing it does not own"
    );

    // 5. A later global walk over the same path is still an ordinary refresh,
    //    not a fight: root_id stays with the store.
    store
        .upsert_asset(
            store_root_id, None, "skill", "global", "probe-skill.md", asset_path,
            None, None, "ok", None, t + 2, t + 2,
        )
        .unwrap();
    let root_id_after: i64 = conn
        .query_row("SELECT root_id FROM assets WHERE id = ?1", [global_id], |r| r.get(0))
        .unwrap();
    assert_eq!(root_id_after, store_root_id, "global walk keeps the row with the store");
}

/// A genuine project asset must still follow the deepest-root doctrine: the
/// fix only bites when the canonical path is outside every project root.
#[test]
fn test_genuine_project_asset_still_reparents_to_the_deepest_root() {
    let tmp = tempfile::tempdir().unwrap();
    let db_path = tmp.path().join("probe.db");
    let store = PreferencesStore::new(&db_path).unwrap();

    // An outer project and a nested inner project, both linked as roots.
    let outer = tmp.path().join("outer");
    let inner = outer.join("inner");
    std::fs::create_dir_all(&inner).unwrap();
    let outer_abs = std::fs::canonicalize(&outer).unwrap();
    let inner_abs = std::fs::canonicalize(&inner).unwrap();

    let t = now();
    let outer_id = store
        .upsert_root("project", outer_abs.to_str().unwrap(), None, "outer", t)
        .unwrap();
    let inner_id = store
        .upsert_root("project", inner_abs.to_str().unwrap(), None, "inner", t)
        .unwrap();

    let asset_file = inner_abs.join("CLAUDE.md");
    std::fs::write(&asset_file, "# rule").unwrap();
    let asset_path = asset_file.to_str().unwrap();

    // The outer walk reaches the file first and passes its own root id; the
    // deepest-root resolution must place the row under the inner project.
    let id = store
        .upsert_asset(
            outer_id, None, "rule", "project", "CLAUDE.md", asset_path,
            None, None, "ok", None, t, t,
        )
        .unwrap();

    let conn = store.connect().unwrap();
    let root_id: i64 = conn
        .query_row("SELECT root_id FROM assets WHERE id = ?1", [id], |r| r.get(0))
        .unwrap();
    assert_eq!(root_id, inner_id, "a path inside project roots still resolves to the deepest one");
}

/// Real-machine accounting, run by hand against a COPY of the live store:
///
/// ```sh
/// cp ~/Library/Application\ Support/com.rkarthik.hanger/hanger.db /tmp/f26-copy.db
/// HANGER_F26_DB=/tmp/f26-copy.db cargo test --test reparenting_probe_tests -- --ignored --nocapture
/// ```
///
/// Prints per-root totals, re-runs the app's own walk sequence (every linked
/// directory, exactly as run_scan does) against the copy, and prints the
/// totals again. Never touches the live database.
#[test]
#[ignore]
fn f26_real_store_before_and_after_rescan() {
    use std::path::{Path, PathBuf};
    use tauri_app_lib::scanner::{DirectoryScanner, Scanner};

    let db = match std::env::var("HANGER_F26_DB") {
        Ok(p) => PathBuf::from(p),
        Err(_) => {
            eprintln!("HANGER_F26_DB not set; skipping");
            return;
        }
    };

    let store = PreferencesStore::new(&db).expect("open store copy");
    let dirs = store.get_linked_directories().expect("linked dirs");

    let print_totals = |label: &str| {
        println!("== {label}");
        for dir in &dirs {
            let counts = count_assets(&db, Some(dir), Grouping::PerRegistration).expect("count");
            println!("{:>6}  {}", counts.total_assets, dir);
        }
        let all = count_assets(&db, None, Grouping::PerRegistration).expect("count all");
        println!("{:>6}  TOTAL", all.total_assets);
    };

    print_totals("before rescan");

    let scanner = DirectoryScanner {
        db_path: db.clone(),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    for dir in &dirs {
        let _ = scanner.scan(Path::new(dir));
    }

    print_totals("after rescan (fixed upsert)");
}
