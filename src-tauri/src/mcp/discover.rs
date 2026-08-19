//! Resolve the registry against a real filesystem.
//!
//! This is the only module in `mcp/` that touches disk. Registry paths are
//! opened DIRECTLY by absolute path and are never handed to the directory
//! walk, which is why `scanner::is_excluded` — and its `Library` term — stays
//! byte-identical. Weakening that guard would be a separate, reportable change.

use std::fs;
use std::path::{Path, PathBuf};

use crate::mcp::dialect::{self, McpServer};
use crate::mcp::registry::{McpSource, ScopeTier, SourceLocation, SOURCES};

/// One server as declared by one host in one file.
///
/// The same server name may appear in many registrations — that is the
/// cross-host coverage this feature exists to show, not duplication to
/// collapse.
#[derive(Debug, Clone)]
pub struct Registration {
    pub server: McpServer,
    pub host_id: &'static str,
    pub tier: ScopeTier,
    pub config_path: String,
}

/// Why one config file yielded nothing usable.
///
/// These were four different sentences in one `Vec<String>`. A permissions
/// failure and a malformed file have different fixes — chmod versus an editor —
/// and a user told only "there was a problem" has to guess which.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub enum ConfigProblemKind {
    /// Permissions, I/O. `detail` carries the OS error.
    Unreadable,
    /// Malformed. `line` carries a location where the parser gives one.
    Unparseable,
    /// The format is known and deliberately not parsed. Produced by
    /// `Dialect::Unsupported` — a config format Hanger detects but does not
    /// read.
    FormatUnread,
    /// Well-formed, zero servers declared.
    DeclaredNothing,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct ConfigProblem {
    pub kind: ConfigProblemKind,
    /// Already through `preferences::sanitise_path`.
    pub path: String,
    pub detail: String,
    /// `Unparseable` only, and only when the parser supplies one. `None` means
    /// the view omits the location rather than inventing a number.
    pub line: Option<u32>,
}

#[derive(Debug, Default)]
pub struct DiscoveryResult {
    pub registrations: Vec<Registration>,
    pub problems: Vec<ConfigProblem>,
}

/// Expand a source path that may contain a single `*` segment.
///
/// Used for `.claude/plugins/marketplaces/*/.mcp.json`. A path with no `*`
/// returns itself if it exists.
fn resolve_paths(base: &Path, rel: &str) -> Vec<PathBuf> {
    if !rel.contains('*') {
        let p = base.join(rel);
        return if p.is_file() { vec![p] } else { Vec::new() };
    }

    let (prefix, suffix) = rel.split_once('*').expect("checked for '*' above");
    let prefix_dir = base.join(prefix.trim_end_matches('/'));
    let suffix = suffix.trim_start_matches('/');

    let Ok(entries) = fs::read_dir(&prefix_dir) else {
        return Vec::new();
    };
    let mut out: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path().join(suffix))
        .filter(|p| p.is_file())
        .collect();
    // read_dir order is filesystem-dependent; sort so discovery is
    // deterministic and test assertions stay stable.
    out.sort();
    out
}

/// True when a file exists *solely* to declare MCP servers, so declaring none
/// is worth a diagnostic.
///
/// A `settings.json` or `config.toml` legitimately carries unrelated
/// configuration and usually has no MCP block at all — warning on those would
/// bury the real signal in noise.
fn is_mcp_dedicated(path: &Path) -> bool {
    matches!(
        path.file_name().and_then(|n| n.to_str()),
        Some("mcp.json") | Some(".mcp.json") | Some("mcp_config.json")
            | Some("claude_desktop_config.json")
    )
}

/// Dialect for a file found by filename sweep rather than declared by the
/// registry. Only the extension is available to go on.
fn dialect_for_swept(path: &Path) -> dialect::Dialect {
    match path.extension().and_then(|e| e.to_str()) {
        Some("toml") => dialect::Dialect::CodexToml,
        _ => dialect::Dialect::McpServers,
    }
}

fn read_one(
    path: &Path,
    dial: dialect::Dialect,
    host_id: &'static str,
    tier: ScopeTier,
    out: &mut DiscoveryResult,
) {
    let path_str = path.to_string_lossy().to_string();

    let body = match fs::read_to_string(path) {
        Ok(b) => b,
        Err(e) => {
            out.problems.push(ConfigProblem {
                kind: ConfigProblemKind::Unreadable,
                path: crate::preferences::sanitise_path(&path_str),
                detail: e.to_string(),
                line: None,
            });
            return;
        }
    };

    match dialect::parse(&body, dial, tier) {
        Ok(servers) if servers.is_empty() => {
            // Parsed cleanly, declared nothing. Previously an indistinguishable
            // Ok(0), which is how VS Code's server vanished without trace.
            // Only worth saying for files whose whole purpose is MCP.
            if is_mcp_dedicated(path) {
                out.problems.push(ConfigProblem {
                    kind: ConfigProblemKind::DeclaredNothing,
                    path: crate::preferences::sanitise_path(&path_str),
                    detail: "declares no MCP servers, though this file exists solely to declare them"
                        .to_string(),
                    line: None,
                });
            }
        }
        Ok(servers) => {
            for server in servers {
                out.registrations.push(Registration {
                    server,
                    host_id,
                    tier,
                    config_path: path_str.clone(),
                });
            }
        }
        Err(e) if e == dialect::FORMAT_UNREAD => out.problems.push(ConfigProblem {
            kind: ConfigProblemKind::FormatUnread,
            path: crate::preferences::sanitise_path(&path_str),
            detail: "config format not yet supported".to_string(),
            line: None,
        }),
        Err(e) => {
            let line = parsed_line(&e);
            out.problems.push(ConfigProblem {
                kind: ConfigProblemKind::Unparseable,
                path: crate::preferences::sanitise_path(&path_str),
                detail: e,
                line,
            });
        }
    }
}

/// Recover the line number a parser put in its message.
///
/// Both parsers this module drives already carry a location in their Display
/// form — `serde_json` writes "at line 3 column 5" and `toml` writes "at line 3,
/// column 5". Reading it back here keeps one small parse in one place; the
/// alternative is a custom error type threaded through every dialect, including
/// TOML's, whose error type is unrelated to serde's.
///
/// Returns `None` when no location is present, so the caller omits the
/// parenthetical rather than inventing a number.
fn parsed_line(message: &str) -> Option<u32> {
    let rest = message.split("at line ").nth(1)?;
    let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();
    digits.parse().ok()
}

/// `read_one` for tests that need to name the dialect directly rather than go
/// through a registry row.
pub fn read_one_for_test(
    path: &Path,
    dial: dialect::Dialect,
    host_id: &'static str,
    tier: ScopeTier,
) -> DiscoveryResult {
    let mut out = DiscoveryResult::default();
    read_one(path, dial, host_id, tier, &mut out);
    out
}

fn read_source(base: &Path, source: &'static McpSource, out: &mut DiscoveryResult) {
    for path in resolve_paths(base, source.path) {
        read_one(&path, source.dialect, source.host_id, source.tier, out);
    }
}

/// Read a config file located by filename sweep rather than declared by the
/// registry.
///
/// The registry says where known hosts keep their config. The sweep exists
/// because Hanger also surfaces loose, ad-hoc configs in non-standard paths —
/// a stated product goal, and the only reason `.agents/mcp.json` and deeply
/// nested `mcp.json` files are found at all. Dropping it in favour of fixed
/// paths would take the fixture from 4 global tools to 1.
///
/// `host_id` is `""` when no footprint directory identifies an owner.
pub fn read_swept(path: &Path, host_id: &'static str, tier: ScopeTier) -> DiscoveryResult {
    let mut out = DiscoveryResult::default();
    read_one(path, dialect_for_swept(path), host_id, tier, &mut out);
    out
}

/// Resolve one registration by its key, reading only the file the key names.
///
/// `mcp_probe` used to answer "what does this registration launch?" by
/// re-scanning the whole machine (`run_scan`) and filtering the result —
/// measured at 11.2s on a real machine. `registration_key` is
/// `"{config_path}:{server_name}"` (`RegistrationKey::new`, `domain.rs`); the
/// file is already named in the key, so there is nothing to walk.
///
/// The separator is the **first** colon — matching the only other place a key
/// of this shape is split (`preferences.rs`'s `abs_path.split_once(':')`),
/// not the last. `config_path` is a filesystem path and never contains one on
/// macOS; `server_name` is an arbitrary config key with no such guarantee, so
/// splitting on the first colon is the only choice that stays correct even if
/// a server name did.
pub fn resolve_registration(registration_key: &str) -> Result<Registration, String> {
    let (config_path, server_name) = registration_key
        .split_once(':')
        .ok_or_else(|| format!("Malformed registration key: {}", registration_key))?;

    let (host_id, tier) = resolve_host_and_tier(config_path);
    let result = read_swept(Path::new(config_path), host_id, tier);

    result
        .registrations
        .into_iter()
        .find(|r| r.server.name == server_name)
        .ok_or_else(|| format!("No registration matches {}", registration_key))
}

/// Best-effort `(host_id, tier)` for a config path, found by matching it
/// against the registry rather than guessed.
///
/// Neither value changes what `resolve_registration` returns in the common
/// case: `read_swept` infers dialect from the file extension
/// (`dialect_for_swept`, above) and never selects `Dialect::ClaudeJson` — the
/// only dialect `tier` changes the parse of (`dialect.rs::parse_claude_json`
/// branches on `ScopeTier::Local` to read `projects[repo].mcpServers` instead
/// of the top-level `mcpServers` key). A probe on a server that exists only
/// in a project's *Local* scope inside `~/.claude.json` will not be found
/// here even though `run_scan`'s registry pass — which names the dialect
/// explicitly instead of inferring it — does find it today. Resolving both
/// values properly anyway, rather than passing a placeholder, keeps the
/// `Registration` this hands back honest for any caller that reads
/// `.host_id` or `.tier`.
fn resolve_host_and_tier(config_path: &str) -> (&'static str, ScopeTier) {
    let path = Path::new(config_path);
    let home = crate::scanner::get_home_dir();

    for source in SOURCES
        .iter()
        .filter(|s| s.location == SourceLocation::MachineAbsolute && !s.path.contains('*'))
    {
        if home.join(source.path).as_path() == path {
            return (source.host_id, source.tier);
        }
    }

    for source in SOURCES
        .iter()
        .filter(|s| s.location == SourceLocation::RepoRelative && !s.path.contains('*'))
    {
        if path.ends_with(source.path) {
            return (source.host_id, source.tier);
        }
    }

    // No entry in the registry names this path — an ad-hoc, swept config
    // rather than a known host file. "" matches read_swept's own doc comment
    // for this case; Global is inert here for the reason above.
    ("", ScopeTier::Global)
}

/// Like [`read_swept`], but surfaces a parse failure as `Err` instead of a
/// warning.
///
/// The scanner records a *failed asset row* for a config it cannot parse, so a
/// broken file stays visible instead of silently disappearing. That needs the
/// failure distinguished from "parsed fine, declared nothing" — the two were
/// indistinguishable before this module existed.
pub fn parse_swept(
    path: &Path,
    host_id: &'static str,
    tier: ScopeTier,
) -> Result<Vec<Registration>, String> {
    let path_str = path.to_string_lossy().to_string();
    let body = fs::read_to_string(path).map_err(|e| {
        format!(
            "Failed to read tool config at {}: {}",
            crate::preferences::sanitise_path(&path_str),
            e
        )
    })?;

    let servers = dialect::parse(&body, dialect_for_swept(path), tier).map_err(|e| {
        format!(
            "Failed to parse {} at {}",
            path.extension().and_then(|x| x.to_str()).unwrap_or("config"),
            crate::preferences::sanitise_path(&path_str)
        ) + &format!(": {}", e)
    })?;

    Ok(servers
        .into_iter()
        .map(|server| Registration {
            server,
            host_id,
            tier,
            config_path: path_str.clone(),
        })
        .collect())
}

/// Every machine-level registration under `home`.
pub fn discover_machine(home: &Path) -> DiscoveryResult {
    let mut out = DiscoveryResult::default();
    for source in SOURCES
        .iter()
        .filter(|s| s.location == SourceLocation::MachineAbsolute)
    {
        read_source(home, source, &mut out);
    }
    out
}

/// Every repo-level registration under `repo_root`.
pub fn discover_repo(repo_root: &Path) -> DiscoveryResult {
    let mut out = DiscoveryResult::default();
    for source in SOURCES
        .iter()
        .filter(|s| s.location == SourceLocation::RepoRelative)
    {
        read_source(repo_root, source, &mut out);
    }
    out
}
