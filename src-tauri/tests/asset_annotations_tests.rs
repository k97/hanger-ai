//! The get_asset_annotations contract (dispatch item 8, rulings 2026-08-15).
//!
//! Per-asset mechanism and reach are backend decisions, derived from the
//! filesystem and the links table at read time — never stored, never
//! recomputed in TypeScript. The frontend renders what it is given: a
//! mechanism word for the glyph, an engine reach list for the tiles, and a
//! "beyond the store" note whose count is backend-owned (the frontend
//! renders counts, it never computes them).

use std::fs;
use std::os::unix::fs as unix_fs;
use std::path::PathBuf;
use tauri_app_lib::annotations::{asset_annotations, AssetAnnotation};
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

struct Fixture {
    db_path: PathBuf,
    store: PreferencesStore,
    project_root_id: i64,
    store_abs: PathBuf,
    project_abs: PathBuf,
    claude_engine_id: i64,
}

/// A neutral store with three skill files, a Claude root whose `skills`
/// entry symlinks into the store, a Gemini root with no link, one project.
fn fixture(name: &str) -> Fixture {
    let base = fresh_dir(name);
    let db_path = base.join("store.db");
    let store = PreferencesStore::new(&db_path).unwrap();

    let store_dir = base.join("agents-store");
    let claude_dir = base.join("claude-root");
    let gemini_dir = base.join("gemini-root");
    let project_dir = base.join("project");
    fs::create_dir_all(store_dir.join("skills")).unwrap();
    fs::create_dir_all(&claude_dir).unwrap();
    fs::create_dir_all(&gemini_dir).unwrap();
    fs::create_dir_all(&project_dir).unwrap();
    for name in ["alpha.md", "beta.md", "delta.md"] {
        fs::write(store_dir.join("skills").join(name), format!("# {name}")).unwrap();
    }

    let store_abs = fs::canonicalize(&store_dir).unwrap();
    let claude_abs = fs::canonicalize(&claude_dir).unwrap();
    let gemini_abs = fs::canonicalize(&gemini_dir).unwrap();
    let project_abs = fs::canonicalize(&project_dir).unwrap();

    // The Claude root reaches the store through a root-level symlink; the
    // Gemini root links nothing.
    unix_fs::symlink(store_abs.join("skills"), claude_abs.join("skills")).unwrap();

    let t = now();
    let claude_engine_id = store
        .upsert_engine("claude", "Claude Code", claude_abs.to_str().unwrap(), t)
        .unwrap();
    let gemini_engine_id = store
        .upsert_engine("gemini", "Gemini CLI", gemini_abs.to_str().unwrap(), t)
        .unwrap();

    let store_root_id = store
        .upsert_root("engine_global", store_abs.to_str().unwrap(), None, ".agents", t)
        .unwrap();
    store
        .upsert_root("engine_global", claude_abs.to_str().unwrap(), Some(claude_engine_id), ".claude", t)
        .unwrap();
    store
        .upsert_root("engine_global", gemini_abs.to_str().unwrap(), Some(gemini_engine_id), ".gemini", t)
        .unwrap();
    let project_root_id = store
        .upsert_root("project", project_abs.to_str().unwrap(), None, "project", t)
        .unwrap();

    // alpha and beta read as any-agent; delta is Claude-format only.
    for (name, engine) in [("alpha.md", None), ("beta.md", None), ("delta.md", Some(claude_engine_id))] {
        let canon = fs::canonicalize(store_abs.join("skills").join(name)).unwrap();
        store
            .upsert_asset(
                store_root_id, engine, "skill", "global", name,
                canon.to_str().unwrap(), None, None, "ok", None, t, t,
            )
            .unwrap();
    }

    Fixture { db_path, store, project_root_id, store_abs, project_abs, claude_engine_id }
}

fn annotation_for<'a>(all: &'a [AssetAnnotation], name: &str) -> &'a AssetAnnotation {
    all.iter()
        .find(|a| a.asset_path.ends_with(name))
        .unwrap_or_else(|| panic!("no annotation for {name}: {all:?}"))
}

fn asset_id(store: &PreferencesStore, name: &str) -> i64 {
    store
        .connect()
        .unwrap()
        .query_row("SELECT id FROM assets WHERE name = ?1", [name], |r| r.get(0))
        .unwrap()
}

/// Deploy `name` into the project as a real symlink plus its link row.
fn symlink_deploy(f: &Fixture, name: &str) -> PathBuf {
    let src = f.store_abs.join("skills").join(name);
    let dest = f.project_abs.join(name);
    unix_fs::symlink(&src, &dest).unwrap();
    let outcome = f
        .store
        .record_walk_symlink(
            f.project_root_id,
            dest.to_str().unwrap(),
            fs::canonicalize(&src).unwrap().to_str().unwrap(),
            now(),
        )
        .unwrap();
    assert!(
        matches!(outcome, tauri_app_lib::preferences::WalkSymlinkOutcome::Recorded(_)),
        "fixture deploy must record"
    );
    dest
}

#[test]
fn a_symlink_deploy_reads_as_symlink_with_a_projects_note() {
    let f = fixture("hanger_test_ann_symlink");
    symlink_deploy(&f, "alpha.md");

    let all = asset_annotations(&f.db_path).unwrap();
    let alpha = annotation_for(&all, "alpha.md");

    assert_eq!(alpha.mechanism, "symlink");
    let note = alpha.beyond.as_ref().expect("deployed asset carries a note");
    assert_eq!(note.kind, "projects");
    assert_eq!(note.count, 1, "the note's count is backend-owned");
    assert_eq!(note.places, vec!["project".to_string()]);
}

#[test]
fn an_undeployed_asset_is_none_with_no_note() {
    let f = fixture("hanger_test_ann_none");

    let all = asset_annotations(&f.db_path).unwrap();
    let beta = annotation_for(&all, "beta.md");

    assert_eq!(beta.mechanism, "none");
    assert!(beta.beyond.is_none(), "nothing deployed, nothing to say");
}

#[test]
fn a_dangling_symlink_reads_as_broken_and_wins_precedence() {
    let f = fixture("hanger_test_ann_broken");
    let dest = symlink_deploy(&f, "alpha.md");
    fs::remove_file(&dest).unwrap();

    let all = asset_annotations(&f.db_path).unwrap();
    let alpha = annotation_for(&all, "alpha.md");

    assert_eq!(alpha.mechanism, "broken");
    let note = alpha.beyond.as_ref().unwrap();
    assert_eq!(note.kind, "broken");
    assert_eq!(note.count, 1);
}

#[test]
fn a_tracked_copy_whose_source_moved_on_reads_as_drift() {
    let f = fixture("hanger_test_ann_drift");
    let src = f.store_abs.join("skills").join("alpha.md");
    let dest = f.project_abs.join("alpha.md");
    fs::write(&dest, "# alpha").unwrap();
    let deploy_hash = blake3::hash(b"# alpha").to_hex().to_string();
    f.store
        .upsert_link(
            asset_id(&f.store, "alpha.md"),
            f.project_root_id,
            dest.to_str().unwrap(),
            "tracked_copy",
            &deploy_hash,
            Some(&deploy_hash),
            now(),
            None,
        )
        .unwrap();
    // The source has moved on since the copy was taken.
    fs::write(&src, "# alpha, edited").unwrap();

    let all = asset_annotations(&f.db_path).unwrap();
    let alpha = annotation_for(&all, "alpha.md");

    assert_eq!(alpha.mechanism, "drift");
    let note = alpha.beyond.as_ref().unwrap();
    assert_eq!(note.kind, "drifted");
    assert_eq!(note.places, vec!["project".to_string()]);
}

#[test]
fn an_intact_tracked_copy_reads_as_copy() {
    let f = fixture("hanger_test_ann_copy");
    let dest = f.project_abs.join("alpha.md");
    fs::write(&dest, "# alpha.md").unwrap();
    let hash = blake3::hash(b"# alpha.md").to_hex().to_string();
    f.store
        .upsert_link(
            asset_id(&f.store, "alpha.md"),
            f.project_root_id,
            dest.to_str().unwrap(),
            "tracked_copy",
            &hash,
            Some(&hash),
            now(),
            None,
        )
        .unwrap();

    let all = asset_annotations(&f.db_path).unwrap();
    let alpha = annotation_for(&all, "alpha.md");

    assert_eq!(alpha.mechanism, "copy");
    let note = alpha.beyond.as_ref().unwrap();
    assert_eq!(note.kind, "copies");
    assert_eq!(note.count, 1);
}

#[test]
fn reach_follows_engine_root_links_from_the_filesystem() {
    let f = fixture("hanger_test_ann_reach");

    let all = asset_annotations(&f.db_path).unwrap();
    let alpha = annotation_for(&all, "alpha.md");

    let claude = alpha.reach.iter().find(|r| r.engine_key == "claude").unwrap();
    assert!(claude.reached, "the Claude root links into the store");
    assert!(
        claude.via_root.as_deref().unwrap().ends_with("claude-root/skills"),
        "the chain names the root-level symlink: {:?}",
        claude.via_root
    );
    assert!(
        claude.via_store.as_deref().unwrap().contains("agents-store"),
        "the chain names where it resolves: {:?}",
        claude.via_store
    );

    let gemini = alpha.reach.iter().find(|r| r.engine_key == "gemini").unwrap();
    assert!(!gemini.reached);
    assert_eq!(gemini.reason.as_deref(), Some("root_not_linked"));
}

#[test]
fn reach_lists_only_engines_with_a_directory_root() {
    let f = fixture("hanger_test_ann_rootless");
    // An engine known to the registry but with no global root at all, and
    // one whose "root" is a config file: neither can hold a root link, so
    // the reach question does not apply to them.
    let t = now();
    f.store.upsert_engine("cursor", "Cursor", "/nonexistent", t).unwrap();
    let file_root = f.store_abs.join("claude.json");
    fs::write(&file_root, "{}").unwrap();
    let ai_id = f
        .store
        .upsert_engine("claude_ai", "Claude.ai", file_root.to_str().unwrap(), t)
        .unwrap();
    f.store
        .upsert_root("engine_global", file_root.to_str().unwrap(), Some(ai_id), "Claude.ai", t)
        .unwrap();

    let all = asset_annotations(&f.db_path).unwrap();
    let alpha = annotation_for(&all, "alpha.md");

    let keys: Vec<&str> = alpha.reach.iter().map(|r| r.engine_key.as_str()).collect();
    assert!(keys.contains(&"claude"), "directory-rooted engines stay: {keys:?}");
    assert!(keys.contains(&"gemini"), "unlinked but directory-rooted engines stay: {keys:?}");
    assert!(!keys.contains(&"cursor"), "no root, no reach question: {keys:?}");
    assert!(!keys.contains(&"claude_ai"), "a file root cannot hold a root link: {keys:?}");
}

#[test]
fn a_format_restricted_asset_reaches_only_its_own_engine() {
    let f = fixture("hanger_test_ann_format");

    let all = asset_annotations(&f.db_path).unwrap();
    let delta = annotation_for(&all, "delta.md");

    let claude = delta.reach.iter().find(|r| r.engine_key == "claude").unwrap();
    assert!(claude.reached, "its own engine reaches it through the linked root");
    assert_eq!(claude.engine_id, f.claude_engine_id);

    let gemini = delta.reach.iter().find(|r| r.engine_key == "gemini").unwrap();
    assert!(!gemini.reached);
    assert_eq!(
        gemini.reason.as_deref(),
        Some("format"),
        "an engine-specific format outranks the root question"
    );
}
