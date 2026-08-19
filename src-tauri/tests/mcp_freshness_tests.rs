//! One test per rule in `mcp::freshness::verdict`'s decision matrix
//! (`.superpowers/sdd/2026-08-19-mcp-stage-3/task-5-brief.md`), each picked so
//! only that rule decides the outcome — never several rules agreeing on the
//! same answer for different reasons. `DEFAULT_TTL_MS` is hardcoded here
//! rather than imported: a test that imports the constant it is checking can
//! pass without the production value ever being read.

use std::path::PathBuf;
use tauri_app_lib::mcp::freshness::{stat_target, verdict, Freshness};

const DAY_MS: i64 = 24 * 60 * 60 * 1000;
const DEFAULT_TTL_MS: i64 = 7 * DAY_MS;

fn v(xs: &[&str]) -> Vec<String> {
    xs.iter().map(|s| s.to_string()).collect()
}

// --- Rule: default TTL is 7 days when the server sends no ttlMs. ---
// Both mtimes are None throughout this pair, so the TTL is the only thing
// that can decide; a naive "always Fresh" or "always Stale" verdict fails
// exactly one side of this boundary each.

#[test]
fn default_ttl_seven_days_boundary_is_still_fresh() {
    let f = verdict(0, DEFAULT_TTL_MS, None, None, None);
    assert_eq!(f, Freshness::Fresh, "exactly seven days elapsed, no ttlMs sent, should still count as fresh");
}

#[test]
fn default_ttl_seven_days_boundary_plus_one_ms_is_stale() {
    let f = verdict(0, DEFAULT_TTL_MS + 1, None, None, None);
    assert_eq!(f, Freshness::Stale, "one millisecond past the seven-day default, no ttlMs sent, should be stale");
}

// --- Rule: honour a server's own ttlMs when it sends one. ---
// Each case is chosen so the default 7-day TTL would give the OPPOSITE
// answer, so a verdict that silently ignores ttl_ms and falls back to the
// default fails both of these.

#[test]
fn a_short_server_supplied_ttl_expires_sooner_than_the_default_would() {
    // 5 seconds elapsed: comfortably fresh under the 7-day default, but the
    // server asked for a 1-second ttl.
    let f = verdict(0, 5_000, Some(1_000), None, None);
    assert_eq!(f, Freshness::Stale, "server's own 1s ttlMs must be honoured over the 7-day default");
}

#[test]
fn a_long_server_supplied_ttl_stays_fresh_longer_than_the_default_would() {
    // 10 days elapsed: stale under the 7-day default, but the server asked
    // for a 30-day ttl.
    let f = verdict(0, 10 * DAY_MS, Some(30 * DAY_MS), None, None);
    assert_eq!(f, Freshness::Fresh, "server's own 30-day ttlMs must be honoured over the 7-day default");
}

// --- Rule: mtime beats TTL in both directions. ---

#[test]
fn outside_ttl_but_unchanged_mtime_is_fresh() {
    // 30 days elapsed (well past the 7-day default, and no ttlMs override
    // supplied), but the file's mtime has not moved.
    let f = verdict(0, 30 * DAY_MS, None, Some(1_700_000_000_000), Some(1_700_000_000_000));
    assert_eq!(f, Freshness::Fresh, "unchanged mtime means the tool list cannot have changed, even past the TTL");
}

#[test]
fn inside_ttl_but_changed_mtime_is_stale() {
    // 1 hour elapsed (comfortably inside the 7-day default), but the file's
    // mtime moved between the cached probe and now.
    let f = verdict(0, 60 * 60 * 1000, None, Some(1_700_000_000_000), Some(1_700_000_000_001));
    assert_eq!(f, Freshness::Stale, "a changed mtime means stale even inside the TTL");
}

// --- Rule: an unavailable mtime falls back to the TTL alone. ---
// This is what a `stat_target` of `None` degrades to: `current_mtime` is
// `None` because there was nothing to stat, and the TTL decides unopposed.
// Tested from both sides of the TTL boundary so a verdict that treats "no
// current mtime" as an automatic Fresh (or an automatic Stale) fails one of
// these two.

#[test]
fn missing_current_mtime_falls_back_to_ttl_alone_and_is_fresh_inside_it() {
    let f = verdict(0, DAY_MS, None, Some(1_700_000_000_000), None);
    assert_eq!(f, Freshness::Fresh, "no current mtime to compare (stat_target returned None): TTL alone decides, and one day is inside the 7-day default");
}

#[test]
fn missing_current_mtime_falls_back_to_ttl_alone_and_is_stale_outside_it() {
    let f = verdict(0, 8 * DAY_MS, None, Some(1_700_000_000_000), None);
    assert_eq!(f, Freshness::Stale, "no current mtime to compare (stat_target returned None): TTL alone decides, and eight days is outside the 7-day default");
}

#[test]
fn missing_cached_mtime_also_falls_back_to_ttl_alone() {
    // The cached row predates the launch_mtime column (or was probed before
    // this feature existed): only the current side has a stat. Comparison
    // needs both, so this degrades to TTL exactly like the symmetric case
    // above, not to an automatic mismatch.
    let f = verdict(0, DAY_MS, None, None, Some(1_700_000_000_000));
    assert_eq!(f, Freshness::Fresh, "only one side has an mtime to compare: TTL alone decides");
}

// --- stat_target: resolves a direct interpreter+script launch, and is
// honest about npx's unreconstructable install hash. ---

#[test]
fn stat_target_resolves_the_absolute_script_argument() {
    // The real spades-audio declaration in ~/.claude.json: command "node",
    // args carrying the absolute path to the script actually being run.
    let target = stat_target(
        "node",
        &v(&["/Applications/Spades Audio.app/Contents/Resources/mcp-server/dist/index.js"]),
    );
    assert_eq!(
        target,
        Some(PathBuf::from(
            "/Applications/Spades Audio.app/Contents/Resources/mcp-server/dist/index.js"
        ))
    );
}

#[test]
fn stat_target_finds_the_absolute_argument_even_when_it_is_not_first() {
    // Guards against an implementation that only ever looks at args[0]: a
    // flag can precede the actual script path.
    let target = stat_target("node", &v(&["--experimental-modules", "/opt/servers/index.js"]));
    assert_eq!(target, Some(PathBuf::from("/opt/servers/index.js")));
}

#[test]
fn stat_target_resolves_a_bare_absolute_path_executable_with_no_args() {
    // A server launched directly as a compiled binary — no interpreter, no
    // script argument pointing at it, so the command itself is the only
    // thing there is to stat. Round 1 review found this branch
    // (freshness.rs's `if Path::new(command).is_absolute()` fallback)
    // present but unexercised: deleting it and always falling through to
    // `None` still left all 13 tests green. This is the test that closes
    // that gap.
    let target = stat_target("/opt/homebrew/bin/my-server", &[]);
    assert_eq!(target, Some(PathBuf::from("/opt/homebrew/bin/my-server")));
}

#[test]
fn stat_target_is_none_for_an_npx_package_reference() {
    // The real chrome-devtools declaration in ~/.claude.json: command "npx",
    // args carrying only a package spec, never a filesystem path. The
    // resolved install lives under ~/.npm/_npx/<hash>/..., a hash that is
    // npm's own and not ours to reconstruct — returning None here is the
    // honest answer, not a guess.
    let target = stat_target("npx", &v(&["chrome-devtools-mcp@latest"]));
    assert_eq!(target, None);
}

#[test]
fn stat_target_is_none_for_npx_with_a_flag_before_the_package() {
    let target = stat_target("npx", &v(&["-y", "@hypothesi/tauri-mcp-server"]));
    assert_eq!(target, None);
}
