//! Replace a config file's text safely, keep a copy of what was there, and
//! put it back on request.
//!
//! Nothing calls this yet. `edit` produces the text; this module is the one
//! place that puts text on disk. It never logs, and it takes the backups
//! folder as a parameter: the caller passes a folder under the app's data
//! directory, so nothing here depends on the working directory. A path that
//! is not absolute is refused, for the file and for the backups folder alike.
//!
//! # A write
//!
//! `safe_replace`, ported from mcpick's `safe_content_write`
//! (`src/utils/safe-apply.ts`; Copyright (c) 2026 Scott Spence, MIT licence),
//! with the differences marked †:
//!
//! 1. † The new text must parse as its format before the disk is touched.
//! 2. † The path is resolved with `fs::canonicalize`, and the real file is the
//!    one written. A config that is a link into a dotfiles repo stays a link.
//! 3. † The file is read again and compared with what the caller read. If the
//!    bytes differ, or the file is there when the caller found none, or gone
//!    when the caller found one, the answer is `ChangedSinceRead` and nothing
//!    is written.
//! 4. The current bytes are copied into the backups folder, and a receipt is
//!    written beside the copy. The folder is made 0700 if it is missing; the
//!    files in it are 0600.
//! 5. The new text goes to a temp file in the real file's own folder, † made
//!    with the original's permission bits before any text is in it, then
//!    `sync_all`, then `rename` over the real file.
//! 6. The file is read back. If it does not hold the new text, or the text
//!    does not parse, the original bytes are put back (a file this write
//!    created is removed), the backup and receipt are deleted, and the answer
//!    is `Verify`.
//! 7. † The newest 20 backups of that file are kept, and anything older is
//!    deleted together with its receipt. A count cap, not an age cap.
//!
//! mcpick's dry-run session is not ported: `edit` is pure, so the text a
//! write would put down can be had without calling this module. mcpick makes
//! the file's folder when it is missing; this does not, and refuses.
//!
//! # Names in the backups folder
//!
//! - A backup: `config-<basename>-<stamp>-<hash>.<ext>`. `<stamp>` is
//!   milliseconds since the Unix epoch, zero-padded to 14 digits. `<hash>` is
//!   the first 10 hex digits of the SHA-256 of the real path. `<ext>` is the
//!   original's extension, `json` where it has none. Two writes of one file
//!   in one millisecond do not share a name: the second takes the next
//!   millisecond, and its receipt's `at_ms` says the same.
//! - Its receipt: `<backup name>.receipt.json`.
//! - The receipt of a write that created the file, which has no backup:
//!   `created-<basename>-<stamp>-<hash>.receipt.json`.
//!
//! A receipt file is listed only when its name is the one its own `path` and
//! `at_ms` give, and its `backup_file` is the file it sits beside. So a
//! receipt cannot send an Undo to a backup somewhere else.
//!
//! # Undo
//!
//! `latest_receipts` and `undo` stand where mcpick has `list_config_backups`
//! and `restore_config_backup`. mcpick restores a backup over whatever the
//! file holds by then, and re-serialises a JSON one; neither is done here.
//!
//! `undo` puts back what a receipt's write replaced, and only while the file
//! still holds exactly what that write left: the file's SHA-256 must equal
//! the receipt's `after_sha256`. The backup must still be there and must
//! still hash to `before_sha256`. The restore is a `safe_replace` of its own,
//! so it is backed up and receipted and can itself be undone. It is checked
//! as TOML where the backup's name ends in `.toml`, and as JSONC otherwise.
//!
//! Undo of a write that created the file removes the file, under the same
//! hash check. The removal keeps a copy and a receipt too, so undoing it
//! brings the file back.
//!
//! # Known limits
//!
//! - Two Hanger writes to one file at the same moment are not serialised.
//!   There is no lock.
//! - Between the comparison in step 3 and the rename in step 5 there is a
//!   window, as long as it takes to write the backup, the receipt and the
//!   temp file. A save another program makes inside it is replaced by the
//!   rename and is in no backup: the backup holds the bytes from before it.
//! - The rename gives the file a new inode. Its permission bits are carried
//!   over; its owner, extended attributes, ACL and any hard links are not.
//! - The folder is not synced after the rename, so a power cut straight after
//!   a write can bring back the old file.
//! - Undo picks its parser from the backup's extension. A TOML file whose
//!   name does not end in `.toml` can be written and cannot be undone: the
//!   restore is refused with `Verify`, and nothing is written.
//! - A file whose text is not UTF-8 cannot be written at all: the caller's
//!   copy of it is a `&str`.

use std::fs::{self, DirBuilder, File, OpenOptions, Permissions};
use std::io::{self, Write};
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::mcp::dialect::strip_jsonc;

/// Why a write or an Undo did not happen.
///
/// No variant carries text from a file. Each string is one of this module's
/// own sentences, followed at most by the name of an `io::ErrorKind`. It is
/// never a parser's message: toml's quotes the line it failed on.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ApplyError {
    /// The file is not as the caller read it. Nothing was written.
    ChangedSinceRead,
    /// The copy of the current file, or its receipt, could not be kept.
    /// Nothing was written.
    Backup(String),
    /// The new text could not be put in place. The file is as it was.
    Write(String),
    /// The new text does not parse, or did not read back after the write.
    Verify(String),
    /// The receipt's write cannot be taken back.
    NotUndoable(String),
}

/// What a file's text has to parse as.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
    /// JSON with comments and trailing commas: what `dialect::strip_jsonc`
    /// lets through to serde_json.
    Jsonc,
    /// JSON as `JSON.parse` reads it. Gemini CLI's state file.
    StrictJson,
    Toml,
}

/// The record of one write. Ids, hashes, names and a path: never file content.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Receipt {
    /// A uuid.
    pub id: String,
    /// The real file, with links resolved.
    pub path: String,
    /// A file name inside the backups folder, never a full path. `None` for a
    /// write that created the file: there was nothing to copy.
    pub backup_file: Option<String>,
    /// Empty where there was no file before the write.
    pub before_sha256: String,
    /// Empty where there is no file after it: an Undo that removed one.
    pub after_sha256: String,
    pub at_ms: i64,
    /// Supplied by the caller: ids such as `codex · beta · off`.
    pub what: String,
}

/// The two things a test replaces: the clock, and the check made after the
/// rename. `safe_replace` passes the real ones.
#[doc(hidden)]
pub struct Seams<'a> {
    pub at_ms: i64,
    /// Given the text read back from disk; `false` puts the original back.
    pub verify: &'a dyn Fn(&str) -> bool,
}

/// How many backups of one file are kept (ruling 21 in the plan).
const KEPT_PER_FILE: usize = 20;
const RECEIPT_SUFFIX: &str = ".receipt.json";
/// The mode of a file this module creates where there was none.
const PRIVATE_FILE: u32 = 0o600;
const PRIVATE_FOLDER: u32 = 0o700;
/// How many later milliseconds are tried for a free backup name.
const STAMPS_TRIED: i64 = 1_000;

const PATH_NOT_ABSOLUTE: &str = "the file's path is not absolute";
const PATH_NOT_UTF8: &str = "the file's path is not valid UTF-8";
const PATH_UNRESOLVED: &str = "the file's real location could not be resolved";
const NO_FOLDER: &str = "the folder the file belongs in could not be resolved";
const UNREADABLE: &str = "the file could not be read";
const BACKUPS_NOT_ABSOLUTE: &str = "the backups folder's path is not absolute";
const NO_BACKUPS_FOLDER: &str = "the backups folder could not be made";
const NO_BACKUP: &str = "the copy of the current file could not be written";
const NO_RECEIPT: &str = "the receipt could not be written";
const NO_FREE_NAME: &str = "no free name was found for the backup";
const NOT_WRITTEN: &str = "the new text could not be put in place";
const NOT_REMOVED: &str = "the file could not be removed";
const DOES_NOT_PARSE: &str = "the new text does not parse as the file's format";
const NOT_READ_BACK: &str =
    "the file did not read back as written, and the original was put back";
const NOT_PUT_BACK: &str =
    "the file did not read back as written, and the original could not be put back; a copy of it is in the backups folder";
const NO_SUCH_RECEIPT: &str = "no receipt has that id";
const MOVED_ON: &str = "the file no longer holds what that write left";
const BACKUP_GONE: &str = "the backup for that write is no longer there";
const BACKUP_ALTERED: &str = "the backup for that write is no longer what was backed up";

/// Replace `path`'s text with `next`, keeping a copy of what was there.
///
/// `expected_before` is what the caller read: `Some(text)` when the file must
/// still hold exactly those bytes, `None` when it must not exist yet (Gemini
/// CLI's state file on first use). Anything else is `ChangedSinceRead`.
///
/// `backups` is the folder for the copy and its receipt. `what` goes into the
/// receipt as given, so it holds ids and never file content.
pub fn safe_replace(
    path: &Path,
    expected_before: Option<&str>,
    next: &str,
    format: Format,
    backups: &Path,
    what: &str,
) -> Result<Receipt, ApplyError> {
    let seams = Seams { at_ms: now_ms(), verify: &|text| parses(text, format) };
    safe_replace_with(path, expected_before, next, format, backups, what, seams)
}

/// `safe_replace`, with the clock and the after-write check supplied.
#[doc(hidden)]
pub fn safe_replace_with(
    path: &Path,
    expected_before: Option<&str>,
    next: &str,
    format: Format,
    backups: &Path,
    what: &str,
    seams: Seams<'_>,
) -> Result<Receipt, ApplyError> {
    if !parses(next, format) {
        return Err(ApplyError::Verify(DOES_NOT_PARSE.to_string()));
    }
    if !path.is_absolute() {
        return Err(ApplyError::Write(PATH_NOT_ABSOLUTE.to_string()));
    }
    if !backups.is_absolute() {
        return Err(ApplyError::Backup(BACKUPS_NOT_ABSOLUTE.to_string()));
    }

    // Whether anything is at the path, a link whose target is missing included.
    let is_there = match fs::symlink_metadata(path) {
        Ok(_) => true,
        Err(error) if error.kind() == io::ErrorKind::NotFound => false,
        Err(error) => return Err(ApplyError::Write(note(PATH_UNRESOLVED, &error))),
    };
    let (real, original) = match (is_there, expected_before) {
        (false, Some(_)) => return Err(ApplyError::ChangedSinceRead),
        (true, expected) => {
            let real = fs::canonicalize(path)
                .map_err(|error| ApplyError::Write(note(PATH_UNRESOLVED, &error)))?;
            let Some(expected) = expected else { return Err(ApplyError::ChangedSinceRead) };
            let original = read_for_replacing(&real, expected.as_bytes())?;
            (real, Some(original))
        }
        (false, None) => {
            let (Some(folder), Some(name)) = (path.parent(), path.file_name()) else {
                return Err(ApplyError::Write(NO_FOLDER.to_string()));
            };
            let folder = fs::canonicalize(folder)
                .map_err(|error| ApplyError::Write(note(NO_FOLDER, &error)))?;
            (folder.join(name), None)
        }
    };
    let real_text = real.to_str().ok_or_else(|| ApplyError::Write(PATH_NOT_UTF8.to_string()))?;

    let before = original.as_ref().map(|original| original.bytes.as_slice());
    let kept = keep(backups, real_text, before, sha256_hex(next.as_bytes()), seams.at_ms, what)?;

    let mode = original.as_ref().map_or(PRIVATE_FILE, |original| original.mode);
    if let Err(error) = write_atomic(&real, next.as_bytes(), mode) {
        // The rename did not happen, so the file is as it was.
        kept.discard();
        return Err(ApplyError::Write(note(NOT_WRITTEN, &error)));
    }

    let read_back = fs::read(&real).ok().filter(|bytes| bytes == next.as_bytes());
    let landed = read_back
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .is_some_and(|text| (seams.verify)(&text));
    if !landed {
        let put_back = match &original {
            Some(original) => write_atomic(&real, &original.bytes, original.mode),
            None => remove_if_there(&real),
        };
        return Err(match put_back {
            Ok(()) => {
                kept.discard();
                ApplyError::Verify(NOT_READ_BACK.to_string())
            }
            // The backup and its receipt stay: they are the way back.
            Err(error) => ApplyError::Verify(note(NOT_PUT_BACK, &error)),
        });
    }

    evict(backups, real_text);
    Ok(kept.receipt)
}

/// Take back the write a receipt records.
///
/// Refused with `NotUndoable` unless the file still holds exactly what that
/// write left, and the backup is still there and still what was backed up.
/// The returned receipt is the Undo's own, and can be undone in turn.
pub fn undo(receipt_id: &str, backups: &Path) -> Result<Receipt, ApplyError> {
    let receipt = latest_receipts(backups)
        .into_iter()
        .find(|receipt| receipt.id == receipt_id)
        .ok_or_else(|| ApplyError::NotUndoable(NO_SUCH_RECEIPT.to_string()))?;
    let path = Path::new(&receipt.path);

    let current = match fs::read(path) {
        Ok(bytes) => Some(bytes),
        Err(error) if error.kind() == io::ErrorKind::NotFound => None,
        Err(error) => return Err(ApplyError::NotUndoable(note(UNREADABLE, &error))),
    };
    // An absent file hashes to the empty string, as it does in a receipt.
    let current_sha256 = current.as_deref().map(sha256_hex).unwrap_or_default();
    if current_sha256 != receipt.after_sha256 {
        return Err(ApplyError::NotUndoable(MOVED_ON.to_string()));
    }
    let moved_on = || ApplyError::NotUndoable(MOVED_ON.to_string());
    let what = format!("undo · {}", receipt.what);

    let Some(backup_name) = &receipt.backup_file else {
        // The write created the file, so taking it back removes the file.
        let written = current.ok_or_else(moved_on)?;
        return remove_keeping_a_copy(path, &written, backups, &what);
    };
    let backup = fs::read(backups.join(backup_name))
        .map_err(|error| ApplyError::NotUndoable(note(BACKUP_GONE, &error)))?;
    if sha256_hex(&backup) != receipt.before_sha256 {
        return Err(ApplyError::NotUndoable(BACKUP_ALTERED.to_string()));
    }
    let backup = String::from_utf8(backup)
        .map_err(|_| ApplyError::NotUndoable(BACKUP_ALTERED.to_string()))?;
    let current = current.map(String::from_utf8).transpose().map_err(|_| moved_on())?;
    let format = if backup_name.ends_with(".toml") { Format::Toml } else { Format::Jsonc };
    // `current` is what was hashed above, so a save that lands between that
    // check and this write is caught by the comparison `safe_replace` makes.
    safe_replace(path, current.as_deref(), &backup, format, backups, &what)
}

/// Every receipt in the backups folder, newest first.
///
/// A folder that is not there has none. A receipt file that cannot be read,
/// does not parse, or is not named for its own path and time is skipped.
pub fn latest_receipts(backups: &Path) -> Vec<Receipt> {
    listed(backups).into_iter().map(|(receipt, _)| receipt).collect()
}

/// The file being replaced, as it is on disk now.
struct Original {
    bytes: Vec<u8>,
    /// Its permission bits.
    mode: u32,
}

/// Read the real file, and refuse unless it holds exactly `expected`.
fn read_for_replacing(real: &Path, expected: &[u8]) -> Result<Original, ApplyError> {
    let unreadable = |error: io::Error| match error.kind() {
        // Gone between the look and the read.
        io::ErrorKind::NotFound => ApplyError::ChangedSinceRead,
        _ => ApplyError::Write(note(UNREADABLE, &error)),
    };
    let bytes = fs::read(real).map_err(unreadable)?;
    if bytes != expected {
        return Err(ApplyError::ChangedSinceRead);
    }
    let mode = fs::metadata(real).map_err(unreadable)?.permissions().mode() & 0o777;
    Ok(Original { bytes, mode })
}

/// What one write left in the backups folder.
struct Kept {
    receipt: Receipt,
    receipt_file: PathBuf,
    backup_file: Option<PathBuf>,
}

impl Kept {
    /// For a write that did not happen: nothing should say it did.
    fn discard(&self) {
        if let Some(backup) = &self.backup_file {
            let _ = fs::remove_file(backup);
        }
        let _ = fs::remove_file(&self.receipt_file);
    }
}

/// Copy `before` into the backups folder and write the receipt beside it.
/// With no `before` (the write creates the file) only the receipt is written.
fn keep(
    backups: &Path,
    real: &str,
    before: Option<&[u8]>,
    after_sha256: String,
    at_ms: i64,
    what: &str,
) -> Result<Kept, ApplyError> {
    DirBuilder::new()
        .recursive(true)
        .mode(PRIVATE_FOLDER)
        .create(backups)
        .map_err(|error| ApplyError::Backup(note(NO_BACKUPS_FOLDER, &error)))?;

    let first = at_ms.max(0);
    for stamp in first..first + STAMPS_TRIED {
        let name = kept_name(real, stamp, before.is_some());
        let receipt_file = backups.join(format!("{name}{RECEIPT_SUFFIX}"));
        let backup_file = before.map(|_| backups.join(&name));

        // `create_new` on both: a name already in the folder belongs to
        // another write in this millisecond, and is never written over.
        if let (Some(file), Some(bytes)) = (&backup_file, before) {
            match write_new(file, bytes) {
                Ok(()) => {}
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
                Err(error) => {
                    let _ = fs::remove_file(file);
                    return Err(ApplyError::Backup(note(NO_BACKUP, &error)));
                }
            }
        }
        let receipt = Receipt {
            id: uuid::Uuid::new_v4().to_string(),
            path: real.to_string(),
            backup_file: backup_file.as_ref().map(|_| name.clone()),
            before_sha256: before.map(sha256_hex).unwrap_or_default(),
            after_sha256: after_sha256.clone(),
            at_ms: stamp,
            what: what.to_string(),
        };
        let kept = Kept { receipt, receipt_file, backup_file };
        let json = serde_json::to_vec_pretty(&kept.receipt)
            .map_err(|_| ApplyError::Backup(NO_RECEIPT.to_string()));
        match json.map(|json| write_new(&kept.receipt_file, &json)) {
            Ok(Ok(())) => return Ok(kept),
            Ok(Err(error)) if error.kind() == io::ErrorKind::AlreadyExists => {
                // The receipt's name is taken and is not ours to remove.
                if let Some(backup) = &kept.backup_file {
                    let _ = fs::remove_file(backup);
                }
            }
            Ok(Err(error)) => {
                kept.discard();
                return Err(ApplyError::Backup(note(NO_RECEIPT, &error)));
            }
            Err(error) => {
                kept.discard();
                return Err(error);
            }
        }
    }
    Err(ApplyError::Backup(NO_FREE_NAME.to_string()))
}

/// The name a write's backup has in the backups folder, or, for a write that
/// created the file, the name its receipt has before `.receipt.json`. A pure
/// function of the path, the time and which of the two it is: a receipt file
/// is listed only when its name is the one its contents give.
fn kept_name(real: &str, at_ms: i64, has_backup: bool) -> String {
    let safe = |part: Option<&std::ffi::OsStr>, fallback: &str| -> String {
        let text = part.map(|part| part.to_string_lossy().into_owned()).unwrap_or_default();
        let text: String = text
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() || "._-".contains(c) { c } else { '_' })
            .collect();
        if text.is_empty() { fallback.to_string() } else { text }
    };
    let path = Path::new(real);
    let base = safe(path.file_name(), "file");
    let hash = &sha256_hex(real.as_bytes())[..10];
    if has_backup {
        let ext = safe(path.extension(), "json");
        format!("config-{base}-{at_ms:014}-{hash}.{ext}")
    } else {
        format!("created-{base}-{at_ms:014}-{hash}")
    }
}

/// Every receipt file that reads as a receipt and is named for its contents,
/// newest first, with its file name.
fn listed(backups: &Path) -> Vec<(Receipt, String)> {
    let Ok(entries) = fs::read_dir(backups) else { return Vec::new() };
    let mut found: Vec<(Receipt, String)> = entries
        .flatten()
        .filter_map(|entry| {
            let file_name = entry.file_name().to_str()?.to_string();
            let stem = file_name.strip_suffix(RECEIPT_SUFFIX)?;
            let text = fs::read_to_string(entry.path()).ok()?;
            let receipt: Receipt = serde_json::from_str(&text).ok()?;
            let has_backup = receipt.backup_file.is_some();
            let named_for_its_contents = stem == kept_name(&receipt.path, receipt.at_ms, has_backup);
            let beside_its_backup = receipt.backup_file.as_deref().map_or(true, |name| name == stem);
            (named_for_its_contents && beside_its_backup).then_some((receipt, file_name))
        })
        .collect();
    // Two files written in one millisecond tie; the name settles it the same
    // way every time.
    found.sort_by(|a, b| b.0.at_ms.cmp(&a.0.at_ms).then_with(|| b.1.cmp(&a.1)));
    found
}

/// Keep the newest `KEPT_PER_FILE` backups of one file. Everything of that
/// file's older than the last one kept goes, each backup with its receipt.
/// Best effort: a file that cannot be deleted is tried again after the next
/// write.
fn evict(backups: &Path, real: &str) {
    let mut held = 0;
    for (receipt, receipt_file) in listed(backups) {
        if receipt.path != real {
            continue;
        }
        if held < KEPT_PER_FILE {
            held += usize::from(receipt.backup_file.is_some());
            continue;
        }
        // The backup first: a receipt left without one says so when asked,
        // and a backup left without its receipt would never be found again.
        if let Some(name) = &receipt.backup_file {
            let _ = fs::remove_file(backups.join(name));
        }
        let _ = fs::remove_file(backups.join(receipt_file));
    }
}

/// Remove a file that still holds `expected`, keeping a copy and a receipt.
/// This is the Undo of a write that created the file.
fn remove_keeping_a_copy(
    path: &Path,
    expected: &[u8],
    backups: &Path,
    what: &str,
) -> Result<Receipt, ApplyError> {
    let real = fs::canonicalize(path)
        .map_err(|error| ApplyError::Write(note(PATH_UNRESOLVED, &error)))?;
    let real_text = real.to_str().ok_or_else(|| ApplyError::Write(PATH_NOT_UTF8.to_string()))?;
    let original = read_for_replacing(&real, expected)?;
    let kept = keep(backups, real_text, Some(&original.bytes), String::new(), now_ms(), what)?;
    if let Err(error) = fs::remove_file(&real) {
        kept.discard();
        return Err(ApplyError::Write(note(NOT_REMOVED, &error)));
    }
    evict(backups, real_text);
    Ok(kept.receipt)
}

/// Write `bytes` to a temp file beside `real`, then rename it over `real`.
/// The temp file is gone when this returns, whichever way it returns.
fn write_atomic(real: &Path, bytes: &[u8], mode: u32) -> io::Result<()> {
    let (Some(folder), Some(name)) = (real.parent(), real.file_name()) else {
        return Err(io::Error::from(io::ErrorKind::InvalidInput));
    };
    let temp = folder.join(format!(
        ".{}.{}.{}.tmp",
        name.to_string_lossy(),
        std::process::id(),
        uuid::Uuid::new_v4()
    ));
    let written = (|| {
        // Made with the mode, so there is no moment at which the text sits in
        // a file more open than the one it replaces. The process umask can
        // only take bits away from that, so the exact bits are set on the
        // still-empty file before the text goes in.
        let mut file = OpenOptions::new().write(true).create_new(true).mode(mode).open(&temp)?;
        file.set_permissions(Permissions::from_mode(mode))?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temp, real)
    })();
    if written.is_err() {
        let _ = fs::remove_file(&temp);
    }
    written
}

/// Create a private file that must not exist yet, and sync it.
fn write_new(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let mut file: File =
        OpenOptions::new().write(true).create_new(true).mode(PRIVATE_FILE).open(path)?;
    file.write_all(bytes)?;
    file.sync_all()
}

fn remove_if_there(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Err(error) if error.kind() != io::ErrorKind::NotFound => Err(error),
        _ => Ok(()),
    }
}

fn parses(text: &str, format: Format) -> bool {
    match format {
        Format::Jsonc => serde_json::from_str::<serde_json::Value>(&strip_jsonc(text)).is_ok(),
        Format::StrictJson => serde_json::from_str::<serde_json::Value>(text).is_ok(),
        Format::Toml => toml::from_str::<toml::Table>(text).is_ok(),
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|since| since.as_millis() as i64)
        .unwrap_or_default()
}

/// One of this module's sentences and the kind of I/O error behind it. The
/// kind is a name such as `PermissionDenied`: no path, and nothing from a file.
fn note(sentence: &str, error: &io::Error) -> String {
    format!("{sentence} ({:?})", error.kind())
}
