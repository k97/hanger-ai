//! Reading Hanger's store from a second process: Hanger's own MCP server,
//! which an engine launches whether the app is open, mid-scan or closed.
//!
//! The app's paths go through `PreferencesStore::new`, which creates the
//! store and runs its migrations. A second process must do neither, so it
//! opens the file read-only and refuses one at any version but
//! `STORE_VERSION`. The store runs a rollback journal: a writer cannot
//! commit while any reader holds SHARED, and most of the app's writers wait
//! only rusqlite's default 5 s. So every read here runs under
//! `with_read_deadline`, which interrupts it at `READ_DEADLINE`, a fifth of
//! that, while the open itself waits up to 30 s for the app's writers.

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::time::Duration;

use rusqlite::{Connection, ErrorCode, OpenFlags, OptionalExtension};
use serde::Serialize;

use crate::preferences::{LAST_SCAN_KEY, STORE_VERSION};

/// Why the store could not be read. A code and nothing else.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StoreUnavailable {
    /// No store, or no scan has finished since this build first ran.
    NotScannedYet,
    /// The store is at a schema version this build does not read.
    OtherVersion,
    /// The app held the store's lock past the wait, or a read ran past
    /// `READ_DEADLINE`.
    Busy,
    /// Anything else SQLite refused.
    Unreadable,
}

impl StoreUnavailable {
    pub fn code(self) -> &'static str {
        match self {
            Self::NotScannedYet => "not_scanned_yet",
            Self::OtherVersion => "other_version",
            Self::Busy => "busy",
            Self::Unreadable => "unreadable",
        }
    }
}

/// How long one tool's reads may hold the store: a fifth of the 5 s the
/// app's default writers wait, so a server read never makes them give up.
pub const READ_DEADLINE: Duration = Duration::from_secs(1);

/// How long the server waits for the app's writers, as `search.rs`'s index
/// writers do. A pending writer blocks new readers, and the server is the one
/// that should give way.
const WAIT_FOR_WRITERS: Duration = Duration::from_secs(30);

fn classify(e: &rusqlite::Error) -> StoreUnavailable {
    match e.sqlite_error_code() {
        Some(ErrorCode::DatabaseBusy) | Some(ErrorCode::DatabaseLocked) | Some(ErrorCode::OperationInterrupted) => {
            StoreUnavailable::Busy
        }
        _ => StoreUnavailable::Unreadable,
    }
}

/// Open the store read-only, never creating or migrating it.
pub fn open_read_only(db_path: &Path) -> Result<Connection, StoreUnavailable> {
    if !db_path.exists() {
        return Err(StoreUnavailable::NotScannedYet);
    }
    let conn = Connection::open_with_flags(db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| classify(&e))?;
    conn.busy_timeout(WAIT_FOR_WRITERS).map_err(|e| classify(&e))?;
    let version: i32 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(|e| classify(&e))?;
    if version != STORE_VERSION {
        return Err(StoreUnavailable::OtherVersion);
    }
    Ok(conn)
}

/// Run `read`, interrupting any statement still running at `limit`. A read
/// that fails after the interrupt was sent answers `Busy`, whatever error
/// the interrupted statement surfaced as. An interrupt sent while no
/// statement runs does nothing (SQLite's `sqlite3_interrupt`), so a read busy
/// with files at the deadline is not cut short.
pub fn with_read_deadline<T>(
    conn: &Connection,
    limit: Duration,
    read: impl FnOnce(&Connection) -> Result<T, StoreUnavailable>,
) -> Result<T, StoreUnavailable> {
    let handle = conn.get_interrupt_handle();
    let fired = Arc::new(AtomicBool::new(false));
    let (done, wait) = mpsc::channel::<()>();
    let timer = {
        let fired = fired.clone();
        std::thread::spawn(move || {
            if wait.recv_timeout(limit) == Err(mpsc::RecvTimeoutError::Timeout) {
                fired.store(true, Ordering::SeqCst);
                handle.interrupt();
            }
        })
    };
    let out = read(conn);
    drop(done);
    let _ = timer.join();
    match out {
        Err(_) if fired.load(Ordering::SeqCst) => Err(StoreUnavailable::Busy),
        other => other,
    }
}

/// When the last scan finished, in milliseconds since the epoch. `None`
/// until `finish_scan` has run once on this store.
pub fn last_scan_ms(conn: &Connection) -> Result<Option<i64>, StoreUnavailable> {
    let value: Option<String> = conn
        .query_row("SELECT value FROM preferences WHERE key = ?1", [LAST_SCAN_KEY], |r| r.get(0))
        .optional()
        .map_err(|e| classify(&e))?;
    match value {
        None => Ok(None),
        Some(v) => v.parse().map(Some).map_err(|_| StoreUnavailable::Unreadable),
    }
}
