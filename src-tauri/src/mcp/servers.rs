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

use std::collections::HashMap;

use crate::domain::RegistrationKey;
use crate::mcp::agreement::{agreement_for, Agreement};
use crate::mcp::discover::Registration;

/// One row of the server list: every registration of one server name,
/// collapsed to its agreement verdict and the counts a card renders.
#[derive(Debug, Clone, serde::Serialize)]
pub struct McpServerRow {
    pub name: String,
    pub transport: String,
    /// Backend-owned. The frontend renders this; it may never compute one.
    pub registration_count: usize,
    pub distinct_spec_count: usize,
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
            McpServerRow {
                name,
                transport,
                registration_count: group.len(),
                distinct_spec_count: sa.distinct_specs,
                agreement: sa.verdict,
                aliased_with: aliased_with[i].clone(),
                plugin: None,
                registrations,
            }
        })
        .collect()
}
