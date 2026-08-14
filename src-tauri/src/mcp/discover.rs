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

#[derive(Debug, Default)]
pub struct DiscoveryResult {
    pub registrations: Vec<Registration>,
    pub warnings: Vec<String>,
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

fn read_source(base: &Path, source: &'static McpSource, out: &mut DiscoveryResult) {
    for path in resolve_paths(base, source.path) {
        let path_str = path.to_string_lossy().to_string();

        let body = match fs::read_to_string(&path) {
            Ok(b) => b,
            Err(e) => {
                out.warnings.push(format!(
                    "Failed to read MCP config at {}: {}",
                    crate::preferences::sanitise_path(&path_str),
                    e
                ));
                continue;
            }
        };

        match dialect::parse(&body, source.dialect, source.tier) {
            Ok(servers) if servers.is_empty() => {
                // The file exists and parsed, but declared nothing. Previously
                // this was an indistinguishable Ok(0) and the source vanished
                // without any diagnostic.
                out.warnings.push(format!(
                    "No MCP servers found in {}, which Hanger expects to declare them",
                    crate::preferences::sanitise_path(&path_str)
                ));
            }
            Ok(servers) => {
                for server in servers {
                    out.registrations.push(Registration {
                        server,
                        host_id: source.host_id,
                        tier: source.tier,
                        config_path: path_str.clone(),
                    });
                }
            }
            Err(e) => out.warnings.push(format!(
                "Failed to parse MCP config at {}: {}",
                crate::preferences::sanitise_path(&path_str),
                e
            )),
        }
    }
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
