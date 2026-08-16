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
    AgentConfig {
        id: "kiro",
        name: "Kiro",
        global_roots: &[".kiro"],
        project_roots: &[".kiro"],
        skills: Some("skills"),
        rules: Some("steering"),
        subagents: Some("agents"),
        reads_agents_dir: false,
    },
    AgentConfig {
        id: "trae",
        name: "Trae",
        global_roots: &[".trae"],
        project_roots: &[".trae"],
        skills: Some("skills"),
        rules: Some("rules"),
        // Trae's subagents directory is unconfirmed in vendor docs, so it
        // ships without subagent support rather than on a guess (spec §11).
        subagents: None,
        reads_agents_dir: false,
    },
    AgentConfig {
        id: "opencode",
        name: "OpenCode",
        global_roots: &[".config/opencode"],
        project_roots: &[".opencode"],
        skills: None,
        rules: None,
        subagents: Some("agent"),
        reads_agents_dir: false,
    },
    AgentConfig {
        id: "amp",
        name: "Amp",
        global_roots: &[".config/amp"],
        project_roots: &[".amp"],
        skills: None,
        rules: None,
        subagents: None,
        // Amp defaults to the shared convention — that is where its skills
        // live, and reach is how the UI expresses it.
        reads_agents_dir: true,
    },
    AgentConfig {
        id: "zed",
        name: "Zed",
        // Zed owns nothing. It replaced its own Rules Library with the
        // vendor-neutral convention, and is detected by
        // ~/.config/zed/settings.json, already in mcp::registry::SOURCES.
        global_roots: &[],
        project_roots: &[],
        skills: None,
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

/// The agent that owns this *subagent file*, requiring its containing
/// `agents`-style directory to sit directly under the agent's own root — no
/// intervening directories.
///
/// `engine_for_path` only requires the root to appear *somewhere* in the
/// path, which is correct for skills, rules and tools: a Claude Code plugin
/// legitimately nests a `skills/` directory several levels under `.claude/`.
/// It is wrong for subagents — `.claude/plugins/foo/agents/bar.md` must not
/// resolve as a Claude Code subagent merely because `.claude` and some
/// `agents` directory both appear somewhere in the path. This restores the
/// adjacency the old `contains("/.claude/agents/")` chain enforced by
/// construction, without reintroducing a substring check.
///
/// Unlike `engine_for_path`, this returns on the first `(config, root)` pair
/// whose `root/subagents` needle matches, rather than preferring the longest
/// match. That is safe today only because every config with `subagents:
/// Some(_)` (claude-code, codex, kiro, opencode) has a distinct leaf root
/// component name — `.claude`, `.config/claude`, `.codex`, `.kiro`,
/// `.config/opencode`, `.opencode` — so no two configs' needles can both
/// match the same path: `match_run` requires the *whole* needle to equal a
/// contiguous run of components, and none of these needles is a component-
/// wise suffix of another. It would stop being safe the moment two
/// subagent-bearing configs shared a root whose last path segment is the same
/// string (e.g. a future agent rooted at plain `opencode` without the dot, or
/// two configs both rooted at a bare `agents`-adjacent name) — at that point
/// this must switch to longest-root-wins, matching `engine_for_path`.
pub fn subagent_owner_for_path(path: &Path) -> Option<&'static AgentConfig> {
    let comps = components(path);
    if comps.is_empty() || comps.iter().any(|c| *c == SHARED_AGENTS_DIR) {
        return None;
    }
    for config in AGENT_CONFIGS {
        let Some(dir) = config.subagents else { continue };
        for root in config.global_roots.iter().chain(config.project_roots.iter()) {
            let needle = format!("{root}/{dir}");
            // The file itself must be the component immediately after the
            // matched run: the subagents directory holds subagent files
            // directly, not further nesting, and nothing may sit between the
            // root and it.
            if match_run(&comps, &needle) == Some(comps.len() - 1) {
                return Some(config);
            }
        }
    }
    None
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
