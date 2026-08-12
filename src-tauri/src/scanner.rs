use crate::domain::{Agent, Inventory, ProjectScan, Rule, Scope, Skill, Subagent, Tool, AssetCounts, CategoryCount, CategoryCountNode, RepoTreeNode, GlobalTreeNode, TreeCounts};
use ignore::WalkBuilder;
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub fn count_assets(db_path: &Path, root: Option<&str>) -> Result<AssetCounts, String> {
    let store = crate::preferences::PreferencesStore::new(db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    let conn = store.connect()
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    let mut stmt = conn.prepare(
        "SELECT category, scope, eng.display_name, COUNT(*) 
         FROM assets 
         LEFT JOIN roots rts ON assets.root_id = rts.id
         LEFT JOIN engines eng ON assets.engine_id = eng.id
         WHERE category != 'agent' AND (?1 IS NULL OR rts.abs_path = ?1)
         GROUP BY category, scope, assets.engine_id;"
    ).map_err(|e| format!("Query prepare failed: {}", e))?;

    let rows = stmt.query_map([root], |r| {
        let cat: String = r.get(0)?;
        let scope: String = r.get(1)?;
        let engine_display_name: Option<String> = r.get(2)?;
        let count: usize = r.get(3)?;
        Ok((cat, scope, engine_display_name, count))
    }).map_err(|e| format!("Query map failed: {}", e))?;

    let mut category_map: std::collections::HashMap<String, (usize, usize)> = std::collections::HashMap::new();
    let mut engine_map: std::collections::HashMap<String, usize> = std::collections::HashMap::new();

    for row in rows {
        let (cat, scope, engine_display_name, cnt) = row.map_err(|e| format!("Row error: {}", e))?;
        let entry = category_map.entry(cat).or_insert((0, 0));
        if scope == "global" {
            entry.0 += cnt;
        } else if scope == "project" {
            entry.1 += cnt;
        }
        let eng_name = engine_display_name.unwrap_or_else(|| "none".to_string());
        *engine_map.entry(eng_name).or_insert(0) += cnt;
    }



    let build_cat = |cat_name: &str| -> Option<CategoryCount> {
        if let Some(&(global, project)) = category_map.get(cat_name) {
            let total = global + project;
            if total > 0 {
                return Some(CategoryCount { total, global, project });
            }
        }
        None
    };

    let skill = build_cat("skill");
    let rule = build_cat("rule");
    let subagent = build_cat("subagent");
    let tool = build_cat("tool");

    let total_assets = skill.as_ref().map(|c| c.total).unwrap_or(0)
        + rule.as_ref().map(|c| c.total).unwrap_or(0)
        + subagent.as_ref().map(|c| c.total).unwrap_or(0)
        + tool.as_ref().map(|c| c.total).unwrap_or(0);

    Ok(AssetCounts {
        total_assets,
        skill,
        rule,
        subagent,
        tool,
        engines: if engine_map.is_empty() { None } else { Some(engine_map) },
    })
}

pub fn count_tree_assets(db_path: &Path) -> Result<TreeCounts, String> {
    let store = crate::preferences::PreferencesStore::new(db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    let conn = store.connect()
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    let linked_dirs = store.get_linked_directories()
        .unwrap_or_default();

    let mut stmt = conn.prepare(
        "SELECT rts.kind, rts.abs_path, rts.label, assets.category, COUNT(*)
         FROM assets
         LEFT JOIN roots rts ON assets.root_id = rts.id
         WHERE assets.category != 'agent'
         GROUP BY assets.root_id, assets.category;"
    ).map_err(|e| format!("Query prepare failed: {}", e))?;

    let rows = stmt.query_map([], |r| {
        let root_kind: Option<String> = r.get(0)?;
        let abs_path: Option<String> = r.get(1)?;
        let label: Option<String> = r.get(2)?;
        let cat: String = r.get(3)?;
        let count: usize = r.get(4)?;
        Ok((root_kind, abs_path, label, cat, count))
    }).map_err(|e| format!("Query map failed: {}", e))?;

    let mut global_categories: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    let mut repo_categories: std::collections::HashMap<String, (String, std::collections::HashMap<String, usize>)> = std::collections::HashMap::new();

    for dir in &linked_dirs {
        let label = Path::new(dir)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(dir)
            .to_string();
        repo_categories.entry(dir.clone()).or_insert((label, std::collections::HashMap::new()));
    }

    for row in rows {
        let (root_kind, abs_path, label, cat_raw, count) = row.map_err(|e| format!("Row error: {}", e))?;
        let cat = match cat_raw.as_str() {
            "skill" => "Skills",
            "tool" => "Tools",
            "rule" => "Rules",
            "subagent" => "Subagents",
            other => other,
        }.to_string();

        let is_global = match root_kind.as_deref() {
            Some("engine_global") => true,
            _ => abs_path.as_deref().is_some_and(|p| p.is_empty() || p == "global"),
        };

        if is_global {
            *global_categories.entry(cat).or_insert(0) += count;
        } else if let Some(path) = abs_path {
            let lbl = label.unwrap_or_else(|| {
                Path::new(&path)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or(&path)
                    .to_string()
            });
            let entry = repo_categories.entry(path).or_insert((lbl, std::collections::HashMap::new()));
            *entry.1.entry(cat).or_insert(0) += count;
        }
    }

    let cat_order = ["Skills", "Tools", "Rules", "Subagents"];

    let mut global_cats_vec = Vec::new();
    let mut global_total = 0;
    for &c in &cat_order {
        if let Some(&cnt) = global_categories.get(c) {
            if cnt > 0 {
                global_cats_vec.push(CategoryCountNode {
                    category: c.to_string(),
                    count: cnt,
                });
                global_total += cnt;
            }
        }
    }

    let mut repo_nodes = Vec::new();
    let mut repos_total = 0;

    for (path, (label, cats_map)) in repo_categories {
        let mut repo_cats_vec = Vec::new();
        let mut repo_total = 0;
        for &c in &cat_order {
            if let Some(&cnt) = cats_map.get(c) {
                if cnt > 0 {
                    repo_cats_vec.push(CategoryCountNode {
                        category: c.to_string(),
                        count: cnt,
                    });
                    repo_total += cnt;
                }
            }
        }
        repo_nodes.push(RepoTreeNode {
            path,
            label,
            total: repo_total,
            categories: repo_cats_vec,
        });
        repos_total += repo_total;
    }

    Ok(TreeCounts {
        global: GlobalTreeNode {
            total: global_total,
            categories: global_cats_vec,
        },
        repositories: repo_nodes,
        repositories_total: repos_total,
        total: global_total + repos_total,
    })
}

#[derive(Debug)]
pub enum ScanError {
    Io(std::io::Error),
    #[allow(dead_code)]
    Other(String),
}

impl std::fmt::Display for ScanError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(e) => write!(f, "I/O error: {}", e),
            Self::Other(s) => write!(f, "Scanning error: {}", s),
        }
    }
}

impl std::error::Error for ScanError {}

impl From<std::io::Error> for ScanError {
    fn from(err: std::io::Error) -> Self {
        Self::Io(err)
    }
}

pub trait Scanner {
    fn scan(&self, root: &Path) -> Result<Inventory, ScanError>;
}

pub struct DirectoryScanner {
    pub db_path: PathBuf,
    pub cancellation_token: Arc<AtomicBool>,
}

pub const RULE_FILENAMES: &[&str] = &[
    "CLAUDE.md",
    "AGENTS.md",
    "GEMINI.md",
    ".cursorrules",
    "copilot-instructions.md",
    ".windsurfrules",
];

pub struct AgentConfig {
    pub id: &'static str,
    pub name: &'static str,
    pub global_paths: &'static [&'static str],
    pub footprint_dir: &'static str,
}

pub const AGENT_CONFIGS: &[AgentConfig] = &[
    AgentConfig {
        id: "claude-code",
        name: "Claude Code",
        global_paths: &[".claude", ".config/claude"],
        footprint_dir: ".claude",
    },
    AgentConfig {
        id: "codex",
        name: "Codex",
        global_paths: &[".codex"],
        footprint_dir: ".codex",
    },
    AgentConfig {
        id: "gemini",
        name: "Gemini / Antigravity",
        global_paths: &[".gemini"],
        footprint_dir: ".agents",
    },
];

fn get_engine_key(id_str: &str) -> &'static str {
    match id_str {
        "claude-code" | "claude_code" => "claude_code",
        "codex" => "codex",
        "gemini" => "gemini",
        "cursor" => "cursor",
        "copilot" => "copilot",
        _ => "gemini",
    }
}

fn get_home_dir() -> PathBuf {
    if let Ok(test_home) = std::env::var("HANGER_TEST_HOME") {
        return PathBuf::from(test_home);
    }
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home);
    }
    if let Ok(profile) = std::env::var("USERPROFILE") {
        return PathBuf::from(profile);
    }
    PathBuf::from(".")
}

fn canonicalize_asset_path(path: &Path, parse_warnings: &mut Vec<String>) -> String {
    match fs::canonicalize(path) {
        Ok(canonical_p) => canonical_p.to_string_lossy().to_string(),
        Err(e) => {
            let path_str = path.to_string_lossy().to_string();
            parse_warnings.push(format!("Failed to canonicalize path {}: {}", crate::preferences::sanitise_path(&path_str), e));
            path_str
        }
    }
}

pub fn get_global_agents() -> Vec<Agent> {
    let home = get_home_dir();
    let mut agents = Vec::new();
    for config in AGENT_CONFIGS {
        let mut resolved_path = None;
        for rel_path in config.global_paths {
            let path = home.join(rel_path);
            if path.exists() {
                resolved_path = Some(path.to_string_lossy().to_string());
                break;
            }
        }
        if let Some(g_path) = resolved_path {
            agents.push(Agent {
                id: config.id.to_string(),
                name: config.name.to_string(),
                global_config_path: Some(g_path),
                project_footprints: Vec::new(),
            });
        }
    }
    agents
}

#[derive(Deserialize)]
struct SkillFrontmatter {
    name: String,
    description: String,
    version: Option<String>,
    #[serde(alias = "source-origin")]
    source_origin: Option<String>,
}

fn parse_skill_frontmatter(content: &str) -> Result<SkillFrontmatter, String> {
    if !content.starts_with("---") {
        return Err("Missing frontmatter block delimiter '---'".to_string());
    }
    let parts: Vec<&str> = content.split("---").collect();
    if parts.len() < 3 {
        return Err("Malformed YAML frontmatter wrapper".to_string());
    }
    let yaml_str = parts[1];
    serde_yaml::from_str::<SkillFrontmatter>(yaml_str)
        .map_err(|e| format!("YAML parsing failed: {}", e))
}

#[derive(Deserialize)]
struct SubagentFrontmatter {
    name: String,
    description: String,
    tools: Option<Vec<String>>,
}

fn parse_subagent_frontmatter(content: &str) -> Result<SubagentFrontmatter, String> {
    let trimmed = content.trim();
    if !trimmed.starts_with("---") {
        return Err("Missing frontmatter block delimiter '---'".to_string());
    }
    let parts: Vec<&str> = trimmed.split("---").collect();
    if parts.len() < 3 {
        return Err("Malformed YAML frontmatter wrapper".to_string());
    }
    let yaml_str = parts[1];
    serde_yaml::from_str::<SubagentFrontmatter>(yaml_str)
        .map_err(|e| format!("YAML parsing failed: {}", e))
}


fn is_tool_config_file(filename: &str) -> bool {
    matches!(
        filename,
        "mcp.json" | ".mcp.json" | "mcp_config.json" | "config.toml" | "settings.json"
    )
}

fn sanitise_url(url_str: &str) -> String {
    if !url_str.contains("://") {
        return url_str.to_string();
    }
    let parts: Vec<&str> = url_str.split("://").collect();
    if parts.len() != 2 {
        return url_str.to_string();
    }
    let scheme = parts[0];
    let rest = parts[1];

    let rest_no_query = rest.split('?').next().unwrap_or(rest);

    if let Some(at_idx) = rest_no_query.find('@') {
        let host_part = &rest_no_query[at_idx + 1..];
        format!("{}://{}", scheme, host_part)
    } else {
        format!("{}://{}", scheme, rest_no_query)
    }
}

fn parse_toml_tools(content: &str) -> Vec<(String, String, String)> {
    let mut results = Vec::new();
    if let Ok(toml_val) = toml::from_str::<toml::Value>(content) {
        if let Some(tools_arr) = toml_val.get("tools").and_then(|v| v.as_array()) {
            for t in tools_arr {
                if let Some(name) = t.get("name").and_then(|v| v.as_str()) {
                    let cmd = t
                        .get("command")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let transport = t
                        .get("transport")
                        .or_else(|| t.get("url"))
                        .and_then(|v| v.as_str())
                        .map(sanitise_url)
                        .unwrap_or_else(|| {
                            if cmd.is_empty() {
                                "unknown".to_string()
                            } else {
                                "stdio".to_string()
                            }
                        });
                    results.push((name.to_string(), cmd, transport));
                }
            }
        }
        else if let Some(tools_map) = toml_val.get("tools").and_then(|v| v.as_table()) {
            for (name, val) in tools_map {
                let cmd = val
                    .get("command")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let transport = val
                    .get("transport")
                    .or_else(|| val.get("url"))
                    .and_then(|v| v.as_str())
                    .map(sanitise_url)
                    .unwrap_or_else(|| {
                        if cmd.is_empty() {
                            "unknown".to_string()
                        } else {
                            "stdio".to_string()
                        }
                    });
                results.push((name.clone(), cmd, transport));
            }
        }
    }
    results
}

fn check_asset_drift(
    path: &Path,
    checksums: &[(String, String, String)],
) -> (Option<bool>, Option<bool>, Option<String>, Option<String>) {
    let p_metadata = fs::symlink_metadata(path);
    let is_symlink = p_metadata
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false);

    if is_symlink {
        let source_path = fs::read_link(path)
            .map(|p| p.to_string_lossy().to_string())
            .ok();
        return (Some(false), Some(true), None, source_path);
    }

    let abs_path = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let abs_path_str = abs_path.to_string_lossy().to_string();

    for (src, dest, stored_hash) in checksums {
        if dest == &abs_path_str {
            let hash_target = if path.is_dir() {
                path.join("SKILL.md")
            } else {
                path.to_path_buf()
            };

            // HASH BUDGET: Skip + warn on files above 10MB size cap
            if let Ok(meta) = fs::metadata(&hash_target) {
                if meta.len() > 10_000_000 {
                    let warning_msg = format!(
                        "Skipped drift check: File {} exceeds the size limit (10MB).",
                        crate::preferences::sanitise_path(&abs_path_str)
                    );
                    return (Some(false), Some(false), Some(warning_msg), Some(src.clone()));
                }
            }

            if let Ok(content) = fs::read(&hash_target) {
                let current_hash = blake3::hash(&content).to_hex().to_string();
                if &current_hash != stored_hash {
                    let warning_msg = format!(
                        "Version drift detected: File at {} has diverged from its source {}",
                        crate::preferences::sanitise_path(&abs_path_str),
                        crate::preferences::sanitise_path(src)
                    );
                    return (Some(true), Some(false), Some(warning_msg), Some(src.clone()));
                } else {
                    return (Some(false), Some(false), None, Some(src.clone()));
                }
            }
        }
    }

    (None, Some(false), None, None)
}

fn parse_and_append_tools(
    path: &Path,
    scope: Scope,
    agent_id: &str,
    tools: &mut Vec<Tool>,
    warnings: &mut Vec<String>,
    checksums: &[(String, String, String)],
) -> Result<usize, String> {
    let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    let path_str = path.to_string_lossy().to_string();

    if filename == "config.toml"
        && !path_str.contains(".codex")
        && !path_str.contains(".agents")
        && !path_str.contains(".claude")
    {
        return Ok(0);
    }

    if filename == "settings.json" {
        if let Ok(content) = fs::read_to_string(path) {
            if !content.contains("mcpServers") {
                return Ok(0);
            }
        }
    }

    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(e) => {
            let msg = format!("Failed to read tool config at {}: {}", path_str, e);
            warnings.push(msg.clone());
            return Err(msg);
        }
    };

    let (drifted, is_sym, warning, source_path) = check_asset_drift(path, checksums);
    if let Some(w) = warning {
        warnings.push(w);
    }

    let initial_len = tools.len();

    if filename.ends_with(".toml") {
        let toml_tools = parse_toml_tools(&content);
        if toml_tools.is_empty() {
            if let Err(e) = toml::from_str::<toml::Value>(&content) {
                let msg = format!("Failed to parse TOML at {}: {}", path_str, e);
                warnings.push(msg.clone());
                return Err(msg);
            }
        }
        for (name, cmd, transport) in toml_tools {
            let link_state = if drifted == Some(true) { Some(crate::domain::LinkState::Drifted) } else if is_sym == Some(true) || source_path.is_some() { Some(crate::domain::LinkState::Linked) } else { None };
            tools.push(Tool {
                id: format!("{}-{}", path_str, name),
                name,
                command: cmd,
                transport,
                config_path: path_str.clone(),
                scope: scope.clone(),
                owning_agent: agent_id.to_string(),
                drifted,
                is_symlink: is_sym,
                source_path: source_path.clone(),
                parse_status: Some("ok".to_string()),
                parse_error: None,
                link_state,
            });
        }
    } else {
        match serde_json::from_str::<serde_json::Value>(&content) {
            Ok(json_val) => {
                let mut found = false;

                if let Some(servers) = json_val
                    .get("mcpServers")
                    .or_else(|| json_val.get("mcp_servers"))
                    .and_then(|v| v.as_object())
                {
                    for (name, server) in servers {
                        found = true;
                        let cmd = server
                            .get("command")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let transport_str = server
                            .get("url")
                            .and_then(|v| v.as_str())
                            .map(sanitise_url)
                            .unwrap_or_else(|| {
                                if cmd.is_empty() {
                                    "unknown".to_string()
                                } else {
                                    "stdio".to_string()
                                }
                            });

                        let link_state = if drifted == Some(true) { Some(crate::domain::LinkState::Drifted) } else if is_sym == Some(true) || source_path.is_some() { Some(crate::domain::LinkState::Linked) } else { None };
                        tools.push(Tool {
                            id: format!("{}-{}", path_str, name),
                            name: name.clone(),
                            command: cmd,
                            transport: transport_str,
                            config_path: path_str.clone(),
                            scope: scope.clone(),
                            owning_agent: agent_id.to_string(),
                            drifted,
                            is_symlink: is_sym,
                            source_path: source_path.clone(),
                            parse_status: Some("ok".to_string()),
                            parse_error: None,
                            link_state,
                        });
                    }
                }

                if !found {
                    if let Some(tools_arr) = json_val.get("tools").and_then(|v| v.as_array()) {
                        for (i, t) in tools_arr.iter().enumerate() {
                            let name = t
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or("unnamed_tool")
                                .to_string();
                            let link_state = if drifted == Some(true) { Some(crate::domain::LinkState::Drifted) } else if is_sym == Some(true) || source_path.is_some() { Some(crate::domain::LinkState::Linked) } else { None };
                            tools.push(Tool {
                                id: format!("{}-{}", path_str, i),
                                name,
                                command: "internal".to_string(),
                                transport: "stdio".to_string(),
                                config_path: path_str.clone(),
                                scope: scope.clone(),
                                owning_agent: agent_id.to_string(),
                                drifted,
                                is_symlink: is_sym,
                                source_path: source_path.clone(),
                                parse_status: Some("ok".to_string()),
                                parse_error: None,
                                link_state,
                            });
                        }
                    }
                }
            }
            Err(e) => {
                let msg = format!("Failed to parse JSON at {}: {}", path_str, e);
                warnings.push(msg.clone());
                return Err(msg);
            }
        }
    }

    Ok(tools.len() - initial_len)
}

// EXCLUSION LIST: platform aware checks
pub fn is_excluded(path: &Path) -> bool {
    for component in path.components() {
        if let Some(comp_str) = component.as_os_str().to_str() {
            if matches!(comp_str, "node_modules" | ".git" | "Library" | ".Trash" | ".cache" | "Caches" | ".npm" | ".cargo" | ".rustup" | ".pnpm-store") {
                return true;
            }
        }
    }
    false
}

/// A directory qualifies as a repository candidate if it carries an engine
/// configuration directory or any recognised rules file. This is the same test
/// the standalone repo scan used, lifted so the ordinary project walk can apply
/// it without a second traversal.
pub fn qualifies_as_repo(dir: &Path) -> bool {
    if dir.join(".git").exists()
        || dir.join(".claude").exists()
        || dir.join(".agents").exists()
        || dir.join(".codex").exists()
        || dir.join(".gemini").exists()
    {
        return true;
    }
    RULE_FILENAMES.iter().any(|r| dir.join(r).exists())
}

// BROAD-ROOT check helper
pub fn is_broad_root(root: &Path) -> bool {
    let home = get_home_dir();
    // Path matches HOME folder
    if root == home {
        return true;
    }
    // Count first-level entries up to threshold 50
    if let Ok(entries) = fs::read_dir(root) {
        let count = entries.take(51).count();
        if count > 50 {
            return true;
        }
    }
    false
}

// Engine-root guard: linking or scanning an engine's global configuration (or
// the shared ~/.agents container) as a project re-stamps its assets with
// project scope — the corruption class behind the 2,328 stale rows purged by
// migration v2. Pure matcher plus a live wrapper for the tauri commands.
pub fn match_protected_root(path: &Path, protected: &[(PathBuf, String)]) -> Option<String> {
    // Compare raw and canonical forms on both sides: canonicalize fails on
    // paths that do not exist yet, and macOS splits /var vs /private/var, so a
    // single-form comparison misses real matches.
    let raw = path.to_path_buf();
    let canon = fs::canonicalize(path).unwrap_or_else(|_| raw.clone());
    for (root, label) in protected {
        let root_canon = fs::canonicalize(root).unwrap_or_else(|_| root.clone());
        for candidate in [&raw, &canon] {
            for protected_form in [root, &root_canon] {
                if candidate.as_path() == protected_form.as_path()
                    || candidate.starts_with(protected_form)
                {
                    return Some(label.clone());
                }
            }
        }
    }
    None
}

pub fn protected_roots() -> Vec<(PathBuf, String)> {
    let mut out = Vec::new();
    for agent in get_global_agents() {
        if let Some(g) = &agent.global_config_path {
            out.push((
                PathBuf::from(g),
                format!("{}'s global configuration", agent.name),
            ));
        }
    }
    out.push((
        get_home_dir().join(".agents"),
        "the shared agent standards (~/.agents)".to_string(),
    ));
    out
}

pub fn guard_engine_root(path: &str) -> Result<(), String> {
    if let Some(label) = match_protected_root(Path::new(path), &protected_roots()) {
        return Err(format!(
            "{} is {} — already inventoried under User Profile.",
            path, label
        ));
    }
    Ok(())
}

// A shared-standards container: an engine's skills/ or agents/ entry that is a
// symlink resolving under ~/.agents. Assets there belong to ~/.agents — the
// deepest real location — not to whichever engine happened to link them.
pub fn shared_agents_container(walk_root: &Path) -> Option<std::path::PathBuf> {
    let container = get_home_dir().join(".agents");
    if fs::read_link(walk_root).is_ok() {
        if let Ok(target) = fs::canonicalize(walk_root) {
            if target.starts_with(&container) {
                return Some(container);
            }
        }
    }
    None
}

fn has_parent_skill(path: &Path, root: &Path) -> bool {
    let mut curr = path.parent();
    while let Some(parent) = curr {
        if parent == root || !parent.starts_with(root) {
            break;
        }
        if parent != path.parent().unwrap_or(path) && parent.join("SKILL.md").exists() {
            return true;
        }
        curr = parent.parent();
    }
    false
}

impl Scanner for DirectoryScanner {
    fn scan(&self, root: &Path) -> Result<Inventory, ScanError> {
        self.scan_with_progress(root, |_, _, _| {})
    }
}

impl DirectoryScanner {
    pub fn scan_with_progress<F>(&self, root: &Path, mut on_progress: F) -> Result<Inventory, ScanError>
    where
        F: FnMut(usize, usize, &str),
    {
        let _status_guard = crate::scan::status::acquire_scan_lock(root, crate::scan::status::ScanPhase::Scanning);

        let mut inventory = Inventory::default();

        // 0. Load deploy checksums for drift checking
        let mut checksums = Vec::new();
        if self.db_path.exists() {
            if let Ok(store) = crate::preferences::PreferencesStore::new(&self.db_path) {
                if let Ok(all_cs) = store.get_all_deploy_checksums() {
                    checksums = all_cs;
                }
            }
        }

        let detected_agents = get_global_agents();
        let mut parse_warnings = Vec::new();

        let store_opt = crate::preferences::PreferencesStore::new(&self.db_path).ok();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);

        let mut engine_db_ids = std::collections::HashMap::new();
        if let Some(store) = &store_opt {
            for agent in &detected_agents {
                if let Some(g_path) = &agent.global_config_path {
                    let key = get_engine_key(&agent.id);
                    if let Ok(id) = store.upsert_engine(key, &agent.name, g_path, now) {
                        engine_db_ids.insert(key.to_string(), id);
                    }
                }
            }
        }

        // Engines are containers, not assets — inventory.agents is empty in asset stream
        inventory.agents = Vec::new();

        // Root for shared ~/.agents assets, created lazily on first symlink hit.
        // engine_id is NULL: shared standards render "Any agent".
        let mut shared_agents_root_id: Option<i64> = None;
        let ensure_shared_root = |store_opt: &Option<crate::preferences::PreferencesStore>,
                                      shared_agents_root_id: &mut Option<i64>| {
            if shared_agents_root_id.is_none() {
                if let Some(store) = store_opt {
                    let container = get_home_dir().join(".agents");
                    let container_str = fs::canonicalize(&container)
                        .unwrap_or(container)
                        .to_string_lossy()
                        .to_string();
                    *shared_agents_root_id = store
                        .upsert_root("engine_global", &container_str, None, ".agents", now)
                        .ok();
                }
            }
        };
        for agent in &detected_agents {
            if let Some(g_path) = &agent.global_config_path {
                let mut global_has_skips = false;
                let engine_key = get_engine_key(&agent.id);
                let engine_id = engine_db_ids.get(engine_key).copied().unwrap_or(1);
                let global_root_id = store_opt.as_ref().and_then(|s| {
                    s.upsert_root("engine_global", g_path, Some(engine_id), &agent.name, now).ok()
                });

                let g_path_buf = Path::new(g_path);
                if let Ok(entries) = fs::read_dir(g_path_buf) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                        // 1. Global Tools
                        if is_tool_config_file(filename) {
                            let scope = Scope::Global {
                                agent: agent.id.clone(),
                            };
                            let initial_tools_count = inventory.tools.len();
                            let canon_path = canonicalize_asset_path(&path, &mut parse_warnings);
                            let tool_engine_id = if filename == "mcp.json" {
                                None // MCP server definitions (mcp.json) are engine-agnostic shared standards
                            } else {
                                Some(engine_id)
                            };

                            match parse_and_append_tools(
                                &path,
                                scope,
                                &agent.id,
                                &mut inventory.tools,
                                &mut parse_warnings,
                                &checksums,
                            ) {
                                Ok(_) => {
                                    if let (Some(store), Some(r_id)) = (&store_opt, global_root_id) {
                                        for t in &inventory.tools[initial_tools_count..] {
                                            let t_path = format!("{}:{}", canonicalize_asset_path(Path::new(&t.config_path), &mut parse_warnings), t.name);
                                            let _ = store.upsert_asset(
                                                r_id, tool_engine_id, "tool", "global", &t.name, &t_path, None, None, "ok", None, now, now
                                            );
                                        }
                                    }
                                }
                                Err(err_msg) => {
                                    if let (Some(store), Some(r_id)) = (&store_opt, global_root_id) {
                                        let _ = store.upsert_asset(
                                            r_id, tool_engine_id, "tool", "global", filename, &canon_path, None, None, "failed", Some(&err_msg), now, now
                                        );
                                    }
                                }
                            }
                        }

                        // 2. Global Rules
                        if RULE_FILENAMES.contains(&filename) {
                            if let Ok(content) = fs::read_to_string(&path) {
                                let (drifted, is_sym, warning, source_path) = check_asset_drift(&path, &checksums);
                                if let Some(w) = warning {
                                    parse_warnings.push(w);
                                }
                                let path_str = path.to_string_lossy().to_string();
                                let link_state = if drifted == Some(true) { Some(crate::domain::LinkState::Drifted) } else if is_sym == Some(true) || source_path.is_some() { Some(crate::domain::LinkState::Linked) } else { None };
                                inventory.rules.push(Rule {
                                    id: path_str.clone(),
                                    name: filename.to_string(),
                                    path: path_str.clone(),
                                    content,
                                    scope: Some(Scope::Global {
                                        agent: agent.id.clone(),
                                    }),
                                    drifted,
                                    is_symlink: is_sym,
                                    source_path,
                                    parse_status: Some("ok".to_string()),
                                    parse_error: None,
                                    link_state,
                                });
                                if let (Some(store), Some(r_id)) = (&store_opt, global_root_id) {
                                    let canon_p = canonicalize_asset_path(&path, &mut parse_warnings);
                                    let _ = store.upsert_asset(
                                        r_id, Some(engine_id), "rule", "global", filename, &canon_p, None, None, "ok", None, now, now
                                    );
                                }
                            }
                        }
                    }
                } else {
                    global_has_skips = true;
                }

                // 3. Global Skills under skills/ folder
                let skills_path = g_path_buf.join("skills");
                let skills_shared = shared_agents_container(&skills_path).is_some();
                if skills_shared {
                    ensure_shared_root(&store_opt, &mut shared_agents_root_id);
                }
                if skills_path.exists() && skills_path.is_dir() {
                    let walker = WalkBuilder::new(&skills_path)
                        .hidden(false)
                        .git_ignore(true)
                        .build();
                    for entry in walker {
                        let entry = match entry {
                            Ok(e) => e,
                            Err(_) => {
                                global_has_skips = true;
                                continue;
                            }
                        };
                        let path = entry.path();
                        let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                        if filename == "SKILL.md" {
                            if let Ok(content) = fs::read_to_string(path) {
                                let parent_dir = path.parent().unwrap_or(&skills_path);
                                let parent_dir_str = parent_dir.to_string_lossy().to_string();
                                let parent_dir_canon = canonicalize_asset_path(parent_dir, &mut parse_warnings);
                                if let Ok(fm) = parse_skill_frontmatter(&content) {
                                    let (drifted, is_sym, warning, source_path) = check_asset_drift(parent_dir, &checksums);
                                    if let Some(w) = warning {
                                        parse_warnings.push(w);
                                    }
                                    let link_state = if drifted == Some(true) { Some(crate::domain::LinkState::Drifted) } else if is_sym == Some(true) || source_path.is_some() { Some(crate::domain::LinkState::Linked) } else { None };
                                    // Shared ~/.agents skills: canonical path as identity,
                                    // empty agent (renders "Any agent"), one inventory row
                                    // no matter how many engines link the container.
                                    let (skill_identity, skill_agent) = if skills_shared {
                                        (parent_dir_canon.clone(), String::new())
                                    } else {
                                        (parent_dir_str.clone(), agent.id.clone())
                                    };
                                    let already_present = skills_shared
                                        && inventory.skills.iter().any(|s| s.id == skill_identity);
                                    if !already_present {
                                        inventory.skills.push(Skill {
                                            id: skill_identity.clone(),
                                            name: fm.name.clone(),
                                            description: fm.description,
                                            version: fm.version.clone().unwrap_or_else(|| "v0.0.0-draft".to_string()),
                                            path: skill_identity.clone(),
                                            source_origin: fm.source_origin,
                                            scope: Some(Scope::Global {
                                                agent: skill_agent,
                                            }),
                                            drifted,
                                            is_symlink: is_sym,
                                            source_path,
                                            parse_status: Some("ok".to_string()),
                                            parse_error: None,
                                            link_state,
                                        });
                                    }
                                    if let Some(store) = &store_opt {
                                        if skills_shared {
                                            if let Some(r_id) = shared_agents_root_id {
                                                let _ = store.upsert_asset(
                                                    r_id, None, "skill", "global", &fm.name, &parent_dir_canon, fm.version.as_deref(), None, "ok", None, now, now
                                                );
                                            }
                                        } else if let Some(r_id) = global_root_id {
                                            let skill_engine_id = engine_db_ids.get(get_engine_key(&agent.id)).copied();
                                            let _ = store.upsert_asset(
                                                r_id, skill_engine_id, "skill", "global", &fm.name, &parent_dir_canon, fm.version.as_deref(), None, "ok", None, now, now
                                            );
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                // 4. Global Subagents
                let mut agent_subagent_paths = Vec::new();
                agent_subagent_paths.push(g_path_buf.join("agents"));
                
                if agent.id == "gemini" {
                    let home = get_home_dir();
                    let p1 = home.join(".gemini/agents");
                    if !agent_subagent_paths.contains(&p1) {
                        agent_subagent_paths.push(p1);
                    }
                    let p2 = home.join(".gemini/config/agents");
                    if !agent_subagent_paths.contains(&p2) {
                        agent_subagent_paths.push(p2);
                    }
                    
                    let plugins_dir = home.join(".gemini/config/plugins");
                    if plugins_dir.exists() && plugins_dir.is_dir() {
                        if let Ok(entries) = fs::read_dir(plugins_dir) {
                            for entry in entries.flatten() {
                                let path = entry.path();
                                if path.is_dir() {
                                    let p = path.join("agents");
                                    if !agent_subagent_paths.contains(&p) {
                                        agent_subagent_paths.push(p);
                                    }
                                }
                            }
                        }
                    }
                }

                for subagents_path in agent_subagent_paths {
                    let subagents_shared = shared_agents_container(&subagents_path).is_some();
                    if subagents_shared {
                        ensure_shared_root(&store_opt, &mut shared_agents_root_id);
                    }
                    if subagents_path.exists() && subagents_path.is_dir() {
                        let walker = WalkBuilder::new(&subagents_path)
                            .hidden(false)
                            .git_ignore(true)
                            .build();
                        for entry in walker {
                            let entry = match entry {
                                Ok(e) => e,
                                Err(_) => {
                                    global_has_skips = true;
                                    continue;
                                }
                            };
                            let path = entry.path();
                            let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                            if filename.ends_with(".md") {
                                if let Ok(content) = fs::read_to_string(path) {
                                    let path_str = path.to_string_lossy().to_string();
                                    let path_canon = canonicalize_asset_path(path, &mut parse_warnings);
                                    // Shared ~/.agents subagents: canonical identity, empty
                                    // agent ("Any agent"), one row across linking engines.
                                    let (sub_identity, sub_agent) = if subagents_shared {
                                        (path_canon.clone(), String::new())
                                    } else {
                                        (path_str.clone(), agent.id.clone())
                                    };
                                    let already_present = subagents_shared
                                        && inventory.subagents.iter().any(|sa| sa.id == sub_identity);
                                    match parse_subagent_frontmatter(&content) {
                                        Ok(fm) => {
                                            if !already_present {
                                                inventory.subagents.push(Subagent {
                                                    id: sub_identity.clone(),
                                                    name: fm.name.clone(),
                                                    description: fm.description,
                                                    path: sub_identity.clone(),
                                                    declared_tools: fm.tools.unwrap_or_default(),
                                                    scope: Some(Scope::Global {
                                                        agent: sub_agent,
                                                    }),
                                                    source_path: None,
                                                    parse_status: Some("ok".to_string()),
                                                    parse_error: None,
                                                    link_state: None,
                                                });
                                            }
                                            if let Some(store) = &store_opt {
                                                if subagents_shared {
                                                    if let Some(r_id) = shared_agents_root_id {
                                                        let _ = store.upsert_asset(
                                                            r_id, None, "subagent", "global", &fm.name, &path_canon, None, None, "ok", None, now, now
                                                        );
                                                    }
                                                } else if let Some(r_id) = global_root_id {
                                                    let _ = store.upsert_asset(
                                                        r_id, Some(engine_id), "subagent", "global", &fm.name, &path_canon, None, None, "ok", None, now, now
                                                    );
                                                }
                                            }
                                        }
                                        Err(e) => {
                                            parse_warnings.push(format!(
                                                "Failed to parse subagent frontmatter at {}: {}",
                                                path_str, e
                                            ));
                                            if !already_present {
                                                inventory.subagents.push(Subagent {
                                                    id: sub_identity.clone(),
                                                    name: filename.to_string(),
                                                    description: String::new(),
                                                    path: sub_identity.clone(),
                                                    declared_tools: Vec::new(),
                                                    scope: Some(Scope::Global {
                                                        agent: sub_agent,
                                                    }),
                                                    source_path: None,
                                                    parse_status: Some("failed".to_string()),
                                                    parse_error: Some(e.clone()),
                                                    link_state: Some(crate::domain::LinkState::Broken),
                                                });
                                            }
                                            if let Some(store) = &store_opt {
                                                if subagents_shared {
                                                    if let Some(r_id) = shared_agents_root_id {
                                                        let _ = store.upsert_asset(
                                                            r_id, None, "subagent", "global", filename, &path_canon, None, None, "failed", Some(&e), now, now
                                                        );
                                                    }
                                                } else if let Some(r_id) = global_root_id {
                                                    let _ = store.upsert_asset(
                                                        r_id, Some(engine_id), "subagent", "global", filename, &path_str, None, None, "failed", Some(&e), now, now
                                                    );
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                if let (Some(store), Some(g_id)) = (&store_opt, global_root_id) {
                    if !global_has_skips {
                        let _ = store.reap_stale_assets(g_id, now);
                    } else {
                        parse_warnings.push(format!("Reap skipped for global root {}: walk contained skipped or unreadable entries", agent.name));
                    }
                }
            }
        }

        // Return early if project path does not exist
        if !root.exists() || root.as_os_str().is_empty() {
            return Ok(inventory);
        }

        let mut found_rules = Vec::new();
        let mut found_tools = Vec::new();

        let mut project_has_skips = false;

        // Check if this root triggers the broad-root guardrail
        let is_broad = is_broad_root(root);
        if is_broad {
            project_has_skips = true;
            parse_warnings.push("Scan depth capped at 6 levels for broad root directory. Deeper folders skipped.".to_string());
        }

        let walker = WalkBuilder::new(root)
            .hidden(false)
            .git_ignore(true)
            .build();

        let project_path_abs = fs::canonicalize(root)
            .unwrap_or_else(|_| root.to_path_buf())
            .to_string_lossy()
            .to_string();

        let project_label = root
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("project")
            .to_string();

        let project_root_id = store_opt.as_ref().and_then(|s| {
            s.upsert_root("project", &project_path_abs, None, &project_label, now).ok()
        });

        let mut files_visited = 0;
        let mut dirs_visited = 0;

        // Repository candidates beneath this root, collected as the walk passes
        // through. The root never lists itself: it is already the linked root.
        let mut nested_repo_candidates: Vec<String> = Vec::new();
        let mut nested_candidate_set = std::collections::HashSet::new();

        for entry in walker {
            // Check cancellation token first
            if self.cancellation_token.load(Ordering::SeqCst) {
                return Ok(inventory);
            }

            let entry = match entry {
                Ok(e) => e,
                Err(e) => {
                    project_has_skips = true;
                    let err_str = e.to_string();
                    if err_str.contains("Permission denied") || err_str.contains("permission denied") {
                        parse_warnings.push(format!("Permission denied: {}", root.to_string_lossy()));
                    }
                    continue;
                }
            };

            let path = entry.path();

            // Apply EXCLUSION LIST rules
            if is_excluded(path) {
                continue;
            }

            // Exclude fixtures/ directories found beneath the project scan root
            if let Ok(rel) = path.strip_prefix(root) {
                if rel.components().any(|c| c.as_os_str() == "fixtures") {
                    continue;
                }
            }

            // Apply broad-root depth limit check (cap at 6 levels, exempting recognised agent directories)
            if is_broad {
                if let Ok(rel) = path.strip_prefix(root) {
                    if rel.components().count() > 6 {
                        let is_agent_dir = rel.components().any(|c| {
                            let s = c.as_os_str().to_string_lossy();
                            s == ".agents" || s == ".claude" || s == ".gemini" || s == ".codex"
                        });
                        if !is_agent_dir {
                            project_has_skips = true;
                            continue;
                        }
                    }
                }
            }

            let path_str = path.to_string_lossy().to_string();

            if path.is_dir() {
                dirs_visited += 1;
                on_progress(dirs_visited, files_visited, &path_str);

                if qualifies_as_repo(path) {
                    let abs = fs::canonicalize(path)
                        .unwrap_or_else(|_| path.to_path_buf())
                        .to_string_lossy()
                        .to_string();
                    if abs != project_path_abs && nested_candidate_set.insert(abs.clone()) {
                        nested_repo_candidates.push(abs);
                    }
                }

                continue;
            }

            files_visited += 1;
            on_progress(dirs_visited, files_visited, &path_str);

            let filename = match path.file_name().and_then(|n| n.to_str()) {
                Some(f) => f,
                None => continue,
            };

            if RULE_FILENAMES.contains(&filename) {
                found_rules.push(path.to_path_buf());
            }

            if filename == "SKILL.md" {
                if has_parent_skill(path, root) {
                    continue;
                }
                if let Ok(content) = fs::read_to_string(path) {
                    let parent_dir = path.parent().unwrap_or(root);
                    let parent_dir_str = parent_dir.to_string_lossy().to_string();

                    let skill_engine_id = if parent_dir_str.contains("/.claude/") {
                        engine_db_ids.get("claude_code").copied()
                    } else if parent_dir_str.contains("/.codex/") {
                        engine_db_ids.get("codex").copied()
                    } else if parent_dir_str.contains("/.gemini/") {
                        engine_db_ids.get("gemini").copied()
                    } else {
                        None
                    };

                    match parse_skill_frontmatter(&content) {
                        Ok(fm) => {
                            let (drifted, is_sym, warning, source_path) = check_asset_drift(parent_dir, &checksums);
                            if let Some(w) = warning {
                                parse_warnings.push(w);
                            }
                            let link_state = if drifted == Some(true) { Some(crate::domain::LinkState::Drifted) } else if is_sym == Some(true) || source_path.is_some() { Some(crate::domain::LinkState::Linked) } else { None };
                            inventory.skills.push(Skill {
                                id: parent_dir_str.clone(),
                                name: fm.name.clone(),
                                description: fm.description,
                                version: fm.version.clone().unwrap_or_else(|| "v0.0.0-draft".to_string()),
                                path: parent_dir_str.clone(),
                                source_origin: fm.source_origin,
                                scope: Some(Scope::Project {
                                    agent: "".to_string(),
                                    root: project_path_abs.clone(),
                                }),
                                drifted,
                                is_symlink: is_sym,
                                source_path,
                                parse_status: Some("ok".to_string()),
                                parse_error: None,
                                link_state,
                            });
                            if let (Some(store), Some(r_id)) = (&store_opt, project_root_id) {
                                let parent_dir_canon = canonicalize_asset_path(parent_dir, &mut parse_warnings);
                                let _ = store.upsert_asset(
                                    r_id, skill_engine_id, "skill", "project", &fm.name, &parent_dir_canon, fm.version.as_deref(), None, "ok", None, now, now
                                );
                            }
                        }
                        Err(e) => {
                            parse_warnings.push(format!(
                                "Failed to parse skill frontmatter at {}: {}",
                                path_str, e
                            ));
                            let parent_dir_canon = canonicalize_asset_path(parent_dir, &mut parse_warnings);
                            inventory.skills.push(Skill {
                                id: parent_dir_str.clone(),
                                name: filename.to_string(),
                                description: String::new(),
                                version: "v0.0.0-draft".to_string(),
                                path: parent_dir_str.clone(),
                                source_origin: None,
                                scope: Some(Scope::Project {
                                    agent: "".to_string(),
                                    root: project_path_abs.clone(),
                                }),
                                drifted: None,
                                is_symlink: None,
                                source_path: None,
                                parse_status: Some("failed".to_string()),
                                parse_error: Some(e.clone()),
                                link_state: Some(crate::domain::LinkState::Broken),
                            });
                            if let (Some(store), Some(r_id)) = (&store_opt, project_root_id) {
                                let _ = store.upsert_asset(
                                    r_id, skill_engine_id, "skill", "project", filename, &parent_dir_canon, None, None, "failed", Some(&e), now, now
                                );
                            }
                        }
                    }
                }
            }

            if is_tool_config_file(filename) {
                found_tools.push(path.to_path_buf());
            }

            let is_subagent = if filename.ends_with(".md") {
                let path_str = path.to_string_lossy().to_string();
                if path_str.contains("/.claude/agents/") {
                    Some("claude-code")
                } else if path_str.contains("/.codex/agents/") {
                    Some("codex")
                } else if path_str.contains("/.agents/") && !path_str.contains("/.agents/skills/") {
                    let parent = path.parent();
                    let parent_name = parent.and_then(|p| p.file_name()).and_then(|n| n.to_str());
                    if parent_name == Some(".agents") || parent_name == Some("agents") {
                        Some("gemini")
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            };

            if let Some(agent_id) = is_subagent {
                if let Ok(content) = fs::read_to_string(path) {
                    let subagent_engine_key = get_engine_key(agent_id);
                    let subagent_engine_id = engine_db_ids.get(subagent_engine_key).copied();
                    match parse_subagent_frontmatter(&content) {
                        Ok(fm) => {
                            let (_, _, _, source_path) = check_asset_drift(path, &checksums);
                            let link_state = if source_path.is_some() { Some(crate::domain::LinkState::Linked) } else { None };
                            inventory.subagents.push(Subagent {
                                id: path_str.clone(),
                                name: fm.name.clone(),
                                description: fm.description,
                                path: path_str.clone(),
                                declared_tools: fm.tools.unwrap_or_default(),
                                scope: Some(Scope::Project {
                                    agent: agent_id.to_string(),
                                    root: project_path_abs.clone(),
                                }),
                                source_path,
                                parse_status: Some("ok".to_string()),
                                parse_error: None,
                                link_state,
                            });
                            if let (Some(store), Some(r_id)) = (&store_opt, project_root_id) {
                                let sub_path_canon = canonicalize_asset_path(path, &mut parse_warnings);
                                let _ = store.upsert_asset(
                                    r_id, subagent_engine_id, "subagent", "project", &fm.name, &sub_path_canon, None, None, "ok", None, now, now
                                );
                            }
                        }
                        Err(e) => {
                            parse_warnings.push(format!(
                                "Failed to parse subagent frontmatter at {}: {}",
                                path_str, e
                            ));
                            let sub_path_canon = canonicalize_asset_path(path, &mut parse_warnings);
                            inventory.subagents.push(Subagent {
                                id: path_str.clone(),
                                name: filename.to_string(),
                                description: String::new(),
                                path: path_str.clone(),
                                declared_tools: Vec::new(),
                                scope: Some(Scope::Project {
                                    agent: agent_id.to_string(),
                                    root: project_path_abs.clone(),
                                }),
                                source_path: None,
                                parse_status: Some("failed".to_string()),
                                parse_error: Some(e.clone()),
                                link_state: Some(crate::domain::LinkState::Broken),
                            });
                            if let (Some(store), Some(r_id)) = (&store_opt, project_root_id) {
                                let _ = store.upsert_asset(
                                    r_id, subagent_engine_id, "subagent", "project", filename, &sub_path_canon, None, None, "failed", Some(&e), now, now
                                );
                            }
                        }
                    }
                }
            }
        }

        // Global agents were scanned before the existence check

        for tool_path in found_tools {
            let mut owning_agent = String::new();
            let path_str = tool_path.to_string_lossy().to_string();
            let tool_filename = tool_path.file_name().and_then(|n| n.to_str()).unwrap_or("");

            for config in AGENT_CONFIGS {
                let pattern = format!("/{}/", config.footprint_dir);
                if path_str.contains(&pattern) {
                    owning_agent = config.name.to_string();
                    break;
                }
            }

            let scope = Scope::Project {
                agent: owning_agent.clone(),
                root: project_path_abs.clone(),
            };
            let initial_tools_count = inventory.tools.len();
            let tool_engine_id = if tool_filename == "mcp.json" {
                None // MCP server definitions (mcp.json) are engine-agnostic shared standards
            } else if path_str.contains("/.claude/") {
                engine_db_ids.get("claude_code").copied()
            } else if path_str.contains("/.codex/") {
                engine_db_ids.get("codex").copied()
            } else if path_str.contains("/.gemini/") {
                engine_db_ids.get("gemini").copied()
            } else {
                None
            };

            match parse_and_append_tools(
                &tool_path,
                scope.clone(),
                &owning_agent,
                &mut inventory.tools,
                &mut parse_warnings,
                &checksums,
            ) {
                Ok(_) => {
                    if let (Some(store), Some(r_id)) = (&store_opt, project_root_id) {
                        for t in &inventory.tools[initial_tools_count..] {
                            let t_canon = format!("{}:{}", canonicalize_asset_path(Path::new(&t.config_path), &mut parse_warnings), t.name);
                            let _ = store.upsert_asset(
                                r_id, tool_engine_id, "tool", "project", &t.name, &t_canon, None, None, "ok", None, now, now
                            );
                        }
                    }
                }
                Err(err_msg) => {
                    let t_canon = canonicalize_asset_path(&tool_path, &mut parse_warnings);
                    inventory.tools.push(Tool {
                        id: t_canon.clone(),
                        name: tool_filename.to_string(),
                        command: String::new(),
                        transport: String::new(),
                        config_path: t_canon.clone(),
                        scope: scope.clone(),
                        owning_agent: owning_agent.clone(),
                        drifted: None,
                        is_symlink: None,
                        source_path: None,
                        parse_status: Some("failed".to_string()),
                        parse_error: Some(err_msg.clone()),
                        link_state: Some(crate::domain::LinkState::Broken),
                    });
                    if let (Some(store), Some(r_id)) = (&store_opt, project_root_id) {
                        let _ = store.upsert_asset(
                            r_id, tool_engine_id, "tool", "project", tool_filename, &t_canon, None, None, "failed", Some(&err_msg), now, now
                        );
                    }
                }
            }
        }

        let mut rule_chains: std::collections::HashMap<String, Vec<String>> =
            std::collections::HashMap::new();
        let mut is_layered = false;

        for r_path in &found_rules {
            let fname = r_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap()
                .to_string();
            let abs_path = fs::canonicalize(r_path)
                .unwrap_or_else(|_| r_path.clone())
                .to_string_lossy()
                .to_string();

            rule_chains.entry(fname).or_default().push(abs_path);
        }

        for (family, chain) in &mut rule_chains {
            chain.sort_by_key(|p| Path::new(p).components().count());
            if chain.len() > 1 {
                is_layered = true;
            }

            for p_str in chain.iter() {
                if let Ok(content) = fs::read_to_string(p_str) {
                    let name = Path::new(p_str)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or(family)
                        .to_string();
                    if !inventory.rules.iter().any(|r| &r.path == p_str) {
                        let (drifted, is_sym, warning, source_path) = check_asset_drift(Path::new(p_str), &checksums);
                        if let Some(w) = warning {
                            parse_warnings.push(w);
                        }
                        let link_state = if drifted == Some(true) { Some(crate::domain::LinkState::Drifted) } else if is_sym == Some(true) || source_path.is_some() { Some(crate::domain::LinkState::Linked) } else { None };
                        inventory.rules.push(Rule {
                            id: p_str.clone(),
                            name: name.clone(),
                            path: p_str.clone(),
                            content,
                            scope: Some(Scope::Project {
                                agent: "".to_string(),
                                root: project_path_abs.clone(),
                            }),
                            drifted,
                            is_symlink: is_sym,
                            source_path,
                            parse_status: Some("ok".to_string()),
                            parse_error: None,
                            link_state,
                        });
                        let rule_engine_id = if name.contains(".cursor") {
                            store_opt.as_ref().and_then(|s| s.upsert_engine("cursor", "Cursor", "", now).ok())
                        } else if name.contains("copilot") {
                            store_opt.as_ref().and_then(|s| s.upsert_engine("copilot", "GitHub Copilot", "", now).ok())
                        } else {
                            None
                        };
                        if let (Some(store), Some(r_id)) = (&store_opt, project_root_id) {
                            let rule_canon = canonicalize_asset_path(Path::new(p_str), &mut parse_warnings);
                            let _ = store.upsert_asset(
                                r_id, rule_engine_id, "rule", "project", &name, &rule_canon, None, None, "ok", None, now, now
                            );
                        }
                    }
                }
            }
        }

        // Pass 2: Link state resolution over links table and reap
        if let Some(store) = &store_opt {
            if let Some(p_id) = project_root_id {
                if !project_has_skips {
                    let _ = store.reap_stale_assets(p_id, now);
                } else {
                    parse_warnings.push(format!("Reap skipped for project root {}: walk contained skipped or unreadable entries", project_label));
                }
            }
            resolve_pass_2_links(store, &self.cancellation_token, now);
        }

        inventory.project_scans.push(ProjectScan {
            path: project_path_abs,
            layered: is_layered,
            rule_chains,
            parse_warnings: parse_warnings.into_iter().map(|w| crate::preferences::sanitise_msg(&w)).collect(),
            nested_repo_candidates,
        });

        Ok(inventory)
    }
}

fn resolve_pass_2_links(
    store: &crate::preferences::PreferencesStore,
    cancellation_token: &std::sync::atomic::AtomicBool,
    now: i64,
) {
    use std::sync::atomic::Ordering;
    if cancellation_token.load(Ordering::SeqCst) {
        return;
    }

    let _status_guard = crate::scan::status::acquire_scan_lock(Path::new("links"), crate::scan::status::ScanPhase::Resolving);

    let hydrated_links = match store.get_hydrated_links() {
        Ok(links) => links,
        Err(_) => return,
    };

    for link in hydrated_links {
        if cancellation_token.load(Ordering::SeqCst) {
            break;
        }

        let dest_path = Path::new(&link.dest_path);
        let dest_exists = dest_path.exists() || dest_path.is_symlink();
        let symlink_target = fs::read_link(dest_path).ok();

        let source_path = Path::new(&link.source_path);
        let source_hash_now = if source_path.exists() {
            if let Ok(content) = fs::read(source_path) {
                Some(blake3::hash(&content).to_hex().to_string())
            } else {
                None
            }
        } else {
            None
        };

        let dest_hash = if dest_exists && dest_path.is_file() && !dest_path.is_symlink() {
            if let Ok(content) = fs::read(dest_path) {
                Some(blake3::hash(&content).to_hex().to_string())
            } else {
                None
            }
        } else {
            None
        };

        let _resolved_state = crate::domain::resolve_state(
            &link,
            source_hash_now.as_deref(),
            dest_exists,
            symlink_target.as_deref(),
        );

        let _ = store.update_link_state(link.id, dest_hash.as_deref(), now);
    }
}

pub fn split_rule_sections(content: &str) -> Vec<crate::domain::RuleSection> {
    let mut sections = Vec::new();
    let mut current_heading = None;
    let mut current_level = 0;
    let mut current_body = Vec::new();

    for line in content.lines() {
        if line.starts_with('#') {
            let trimmed = line.trim_start_matches('#');
            let level = line.len() - trimmed.len();
            let next_char = trimmed.chars().next();
            if next_char.is_none() || next_char == Some(' ') {
                if !current_body.is_empty() || current_heading.is_some() {
                    sections.push(crate::domain::RuleSection {
                        heading: current_heading.clone(),
                        heading_level: current_level,
                        content: current_body.join("\n"),
                    });
                    current_body.clear();
                }
                current_heading = Some(trimmed.trim().to_string());
                current_level = level;
            }
        }
        current_body.push(line.to_string());
    }

    if !current_body.is_empty() || current_heading.is_some() {
        sections.push(crate::domain::RuleSection {
            heading: current_heading,
            heading_level: current_level,
            content: current_body.join("\n"),
        });
    }

    sections
}
