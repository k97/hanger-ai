//! Deciding whether a cached `mcp::probe::ProbeResult` can be trusted without
//! spawning the server again.
//!
//! Probing means starting a real third-party process. Most of the time that
//! is harmless — stdio MCP servers are not shared daemons, each host spawns
//! its own private child, and it is routine to have six or more concurrent
//! copies of the same server running on one machine. But some servers are
//! not safe to double-spawn: `anthropics/claude-code#40220` documents a
//! Telegram MCP whose long-polling allows exactly one connection per bot
//! token, where a second instance steals the connection and kills the first
//! session; `google_workspace_mcp#546` is the same class, two stdio
//! instances fighting over an OAuth callback port. Avoiding an unnecessary
//! spawn is a safety property here, not an optimisation — which is why a
//! `stat` that can answer the question is worth preferring over a handshake
//! that would.
//!
//! Two functions divide the work:
//!
//! - [`stat_target`] decides *which path, if any* is worth stat-ing for a
//!   given launch. It does no filesystem I/O itself — it only picks the path
//!   a caller should hand to `std::fs::metadata`.
//! - [`verdict`] decides *fresh or stale* from the numbers a caller already
//!   has in hand: `cached_at_ms`/`now_ms` (wall-clock milliseconds),
//!   `ttl_ms` (the server's own, if it sent one), and `cached_mtime`/
//!   `current_mtime` (the two sides of a `stat_target` comparison). It reads
//!   no clock and touches no filesystem — `now_ms` and both mtimes are
//!   parameters, never `SystemTime::now()` or `std::fs::metadata` called
//!   internally. That is deliberate: it is what lets the whole decision
//!   matrix be tested without sleeping, and it is what keeps the "did we
//!   need to spawn" decision reproducible from a single set of numbers.
//!
//! The caller (Task 4's cache, `preferences::CachedProbe`) hands `verdict`
//! exactly the fields it persisted: `verified_at` as `cached_at_ms`, `ttl_ms`
//! as-is, and `launch_mtime` as `cached_mtime`. `current_mtime` comes from
//! stat-ing whatever `stat_target` returned for the launch being checked
//! right now, or `None` if `stat_target` returned `None`.
//!
//! Policy ruled by Karthik 2026-08-19:
//!
//! - Default TTL is **7 days** when the server sends no `ttlMs`. No server on
//!   this machine sends one today — `ttlMs` arrived in the MCP 2026-07-28
//!   revision (SEP-2549) and everything here still speaks 2025-06-18 or
//!   earlier — which makes the default path the only one that runs in
//!   practice, and the one to get right.
//! - Honour a server's own `ttlMs` when it sends one.
//! - **mtime beats TTL in both directions.** An unchanged mtime means fresh
//!   even past the TTL, because the tool list cannot have changed if the
//!   file did not. A changed mtime means stale even inside the TTL. This
//!   only applies when both sides of the comparison are known; if either
//!   mtime is unavailable, the TTL decides alone (see `stat_target`'s `None`
//!   case below).

use std::path::{Path, PathBuf};

/// Default cache lifetime when a server sends no `ttlMs`: seven days, in
/// milliseconds.
const DEFAULT_TTL_MS: i64 = 7 * 24 * 60 * 60 * 1000;

/// Whether a cached probe result should be trusted as-is (`Fresh`) or
/// re-probed by spawning the server again (`Stale`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Freshness {
    Fresh,
    Stale,
}

/// Picks the filesystem path, if any, worth stat-ing to corroborate a cached
/// probe for this launch. Does no I/O itself — it only decides which path a
/// caller should hand to `std::fs::metadata`.
///
/// The first argument that is an absolute path is the target: for a direct
/// interpreter launch (`node /Applications/Spades
/// Audio.app/.../index.js`), that is the script actually being run, not the
/// interpreter — `node`'s own mtime says nothing about whether the server's
/// tool list changed. Scanning every argument (not just the first) matters
/// because a flag can precede the script path
/// (`node --experimental-modules /opt/servers/index.js`).
///
/// Falls back to `command` itself when *it* is an absolute path (a server
/// launched as a bare executable, no interpreter and no argument pointing at
/// it).
///
/// Returns `None` when nothing in the launch is an absolute path — the
/// `npx pkg@latest` shape. The resolved package for an `npx` launch lives
/// under `~/.npm/_npx/<hash>/node_modules/<pkg>/`, and that hash is npm's
/// own, not ours to reconstruct. Guessing would produce a confident stat of
/// the wrong file, which is worse than no stat at all — so this returns
/// `None` and lets `verdict`'s TTL-alone fallback carry the decision.
pub fn stat_target(command: &str, args: &[String]) -> Option<PathBuf> {
    if let Some(path) = args.iter().find(|a| Path::new(a).is_absolute()) {
        return Some(PathBuf::from(path));
    }
    if Path::new(command).is_absolute() {
        return Some(PathBuf::from(command));
    }
    None
}

/// Decides `Fresh` or `Stale` for a cached probe. Pure: `now_ms` and both
/// mtimes are parameters, not read from a clock or the filesystem, so the
/// whole matrix is testable without sleeping.
///
/// - `cached_at_ms` / `now_ms`: wall-clock milliseconds the probe was cached
///   at, and now. (`preferences::CachedProbe::verified_at` supplies the
///   former.)
/// - `ttl_ms`: the server's own TTL if it sent one
///   (`CachedProbe::ttl_ms`); `None` falls back to [`DEFAULT_TTL_MS`].
/// - `cached_mtime` / `current_mtime`: the stat target's mtime at cache time
///   (`CachedProbe::launch_mtime`) and now. Either side can be `None` — an
///   old cache row predating this feature, or a `stat_target` that returned
///   `None` for this launch — in which case mtime cannot be compared at all
///   and the TTL decides alone.
///
/// mtime, when both sides are known, overrides the TTL outcome in both
/// directions: unchanged beats an expired TTL (`Fresh`), changed beats a
/// live one (`Stale`).
pub fn verdict(
    cached_at_ms: i64,
    now_ms: i64,
    ttl_ms: Option<i64>,
    cached_mtime: Option<i64>,
    current_mtime: Option<i64>,
) -> Freshness {
    if let (Some(cached), Some(current)) = (cached_mtime, current_mtime) {
        return if cached == current {
            Freshness::Fresh
        } else {
            Freshness::Stale
        };
    }

    let ttl = ttl_ms.unwrap_or(DEFAULT_TTL_MS);
    let elapsed = now_ms.saturating_sub(cached_at_ms);
    if elapsed <= ttl {
        Freshness::Fresh
    } else {
        Freshness::Stale
    }
}
