// guard_engine_root rejects a path that IS (or sits inside) a protected engine
// root. It inspects only the path handed to it, never what lies beneath — and
// ~ itself is not protected, is_excluded does not filter .claude/.codex/
// .gemini/.agents, and the broad-root depth cap explicitly exempts those four
// names. So linking home as a project appears to walk the engine roots under
// it and re-parent their assets off the User Profile row, which is the same
// corruption class as the 2,328 stale rows purged by migration v2.
//
// The first test establishes whether that actually reproduces. The guard change
// is justified by it, not by the reading.

use std::fs;
use std::path::{Path, PathBuf};
use tauri_app_lib::scanner::{self, DirectoryScanner, Scanner};

fn fresh_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(name);
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

/// A home directory carrying a real Claude Code global config with one skill.
fn build_home(base: &Path) -> PathBuf {
    let home = base.join("home");
    let skill_dir = home.join(".claude").join("skills").join("demo-skill");
    fs::create_dir_all(&skill_dir).unwrap();
    fs::write(
        skill_dir.join("SKILL.md"),
        "---\nname: demo-skill\ndescription: Demo\nversion: 1.0.0\n---\n\nbody\n",
    )
    .unwrap();
    fs::write(home.join(".claude").join("settings.json"), "{}\n").unwrap();
    home
}

#[test]
fn test_linking_home_reparents_engine_assets_to_the_project_root() {
    let base = fresh_dir("hanger_test_home_hazard");
    let home = build_home(&base);
    std::env::set_var("HANGER_TEST_HOME", &home);

    let db = base.join("store.db");
    let scanner = DirectoryScanner {
        db_path: db.clone(),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };

    // Link home as a project, exactly as "Add repository…" on ~ would.
    let store = tauri_app_lib::preferences::PreferencesStore::new(&db).expect("store init");
    store
        .link_directory(home.to_str().unwrap())
        .expect("link home");

    scanner.scan(&home).expect("scan home as a project");

    let conn = store.connect().expect("connect");
    let home_canonical = fs::canonicalize(&home).unwrap().to_string_lossy().to_string();

    // Which root owns the skill that lives under ~/.claude?
    let owning_kind: String = conn
        .query_row(
            "SELECT r.kind FROM assets a
             JOIN roots r ON a.root_id = r.id
             WHERE a.name = 'demo-skill'",
            [],
            |r| r.get(0),
        )
        .expect("the skill under ~/.claude must be inventoried at all");

    let project_root_exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM roots WHERE kind = 'project' AND abs_path = ?1",
            [&home_canonical],
            |r| r.get(0),
        )
        .expect("project root query");
    assert_eq!(project_root_exists, 1, "home should be linked as a project root");

    assert_eq!(
        owning_kind, "engine_global",
        "an asset under ~/.claude must stay owned by the engine root. If this \
         reads 'project', linking ~ has re-parented engine assets onto the home \
         row and the guard must reject folders containing protected roots."
    );
}

#[test]
fn test_guard_rejects_directory_containing_protected_roots() {
    let base = fresh_dir("hanger_test_home_guard");
    let home = build_home(&base);
    std::env::set_var("HANGER_TEST_HOME", &home);

    let err = scanner::guard_engine_root(home.to_str().unwrap())
        .expect_err("a directory containing engine roots must be rejected");
    assert!(
        !err.is_empty(),
        "rejection must carry a message the UI can surface"
    );
}

#[test]
fn test_guard_still_permits_an_ordinary_project_directory() {
    // Control against over-blocking: widening the guard to look downward must
    // not start rejecting normal projects. A directory with a rules file and a
    // .git — but no engine root beneath it — stays linkable.
    let base = fresh_dir("hanger_test_home_guard_control");
    let home = build_home(&base);
    std::env::set_var("HANGER_TEST_HOME", &home);

    let project = base.join("workspace").join("ordinary-repo");
    fs::create_dir_all(project.join(".git")).unwrap();
    fs::write(project.join("CLAUDE.md"), "# rules\n").unwrap();

    assert!(
        scanner::guard_engine_root(project.to_str().unwrap()).is_ok(),
        "an ordinary project directory must remain linkable"
    );
}
