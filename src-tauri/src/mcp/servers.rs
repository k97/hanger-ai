//! Turn registrations into the rows the server list renders.
//!
//! `group_servers` is the only place a server *name* becomes a row. Everything
//! upstream (`discover`) speaks in registrations — one server as declared by
//! one host in one file — because that per-registration detail is the
//! cross-host coverage this feature exists to show. Everything downstream (the
//! panel) wants one row per server name, with the registrations folded into a
//! verdict and a couple of counts. This module is the fold.
//!
//! Grouping is by `name.trim()` only — never by launch spec, never case- or
//! separator-folded. Grouping by spec would silently re-split a server whose
//! three engines write it three different ways back into three rows, which is
//! the exact defect this stage exists to fix; the spec's job is to detect
//! divergence *inside* a group, never to decide what forms one.

use std::collections::{HashMap, HashSet};

use crate::domain::RegistrationKey;
use crate::mcp::agreement::{agreement_for, Agreement};
use crate::mcp::discover::Registration;
use crate::mcp::registry::ScopeTier;

/// One row of the server list: every registration of one server name,
/// collapsed to its agreement verdict and the counts a card renders.
#[derive(Debug, Clone, serde::Serialize)]
pub struct McpServerRow {
    pub name: String,
    pub transport: String,
    /// Backend-owned. The frontend renders this; it may never compute one.
    pub registration_count: usize,
    pub distinct_spec_count: usize,
    /// Backend-owned. The number of DISTINCT config files declaring this
    /// server — never the same as `registration_count`, which counts
    /// declarations. One physical file can hold several: Claude Code's own
    /// `~/.claude.json` is named by three separate `SOURCES` rows
    /// (`registry.rs:142`, `:143`, `:166`). The card copy renders this
    /// number, not `registration_count`, so "declared in N files" stays true
    /// even where a config format lets one file carry several declarations.
    pub file_count: usize,
    pub agreement: Agreement,
    pub aliased_with: Vec<String>,
    /// Not populated by this task: no fixture here carries a plugin
    /// marketplace path (`.claude/plugins/marketplaces/*/.mcp.json`), and
    /// none of `group_servers`'s tests exercise it. Always `None` until a
    /// later task wires it up.
    pub plugin: Option<String>,
    /// `{config_path}:{server_name}` per registration, so the frontend can
    /// cross-reference rows to the inventory it already holds. Built with
    /// `RegistrationKey`, the same type `Tool::registration_key` uses, off
    /// the same two inputs, so the strings agree.
    pub registrations: Vec<String>,
    /// The project a `ScopeTier::Local` registration in this group is keyed
    /// to, set only when the group ALSO carries a registration at a wider
    /// tier (Global/User/Project) of the same name — the machine-wide
    /// declaration this project-scoped one overrides for a session inside
    /// it (§6.3 state 9: "a project-scope override of a user-scope name is
    /// a finding to surface, never a silent merge"). `agreement_for` groups
    /// by `host_id` alone, so a same-engine User+Local pair already folds
    /// into one `Duplicate` or `Conflicting` verdict — this field is the
    /// independent signal that explains WHY there are two, since neither
    /// verdict says "override" on its own. `None` when the group has no
    /// Local-tier registration, or when every registration IS Local-tier
    /// (nothing wider to override — e.g. the same server pinned in two
    /// unrelated projects).
    ///
    /// The global server list does not put Local-tier registrations in this
    /// function's input at all — they are repository-keyed and get no row of
    /// their own — so it fills this field from [`project_overrides`] over the
    /// full set instead (`lib.rs::mcp_server_rows_for`). Deriving it here
    /// from only what was handed over stays right for every direct caller;
    /// the combination of the two is what made the note unreachable live.
    pub project_override: Option<String>,
    /// Backend-owned and cache-only. `None` until the group's launch has
    /// actually been probed (`mcp_probe` is the only thing that launches a
    /// server and learns its tool count; `group_servers` starts nothing).
    /// Never populated here — `group_servers` sees only registrations, not
    /// the probe cache — filled in afterwards by [`apply_tool_counts`].
    pub tool_count: Option<usize>,
}

/// Case- and separator-folded form of a name, used only to find alias
/// *candidates* across groups — never to decide what forms a group. `Notion`
/// and `notion` fold to the same string; `notion-mcp` and `notion_mcp` do
/// too.
fn fold_name(name: &str) -> String {
    name.trim()
        .chars()
        .filter(|c| !matches!(c, '-' | '_' | ' ' | '.'))
        .flat_map(char::to_lowercase)
        .collect()
}

/// Groups `regs` by `name.trim()` and decides each group's agreement, then
/// annotates groups whose names differ only by case or separator AND whose
/// registrations agree (as a combined `agreement_for` call reports) as
/// aliases of each other.
pub fn group_servers(regs: &[Registration]) -> Vec<McpServerRow> {
    // Group by trimmed name, preserving first-seen order so the row order is
    // deterministic and matches the order registrations were discovered in.
    let mut order: Vec<String> = Vec::new();
    let mut groups: HashMap<String, Vec<Registration>> = HashMap::new();
    for reg in regs {
        let key = reg.server.name.trim().to_string();
        if !groups.contains_key(&key) {
            order.push(key.clone());
        }
        groups.entry(key).or_default().push(reg.clone());
    }

    let summaries: Vec<(String, Vec<Registration>)> = order
        .into_iter()
        .map(|name| {
            let group = groups.remove(&name).unwrap_or_default();
            (name, group)
        })
        .collect();

    // Cross-group aliasing. Two groups are alias candidates when their
    // folded names collide; among candidates, "specs match" is decided by
    // running the existing `agreement_for` on the two groups' registrations
    // combined — anything but `Conflicting` means every registration in the
    // combined set reduces to the launch it, or resolves to a redundant
    // repeat of it.
    let mut aliased_with: Vec<Vec<String>> = vec![Vec::new(); summaries.len()];
    for i in 0..summaries.len() {
        for j in 0..summaries.len() {
            if i == j {
                continue;
            }
            if fold_name(&summaries[i].0) != fold_name(&summaries[j].0) {
                continue;
            }
            let mut combined = summaries[i].1.clone();
            combined.extend(summaries[j].1.clone());
            let specs_match = agreement_for(&combined).verdict != Agreement::Conflicting;
            if specs_match {
                aliased_with[i].push(summaries[j].0.clone());
            }
        }
    }

    summaries
        .into_iter()
        .enumerate()
        .map(|(i, (name, group))| {
            let sa = agreement_for(&group);
            let transport = group
                .first()
                .map(|r| r.server.transport.clone())
                .unwrap_or_default();
            let registrations = group
                .iter()
                .map(|r| RegistrationKey::new(&r.config_path, &r.server.name).to_string())
                .collect();
            let project_override = override_for(group.iter());
            let file_count = group
                .iter()
                .map(|r| r.config_path.as_str())
                .collect::<HashSet<_>>()
                .len();
            McpServerRow {
                name,
                transport,
                registration_count: group.len(),
                distinct_spec_count: sa.distinct_specs,
                file_count,
                agreement: sa.verdict,
                aliased_with: aliased_with[i].clone(),
                plugin: None,
                registrations,
                project_override,
                tool_count: None,
            }
        })
        .collect()
}

/// The project one group's Local-tier registration overrides, or `None`.
///
/// Only when the group ALSO carries a wider-tier registration of the same
/// name is there anything to call an override. `find` (not `filter`) because
/// one project's name is what the sentence names — a server pinned
/// separately in two DIFFERENT projects, with no wider declaration at all,
/// has nothing to override and correctly falls into the "every registration
/// is Local" `None` branch regardless of which one `find` would have picked.
///
/// Sanitised at the boundary, same as `ConfigProblem.path` (`discover.rs`'s
/// own precedent for a display-only path) — never `Tool.config_path`'s
/// precedent, which stays raw because it is used functionally to open a
/// file. The value is prose only (`projectOverrideNote` on the frontend), so
/// it follows the display-path convention, not the functional-path one.
fn override_for<'a>(mut group: impl Iterator<Item = &'a Registration> + Clone) -> Option<String> {
    if !group.clone().any(|r| r.tier != ScopeTier::Local) {
        return None;
    }
    group
        .find(|r| r.tier == ScopeTier::Local)
        .and_then(|r| r.server.project_root.as_deref())
        .map(crate::preferences::sanitise_path)
}

/// The override note for each server name, keyed by the same trimmed name
/// `group_servers` groups on. Names with no override are absent.
///
/// Exists because the global server list reads two populations for two
/// questions. Its rows are the machine-wide population, which excludes
/// `ScopeTier::Local`: a registration keyed to one repository is not
/// something this machine carries by default, so it gets no row and joins no
/// count. But a Local registration is exactly what makes a wider row an
/// *override*, so the note has to be computed over the full set or it can
/// never render at all — `group_servers` derives it from its own input, the
/// caller filtered Local out of that input first, and §6.3 state 9's finding
/// was unreachable on any real machine as a result.
pub fn project_overrides(regs: &[Registration]) -> HashMap<String, String> {
    let mut groups: HashMap<String, Vec<&Registration>> = HashMap::new();
    for reg in regs {
        groups
            .entry(reg.server.name.trim().to_string())
            .or_default()
            .push(reg);
    }
    groups
        .into_iter()
        .filter_map(|(name, group)| override_for(group.iter().copied()).map(|p| (name, p)))
        .collect()
}

/// Fills `tool_count` on each row from the probe cache — one lookup per
/// group's launch, keyed by [`crate::mcp::probe::cache_key`], never one per
/// registration and never summed across them.
///
/// **Why `Consistent`/`Duplicate` collapse to one lookup.** Both verdicts
/// mean every registration in the group resolves to the same one launch
/// (`agreement_for`'s own definition), so the group's first registration's
/// key stands in for the whole row.
///
/// **Why `Conflicting` always gets `None`, cache hit or not.** A
/// `Conflicting` row is, by definition, two or more DISTINCT launches
/// declared under one name — the cache is keyed per launch, so at most one
/// of those launches is the one that would actually run. Summing the
/// group's launches would claim the server exposes the union of two
/// alternative definitions' tools, which is false; reporting either launch's
/// count alone would be a coin flip presented as fact. So a `Conflicting`
/// row is skipped outright, before any lookup — an available cache entry for
/// one of its launches must still not surface.
///
/// `regs` must be the same registrations `rows` was built from
/// (`group_servers`'s own input) — this re-groups by name because
/// `group_servers`'s internal grouping is not retained once it returns.
pub fn apply_tool_counts<F>(rows: &mut [McpServerRow], regs: &[Registration], mut probe_of: F)
where
    F: FnMut(&str) -> Option<usize>,
{
    let mut by_name: HashMap<String, Vec<&Registration>> = HashMap::new();
    for reg in regs {
        by_name
            .entry(reg.server.name.trim().to_string())
            .or_default()
            .push(reg);
    }

    for row in rows.iter_mut() {
        if row.agreement == Agreement::Conflicting {
            row.tool_count = None;
            continue;
        }
        row.tool_count = by_name
            .get(&row.name)
            .and_then(|group| group.first())
            .and_then(|reg| {
                let key = crate::mcp::probe::cache_key(
                    &reg.server.command,
                    &reg.server.args,
                    &reg.server.env_keys,
                    reg.server.project_root.as_deref(),
                    &reg.server.transport,
                );
                probe_of(&key)
            });
    }
}
