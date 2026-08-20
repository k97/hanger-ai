//! Fold registrations and the probe cache into the empty inspector's
//! per-engine summary — `McpEngineSummary`, the empty-selection body Task 15
//! renders when the Tools filter is active and nothing is selected.
//!
//! `McpServerRow` (`servers.rs`) answers "what does this one server look
//! like, across every host that declares it". This module answers the
//! opposite question: "what does this one engine carry, across every server
//! it registers". Same registrations, folded the other way.
//!
//! **Rows are scoped to detected engines, not every MCP host.** `detected`
//! is `scanner::get_global_agents()`'s own id set — the same population
//! `mcp::discover::coverage` intersects `checked` against, and for the same
//! reason its doc comment gives: a `HostKind::Agent` filter undercounts,
//! because Zed is one of `AGENT_CONFIGS`'s eleven engines yet the registry
//! marks its `HOSTS` row `HostKind::McpHost`. An MCP-only host with no
//! directory of its own — Cursor, VS Code, Claude Desktop, Devin Desktop,
//! Claude.ai — never gets a row here, the same as it never gets a row in
//! Appendix A.1/A.2's "engine" language. A server registered ONLY by such a
//! host is a real gap this view does not surface; see the module's own
//! caller for the tradeoff.
//!
//! **The tool count is honest by construction.** Task 6 (`cached_probe`)
//! only ever answers from the probe cache or a fresh handshake started by
//! opening a server's own panel — this summary triggers no probe of its
//! own. So most launches on a real machine have no cached answer at all,
//! and the constraint that shapes this whole module is: a launch nobody has
//! asked contributes UNKNOWN tools to its row, never zero. `tools_known`
//! is `None` exactly when no launch this engine registers has ever been
//! probed; it is `Some(n)` — where `n` can itself be zero, when every probed
//! launch answered with zero tools or an error — the moment even one has.
//! Those are different findings and the type keeps them apart the way an
//! `Option` in this codebase always does (`invariants.md`).

use std::collections::{HashMap, HashSet};

use crate::mcp::discover::{engine_display_name, DiscoveryResult, Registration};
use crate::mcp::probe::cache_key;

/// One row: one detected engine, the servers it registers, and what is
/// known of what they expose.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct McpEngineSummaryRow {
    pub engine_id: String,
    pub engine_name: String,
    /// Distinct server NAMES this engine registers, at any tier. Two tiers
    /// of the same name (a Local override of a User-tier server) count
    /// once — it is one server as far as this engine is concerned, the same
    /// unit `servers.rs` groups by.
    pub server_count: usize,
    /// Sum of `tools.len()` across every DISTINCT launch this engine
    /// registers that the probe cache has an answer for — success or
    /// failure alike, since a failed handshake still answers "0 tools from
    /// this launch" rather than "unknown". `None` only when nothing this
    /// engine registers has been asked at all.
    pub tools_known: Option<usize>,
}

/// The whole panel: one row per detected engine that registers at least one
/// server, plus the honesty note's own two figures.
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize)]
pub struct McpEngineSummary {
    pub rows: Vec<McpEngineSummaryRow>,
    /// Distinct launches, across every row above, the probe cache has
    /// answered — deduplicated once machine-wide, so a launch two engines
    /// happen to share is not counted twice here (it IS counted in both
    /// rows above; a shared launch is genuinely described to the model
    /// twice, once per engine that registers it).
    pub probed_launch_count: usize,
    /// Distinct launches with no cached answer at all.
    pub unprobed_launch_count: usize,
}

/// Fold `discovered` and a probe-cache lookup into [`McpEngineSummary`].
///
/// Pure — no I/O of its own, same shape as `cached_probe_confirmed`'s
/// injected `still_running`: `probe_of` is handed a launch's `cache_key`
/// (`mcp::probe::cache_key`) and answers `Some(tool_count)` when
/// `preferences::get_probe_result` holds a row for it, `None` when it does
/// not. The caller adapts a real database; tests hand it a `HashMap`. Called
/// at most once per DISTINCT launch — memoised here — so two registrations
/// sharing one launch spec never ask, or count, twice.
///
/// Row order follows each engine's first appearance in `discovered.
/// registrations`, the same "first-seen" convention `servers::group_servers`
/// uses for its own rows.
pub fn engine_summary<F>(
    discovered: &DiscoveryResult,
    detected: &HashSet<String>,
    mut probe_of: F,
) -> McpEngineSummary
where
    F: FnMut(&str) -> Option<usize>,
{
    let mut order: Vec<&str> = Vec::new();
    let mut by_engine: HashMap<&str, Vec<&Registration>> = HashMap::new();
    // Memoised per distinct launch, machine-wide, so `probe_of` -- a real
    // caller wraps a SQLite read -- runs once per launch regardless of how
    // many registrations or engines share it.
    let mut answers: HashMap<String, Option<usize>> = HashMap::new();

    for reg in &discovered.registrations {
        if !detected.contains(reg.host_id) {
            continue;
        }
        if !by_engine.contains_key(reg.host_id) {
            order.push(reg.host_id);
        }
        by_engine.entry(reg.host_id).or_default().push(reg);

        let key = launch_key(reg);
        answers.entry(key.clone()).or_insert_with(|| probe_of(&key));
    }

    let probed_launch_count = answers.values().filter(|a| a.is_some()).count();
    let unprobed_launch_count = answers.values().filter(|a| a.is_none()).count();

    let rows = order
        .into_iter()
        .map(|host_id| {
            let regs = &by_engine[host_id];

            let mut names: HashSet<&str> = HashSet::new();
            let mut own_launches: HashSet<String> = HashSet::new();
            let mut asked_any = false;
            let mut tools_sum = 0usize;

            for reg in regs.iter() {
                names.insert(reg.server.name.trim());

                let key = launch_key(reg);
                if !own_launches.insert(key.clone()) {
                    continue;
                }
                if let Some(Some(n)) = answers.get(&key) {
                    asked_any = true;
                    tools_sum += n;
                }
            }

            McpEngineSummaryRow {
                engine_id: host_id.to_string(),
                engine_name: engine_display_name(host_id),
                server_count: names.len(),
                tools_known: asked_any.then_some(tools_sum),
            }
        })
        .collect();

    McpEngineSummary {
        rows,
        probed_launch_count,
        unprobed_launch_count,
    }
}

/// `mcp::probe::cache_key` over one registration's own declaration — the
/// exact key `cached_probe` reads and writes for it.
fn launch_key(reg: &Registration) -> String {
    cache_key(
        &reg.server.command,
        &reg.server.args,
        &reg.server.env_keys,
        reg.server.project_root.as_deref(),
        &reg.server.transport,
    )
}
