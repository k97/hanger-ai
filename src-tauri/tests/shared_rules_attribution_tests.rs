//! A rules file in the shared store belongs to the store, not to whichever
//! engine linked it or named it.
//!
//! v5 clears `engine_id` for every asset under `.agents/`. The rules passes
//! re-stamped a subset on the next walk, and the re-attribution rule in
//! `upsert_asset` — `(Some(existing), Some(new)) if existing != new` — makes
//! that permanent, so the migration's effect lasted exactly until the first
//! rescan. These pin the two halves that disagreed.
//!
//! Its own test binary: `HANGER_TEST_HOME` is process-global and every test
//! here points it somewhere different.

use std::fs;
use std::os::unix::fs as unix_fs;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard, OnceLock};

use tauri_app_lib::preferences::PreferencesStore;
use tauri_app_lib::scanner::{DirectoryScanner, Scanner};

static ENV_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();

fn env_lock() -> MutexGuard<'static, ()> {
    ENV_MUTEX
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

struct Bed {
    home: PathBuf,
    project: PathBuf,
    db_path: PathBuf,
}

fn bed(name: &str) -> Bed {
    let base = std::env::temp_dir().join(name);
    let _ = fs::remove_dir_all(&base);
    fs::create_dir_all(&base).unwrap();
    let base = fs::canonicalize(&base).unwrap();

    let home = base.join("home");
    let project = base.join("proj");
    fs::create_dir_all(&home).unwrap();
    fs::create_dir_all(&project).unwrap();
    std::env::set_var("HANGER_TEST_HOME", &home);

    Bed { home, project, db_path: base.join("hanger.db") }
}

fn scan(b: &Bed) {
    let scanner = DirectoryScanner {
        db_path: b.db_path.clone(),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    scanner.scan(&b.project).expect("scan must succeed");
}

/// `(name, engine_id)` for every rule row, so a missing row is a failed
/// lookup rather than a silently passing `is_none()`.
fn rule_rows(b: &Bed) -> Vec<(String, Option<i64>)> {
    let store = PreferencesStore::new(&b.db_path).unwrap();
    let conn = store.connect().unwrap();
    let mut stmt = conn
        .prepare("SELECT name, engine_id, abs_path FROM assets WHERE category = 'rule' ORDER BY abs_path")
        .unwrap();
    let rows: Vec<(String, Option<i64>)> = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<i64>>(1)?)))
        .unwrap()
        .flatten()
        .collect();
    rows
}

fn engine_of(rows: &[(String, Option<i64>)], name: &str) -> Option<i64> {
    let hit = rows
        .iter()
        .find(|(n, _)| n == name)
        .unwrap_or_else(|| panic!("no rule row for {name}: {rows:?}"));
    hit.1
}

#[test]
fn a_global_rules_file_resolving_into_the_shared_store_has_no_engine() {
    let _guard = env_lock();
    let b = bed("hanger_shared_rules_global");

    // ~/.claude/CLAUDE.md → ~/.agents/AGENTS.md. The stored path is the
    // target, so the row v5 clears and the row this walk writes are the same
    // row — and the walk used to stamp it `claude-code` every time.
    fs::create_dir_all(b.home.join(".agents")).unwrap();
    fs::create_dir_all(b.home.join(".claude")).unwrap();
    fs::write(b.home.join(".agents/AGENTS.md"), "# shared").unwrap();
    unix_fs::symlink(b.home.join(".agents/AGENTS.md"), b.home.join(".claude/CLAUDE.md")).unwrap();

    scan(&b);
    let rows = rule_rows(&b);
    assert_eq!(
        engine_of(&rows, "CLAUDE.md"),
        None,
        "a file in the shared store is the store's, not Claude Code's: {rows:?}"
    );
}

#[test]
fn a_vendor_named_rules_file_inside_a_projects_shared_dir_has_no_engine() {
    let _guard = env_lock();
    let b = bed("hanger_shared_rules_project");

    // `.cursorrules` says Cursor wherever it sits — except here. `.agents/`
    // is the shared store by definition, and the directory wins over the
    // filename: several agents read what is in it, and one engine's name on
    // it is the misattribution the whole branch removes.
    fs::create_dir_all(b.project.join(".agents")).unwrap();
    fs::write(b.project.join(".agents/.cursorrules"), "be careful").unwrap();
    fs::write(b.project.join(".cursorrules"), "be careful").unwrap();

    scan(&b);
    let rows = rule_rows(&b);
    assert_eq!(rows.len(), 2, "both files must be found at all: {rows:?}");

    let store = PreferencesStore::new(&b.db_path).unwrap();
    let conn = store.connect().unwrap();
    let in_shared: Option<i64> = conn
        .query_row(
            "SELECT engine_id FROM assets WHERE abs_path LIKE '%/.agents/.cursorrules'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let outside: Option<i64> = conn
        .query_row(
            "SELECT engine_id FROM assets WHERE abs_path NOT LIKE '%/.agents/%' AND name = '.cursorrules'",
            [],
            |r| r.get(0),
        )
        .unwrap();

    assert_eq!(in_shared, None, "the directory wins inside .agents/");
    assert!(
        outside.is_some(),
        "and filename attribution is untouched everywhere else"
    );
}

#[test]
fn the_migrations_effect_survives_a_rescan() {
    let _guard = env_lock();
    let b = bed("hanger_shared_rules_rescan");

    fs::create_dir_all(b.home.join(".agents")).unwrap();
    fs::create_dir_all(b.home.join(".claude")).unwrap();
    fs::write(b.home.join(".agents/AGENTS.md"), "# shared").unwrap();
    unix_fs::symlink(b.home.join(".agents/AGENTS.md"), b.home.join(".claude/CLAUDE.md")).unwrap();

    scan(&b);
    assert_eq!(engine_of(&rule_rows(&b), "CLAUDE.md"), None);

    // The pre-v5 state, put back by hand: a row already stamped with an
    // engine. v5 clears exactly this, and the question the review asked is
    // whether the next walk writes it straight back.
    {
        let store = PreferencesStore::new(&b.db_path).unwrap();
        let conn = store.connect().unwrap();
        let some_engine: i64 = conn
            .query_row("SELECT id FROM engines LIMIT 1", [], |r| r.get(0))
            .expect("the scan must have recorded at least one engine");
        conn.execute(
            "UPDATE assets SET engine_id = ?1 WHERE name = 'CLAUDE.md'",
            [some_engine],
        )
        .unwrap();
        assert!(engine_of(&rule_rows(&b), "CLAUDE.md").is_some(), "the seed must take");
    }

    scan(&b);
    assert_eq!(
        engine_of(&rule_rows(&b), "CLAUDE.md"),
        None,
        "the rescan must not re-stamp what the migration cleared"
    );
    scan(&b);
    assert_eq!(engine_of(&rule_rows(&b), "CLAUDE.md"), None, "and must stay cleared");
}

#[test]
fn a_symlinked_shared_container_is_still_recognised() {
    let _guard = env_lock();
    let b = bed("hanger_shared_rules_symlinked");

    // ~/.agents → ~/Dropbox/agent-standards. Stored paths canonicalize to the
    // target, so `LIKE '%/.agents/%'` misses entirely and the old container
    // comparison — a resolved target against an unresolved $HOME/.agents —
    // never fired. The users most likely to keep a shared store are exactly
    // the ones it failed for.
    let synced = b.home.join("Dropbox/agent-standards");
    fs::create_dir_all(&synced).unwrap();
    unix_fs::symlink(&synced, b.home.join(".agents")).unwrap();
    fs::create_dir_all(b.home.join(".claude")).unwrap();
    fs::write(synced.join("AGENTS.md"), "# shared").unwrap();
    unix_fs::symlink(synced.join("AGENTS.md"), b.home.join(".claude/CLAUDE.md")).unwrap();

    scan(&b);
    let rows = rule_rows(&b);
    assert_eq!(
        engine_of(&rows, "CLAUDE.md"),
        None,
        "a synced shared store is still the shared store: {rows:?}"
    );
}
