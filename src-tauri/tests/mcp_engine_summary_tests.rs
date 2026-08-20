//! `mcp::engine_summary::engine_summary` — Task 15's aggregation, tested as
//! a pure fold: registrations plus an injected probe-cache lookup, no
//! database. Fixture shape borrowed from `mcp_servers_tests.rs`.

use std::collections::{HashMap, HashSet};

use tauri_app_lib::mcp::discover::{DiscoveryResult, Registration};
use tauri_app_lib::mcp::engine_summary::{engine_summary, McpEngineSummaryRow};
use tauri_app_lib::mcp::registry::ScopeTier;
use tauri_app_lib::mcp::dialect::McpServer;

fn v(xs: &[&str]) -> Vec<String> {
    xs.iter().map(|s| s.to_string()).collect()
}

fn stdio_reg(name: &str, host_id: &'static str, command: &str, args: &[&str]) -> Registration {
    Registration {
        server: McpServer {
            name: name.to_string(),
            command: command.to_string(),
            args: v(args),
            transport: "stdio".to_string(),
            env_keys: Vec::new(),
            project_root: None,
            bridged: false,
            url_fingerprint: None,
        },
        host_id,
        tier: ScopeTier::Global,
        config_path: "/test/config.json".to_string(),
    }
}

fn local_reg(name: &str, host_id: &'static str, command: &str, project_root: &str) -> Registration {
    Registration {
        server: McpServer {
            name: name.to_string(),
            command: command.to_string(),
            args: Vec::new(),
            transport: "stdio".to_string(),
            env_keys: Vec::new(),
            project_root: Some(project_root.to_string()),
            bridged: false,
            url_fingerprint: None,
        },
        host_id,
        tier: ScopeTier::Local,
        config_path: "/test/.claude.json".to_string(),
    }
}

fn discovery(regs: Vec<Registration>) -> DiscoveryResult {
    DiscoveryResult {
        registrations: regs,
        problems: Vec::new(),
        checked: Vec::new(),
    }
}

fn detected(ids: &[&str]) -> HashSet<String> {
    ids.iter().map(|s| s.to_string()).collect()
}

/// A probe cache stub keyed the same way the real store is: by
/// `mcp::probe::cache_key`. Built from `(command, args)` pairs for
/// readability, since every fixture here is a plain stdio launch.
fn probes(entries: &[((&str, &[&str]), usize)]) -> HashMap<String, usize> {
    entries
        .iter()
        .map(|((command, args), tools)| {
            let key = tauri_app_lib::mcp::probe::cache_key(
                command,
                &v(args),
                &[],
                None,
                "stdio",
            );
            (key, *tools)
        })
        .collect()
}

fn row_for<'a>(rows: &'a [McpEngineSummaryRow], engine_id: &str) -> &'a McpEngineSummaryRow {
    rows.iter()
        .find(|r| r.engine_id == engine_id)
        .unwrap_or_else(|| panic!("no row for engine {engine_id}"))
}

#[test]
fn one_engine_one_probed_server_reports_its_tool_count() {
    let discovered = discovery(vec![stdio_reg("tauri", "claude-code", "npx", &["tauri-mcp"])]);
    let cache = probes(&[(("npx", &["tauri-mcp"]), 7)]);

    let summary = engine_summary(&discovered, &detected(&["claude-code"]), |k| cache.get(k).copied());

    assert_eq!(summary.rows.len(), 1);
    let row = row_for(&summary.rows, "claude-code");
    assert_eq!(row.engine_name, "Claude Code");
    assert_eq!(row.server_count, 1);
    assert_eq!(row.tools_known, Some(7));
    assert_eq!(summary.probed_launch_count, 1);
    assert_eq!(summary.unprobed_launch_count, 0);
}

#[test]
fn several_engines_each_get_their_own_row() {
    let discovered = discovery(vec![
        stdio_reg("tauri", "claude-code", "npx", &["tauri-mcp"]),
        stdio_reg("spades-audio", "claude-code", "node", &["spades.js"]),
        stdio_reg("notion", "codex", "npx", &["notion-mcp"]),
    ]);
    let cache = probes(&[
        (("npx", &["tauri-mcp"]), 5),
        (("node", &["spades.js"]), 3),
        (("npx", &["notion-mcp"]), 12),
    ]);

    let summary = engine_summary(
        &discovered,
        &detected(&["claude-code", "codex"]),
        |k| cache.get(k).copied(),
    );

    assert_eq!(summary.rows.len(), 2, "one row per engine, not per server");
    let cc = row_for(&summary.rows, "claude-code");
    assert_eq!(cc.server_count, 2);
    assert_eq!(cc.tools_known, Some(8), "sums across this engine's own servers only");
    let codex = row_for(&summary.rows, "codex");
    assert_eq!(codex.server_count, 1);
    assert_eq!(codex.tools_known, Some(12));
}

/// The test the brief calls out by name: an engine whose servers are ALL
/// unprobed must not read as "0 tools". Zero and unknown are different
/// findings, and only the type-level `None` says which one this is.
#[test]
fn an_engine_with_no_probed_servers_reports_unknown_not_zero() {
    let discovered = discovery(vec![
        stdio_reg("tauri", "claude-code", "npx", &["tauri-mcp"]),
        stdio_reg("notion", "claude-code", "npx", &["notion-mcp"]),
    ]);
    // Empty cache: nothing has ever answered.
    let cache: HashMap<String, usize> = HashMap::new();

    let summary = engine_summary(&discovered, &detected(&["claude-code"]), |k| cache.get(k).copied());

    let row = row_for(&summary.rows, "claude-code");
    assert_eq!(row.server_count, 2);
    assert_eq!(row.tools_known, None, "never-probed must not collapse to Some(0)");
    assert_eq!(summary.probed_launch_count, 0);
    assert_eq!(summary.unprobed_launch_count, 2);
}

/// A mix within ONE engine: one of its two servers has answered, the other
/// has not. The row still owes a number (partial, summed over what IS
/// known), and the panel-level note gets the true unaccounted count.
#[test]
fn a_mix_of_probed_and_unprobed_sums_only_the_known_half() {
    let discovered = discovery(vec![
        stdio_reg("tauri", "claude-code", "npx", &["tauri-mcp"]),
        stdio_reg("notion", "claude-code", "npx", &["notion-mcp"]),
    ]);
    let cache = probes(&[(("npx", &["tauri-mcp"]), 9)]);

    let summary = engine_summary(&discovered, &detected(&["claude-code"]), |k| cache.get(k).copied());

    let row = row_for(&summary.rows, "claude-code");
    assert_eq!(
        row.tools_known,
        Some(9),
        "one probed launch answers -- the row is not None just because a sibling is unprobed"
    );
    assert_eq!(summary.probed_launch_count, 1);
    assert_eq!(summary.unprobed_launch_count, 1, "the note's own count of what is unaccounted for");
}

/// Two registrations of the same server, at different tiers of the same
/// host, sharing the identical launch: one server, one launch, asked once.
#[test]
fn a_local_tier_override_of_the_same_launch_is_not_double_counted() {
    let discovered = discovery(vec![
        stdio_reg("notion", "claude-code", "npx", &["notion-mcp"]),
        local_reg("notion", "claude-code", "npx", "/repo/a"),
    ]);
    let cache = probes(&[(("npx", &["notion-mcp"]), 4)]);

    let summary = engine_summary(&discovered, &detected(&["claude-code"]), |k| cache.get(k).copied());

    let row = row_for(&summary.rows, "claude-code");
    assert_eq!(row.server_count, 1, "same name, same launch -- one server");
    assert_eq!(row.tools_known, Some(4), "not 8 -- the shared launch is asked once, not once per registration");
    assert_eq!(summary.probed_launch_count, 1);
}

/// The detected-engine intersection the brief points at directly: a host
/// that registers a server but is NOT one of the machine's detected engines
/// gets no row at all, and its launch does not inflate the note's counts
/// either. Mirrors `mcp::discover::coverage`'s own `detected` parameter.
#[test]
fn an_undetected_host_gets_no_row_and_does_not_count_toward_the_note() {
    let discovered = discovery(vec![
        stdio_reg("tauri", "claude-code", "npx", &["tauri-mcp"]),
        stdio_reg("cursor-only", "cursor", "npx", &["cursor-mcp"]),
    ]);
    let cache: HashMap<String, usize> = HashMap::new();

    // Only claude-code is detected -- cursor is a real HOSTS row but has no
    // directory of its own, so `scanner::get_global_agents` never reports it.
    let summary = engine_summary(&discovered, &detected(&["claude-code"]), |k| cache.get(k).copied());

    assert_eq!(summary.rows.len(), 1);
    assert!(summary.rows.iter().all(|r| r.engine_id != "cursor"));
    assert_eq!(summary.unprobed_launch_count, 1, "claude-code's one unprobed launch only -- cursor's is out of scope entirely");
}

/// A probe that was attempted and failed still answers "0 tools from this
/// launch" -- it is asked, not unknown. The caller maps a `ProbeResult`
/// with `error: Some(_)` to `Some(0)` (its `tools` list is empty on
/// failure), and this fold has no separate notion of "tried and failed".
#[test]
fn a_failed_probe_counts_as_asked_with_zero_known_tools() {
    let discovered = discovery(vec![stdio_reg("flaky", "claude-code", "npx", &["flaky-mcp"])]);
    let cache = probes(&[(("npx", &["flaky-mcp"]), 0)]);

    let summary = engine_summary(&discovered, &detected(&["claude-code"]), |k| cache.get(k).copied());

    let row = row_for(&summary.rows, "claude-code");
    assert_eq!(row.tools_known, Some(0), "asked and failed is a known zero, not an unknown");
    assert_eq!(summary.probed_launch_count, 1);
    assert_eq!(summary.unprobed_launch_count, 0);
}

#[test]
fn no_detected_engines_with_any_registration_yields_no_rows() {
    let discovered = discovery(vec![stdio_reg("tauri", "claude-code", "npx", &["tauri-mcp"])]);
    let cache: HashMap<String, usize> = HashMap::new();

    let summary = engine_summary(&discovered, &detected(&[]), |k| cache.get(k).copied());

    assert!(summary.rows.is_empty());
    assert_eq!(summary.probed_launch_count, 0);
    assert_eq!(summary.unprobed_launch_count, 0);
}
