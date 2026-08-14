//! Parse one config file body into servers.
//!
//! Pure functions: a string in, servers out. No filesystem, no paths. Every
//! format Hanger understands is expressed here and nowhere else, so adding a
//! dialect never touches the scanner.
//!
//! Secret hygiene (docs/scanning.md §7) is enforced at this boundary: env
//! *names* are captured, values are dropped on the floor and never enter a
//! struct. URL userinfo and query strings are stripped before storage.

pub use crate::mcp::registry::{Dialect, ScopeTier};

/// One server declaration, normalised across dialects.
#[derive(Debug, Clone)]
pub struct McpServer {
    pub name: String,
    /// Executable or script. Empty for URL-only remote servers.
    pub command: String,
    /// `"stdio"`, `"unknown"`, or a sanitised URL for remote transports.
    pub transport: String,
    /// Environment variable NAMES only. Values are never read.
    pub env_keys: Vec<String>,
    /// Set only for ClaudeJson at ScopeTier::Local — the repo the server is
    /// keyed to. `None` for every other dialect and tier.
    pub project_root: Option<String>,
}

/// Strip userinfo and query parameters from a URL so credentials never reach
/// storage. Mirrors the pre-existing `scanner::sanitise_url` behaviour.
fn sanitise_url(url_str: &str) -> String {
    if !url_str.contains("://") {
        return url_str.to_string();
    }
    let parts: Vec<&str> = url_str.split("://").collect();
    if parts.len() != 2 {
        return url_str.to_string();
    }
    let rest_no_query = parts[1].split('?').next().unwrap_or(parts[1]);
    match rest_no_query.find('@') {
        Some(at) => format!("{}://{}", parts[0], &rest_no_query[at + 1..]),
        None => format!("{}://{}", parts[0], rest_no_query),
    }
}

fn transport_for(command: &str, url: Option<&str>) -> String {
    match url {
        Some(u) => sanitise_url(u),
        None if command.is_empty() => "unknown".to_string(),
        None => "stdio".to_string(),
    }
}

fn env_keys_json(entry: &serde_json::Value) -> Vec<String> {
    entry
        .get("env")
        .and_then(|v| v.as_object())
        .map(|m| m.keys().cloned().collect())
        .unwrap_or_default()
}

fn server_from_json(name: &str, entry: &serde_json::Value) -> McpServer {
    let command = entry
        .get("command")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let url = entry.get("url").and_then(|v| v.as_str());
    McpServer {
        name: name.to_string(),
        transport: transport_for(&command, url),
        command,
        env_keys: env_keys_json(entry),
        project_root: None,
    }
}

/// Read a `{name: {...}}` object living under `key`.
fn parse_json_map(body: &str, key: &str) -> Result<Vec<McpServer>, String> {
    let root: serde_json::Value =
        serde_json::from_str(body).map_err(|e| format!("Failed to parse JSON: {}", e))?;
    Ok(root
        .get(key)
        .and_then(|v| v.as_object())
        .map(|m| m.iter().map(|(n, e)| server_from_json(n, e)).collect())
        .unwrap_or_default())
}

fn parse_claude_json(body: &str, tier: ScopeTier) -> Result<Vec<McpServer>, String> {
    let root: serde_json::Value =
        serde_json::from_str(body).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    // Only two keys are ever read from this file. It also holds session
    // history and cost data, none of which enters memory.
    match tier {
        ScopeTier::Local => {
            let mut out = Vec::new();
            if let Some(projects) = root.get("projects").and_then(|v| v.as_object()) {
                for (repo_root, project) in projects {
                    if let Some(servers) = project.get("mcpServers").and_then(|v| v.as_object()) {
                        for (name, entry) in servers {
                            let mut s = server_from_json(name, entry);
                            s.project_root = Some(repo_root.clone());
                            out.push(s);
                        }
                    }
                }
            }
            Ok(out)
        }
        _ => Ok(root
            .get("mcpServers")
            .and_then(|v| v.as_object())
            .map(|m| m.iter().map(|(n, e)| server_from_json(n, e)).collect())
            .unwrap_or_default()),
    }
}

fn parse_codex_toml(body: &str) -> Result<Vec<McpServer>, String> {
    let root: toml::Value =
        toml::from_str(body).map_err(|e| format!("Failed to parse TOML: {}", e))?;

    let Some(table) = root.get("mcp_servers").and_then(|v| v.as_table()) else {
        return Ok(Vec::new());
    };

    let mut out = Vec::new();
    for (name, entry) in table {
        // `[mcp_servers]` itself may hold non-table keys; skip anything that
        // is not a server table.
        let Some(entry) = entry.as_table() else { continue };
        let command = entry
            .get("command")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let url = entry.get("url").and_then(|v| v.as_str());
        let env_keys = entry
            .get("env")
            .and_then(|v| v.as_table())
            .map(|t| t.keys().cloned().collect())
            .unwrap_or_default();
        out.push(McpServer {
            name: name.clone(),
            transport: transport_for(&command, url),
            command,
            env_keys,
            project_root: None,
        });
    }
    Ok(out)
}

/// Parse `body` according to `dialect`.
///
/// `Ok(vec![])` means the file was well-formed but declared no servers — the
/// caller warns. `Err` means the file could not be parsed at all.
pub fn parse(body: &str, dialect: Dialect, tier: ScopeTier) -> Result<Vec<McpServer>, String> {
    match dialect {
        Dialect::McpServers => parse_json_map(body, "mcpServers"),
        Dialect::VsCodeServers => parse_json_map(body, "servers"),
        Dialect::ZedContextServers => parse_json_map(body, "context_servers"),
        Dialect::CodexToml => parse_codex_toml(body),
        Dialect::ClaudeJson => parse_claude_json(body, tier),
    }
}
