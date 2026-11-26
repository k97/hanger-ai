//! A skill folder as one value, and a move that never replaces anything.
//!
//! - `fingerprint`: one hex SHA-256 for a whole folder, so Hanger can tell
//!   whether a kept skill is still exactly what it moved, and whether it came
//!   back unchanged.
//! - `rename_no_replace`: the one way a skill folder moves. It is a rename, so
//!   the folder keeps its inode and is never copied, and it fails rather than
//!   take the place of anything already at the destination.

use std::ffi::CString;
use std::fs::{self, File};
use std::io;
use std::os::unix::ffi::OsStrExt;
use std::os::unix::fs::{FileTypeExt, PermissionsExt};
use std::path::Path;

use sha2::{Digest, Sha256};

/// Finder writes one of these into any folder it opens. It is not part of a
/// skill, and opening the keep in Finder must not make a kept skill read as
/// changed.
const FINDER_FILE: &str = ".DS_Store";

/// Why a move did not happen. Nothing was moved in any of them.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MoveError {
    /// Something is at the destination already, an empty folder or a
    /// dangling link included (`EEXIST`).
    Exists,
    /// The two paths are on different volumes (`EXDEV`). A rename cannot
    /// cross them, and Hanger does not copy instead.
    OtherVolume,
    /// Any other failure, by kind only.
    Io(io::ErrorKind),
}

/// Hex SHA-256 over every entry under `root`, sorted by relative path bytes,
/// never following a link: for each, the relative path, its type (d/f/l),
/// mode & 0o7777, and for a file its bytes' SHA-256, for a link its text.
/// `root` itself may be a link: then the fingerprint is of its text alone.
/// Entries named exactly `.DS_Store` are skipped (Finder writes them on open).
pub fn fingerprint(root: &Path) -> io::Result<String> {
    let meta = fs::symlink_metadata(root)?;
    let mut entries: Vec<(Vec<u8>, Vec<u8>)> = Vec::new();
    if meta.file_type().is_symlink() {
        entries.push((Vec::new(), describe(root, &meta)?));
    } else if meta.is_dir() {
        walk(root, &mut Vec::new(), &mut entries)?;
    } else {
        entries.push((Vec::new(), describe(root, &meta)?));
    }
    entries.sort_by(|a, b| a.0.cmp(&b.0));

    let mut hasher = Sha256::new();
    for (relative, described) in &entries {
        field(&mut hasher, relative);
        field(&mut hasher, described);
    }
    Ok(hex::encode(hasher.finalize()))
}

/// Each field is preceded by its length, so no two different lists of
/// entries hash the same bytes.
fn field(hasher: &mut Sha256, bytes: &[u8]) {
    hasher.update((bytes.len() as u64).to_be_bytes());
    hasher.update(bytes);
}

fn walk(folder: &Path, relative: &mut Vec<u8>, out: &mut Vec<(Vec<u8>, Vec<u8>)>) -> io::Result<()> {
    for entry in fs::read_dir(folder)? {
        let entry = entry?;
        let name = entry.file_name();
        if name == FINDER_FILE {
            continue;
        }
        let path = entry.path();
        // `symlink_metadata`, never `metadata`: a link is described by its
        // text and never entered.
        let meta = fs::symlink_metadata(&path)?;
        let mark = relative.len();
        if !relative.is_empty() {
            relative.push(b'/');
        }
        relative.extend_from_slice(name.as_bytes());
        out.push((relative.clone(), describe(&path, &meta)?));
        if meta.is_dir() {
            walk(&path, relative, out)?;
        }
        relative.truncate(mark);
    }
    Ok(())
}

/// One entry's type, mode, and its content's hash or its link text.
fn describe(path: &Path, meta: &fs::Metadata) -> io::Result<Vec<u8>> {
    let kind = meta.file_type();
    let mut out = Vec::new();
    let tag = if kind.is_symlink() {
        b'l'
    } else if kind.is_dir() {
        b'd'
    } else if kind.is_file() {
        b'f'
    } else if kind.is_fifo() || kind.is_socket() || kind.is_block_device() || kind.is_char_device() {
        b'o'
    } else {
        b'?'
    };
    out.push(tag);
    out.extend_from_slice(&(meta.permissions().mode() & 0o7777).to_be_bytes());
    match tag {
        b'l' => out.extend_from_slice(fs::read_link(path)?.as_os_str().as_bytes()),
        b'f' => {
            let mut hasher = Sha256::new();
            io::copy(&mut File::open(path)?, &mut hasher)?;
            out.extend_from_slice(&hasher.finalize());
        }
        _ => {}
    }
    Ok(out)
}

/// `renamex_np(from, to, RENAME_EXCL)`. Never replaces anything at `to`.
///
/// Plain `rename(2)` replaces an empty folder at `to` without a word.
/// `RENAME_EXCL` makes it fail with `EEXIST` instead. Both are in the locked
/// `libc` 0.2.191 (`src/unix/bsd/apple/mod.rs`: `pub const RENAME_EXCL:
/// c_uint = 0x00000004;` and `pub fn renamex_np(from: *const c_char, to:
/// *const c_char, flags: c_uint) -> c_int;`), as docs.rs lists for
/// `libc/0.2.191/x86_64-apple-darwin/libc/fn.renamex_np.html`. A link at
/// `from` is moved as the link, never its target.
pub fn rename_no_replace(from: &Path, to: &Path) -> Result<(), MoveError> {
    let from = CString::new(from.as_os_str().as_bytes()).map_err(|_| MoveError::Io(io::ErrorKind::InvalidInput))?;
    let to = CString::new(to.as_os_str().as_bytes()).map_err(|_| MoveError::Io(io::ErrorKind::InvalidInput))?;
    // SAFETY: both pointers are to NUL-terminated strings that outlive the
    // call, and the call keeps neither.
    let result = unsafe { libc::renamex_np(from.as_ptr(), to.as_ptr(), libc::RENAME_EXCL) };
    if result == 0 {
        return Ok(());
    }
    let error = io::Error::last_os_error();
    Err(match error.raw_os_error() {
        Some(libc::EEXIST) => MoveError::Exists,
        Some(libc::EXDEV) => MoveError::OtherVolume,
        _ => MoveError::Io(error.kind()),
    })
}
