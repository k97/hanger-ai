//! `mcp::engine_summary::engine_summary` — Task 15's aggregation, tested as
//! a pure fold: registrations plus an injected probe-cache lookup, no
//! database. Fixture shape borrowed from `mcp_servers_tests.rs`.
//!
//! Fix round 1 (2026-08-20) rewrote this file alongside the module: the
//! population is now every recognised host, not only detected engines
//! (`an_unrecognised_host_id_gets_no_row` replaces the old detected-engine
//! exclusion test), and the note counts SERVERS across three buckets
//! (answered / unasked / unaskable) instead of launches. Two tests here
//! (`*_is_not_double_counted`, `*_counts_once_per_engine`) are the
//! reviewer's planted mutation-catching cases for fix round 1's item 4 —
//! each was proven to fail against a deliberately reintroduced bug before
//! this file was committed; see the task report for the RED transcripts.

use std::collections::HashMap;

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

/// A second registration of the SAME server, at a different config path but
/// an otherwise byte-identical declaration — the shape `cache_key` collapses
/// to one launch. `stdio_reg` plus a distinct `config_path` was not enough
/// on its own in round 0's fixture; this constructor makes "identical
/// launch, different registration" the thing under test rather than an
/// accident of which fields happened to match.
fn duplicate_stdio_reg(name: &str, host_id: &'static str, command: &str, args: &[&str]) -> Registration {
    Registration {
        config_path: "/test/other-config.json".to_string(),
        ..stdio_reg(name, host_id, command, args)
    }
}

/// A Claude.ai-shaped connector: empty command, transport literally
/// `"claude.ai"` — `dialect::parse_claude_ai_connectors`'s own output shape.
/// Every connector registration on a machine collapses to one `cache_key`
/// regardless of name (`engine_summary`'s own doc comment), which is why
/// this fixture exists: it is the forcing case for the "unaskable" bucket.
fn connector_reg(name: &str, host_id: &'static str) -> Registration {
    Registration {
        server: McpServer {
            name: name.to_string(),
            command: String::new(),
            args: Vec::new(),
            transport: "claude.ai".to_string(),
            env_keys: Vec::new(),
            project_root: None,
            bridged: false,
            url_fingerprint: None,
        },
        host_id,
        tier: ScopeTier::Global,
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

    let summary = engine_summary(&discovered, |k| cache.get(k).copied());

    assert_eq!(summary.rows.len(), 1);
    let row = row_for(&summary.rows, "claude-code");
    assert_eq!(row.engine_name, "Claude Code");
    assert_eq!(row.server_count, 1);
    assert_eq!(row.tools_known, Some(7));
    assert_eq!(summary.answered_server_count, 1);
    assert_eq!(summary.unasked_server_count, 0);
    assert_eq!(summary.unaskable_server_count, 0);
    assert_eq!(summary.total_server_count, 1);
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

    let summary = engine_summary(&discovered, |k| cache.get(k).copied());

    assert_eq!(summary.rows.len(), 2, "one row per engine, not per server");
    let cc = row_for(&summary.rows, "claude-code");
    assert_eq!(cc.server_count, 2);
    assert_eq!(cc.tools_known, Some(8), "sums across this engine's own servers only");
    let codex = row_for(&summary.rows, "codex");
    assert_eq!(codex.server_count, 1);
    assert_eq!(codex.tools_known, Some(12));
    assert_eq!(summary.total_server_count, 3);
    assert_eq!(summary.answered_server_count, 3);
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

    let summary = engine_summary(&discovered, |k| cache.get(k).copied());

    let row = row_for(&summary.rows, "claude-code");
    assert_eq!(row.server_count, 2);
    assert_eq!(row.tools_known, None, "never-probed must not collapse to Some(0)");
    assert_eq!(summary.answered_server_count, 0);
    assert_eq!(summary.unasked_server_count, 2);
    assert_eq!(summary.unaskable_server_count, 0);
}

/// A mix within ONE engine: one of its two servers has answered, the other
/// has not. The row still owes a number (partial, summed over what IS
/// known), and the panel-level counts split the same way, in SERVERS —
/// the same unit `server_count` uses, not launches.
#[test]
fn a_mix_of_answered_and_unasked_sums_only_the_known_half() {
    let discovered = discovery(vec![
        stdio_reg("tauri", "claude-code", "npx", &["tauri-mcp"]),
        stdio_reg("notion", "claude-code", "npx", &["notion-mcp"]),
    ]);
    let cache = probes(&[(("npx", &["tauri-mcp"]), 9)]);

    let summary = engine_summary(&discovered, |k| cache.get(k).copied());

    let row = row_for(&summary.rows, "claude-code");
    assert_eq!(
        row.tools_known,
        Some(9),
        "one answered launch is enough -- the row is not None just because a sibling is unasked"
    );
    assert_eq!(summary.answered_server_count, 1);
    assert_eq!(summary.unasked_server_count, 1);
    assert_eq!(summary.total_server_count, 2);
}

/// Fix round 1, item 4(a) — the reviewer's planted case: round 0's own test
/// under this name did not actually share a launch (its `local_reg` differed
/// in `args` AND `project_root`, so the two registrations hashed to
/// different `cache_key`s and the dedup guard was never exercised). This is
/// the real shape: the SAME server, declared twice by the SAME host, with a
/// BYTE-IDENTICAL launch — `spades-audio` registered twice by `claude-code`
/// is the live instance the reviewer found. Without the `own_launches`
/// guard in `engine_summary`, `tools_sum` adds this launch's answer once per
/// registration and the row reports double the real count.
#[test]
fn an_identical_launch_registered_twice_by_one_host_is_not_double_counted() {
    let discovered = discovery(vec![
        stdio_reg("spades-audio", "claude-code", "node", &["spades.js"]),
        duplicate_stdio_reg("spades-audio", "claude-code", "node", &["spades.js"]),
    ]);
    let cache = probes(&[(("node", &["spades.js"]), 4)]);

    let summary = engine_summary(&discovered, |k| cache.get(k).copied());

    let row = row_for(&summary.rows, "claude-code");
    assert_eq!(row.server_count, 1, "same name -- one server, whatever the registration count");
    assert_eq!(row.tools_known, Some(4), "not 8 -- the shared launch is asked once, not once per registration");
    // The bucket count is also ONE server, not two registrations.
    assert_eq!(summary.answered_server_count, 1);
    assert_eq!(summary.total_server_count, 1);
}

/// Fix round 1, item 4(b) — the reviewer's other planted case: a launch
/// shared by several engines must count in EACH of their rows AND in the
/// note's bucket totals once per engine, never deduplicated globally by
/// `cache_key`. `tauri` sharing one launch across four engines is the live
/// shape. A "helpful" global dedup here is exactly the regression this test
/// exists to catch — it would make the note under-report how many
/// registrations are actually carrying this cost.
#[test]
fn a_launch_shared_by_several_engines_counts_once_per_engine() {
    let discovered = discovery(vec![
        stdio_reg("tauri", "claude-code", "npx", &["tauri-mcp"]),
        stdio_reg("tauri", "codex", "npx", &["tauri-mcp"]),
        stdio_reg("tauri", "gemini", "npx", &["tauri-mcp"]),
        stdio_reg("tauri", "cursor", "npx", &["tauri-mcp"]),
    ]);
    let cache = probes(&[(("npx", &["tauri-mcp"]), 6)]);

    let summary = engine_summary(&discovered, |k| cache.get(k).copied());

    assert_eq!(summary.rows.len(), 4, "cursor is not a detected engine but IS a recognised host");
    for engine_id in ["claude-code", "codex", "gemini", "cursor"] {
        let row = row_for(&summary.rows, engine_id);
        assert_eq!(row.tools_known, Some(6), "each engine's own row states the tool count it carries");
    }
    assert_eq!(
        summary.answered_server_count, 4,
        "one server registered by four engines is four registrations' worth of running cost, not one"
    );
    assert_eq!(summary.total_server_count, 4);
}

/// Fix round 1, item 1 — a host with no directory of its own (never in
/// `scanner::get_global_agents()`) still gets a row: the population is
/// every recognised `HOSTS` entry, not the detected-engine set. Cursor,
/// Claude Desktop and Claude.ai are all `HostKind::McpHost` with no
/// `AGENT_CONFIGS` row, and all three must appear the moment they register
/// something.
#[test]
fn a_non_engine_mcp_host_still_gets_a_row() {
    let discovered = discovery(vec![
        stdio_reg("cursor-only", "cursor", "npx", &["cursor-mcp"]),
        stdio_reg("desktop-only", "claude-desktop", "node", &["desktop.js"]),
    ]);
    let cache: HashMap<String, usize> = HashMap::new();

    let summary = engine_summary(&discovered, |k| cache.get(k).copied());

    assert_eq!(summary.rows.len(), 2);
    assert!(row_for(&summary.rows, "cursor").server_count == 1);
    assert!(row_for(&summary.rows, "claude-desktop").server_count == 1);
}

/// The only exclusion left after fix round 1: a host id the registry does
/// not recognise at all. Nothing in `discover_machine`'s real output takes
/// this path — every id it produces is already a `HOSTS` row — so this
/// fixture is synthetic, pinning the rule rather than a real machine shape.
#[test]
fn an_unrecognised_host_id_gets_no_row() {
    let discovered = discovery(vec![
        stdio_reg("tauri", "claude-code", "npx", &["tauri-mcp"]),
        stdio_reg("phantom", "not-a-real-host", "npx", &["phantom-mcp"]),
    ]);
    let cache: HashMap<String, usize> = HashMap::new();

    let summary = engine_summary(&discovered, |k| cache.get(k).copied());

    assert_eq!(summary.rows.len(), 1);
    assert!(summary.rows.iter().all(|r| r.engine_id != "not-a-real-host"));
    assert_eq!(summary.total_server_count, 1, "the phantom host's server does not inflate the note either");
}

/// A Claude.ai connector is never askable, and must not sit in "unasked"
/// forever as if a Verify button could someday answer it. It gets its own
/// bucket, unconditionally — even mixed alongside a genuinely askable
/// server on the same host.
#[test]
fn a_connector_is_unaskable_not_merely_unasked() {
    let discovered = discovery(vec![
        connector_reg("notion", "claude-ai"),
        connector_reg("linear", "claude-ai"),
    ]);
    let cache: HashMap<String, usize> = HashMap::new();

    let summary = engine_summary(&discovered, |k| cache.get(k).copied());

    let row = row_for(&summary.rows, "claude-ai");
    assert_eq!(row.server_count, 2);
    assert_eq!(row.tools_known, None);
    assert_eq!(summary.unaskable_server_count, 2, "both connectors, never askable");
    assert_eq!(summary.unasked_server_count, 0, "not 'unasked' -- there is no action that changes this");
    assert_eq!(summary.answered_server_count, 0);
}

/// Every connector on a machine collapses to ONE `cache_key` (empty command,
/// transport `"claude.ai"`) regardless of server name -- so even if a stray
/// cache row existed for it, a connector's bucket must not depend on that.
/// The `askable` check comes first and wins unconditionally.
#[test]
fn a_connector_stays_unaskable_even_if_something_is_cached_under_its_shared_key() {
    let discovered = discovery(vec![connector_reg("notion", "claude-ai")]);
    let key = tauri_app_lib::mcp::probe::cache_key("", &[], &[], None, "claude.ai");
    let mut cache: HashMap<String, usize> = HashMap::new();
    cache.insert(key, 99);

    let summary = engine_summary(&discovered, |k| cache.get(k).copied());

    assert_eq!(summary.unaskable_server_count, 1);
    assert_eq!(summary.answered_server_count, 0);
    let row = row_for(&summary.rows, "claude-ai");
    assert_eq!(row.tools_known, None, "an unaskable row never reports a tool count, cached or not");
}

/// A probe that was attempted and failed still answers "0 tools from this
/// launch" — it is asked, not unknown. The caller maps a `ProbeResult`
/// with `error: Some(_)` to `Some(0)` (its `tools` list is empty on
/// failure), and this fold has no separate notion of "tried and failed".
#[test]
fn a_failed_probe_counts_as_answered_with_zero_known_tools() {
    let discovered = discovery(vec![stdio_reg("flaky", "claude-code", "npx", &["flaky-mcp"])]);
    let cache = probes(&[(("npx", &["flaky-mcp"]), 0)]);

    let summary = engine_summary(&discovered, |k| cache.get(k).copied());

    let row = row_for(&summary.rows, "claude-code");
    assert_eq!(row.tools_known, Some(0), "asked and failed is a known zero, not an unknown");
    assert_eq!(summary.answered_server_count, 1);
    assert_eq!(summary.unasked_server_count, 0);
}

/// The 14-vs-11 contradiction fix round 1 exists to close: the note's own
/// three buckets must always sum to the rows' own total, by construction,
/// across a machine with a genuine mix of every shape (answered, unasked,
/// unaskable, shared across engines).
#[test]
fn the_note_always_reconciles_with_the_rows() {
    let discovered = discovery(vec![
        stdio_reg("tauri", "claude-code", "npx", &["tauri-mcp"]),
        stdio_reg("tauri", "codex", "npx", &["tauri-mcp"]),
        stdio_reg("notion", "claude-code", "npx", &["notion-mcp"]),
        connector_reg("linear", "claude-ai"),
    ]);
    let cache = probes(&[(("npx", &["tauri-mcp"]), 3)]);

    let summary = engine_summary(&discovered, |k| cache.get(k).copied());

    let row_sum: usize = summary.rows.iter().map(|r| r.server_count).sum();
    assert_eq!(summary.total_server_count, row_sum, "note total must equal the rows' own sum, always");
    assert_eq!(
        summary.total_server_count,
        summary.answered_server_count + summary.unasked_server_count + summary.unaskable_server_count,
        "the backend hands over the total -- it is not left for a caller to add the three up"
    );
}

#[test]
fn no_registrations_at_all_yields_an_empty_summary() {
    let discovered = discovery(vec![]);
    let cache: HashMap<String, usize> = HashMap::new();

    let summary = engine_summary(&discovered, |k| cache.get(k).copied());

    assert!(summary.rows.is_empty());
    assert_eq!(summary.total_server_count, 0);
}

#[test]
fn counts_servers_whose_launches_disagree_and_not_duplicates() {
    // tauri: two hosts, two different launches — Conflicting.
    // spades: one host, the same launch twice — Duplicate, which is agreement.
    // solo: one registration — nothing to disagree with.
    let discovered = discovery(vec![
        stdio_reg("tauri", "claude-code", "npx", &["tauri-mcp@2.9.1"]),
        stdio_reg("tauri", "codex", "npx", &["tauri-mcp@latest"]),
        stdio_reg("spades", "claude-code", "node", &["spades.js"]),
        duplicate_stdio_reg("spades", "claude-code", "node", &["spades.js"]),
        stdio_reg("solo", "gemini", "npx", &["solo"]),
    ]);
    let summary = engine_summary(&discovered, |_| None);
    assert_eq!(summary.conflicting_server_count, 1, "tauri disagrees; spades merely repeats; solo stands alone");
}

#[test]
fn an_agreeing_machine_has_no_conflicting_servers() {
    let discovered = discovery(vec![
        stdio_reg("tauri", "claude-code", "npx", &["tauri-mcp@2.9.1"]),
        stdio_reg("tauri", "codex", "npx", &["tauri-mcp@2.9.1"]),
    ]);
    assert_eq!(engine_summary(&discovered, |_| None).conflicting_server_count, 0);
}

#[test]
fn host_count_is_the_number_of_rows() {
    let d = discovery(vec![
        stdio_reg("a", "claude-code", "npx", &["a"]),
        stdio_reg("b", "codex", "npx", &["b"]),
        stdio_reg("c", "codex", "npx", &["c"]),
    ]);
    let s = engine_summary(&d, |_| None);
    assert_eq!(s.rows.len(), 2);
    assert_eq!(s.host_count, 2);
}

#[test]
fn tools_known_total_sums_the_rows_that_have_an_answer() {
    // Claude Code: two probed launches, 3 + 4. Codex: one unprobed launch.
    // The total is 7, not 0-for-Codex folded in and not None.
    let d = discovery(vec![
        stdio_reg("a", "claude-code", "npx", &["a"]),
        stdio_reg("b", "claude-code", "npx", &["b"]),
        stdio_reg("c", "codex", "npx", &["c"]),
    ]);
    let cache = probes(&[(("npx", &["a"]), 3), (("npx", &["b"]), 4)]);
    let s = engine_summary(&d, |k| cache.get(k).copied());
    assert_eq!(s.tools_known_total, Some(7));
}

#[test]
fn tools_known_total_is_none_when_nothing_has_been_asked() {
    let d = discovery(vec![stdio_reg("a", "claude-code", "npx", &["a"])]);
    let s = engine_summary(&d, |_| None);
    assert_eq!(s.tools_known_total, None);
}

#[test]
fn a_launch_two_hosts_share_counts_once_per_host_in_the_total() {
    // The per-row rule (`a_launch_shared_by_several_engines_counts_once_per_engine`)
    // summed: 5 for Claude Code plus 5 for Codex is 10.
    let d = discovery(vec![
        stdio_reg("shared", "claude-code", "npx", &["s"]),
        stdio_reg("shared", "codex", "npx", &["s"]),
    ]);
    let cache = probes(&[(("npx", &["s"]), 5)]);
    let s = engine_summary(&d, |k| cache.get(k).copied());
    assert_eq!(s.tools_known_total, Some(10));
}
