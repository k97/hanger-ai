// A linked directory that contains several repositories silently aggregates
// them into one sidebar row. The disclosure that fixes this is driven by
// nested_repo_candidates: qualifying directories found during the walk the
// scan already performs, so probing costs nothing extra.
//
// Qualification matches what the old start_repo_scan used: .git, .claude,
// .agents, .codex, .gemini, or any RULE_FILENAMES entry.

use std::fs;
use std::path::{Path, PathBuf};
use tauri_app_lib::scanner::{DirectoryScanner, Scanner};

fn fresh_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(name);
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

/// workspace/ holding four qualifying repos, one plain directory, one repo
/// buried in node_modules, and a loose rules file at the root itself.
fn build_workspace(base: &Path) -> PathBuf {
    let ws = base.join("workspace");

    fs::create_dir_all(ws.join("repo-git").join(".git")).unwrap();
    fs::create_dir_all(ws.join("repo-claude").join(".claude")).unwrap();
    fs::create_dir_all(ws.join("repo-codex").join(".codex")).unwrap();

    fs::create_dir_all(ws.join("repo-rules")).unwrap();
    fs::write(ws.join("repo-rules").join("CLAUDE.md"), "# rules\n").unwrap();

    // No marker of any kind: must not qualify.
    fs::create_dir_all(ws.join("plain-dir")).unwrap();

    // Excluded by is_excluded, despite carrying a .git marker.
    fs::create_dir_all(ws.join("node_modules").join("pkg").join(".git")).unwrap();

    // A rules file directly in the walk root. The root must not list itself.
    fs::write(ws.join("AGENTS.md"), "# root rules\n").unwrap();

    ws
}

fn candidates_for(ws: &Path, db: &Path) -> Vec<String> {
    let scanner = DirectoryScanner {
        db_path: db.to_path_buf(),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    let inventory = scanner.scan(ws).expect("scan should succeed");
    let scan = inventory
        .project_scans
        .first()
        .expect("walk must emit a ProjectScan");
    let mut found = scan.nested_repo_candidates.clone();
    found.sort();
    found
}

fn canonical(p: PathBuf) -> String {
    fs::canonicalize(&p)
        .unwrap_or(p)
        .to_string_lossy()
        .to_string()
}

#[test]
fn test_walk_collects_nested_repo_candidates() {
    let base = fresh_dir("hanger_test_nested_candidates");
    std::env::set_var("HANGER_TEST_HOME", base.join("home"));
    fs::create_dir_all(base.join("home")).unwrap();

    let ws = build_workspace(&base);
    let found = candidates_for(&ws, &base.join("store.db"));

    let mut expected = vec![
        canonical(ws.join("repo-claude")),
        canonical(ws.join("repo-codex")),
        canonical(ws.join("repo-git")),
        canonical(ws.join("repo-rules")),
    ];
    expected.sort();

    assert_eq!(
        found, expected,
        "every directory carrying an engine dir or a rules file must be a candidate"
    );
}

#[test]
fn test_walk_root_never_lists_itself() {
    let base = fresh_dir("hanger_test_nested_self");
    std::env::set_var("HANGER_TEST_HOME", base.join("home"));
    fs::create_dir_all(base.join("home")).unwrap();

    let ws = build_workspace(&base);
    let found = candidates_for(&ws, &base.join("store.db"));

    assert!(
        !found.contains(&canonical(ws.clone())),
        "the walk root qualifies via its own AGENTS.md but must never appear \
         in its own candidate list — it is already the linked root"
    );
}

#[test]
fn test_excluded_directories_yield_no_candidates() {
    // Control: node_modules/pkg carries a .git marker and would qualify on
    // markers alone. If this ever starts appearing, is_excluded stopped being
    // consulted rather than the qualification rule changing.
    let base = fresh_dir("hanger_test_nested_excluded");
    std::env::set_var("HANGER_TEST_HOME", base.join("home"));
    fs::create_dir_all(base.join("home")).unwrap();

    let ws = build_workspace(&base);
    let found = candidates_for(&ws, &base.join("store.db"));

    assert!(
        !found.iter().any(|c| c.contains("node_modules")),
        "excluded directories must not produce candidates, got: {:?}",
        found
    );
    assert!(
        !found.iter().any(|c| c.ends_with("plain-dir")),
        "a directory with no marker must not qualify, got: {:?}",
        found
    );
}
