use std::path::Path;
use std::sync::Mutex;
use tauri_app_lib::preferences::PreferencesStore;
use tauri_app_lib::scanner::{DirectoryScanner, Scanner};

static ENV_MUTEX: std::sync::OnceLock<Mutex<()>> = std::sync::OnceLock::new();

#[test]
fn test_unlink_fails_on_root_with_assets() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();
    std::env::set_var("HANGER_TEST_HOME", "tests/fixtures/home");

    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("unlink_test.db");

    let scanner = DirectoryScanner {
        db_path: db_path.clone(),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    let root_path = Path::new("tests/fixtures/project");

    let store = PreferencesStore::new(&db_path).expect("Store init failed");

    // Scan project into database to populate asset rows
    let scan_res = scanner.scan(root_path);
    assert!(scan_res.is_ok(), "Scan of project fixture must succeed");

    let conn = store.connect().unwrap();
    let (root_id, proj_str): (i64, String) = conn
        .query_row("SELECT id, abs_path FROM roots WHERE kind = 'project'", [], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap();

    let asset_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM assets WHERE root_id = ?1", [root_id], |r| r.get(0))
        .unwrap();
    assert!(asset_count > 0, "Root must have asset rows populated from scan");

    // Attempt to unlink directory
    let unlink_res = store.unlink_directory(&proj_str);

    // Intended post-conditions: unlink succeeds, root and assets deleted
    unlink_res.expect("unlink_directory must succeed transactionally");

    let roots_after: i64 = conn
        .query_row("SELECT COUNT(*) FROM roots WHERE abs_path = ?1 AND kind = 'project'", [&proj_str], |r| r.get(0))
        .unwrap();
    assert_eq!(roots_after, 0, "Root must be absent from roots table after unlink");

    let assets_after: i64 = conn
        .query_row("SELECT COUNT(*) FROM assets WHERE root_id = ?1", [root_id], |r| r.get(0))
        .unwrap();
    assert_eq!(assets_after, 0, "Assets for unlinked root must be absent from assets table");
}
