//! Scan-time symlink backfill — the reconciler record_deploy_link's doc
//! comment promises (preferences.rs). In the project walk, a symlink that
//! canonicalizes to a known asset in ANOTHER root becomes a `symlink` link
//! row and never an asset row: a link is not ownership (findings.md F26).
//!
//! Verification here is an accounting, not a row count: every symlink the
//! test plants is either matched to a link row or matched to its typed
//! decline reason. A target number would invite the backfill to invent rows.

use std::fs;
use std::os::unix::fs as unix_fs;
use std::path::PathBuf;
use tauri_app_lib::preferences::{PreferencesStore, WalkSymlinkOutcome};

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

/// One store root owning one skill-dir asset and one rule-file asset, plus
/// one project root. Returns (store, db_path, store_root_id, project_root_id,
/// skill_asset_id, rule_asset_id, store_abs, project_abs).
#[allow(clippy::type_complexity)]
fn seeded_store(base: &PathBuf) -> (PreferencesStore, PathBuf, i64, i64, i64, i64, PathBuf, PathBuf) {
    let db_path = base.join("store.db");
    let store = PreferencesStore::new(&db_path).unwrap();

    let store_dir = base.join("agents-store");
    let project_dir = base.join("project");
    fs::create_dir_all(store_dir.join("skills").join("deep-thought")).unwrap();
    fs::create_dir_all(store_dir.join("rules")).unwrap();
    fs::create_dir_all(&project_dir).unwrap();
    fs::write(
        store_dir.join("skills").join("deep-thought").join("SKILL.md"),
        "---\nname: deep-thought\ndescription: probe\n---\n",
    )
    .unwrap();
    fs::write(store_dir.join("rules").join("CLAUDE.md"), "# house rules").unwrap();

    let store_abs = fs::canonicalize(&store_dir).unwrap();
    let project_abs = fs::canonicalize(&project_dir).unwrap();

    let t = now();
    let store_root_id = store
        .upsert_root("engine_global", store_abs.to_str().unwrap(), None, ".agents", t)
        .unwrap();
    let project_root_id = store
        .upsert_root("project", project_abs.to_str().unwrap(), None, "project", t)
        .unwrap();

    let skill_dir_canon = fs::canonicalize(store_dir.join("skills").join("deep-thought")).unwrap();
    let skill_asset_id = store
        .upsert_asset(
            store_root_id, None, "skill", "global", "deep-thought",
            skill_dir_canon.to_str().unwrap(), None, None, "ok", None, t, t,
        )
        .unwrap();
    let rule_canon = fs::canonicalize(store_dir.join("rules").join("CLAUDE.md")).unwrap();
    let rule_asset_id = store
        .upsert_asset(
            store_root_id, None, "rule", "global", "CLAUDE.md",
            rule_canon.to_str().unwrap(), None, None, "ok", None, t, t,
        )
        .unwrap();

    (store, db_path, store_root_id, project_root_id, skill_asset_id, rule_asset_id, store_abs, project_abs)
}

#[test]
fn test_record_walk_symlink_outcomes_are_the_stated_reasons() {
    let base = fresh_dir("hanger_test_walk_symlink_outcomes");
    let (store, _db, _store_root, project_root_id, skill_asset_id, _rule, store_abs, project_abs) =
        seeded_store(&base);
    let t = now();

    let skill_target = store_abs.join("skills").join("deep-thought");

    // Cross-root symlink to a known asset: recorded.
    let link_path = project_abs.join(".claude-skills-deep-thought");
    let outcome = store
        .record_walk_symlink(
            project_root_id,
            link_path.to_str().unwrap(),
            skill_target.to_str().unwrap(),
            t,
        )
        .unwrap();
    let link_id = match outcome {
        WalkSymlinkOutcome::Recorded(id) => id,
        other => panic!("expected Recorded, got {:?}", other),
    };

    let conn = store.connect().unwrap();
    let (asset_id, dest_root_id, mechanism, created_at): (i64, i64, String, i64) = conn
        .query_row(
            "SELECT asset_id, dest_root_id, mechanism, created_at FROM links WHERE id = ?1",
            [link_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .unwrap();
    assert_eq!(asset_id, skill_asset_id, "the link points at the store's asset row");
    assert_eq!(dest_root_id, project_root_id, "the destination is the project root");
    assert_eq!(mechanism, "symlink");
    assert_eq!(created_at, t);

    // Re-offering the same symlink refreshes, never duplicates, and keeps
    // created_at as first-seen.
    let again = store
        .record_walk_symlink(
            project_root_id,
            link_path.to_str().unwrap(),
            skill_target.to_str().unwrap(),
            t + 100,
        )
        .unwrap();
    assert!(matches!(again, WalkSymlinkOutcome::Recorded(id) if id == link_id));
    let (rows, created_still): (i64, i64) = conn
        .query_row(
            "SELECT COUNT(*), MAX(created_at) FROM links WHERE asset_id = ?1",
            [skill_asset_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(rows, 1, "one symlink, one row");
    assert_eq!(created_still, t, "created_at records first discovery");

    // Target with no asset row: declined, nothing written. Hanger has not
    // scanned the source, and inventing a row here would repeat F26.
    let unknown = base.join("elsewhere.md");
    fs::write(&unknown, "not scanned").unwrap();
    let outcome = store
        .record_walk_symlink(
            project_root_id,
            project_abs.join("stray.md").to_str().unwrap(),
            unknown.to_str().unwrap(),
            t,
        )
        .unwrap();
    assert!(matches!(outcome, WalkSymlinkOutcome::TargetNotInStore));

    // Target owned by the destination root itself: nothing crosses a
    // boundary, so there is no edge to record.
    let intra = project_abs.join("local.md");
    fs::write(&intra, "local").unwrap();
    store
        .upsert_asset(
            project_root_id, None, "rule", "project", "local.md",
            fs::canonicalize(&intra).unwrap().to_str().unwrap(),
            None, None, "ok", None, t, t,
        )
        .unwrap();
    let outcome = store
        .record_walk_symlink(
            project_root_id,
            project_abs.join("alias.md").to_str().unwrap(),
            intra.to_str().unwrap(),
            t,
        )
        .unwrap();
    assert!(matches!(outcome, WalkSymlinkOutcome::TargetInSameRoot));

    let total_links: i64 = conn
        .query_row("SELECT COUNT(*) FROM links", [], |r| r.get(0))
        .unwrap();
    assert_eq!(total_links, 1, "only the cross-root symlink produced a row");
}

#[test]
fn test_project_walk_accounts_for_every_symlink_it_meets() {
    use tauri_app_lib::scanner::{DirectoryScanner, Scanner};

    let base = fresh_dir("hanger_test_walk_symlink_backfill");
    // Keep protected_roots() inside the sandbox so nothing in the real home
    // shapes the walk.
    std::env::set_var("HANGER_TEST_HOME", base.join("home").to_str().unwrap());
    fs::create_dir_all(base.join("home")).unwrap();

    let (store, db_path, store_root_id, _project_root, skill_asset_id, rule_asset_id, store_abs, project_abs) =
        seeded_store(&base);

    // The five symlinks the walk will meet, each with its expected fate:
    // 1. A skill DIRECTORY symlink — the deploy shape. The walker yields it
    //    but never descends (follow_links is off), so the dir entry is the
    //    only chance to record it.
    let skills_dir = project_abs.join(".claude").join("skills");
    fs::create_dir_all(&skills_dir).unwrap();
    let skill_link = skills_dir.join("deep-thought");
    unix_fs::symlink(store_abs.join("skills").join("deep-thought"), &skill_link).unwrap();

    // 2. A rule FILE symlink, which the walk also parses as a rule — the
    //    F26 fix keeps the asset row with the store while this records the
    //    edge.
    let rule_link = project_abs.join("CLAUDE.md");
    unix_fs::symlink(store_abs.join("rules").join("CLAUDE.md"), &rule_link).unwrap();

    // 3. A symlink to a file Hanger never scanned: no asset row, no link.
    let unscanned = base.join("unscanned.md");
    fs::write(&unscanned, "never scanned").unwrap();
    let stray_link = project_abs.join("stray.md");
    unix_fs::symlink(&unscanned, &stray_link).unwrap();

    // 4. A symlink resolving inside the project itself: no boundary crossed.
    fs::create_dir_all(project_abs.join("docs")).unwrap();
    let intra_link = project_abs.join("docs-alias");
    unix_fs::symlink(project_abs.join("docs"), &intra_link).unwrap();

    // 5. A dangling symlink: nothing to resolve, nothing to record.
    let broken_link = project_abs.join("broken.md");
    unix_fs::symlink(base.join("no-such-file.md"), &broken_link).unwrap();

    let scanner = DirectoryScanner {
        db_path: db_path.clone(),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    scanner.scan(&project_abs).expect("project walk");

    let conn = store.connect().unwrap();

    // The accounting: every planted symlink, matched to a row or a reason.
    let links: Vec<(i64, String, String)> = {
        let mut stmt = conn
            .prepare("SELECT asset_id, dest_path, mechanism FROM links ORDER BY dest_path")
            .unwrap();
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap();
        rows.flatten().collect()
    };

    // 1 → recorded against the skill asset.
    assert!(
        links.iter().any(|(a, d, m)| *a == skill_asset_id
            && d == skill_link.to_str().unwrap()
            && m == "symlink"),
        "skill dir symlink must be recorded: {:?}",
        links
    );
    // 2 → recorded against the rule asset.
    assert!(
        links.iter().any(|(a, d, m)| *a == rule_asset_id
            && d == rule_link.to_str().unwrap()
            && m == "symlink"),
        "rule file symlink must be recorded: {:?}",
        links
    );
    // 3, 4, 5 → declined for their stated reasons (TargetNotInStore,
    // TargetInSameRoot, unresolvable), pinned by the outcomes test above;
    // here they must simply produce no rows.
    for planted in [&stray_link, &intra_link, &broken_link] {
        assert!(
            !links.iter().any(|(_, d, _)| d == planted.to_str().unwrap()),
            "{} must not produce a link row",
            planted.display()
        );
    }
    assert_eq!(links.len(), 2, "exactly the two cross-root symlinks became rows");

    // F26 interplay: recording the edges must not have moved the asset rows.
    for asset_id in [skill_asset_id, rule_asset_id] {
        let root_id: i64 = conn
            .query_row("SELECT root_id FROM assets WHERE id = ?1", [asset_id], |r| r.get(0))
            .unwrap();
        assert_eq!(root_id, store_root_id, "the store still owns its asset row");
    }
}
