//! Switch a store skill off into Hanger's keep, and back on.
//!
//! Every folder is a parameter (`SkillPlaces`), so the tests in
//! `tests/skill_switch_tests.rs` run against a temp folder and never the real
//! home. This module logs nothing.
//!
//! # Off, in this order
//!
//! 1. The name: not empty, no `/`, not `.` or `..`, no leading `.`. Then
//!    `<store>/<name>` must be a folder or a link, or the answer is
//!    `NotFound`.
//! 2. The store and the keep must be on one volume, or `OtherVolume`.
//! 3. `links::find_links`.
//! 4. `keep::create_entry`, at `Stage::Moving`, with every link recorded.
//! 5. Each link is read again and removed. One whose text changed puts back
//!    the links removed so far, removes the entry, and answers
//!    `ChangedSinceRead`.
//! 6. `tree::rename_no_replace` into `<keep>/<id>/<name>`.
//! 7. `tree::fingerprint` in the keep, then `keep::update` to `Stage::Kept`.
//!
//! # On
//!
//! 1. `keep::load`.
//! 2. With a fingerprint recorded, the kept entry must still match it, or
//!    `ChangedSinceKept`.
//! 3. Nothing may be at the original path, or `AlreadyThere`.
//! 4. Each recorded link's path must be free, or already a link with the same
//!    text, or `LinkPlaceTaken`.
//! 5. `keep::update` to `Stage::Restoring`.
//! 6. `tree::rename_no_replace` back.
//! 7. `symlink(text, path)` for each link whose folder exists. The others are
//!    named, sanitised, in `links_not_restored` (Q3): no folder is made.
//! 8. With a fingerprint recorded, the skill at the original path must match
//!    it, or `NotVerified`, and the entry stays.
//! 9. `keep::remove_entry`.
//!
//! An entry that Off or On did not finish is completed by On. An Off stopped
//! before its move has no fingerprint and its skill is still in the store:
//! On then has nothing to move, and puts back whichever links are missing.
//!
//! One process-wide lock serialises every Off and On.

use std::fs;
use std::io;
use std::os::unix::fs::{symlink, MetadataExt};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

use super::keep::{self, EntryKind, KeepError, LinkRecord, SkillReceipt, Stage};
use super::links::{find_links, link_places};
use super::tree::{fingerprint, rename_no_replace, MoveError};
use crate::preferences::sanitise_path;

/// The folders a switch reads and writes.
#[derive(Debug, Clone)]
pub struct SkillPlaces {
    /// `scanner::get_home_dir()` in production.
    pub home: PathBuf,
    /// `<home>/.agents/skills`, as spelled.
    pub store: PathBuf,
    /// `<app data dir>/kept/skills`.
    pub keep: PathBuf,
    /// Hanger's store.
    pub db_path: PathBuf,
}

/// Why a switch, or an Undo, did not happen.
///
/// A code and nothing else: no variant carries a path or anything from a
/// file. Spelled as `mcp::switch::ops::SwitchFailure` spells the same
/// meanings.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SkillSwitchFailure {
    /// No skill of that name is in the store, or no kept entry has that id.
    NotFound,
    /// Hanger shows this skill and does not switch it.
    ReadOnly,
    /// The name could escape the store, or a path is not UTF-8.
    NameRefused,
    /// A link changed while Hanger was working. Nothing was moved.
    ChangedSinceRead,
    /// A skill of that name is in the store again. Nothing was moved.
    AlreadyThere,
    /// Something other than the link is where a link was. Nothing was moved.
    LinkPlaceTaken,
    /// The kept skill is no longer what was kept. Nothing was moved.
    ChangedSinceKept,
    /// The store and the keep are on different volumes.
    OtherVolume,
    /// A move, a link or a receipt could not be written.
    WriteFailed,
    /// The skill came back, and does not match what was kept.
    NotVerified,
    /// The receipt is not one Hanger can take back.
    NotUndoable,
}

impl SkillSwitchFailure {
    /// The code as the webview receives it: the variant in snake_case, which
    /// is also how it serialises.
    pub fn code(self) -> &'static str {
        match self {
            SkillSwitchFailure::NotFound => "not_found",
            SkillSwitchFailure::ReadOnly => "read_only",
            SkillSwitchFailure::NameRefused => "name_refused",
            SkillSwitchFailure::ChangedSinceRead => "changed_since_read",
            SkillSwitchFailure::AlreadyThere => "already_there",
            SkillSwitchFailure::LinkPlaceTaken => "link_place_taken",
            SkillSwitchFailure::ChangedSinceKept => "changed_since_kept",
            SkillSwitchFailure::OtherVolume => "other_volume",
            SkillSwitchFailure::WriteFailed => "write_failed",
            SkillSwitchFailure::NotVerified => "not_verified",
            SkillSwitchFailure::NotUndoable => "not_undoable",
        }
    }
}

impl From<KeepError> for SkillSwitchFailure {
    fn from(error: KeepError) -> Self {
        match error {
            KeepError::NotUtf8 => SkillSwitchFailure::NameRefused,
            KeepError::NotAbsolute | KeepError::Io(_) => SkillSwitchFailure::WriteFailed,
        }
    }
}

impl From<MoveError> for SkillSwitchFailure {
    fn from(error: MoveError) -> Self {
        match error {
            MoveError::Exists => SkillSwitchFailure::AlreadyThere,
            MoveError::OtherVolume => SkillSwitchFailure::OtherVolume,
            MoveError::Io(_) => SkillSwitchFailure::WriteFailed,
        }
    }
}

/// What a finished Off or On did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Switched {
    /// The kept entry's id.
    pub id: String,
    pub name: String,
    /// The links removed (Off) or recorded (On).
    pub links: usize,
    /// Sanitised paths of links On could not put back because their folder
    /// is gone.
    pub links_not_restored: Vec<String>,
}

/// For tests: an error returned at a named step stands in for Hanger
/// stopping there.
#[doc(hidden)]
#[derive(Clone, Copy)]
pub struct Seams<'a> {
    pub stop_at: Option<Step>,
    /// Run after the receipt is written and before the first link is read
    /// again.
    pub before_move: &'a (dyn Fn() + Sync),
    /// The volume a path is on. Production reads `st_dev`.
    pub volume: &'a (dyn Fn(&Path) -> io::Result<u64> + Sync),
}

impl Default for Seams<'static> {
    fn default() -> Self {
        Seams { stop_at: None, before_move: &|| {}, volume: &volume_of }
    }
}

#[doc(hidden)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    AfterReceipt,
    AfterLinks,
    AfterMove,
    AfterRestoreMove,
}

/// One switch at a time, in this process.
static SWITCHING: Mutex<()> = Mutex::new(());

/// Stands in for Hanger stopping: returned with no clean-up at all.
const STOPPED: SkillSwitchFailure = SkillSwitchFailure::WriteFailed;

pub fn switch_off(places: &SkillPlaces, projects: &[PathBuf], name: &str) -> Result<Switched, SkillSwitchFailure> {
    switch_off_with(places, projects, name, Seams::default())
}

pub fn switch_on(places: &SkillPlaces, id: &str) -> Result<Switched, SkillSwitchFailure> {
    switch_on_with(places, id, Seams::default())
}

/// Whether a name can only name a direct child of the store.
fn is_store_name(name: &str) -> bool {
    !name.is_empty()
        && !name.contains('/')
        && !name.contains('\0')
        && name != "."
        && name != ".."
        && !name.starts_with('.')
}

/// `switch_off`, with the test seams supplied.
#[doc(hidden)]
pub fn switch_off_with(
    places: &SkillPlaces,
    projects: &[PathBuf],
    name: &str,
    seams: Seams<'_>,
) -> Result<Switched, SkillSwitchFailure> {
    let _one_at_a_time = SWITCHING.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

    // 1.
    if !is_store_name(name) {
        return Err(SkillSwitchFailure::NameRefused);
    }
    let skill = places.store.join(name);
    let kind = match fs::symlink_metadata(&skill) {
        Ok(meta) if meta.file_type().is_symlink() => EntryKind::Link,
        Ok(meta) if meta.is_dir() => EntryKind::Folder,
        _ => return Err(SkillSwitchFailure::NotFound),
    };
    let original = keep::utf8(&skill)?;
    if !places.keep.is_absolute() {
        return Err(SkillSwitchFailure::WriteFailed);
    }

    // 2.
    let store_volume = (seams.volume)(&places.store).map_err(|_| SkillSwitchFailure::WriteFailed)?;
    let keep_volume = (seams.volume)(&nearest_existing(&places.keep)).map_err(|_| SkillSwitchFailure::WriteFailed)?;
    if store_volume != keep_volume {
        return Err(SkillSwitchFailure::OtherVolume);
    }

    // 3.
    let found = find_links(&skill, &link_places(&places.home, &places.store, projects), &[]);
    let records = found.iter().map(LinkRecord::from_found).collect::<Result<Vec<_>, _>>()?;

    // 4.
    let mut receipt = SkillReceipt {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.to_string(),
        original,
        kind,
        fingerprint: None,
        links: records,
        stage: Stage::Moving,
        at_ms: now_ms(),
    };
    keep::create_entry(&places.keep, &receipt)?;
    if seams.stop_at == Some(Step::AfterReceipt) {
        return Err(STOPPED);
    }
    (seams.before_move)();

    // 5.
    let mut removed: Vec<&LinkRecord> = Vec::new();
    for record in &receipt.links {
        let path = Path::new(&record.path);
        let still = fs::symlink_metadata(path).map(|m| m.file_type().is_symlink()).unwrap_or(false)
            && fs::read_link(path).map(|text| text.as_os_str() == record.text.as_str()).unwrap_or(false);
        let failure = if !still {
            Some(SkillSwitchFailure::ChangedSinceRead)
        } else if fs::remove_file(path).is_err() {
            Some(SkillSwitchFailure::WriteFailed)
        } else {
            None
        };
        if let Some(failure) = failure {
            put_back(&removed);
            let _ = keep::remove_entry(&places.keep, &receipt.id);
            return Err(failure);
        }
        removed.push(record);
    }
    if seams.stop_at == Some(Step::AfterLinks) {
        return Err(STOPPED);
    }

    // 6.
    let kept = places.keep.join(&receipt.id).join(name);
    if let Err(error) = rename_no_replace(&skill, &kept) {
        put_back(&removed);
        let _ = keep::remove_entry(&places.keep, &receipt.id);
        return Err(match error {
            // The entry is new, so nothing can be at `kept`.
            MoveError::Exists => SkillSwitchFailure::WriteFailed,
            other => other.into(),
        });
    }
    if seams.stop_at == Some(Step::AfterMove) {
        return Err(STOPPED);
    }

    // 7. The skill is kept either way from here: an entry left at
    // `Stage::Moving` is listed as interrupted, and On puts it back.
    receipt.fingerprint = Some(fingerprint(&kept).map_err(|_| SkillSwitchFailure::WriteFailed)?);
    receipt.stage = Stage::Kept;
    keep::update(&places.keep, &receipt)?;

    Ok(Switched { links: receipt.links.len(), id: receipt.id, name: receipt.name, links_not_restored: Vec::new() })
}

/// `switch_on`, with the test seams supplied.
#[doc(hidden)]
pub fn switch_on_with(places: &SkillPlaces, id: &str, seams: Seams<'_>) -> Result<Switched, SkillSwitchFailure> {
    let _one_at_a_time = SWITCHING.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

    // 1.
    let mut receipt = keep::load(&places.keep, id).ok_or(SkillSwitchFailure::NotFound)?;
    if !is_store_name(&receipt.name) {
        return Err(SkillSwitchFailure::NameRefused);
    }
    let original = PathBuf::from(&receipt.original);
    // The receipt names where it came from; it must still be the store's
    // child of that name, so an edited receipt cannot aim the move elsewhere.
    if original != places.store.join(&receipt.name) {
        return Err(SkillSwitchFailure::NameRefused);
    }
    let kept = places.keep.join(id).join(&receipt.name);
    let in_keep = fs::symlink_metadata(&kept).is_ok();

    if in_keep {
        // 2.
        if let Some(expected) = &receipt.fingerprint {
            if fingerprint(&kept).ok().as_ref() != Some(expected) {
                return Err(SkillSwitchFailure::ChangedSinceKept);
            }
        }
        // 3.
        match fs::symlink_metadata(&original) {
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            _ => return Err(SkillSwitchFailure::AlreadyThere),
        }
    } else {
        // Only an unfinished switch leaves the skill outside the keep: Off
        // stopped before its move, or On stopped after its own.
        if receipt.stage == Stage::Kept || fs::symlink_metadata(&original).is_err() {
            return Err(SkillSwitchFailure::NotFound);
        }
    }

    // 4.
    for record in &receipt.links {
        if !link_place_free(record) {
            return Err(SkillSwitchFailure::LinkPlaceTaken);
        }
    }

    // 5.
    if receipt.stage != Stage::Restoring {
        receipt.stage = Stage::Restoring;
        keep::update(&places.keep, &receipt)?;
    }

    // 6.
    if in_keep {
        rename_no_replace(&kept, &original)?;
    }
    if seams.stop_at == Some(Step::AfterRestoreMove) {
        return Err(STOPPED);
    }

    // 7.
    let mut links_not_restored = Vec::new();
    for record in &receipt.links {
        let path = Path::new(&record.path);
        let folder_is_there = path.parent().map(|folder| folder.is_dir()).unwrap_or(false);
        if !folder_is_there {
            links_not_restored.push(sanitise_path(&record.path));
            continue;
        }
        if is_link_with_text(path, &record.text) {
            continue;
        }
        if symlink(&record.text, path).is_err() {
            links_not_restored.push(sanitise_path(&record.path));
        }
    }

    // 8.
    if let Some(expected) = &receipt.fingerprint {
        if fingerprint(&original).ok().as_ref() != Some(expected) {
            return Err(SkillSwitchFailure::NotVerified);
        }
    }

    // 9.
    keep::remove_entry(&places.keep, id)?;

    Ok(Switched { id: receipt.id, links: receipt.links.len(), name: receipt.name, links_not_restored })
}

/// Recreate links removed by an Off that is being abandoned, from their
/// recorded text.
fn put_back(removed: &[&LinkRecord]) {
    for record in removed {
        let _ = symlink(&record.text, &record.path);
    }
}

/// Free, or the link already there with the recorded text. A folder that is
/// gone counts as free: step 7 reports it.
fn link_place_free(record: &LinkRecord) -> bool {
    let path = Path::new(&record.path);
    match fs::symlink_metadata(path) {
        Err(error) => error.kind() == io::ErrorKind::NotFound || error.kind() == io::ErrorKind::NotADirectory,
        Ok(_) => is_link_with_text(path, &record.text),
    }
}

fn is_link_with_text(path: &Path, text: &str) -> bool {
    fs::symlink_metadata(path).map(|m| m.file_type().is_symlink()).unwrap_or(false)
        && fs::read_link(path).map(|found| found.as_os_str() == text).unwrap_or(false)
}

/// The volume a path is on.
fn volume_of(path: &Path) -> io::Result<u64> {
    Ok(fs::metadata(path)?.dev())
}

/// `path`, or its nearest ancestor that exists: the keep is made on first
/// use, and its volume is the volume of the folder it will be made in.
fn nearest_existing(path: &Path) -> PathBuf {
    let mut at = path;
    loop {
        if fs::symlink_metadata(at).is_ok() {
            return at.to_path_buf();
        }
        match at.parent() {
            Some(parent) => at = parent,
            None => return at.to_path_buf(),
        }
    }
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|since| since.as_millis() as i64).unwrap_or_default()
}
