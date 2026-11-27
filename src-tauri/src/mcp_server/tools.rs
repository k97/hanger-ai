//! The server's five read tools, as plain functions over `ServerPlaces`.
//!
//! Each returns data and a code, never prose: the strings an engine sees are
//! the handler's (plan, Gate G1). Every tool opens the store read-only and
//! checks `last_scan_ms` before anything else, so nothing is read before a
//! scan has finished; every query runs under `with_read_deadline`. What
//! leaves: names (through `public_name`), kinds, states, counts, Hanger's own
//! reasons, and paths through `sanitise_path`. Never a launch command, an
//! argument, an env name or value, file text, or a parser's message.

use std::collections::HashMap;

use rusqlite::Connection;
use serde::Serialize;

use crate::annotations::asset_annotations_on;
use crate::domain::AssetCounts;
use crate::mcp::switch::context::{EngineContext, Measured};
use crate::mcp::switch::ops::{cached_measure_on, context_for, contexts_for};
use crate::mcp_server::places::ServerPlaces;
use crate::preferences::sanitise_path;
use crate::scanner::{count_assets_on, get_global_agents, Grouping};
use crate::search::search_on;
use crate::store_read::{last_scan_ms, open_read_only, with_read_deadline, StoreUnavailable, READ_DEADLINE};

/// Why a tool did not answer. A code and nothing else.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Refusal {
    NotScannedYet,
    OtherVersion,
    Busy,
    Unreadable,
    NotFound,
    BadArgument,
    SlowDown,
}

impl Refusal {
    pub fn code(self) -> &'static str {
        match self {
            Self::NotScannedYet => "not_scanned_yet",
            Self::OtherVersion => "other_version",
            Self::Busy => "busy",
            Self::Unreadable => "unreadable",
            Self::NotFound => "not_found",
            Self::BadArgument => "bad_argument",
            Self::SlowDown => "slow_down",
        }
    }
}

impl From<StoreUnavailable> for Refusal {
    fn from(e: StoreUnavailable) -> Self {
        match e {
            StoreUnavailable::NotScannedYet => Self::NotScannedYet,
            StoreUnavailable::OtherVersion => Self::OtherVersion,
            StoreUnavailable::Busy => Self::Busy,
            StoreUnavailable::Unreadable => Self::Unreadable,
        }
    }
}

/// A reply and when the scan it reflects finished.
#[derive(Debug, Clone, Serialize)]
pub struct Fresh<T> {
    pub as_of_ms: i64,
    pub result: T,
}

const NAME_CAP: usize = 128;

/// A name fit to leave the process: each control character (newlines
/// included) becomes one space, and anything over 128 characters is cut to
/// 127 and `…`. Names are frontmatter or config text, so untrusted.
pub fn public_name(name: &str) -> String {
    let flat: String = name.chars().map(|c| if c.is_control() { ' ' } else { c }).collect();
    if flat.chars().count() <= NAME_CAP {
        return flat;
    }
    let mut cut: String = flat.chars().take(NAME_CAP - 1).collect();
    cut.push('…');
    cut
}

/// `sanitise_path` for anything that is a path; a value that is not one
/// (`"global"`, a `stash:` key) is left as it is.
fn public_path(value: &str) -> String {
    if value.starts_with('/') {
        sanitise_path(value)
    } else {
        value.to_string()
    }
}

/// The store, open read-only, and when its last scan finished.
fn scanned(p: &ServerPlaces) -> Result<(Connection, i64), Refusal> {
    let conn = open_read_only(&p.db_path)?;
    let as_of_ms = with_read_deadline(&conn, READ_DEADLINE, last_scan_ms)?.ok_or(Refusal::NotScannedYet)?;
    Ok((conn, as_of_ms))
}

/// One read under the deadline. The readers' own error text is dropped.
fn read<T, E>(conn: &Connection, f: impl FnOnce(&Connection) -> Result<T, E>) -> Result<T, Refusal> {
    Ok(with_read_deadline(conn, READ_DEADLINE, |c| f(c).map_err(|_| StoreUnavailable::Unreadable))?)
}

/// The probe cache, one launch at a time, each lookup under the deadline.
fn measure(conn: &Connection) -> impl FnMut(&str) -> Option<Measured> + '_ {
    move |key| read(conn, |c| Ok::<_, ()>(cached_measure_on(c, key))).ok().flatten()
}

#[derive(Debug, Clone, Serialize)]
pub struct DetectedEngine {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct McpSummary {
    pub engine_id: String,
    pub engine_name: String,
    pub on_count: usize,
    pub off_count: usize,
    pub measured_on_count: usize,
    pub on_tokens_measured: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Engines {
    /// The engines found on this machine (`scanner::get_global_agents`).
    pub detected: Vec<DetectedEngine>,
    /// Each engine that declares MCP servers. Its own id space, not joined
    /// to `detected`.
    pub mcp: Vec<McpSummary>,
    /// The store's counts, per registration.
    pub totals: AssetCounts,
}

pub fn list_engines(p: &ServerPlaces) -> Result<Fresh<Engines>, Refusal> {
    let (conn, as_of_ms) = scanned(p)?;
    let totals = read(&conn, |c| count_assets_on(c, None, Grouping::PerRegistration))?;
    let detected = get_global_agents()
        .into_iter()
        .map(|a| DetectedEngine { id: a.id, name: public_name(&a.name) })
        .collect();
    let mcp = contexts_for(&p.switch, measure(&conn))
        .into_iter()
        .map(|c| McpSummary {
            engine_id: c.engine_id,
            engine_name: public_name(&c.engine_name),
            on_count: c.on_count,
            off_count: c.off_count,
            measured_on_count: c.measured_on_count,
            on_tokens_measured: c.on_tokens_measured,
        })
        .collect();
    Ok(Fresh { as_of_ms, result: Engines { detected, mcp, totals } })
}

pub fn engine_context(p: &ServerPlaces, engine_id: &str) -> Result<Fresh<EngineContext>, Refusal> {
    let (conn, as_of_ms) = scanned(p)?;
    let mut context = context_for(&p.switch, engine_id, measure(&conn));
    if context.items.is_empty() {
        return Err(Refusal::NotFound);
    }
    context.engine_name = public_name(&context.engine_name);
    for item in &mut context.items {
        item.key = public_path(&item.key);
        item.config_path = public_path(&item.config_path);
        item.name = public_name(&item.name);
    }
    Ok(Fresh { as_of_ms, result: context })
}

#[derive(Debug, Clone, Serialize)]
pub struct FoundAsset {
    pub kind: String,
    pub id: String,
    pub path: String,
    pub name: String,
    pub server: Option<String>,
    pub place: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct FoundAssets {
    pub assets: Vec<FoundAsset>,
    pub total: usize,
}

pub fn find_assets(p: &ServerPlaces, query: &str, limit: usize) -> Result<Fresh<FoundAssets>, Refusal> {
    let (conn, as_of_ms) = scanned(p)?;
    if !(1..=50).contains(&limit) {
        return Err(Refusal::BadArgument);
    }
    let found = read(&conn, |c| search_on(c, query, limit))?;
    let assets = found
        .hits
        .into_iter()
        .map(|h| FoundAsset {
            kind: h.kind,
            id: public_path(&h.id),
            path: public_path(&h.path),
            name: public_name(&h.name),
            server: h.server.as_deref().map(public_name),
            place: public_path(&h.place),
        })
        .collect();
    Ok(Fresh { as_of_ms, result: FoundAssets { assets, total: found.total } })
}

#[derive(Debug, Clone, Serialize)]
pub struct ReachEngine {
    pub engine_key: String,
    pub engine_name: String,
    pub reached: bool,
    pub reason: Option<String>,
    pub via_root: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Beyond {
    pub kind: String,
    pub count: i64,
    pub using_count: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Reach {
    pub asset_path: String,
    pub mechanism: String,
    pub engines: Vec<ReachEngine>,
    pub beyond: Option<Beyond>,
}

pub fn reach(p: &ServerPlaces, asset_path: &str) -> Result<Fresh<Reach>, Refusal> {
    let (conn, as_of_ms) = scanned(p)?;
    let wanted = public_path(asset_path);
    let annotations = read(&conn, asset_annotations_on)?;
    // Matched on the full sanitised path only when it kept its folders: a
    // path outside the home sanitises to its basename, which many share.
    let found = annotations
        .into_iter()
        .find(|a| {
            let public = public_path(&a.asset_path);
            a.asset_path == asset_path || (public.starts_with("~/") && public == wanted)
        })
        .ok_or(Refusal::NotFound)?;
    Ok(Fresh {
        as_of_ms,
        result: Reach {
            asset_path: public_path(&found.asset_path),
            mechanism: found.mechanism,
            engines: found
                .reach
                .into_iter()
                .map(|e| ReachEngine {
                    engine_key: e.engine_key,
                    engine_name: public_name(&e.engine_name),
                    reached: e.reached,
                    reason: e.reason,
                    via_root: e.via_root.as_deref().map(public_path),
                })
                .collect(),
            beyond: found.beyond.map(|b| Beyond { kind: b.kind, count: b.count, using_count: b.using_count }),
        },
    })
}

#[derive(Debug, Clone, Serialize)]
pub struct Finding {
    pub category: String,
    pub name: String,
    pub path: String,
}

/// The field names carry each list's scope (plan, Decision 7).
#[derive(Debug, Clone, Serialize)]
pub struct Findings {
    pub broken_global: Vec<Finding>,
    pub drifted_global: Vec<Finding>,
    pub unparsed: Vec<Finding>,
    pub broken_global_count: usize,
    pub drifted_global_count: usize,
    pub unparsed_count: usize,
}

fn rows(conn: &Connection, sql: &str) -> rusqlite::Result<Vec<(String, String, String)>> {
    let mut stmt = conn.prepare(sql)?;
    let out = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?.collect();
    out
}

pub fn findings(p: &ServerPlaces) -> Result<Fresh<Findings>, Refusal> {
    let (conn, as_of_ms) = scanned(p)?;
    let finding = |(category, name, path): (String, String, String)| Finding {
        category,
        name: public_name(&name),
        path: public_path(&path),
    };
    let unparsed: Vec<Finding> = read(&conn, |c| {
        rows(c, "SELECT category, name, abs_path FROM assets WHERE parse_status = 'failed' AND category != 'agent' ORDER BY abs_path")
    })?
    .into_iter()
    .map(finding)
    .collect();
    let named: HashMap<String, (String, String)> = read(&conn, |c| rows(c, "SELECT category, name, abs_path FROM assets"))?
        .into_iter()
        .map(|(category, name, path)| (path, (category, name)))
        .collect();
    let annotations = read(&conn, asset_annotations_on)?;
    let of_mechanism = |word: &str| -> Vec<Finding> {
        annotations
            .iter()
            .filter(|a| a.mechanism == word)
            .map(|a| {
                let (category, name) = named.get(&a.asset_path).cloned().unwrap_or_default();
                finding((category, name, a.asset_path.clone()))
            })
            .collect()
    };
    let broken_global = of_mechanism("broken");
    let drifted_global = of_mechanism("drift");
    Ok(Fresh {
        as_of_ms,
        result: Findings {
            broken_global_count: broken_global.len(),
            drifted_global_count: drifted_global.len(),
            unparsed_count: unparsed.len(),
            broken_global,
            drifted_global,
            unparsed,
        },
    })
}
