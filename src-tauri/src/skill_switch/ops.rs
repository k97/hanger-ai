//! Switch a store skill off into Hanger's keep, and back on.
//!
//! Four commands in `lib.rs` call this module and nothing else in
//! `skill_switch`: `get_skill_switch` (`switch_info_for`),
//! `set_skill_enabled` (`set_enabled_for`), `undo_skill_switch` (`undo_for`)
//! and `get_kept_skills` (`kept_for`). Each is a thin wrapper.
//!
//! # A key is not a path
//!
//! `skill:<name>` is accepted only while `<name>` is a direct child of the
//! store, and `kept-skill:<uuid>` only while the keep holds a receipt named for
//! that id. Receipt ids are `kept:<uuid>`, undone by On, and
//! `restored:<name>`, undone by Off. Anything else is refused with a code.
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
//! 2. The store and the keep must be on one volume, or `OtherVolume`. A
//!    skill Hanger has copied into a project and tracks is `ReadOnly`
//!    (`SkillReadOnly::HasTrackedCopies`).
//! 3. `links::find_links`, over the fixed places and every link the store's
//!    `links` table records for the skill.
//! 4. `keep::create_entry`, at `Stage::Moving`, with every link recorded.
//! 5. Each link is read again and removed. One whose text changed puts back
//!    the links removed so far, removes the entry, and answers
//!    `ChangedSinceRead`.
//! 6. `tree::rename_no_replace` into `<keep>/<id>/<name>`.
//! 7. `tree::fingerprint` in the keep, then `keep::update` to `Stage::Kept`.
//! 8. `preferences::forget_moved_folder`: the store's rows for the folder
//!    just moved, and their link rows, and nothing else. Reaping is off, so
//!    without this the skill would still be counted, and a project's link to
//!    it would read as broken. A failure here is logged by kind and does not
//!    undo the move: a stale row is what a scan showed before this step
//!    existed, not a loss.
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
//!
//! This module logs one line, with no path, when step 8 of Off fails.

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
use crate::preferences::{forget_moved_folder, has_tracked_copies, link_dests_under, sanitise_path};

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

impl SkillPlaces {
    /// The places for `home`, with Hanger's keep and store under `data_dir`:
    /// `kept/skills` and `hanger.db`.
    pub fn under(home: PathBuf, data_dir: &Path) -> SkillPlaces {
        SkillPlaces {
            store: home.join(crate::agents::SHARED_AGENTS_DIR).join("skills"),
            keep: data_dir.join("kept").join("skills"),
            db_path: data_dir.join("hanger.db"),
            home,
        }
    }
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

/// Why a skill in the store is shown with no switch.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SkillReadOnly {
    /// Not a direct child of the store: a skill inside another skill's
    /// folder, such as `claudeception/examples/x`.
    InsideAnotherFolder,
    /// The store and the keep are on different volumes, so the skill would
    /// have to be copied.
    OtherVolume,
    /// Hanger copied this skill into a project and tracks the copy by its
    /// source path (Q4).
    HasTrackedCopies,
}

/// Why `skill` has no switch, or `None` when it can be switched.
///
/// `skill` is a path in the store. A path that is not a direct child of the
/// store, by its spelling or its canonical form, is `InsideAnotherFolder`;
/// `switch_info_for` answers `None` before asking for one that is not in the
/// store at all. Reads the filesystem's volume numbers and the store; writes
/// nothing. A store that cannot be read gives no reason: a tracked copy is
/// tracking that would be lost, not a skill.
pub fn read_only_reason(places: &SkillPlaces, skill: &Path) -> Option<SkillReadOnly> {
    let direct = skill.parent().is_some_and(|parent| {
        parent == places.store
            || matches!((fs::canonicalize(parent), fs::canonicalize(&places.store)), (Ok(a), Ok(b)) if a == b)
    }) && skill.file_name().and_then(|name| name.to_str()).is_some_and(is_store_name);
    if !direct {
        return Some(SkillReadOnly::InsideAnotherFolder);
    }
    if let (Ok(store), Ok(keep)) = (volume_of(&places.store), volume_of(&nearest_existing(&places.keep))) {
        if store != keep {
            return Some(SkillReadOnly::OtherVolume);
        }
    }
    if tracked_copies(places, skill) {
        return Some(SkillReadOnly::HasTrackedCopies);
    }
    None
}

/// Hanger's store, opened for this switch. `None` when there is none yet:
/// a switch never makes one.
fn open_store(places: &SkillPlaces) -> Option<rusqlite::Connection> {
    let conn = rusqlite::Connection::open_with_flags(&places.db_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE).ok()?;
    conn.execute_batch("PRAGMA foreign_keys = ON;").ok()?;
    conn.busy_timeout(STORE_BUSY).ok()?;
    Some(conn)
}

/// How long a switch waits for a scan's write lock: as long as the search
/// index writers wait (`invariants.md`).
const STORE_BUSY: std::time::Duration = std::time::Duration::from_secs(30);

/// Each spelling the store may hold a path under the skill in: as spelled,
/// and through the store's canonical path, with and without the `/private`
/// that macOS puts in front of `/var` and `/tmp`.
fn spellings(skill: &Path) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut add = |path: PathBuf| {
        if let Some(text) = path.to_str() {
            if !out.iter().any(|seen| seen == text) {
                out.push(text.to_string());
            }
        }
    };
    add(skill.to_path_buf());
    if let (Some(parent), Some(name)) = (skill.parent(), skill.file_name()) {
        if let Ok(real) = fs::canonicalize(parent) {
            let real = real.join(name);
            if let Ok(stripped) = real.strip_prefix("/private") {
                add(Path::new("/").join(stripped));
            }
            add(real);
        }
    }
    out
}

fn tracked_copies(places: &SkillPlaces, skill: &Path) -> bool {
    let Some(conn) = open_store(places) else { return false };
    spellings(skill).iter().any(|folder| has_tracked_copies(&conn, folder).unwrap_or(false))
}

/// The links the store's `links` table records for anything at or under the
/// skill.
fn recorded_links(places: &SkillPlaces, skill: &Path) -> Vec<PathBuf> {
    let Some(conn) = open_store(places) else { return Vec::new() };
    let mut out: Vec<PathBuf> = Vec::new();
    for folder in spellings(skill) {
        for dest in link_dests_under(&conn, &folder).unwrap_or_default() {
            let dest = PathBuf::from(dest);
            if !out.contains(&dest) {
                out.push(dest);
            }
        }
    }
    out
}

/// Step 8 of Off.
fn forget(places: &SkillPlaces, skill: &Path) {
    let Some(conn) = open_store(places) else { return };
    for folder in spellings(skill) {
        if forget_moved_folder(&conn, &folder).is_err() {
            log::warn!("skill switch: the store still holds rows for a skill that was switched off");
            return;
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
    if tracked_copies(places, &skill) {
        return Err(SkillSwitchFailure::ReadOnly);
    }

    // 3.
    let recorded = recorded_links(places, &skill);
    let found = find_links(&skill, &link_places(&places.home, &places.store, projects), &recorded);
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

    // 8.
    forget(places, &skill);

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

// ---------------------------------------------------------------------------
// What the webview may ask: a skill's switch, the kept list, a switch, an Undo
// ---------------------------------------------------------------------------

/// A skill's switch, for its inspector header.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SkillSwitchInfo {
    /// `"skill:<name>"`: what `set_enabled_for` takes. A key is not a path:
    /// the name must still be a direct child of the store when it is used.
    pub key: String,
    /// Why there is no switch, or `None` when there is one.
    pub read_only: Option<SkillReadOnly>,
}

/// A skill Hanger is keeping while it is switched off.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct KeptSkill {
    /// `"kept-skill:<uuid>"`.
    pub key: String,
    pub name: String,
    pub at_ms: i64,
    /// How many links Hanger removed and will put back.
    pub links_count: usize,
    /// Off or On did not finish (`stage != Kept`).
    pub interrupted: bool,
    /// `<store>/<name>` exists again, so On will refuse with `already_there`.
    pub back_in_store: bool,
}

/// Every skill Hanger is keeping, with its count.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct KeptSkills {
    /// Newest first.
    pub skills: Vec<KeptSkill>,
    /// `skills.len()`: the "Switched off" figure.
    pub count: usize,
}

/// What a switch or an Undo hands back.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SkillSwitchReply {
    pub name: String,
    /// `"kept:<uuid>"` after Off, `"restored:<name>"` after On; `None` when
    /// nothing changed.
    pub receipt_id: Option<String>,
    pub undoable: bool,
    pub links_count: usize,
    /// Sanitised paths of links that could not be put back.
    pub links_not_restored: Vec<String>,
    pub kept: KeptSkills,
}

const SKILL_KEY: &str = "skill:";
const KEPT_SKILL_KEY: &str = "kept-skill:";
const KEPT: &str = "kept:";
const RESTORED: &str = "restored:";

/// The switch for the skill at `skill_path`, or `None` when it is not in the
/// store: a path outside it, the store itself, or a path where nothing is.
///
/// A path through a folder that resolves to the store, such as
/// `~/.claude/skills/x` where `~/.claude/skills` links to the store, is the
/// store's. Reads metadata only.
pub fn switch_info_for(places: &SkillPlaces, skill_path: &Path) -> Option<SkillSwitchInfo> {
    fs::symlink_metadata(skill_path).ok()?;
    let relative = under_store(places, skill_path)?;
    let text = relative.to_str()?;
    if text.is_empty() {
        return None;
    }
    Some(SkillSwitchInfo { key: format!("{SKILL_KEY}{text}"), read_only: read_only_reason(places, skill_path) })
}

/// `path` relative to the store, by its spelling or through the canonical
/// path of its folder.
fn under_store(places: &SkillPlaces, path: &Path) -> Option<PathBuf> {
    if let Ok(relative) = path.strip_prefix(&places.store) {
        return Some(relative.to_path_buf());
    }
    let store = fs::canonicalize(&places.store).ok()?;
    let parent = fs::canonicalize(path.parent()?).ok()?;
    let real = parent.join(path.file_name()?);
    real.strip_prefix(&store).ok().map(Path::to_path_buf)
}

/// Every kept skill, newest first.
pub fn kept_for(places: &SkillPlaces) -> KeptSkills {
    let skills: Vec<KeptSkill> = keep::list(&places.keep)
        .into_iter()
        .map(|receipt| KeptSkill {
            key: format!("{KEPT_SKILL_KEY}{}", receipt.id),
            back_in_store: is_store_name(&receipt.name) && fs::symlink_metadata(places.store.join(&receipt.name)).is_ok(),
            interrupted: receipt.stage != Stage::Kept,
            links_count: receipt.links.len(),
            at_ms: receipt.at_ms,
            name: receipt.name,
        })
        .collect();
    KeptSkills { count: skills.len(), skills }
}

/// Switch a store skill off (`skill:<name>`, `enabled: false`) or a kept one
/// on (`kept-skill:<uuid>`, `enabled: true`). Asking a key for the state it
/// is already in changes nothing and has no receipt. Any other key is
/// `NotFound`.
pub fn set_enabled_for(
    places: &SkillPlaces,
    projects: &[PathBuf],
    key: &str,
    enabled: bool,
) -> Result<SkillSwitchReply, SkillSwitchFailure> {
    if let Some(name) = key.strip_prefix(SKILL_KEY) {
        if !is_store_name(name) {
            return Err(SkillSwitchFailure::NameRefused);
        }
        if enabled {
            return Ok(unchanged(places, name));
        }
        let switched = switch_off(places, projects, name)?;
        let receipt_id = format!("{KEPT}{}", switched.id);
        return Ok(reply(places, switched, receipt_id));
    }
    if let Some(id) = key.strip_prefix(KEPT_SKILL_KEY) {
        let receipt = keep::load(&places.keep, id).ok_or(SkillSwitchFailure::NotFound)?;
        if !enabled {
            return Ok(unchanged(places, &receipt.name));
        }
        let switched = switch_on(places, id)?;
        let receipt_id = format!("{RESTORED}{}", switched.name);
        return Ok(reply(places, switched, receipt_id));
    }
    Err(SkillSwitchFailure::NotFound)
}

/// Take back one switch, by the receipt id its reply carried: `kept:<uuid>`
/// is switched back on, and `restored:<name>` is switched off again by name,
/// through every check Off makes. Anything else, and anything that is no
/// longer there to take back, is `NotUndoable`.
pub fn undo_for(
    places: &SkillPlaces,
    projects: &[PathBuf],
    receipt_id: &str,
) -> Result<SkillSwitchReply, SkillSwitchFailure> {
    let not_there = |failure: SkillSwitchFailure| match failure {
        SkillSwitchFailure::NotFound | SkillSwitchFailure::NameRefused => SkillSwitchFailure::NotUndoable,
        other => other,
    };
    if let Some(id) = receipt_id.strip_prefix(KEPT) {
        let switched = switch_on(places, id).map_err(not_there)?;
        let receipt_id = format!("{RESTORED}{}", switched.name);
        return Ok(reply(places, switched, receipt_id));
    }
    if let Some(name) = receipt_id.strip_prefix(RESTORED) {
        let switched = switch_off(places, projects, name).map_err(not_there)?;
        let receipt_id = format!("{KEPT}{}", switched.id);
        return Ok(reply(places, switched, receipt_id));
    }
    Err(SkillSwitchFailure::NotUndoable)
}

fn reply(places: &SkillPlaces, switched: Switched, receipt_id: String) -> SkillSwitchReply {
    SkillSwitchReply {
        name: switched.name,
        receipt_id: Some(receipt_id),
        undoable: true,
        links_count: switched.links,
        links_not_restored: switched.links_not_restored,
        kept: kept_for(places),
    }
}

fn unchanged(places: &SkillPlaces, name: &str) -> SkillSwitchReply {
    SkillSwitchReply {
        name: name.to_string(),
        receipt_id: None,
        undoable: false,
        links_count: 0,
        links_not_restored: Vec::new(),
        kept: kept_for(places),
    }
}
