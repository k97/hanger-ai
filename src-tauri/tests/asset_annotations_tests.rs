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
use std::sync::{Mutex, OnceLock};
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
fn a_directory_link_reaches_every_asset_beneath_its_target() {
    // The shape real deployments use (ruled 2026-08-15): the project mounts
    // the store's skills directory wholesale — one symlink, no per-asset
    // link rows at all. Every asset beneath the mounted directory is in
    // that project; assets outside it are not.
    let f = fixture("hanger_test_ann_dirlink");
    let mount_parent = f.project_abs.join(".claude");
    fs::create_dir_all(&mount_parent).unwrap();
    unix_fs::symlink(f.store_abs.join("skills"), mount_parent.join("skills")).unwrap();

    // A store asset outside the mounted directory, to prove the boundary.
    fs::create_dir_all(f.store_abs.join("rules")).unwrap();
    fs::write(f.store_abs.join("rules").join("omega.md"), "# omega").unwrap();
    let omega_canon = fs::canonicalize(f.store_abs.join("rules").join("omega.md")).unwrap();
    let store_root_id: i64 = f
        .store
        .connect()
        .unwrap()
        .query_row(
            "SELECT id FROM roots WHERE abs_path = ?1",
            [f.store_abs.to_str().unwrap()],
            |r| r.get(0),
        )
        .unwrap();
    f.store
        .upsert_asset(
            store_root_id, None, "rule", "global", "omega.md",
            omega_canon.to_str().unwrap(), None, None, "ok", None, now(), now(),
        )
        .unwrap();

    let all = asset_annotations(&f.db_path).unwrap();

    let alpha = annotation_for(&all, "alpha.md");
    assert_eq!(alpha.mechanism, "symlink", "it travels by symlink, one level up");
    let note = alpha.beyond.as_ref().expect("dir-linked asset carries a note");
    assert_eq!(note.kind, "projects");
    assert_eq!(note.count, 1, "one project mounts the directory");
    assert_eq!(note.places, vec!["project".to_string()]);

    let omega = annotation_for(&all, "omega.md");
    assert_eq!(omega.mechanism, "none", "the mount does not cover rules/");
    assert!(omega.beyond.is_none());
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

// Task 3, fix round 1 (2026-08-29, overruling the task-3 brief): the two
// tests in ancestor_reach_tests.rs construct a BeyondNote by hand and assert
// it back to itself. Neither calls asset_annotations() or beyond_note(), so
// none of the ancestor-reach wiring added to asset_annotations() -- the
// `category == "tool"` gate, the `split_once(':')` recovery of the config
// path, the `ancestor_reach(...)` call, the `reached > 0` gate -- was
// exercised by any test. These two go through the real function.
//
// HANGER_TEST_HOME is process-global and every test in this binary shares
// one process (cargo's default threaded harness runs them concurrently), so
// a mutex serialises the two tests below and a Drop guard clears the
// variable afterwards -- the same hazard and the same fix as
// tests/ancestor_reach_tests.rs and tests/mcp_scanner_tests.rs.
static ANCESTOR_ENV_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();

struct AncestorTestHome;
impl Drop for AncestorTestHome {
    fn drop(&mut self) {
        std::env::remove_var("HANGER_TEST_HOME");
    }
}

/// Writes an ancestor `.mcp.json` declaring one server under `dir`, and
/// returns its canonical path.
fn write_ancestor_cfg(dir: &std::path::Path, server: &str) -> PathBuf {
    fs::create_dir_all(dir).unwrap();
    let p = dir.join(".mcp.json");
    fs::write(&p, format!(r#"{{"mcpServers": {{"{server}": {{"command": "/bin/true", "args": []}}}}}}"#)).unwrap();
    fs::canonicalize(&p).unwrap()
}

/// Registers one ancestor-config tool asset under `root_id`, in the shape
/// the scanner writes one in (`scanner.rs`, the `ancestors.registrations`
/// loop): `category = "tool"`, `scope = "global"`, `engine_id = None`
/// (rooted at the engine's global root, not the project), and `abs_path`
/// keyed as "config_path:server_name" -- `upsert_asset` splits that apart
/// and canonicalises the config half itself when `scope == "global"`.
fn register_ancestor_tool(store: &PreferencesStore, root_id: i64, config_path: &PathBuf, server: &str, t: i64) {
    let abs_path = format!("{}:{}", config_path.to_str().unwrap(), server);
    store
        .upsert_asset(root_id, None, "tool", "global", server, &abs_path, None, None, "ok", None, t, t)
        .unwrap();
}

/// A minimal engine_global root to attach ancestor tool assets to.
/// `asset_annotations` only annotates rows under `roots.kind =
/// 'engine_global'`, matching the comment at the ancestor registration site
/// in `scanner.rs`.
fn ancestor_engine_root(store: &PreferencesStore, base: &std::path::Path, t: i64) -> i64 {
    let claude_dir = base.join("claude-root");
    fs::create_dir_all(&claude_dir).unwrap();
    let claude_abs = fs::canonicalize(&claude_dir).unwrap();
    let claude_engine_id = store
        .upsert_engine("claude", "Claude Code", claude_abs.to_str().unwrap(), t)
        .unwrap();
    store
        .upsert_root("engine_global", claude_abs.to_str().unwrap(), Some(claude_engine_id), ".claude", t)
        .unwrap()
}

#[test]
fn an_ancestor_tool_asset_gets_a_note_with_the_shadowed_project_excluded() {
    let _lock = ANCESTOR_ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap_or_else(|e| e.into_inner());
    let _restore = AncestorTestHome;
    // Canonicalised, not the raw tempdir path: on macOS a tempdir sits under
    // `/var/folders/...`, a symlink to `/private/var/folders/...`, and
    // ancestor_reach checks `starts_with(home)` against canonical paths.
    let home_dir = tempfile::tempdir().unwrap();
    let home = fs::canonicalize(home_dir.path()).unwrap();
    std::env::set_var("HANGER_TEST_HOME", &home);

    let base = fresh_dir("hanger_test_ann_ancestor_reach");
    let db_path = base.join("store.db");
    let store = PreferencesStore::new(&db_path).unwrap();
    let t = now();
    let claude_root_id = ancestor_engine_root(&store, &base, t);

    let cfg = write_ancestor_cfg(&home.join("Work"), "shared-tools");
    let alpha = home.join("Work/alpha");
    let beta = home.join("Work/beta");
    let gamma = home.join("Work/gamma");
    for p in [&alpha, &beta, &gamma] {
        fs::create_dir_all(p).unwrap();
    }
    // beta declares its own server of the same name -- Claude Code connects
    // once, using the repo's definition, so beta is reached but shadowed.
    write_ancestor_cfg(&beta, "shared-tools");
    for (i, p) in [&alpha, &beta, &gamma].iter().enumerate() {
        store
            .upsert_root("project", p.to_str().unwrap(), None, &format!("project-{i}"), t)
            .unwrap();
    }

    register_ancestor_tool(&store, claude_root_id, &cfg, "shared-tools", t);

    let all = asset_annotations(&db_path).unwrap();
    let tool = annotation_for(&all, "shared-tools");
    let note = tool.beyond.as_ref().expect("an ancestor config reaching >0 projects carries a note");
    assert_eq!(note.kind, "ancestor_reach");
    assert_eq!(note.count, 3, "all three projects sit below the ancestor");
    assert_eq!(note.using_count, Some(2), "beta shadows it, so 2 of 3 actually use this definition");
}

/// Same shape as `ancestor_engine_root`, but keyed to `claude_ai` -- the
/// account-level connector Task 2 excludes. Returns `(root_id, engine_id)`
/// so a test can also stamp the asset's own `engine_id` with it: real
/// connector rows carry the engine on both the asset and its root.
fn claude_ai_engine_root(store: &PreferencesStore, base: &std::path::Path, t: i64) -> (i64, i64) {
    let dir = base.join("claude-ai-root");
    fs::create_dir_all(&dir).unwrap();
    let abs = fs::canonicalize(&dir).unwrap();
    let engine_id = store
        .upsert_engine("claude_ai", "Claude.ai", abs.to_str().unwrap(), t)
        .unwrap();
    let root_id = store
        .upsert_root("engine_global", abs.to_str().unwrap(), Some(engine_id), "Claude.ai", t)
        .unwrap();
    (root_id, engine_id)
}

/// Same shape as `register_ancestor_tool`, but lets a test stamp the asset's
/// own `engine_id` -- needed to register a claude_ai connector row, which
/// `register_ancestor_tool` always leaves `None`.
fn register_ancestor_tool_engined(
    store: &PreferencesStore,
    root_id: i64,
    engine_id: Option<i64>,
    config_path: &PathBuf,
    server: &str,
    t: i64,
) {
    let abs_path = format!("{}:{}", config_path.to_str().unwrap(), server);
    store
        .upsert_asset(root_id, engine_id, "tool", "global", server, &abs_path, None, None, "ok", None, t, t)
        .unwrap();
}

#[test]
fn an_ancestor_tool_asset_for_a_claude_ai_connector_gets_no_note() {
    // Task 2: account-level connectors run on Anthropic's servers, so
    // "Reaches N projects" is false for them regardless of where their
    // breadcrumb file sits. Same fixture shape as
    // `an_ancestor_tool_asset_gets_a_note_with_the_shadowed_project_excluded`
    // -- a config under home with real project roots beneath it -- so the
    // only variable is the asset's engine.
    let _lock = ANCESTOR_ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap_or_else(|e| e.into_inner());
    let _restore = AncestorTestHome;
    let home_dir = tempfile::tempdir().unwrap();
    let home = fs::canonicalize(home_dir.path()).unwrap();
    std::env::set_var("HANGER_TEST_HOME", &home);

    let base = fresh_dir("hanger_test_ann_ancestor_reach_claude_ai");
    let db_path = base.join("store.db");
    let store = PreferencesStore::new(&db_path).unwrap();
    let t = now();
    let (root_id, engine_id) = claude_ai_engine_root(&store, &base, t);

    let cfg = write_ancestor_cfg(&home.join("Work"), "connector-tool");
    let alpha = home.join("Work/alpha");
    let beta = home.join("Work/beta");
    for p in [&alpha, &beta] {
        fs::create_dir_all(p).unwrap();
    }
    for (i, p) in [&alpha, &beta].iter().enumerate() {
        store
            .upsert_root("project", p.to_str().unwrap(), None, &format!("connector-project-{i}"), t)
            .unwrap();
    }

    register_ancestor_tool_engined(&store, root_id, Some(engine_id), &cfg, "connector-tool", t);

    let all = asset_annotations(&db_path).unwrap();
    let tool = annotation_for(&all, "connector-tool");
    assert!(
        tool.beyond.is_none(),
        "a claude_ai (account-level) connector must never get an ancestor_reach note, \
         even though its config sits above two real project roots: {:?}",
        tool.beyond
    );
}

#[test]
fn a_tool_asset_reaching_no_project_gets_no_note() {
    let _lock = ANCESTOR_ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap_or_else(|e| e.into_inner());
    let _restore = AncestorTestHome;
    let home_dir = tempfile::tempdir().unwrap();
    let home = fs::canonicalize(home_dir.path()).unwrap();
    std::env::set_var("HANGER_TEST_HOME", &home);

    let base = fresh_dir("hanger_test_ann_ancestor_reach_none");
    let db_path = base.join("store.db");
    let store = PreferencesStore::new(&db_path).unwrap();
    let t = now();
    let claude_root_id = ancestor_engine_root(&store, &base, t);

    // A config under home with no project roots anywhere beneath it -- the
    // `reached > 0` gate has nothing else holding it.
    let cfg = write_ancestor_cfg(&home.join("Solo"), "lonely-tool");
    register_ancestor_tool(&store, claude_root_id, &cfg, "lonely-tool", t);

    let all = asset_annotations(&db_path).unwrap();
    let tool = annotation_for(&all, "lonely-tool");
    assert!(tool.beyond.is_none(), "reached == 0 gets no note, the same as any other asset with no destinations");
}
