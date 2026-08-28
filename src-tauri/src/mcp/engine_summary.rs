//! Fold registrations and the probe cache into the empty inspector's
//! per-engine summary — `McpEngineSummary`, the empty-selection body Task 15
//! renders when the Tools filter is active and nothing is selected.
//!
//! `McpServerRow` (`servers.rs`) answers "what does this one server look
//! like, across every host that declares it". This module answers the
//! opposite question: "what does this one host carry, across every server
//! it registers". Same registrations, folded the other way.
//!
//! **Population, ruled in fix round 1 (2026-08-20): every host that
//! registers at least one server, not only detected engines.** The first
//! cut restricted rows to `scanner::get_global_agents()`'s detected-engine
//! ids, mirroring `mcp::discover::coverage`'s own `detected` intersection.
//! That precedent does not transfer: `coverage()`'s sentence is about
//! ENGINES ("Checked N files across M engines"), where the noun IS the
//! subject; this panel's subject is the running cost of a REGISTRATION,
//! which exists the moment a host declares a server, whether or not Hanger
//! scans a directory for that host. A Claude Desktop request carries
//! spades-audio's tools into the model regardless of whether Claude
//! Desktop is one of `AGENT_CONFIGS`'s eleven — and the reference
//! prototype's own rows include Claude.ai and Claude Desktop, neither a
//! detected engine on any machine. The fix is `registry::host_by_id(host_id)
//! .is_some()`: every id `discover_machine` can produce is already a
//! `HOSTS` row by construction, so in practice this excludes nothing real —
//! which is the point. The removed `detected: &HashSet<String>` parameter
//! is not replaced by anything; the caller no longer builds one.
//!
//! **The note counts SERVERS, in the SAME population as the rows** — also
//! ruled in fix round 1. The first cut counted distinct LAUNCHES
//! (`cache_key`s) for the note while rows counted distinct server NAMES per
//! host; on a real machine those numbers disagreed, reviving the
//! prototype's own 411-vs-156 defect this task was told to avoid. Every
//! count below is a count of (host, server name) pairs — the same unit
//! `server_count` sums per row — so `total_server_count` always equals the
//! sum of every row's own `server_count`, by construction.
//!
//! **A registration can be structurally unprobeable, and that is a third
//! finding, not "unprobed".** A Claude.ai connector declares an empty
//! command and the literal transport `"claude.ai"` — `probe_launch` gives
//! it an empty-program `Spawn`: nothing to run and nothing to dial.
//! Worse, EVERY connector on a machine collapses to the identical
//! `cache_key` (`cache_key`'s own doc comment, "a declaration that can
//! neither be launched nor dialled is keyed on its transport"), so even a
//! hypothetical answer could never be attributed to one connector over
//! another. Counting these as "not yet asked" would promise a Verify
//! button that can never do anything — `McpServerDetail`'s own
//! `nothingToAsk` already refuses this exact shape
//! (`isConnector || (command.trim().is_empty() && !isRemote)`); this
//! module's `is_askable` is that same test, applied here instead of there.
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

use crate::mcp::agreement::Agreement;
use crate::mcp::discover::{engine_display_name, DiscoveryResult, Registration};
use crate::mcp::probe::{cache_key, probe_launch, ProbeLaunch};
use crate::mcp::registry::host_by_id;
use crate::mcp::servers::group_servers;

/// One row: one host, the servers it registers, and what is known of what
/// they expose.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct McpEngineSummaryRow {
    pub engine_id: String,
    pub engine_name: String,
    /// Distinct server NAMES this host registers, at any tier. Two tiers
    /// of the same name (a Local override of a User-tier server) count
    /// once — it is one server as far as this host is concerned, the same
    /// unit `servers.rs` groups by.
    pub server_count: usize,
    /// Sum of `tools.len()` across every DISTINCT launch this host
    /// registers that the probe cache has an answer for — success or
    /// failure alike, since a failed handshake still answers "0 tools from
    /// this launch" rather than "unknown". `None` only when nothing this
    /// host registers has been asked at all.
    pub tools_known: Option<usize>,
}

/// The whole panel: one row per host that registers at least one server,
/// plus the honesty note's own four figures — all in the rows' own unit,
/// (host, server name) pairs, never a launch count and never a globally
/// deduplicated server count.
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize)]
pub struct McpEngineSummary {
    pub rows: Vec<McpEngineSummaryRow>,
    /// `rows.len()`, as a field: the strip's subtitle prints it, and a
    /// figure on screen is a backend field, never a `.length`
    /// (`invariants.md`).
    pub host_count: usize,
    /// Sum of `tools_known` over the rows that have one; `None` when no
    /// row has one. A launch two hosts share counts once per host — the
    /// per-row rule above, summed, because each host really does describe
    /// it to the model on its own requests.
    pub tools_known_total: Option<usize>,
    /// `answered_server_count + unasked_server_count + unaskable_server_count`,
    /// computed here rather than left for a caller to add up. Three backend
    /// fields summed on the frontend would dodge `no-frontend-counting`'s
    /// letter (no `.length` in sight) while breaking `invariants.md`'s
    /// actual rule: every figure on screen is a backend field.
    pub total_server_count: usize,
    /// (host, server name) pairs with at least one probed launch.
    pub answered_server_count: usize,
    /// (host, server name) pairs that COULD be asked and have not been.
    pub unasked_server_count: usize,
    /// (host, server name) pairs nothing could ever ask — a Claude.ai
    /// connector, or any other declaration with no command and no dial
    /// target. Never "not yet asked": there is no action that changes this.
    pub unaskable_server_count: usize,
    /// Server names whose registrations disagree — `Agreement::Conflicting`
    /// over the same population the rows fold. `Duplicate` is agreement and
    /// is not counted. The strip's Review pill renders this figure.
    pub conflicting_server_count: usize,
}

/// Fold `discovered` and a probe-cache lookup into [`McpEngineSummary`].
///
/// Pure — no I/O of its own, same shape as `cached_probe_confirmed`'s
/// injected `still_running`: `probe_of` is handed a launch's `cache_key`
/// (`mcp::probe::cache_key`) and answers `Some(tool_count)` when
/// `preferences::get_probe_result` holds a row for it, `None` when it does
/// not. The caller adapts a real database; tests hand it a `HashMap`.
/// Memoised per distinct launch, machine-wide, so `probe_of` runs once per
/// launch regardless of how many registrations or hosts share it.
///
/// Row order follows each host's first appearance in `discovered.
/// registrations`, the same "first-seen" convention `servers::group_servers`
/// uses for its own rows.
pub fn engine_summary<F>(discovered: &DiscoveryResult, mut probe_of: F) -> McpEngineSummary
where
    F: FnMut(&str) -> Option<usize>,
{
    let mut order: Vec<&str> = Vec::new();
    let mut by_engine: HashMap<&str, Vec<&Registration>> = HashMap::new();
    let mut answers: HashMap<String, Option<usize>> = HashMap::new();

    for reg in &discovered.registrations {
        // The only exclusion left: a host id this build's registry does not
        // recognise at all. Every id `discover_machine` can actually
        // produce already is a `HOSTS` row, so this is a formality that
        // documents the rule rather than a filter that bites in practice —
        // see the module doc comment for why "detected engine" was wrong.
        if host_by_id(reg.host_id).is_none() {
            continue;
        }
        if !by_engine.contains_key(reg.host_id) {
            order.push(reg.host_id);
        }
        by_engine.entry(reg.host_id).or_default().push(reg);

        let key = launch_key(reg);
        answers.entry(key.clone()).or_insert_with(|| probe_of(&key));
    }

    let mut total_server_count = 0usize;
    let mut answered_server_count = 0usize;
    let mut unasked_server_count = 0usize;
    let mut unaskable_server_count = 0usize;

    let rows: Vec<McpEngineSummaryRow> = order
        .into_iter()
        .map(|host_id| {
            let regs = &by_engine[host_id];

            // Distinct server names at this host, first-seen order, each
            // carrying every registration of that name — a Local-tier
            // override of a User-tier declaration is two registrations of
            // one name, and both matter to askability/answered even though
            // `server_count` still counts the name once.
            let mut name_order: Vec<&str> = Vec::new();
            let mut by_name: HashMap<&str, Vec<&Registration>> = HashMap::new();
            for reg in regs.iter() {
                let name = reg.server.name.trim();
                if !by_name.contains_key(name) {
                    name_order.push(name);
                }
                by_name.entry(name).or_default().push(*reg);
            }

            // Launches already counted toward THIS row's own `tools_known`
            // sum — scoped per row, not machine-wide, because a launch two
            // DIFFERENT hosts happen to share is genuinely described to the
            // model twice, once per host that registers it, and each row
            // must show that. Within one row it guards the opposite case:
            // the SAME host declaring the SAME exact launch twice (a
            // User-tier row and its own Local-tier repeat) must not double
            // what is genuinely one answer.
            let mut own_launches: HashSet<String> = HashSet::new();
            let mut asked_any = false;
            let mut tools_sum = 0usize;

            for name in &name_order {
                let name_regs = &by_name[name];
                let askable = name_regs.iter().any(|r| is_askable(r));
                let mut name_answered = false;

                for reg in name_regs.iter() {
                    let key = launch_key(reg);
                    let first_seen_at_this_host = own_launches.insert(key.clone());
                    // Gated on `askable`, not just on whether the cache
                    // happens to hold something under this key: an
                    // unaskable declaration's `cache_key` can collide with
                    // another registration's real answer (every Claude.ai
                    // connector on a machine shares one key), and stray
                    // data under a key nothing could have legitimately
                    // written must never leak into a row's own tool count.
                    if askable {
                        if let Some(Some(n)) = answers.get(&key) {
                            name_answered = true;
                            if first_seen_at_this_host {
                                asked_any = true;
                                tools_sum += n;
                            }
                        }
                    }
                }

                total_server_count += 1;
                if !askable {
                    unaskable_server_count += 1;
                } else if name_answered {
                    answered_server_count += 1;
                } else {
                    unasked_server_count += 1;
                }
            }

            McpEngineSummaryRow {
                engine_id: host_id.to_string(),
                engine_name: engine_display_name(host_id),
                server_count: name_order.len(),
                tools_known: asked_any.then_some(tools_sum),
            }
        })
        .collect();

    let host_count = rows.len();
    let tools_known_total = rows
        .iter()
        .filter_map(|r| r.tools_known)
        .fold(None, |acc, n| Some(acc.unwrap_or(0) + n));

    McpEngineSummary {
        rows,
        host_count,
        tools_known_total,
        total_server_count,
        answered_server_count,
        unasked_server_count,
        unaskable_server_count,
        conflicting_server_count: group_servers(&discovered.registrations)
            .iter()
            .filter(|row| row.agreement == Agreement::Conflicting)
            .count(),
    }
}

/// Whether Hanger could ever ask this registration anything — the same
/// test `McpServerDetail`'s `nothingToAsk` applies on the frontend
/// (`isConnector || (command.trim().is_empty() && !isRemote)`), expressed
/// here off `probe_launch`'s own decision instead of duplicating the
/// transport check: a `Dial` always has an endpoint to contact; a `Spawn`
/// with an empty program has nothing to run. A Claude.ai connector is
/// exactly the second shape.
fn is_askable(reg: &Registration) -> bool {
    match probe_launch(&reg.server.command, &reg.server.args, &reg.server.transport) {
        ProbeLaunch::Dial { .. } => true,
        ProbeLaunch::Spawn { program, .. } => !program.trim().is_empty(),
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
