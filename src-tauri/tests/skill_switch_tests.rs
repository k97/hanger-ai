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

// ---------------------------------------------------------------------------
// Task 2: find the one-by-one links to a skill
// ---------------------------------------------------------------------------

use tauri_app_lib::skill_switch::links::{find_links, link_places, FoundLink};

/// A temp home with a store holding the named skills.
struct Home {
    _dir: tempfile::TempDir,
    home: PathBuf,
    store: PathBuf,
}

fn home_with(skills: &[&str]) -> Home {
    let dir = temp();
    let home = dir.path().join("home");
    let store = home.join(".agents/skills");
    for name in skills {
        make_skill(&store.join(name));
    }
    Home { _dir: dir, home, store }
}

fn link(text: impl AsRef<Path>, at: &Path) {
    fs::create_dir_all(at.parent().unwrap()).unwrap();
    symlink(text, at).unwrap();
}

fn paths(found: &[FoundLink]) -> Vec<PathBuf> {
    found.iter().map(|f| f.path.clone()).collect()
}

#[test]
fn an_absolute_link_is_found() {
    let h = home_with(&["x", "y"]);
    let at = h.home.join(".cursor/skills/x");
    link(h.store.join("x"), &at);
    let found = find_links(&h.store.join("x"), &link_places(&h.home, &h.store, &[]), &[]);
    assert_eq!(paths(&found), [at]);
    assert_eq!(found[0].text, h.store.join("x").into_os_string());
}

#[test]
fn a_relative_link_is_found_and_recorded_by_its_own_text() {
    let h = home_with(&["x"]);
    let at = h.home.join(".gemini/config/skills/x");
    link("../../../.agents/skills/x", &at);
    let found = find_links(&h.store.join("x"), &link_places(&h.home, &h.store, &[]), &[]);
    assert_eq!(paths(&found), [at]);
    assert_eq!(found[0].text, std::ffi::OsString::from("../../../.agents/skills/x"), "the text is kept as written, never made absolute");
}

#[test]
fn a_place_that_resolves_to_the_store_is_skipped() {
    let h = home_with(&["x"]);
    let container = h.home.join(".claude/skills");
    link(&h.store, &container);
    let places = link_places(&h.home, &h.store, &[]);
    assert!(!places.contains(&container), "{places:?}");
    let found = find_links(&h.store.join("x"), &places, &[]);
    assert!(found.iter().all(|f| !f.path.starts_with(&container)), "{found:?}");
    assert!(found.is_empty(), "the skill itself, seen through the container, is not a link to it: {found:?}");
}

#[test]
fn a_link_inside_another_skill_is_found() {
    let h = home_with(&["figma", "web-design-guidelines"]);
    let at = h.store.join("web-design-guidelines/figma");
    link(h.store.join("figma"), &at);
    let found = find_links(&h.store.join("figma"), &link_places(&h.home, &h.store, &[]), &[]);
    assert_eq!(paths(&found), [at]);
}

#[test]
fn a_link_to_another_skill_is_not_found() {
    let h = home_with(&["x", "y"]);
    link(h.store.join("y"), &h.home.join(".cursor/skills/y"));
    // An already-dangling link to a skill that is not there.
    link(h.store.join("gone"), &h.home.join(".cursor/skills/gone"));
    let found = find_links(&h.store.join("x"), &link_places(&h.home, &h.store, &[]), &[]);
    assert!(found.is_empty(), "{found:?}");
}

#[test]
fn a_link_into_a_subfolder_of_the_skill_is_not_found() {
    let h = home_with(&["x"]);
    link(h.store.join("x/references"), &h.home.join(".cursor/skills/x-refs"));
    let found = find_links(&h.store.join("x"), &link_places(&h.home, &h.store, &[]), &[]);
    assert!(found.is_empty(), "{found:?}");
}

#[test]
fn a_linked_projects_link_is_found() {
    let h = home_with(&["x"]);
    let project = h.home.join("Work/app");
    let at = project.join(".claude/skills/x");
    link(h.store.join("x"), &at);
    assert!(find_links(&h.store.join("x"), &link_places(&h.home, &h.store, &[]), &[]).is_empty(), "not a place until the project is linked");
    let found = find_links(&h.store.join("x"), &link_places(&h.home, &h.store, &[project]), &[]);
    assert_eq!(paths(&found), [at]);
}

#[test]
fn a_recorded_link_outside_every_place_is_found() {
    let h = home_with(&["x"]);
    let at = h.home.join("somewhere/else/x");
    link(h.store.join("x"), &at);
    let places = link_places(&h.home, &h.store, &[]);
    assert!(find_links(&h.store.join("x"), &places, &[]).is_empty());
    let found = find_links(&h.store.join("x"), &places, &[at.clone()]);
    assert_eq!(paths(&found), [at]);
}

#[test]
fn a_container_link_to_the_whole_store_is_never_returned() {
    let h = home_with(&["x"]);
    let project = h.home.join("Work/hanger");
    let container = project.join(".agents/skills");
    link(&h.store, &container);
    let found = find_links(&h.store.join("x"), &link_places(&h.home, &h.store, &[project]), &[container.clone()]);
    assert!(found.is_empty(), "{found:?}");
}
