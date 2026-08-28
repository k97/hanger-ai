use std::fs;
use std::sync::{Mutex, OnceLock};
use tauri_app_lib::scanner::{DirectoryScanner, Scanner};

static ENV_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();

fn scan_with(skill: &str, body: &str) -> tauri_app_lib::domain::Inventory {
    let temp_dir = tempfile::tempdir().unwrap();
    let root = temp_dir.path();
    let dir = root.join(skill);
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("SKILL.md"), body).unwrap();
    std::env::set_var("HANGER_TEST_HOME", root.to_string_lossy().to_string());
    let scanner = DirectoryScanner {
        db_path: root.join("hanger.db"),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    scanner.scan(root).unwrap()
}

/// A skill whose frontmatter declares no version must reach the frontend with
/// an empty version, not a manufactured one. The inspector's Version row and
/// the Flyout list's version chip are both truthy conditionals, so an empty
/// string removes them, while a sentinel like "v0.0.0-draft" renders as though
/// the file had declared it. 304 of 350 skills in the real store declare none.
#[test]
fn test_undeclared_skill_version_is_empty_not_invented() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();
    let inventory = scan_with(
        "no-version",
        "---\nname: no-version\ndescription: declares no version\n---\n\nBody.\n",
    );
    let skill = inventory
        .skills
        .iter()
        .find(|s| s.name == "no-version")
        .expect("the skill was scanned");
    assert_eq!(
        skill.version, "",
        "an undeclared version must be empty, not invented; got {:?}",
        skill.version
    );
}

/// The other half: a declared version is still carried through verbatim.
#[test]
fn test_declared_skill_version_survives() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();
    let inventory = scan_with(
        "has-version",
        "---\nname: has-version\ndescription: declares one\nversion: 2.1.0\n---\n\nBody.\n",
    );
    let skill = inventory
        .skills
        .iter()
        .find(|s| s.name == "has-version")
        .expect("the skill was scanned");
    assert_eq!(skill.version, "2.1.0");
}
