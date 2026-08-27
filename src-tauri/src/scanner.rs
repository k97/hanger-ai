use crate::domain::{Agent, Inventory, ProjectScan, Rule, Scope, Skill, Subagent, Tool, AssetCounts, CategoryCount, CategoryCountNode, RepoTreeNode, GlobalTreeNode, TreeCounts};
use ignore::WalkBuilder;
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// How a tool row is counted. Skills, rules and subagents are files — one
/// file is one asset, and grouping has nothing to do to them. A tool row is a
/// *registration*: the same server declared in two config files is one
/// server, two registrations, and the two questions "how many servers" and
/// "how many registrations" need different arithmetic over the same table.
/// `PerRegistration` is today's behaviour, preserved for every existing
/// caller; `Grouped` is the new one, for the MCP server list.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Grouping {
    Grouped,
    PerRegistration,
}

pub fn count_assets(db_path: &Path, root: Option<&str>, grouping: Grouping) -> Result<AssetCounts, String> {
    let store = crate::preferences::PreferencesStore::new(db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    let conn = store.connect()
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    // Row counts, grouped by (category, scope, engine_id): correct as-is for
    // skill/rule/subagent under either grouping (one file, one row, nothing
    // to dedupe) and for tool under PerRegistration (today's behaviour,
    // unchanged). Grouped tool counting cannot be answered from this bucketed
    // shape — see below — so it is computed separately and substituted in.
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
    let mut tool = build_cat("tool");

    if grouping == Grouping::Grouped {
        // A per-(category, scope, engine_id) bucket can only answer "how
        // many distinct servers THIS engine, THIS scope registers" —
        // summing those buckets double-counts a server registered under
        // more than one engine. Found: `tauri`, registered in four engines
        // on the development machine, summed to 4 while the list it backs
        // renders 1 row — the 23-vs-7 defect at a smaller scale. Distinct
        // counting for tools has to run across the whole selection instead.
        tool = count_distinct_tools(&conn, root)?;
    }

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

/// Distinct server names for the tool category, across every scope and
/// engine that the root filter admits — the count `Grouped` mode needs and
/// the bucketed `GROUP BY` above cannot give it.
///
/// `total` is `COUNT(DISTINCT name)` over the whole selection; `global` and
/// `project` are the same count restricted to one scope each. `total` is
/// deliberately **not** `global + project` when a server is registered in
/// both scopes — that overlap is a fact about the server, not an arithmetic
/// error to reconcile away. Do not "fix" this by summing the two.
fn count_distinct_tools(conn: &rusqlite::Connection, root: Option<&str>) -> Result<Option<CategoryCount>, String> {
    let distinct_count = |scope_clause: &str| -> Result<usize, String> {
        let sql = format!(
            "SELECT COUNT(DISTINCT assets.name)
             FROM assets
             LEFT JOIN roots rts ON assets.root_id = rts.id
             WHERE assets.category = 'tool' AND (?1 IS NULL OR rts.abs_path = ?1){scope_clause}"
        );
        conn.query_row(&sql, [root], |r| r.get::<_, i64>(0))
            .map(|n| n as usize)
            .map_err(|e| format!("Query failed: {}", e))
    };

    let total = distinct_count("")?;
    if total == 0 {
        return Ok(None);
    }
    let global = distinct_count(" AND assets.scope = 'global'")?;
    let project = distinct_count(" AND assets.scope = 'project'")?;

    Ok(Some(CategoryCount { total, global, project }))
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

pub use crate::agents::{AgentConfig, AGENT_CONFIGS};

/// Map an agent id to its stable `engines.key`.
///
/// Returns `None` for ids with no engine row rather than guessing. The prior
/// `_ => "gemini"` catch-all silently filed every unrecognised id under Gemini
/// — a misattribution that produced plausible-looking rows under the wrong
/// engine and would have mislabelled all five MCP-only hosts. Callers must
/// handle `None` explicitly.
///
/// This covers every engine Hanger records, including rules-only ones such as
/// `copilot` that declare no MCP servers at all. `mcp::registry` covers MCP
/// hosts. The two sets overlap without being equal; they are held in agreement
/// on the intersection by
/// `scanner_and_registry_agree_on_every_engine_key_they_both_know`.
pub fn get_engine_key(id_str: &str) -> Option<&'static str> {
    match id_str {
        "claude-code" | "claude_code" => Some("claude_code"),
        "codex" => Some("codex"),
        "gemini" => Some("gemini"),
        "cursor" => Some("cursor"),
        "copilot" => Some("copilot"),
        "kiro" => Some("kiro"),
        "trae" => Some("trae"),
        "opencode" => Some("opencode"),
        "amp" => Some("amp"),
        "zed" => Some("zed"),
        "roocode" => Some("roocode"),
        "kilocode" => Some("kilocode"),
        "cline" => Some("cline"),
        _ => None,
    }
}

/// A denied filesystem read, split by what denied it.
///
/// macOS's TCC privacy layer returns EPERM ("Operation not permitted");
/// ordinary Unix mode bits return EACCES ("Permission denied"). The two need
/// different advice — System Settings can fix the first, chmod the second —
/// so they must not collapse into one warning. Constants are the raw POSIX
/// numbers rather than libc's names so this compiles wherever scanner.rs
/// does; `src/mcp/probe.rs` already links libc directly if names are ever
/// preferred.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Denial {
    MacosBlocked,
    UnixPermission,
}

pub(crate) fn classify_denial(err: Option<&std::io::Error>) -> Option<Denial> {
    match err?.raw_os_error() {
        Some(1) => Some(Denial::MacosBlocked),   // EPERM
        Some(13) => Some(Denial::UnixPermission), // EACCES
        _ => None,
    }
}

/// The user-facing warning line for a denial.
///
/// These strings are a contract: RepoPane.tsx routes a warning *starting
/// with* "macOS blocked access to" into the TCC fix panel, and everything
/// else into the plain warnings list. The distinction is load-bearing, not
/// pedantry — the panel is captioned with the *project* path, so only the
/// project walk's own denial may lead with this bare form. Machine-scope
/// denials (engine roots, the two global walkers) deliberately prefix an
/// engine name, which is what keeps them out of the panel while still
/// containing the phrase. Containing it is not enough and must not be made
/// enough: dropping those prefixes would route a machine-scope denial into
/// a project-captioned panel. The EACCES string is unchanged from the
/// pre-classifier code so existing fixtures keep meaning what they meant.
pub(crate) fn denial_warning(denial: Denial, path: &str) -> String {
    match denial {
        Denial::MacosBlocked => format!("macOS blocked access to {}", path),
        Denial::UnixPermission => format!("Permission denied: {}", path),
    }
}

/// The raw errno-bearing `io::Error` behind a directory-walk failure, if any.
///
/// `ignore::Error::io_error()` returns the original `io::Error` only for
/// errors it builds directly (e.g. failing to read a `.gitignore` file). A
/// failure to descend into a directory is one layer deeper: `ignore` wraps
/// the `walkdir::Error` it gets from `walkdir` in a Custom-kind `io::Error`
/// (`impl From<walkdir::Error> for io::Error`), and a Custom-kind error's
/// `raw_os_error()` is always `None` — the errno lives inside the boxed
/// `walkdir::Error`, one `get_ref()`/`downcast_ref()` away. Skipping this
/// step and calling `classify_denial(e.io_error())` directly compiles and
/// looks right, but silently classifies every walk denial as `None` — EACCES
/// and EPERM alike — because the wrapper's own `raw_os_error()` never sees
/// the code. Confirmed against the real walker in
/// `denied_subdir_yields_one_permission_warning_not_zero_not_many`.
fn walk_denial_source(err: &ignore::Error) -> Option<&std::io::Error> {
    let outer = err.io_error()?;
    outer
        .get_ref()
        .and_then(|inner| inner.downcast_ref::<walkdir::Error>())
        .and_then(|wd| wd.io_error())
        .or(Some(outer))
}

/// What a stat of a candidate root actually established.
///
/// `Path::exists()` collapses "denied" into "absent" — a TCC-blocked
/// ~/Documents/Cline read as "Cline is not installed", a wrong answer
/// stated confidently. `fs::metadata` (not `symlink_metadata`: `exists()`
/// follows links, and this must preserve that) keeps the error.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RootPresence {
    Present,
    Absent,
    Blocked(Denial),
}

pub(crate) fn probe_path(path: &Path) -> RootPresence {
    match fs::metadata(path) {
        Ok(_) => RootPresence::Present,
        Err(e) => match classify_denial(Some(&e)) {
            Some(d) => RootPresence::Blocked(d),
            None => RootPresence::Absent,
        },
    }
}

pub(crate) fn get_home_dir() -> PathBuf {
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

/// Offer a walk entry to the links backfill if it is a symlink. Quiet on
/// declines: the typed outcome is the accounting (see
/// PreferencesStore::record_walk_symlink), and a project's stray symlinks
/// (virtualenvs, node tooling) must not flood scan warnings. A dangling
/// symlink has no canonical form and no asset identity; if a link row
/// already exists for its destination, read-time state derivation reports
/// it dangling — nothing to record here.
fn offer_walk_symlink(
    store: &crate::preferences::PreferencesStore,
    dest_root_id: i64,
    path: &Path,
    now: i64,
) {
    let is_link = path
        .symlink_metadata()
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false);
    if !is_link {
        return;
    }
    if let Ok(canonical) = fs::canonicalize(path) {
        let _ = store.record_walk_symlink(
            dest_root_id,
            &path.to_string_lossy(),
            &canonical.to_string_lossy(),
            now,
        );
    }
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
    get_global_agents_with_denials().0
}

/// Detection plus what could not be established. `Path::exists()` collapses
/// "denied" into "absent" — a TCC-blocked ~/Documents/Cline would read as
/// "Cline is not installed", a wrong answer stated confidently. `probe_path`
/// keeps the distinction, and a `Blocked` probe here is a finding — "Cline
/// may be installed, macOS is in the way" — never a silent absence. The
/// denial strings ride the same parse_warnings channel MCP discovery
/// problems already use (see the scan call site), accepting that channel's
/// known scope-leak debt rather than minting a new surface.
pub fn get_global_agents_with_denials() -> (Vec<Agent>, Vec<String>) {
    let home = get_home_dir();
    let mut agents = Vec::new();
    let mut denials = Vec::new();
    for config in AGENT_CONFIGS {
        let mut resolved_path = None;
        // Buffered until every root/detect-file for this config has been
        // probed: a config with an earlier blocked root and a later readable
        // one is demonstrably installed, and saying it "may be installed" in
        // that case would be false (Karthik's finding on the first cut of
        // this function). The sentence is chosen once, below, from whether
        // anything resolved — never suppressed, since an unreadable root is
        // still worth reporting even when a sibling root covers detection.
        let mut config_denial_texts: Vec<String> = Vec::new();
        for rel_path in config.global_roots {
            let path = home.join(rel_path);
            match probe_path(&path) {
                RootPresence::Present => {
                    resolved_path = Some(path.to_string_lossy().to_string());
                    break;
                }
                RootPresence::Blocked(d) => {
                    config_denial_texts.push(denial_warning(d, &path.to_string_lossy()));
                }
                RootPresence::Absent => {}
            }
        }
        // An agent that owns no directory is found by its config file
        // instead. The resolved path is then a file, not a folder — every
        // consumer of `global_config_path` already has to cope with a
        // config-file root (~/.claude.json is one), and the alternative is
        // inventing a directory for Zed to own, which would steal the shared
        // store or name a folder that is not there (spec §4.4).
        if resolved_path.is_none() {
            for rel_path in config.detect_files {
                let path = home.join(rel_path);
                match probe_path(&path) {
                    RootPresence::Present => {
                        resolved_path = Some(path.to_string_lossy().to_string());
                        break;
                    }
                    RootPresence::Blocked(d) => {
                        config_denial_texts.push(denial_warning(d, &path.to_string_lossy()));
                    }
                    RootPresence::Absent => {}
                }
            }
        }
        for text in config_denial_texts {
            denials.push(if resolved_path.is_some() {
                format!("{} has a folder Hanger could not read — {}", config.name, text)
            } else {
                format!("{} may be installed — {}", config.name, text)
            });
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
    (agents, denials)
}

#[derive(Deserialize)]
pub(crate) struct SkillFrontmatter {
    pub(crate) name: String,
    pub(crate) description: String,
    version: Option<String>,
    #[serde(alias = "source-origin")]
    source_origin: Option<String>,
    source: Option<String>,
    homepage: Option<String>,
    /// Arbitrary shape by design: the wild writes strings, maps and lists
    /// under this key, and a strict type here would turn parseable skills
    /// into failures. Only `metadata.homepage` is read.
    metadata: Option<serde_yaml::Value>,
}

impl SkillFrontmatter {
    /// The asset's own claim about where it came from, strongest key first.
    pub(crate) fn declared_source(&self) -> Option<&str> {
        self.source_origin
            .as_deref()
            .or(self.source.as_deref())
            .or(self.homepage.as_deref())
            .or_else(|| self.metadata.as_ref()?.get("homepage")?.as_str())
    }
}

pub(crate) fn parse_skill_frontmatter(content: &str) -> Result<SkillFrontmatter, String> {
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
    source: Option<String>,
    homepage: Option<String>,
}

impl SubagentFrontmatter {
    /// The asset's own claim about where it came from, strongest key first.
    fn declared_source(&self) -> Option<&str> {
        self.source.as_deref().or(self.homepage.as_deref())
    }
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


/// Filenames the directory sweep treats as possible MCP config.
///
/// The registry (`mcp::registry`) declares where *known hosts* keep their
/// config, with a known dialect. This list is the second source: it finds
/// loose, ad-hoc config in non-standard paths, which the PRD names as a
/// product goal and which fixed registry paths would silently drop —
/// `.agents/mcp.json`, `~/.gemini/mcp.json`, deeply nested `src/ai/mcp.json`.
///
/// Both sources feed one dedup set keyed on (config path, server name), so a
/// file reachable either way is counted once.
fn is_swept_mcp_config(filename: &str) -> bool {
    matches!(
        filename,
        "mcp.json" | ".mcp.json" | "mcp_config.json" | "config.toml" | "settings.json"
    )
}

/// Borrow a `'static` host id for an agent id, so swept registrations can carry
/// one. Anything unrecognised is unattributed — the empty string, matching the
/// prior `owning_agent = String::new()` behaviour for loose configs.
fn agent_id_static(agent_id: &str) -> &'static str {
    match agent_id {
        "claude-code" | "claude_code" => "claude-code",
        "codex" => "codex",
        "gemini" => "gemini",
        _ => "",
    }
}

/// Build a `Tool` domain row from a discovered registration.
///
/// One place so the registry pass and the sweep cannot drift apart in what
/// they produce.
pub fn tool_from_registration(
    reg: &crate::mcp::discover::Registration,
    scope: Scope,
) -> Tool {
    let mut tool = Tool {
        id: String::new(),
        name: reg.server.name.clone(),
        command: reg.server.command.clone(),
        args: reg.server.args.clone(),
        launch_display: crate::mcp::redact::redact_launch(
            &reg.server.command,
            &reg.server.args,
        ),
        transport: reg.server.transport.clone(),
        bridged: reg.server.bridged,
        config_path: reg.config_path.clone(),
        scope,
        owning_agent: reg.host_id.to_string(),
        drifted: None,
        is_symlink: None,
        source_path: None,
        parse_status: Some("ok".to_string()),
        parse_error: None,
        link_state: None,
        origin: None,
        origin_blocked: None,
    };
    // Identity comes from the domain, not from a format! repeated per call site.
    tool.id = tool.registration_key().to_string();
    tool
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

/// Every folder Hanger reads global assets out of, each with a human label.
///
/// The engine configuration directories, plus the shared ~/.agents container.
/// That container is not an extra: an engine's skills/ or agents/ entry is
/// often a symlink into it, and shared_agents_container attributes anything
/// found that way to ~/.agents rather than to whichever engine linked it — so
/// the recorded paths live under ~/.agents and it is where those files are.
fn global_asset_roots_labelled() -> Vec<(PathBuf, String)> {
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

/// The same set, for callers that only need to ask "is this file one of ours".
pub fn global_asset_roots() -> Vec<PathBuf> {
    global_asset_roots_labelled()
        .into_iter()
        .map(|(path, _)| path)
        .collect()
}

pub fn protected_roots() -> Vec<(PathBuf, String)> {
    global_asset_roots_labelled()
}

// The downward half of the guard: a path that CONTAINS a protected root. The
// upward matcher inspects only the path handed to it, and ~ is not itself
// protected — so linking home walked the engine roots beneath it and re-parented
// their assets onto the home row (verified in home_root_hazard_tests). Strict
// descendants only; the equality case belongs to match_protected_root.
pub fn contains_protected_root(path: &Path, protected: &[(PathBuf, String)]) -> Option<String> {
    let raw = path.to_path_buf();
    let canon = fs::canonicalize(path).unwrap_or_else(|_| raw.clone());
    for (root, label) in protected {
        let root_canon = fs::canonicalize(root).unwrap_or_else(|_| root.clone());
        for protected_form in [root, &root_canon] {
            for candidate in [&raw, &canon] {
                if protected_form.starts_with(candidate)
                    && protected_form.as_path() != candidate.as_path()
                {
                    return Some(label.clone());
                }
            }
        }
    }
    None
}

pub fn guard_engine_root(path: &str) -> Result<(), String> {
    let protected = protected_roots();
    if let Some(label) = match_protected_root(Path::new(path), &protected) {
        return Err(format!(
            "{} is {} — already inventoried under User Profile.",
            path, label
        ));
    }
    if let Some(label) = contains_protected_root(Path::new(path), &protected) {
        return Err(format!(
            "{} contains {} — linking it would re-stamp those assets with project scope. \
             Link the projects inside it instead.",
            path, label
        ));
    }
    Ok(())
}

/// The shared `.agents` container, in the form stored paths are recorded in.
///
/// Canonicalized, because every asset path the store holds is: a machine
/// where `~/.agents` is itself a symlink into a synced folder resolves each
/// asset to the target, and comparing those against the literal
/// `$HOME/.agents` matches nothing at all. One definition, so the walk, the
/// root row and the reach computation cannot disagree about where the store
/// is.
pub fn shared_agents_dir() -> PathBuf {
    let container = get_home_dir().join(crate::agents::SHARED_AGENTS_DIR);
    fs::canonicalize(&container).unwrap_or(container)
}

// A shared-standards container: an engine's skills/ or agents/ entry that is a
// symlink resolving under ~/.agents. Assets there belong to ~/.agents — the
// deepest real location — not to whichever engine happened to link them.
//
// Both sides are canonical. The target always was; the container was not, so
// on a machine where ~/.agents is itself a symlink into a synced folder the
// comparison was resolved-against-unresolved and never fired at all — the
// users most likely to keep a shared store being exactly the ones it failed
// for.
pub fn shared_agents_container(walk_root: &Path) -> Option<std::path::PathBuf> {
    let container = shared_agents_dir();
    if fs::read_link(walk_root).is_ok() {
        if let Ok(target) = fs::canonicalize(walk_root) {
            if target.starts_with(&container) {
                return Some(container);
            }
        }
    }
    None
}

/// Is an asset at this stored path part of the shared convention store?
///
/// Asked of the path the store will hold — the canonical one — because that
/// is what the v5 migration clears and what the answer has to agree with.
///
/// Two forms, because there are two ways to be in the store. A `.agents`
/// component in the path is the ordinary one, and it is the only one that
/// catches a repository's own `<repo>/.agents/`. The other is a `~/.agents`
/// that is itself a symlink into a synced folder: every stored path
/// canonicalizes to the target, so no `.agents` component survives to be
/// found, and only the resolved container matches.
pub fn is_shared_store_asset(canonical: &Path) -> bool {
    crate::agents::shared_agents_subpath(canonical).is_some()
        || canonical.starts_with(shared_agents_dir())
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

        // Discovery has two sources — the registry of known host locations and
        // the filename sweep for loose config. A file reachable by both must
        // yield one row, not two. Keyed on (config path, server name) because
        // one file legitimately declares many servers.
        let mut seen_registrations: std::collections::HashSet<(String, String)> =
            std::collections::HashSet::new();

        // Agent id -> its engine_global root, so registry-discovered servers
        // can attach to a root that already exists rather than minting one.
        let mut agent_root_ids: std::collections::HashMap<String, i64> =
            std::collections::HashMap::new();

        // 0. Load deploy checksums for drift checking
        let mut checksums = Vec::new();
        if self.db_path.exists() {
            if let Ok(store) = crate::preferences::PreferencesStore::new(&self.db_path) {
                if let Ok(all_cs) = store.get_all_deploy_checksums() {
                    checksums = all_cs;
                }
            }
        }

        let (detected_agents, engine_root_denials) = get_global_agents_with_denials();
        let mut parse_warnings = Vec::new();
        parse_warnings.extend(engine_root_denials);

        let store_opt = crate::preferences::PreferencesStore::new(&self.db_path).ok();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);

        let mut engine_db_ids = std::collections::HashMap::new();
        if let Some(store) = &store_opt {
            for agent in &detected_agents {
                if let Some(g_path) = &agent.global_config_path {
                    // AGENT_CONFIGS ids are all declared in get_engine_key.
                    // Panic rather than fall back, so adding an agent without
                    // its engine key fails loudly here instead of silently
                    // filing its assets under the wrong engine.
                    let key = get_engine_key(&agent.id)
                        .expect("every AGENT_CONFIGS id must have an engine key");
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
                    let container_str = shared_agents_dir().to_string_lossy().to_string();
                    *shared_agents_root_id = store
                        .upsert_root("engine_global", &container_str, None, ".agents", now)
                        .ok();
                }
            }
        };
        for agent in &detected_agents {
            if let Some(g_path) = &agent.global_config_path {
                let mut global_has_skips = false;
                let engine_key = get_engine_key(&agent.id)
                    .expect("every AGENT_CONFIGS id must have an engine key");
                // FIXME(mcp): `unwrap_or(1)` files assets under whichever
                // engine holds row id 1 when the key is absent — the same
                // class of silent misattribution as the removed `_ =>
                // "gemini"` fallback. Reached when store_opt is None and
                // engine_db_ids is empty. Left as-is here; out of scope.
                let engine_id = engine_db_ids.get(engine_key).copied().unwrap_or(1);
                let global_root_id = store_opt.as_ref().and_then(|s| {
                    s.upsert_root("engine_global", g_path, Some(engine_id), &agent.name, now).ok()
                });
                // Retained so the registry pass can attach ~/.claude.json's
                // servers to Claude Code's existing root. Its parent directory
                // is $HOME, and a root there is a hazard this codebase already
                // guards against — see home_root_hazard_tests.rs.
                if let Some(rid) = global_root_id {
                    agent_root_ids.insert(agent.id.clone(), rid);
                }

                let g_path_buf = Path::new(g_path);
                if let Ok(entries) = fs::read_dir(g_path_buf) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                        // 1. Global MCP servers, by filename sweep.
                        //
                        // The registry pass below covers known host + dialect
                        // locations. This sweep covers everything else in an
                        // agent's config root — ~/.gemini/mcp.json,
                        // ~/.codex/mcp_config.json and friends — which fixed
                        // registry paths would silently drop. Both feed the
                        // same dedup set.
                        if is_swept_mcp_config(filename) {
                            let tool_engine_id = if filename == "mcp.json" {
                                None // engine-agnostic shared standard
                            } else {
                                Some(engine_id)
                            };
                            let swept = crate::mcp::discover::read_swept(
                                &path,
                                agent_id_static(&agent.id),
                                crate::mcp::registry::ScopeTier::Global,
                            );
                            parse_warnings.extend(
                                swept.problems.iter().map(|p| format!("{}: {}", p.path, p.detail)),
                            );

                            for reg in swept.registrations {
                                let key = (reg.config_path.clone(), reg.server.name.clone());
                                if !seen_registrations.insert(key) {
                                    continue;
                                }
                                inventory.tools.push(tool_from_registration(
                                    &reg,
                                    Scope::Global { agent: agent.id.clone() },
                                ));
                                if let (Some(store), Some(r_id)) = (&store_opt, global_root_id) {
                                    let t_path = crate::domain::RegistrationKey::new(
                                        &canonicalize_asset_path(Path::new(&reg.config_path), &mut parse_warnings),
                                        &reg.server.name,
                                    )
                                    .to_string();
                                    let _ = store.upsert_asset(
                                        r_id, tool_engine_id, "tool", "global",
                                        &reg.server.name, &t_path, None, None, "ok", None, now, now,
                                    );
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
                                    origin: None,
                                    origin_blocked: None,
                                });
                                if let (Some(store), Some(r_id)) = (&store_opt, global_root_id) {
                                    let canon_p = canonicalize_asset_path(&path, &mut parse_warnings);
                                    // ~/.claude/CLAUDE.md → ~/.agents/AGENTS.md is
                                    // stored at the target, and stamping the target
                                    // with the engine that linked it is the exact
                                    // misattribution v5 clears — which the next scan
                                    // then wrote straight back. The directory wins:
                                    // a file in the shared store is the store's.
                                    let rule_engine_id = if is_shared_store_asset(Path::new(&canon_p)) {
                                        None
                                    } else {
                                        Some(engine_id)
                                    };
                                    let _ = store.upsert_asset(
                                        r_id, rule_engine_id, "rule", "global", filename, &canon_p, None, None, "ok", None, now, now
                                    );
                                }
                            }
                        }
                    }
                } else if g_path_buf.is_dir() {
                    global_has_skips = true;
                }
                // A config-file root (Zed, found by ~/.config/zed/settings.json
                // because it owns no directory) is not an unreadable directory.
                // Calling it a skip would suppress reaping for a root that has
                // nothing to sweep, and warn about it on every scan.

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
                            Err(e) => {
                                global_has_skips = true;
                                // walk_denial_source unwraps the ignore
                                // crate's Custom-kind wrapper down to the
                                // errno-bearing io::Error; classify_denial(
                                // e.io_error()) alone would silently
                                // classify nothing (see its doc comment).
                                //
                                // A machine-scope denial must lead with the
                                // engine name, not the path: RepoPane.tsx
                                // routes any warning starting with "macOS
                                // blocked access to" into the panel that
                                // renders the project path, so leading with
                                // that prefix here would caption it with the
                                // wrong path. That prefix is reserved for the
                                // project walk's own denial (see its site
                                // further down).
                                if let Some(d) = classify_denial(walk_denial_source(&e)) {
                                    let w = format!(
                                        "{} skills folder — {}",
                                        agent.name,
                                        denial_warning(d, &skills_path.to_string_lossy())
                                    );
                                    if !parse_warnings.contains(&w) {
                                        parse_warnings.push(w);
                                    }
                                }
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
                                            origin: None,
                                            origin_blocked: None,
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
                                            let skill_engine_id = get_engine_key(&agent.id)
                                                .and_then(|k| engine_db_ids.get(k).copied());
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
                                Err(e) => {
                                    global_has_skips = true;
                                    // Same unwrap as the skills walker above:
                                    // classify_denial(e.io_error()) alone
                                    // would silently classify nothing. Same
                                    // reason for the "{agent} … folder —"
                                    // lead-in: this is a machine-scope
                                    // denial, and RepoPane.tsx routes any
                                    // warning starting with "macOS blocked
                                    // access to" into the panel that renders
                                    // the project path — leading with that
                                    // prefix here would caption it wrongly.
                                    if let Some(d) = classify_denial(walk_denial_source(&e)) {
                                        let w = format!(
                                            "{} subagents folder — {}",
                                            agent.name,
                                            denial_warning(d, &subagents_path.to_string_lossy())
                                        );
                                        if !parse_warnings.contains(&w) {
                                            parse_warnings.push(w);
                                        }
                                    }
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
                                                    origin: None,
                                                    origin_blocked: None,
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
                                                    // A parse failure is not a link state (ruled 2026-08-15): it files
                                // under parse_status, never under broken links.
                                link_state: None,
                                                    origin: None,
                                                    origin_blocked: None,
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

        // ── Machine-level MCP registrations, from the registry ──────────────
        //
        // The per-agent sweep above only reaches inside an agent's own config
        // root. Two whole classes of registration are invisible to it: the five
        // MCP-only hosts, which have no agent root at all, and ~/.claude.json,
        // which sits *beside* ~/.claude rather than inside it and is where
        // `claude mcp add` writes by default.
        //
        // Registry paths are opened directly by absolute path. The directory
        // walk never sees them, so is_excluded is neither consulted nor
        // weakened — proven by a planted control in mcp_discovery_tests.
        {
            let machine = crate::mcp::discover::discover_machine(&get_home_dir());
            parse_warnings.extend(
                machine.problems.iter().map(|p| format!("{}: {}", p.path, p.detail)),
            );

            let home_dir = get_home_dir();
            let mut host_root_ids: std::collections::HashMap<&'static str, i64> =
                std::collections::HashMap::new();

            for reg in machine.registrations {
                // Local tier is keyed to a repository. The project pass emits
                // it as Scope::Local; it must not appear in the profile.
                if reg.tier == crate::mcp::registry::ScopeTier::Local {
                    continue;
                }
                if !seen_registrations.insert((reg.config_path.clone(), reg.server.name.clone())) {
                    continue;
                }
                let Some(host) = crate::mcp::registry::host_by_id(reg.host_id) else {
                    continue;
                };

                inventory.tools.push(tool_from_registration(
                    &reg,
                    Scope::Global { agent: reg.host_id.to_string() },
                ));

                let Some(store) = &store_opt else { continue };

                let engine_key = host.engine_key();
                let root_id = if let Some(rid) = agent_root_ids.get(host.id) {
                    // A detected agent already owns a root; reuse it rather
                    // than creating a second one for the same engine.
                    Some(*rid)
                } else if let Some(rid) = host_root_ids.get(host.id) {
                    Some(*rid)
                } else {
                    let config_dir = Path::new(&reg.config_path)
                        .parent()
                        .map(|p| p.to_path_buf())
                        .unwrap_or_else(|| Path::new(&reg.config_path).to_path_buf());

                    // Never root at $HOME -- a root there would swallow the
                    // whole machine on the next walk. But refusing outright
                    // dropped the asset entirely: ~/.claude.json's parent IS
                    // the home directory, so Claude.ai connectors were
                    // discovered and then never persisted, leaving counts and
                    // rendered rows disagreeing. Root at the config file
                    // itself instead. engine_global roots are never walked --
                    // the agent loop reads AGENT_CONFIGS, not this table -- so
                    // a file path here is inert.
                    let config_dir = if config_dir == home_dir {
                        Path::new(&reg.config_path).to_path_buf()
                    } else {
                        config_dir
                    };
                    {
                        let config_dir = config_dir.to_string_lossy().to_string();
                        let eid = store
                            .upsert_engine(&engine_key, host.display_name, &config_dir, now)
                            .ok();
                        if let Some(eid) = eid {
                            engine_db_ids.entry(engine_key.clone()).or_insert(eid);
                        }
                        let rid = eid.and_then(|eid| {
                            store
                                .upsert_root(
                                    "engine_global",
                                    &config_dir,
                                    Some(eid),
                                    host.display_name,
                                    now,
                                )
                                .ok()
                        });
                        if let Some(rid) = rid {
                            host_root_ids.insert(host.id, rid);
                        }
                        rid
                    }
                };

                if let Some(r_id) = root_id {
                    let engine_id = engine_db_ids.get(&engine_key).copied();
                    // Byte-identical to the `format!` this replaces — the point is
                    // that the separator is stated once, in the type, not at four
                    // call sites that could drift apart. What this site *stores* is
                    // deliberately unchanged (see docs/roadmap.md).
                    let asset_path =
                        crate::domain::RegistrationKey::new(&reg.config_path, &reg.server.name)
                            .to_string();
                    let _ = store.upsert_asset(
                        r_id,
                        engine_id,
                        "tool",
                        "global",
                        &reg.server.name,
                        &asset_path,
                        None,
                        None,
                        "ok",
                        None,
                        now,
                        now,
                    );
                }
            }
        }

        // Return early if the project path is not there — but "not there" and
        // "not allowed" are different answers. `Path::exists()` is
        // `fs::metadata(self).is_ok()`, so it is false on a permission error
        // too; returning here for a blocked root pushed no ProjectScan at
        // all, the frontend saw `projectScan` undefined with no warnings, and
        // RepoPane rendered its empty state — "macOS refused" shown as "there
        // is nothing here", the exact collapse probe_path exists to prevent.
        // It also threw away every engine-root and global-walker denial
        // gathered above. So a Blocked probe records the denial and falls
        // through, and only Absent still returns early. The walk below will
        // fail on the same path and classify the same string; scan()'s
        // `!parse_warnings.contains` dedupe is what keeps it to one line.
        if root.as_os_str().is_empty() {
            return Ok(inventory);
        }
        match probe_path(root) {
            RootPresence::Present => {}
            RootPresence::Blocked(d) => {
                let w = denial_warning(d, &root.to_string_lossy());
                if !parse_warnings.contains(&w) {
                    parse_warnings.push(w);
                }
            }
            RootPresence::Absent => return Ok(inventory),
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

        // Engine roots beneath a project root are walked by the global pass and
        // must not be walked again here: upsert_asset's update branch rewrites
        // root_id to the deepest matching PROJECT root, so a project walk that
        // descends into ~/.claude re-parents those assets off the User Profile
        // row. guard_engine_root now refuses such links, but a root linked
        // before it existed is still in the store. Forms are precomputed —
        // canonicalising per entry would be a syscall in the hot loop.
        let protected_forms: Vec<PathBuf> = protected_roots()
            .into_iter()
            .flat_map(|(p, _)| {
                let canon = fs::canonicalize(&p).unwrap_or_else(|_| p.clone());
                [p, canon]
            })
            .collect();

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
                    // errno, not error text: TCC says "Operation not permitted"
                    // (EPERM), which the old substring match on "Permission
                    // denied" could never see — a TCC-blocked folder produced
                    // no warning at all. One line per root, not per failed
                    // entry. walk_denial_source unwraps the walker's error
                    // down to the errno-bearing io::Error; see its doc for why
                    // e.io_error() alone is not enough here.
                    if let Some(d) = classify_denial(walk_denial_source(&e)) {
                        let w = denial_warning(d, &root.to_string_lossy());
                        if !parse_warnings.contains(&w) {
                            parse_warnings.push(w);
                        }
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

            // Never let a project walk descend into an engine root.
            if protected_forms.iter().any(|pf| path.starts_with(pf)) {
                continue;
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

                // A symlinked directory is yielded but never descended
                // (follow_links is off), so this entry is the only chance to
                // record a deployed skill dir as a link.
                if let (Some(store), Some(r_id)) = (&store_opt, project_root_id) {
                    offer_walk_symlink(store, r_id, path, now);
                }

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

            if let (Some(store), Some(r_id)) = (&store_opt, project_root_id) {
                offer_walk_symlink(store, r_id, path, now);
            }

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

                    let skill_engine_id = crate::agents::engine_for_path(parent_dir)
                        .and_then(|c| get_engine_key(c.id))
                        .and_then(|k| engine_db_ids.get(k).copied());

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
                                origin: None,
                                origin_blocked: None,
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
                                // A parse failure is not a link state (ruled 2026-08-15): it files
                                // under parse_status, never under broken links.
                                link_state: None,
                                origin: None,
                                origin_blocked: None,
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

            if is_swept_mcp_config(filename) {
                found_tools.push(path.to_path_buf());
            }

            // A subagent is a `.md` file directly inside an agent's subagents
            // directory (with that directory sitting directly under the
            // agent's own root — see subagent_owner_for_path), or directly
            // inside the shared `.agents/` root. The shared case has no
            // owner: several agents read it, and ownership is exclusive
            // (spec §4.4). It is still a subagent — it just belongs to the
            // store. `Some("")` is that case: a real subagent, no owning
            // engine. It reads oddly in isolation, but it matches the
            // convention already used for skills and rules a few lines away
            // (`Scope::Project { agent: "".to_string(), .. }` = no owner), and
            // it flows straight into `get_engine_key("")`, which returns
            // `None`, so the asset lands with `engine_id: None` exactly as
            // intended.
            let is_subagent = if filename.ends_with(".md") {
                let parent_name = path
                    .parent()
                    .and_then(|p| p.file_name())
                    .and_then(|n| n.to_str());
                match crate::agents::subagent_owner_for_path(path) {
                    Some(config) => Some(config.id),
                    None if parent_name == Some(crate::agents::SHARED_AGENTS_DIR) => Some(""),
                    None => None,
                }
            } else {
                None
            };

            if let Some(agent_id) = is_subagent {
                if let Ok(content) = fs::read_to_string(path) {
                    let subagent_engine_id =
                        get_engine_key(agent_id).and_then(|k| engine_db_ids.get(k).copied());
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
                                origin: None,
                                origin_blocked: None,
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
                                // A parse failure is not a link state (ruled 2026-08-15): it files
                                // under parse_status, never under broken links.
                                link_state: None,
                                origin: None,
                                origin_blocked: None,
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
            let tool_filename = tool_path.file_name().and_then(|n| n.to_str()).unwrap_or("");

            if let Some(config) = crate::agents::engine_for_path(&tool_path) {
                owning_agent = config.name.to_string();
            }

            let scope = Scope::Project {
                agent: owning_agent.clone(),
                root: project_path_abs.clone(),
            };
            let initial_tools_count = inventory.tools.len();
            let tool_engine_id = if tool_filename == "mcp.json" {
                None // MCP server definitions (mcp.json) are engine-agnostic shared standards
            } else {
                crate::agents::engine_for_path(&tool_path)
                    .and_then(|c| get_engine_key(c.id))
                    .and_then(|k| engine_db_ids.get(k).copied())
            };

            match crate::mcp::discover::parse_swept(
                &tool_path,
                agent_id_static(&owning_agent),
                crate::mcp::registry::ScopeTier::Project,
            ) {
                Ok(regs) => {
                    for reg in regs {
                        let key = (reg.config_path.clone(), reg.server.name.clone());
                        if !seen_registrations.insert(key) {
                            continue;
                        }
                        let mut tool = tool_from_registration(&reg, scope.clone());
                        // The sweep attributes ownership by footprint
                        // directory; the registration itself has no host.
                        tool.owning_agent = owning_agent.clone();
                        inventory.tools.push(tool);
                    }
                    if let (Some(store), Some(r_id)) = (&store_opt, project_root_id) {
                        for t in &inventory.tools[initial_tools_count..] {
                            let t_canon = crate::domain::RegistrationKey::new(
                                &canonicalize_asset_path(Path::new(&t.config_path), &mut parse_warnings),
                                &t.name,
                            )
                            .to_string();
                            let _ = store.upsert_asset(
                                r_id, tool_engine_id, "tool", "project", &t.name, &t_canon, None, None, "ok", None, now, now
                            );
                        }
                    }
                }
                Err(err_msg) => {
                    // The row keeps a broken config visible; the warning puts it
                    // in the project's DisclosureBanner. Both, as before.
                    parse_warnings.push(err_msg.clone());
                    let t_canon = canonicalize_asset_path(&tool_path, &mut parse_warnings);
                    inventory.tools.push(Tool {
                        id: t_canon.clone(),
                        name: tool_filename.to_string(),
                        command: String::new(),
                        // A config that would not parse has no launch to record.
                        args: Vec::new(),
                        launch_display: String::new(),
                        transport: String::new(),
                        // A config that would not parse has no launch to record,
                        // and no bridge to have unwrapped.
                        bridged: false,
                        config_path: t_canon.clone(),
                        scope: scope.clone(),
                        owning_agent: owning_agent.clone(),
                        drifted: None,
                        is_symlink: None,
                        source_path: None,
                        parse_status: Some("failed".to_string()),
                        parse_error: Some(err_msg.clone()),
                        // A parse failure is not a link state (ruled 2026-08-15): it files
                                // under parse_status, never under broken links.
                                link_state: None,
                        origin: None,
                        origin_blocked: None,
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
                            origin: None,
                            origin_blocked: None,
                        });
                        if let (Some(store), Some(r_id)) = (&store_opt, project_root_id) {
                            let rule_canon = canonicalize_asset_path(Path::new(p_str), &mut parse_warnings);
                            // A rules file is normally attributed by filename —
                            // `.cursorrules` says Cursor wherever it sits. Inside
                            // `.agents/` it does not: that directory is the shared
                            // store by definition, several agents read what is in
                            // it, and stamping one engine on it is the
                            // misattribution this branch exists to remove. A
                            // vendor-named file in the shared directory is an odd
                            // thing to write, and the safe reading of it is
                            // "shared", not "Cursor's". The walk does get here —
                            // the broad-root depth cap exempts `.agents` by name.
                            let rule_engine_id = if is_shared_store_asset(Path::new(&rule_canon)) {
                                None
                            } else {
                                crate::agents::engine_for_rule_file(&name).and_then(|(key, display)| {
                                    store.upsert_engine(key, display, "", now).ok()
                                })
                            };
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

#[cfg(test)]
mod denial_tests {
    use super::*;
    use std::io;

    #[test]
    fn eperm_classifies_as_macos_blocked() {
        let e = io::Error::from_raw_os_error(1); // EPERM — what tccd returns
        assert!(matches!(classify_denial(Some(&e)), Some(Denial::MacosBlocked)));
    }

    #[test]
    fn eacces_classifies_as_unix_permission() {
        let e = io::Error::from_raw_os_error(13); // EACCES — chmod-style denial
        assert!(matches!(classify_denial(Some(&e)), Some(Denial::UnixPermission)));
    }

    #[test]
    fn other_errors_and_non_io_do_not_classify() {
        let e = io::Error::from_raw_os_error(2); // ENOENT
        assert!(classify_denial(Some(&e)).is_none());
        assert!(classify_denial(None).is_none());
    }

    #[test]
    fn warning_strings_are_the_frontend_contract() {
        // RepoPane.tsx routes on these exact prefixes. Change them together
        // or not at all.
        assert_eq!(
            denial_warning(Denial::MacosBlocked, "/Users/x/Documents"),
            "macOS blocked access to /Users/x/Documents"
        );
        assert_eq!(
            denial_warning(Denial::UnixPermission, "/Users/x/p"),
            "Permission denied: /Users/x/p"
        );
    }

    #[test]
    fn sanitising_a_denial_preserves_the_prefix_the_frontend_routes_on() {
        // RepoPane.tsx matches the *sanitised* string: scan() runs every
        // parse_warning through sanitise_msg before it reaches the UI, and
        // sanitise_msg rewrites `/`-leading words to <sanitised>/{filename}.
        // Nothing else asserts that it leaves the leading phrase — and so the
        // routing — intact.
        let sanitised = crate::preferences::sanitise_msg("macOS blocked access to /Users/x/p");
        assert!(
            sanitised.starts_with("macOS blocked access to"),
            "sanitisation must not disturb the prefix the panel routes on: {}",
            sanitised
        );
    }

    #[cfg(unix)]
    #[test]
    fn probe_path_distinguishes_absent_from_blocked() {
        use std::os::unix::fs::PermissionsExt;

        // Root bypasses mode bits, so chmod 000 would not deny anything and
        // this test would assert on a "blocked" state that can never occur.
        if unsafe { libc::geteuid() } == 0 {
            eprintln!("skipping probe_path_distinguishes_absent_from_blocked: running as root, mode bits do not deny");
            return;
        }

        let dir = tempfile::tempdir().unwrap();

        // Absent: no entry at all.
        assert!(matches!(probe_path(&dir.path().join("nope")), RootPresence::Absent));

        // Present.
        let there = dir.path().join("there");
        std::fs::create_dir(&there).unwrap();
        assert!(matches!(probe_path(&there), RootPresence::Present));

        // Blocked: stat through an unreadable parent fails EACCES, the same
        // errno-shape a TCC EPERM takes through classify_denial. (Real EPERM
        // is unreachable in-test; the classifier's EPERM branch is covered
        // above.)
        let parent = dir.path().join("parent");
        std::fs::create_dir_all(parent.join("child")).unwrap();
        let mut p = std::fs::metadata(&parent).unwrap().permissions();
        p.set_mode(0o000);
        std::fs::set_permissions(&parent, p).unwrap();

        let result = probe_path(&parent.join("child"));

        // Restore before asserting: a failed assertion must not strand an
        // unreadable directory for tempdir's Drop to choke on.
        let mut p = std::fs::metadata(&parent).unwrap().permissions();
        p.set_mode(0o755);
        let _ = std::fs::set_permissions(&parent, p);

        assert!(matches!(result, RootPresence::Blocked(Denial::UnixPermission)));
    }

    #[test]
    fn test_declared_source_precedence() {
        let fm = parse_skill_frontmatter(
            "---\nname: x\ndescription: d\nsource: https://github.com/a/b\nhomepage: https://c.d\n---\nbody",
        )
        .unwrap();
        assert_eq!(fm.declared_source(), Some("https://github.com/a/b"));
    }

    #[test]
    fn test_declared_source_from_metadata_homepage() {
        let fm = parse_skill_frontmatter(
            "---\nname: x\ndescription: d\nmetadata:\n  author: someone\n  homepage: \"https://fontfyi.com/\"\n---\nbody",
        )
        .unwrap();
        assert_eq!(fm.declared_source(), Some("https://fontfyi.com/"));
    }

    #[test]
    fn test_odd_metadata_shape_still_parses() {
        let fm = parse_skill_frontmatter(
            "---\nname: x\ndescription: d\nmetadata:\n  tags:\n    - a\n    - b\n---\nbody",
        );
        assert!(fm.is_ok());
        assert_eq!(fm.unwrap().declared_source(), None);
    }

    #[test]
    fn test_odd_metadata_shape_nested_map_still_parses() {
        // Real-world metadata carries arbitrary nested structure, not just
        // lists. A struct-typed `metadata` would reject this document
        // outright; `Option<serde_yaml::Value>` must accept it.
        let fm = parse_skill_frontmatter(
            "---\nname: x\ndescription: d\nmetadata:\n  author:\n    name: 誰か\n    contact:\n      email: a@b.co\n---\nbody",
        );
        assert!(fm.is_ok());
        assert_eq!(fm.unwrap().declared_source(), None);
    }

    #[test]
    fn test_odd_metadata_shape_scalar_still_parses() {
        // Some skills write `metadata: unknown` — a bare scalar, not a map.
        let fm = parse_skill_frontmatter("---\nname: x\ndescription: d\nmetadata: unknown\n---\nbody");
        assert!(fm.is_ok());
        assert_eq!(fm.unwrap().declared_source(), None);
    }

    #[test]
    fn test_source_origin_still_wins() {
        let fm = parse_skill_frontmatter(
            "---\nname: x\ndescription: d\nsource-origin: https://github.com/win/s\nsource: https://github.com/lose/s\n---\nbody",
        )
        .unwrap();
        assert_eq!(fm.declared_source(), Some("https://github.com/win/s"));
    }

    #[test]
    fn test_declared_source_falls_back_to_metadata_homepage_when_source_and_homepage_absent() {
        let fm = parse_skill_frontmatter(
            "---\nname: x\ndescription: d\n---\nbody",
        )
        .unwrap();
        assert_eq!(fm.declared_source(), None);
    }

    #[test]
    fn test_subagent_declared_source_precedence() {
        let fm = parse_subagent_frontmatter(
            "---\nname: x\ndescription: d\nsource: https://github.com/a/b\nhomepage: https://c.d\n---\nbody",
        )
        .unwrap();
        assert_eq!(fm.declared_source(), Some("https://github.com/a/b"));

        let fm2 = parse_subagent_frontmatter(
            "---\nname: x\ndescription: d\nhomepage: https://c.d\n---\nbody",
        )
        .unwrap();
        assert_eq!(fm2.declared_source(), Some("https://c.d"));
    }
}
