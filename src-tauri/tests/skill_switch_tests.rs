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

// ---------------------------------------------------------------------------
// Task 3: the keep and its receipts
// ---------------------------------------------------------------------------

use tauri_app_lib::skill_switch::keep::{self, EntryKind, KeepError, LinkRecord, SkillReceipt, Stage};

fn receipt(id: &str, name: &str, at_ms: i64) -> SkillReceipt {
    SkillReceipt {
        id: id.to_string(),
        name: name.to_string(),
        original: format!("/nowhere/.agents/skills/{name}"),
        kind: EntryKind::Folder,
        fingerprint: None,
        links: vec![LinkRecord { path: "/nowhere/.cursor/skills/x".into(), text: "../x".into() }],
        stage: Stage::Moving,
        at_ms,
    }
}

const ID_A: &str = "00000000-0000-4000-8000-00000000000a";
const ID_B: &str = "00000000-0000-4000-8000-00000000000b";

fn mode(path: &Path) -> u32 {
    fs::symlink_metadata(path).unwrap().permissions().mode() & 0o7777
}

#[test]
fn a_relative_keep_is_refused_and_nothing_is_made() {
    let rel = PathBuf::from(format!("relative-keep-{}", uuid::Uuid::new_v4()));
    assert_eq!(keep::create_entry(&rel, &receipt(ID_A, "x", 1)).unwrap_err(), KeepError::NotAbsolute);
    assert!(!rel.exists(), "nothing was made in the working directory");
    assert_eq!(keep::update(&rel, &receipt(ID_A, "x", 1)).unwrap_err(), KeepError::NotAbsolute);
    assert!(keep::list(&rel).is_empty());
    assert!(!rel.exists());
}

#[test]
fn entry_and_receipt_are_private() {
    let dir = temp();
    let k = dir.path().join("kept/skills");
    let entry = keep::create_entry(&k, &receipt(ID_A, "x", 1)).unwrap();
    assert_eq!(entry, k.join(ID_A));
    assert_eq!(mode(&k), 0o700);
    assert_eq!(mode(&entry), 0o700);
    assert_eq!(mode(&entry.join("receipt.json")), 0o600);
    assert_eq!(keep::load(&k, ID_A), Some(receipt(ID_A, "x", 1)));
}

#[test]
fn two_skills_of_one_name_are_kept_apart() {
    let dir = temp();
    let k = dir.path().join("keep");
    keep::create_entry(&k, &receipt(ID_A, "foo", 1)).unwrap();
    keep::create_entry(&k, &receipt(ID_B, "foo", 2)).unwrap();
    let listed = keep::list(&k);
    let ids: Vec<&str> = listed.iter().map(|r| r.id.as_str()).collect();
    assert_eq!(ids, [ID_B, ID_A], "both are kept, newest first");
    assert!(listed.iter().all(|r| r.name == "foo"));
}

#[test]
fn create_entry_never_reuses_a_folder() {
    let dir = temp();
    let k = dir.path().join("keep");
    keep::create_entry(&k, &receipt(ID_A, "foo", 1)).unwrap();
    let err = keep::create_entry(&k, &receipt(ID_A, "bar", 2)).unwrap_err();
    assert_eq!(err, KeepError::Io(std::io::ErrorKind::AlreadyExists));
    assert_eq!(keep::load(&k, ID_A).unwrap().name, "foo", "the first receipt is untouched");
}

#[test]
fn a_receipt_not_named_for_its_id_is_not_listed() {
    let dir = temp();
    let k = dir.path().join("keep");
    keep::create_entry(&k, &receipt(ID_A, "foo", 1)).unwrap();
    fs::rename(k.join(ID_A), k.join(ID_B)).unwrap();
    assert!(keep::list(&k).is_empty());
    assert_eq!(keep::load(&k, ID_B), None);
    assert_eq!(keep::load(&k, ID_A), None);
}

#[test]
fn load_refuses_a_non_uuid_id() {
    let dir = temp();
    let k = dir.path().join("keep");
    keep::create_entry(&k, &receipt(ID_A, "foo", 1)).unwrap();
    // A receipt one level up, which "../x" would reach.
    fs::create_dir_all(dir.path().join("x")).unwrap();
    fs::write(dir.path().join("x/receipt.json"), serde_json::to_string(&receipt("../x", "foo", 1)).unwrap()).unwrap();
    assert_eq!(keep::load(&k, "../x"), None);
    // The folder name resolves on a case-insensitive volume; the id does not.
    assert_eq!(keep::load(&k, &ID_A.to_uppercase()), None);
    assert!(keep::load(&k, ID_A).is_some());
    // A receipt that names itself in the uppercase spelling, made by hand:
    // only the spelling check refuses it.
    let upper = ID_B.to_uppercase();
    fs::create_dir_all(k.join(&upper)).unwrap();
    fs::write(k.join(&upper).join("receipt.json"), serde_json::to_string(&receipt(&upper, "foo", 1)).unwrap()).unwrap();
    assert_eq!(keep::load(&k, &upper), None);
    assert_eq!(keep::list(&k).len(), 1, "only Hanger's own spelling is listed");
    assert!(keep::create_entry(&k, &receipt("../x", "foo", 1)).is_err(), "an id that is no uuid makes nothing");
}

#[test]
fn update_leaves_no_temp_file() {
    let dir = temp();
    let k = dir.path().join("keep");
    keep::create_entry(&k, &receipt(ID_A, "foo", 1)).unwrap();
    let mut next = receipt(ID_A, "foo", 1);
    next.stage = Stage::Kept;
    next.fingerprint = Some("abc".into());
    keep::update(&k, &next).unwrap();
    assert_eq!(keep::load(&k, ID_A), Some(next));
    let names: Vec<_> = fs::read_dir(k.join(ID_A)).unwrap().map(|e| e.unwrap().file_name()).collect();
    assert_eq!(names, [std::ffi::OsString::from("receipt.json")]);
    assert_eq!(mode(&k.join(ID_A).join("receipt.json")), 0o600);
}

#[test]
fn a_non_utf8_link_text_is_refused() {
    use std::os::unix::ffi::OsStringExt;
    let text = std::ffi::OsString::from_vec(b"../skills/\xff".to_vec());
    let found = FoundLink { path: PathBuf::from("/nowhere/link"), text };
    assert_eq!(LinkRecord::from_found(&found).unwrap_err(), KeepError::NotUtf8);
    let path = PathBuf::from(std::ffi::OsString::from_vec(b"/nowhere/\xfe".to_vec()));
    let found = FoundLink { path, text: "x".into() };
    assert_eq!(LinkRecord::from_found(&found).unwrap_err(), KeepError::NotUtf8);
    let ok = FoundLink { path: PathBuf::from("/nowhere/link"), text: "../x".into() };
    assert_eq!(LinkRecord::from_found(&ok).unwrap(), LinkRecord { path: "/nowhere/link".into(), text: "../x".into() });
}

// ---------------------------------------------------------------------------
// Task 4: Off and On
// ---------------------------------------------------------------------------

use tauri_app_lib::skill_switch::ops::{self, Seams, SkillPlaces, SkillSwitchFailure, Step};

/// A temp home, store and keep, as production lays them out.
struct World {
    dir: tempfile::TempDir,
    home: PathBuf,
    store: PathBuf,
    places: SkillPlaces,
}

fn world(skills: &[&str]) -> World {
    let dir = temp();
    let home = dir.path().join("home");
    let store = home.join(".agents/skills");
    fs::create_dir_all(&store).unwrap();
    for name in skills {
        make_skill(&store.join(name));
    }
    let places = SkillPlaces {
        home: home.clone(),
        store: store.clone(),
        keep: home.join("Library/Application Support/com.rkarthik.hanger/kept/skills"),
        db_path: dir.path().join("hanger.db"),
    };
    World { dir, home, store, places }
}

impl World {
    fn skill(&self, name: &str) -> PathBuf {
        self.store.join(name)
    }
    fn kept(&self, id: &str, name: &str) -> PathBuf {
        self.places.keep.join(id).join(name)
    }
    /// The whole temp folder, the keep included.
    fn everything(&self) -> String {
        fingerprint(self.dir.path()).unwrap()
    }
}

fn read_link(path: &Path) -> PathBuf {
    fs::read_link(path).unwrap_or_else(|e| panic!("{} is not a link: {e}", path.display()))
}

fn gone(path: &Path) -> bool {
    fs::symlink_metadata(path).is_err()
}

#[test]
fn off_moves_the_folder_and_removes_its_links_and_on_puts_back_every_byte() {
    let w = world(&["x", "web-design-guidelines"]);
    let links = [
        (w.home.join(".cursor/skills/x"), w.skill("x").into_os_string()),
        (w.home.join(".gemini/config/skills/x"), "../../../.agents/skills/x".into()),
        (w.skill("web-design-guidelines/x"), w.skill("x").into_os_string()),
    ];
    for (at, text) in &links {
        link(text, at);
    }
    let ino = fs::symlink_metadata(w.skill("x")).unwrap().ino();
    let print = fingerprint(&w.skill("x")).unwrap();

    let off = ops::switch_off(&w.places, &[], "x").expect("switched off");
    assert_eq!((off.name.as_str(), off.links), ("x", 3));
    assert!(gone(&w.skill("x")));
    for (at, _) in &links {
        assert!(gone(at), "{} was removed", at.display());
    }
    let receipt = keep::load(&w.places.keep, &off.id).expect("a receipt");
    assert_eq!(receipt.stage, Stage::Kept);
    assert_eq!(receipt.fingerprint.as_deref(), Some(print.as_str()));
    assert_eq!(fs::symlink_metadata(w.kept(&off.id, "x")).unwrap().ino(), ino, "renamed, never copied");

    let on = ops::switch_on(&w.places, &off.id).expect("switched on");
    assert_eq!(on.links_not_restored, Vec::<String>::new());
    assert_eq!(fs::symlink_metadata(w.skill("x")).unwrap().ino(), ino);
    assert_eq!(fingerprint(&w.skill("x")).unwrap(), print);
    for (at, text) in &links {
        assert_eq!(read_link(at).into_os_string(), *text, "{} has its own text back", at.display());
    }
    assert!(gone(&w.places.keep.join(&off.id)), "the entry is gone");
}

#[test]
fn a_skill_that_is_a_link_moves_as_a_link() {
    let w = world(&[]);
    let target = make_skill(&w.home.join("dotfiles/foo"));
    let text = PathBuf::from("../../dotfiles/foo");
    link(&text, &w.skill("foo"));
    let target_print = fingerprint(&target).unwrap();

    let off = ops::switch_off(&w.places, &[], "foo").expect("switched off");
    assert!(gone(&w.skill("foo")));
    let kept = w.kept(&off.id, "foo");
    assert!(fs::symlink_metadata(&kept).unwrap().file_type().is_symlink(), "the link moved, not its target");
    assert_eq!(read_link(&kept), text);
    assert_eq!(keep::load(&w.places.keep, &off.id).unwrap().kind, EntryKind::Link);
    assert_eq!(fingerprint(&target).unwrap(), target_print);

    ops::switch_on(&w.places, &off.id).expect("switched on");
    assert_eq!(read_link(&w.skill("foo")), text);
    assert_eq!(fingerprint(&target).unwrap(), target_print);
}

#[test]
fn on_refuses_when_the_name_is_back_in_the_store() {
    let w = world(&["x"]);
    let off = ops::switch_off(&w.places, &[], "x").unwrap();
    make_skill(&w.skill("x"));
    fs::write(w.skill("x/SKILL.md"), "reinstalled").unwrap();
    let (store_print, kept_print) = (fingerprint(&w.skill("x")).unwrap(), fingerprint(&w.kept(&off.id, "x")).unwrap());
    assert_eq!(ops::switch_on(&w.places, &off.id).unwrap_err(), SkillSwitchFailure::AlreadyThere);
    assert_eq!(fingerprint(&w.skill("x")).unwrap(), store_print);
    assert_eq!(fingerprint(&w.kept(&off.id, "x")).unwrap(), kept_print);
}

#[test]
fn on_refuses_when_the_kept_folder_changed() {
    let w = world(&["x"]);
    let off = ops::switch_off(&w.places, &[], "x").unwrap();
    fs::write(w.kept(&off.id, "x").join("SKILL.md"), "edited in the keep").unwrap();
    let before = w.everything();
    assert_eq!(ops::switch_on(&w.places, &off.id).unwrap_err(), SkillSwitchFailure::ChangedSinceKept);
    assert_eq!(w.everything(), before, "nothing moved");
    assert!(gone(&w.skill("x")));
}

#[test]
fn a_second_off_of_one_name_keeps_both() {
    let w = world(&["foo"]);
    let first = ops::switch_off(&w.places, &[], "foo").unwrap();
    make_skill(&w.skill("foo"));
    fs::write(w.skill("foo/SKILL.md"), "second").unwrap();
    let second = ops::switch_off(&w.places, &[], "foo").unwrap();
    assert_ne!(first.id, second.id);
    let kept: Vec<String> = keep::list(&w.places.keep).into_iter().map(|r| r.name).collect();
    assert_eq!(kept, ["foo", "foo"]);
    ops::switch_on(&w.places, &first.id).expect("the first comes back");
    assert_eq!(ops::switch_on(&w.places, &second.id).unwrap_err(), SkillSwitchFailure::AlreadyThere);
    assert_eq!(fs::read_to_string(w.kept(&second.id, "foo").join("SKILL.md")).unwrap(), "second");
}

#[test]
fn on_refuses_when_a_link_place_is_taken() {
    let w = world(&["x"]);
    let at = w.home.join(".cursor/skills/x");
    link(w.skill("x"), &at);
    let off = ops::switch_off(&w.places, &[], "x").unwrap();
    fs::write(&at, "mine").unwrap();
    let before = w.everything();
    assert_eq!(ops::switch_on(&w.places, &off.id).unwrap_err(), SkillSwitchFailure::LinkPlaceTaken);
    assert_eq!(fs::read_to_string(&at).unwrap(), "mine");
    assert_eq!(w.everything(), before, "nothing moved");
}

#[test]
fn a_link_that_changed_before_removal_is_left_and_nothing_moves() {
    let w = world(&["x", "y"]);
    let first = w.home.join(".cursor/skills/x");
    let second = w.home.join(".gemini/config/skills/x");
    link(w.skill("x"), &first);
    link("../../../.agents/skills/x", &second);
    let print = fingerprint(&w.skill("x")).unwrap();
    let repoint = || {
        fs::remove_file(&second).unwrap();
        symlink("../../../.agents/skills/y", &second).unwrap();
    };
    let seams = Seams { before_move: &repoint, ..Seams::default() };
    assert_eq!(ops::switch_off_with(&w.places, &[], "x", seams).unwrap_err(), SkillSwitchFailure::ChangedSinceRead);
    assert_eq!(fingerprint(&w.skill("x")).unwrap(), print, "the skill did not move");
    assert_eq!(read_link(&first), w.skill("x"), "the link removed first was put back");
    assert_eq!(read_link(&second), PathBuf::from("../../../.agents/skills/y"), "the changed link is left as it is");
    assert!(keep::list(&w.places.keep).is_empty(), "the entry was removed");
}

#[test]
fn another_volume_is_refused_before_anything_changes() {
    let w = world(&["x"]);
    link(w.skill("x"), &w.home.join(".cursor/skills/x"));
    let before = w.everything();
    let store = w.store.clone();
    let volume = move |path: &Path| -> std::io::Result<u64> { Ok(if path.starts_with(&store) { 1 } else { 2 }) };
    let seams = Seams { volume: &volume, ..Seams::default() };
    assert_eq!(ops::switch_off_with(&w.places, &[], "x", seams).unwrap_err(), SkillSwitchFailure::OtherVolume);
    assert_eq!(w.everything(), before);
    assert!(gone(&w.places.keep), "the keep was not even made");
}

#[test]
fn an_interrupted_off_is_listed_and_on_completes_it() {
    for step in [Step::AfterReceipt, Step::AfterLinks, Step::AfterMove, Step::AfterRestoreMove] {
        let w = world(&["x"]);
        let links = [
            (w.home.join(".cursor/skills/x"), w.skill("x").into_os_string()),
            (w.home.join(".gemini/config/skills/x"), std::ffi::OsString::from("../../../.agents/skills/x")),
        ];
        for (at, text) in &links {
            link(text, at);
        }
        let ino = fs::symlink_metadata(w.skill("x")).unwrap().ino();
        let print = fingerprint(&w.skill("x")).unwrap();

        let id = if step == Step::AfterRestoreMove {
            let off = ops::switch_off(&w.places, &[], "x").unwrap();
            let seams = Seams { stop_at: Some(step), ..Seams::default() };
            assert!(ops::switch_on_with(&w.places, &off.id, seams).is_err(), "{step:?}: stopped");
            off.id
        } else {
            let seams = Seams { stop_at: Some(step), ..Seams::default() };
            assert!(ops::switch_off_with(&w.places, &[], "x", seams).is_err(), "{step:?}: stopped");
            let listed = keep::list(&w.places.keep);
            assert_eq!(listed.len(), 1, "{step:?}: the interrupted entry is listed");
            assert_eq!(listed[0].stage, Stage::Moving, "{step:?}");
            listed[0].id.clone()
        };
        if step == Step::AfterRestoreMove {
            assert_eq!(keep::list(&w.places.keep)[0].stage, Stage::Restoring);
        }

        let on = ops::switch_on(&w.places, &id).unwrap_or_else(|e| panic!("{step:?}: on completes it: {e:?}"));
        assert!(on.links_not_restored.is_empty(), "{step:?}");
        assert_eq!(fs::symlink_metadata(w.skill("x")).unwrap().ino(), ino, "{step:?}");
        assert_eq!(fingerprint(&w.skill("x")).unwrap(), print, "{step:?}");
        for (at, text) in &links {
            assert_eq!(read_link(at).into_os_string(), *text, "{step:?}: {}", at.display());
        }
        assert!(gone(&w.places.keep.join(&id)), "{step:?}: the entry is gone");
        assert!(keep::list(&w.places.keep).is_empty(), "{step:?}");
    }
}

#[test]
fn a_link_whose_folder_is_gone_is_reported_not_made() {
    let w = world(&["x"]);
    let kept_here = w.home.join(".gemini/config/skills/x");
    let deleted = w.home.join(".cursor/skills");
    link(w.skill("x"), &deleted.join("x"));
    link("../../../.agents/skills/x", &kept_here);
    let off = ops::switch_off(&w.places, &[], "x").unwrap();
    fs::remove_dir(&deleted).unwrap();
    let on = ops::switch_on(&w.places, &off.id).expect("on puts the skill back");
    assert!(w.skill("x").is_dir());
    assert!(gone(&deleted), "the folder was not made");
    assert_eq!(on.links_not_restored.len(), 1, "{:?}", on.links_not_restored);
    assert!(on.links_not_restored[0].ends_with("/x"), "{:?}", on.links_not_restored);
    assert!(!on.links_not_restored[0].contains(w.dir.path().to_str().unwrap()), "sanitised: {:?}", on.links_not_restored);
    assert_eq!(read_link(&kept_here), PathBuf::from("../../../.agents/skills/x"));
}

#[test]
fn names_that_could_escape_the_store_are_refused() {
    let w = world(&["x"]);
    fs::create_dir_all(w.store.join(".system/inner")).unwrap();
    make_skill(&w.home.join(".agents/outside"));
    let before = w.everything();
    for name in ["..", "a/b", ".system", ".", "", "../outside", "x/references"] {
        let refused = ops::switch_off(&w.places, &[], name).unwrap_err();
        assert!(
            matches!(refused, SkillSwitchFailure::NameRefused | SkillSwitchFailure::NotFound),
            "{name:?} gave {refused:?}"
        );
    }
    assert_eq!(ops::switch_off(&w.places, &[], "nope").unwrap_err(), SkillSwitchFailure::NotFound);
    assert_eq!(w.everything(), before, "nothing anywhere changed");
}

// ---------------------------------------------------------------------------
// Task 5: what a scan and Needs review show while a skill is off
// ---------------------------------------------------------------------------

use tauri_app_lib::scanner::{count_assets, DirectoryScanner, Grouping, Scanner};

/// The scanner finds its home through `HANGER_TEST_HOME`, one variable for
/// the whole process: scans in this file take turns.
static SCANNING: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Scan `target` with the world's home into the world's one persisted
/// database, as a Rescan does.
fn scan(w: &World, target: &Path) -> tauri_app_lib::domain::Inventory {
    let _turn = SCANNING.lock().unwrap_or_else(|p| p.into_inner());
    std::env::set_var("HANGER_TEST_HOME", &w.home);
    let scanner = DirectoryScanner {
        db_path: w.places.db_path.clone(),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    let inventory = scanner.scan(target).expect("the temp home scans");
    std::env::remove_var("HANGER_TEST_HOME");
    inventory
}

fn counts(w: &World) -> tauri_app_lib::domain::AssetCounts {
    count_assets(&w.places.db_path, None, Grouping::Grouped).expect("counted")
}

fn skill_total(w: &World) -> usize {
    counts(w).skill.map(|c| c.total).unwrap_or(0)
}

/// A linked project under the temp home, with Claude Code reading the store
/// through `~/.claude/skills -> ~/.agents/skills`, as on Karthik's machine:
/// the scanner reaches the store's skills through that link.
fn project(w: &World) -> PathBuf {
    if fs::symlink_metadata(w.home.join(".claude/skills")).is_err() {
        link(&w.store, &w.home.join(".claude/skills"));
    }
    let project = w.home.join("Work/app");
    fs::create_dir_all(&project).unwrap();
    project
}

#[test]
fn a_switched_off_skill_leaves_the_skill_count_by_one() {
    let w = world(&["x", "y", "z"]);
    let project = project(&w);
    scan(&w, &project);
    let before = skill_total(&w);
    assert!(before >= 3, "the store's skills are counted: {before}");
    ops::switch_off(&w.places, &[project.clone()], "x").unwrap();
    scan(&w, &project);
    assert_eq!(skill_total(&w), before - 1);
}

use tauri_app_lib::domain::{resolve_state, LinkState};
use tauri_app_lib::preferences::PreferencesStore;
use tauri_app_lib::skill_switch::ops::SkillReadOnly;

fn hydrated(w: &World) -> Vec<tauri_app_lib::domain::HydratedLink> {
    PreferencesStore::new(&w.places.db_path).unwrap().get_hydrated_links().unwrap()
}

/// What Needs review reads a link's state from, at read time.
fn state_now(link: &tauri_app_lib::domain::HydratedLink) -> LinkState {
    let dest = Path::new(&link.dest_path);
    let exists = fs::metadata(dest).is_ok();
    let target = fs::read_link(dest).ok();
    resolve_state(link, None, exists, target.as_deref())
}

fn links_to(w: &World, name: &str) -> Vec<tauri_app_lib::domain::HydratedLink> {
    hydrated(w).into_iter().filter(|l| Path::new(&l.source_path).file_name() == Some(name.as_ref())).collect()
}

fn no_broken(inventory: &tauri_app_lib::domain::Inventory) -> bool {
    inventory.skills.iter().all(|s| s.link_state != Some(LinkState::Broken))
        && inventory.rules.iter().all(|s| s.link_state != Some(LinkState::Broken))
        && inventory.subagents.iter().all(|s| s.link_state != Some(LinkState::Broken))
        && inventory.tools.iter().all(|s| s.link_state != Some(LinkState::Broken))
}

#[test]
fn other_kinds_are_unchanged_by_a_switch() {
    let w = world(&["x", "y"]);
    let project = project(&w);
    for (rel, body) in [
        (".claude/agents/probe.md", "---\nname: probe-agent\ndescription: A probe subagent\n---\n# Probe\n"),
        (".claude/CLAUDE.md", "# Probe rules\n"),
        (".claude.json", "{\"mcpServers\": {\"probe\": {\"command\": \"probe-server\"}}}"),
    ] {
        fs::create_dir_all(w.home.join(rel).parent().unwrap()).unwrap();
        fs::write(w.home.join(rel), body).unwrap();
    }
    scan(&w, &project);
    let before = counts(&w);
    println!("before: {before:?}");
    for (kind, count) in [("rule", &before.rule), ("subagent", &before.subagent), ("tool", &before.tool)] {
        assert!(count.as_ref().is_some_and(|c| c.total > 0), "the {kind} probe is counted, so the comparison below means something");
    }
    ops::switch_off(&w.places, &[project.clone()], "x").unwrap();
    scan(&w, &project);
    let after = counts(&w);
    println!("after: {after:?}");
    assert_eq!(after.rule, before.rule);
    assert_eq!(after.subagent, before.subagent);
    assert_eq!(after.tool, before.tool);
    assert_eq!(after.skill.unwrap().total, before.skill.unwrap().total - 1);
}

#[test]
fn a_switched_off_skill_raises_no_review_issue() {
    let w = world(&["x", "y"]);
    let project = project(&w);
    let at = project.join(".claude/skills/x");
    link(w.skill("x"), &at);
    scan(&w, &project);
    assert_eq!(links_to(&w, "x").len(), 1, "the walk recorded the project's link: {:?}", hydrated(&w));

    ops::switch_off(&w.places, &[project.clone()], "x").unwrap();
    assert!(gone(&at), "the project's link was removed");
    assert!(links_to(&w, "x").is_empty(), "its row went with the skill");
    let inventory = scan(&w, &project);
    assert!(links_to(&w, "x").is_empty());
    for link in hydrated(&w) {
        assert_ne!(state_now(&link), LinkState::Broken, "{link:?}");
    }
    assert!(no_broken(&inventory));
}

#[test]
fn on_and_a_rescan_bring_the_row_and_the_link_row_back() {
    let w = world(&["x", "y"]);
    let project = project(&w);
    let at = project.join(".claude/skills/x");
    link(w.skill("x"), &at);
    scan(&w, &project);
    let before = skill_total(&w);
    let state_before = links_to(&w, "x").iter().map(state_now).collect::<Vec<_>>();
    assert_eq!(state_before.len(), 1);
    let off = ops::switch_off(&w.places, &[project.clone()], "x").unwrap();
    scan(&w, &project);
    assert_eq!(skill_total(&w), before - 1);
    ops::switch_on(&w.places, &off.id).unwrap();
    scan(&w, &project);
    assert_eq!(skill_total(&w), before);
    let back = links_to(&w, "x");
    assert_eq!(back.len(), 1, "{:?}", hydrated(&w));
    assert_eq!(back.iter().map(state_now).collect::<Vec<_>>(), state_before, "the link reads as it did before Off");
    assert_ne!(state_before[0], LinkState::Broken);
}

#[test]
fn the_keep_is_never_scanned() {
    let w = world(&["x", "y"]);
    let project = project(&w);
    scan(&w, &project);
    ops::switch_off(&w.places, &[project.clone()], "x").unwrap();
    assert!(w.places.keep.starts_with(&w.home), "the keep is at the production path, under the home");
    let mut inventories = vec![scan(&w, &project)];
    inventories.push(scan(&w, &w.home));
    let keep_real = fs::canonicalize(&w.places.keep).unwrap();
    for inventory in &inventories {
        for skill in &inventory.skills {
            assert!(!skill.path.contains("/kept/skills/"), "{} was scanned", skill.path);
        }
    }
    let conn = rusqlite::Connection::open(&w.places.db_path).unwrap();
    let rows: Vec<String> = conn
        .prepare("SELECT abs_path FROM assets").unwrap()
        .query_map([], |r| r.get(0)).unwrap().map(Result::unwrap).collect();
    assert!(!rows.is_empty());
    for row in rows {
        assert!(!Path::new(&row).starts_with(&w.places.keep) && !Path::new(&row).starts_with(&keep_real), "{row} is in the keep");
    }
}

#[test]
fn nested_skills_have_no_switch() {
    let w = world(&["claudeception"]);
    make_skill(&w.skill("claudeception/examples/x"));
    assert_eq!(ops::read_only_reason(&w.places, &w.skill("claudeception/examples/x")), Some(SkillReadOnly::InsideAnotherFolder));
    assert_eq!(ops::read_only_reason(&w.places, &w.skill("claudeception")), None);
}

#[test]
fn a_skill_with_a_tracked_copy_is_read_only() {
    let w = world(&["copied", "checksummed", "plain"]);
    let project = project(&w);
    scan(&w, &project);
    let prefs = PreferencesStore::new(&w.places.db_path).unwrap();
    // The source as the scan recorded it.
    let source = |name: &str| -> String {
        let conn = rusqlite::Connection::open(&w.places.db_path).unwrap();
        conn.query_row(
            "SELECT abs_path FROM assets WHERE category = 'skill' AND substr(abs_path, -length(?1) - 1) = '/' || ?1",
            [name],
            |r| r.get(0),
        )
        .unwrap()
    };
    let dest = project.join(".claude/skills/copied");
    make_skill(&dest);
    let recorded = prefs.record_deploy_link(&source("copied"), dest.to_str().unwrap(), "tracked_copy", "h", 1).unwrap();
    assert!(recorded.is_some(), "the copy is recorded as a link row");
    prefs.set_deploy_checksum(&source("checksummed"), project.join("elsewhere").to_str().unwrap(), "h").unwrap();

    assert_eq!(ops::read_only_reason(&w.places, &w.skill("copied")), Some(SkillReadOnly::HasTrackedCopies));
    assert_eq!(ops::read_only_reason(&w.places, &w.skill("checksummed")), Some(SkillReadOnly::HasTrackedCopies));
    assert_eq!(ops::read_only_reason(&w.places, &w.skill("plain")), None);

    let before = fingerprint(&w.store).unwrap();
    assert_eq!(ops::switch_off(&w.places, &[project.clone()], "copied").unwrap_err(), SkillSwitchFailure::ReadOnly);
    assert_eq!(fingerprint(&w.store).unwrap(), before, "nothing moved");
}

#[test]
fn nested_assets_go_with_their_folder() {
    // `_` is a LIKE wildcard: a sibling that would match `my_skill%` stays.
    let w = world(&["my_skill", "myXskill", "my_skill-extra"]);
    make_skill(&w.skill("my_skill/examples/inner"));
    make_skill(&w.skill("myXskill/examples/inner"));
    let project = project(&w);
    scan(&w, &project);
    let before = skill_total(&w);
    ops::switch_off(&w.places, &[project.clone()], "my_skill").unwrap();
    assert_eq!(skill_total(&w), before - 2, "the skill and the one inside it, and nothing else");
    scan(&w, &project);
    assert_eq!(skill_total(&w), before - 2);
}
