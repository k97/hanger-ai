//! Resolve the registry against a real filesystem.
//!
//! This is the only module in `mcp/` that touches disk. Registry paths are
//! opened DIRECTLY by absolute path and are never handed to the directory
//! walk, which is why `scanner::is_excluded` — and its `Library` term — stays
//! byte-identical. Weakening that guard would be a separate, reportable change.

use std::fs;
use std::path::{Path, PathBuf};

use crate::mcp::dialect::{self, McpServer};
use crate::mcp::registry::{host_by_id, HostKind, McpSource, ScopeTier, SourceLocation, SOURCES};

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

/// One path `read_one` actually opened, whether or not it yielded a
/// registration or a problem.
///
/// A file that parses cleanly to zero servers and is not `is_mcp_dedicated`
/// leaves no trace in either `registrations` or `problems` — the only place
/// that knows it was looked at is here. Backs Appendix A.1's "Checked {n}
/// config files across {m} engines" line (§6.3 state 2 / A.1).
#[derive(Debug, Clone)]
pub struct CheckedFile {
    pub host_id: &'static str,
    /// The raw, unsanitised path — deliberately not through
    /// `preferences::sanitise_path` here. Sanitising loses information when
    /// the path falls outside `$HOME` (it degrades to `<sanitised>/{filename}`,
    /// which collides two files that merely share a basename — `.claude/
    /// mcp.json` and `.../Code/User/mcp.json` would both sanitise to
    /// `<sanitised>/mcp.json`). `coverage()` dedupes on this raw form and
    /// sanitises only the output it hands to the frontend.
    pub path: String,
}

#[derive(Debug, Default)]
pub struct DiscoveryResult {
    pub registrations: Vec<Registration>,
    pub problems: Vec<ConfigProblem>,
    /// One entry per (source row, file) pair `read_one` was called with —
    /// `.claude.json` is named by three rows (claude-code/User,
    /// claude-code/Local, claude-ai/Global) and appears three times here.
    /// `coverage()` is where that gets folded down to distinct files.
    pub checked: Vec<CheckedFile>,
}

/// The backend's own tally of what one `DiscoveryResult` checked — the two
/// counts Appendix A.1 renders, computed once here so the view never derives
/// either from an array's own length (`invariants.md`: counts are
/// backend-owned; `no-frontend-counting.test.ts` forbids `.length` standing
/// in for one).
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct McpCoverage {
    /// Distinct files read, deduplicated — three SOURCES rows can share one
    /// physical `.claude.json`, and a user does not want that path listed
    /// three times in `[Show files]`.
    pub checked_file_count: usize,
    /// Distinct `host_id`s among the files checked.
    pub checked_engine_count: usize,
    /// Sanitised paths, deduplicated and sorted, for the `[Show files]`
    /// disclosure. `checked_files.len() == checked_file_count` always.
    pub checked_files: Vec<String>,
}

/// Fold a `DiscoveryResult`'s `checked` list into the two counts and the
/// path list Appendix A.1 renders. Pure — no I/O of its own.
///
/// Deduplicates on the raw path (see `CheckedFile::path`'s doc comment for
/// why sanitising first would be wrong) and sanitises only the strings this
/// hands back — the dedup key and the displayed string are deliberately not
/// the same value.
///
/// `checked_engine_count` counts only `HostKind::Agent` hosts. The sentence
/// this backs names *engines* ("{engine list} is/are installed here"), and
/// `checked` also carries MCP-only hosts (`claude-ai` is the common one —
/// `.claude.json` is read by two `HostKind::Agent` rows and one
/// `HostKind::McpHost` row for the same file) which must not inflate a
/// count sitting next to that noun. A host absent from the registry (should
/// never happen — `every_source_names_a_declared_host` in
/// `mcp_discovery_tests.rs` pins that every `SOURCES` row names a real
/// `HOSTS` entry) is not counted, rather than guessed either way.
pub fn coverage(result: &DiscoveryResult) -> McpCoverage {
    let mut engines: std::collections::HashSet<&'static str> = std::collections::HashSet::new();
    let mut files: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
    for c in &result.checked {
        if host_by_id(c.host_id).map(|h| h.kind) == Some(HostKind::Agent) {
            engines.insert(c.host_id);
        }
        files.insert(c.path.clone());
    }
    McpCoverage {
        checked_file_count: files.len(),
        checked_engine_count: engines.len(),
        checked_files: files
            .into_iter()
            .map(|p| crate::preferences::sanitise_path(&p))
            .collect(),
    }
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
    out.checked.push(CheckedFile {
        host_id,
        path: path_str.clone(),
    });

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
///
/// A path matching a row in `registry::SOURCES` is read with **that row's
/// declared dialect** — the same one `read_source`/`discover_machine` use —
/// never guessed from the extension. `read_swept`'s extension guess
/// (`dialect_for_swept`) is correct only for a path *no* `SOURCES` row names:
/// a genuinely ad-hoc, undeclared sweep file, which is what it exists for.
/// Guessing for a registry-declared path is wrong: `VsCodeServers` reads
/// `"servers"`, `ZedContextServers` reads `"context_servers"`, `OpenCodeMcp`
/// reads `"mcp"`, `AmpSettingsKey` reads the dotted `"amp.mcpServers"` key,
/// Kilocode's `.jsonc` has no extension match at all, `ClaudeJson` at
/// `ScopeTier::Local` reads `projects[repo].mcpServers` instead of the
/// top-level key, and `ClaudeAiConnectors` reads a different key entirely —
/// every one of those would parse the file successfully and then search
/// under the wrong key, returning "No registration matches" for a
/// registration that is really there.
///
/// `.claude.json` names three `SOURCES` rows sharing one path
/// (claude-code/User, claude-code/Local, claude-ai/Global). Each candidate is
/// tried in turn and the first that actually contains `server_name` wins, so
/// the `host_id`/`tier` on the `Registration` this returns are never a guess
/// among the three — they are the row proven, by successfully finding the
/// server under it, to be the right one for this key.
pub fn resolve_registration(registration_key: &str) -> Result<Registration, String> {
    let (config_path, server_name) = registration_key
        .split_once(':')
        .ok_or_else(|| format!("Malformed registration key: {}", registration_key))?;

    let path = Path::new(config_path);
    let candidates = matching_sources(config_path);

    if candidates.is_empty() {
        // No registry row names this path — an ad-hoc, swept config, exactly
        // what read_swept's extension guess exists for. "" host matches its
        // own doc comment for this case.
        let result = read_swept(path, "", ScopeTier::Global);
        return result
            .registrations
            .into_iter()
            .find(|r| r.server.name == server_name)
            .ok_or_else(|| format!("No registration matches {}", registration_key));
    }

    for source in candidates {
        let mut out = DiscoveryResult::default();
        read_one(path, source.dialect, source.host_id, source.tier, &mut out);
        if let Some(reg) = out.registrations.into_iter().find(|r| r.server.name == server_name) {
            return Ok(reg);
        }
    }

    Err(format!("No registration matches {}", registration_key))
}

/// Every `SOURCES` row whose location resolves to `config_path`.
///
/// Usually one row. `.claude.json` is the exception — three rows share its
/// path — which is why this returns every match rather than the first: the
/// caller tries each declared dialect in turn and keeps only the one that
/// actually finds the server, rather than guessing which of three is right.
fn matching_sources(config_path: &str) -> Vec<&'static McpSource> {
    let path = Path::new(config_path);
    let home = crate::scanner::get_home_dir();

    let machine: Vec<&'static McpSource> = SOURCES
        .iter()
        .filter(|s| s.location == SourceLocation::MachineAbsolute && !s.path.contains('*'))
        .filter(|s| home.join(s.path).as_path() == path)
        .collect();
    if !machine.is_empty() {
        return machine;
    }

    SOURCES
        .iter()
        .filter(|s| s.location == SourceLocation::RepoRelative && !s.path.contains('*'))
        .filter(|s| path.ends_with(s.path))
        .collect()
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
