//! The reach half of spec §4.4, end to end.
//!
//! Ownership and reach are different questions with different answers.
//! `agent_attribution_tests` pins the ownership half: nobody owns `.agents/`.
//! This file pins the other half — an agent that reads the shared convention
//! reaches an asset there without any symlink, because reading the store
//! where it lies is what the convention *is*.
//!
//! Deliberately its own test binary. `HANGER_TEST_HOME` is process-global, so
//! a file that sets it must not share a process with one that does not.

use std::fs;
use std::os::unix::fs as unix_fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};

use tauri_app_lib::annotations::asset_annotations;
use tauri_app_lib::preferences::PreferencesStore;

/// Every test here points `HANGER_TEST_HOME` at a *different* home, and cargo
/// runs a binary's tests in parallel threads of one process. Without this the
/// race is real, not theoretical: one test's home is another's answer.
static ENV_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();

fn env_lock() -> MutexGuard<'static, ()> {
    ENV_MUTEX
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

fn fresh_home(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(name);
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    // Canonical from the start: macOS hands out /var/folders/… and resolves
    // it to /private/var/…, and every stored path is canonical.
    let dir = fs::canonicalize(&dir).unwrap();
    std::env::set_var("HANGER_TEST_HOME", &dir);
    dir
}

struct Reachable {
    db_path: PathBuf,
    store: PreferencesStore,
}

/// A home with a shared store holding one skill, an installed Zed (config
/// file only — it owns no directory), an installed Amp, and an installed
/// Codex. `store_dir` is where `~/.agents` actually resolves to, which is not
/// always `~/.agents` itself.
fn home_with_store(name: &str, store_dir_rel: Option<&str>) -> Reachable {
    let home = fresh_home(name);

    let store_dir = match store_dir_rel {
        // The ordinary case: ~/.agents is a real directory.
        None => home.join(".agents"),
        // The synced case: ~/.agents is a symlink into somewhere else, so
        // every stored path canonicalizes to the target and the literal
        // $HOME/.agents string appears in none of them.
        Some(rel) => {
            let target = home.join(rel);
            fs::create_dir_all(&target).unwrap();
            unix_fs::symlink(&target, home.join(".agents")).unwrap();
            target
        }
    };
    fs::create_dir_all(store_dir.join("skills/foo")).unwrap();
    fs::write(store_dir.join("skills/foo/SKILL.md"), "# foo").unwrap();

    fs::create_dir_all(home.join(".config/zed")).unwrap();
    fs::write(home.join(".config/zed/settings.json"), "{}").unwrap();
    fs::create_dir_all(home.join(".config/amp")).unwrap();
    fs::create_dir_all(home.join(".codex")).unwrap();

    let db_path = home.join("store.db");
    let store = PreferencesStore::new(&db_path).unwrap();
    let t = now();

    let store_root_id = store
        .upsert_root(
            "engine_global",
            tauri_app_lib::scanner::shared_agents_dir().to_str().unwrap(),
            None,
            ".agents",
            t,
        )
        .unwrap();

    for (key, display, root, is_file) in [
        ("zed", "Zed", home.join(".config/zed/settings.json"), true),
        ("amp", "Amp", home.join(".config/amp"), false),
        ("codex", "Codex", home.join(".codex"), false),
    ] {
        let engine_id = store
            .upsert_engine(key, display, root.to_str().unwrap(), t)
            .unwrap();
        store
            .upsert_root(
                "engine_global",
                root.to_str().unwrap(),
                Some(engine_id),
                display,
                t,
            )
            .unwrap();
        assert_eq!(root.is_file(), is_file, "fixture shape for {key}");
    }

    let canon = fs::canonicalize(store_dir.join("skills/foo/SKILL.md")).unwrap();
    store
        .upsert_asset(
            store_root_id, None, "skill", "global", "foo",
            canon.to_str().unwrap(), None, None, "ok", None, t, t,
        )
        .unwrap();

    Reachable { db_path, store }
}

fn reach_of(r: &Reachable) -> Vec<(String, bool, Option<String>)> {
    let all = asset_annotations(&r.db_path).unwrap();
    assert_eq!(all.len(), 1, "one asset, one annotation: {all:?}");
    all[0]
        .reach
        .iter()
        .map(|e| (e.engine_key.clone(), e.reached, e.reason.clone()))
        .collect()
}

fn tile<'a>(
    reach: &'a [(String, bool, Option<String>)],
    key: &str,
) -> &'a (String, bool, Option<String>) {
    reach
        .iter()
        .find(|(k, _, _)| k == key)
        .unwrap_or_else(|| panic!("no reach tile for {key}: {reach:?}"))
}

#[test]
fn a_convention_reader_reaches_the_shared_store_without_a_symlink() {
    let _guard = env_lock();
    let r = home_with_store("hanger_shared_reach_plain", None);
    let reach = reach_of(&r);

    // Amp's skills *are* ~/.agents/skills. Demanding one of its own roots be
    // a symlink into the store said the opposite: root_not_linked, on the
    // one directory it reads by default.
    let (_, amp_reached, amp_reason) = tile(&reach, "amp");
    assert!(*amp_reached, "Amp reads the shared convention: {reach:?}");
    assert_eq!(*amp_reason, None);

    // Codex does not adopt the convention, so nothing changed for it: no
    // link, no reach. This is what keeps the flag meaningful rather than a
    // blanket "everything in the store is reachable by everyone".
    let (_, codex_reached, codex_reason) = tile(&reach, "codex");
    assert!(!*codex_reached, "Codex declares reads_agents_dir: false");
    assert_eq!(codex_reason.as_deref(), Some("root_not_linked"));
}

#[test]
fn zed_appears_at_all_and_reaches_the_store_it_only_reads() {
    let _guard = env_lock();
    let r = home_with_store("hanger_shared_reach_zed", None);
    let reach = reach_of(&r);

    // The stronger half of the assertion. Zed owns no directory, so its root
    // is a config file, and the directory-root filter dropped it from the
    // tiles entirely — an engine the spec says appears throughout the UI
    // appeared nowhere in it.
    let (_, reached, reason) = tile(&reach, "zed");
    assert!(*reached, "Zed reads ~/.agents/skills directly: {reach:?}");
    assert_eq!(*reason, None);
}

#[test]
fn detection_finds_zed_by_its_config_file_and_claims_nothing_for_it() {
    let _guard = env_lock();
    let home = fresh_home("hanger_shared_reach_detect");
    fs::create_dir_all(home.join(".config/zed")).unwrap();

    let without = tauri_app_lib::scanner::get_global_agents();
    assert!(
        !without.iter().any(|a| a.id == "zed"),
        "an empty ~/.config/zed is not an installed Zed: {without:?}"
    );

    fs::write(home.join(".config/zed/settings.json"), "{}").unwrap();
    let with = tauri_app_lib::scanner::get_global_agents();
    let zed = with
        .iter()
        .find(|a| a.id == "zed")
        .unwrap_or_else(|| panic!("Zed must be detected by its settings file: {with:?}"));
    assert_eq!(
        zed.global_config_path.as_deref(),
        home.join(".config/zed/settings.json").to_str(),
    );

    // Detection is not ownership. The file that proves Zed is here is still
    // not a claim on anything, least of all on the shared store.
    assert!(
        tauri_app_lib::agents::engine_for_path(&home.join(".agents/skills/foo/SKILL.md")).is_none(),
        "reach must never leak into ownership"
    );
    assert!(
        tauri_app_lib::agents::config_for_id("zed").unwrap().global_roots.is_empty(),
        "Zed owns nothing (spec §4.4)"
    );
}

#[test]
fn a_symlinked_shared_container_is_still_the_shared_store() {
    let _guard = env_lock();
    // ~/.agents → ~/Dropbox/agent-standards. Stored paths canonicalize to the
    // target, so a check for a literal `.agents` component in the asset path
    // finds nothing and every convention reader silently loses its reach.
    let r = home_with_store("hanger_shared_reach_symlinked", Some("Dropbox/agent-standards"));
    let reach = reach_of(&r);

    assert!(tile(&reach, "amp").1, "Amp still reads the store: {reach:?}");
    assert!(tile(&reach, "zed").1, "Zed still reads the store: {reach:?}");
    assert!(!tile(&reach, "codex").1, "and Codex still does not");

    let all = asset_annotations(&r.db_path).unwrap();
    assert!(
        !all[0].asset_path.contains("/.agents/"),
        "the fixture must actually exercise the symlinked case, got {}",
        all[0].asset_path
    );
    drop(r.store);
}

#[test]
fn a_root_symlink_still_wins_the_explanation_when_there_is_one() {
    let _guard = env_lock();
    // Reach by convention is a fallback, not a replacement: when an engine
    // *does* link the store, the tile keeps naming the link, because "reached
    // via ~/.claude/skills" is a more useful answer than "reached somehow".
    let r = home_with_store("hanger_shared_reach_via_root", None);
    let home = PathBuf::from(std::env::var("HANGER_TEST_HOME").unwrap());
    let amp_link = home.join(".config/amp/skills");
    unix_fs::symlink(home.join(".agents/skills"), &amp_link).unwrap();
    assert!(Path::new(&amp_link).exists());

    let all = asset_annotations(&r.db_path).unwrap();
    let amp = all[0]
        .reach
        .iter()
        .find(|e| e.engine_key == "amp")
        .expect("Amp tile");
    assert!(amp.reached);
    assert_eq!(
        amp.via_root.as_deref(),
        amp_link.to_str(),
        "the link is the better explanation and must survive"
    );
}
