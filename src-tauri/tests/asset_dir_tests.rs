//! `list_asset_dir_of`: the "In this skill" card. The backend lists and
//! counts; the frontend renders what it is given.

use std::fs;
use tauri_app_lib::list_asset_dir_of;

fn fresh_dir(name: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(name);
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn lists_skill_md_first_then_entries_by_name_with_folder_file_counts() {
    let dir = fresh_dir("hanger_test_asset_dir");
    fs::write(dir.join("SKILL.md"), "0123456789").unwrap();
    fs::create_dir_all(dir.join("scripts")).unwrap();
    fs::write(dir.join("scripts/run.sh"), "#!/bin/sh").unwrap();
    fs::create_dir_all(dir.join("references/deep")).unwrap();
    fs::write(dir.join("references/a.md"), "a").unwrap();
    fs::write(dir.join("references/b.md"), "b").unwrap();
    fs::write(dir.join("references/deep/c.md"), "c").unwrap();
    fs::write(dir.join(".hidden"), "x").unwrap();

    let entries = list_asset_dir_of(&dir).unwrap();
    let rows: Vec<(String, String, Option<u64>, Option<usize>)> = entries
        .into_iter()
        .map(|e| (e.name, e.kind, e.bytes, e.file_count))
        .collect();
    assert_eq!(
        rows,
        vec![
            ("SKILL.md".to_string(), "file".to_string(), Some(10), None),
            ("references/".to_string(), "dir".to_string(), None, Some(3)),
            ("scripts/".to_string(), "dir".to_string(), None, Some(1)),
        ]
    );
}

#[test]
fn a_file_path_is_not_a_folder() {
    let dir = fresh_dir("hanger_test_asset_dir_file");
    let f = dir.join("SKILL.md");
    fs::write(&f, "x").unwrap();
    assert_eq!(list_asset_dir_of(&f).unwrap_err(), "Not a folder");
}
