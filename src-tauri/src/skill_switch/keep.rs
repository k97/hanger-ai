//! Hanger's keep for switched-off skills: one private folder per entry, with
//! a receipt beside the kept skill.
//!
//! ```text
//! <keep>/                       0700, made if missing
//!   <uuid>/                     0700, made with create_dir, never reused
//!     receipt.json              0600, synced
//!     <name>                    the skill, renamed in by `ops`
//! ```
//!
//! The pattern is `mcp::switch::vendor`'s stash: kept before anything is
//! removed, synced, never written over, and loaded only by an id in the one
//! spelling Hanger writes, from a receipt that holds that id. A folder that
//! does not load is not listed, so nothing in the keep can name another file.
//!
//! The receipt holds absolute paths and link texts, so it never crosses IPC.
//! `keep` is a parameter, and one that is not absolute is refused before
//! anything is made.

use std::fs::{self, DirBuilder, File, OpenOptions};
use std::io::{self, Write};
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::links::FoundLink;

const RECEIPT: &str = "receipt.json";
const RECEIPT_TEMP: &str = "receipt.json.tmp";
/// Finder writes one into any folder it opens; it is not Hanger's or the
/// skill's, so it does not stop an emptied entry being removed.
const FINDER_FILE: &str = ".DS_Store";
const PRIVATE_FOLDER: u32 = 0o700;
const PRIVATE_FILE: u32 = 0o600;

/// Where an entry is in a switch.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Stage {
    /// Written before anything moved; Off did not finish.
    Moving,
    /// The skill is in the keep and its fingerprint is recorded.
    Kept,
    /// On began moving it back and did not finish.
    Restoring,
}

/// What the store entry was.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntryKind {
    Folder,
    Link,
}

/// The receipt. Never crosses IPC: it holds absolute paths and link texts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SkillReceipt {
    /// uuid; equals its folder's name.
    pub id: String,
    pub name: String,
    /// absolute: <store>/<name>, as found.
    pub original: String,
    pub kind: EntryKind,
    /// set when Stage::Kept
    pub fingerprint: Option<String>,
    pub links: Vec<LinkRecord>,
    pub stage: Stage,
    pub at_ms: i64,
}

/// One link that was removed, by where it was and its exact text.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LinkRecord {
    pub path: String,
    pub text: String,
}

impl LinkRecord {
    /// The record of a found link. A path or text that is not UTF-8 is
    /// refused rather than stored as a lossy copy that would recreate a
    /// different link.
    pub fn from_found(found: &FoundLink) -> Result<Self, KeepError> {
        Ok(LinkRecord {
            path: utf8(&found.path)?,
            text: found.text.to_str().ok_or(KeepError::NotUtf8)?.to_string(),
        })
    }
}

/// Why the keep did not do what was asked.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeepError {
    /// The keep's path is not absolute. Nothing was made.
    NotAbsolute,
    /// A path or link text is not UTF-8.
    NotUtf8,
    /// Any other failure, by kind only.
    Io(io::ErrorKind),
}

impl From<io::Error> for KeepError {
    fn from(error: io::Error) -> Self {
        KeepError::Io(error.kind())
    }
}

/// A path as UTF-8, or `NotUtf8`.
pub fn utf8(path: &Path) -> Result<String, KeepError> {
    path.to_str().map(str::to_string).ok_or(KeepError::NotUtf8)
}

/// Whether `id` is a uuid in the one spelling Hanger writes: lowercase and
/// hyphenated. Anything else could name a file outside the keep, or reach an
/// entry through a case-insensitive volume under a second spelling.
pub fn is_id(id: &str) -> bool {
    uuid::Uuid::parse_str(id).map(|parsed| parsed.to_string() == id).unwrap_or(false)
}

/// <keep>/<id>/ made 0700 with create_dir (fails if present); receipt.json 0600, synced.
pub fn create_entry(keep: &Path, receipt: &SkillReceipt) -> Result<PathBuf, KeepError> {
    if !keep.is_absolute() {
        return Err(KeepError::NotAbsolute);
    }
    if !is_id(&receipt.id) {
        return Err(KeepError::Io(io::ErrorKind::InvalidInput));
    }
    DirBuilder::new().recursive(true).mode(PRIVATE_FOLDER).create(keep)?;
    let entry = keep.join(&receipt.id);
    DirBuilder::new().mode(PRIVATE_FOLDER).create(&entry)?;

    let path = entry.join(RECEIPT);
    let written = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(PRIVATE_FILE)
        .open(&path)
        .and_then(|mut file| write_synced(&mut file, receipt));
    if let Err(error) = written {
        let _ = fs::remove_file(&path);
        let _ = fs::remove_dir(&entry);
        return Err(error.into());
    }
    sync_folder(&entry)?;
    sync_folder(keep)?;
    Ok(entry)
}

/// Replace receipt.json through a temp file and rename in the entry folder.
pub fn update(keep: &Path, receipt: &SkillReceipt) -> Result<(), KeepError> {
    if !keep.is_absolute() {
        return Err(KeepError::NotAbsolute);
    }
    if !is_id(&receipt.id) {
        return Err(KeepError::Io(io::ErrorKind::InvalidInput));
    }
    let entry = keep.join(&receipt.id);
    // Only an entry that is there: the temp file must not make one.
    if !fs::symlink_metadata(entry.join(RECEIPT))?.is_file() {
        return Err(KeepError::Io(io::ErrorKind::InvalidData));
    }
    let temp = entry.join(RECEIPT_TEMP);
    let written = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(PRIVATE_FILE)
        .open(&temp)
        .and_then(|mut file| write_synced(&mut file, receipt))
        .and_then(|()| fs::rename(&temp, entry.join(RECEIPT)));
    if let Err(error) = written {
        let _ = fs::remove_file(&temp);
        return Err(error.into());
    }
    sync_folder(&entry)?;
    Ok(())
}

/// Only a uuid in Hanger's own spelling, whose receipt holds that id.
pub fn load(keep: &Path, id: &str) -> Option<SkillReceipt> {
    if !keep.is_absolute() || !is_id(id) {
        return None;
    }
    let text = fs::read_to_string(keep.join(id).join(RECEIPT)).ok()?;
    serde_json::from_str::<SkillReceipt>(&text).ok().filter(|receipt| receipt.id == id)
}

/// Newest first; skips anything that does not load.
pub fn list(keep: &Path) -> Vec<SkillReceipt> {
    if !keep.is_absolute() {
        return Vec::new();
    }
    let Ok(entries) = fs::read_dir(keep) else { return Vec::new() };
    let mut receipts: Vec<SkillReceipt> = entries
        .flatten()
        .filter_map(|entry| entry.file_name().to_str().and_then(|id| load(keep, id)))
        .collect();
    receipts.sort_by(|a, b| b.at_ms.cmp(&a.at_ms).then_with(|| a.id.cmp(&b.id)));
    receipts
}

/// Remove an entry that holds nothing but its receipt.
///
/// It never removes a skill: if the entry holds anything other than the
/// receipt, its temp file or Finder's `.DS_Store`, nothing is removed and the
/// answer is an error.
pub fn remove_entry(keep: &Path, id: &str) -> Result<(), KeepError> {
    if !keep.is_absolute() {
        return Err(KeepError::NotAbsolute);
    }
    if !is_id(id) {
        return Err(KeepError::Io(io::ErrorKind::InvalidInput));
    }
    let entry = keep.join(id);
    let names: Vec<_> = fs::read_dir(&entry)?.collect::<Result<Vec<_>, _>>()?.into_iter().map(|e| e.file_name()).collect();
    if names.iter().any(|name| name != RECEIPT && name != RECEIPT_TEMP && name != FINDER_FILE) {
        return Err(KeepError::Io(io::ErrorKind::DirectoryNotEmpty));
    }
    for name in [RECEIPT_TEMP, FINDER_FILE, RECEIPT] {
        match fs::remove_file(entry.join(name)) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
    }
    fs::remove_dir(&entry)?;
    sync_folder(keep)?;
    Ok(())
}

fn write_synced(file: &mut File, receipt: &SkillReceipt) -> io::Result<()> {
    let text = serde_json::to_string_pretty(receipt).map_err(io::Error::other)?;
    file.write_all(text.as_bytes())?;
    file.sync_all()
}

/// Sync a folder, so a name made or removed in it is on disk.
fn sync_folder(folder: &Path) -> Result<(), KeepError> {
    File::open(folder)?.sync_all()?;
    Ok(())
}
