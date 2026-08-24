//! `list_asset_dir_of`: the "Contents" card. The backend lists and
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

/// A symlink inside a skill folder pointing outside it must never be
/// followed: it is listed by name, but nothing recurses into it and no
/// size or count is read from whatever it points at (metadata disclosure).
#[test]
fn a_symlink_out_of_root_is_listed_by_name_with_no_recursive_count() {
    let dir = fresh_dir("hanger_test_asset_dir_symlink_out");
    fs::write(dir.join("SKILL.md"), "x").unwrap();

    // A target outside `dir` entirely, holding files that must never be
    // counted or sized through the link.
    let outside = fresh_dir("hanger_test_asset_dir_symlink_out_target");
    fs::write(outside.join("secret.txt"), "0123456789").unwrap();
    fs::create_dir_all(outside.join("more")).unwrap();
    fs::write(outside.join("more/also-secret.txt"), "x").unwrap();

    std::os::unix::fs::symlink(&outside, dir.join("escape")).unwrap();

    let entries = list_asset_dir_of(&dir).unwrap();
    let escape = entries
        .iter()
        .find(|e| e.name == "escape" || e.name == "escape/")
        .expect("the symlink is listed by name");

    assert_eq!(escape.name, "escape", "a symlink is never treated as a directory, so it gets no trailing slash");
    assert_eq!(escape.kind, "symlink", "classified via symlink_metadata, never as \"dir\"");
    assert_eq!(
        escape.file_count, None,
        "no recursive count is read from a symlink's target"
    );
    assert_eq!(escape.bytes, None, "no size is read from a symlink's target either");
}

/// `count_files_beneath` applies the same non-following classification one
/// level down: a symlinked directory nested inside a real subfolder must
/// never be recursed into, whether it points at a file or a directory full
/// of files. Not a cycle — the link target is a distinct, real directory —
/// so this is safe to run against the unpatched code too.
#[test]
fn count_files_beneath_never_recurses_into_a_nested_symlink_either_way() {
    let dir = fresh_dir("hanger_test_asset_dir_symlink_nested");
    fs::write(dir.join("SKILL.md"), "x").unwrap();
    let subdir = dir.join("subdir");
    fs::create_dir_all(&subdir).unwrap();
    fs::write(subdir.join("real.txt"), "x").unwrap();

    // Several files behind the link — proof nothing recursed into it, since
    // an inflated count would show it did.
    let outside = fresh_dir("hanger_test_asset_dir_symlink_nested_target");
    fs::write(outside.join("a.txt"), "a").unwrap();
    fs::write(outside.join("b.txt"), "b").unwrap();
    fs::write(outside.join("c.txt"), "c").unwrap();
    std::os::unix::fs::symlink(&outside, subdir.join("link-to-dir")).unwrap();
    std::os::unix::fs::symlink(dir.join("SKILL.md"), subdir.join("link-to-file")).unwrap();

    let entries = list_asset_dir_of(&dir).unwrap();
    let sub = entries.iter().find(|e| e.name == "subdir/").expect("subdir listed");
    assert_eq!(
        sub.file_count,
        Some(3),
        "real.txt, plus one for each symlink counted as a single entry — never the 3 files sitting behind link-to-dir"
    );
}
