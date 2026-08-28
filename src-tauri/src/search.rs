//! The content index behind the search palette.
//!
//! One FTS5 table, `asset_search` (migration v8), one writer per source of
//! truth and one reader. `index_inventory` rebuilds the four asset kinds
//! from the combined inventory at the end of every scan; `index_probe_tools`
//! rewrites one registration's MCP tool rows after every probe. The reader
//! ranks by bm25 with name weighted over description over body, and returns
//! a snippet with private-use markers around each match so the frontend can
//! emphasise them without parsing HTML. The scan hook is `start_scan` in
//! `lib.rs`; the probe hook is `mcp_cached_probe`, also in `lib.rs`.
//!
//! Bodies are re-read here rather than threaded out of the scanner's many
//! `upsert_asset` sites: one site instead of many, and a miss is uniform
//! across kinds instead of a partial fix that indexes three and drops one.
//!
//! Both writers open their connection with a 30 s busy timeout
//! (`index_connection`): the rescan a server-detail open triggers can hold
//! the store's write lock past rusqlite's 5 s default, and a dropped index
//! write is silent to the user, so the writer waits instead of giving up.
//! The `SanitisedError` a caller sees is still a fixed string; the
//! underlying SQLite error reaches only the log, via `err`.
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::time::Duration;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::domain::{Inventory, Scope};
use crate::mcp::probe::ProbedTool;
use crate::preferences::{PreferencesStore, SanitisedError};

/// Wrap each matched run in the snippet. Private-use code points: nothing
/// on disk contains them, so the frontend can split on them blind.
pub const MARK_OPEN: &str = "\u{E000}";
pub const MARK_CLOSE: &str = "\u{E001}";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SearchHit {
    /// `skill` | `rule` | `subagent` | `server` | `mcp_tool`.
    pub kind: String,
    /// What the frontend selects by: the asset path for the three file
    /// kinds, the registration key for a server and for its tools.
    pub id: String,
    /// The asset path, or the config file for a server / tool.
    pub path: String,
    pub name: String,
    /// The server a tool belongs to; `None` for every other kind.
    pub server: Option<String>,
    /// `global`, or the project root.
    pub place: String,
    pub snippet: String,
    pub rank: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SearchResponse {
    pub hits: Vec<SearchHit>,
    /// Backend-owned: the frontend renders it, never derives it.
    pub total: usize,
}

/// The `SanitisedError` returned to callers stays a fixed string; the cause
/// goes to the log only, so a caller can never render SQLite's own message.
fn err(msg: &'static str) -> impl Fn(rusqlite::Error) -> SanitisedError {
    move |e| {
        log::warn!("{msg}: {e}");
        SanitisedError(msg.to_string())
    }
}

/// A connection for the two index writers, with a 30 s busy timeout: the
/// rescan a server-detail open triggers can hold the store's write lock past
/// rusqlite's 5 s default, and a dropped index write is silent, so wait
/// instead of giving up.
fn index_connection(store: &PreferencesStore) -> Result<Connection, SanitisedError> {
    let conn = store.connect()?;
    conn.busy_timeout(Duration::from_secs(30))
        .map_err(err("Failed to configure search index connection"))?;
    Ok(conn)
}

fn place_of(scope: Option<&Scope>) -> String {
    match scope {
        Some(Scope::Project { root, .. }) | Some(Scope::Local { root, .. }) => root.clone(),
        _ => "global".to_string(),
    }
}

/// Rebuild the four asset kinds from `inventory` and drop `mcp_tool` rows
/// whose registration no longer exists. One transaction, so a reader never
/// sees a half-built index.
pub fn index_inventory(db_path: &Path, inventory: &Inventory) -> Result<(), SanitisedError> {
    let store = PreferencesStore::new(db_path)?;
    let mut conn = index_connection(&store)?;
    // `Immediate`, not the default `Deferred`: `asset_search` is an FTS5
    // virtual table, and preparing the DELETE below runs its xConnect, which
    // reads the shadow config table before the DELETE itself executes. That
    // read leaves a `Deferred` transaction holding only SHARED, and SQLite's
    // deadlock avoidance refuses the SHARED-to-RESERVED upgrade a write needs
    // without invoking the busy handler when another connection already
    // holds RESERVED — so the DELETE fails immediately with "database is
    // locked" rather than waiting out `busy_timeout` (app log, 2026-08-28:
    // "Failed to clear search index"). Starting `Immediate` takes the write
    // lock up front, where the busy handler does apply, same as
    // `index_probe_tools` below.
    let tx = conn
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(err("Failed to start search index transaction"))?;

    tx.execute("DELETE FROM asset_search WHERE kind != 'mcp_tool'", [])
        .map_err(err("Failed to clear search index"))?;

    {
        let mut insert = tx
            .prepare(
                "INSERT INTO asset_search (kind, ref, path, place, server, name, description, body)
                 VALUES (?1, ?2, ?3, ?4, '', ?5, ?6, ?7)",
            )
            .map_err(err("Failed to prepare search index insert"))?;

        for s in &inventory.skills {
            // `Skill.path` is the skill directory; the body is its SKILL.md.
            // Unreadable reads as empty: the row still hits on name and
            // description, and nothing is invented for the body.
            let body = fs::read_to_string(Path::new(&s.path).join("SKILL.md")).unwrap_or_default();
            insert
                .execute(params!["skill", s.path, s.path, place_of(s.scope.as_ref()), s.name, s.description, body])
                .map_err(err("Failed to index a skill"))?;
        }
        for r in &inventory.rules {
            insert
                .execute(params!["rule", r.path, r.path, place_of(r.scope.as_ref()), r.name, "", r.content])
                .map_err(err("Failed to index a rule"))?;
        }
        for sa in &inventory.subagents {
            let body = fs::read_to_string(&sa.path).unwrap_or_default();
            insert
                .execute(params!["subagent", sa.path, sa.path, place_of(sa.scope.as_ref()), sa.name, sa.description, body])
                .map_err(err("Failed to index a subagent"))?;
        }
        for t in &inventory.tools {
            // `launch_display` is the redacted rendering; `args` carried a
            // bearer token to the screen once and never reaches this table.
            let key = t.registration_key();
            let body = format!("{} {}", t.launch_display, t.transport);
            insert
                .execute(params!["server", key.as_str(), t.config_path, place_of(Some(&t.scope)), t.name, "", body])
                .map_err(err("Failed to index a server"))?;
        }
    }

    // Tools of a registration that the scan no longer finds go with it.
    let live: HashSet<String> = inventory
        .tools
        .iter()
        .map(|t| t.registration_key().as_str().to_string())
        .collect();
    let indexed: Vec<String> = {
        let mut q = tx
            .prepare("SELECT DISTINCT ref FROM asset_search WHERE kind = 'mcp_tool'")
            .map_err(err("Failed to read indexed tool registrations"))?;
        let rows = q
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(err("Failed to read indexed tool registrations"))?;
        rows.flatten().collect()
    };
    for key in indexed.into_iter().filter(|k| !live.contains(k)) {
        tx.execute(
            "DELETE FROM asset_search WHERE kind = 'mcp_tool' AND ref = ?1",
            params![key],
        )
        .map_err(err("Failed to prune stale tool rows"))?;
    }

    tx.commit().map_err(err("Failed to commit search index"))
}

/// Replace the `mcp_tool` rows for one registration with `tools`. Place and
/// config path come from the registration's own `server` row, written by the
/// last scan; a registration the scan has not seen falls back to global.
pub fn index_probe_tools(
    db_path: &Path,
    registration_key: &str,
    server_name: &str,
    config_path: &str,
    tools: &[ProbedTool],
) -> Result<(), SanitisedError> {
    let store = PreferencesStore::new(db_path)?;
    let mut conn = index_connection(&store)?;
    // `Immediate`, not the default `Deferred`: this transaction reads (the
    // SELECT below) before it writes, and SQLite does not run the busy
    // handler for a lock upgrade from a SHARED lock already held within the
    // same transaction — it returns SQLITE_BUSY immediately regardless of
    // `busy_timeout`, only for that in-transaction upgrade. Starting
    // `Immediate` takes the write lock up front, where the busy handler
    // does apply, so the 30 s timeout above actually has effect.
    let tx = conn
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(err("Failed to start search index transaction"))?;

    let (path, place): (String, String) = tx
        .query_row(
            "SELECT path, place FROM asset_search WHERE kind = 'server' AND ref = ?1 LIMIT 1",
            params![registration_key],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap_or_else(|_| (config_path.to_string(), "global".to_string()));

    tx.execute(
        "DELETE FROM asset_search WHERE kind = 'mcp_tool' AND ref = ?1",
        params![registration_key],
    )
    .map_err(err("Failed to clear a registration's tool rows"))?;

    {
        let mut insert = tx
            .prepare(
                "INSERT INTO asset_search (kind, ref, path, place, server, name, description, body)
                 VALUES ('mcp_tool', ?1, ?2, ?3, ?4, ?5, ?6, '')",
            )
            .map_err(err("Failed to prepare search index insert"))?;
        for t in tools {
            insert
                .execute(params![
                    registration_key,
                    path,
                    place,
                    server_name,
                    t.name,
                    t.description.clone().unwrap_or_default()
                ])
                .map_err(err("Failed to index a tool"))?;
        }
    }

    tx.commit().map_err(err("Failed to commit search index"))
}

/// Turn what the user typed into an FTS5 expression, or `None` when nothing
/// searchable survives. Each term is quoted and prefix-matched, so `depl`
/// finds `deploy` and none of FTS5's operators (`NOT`, `(`, `*`, `"`) can
/// reach the parser from the keyboard.
pub fn fts_query(raw: &str) -> Option<String> {
    let terms: Vec<String> = raw
        .split_whitespace()
        .filter_map(|t| {
            let cleaned: String = t
                .chars()
                .filter(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | '.' | '/' | '@'))
                .collect();
            if cleaned.is_empty() {
                None
            } else {
                Some(format!("\"{cleaned}\"*"))
            }
        })
        .collect();
    if terms.is_empty() {
        None
    } else {
        Some(terms.join(" "))
    }
}

pub fn search(db_path: &Path, query: &str, limit: usize) -> Result<SearchResponse, SanitisedError> {
    let Some(fts) = fts_query(query) else {
        return Ok(SearchResponse { hits: vec![], total: 0 });
    };
    let store = PreferencesStore::new(db_path)?;
    let conn = store.connect()?;

    let total: i64 = conn
        .query_row(
            "SELECT count(*) FROM asset_search WHERE asset_search MATCH ?1",
            params![fts],
            |r| r.get(0),
        )
        .map_err(err("Search failed"))?;

    // bm25 weights follow table column order: five UNINDEXED columns carry
    // no terms, then name 8, description 3, body 1. Lower is better, so
    // ORDER BY rank ascending puts the strongest hit first. snippet's column
    // -1 picks whichever column matched best, so a name hit shows the name
    // and a body hit shows the sentence around the term.
    let mut stmt = conn
        .prepare(
            "SELECT kind, ref, path, place, server, name,
                    snippet(asset_search, -1, ?2, ?3, '…', 14),
                    bm25(asset_search, 0, 0, 0, 0, 0, 8.0, 3.0, 1.0) AS rank
             FROM asset_search
             WHERE asset_search MATCH ?1
             ORDER BY rank
             LIMIT ?4",
        )
        .map_err(err("Search failed"))?;
    let rows = stmt
        .query_map(params![fts, MARK_OPEN, MARK_CLOSE, limit as i64], |r| {
            let server: String = r.get(4)?;
            Ok(SearchHit {
                kind: r.get(0)?,
                id: r.get(1)?,
                path: r.get(2)?,
                place: r.get(3)?,
                server: if server.is_empty() { None } else { Some(server) },
                name: r.get(5)?,
                snippet: r.get(6)?,
                rank: r.get(7)?,
            })
        })
        .map_err(err("Search failed"))?;

    Ok(SearchResponse {
        hits: rows.flatten().collect(),
        total: total.max(0) as usize,
    })
}
