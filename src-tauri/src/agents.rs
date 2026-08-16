//! Which agent owns a path, and which agents can merely read it.
//!
//! Pure data and one pure function — no I/O, no filesystem access. Shaped
//! after `mcp::registry::SOURCES`, the proven in-repo pattern for a static
//! table that several call sites must agree on.
//!
//! Ownership is exclusive: exactly one agent owns a path, or none does.
//! Reach is not: several agents read the vendor-neutral `.agents/`
//! convention, so nobody owns it and it belongs to the shared store
//! (`engine_id: None`, which is what `scanner.rs`'s store registration has
//! always said). Getting these two confused is the defect this module
//! replaces: `.agents/` was Gemini's `footprint_dir`, so Zed and Amp assets
//! filed under "Gemini / Antigravity".

use std::path::{Component, Path};

/// The vendor-neutral shared directory. Owned by no agent, read by several.
pub const SHARED_AGENTS_DIR: &str = ".agents";

pub struct AgentConfig {
    pub id: &'static str,
    pub name: &'static str,
    /// Home-relative roots this agent owns. First is canonical.
    pub global_roots: &'static [&'static str],
    /// Repo-relative roots this agent owns.
    pub project_roots: &'static [&'static str],
    /// Category → subpath under each root. `None` = agent has no such category.
    pub skills: Option<&'static str>,
    pub rules: Option<&'static str>,
    pub subagents: Option<&'static str>,
    /// True when this agent reads the vendor-neutral `.agents/` convention.
    /// This is a *reach* edge and never implies ownership.
    pub reads_agents_dir: bool,
}

pub const AGENT_CONFIGS: &[AgentConfig] = &[
    AgentConfig {
        id: "claude-code",
        name: "Claude Code",
        global_roots: &[".claude", ".config/claude"],
        project_roots: &[".claude"],
        skills: Some("skills"),
        rules: Some("rules"),
        subagents: Some("agents"),
        reads_agents_dir: true,
    },
    AgentConfig {
        id: "codex",
        name: "Codex",
        global_roots: &[".codex"],
        project_roots: &[".codex"],
        skills: Some("skills"),
        rules: None,
        subagents: Some("agents"),
        reads_agents_dir: false,
    },
    AgentConfig {
        id: "gemini",
        name: "Gemini / Antigravity",
        global_roots: &[".gemini"],
        project_roots: &[".gemini"],
        skills: Some("skills"),
        rules: None,
        subagents: None,
        reads_agents_dir: true,
    },
];

/// Split a path into its string components, skipping the root and any
/// prefix. Whole-component matching is the point: `contains("/.data")`
/// matches `/srv/database`, which is how a path substring check quietly
/// claims a directory that is not an agent's.
fn components(path: &Path) -> Vec<&str> {
    path.components()
        .filter_map(|c| match c {
            Component::Normal(s) => s.to_str(),
            _ => None,
        })
        .collect()
}

/// Does `needle` (a `/`-separated relative root) appear as a run of whole
/// components in `hay`? Returns the index just past the match.
fn match_run(hay: &[&str], needle: &str) -> Option<usize> {
    let want: Vec<&str> = needle.split('/').filter(|s| !s.is_empty()).collect();
    if want.is_empty() || want.len() > hay.len() {
        return None;
    }
    for start in 0..=(hay.len() - want.len()) {
        if hay[start..start + want.len()] == want[..] {
            return Some(start + want.len());
        }
    }
    None
}

/// The agent that owns this path, or `None` when no agent claims it.
///
/// Derived from `AGENT_CONFIGS` — never from a hardcoded substring. Longest
/// root wins, so a vendor root nested inside a project root beats a shorter
/// match. A path under the shared `.agents/` directory always resolves to
/// `None`: it is store-owned (spec §4.4).
pub fn engine_for_path(path: &Path) -> Option<&'static AgentConfig> {
    let comps = components(path);
    if comps.iter().any(|c| *c == SHARED_AGENTS_DIR) {
        return None;
    }

    let mut best: Option<(&'static AgentConfig, usize)> = None;
    for config in AGENT_CONFIGS {
        for root in config.global_roots.iter().chain(config.project_roots.iter()) {
            let depth = root.split('/').filter(|s| !s.is_empty()).count();
            if match_run(&comps, root).is_some() {
                let better = match best {
                    None => true,
                    Some((_, best_depth)) => depth > best_depth,
                };
                if better {
                    best = Some((config, depth));
                }
            }
        }
    }
    best.map(|(c, _)| c)
}

/// Every agent that reads the shared `.agents/` directory. This is the reach
/// set for store-owned convention assets — never an ownership answer.
pub fn agents_reading_shared_dir() -> Vec<&'static AgentConfig> {
    AGENT_CONFIGS.iter().filter(|c| c.reads_agents_dir).collect()
}

/// Look up a config by id.
pub fn config_for_id(id: &str) -> Option<&'static AgentConfig> {
    AGENT_CONFIGS.iter().find(|c| c.id == id)
}

/// Rules files that name their own agent. Unlike directories, a rules file is
/// attributed by filename — `.cursorrules` says "Cursor" wherever it sits.
/// `AGENTS.md` is deliberately absent: it is the vendor-neutral convention
/// several agents read, so like `.agents/` it has no owner.
pub const RULE_FILE_OWNERS: &[(&str, &str, &str)] = &[
    (".cursorrules", "cursor", "Cursor"),
    ("copilot-instructions.md", "copilot", "GitHub Copilot"),
];

/// The engine key and display name that own this rules filename, if any.
pub fn engine_for_rule_file(filename: &str) -> Option<(&'static str, &'static str)> {
    RULE_FILE_OWNERS
        .iter()
        .find(|(name, _, _)| *name == filename)
        .map(|(_, key, display)| (*key, *display))
}
