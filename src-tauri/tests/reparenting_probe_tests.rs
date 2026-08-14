//! Empirical probe for the upsert_asset re-parenting defect (findings.md F26).
//!
//! The project walk canonicalizes a symlinked asset's path before upserting
//! (scanner.rs::canonicalize_asset_path resolves symlinks), so a store asset
//! symlinked into a project arrives at upsert_asset carrying the STORE's
//! canonical path with the PROJECT's root_id and scope="project". This probe
//! exercises exactly that call sequence against the store API and documents
//! what happens today.
//!
//! These tests assert the DEFECTIVE behaviour on purpose — they are evidence,
//! not endorsement. When the fix lands they must flip and become its
//! red/green pair.

use tauri_app_lib::preferences::PreferencesStore;
use tauri_app_lib::scanner::count_assets;

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

#[test]
fn test_project_walk_upsert_steals_store_row_and_leaves_scope_frozen() {
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
    let store_counts = count_assets(&db_path, Some(store_abs.to_str().unwrap())).unwrap();
    let project_counts = count_assets(&db_path, Some(project_abs.to_str().unwrap())).unwrap();
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

    // 2. DEFECT, asserted as present: the project stole the row's root_id...
    let (root_id, scope): (i64, String) = conn
        .query_row(
            "SELECT root_id, scope FROM assets WHERE id = ?1",
            [global_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(
        root_id, project_root_id,
        "DOCUMENTED DEFECT: last walk wins root_id — the store's row is re-parented to the project"
    );
    // 3. ...while scope stayed frozen at INSERT, leaving an incoherent pair.
    assert_eq!(
        scope, "global",
        "scope is frozen at INSERT, so the stolen row reads scope=global under a project root"
    );

    // 4. Counting consequence: the store's count silently loses the asset,
    //    and the project's count gains it — in the GLOBAL bucket.
    let store_counts_after = count_assets(&db_path, Some(store_abs.to_str().unwrap())).unwrap();
    let project_counts_after = count_assets(&db_path, Some(project_abs.to_str().unwrap())).unwrap();
    assert_eq!(
        store_counts_after.total_assets, 0,
        "DOCUMENTED DEFECT: the store no longer counts its own asset"
    );
    assert_eq!(
        project_counts_after.total_assets, 1,
        "the project now counts the store's asset"
    );
    let skills = project_counts_after.skill.expect("skill bucket exists");
    assert_eq!(
        (skills.global, skills.project),
        (1, 0),
        "the stolen row lands in the project's GLOBAL bucket — the incoherent pair made visible"
    );
}
