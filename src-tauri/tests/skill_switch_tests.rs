//! Switching a skill in the global store off into Hanger's keep, and back.
//!
//! Plan: docs/plans/2026-11-26-skill-switch.md
//!
//! Every folder here is a temp folder. Nothing reads or writes the real home,
//! the real store or the app's data folder: each function under test takes
//! its paths as parameters.

use std::fs;
use std::os::unix::fs::{symlink, MetadataExt, PermissionsExt};
use std::path::{Path, PathBuf};

use tauri_app_lib::skill_switch::tree::{fingerprint, rename_no_replace, MoveError};

fn temp() -> tempfile::TempDir {
    tempfile::tempdir().expect("a temp folder")
}

/// A skill folder with a SKILL.md and one nested file.
fn make_skill(at: &Path) -> PathBuf {
    fs::create_dir_all(at.join("references")).unwrap();
    fs::write(at.join("SKILL.md"), "---\nname: x\ndescription: d\n---\n# X\n").unwrap();
    fs::write(at.join("references/notes.md"), "notes\n").unwrap();
    at.to_path_buf()
}

// ---------------------------------------------------------------------------
// Task 1: fingerprint a folder, and rename without replacing
// ---------------------------------------------------------------------------

#[test]
fn fingerprint_changes_with_a_byte() {
    let dir = temp();
    let skill = make_skill(&dir.path().join("x"));
    let before = fingerprint(&skill).unwrap();
    assert_eq!(before, fingerprint(&skill).unwrap(), "the same folder gives the same fingerprint");
    fs::write(skill.join("references/notes.md"), "notez\n").unwrap();
    assert_ne!(before, fingerprint(&skill).unwrap());
}

#[test]
fn fingerprint_changes_with_a_mode() {
    let dir = temp();
    let skill = make_skill(&dir.path().join("x"));
    let before = fingerprint(&skill).unwrap();
    fs::set_permissions(skill.join("SKILL.md"), fs::Permissions::from_mode(0o755)).unwrap();
    assert_ne!(before, fingerprint(&skill).unwrap());
}

#[test]
fn fingerprint_changes_with_a_link_text() {
    let dir = temp();
    let skill = make_skill(&dir.path().join("x"));
    symlink("references/notes.md", skill.join("alias")).unwrap();
    let before = fingerprint(&skill).unwrap();
    fs::remove_file(skill.join("alias")).unwrap();
    symlink("./references/notes.md", skill.join("alias")).unwrap();
    assert_ne!(before, fingerprint(&skill).unwrap());
}

#[test]
fn fingerprint_ignores_ds_store() {
    let dir = temp();
    let skill = make_skill(&dir.path().join("x"));
    let before = fingerprint(&skill).unwrap();
    fs::write(skill.join(".DS_Store"), [0u8, 1, 2]).unwrap();
    fs::write(skill.join("references/.DS_Store"), [3u8]).unwrap();
    assert_eq!(before, fingerprint(&skill).unwrap());
    // A name that only starts with it is not skipped.
    fs::write(skill.join(".DS_Store2"), [3u8]).unwrap();
    assert_ne!(before, fingerprint(&skill).unwrap());
}

#[test]
fn fingerprint_never_follows_a_link() {
    let dir = temp();
    let skill = make_skill(&dir.path().join("x"));
    let outside = dir.path().join("big");
    fs::create_dir_all(&outside).unwrap();
    fs::write(outside.join("a"), "a").unwrap();
    symlink(&outside, skill.join("big")).unwrap();
    let before = fingerprint(&skill).unwrap();
    fs::write(outside.join("a"), "changed").unwrap();
    fs::write(outside.join("b"), "new").unwrap();
    assert_eq!(before, fingerprint(&skill).unwrap(), "what a link points at is not part of the folder");
}

#[test]
fn fingerprint_of_a_link_root_is_its_text() {
    let dir = temp();
    let target = make_skill(&dir.path().join("dotfiles/x"));
    let root = dir.path().join("x");
    symlink(&target, &root).unwrap();
    let before = fingerprint(&root).unwrap();
    fs::write(target.join("SKILL.md"), "changed").unwrap();
    assert_eq!(before, fingerprint(&root).unwrap(), "the target's content is not the link's");
    fs::remove_file(&root).unwrap();
    symlink(dir.path().join("dotfiles/./x"), &root).unwrap();
    assert_ne!(before, fingerprint(&root).unwrap(), "a different text is a different link");
}

#[test]
fn rename_refuses_an_existing_empty_folder() {
    let dir = temp();
    let from = make_skill(&dir.path().join("x"));
    let to = dir.path().join("y");
    fs::create_dir(&to).unwrap();
    let before = fingerprint(&from).unwrap();
    assert_eq!(rename_no_replace(&from, &to), Err(MoveError::Exists));
    assert_eq!(fingerprint(&from).unwrap(), before, "the source is intact");
    assert!(to.is_dir() && fs::read_dir(&to).unwrap().next().is_none(), "the empty folder is intact");
}

#[test]
fn rename_keeps_the_inode() {
    let dir = temp();
    let from = make_skill(&dir.path().join("x"));
    let to = dir.path().join("kept/x");
    fs::create_dir_all(to.parent().unwrap()).unwrap();
    let ino = fs::symlink_metadata(&from).unwrap().ino();
    rename_no_replace(&from, &to).unwrap();
    assert!(fs::symlink_metadata(&from).is_err());
    assert_eq!(fs::symlink_metadata(&to).unwrap().ino(), ino);
}
