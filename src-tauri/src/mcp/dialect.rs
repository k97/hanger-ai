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
    /// Arguments the command needs to actually be a server.
    ///
    /// Not decoration: `~/.claude.json` declares spades-audio as
    /// `node <path-to-index.js>`. Keeping only the command would make Verify
    /// launch a bare Node REPL that never speaks MCP.
    pub args: Vec<String>,
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
pub(crate) fn sanitise_url(url_str: &str) -> String {
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

fn args_json(entry: &serde_json::Value) -> Vec<String> {
    entry
        .get("args")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(str::to_string))
                .collect()
        })
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
        args: args_json(entry),
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

/// Read servers from one TOML table of `{name = {command, url, env}}`.
fn servers_from_toml_table(table: &toml::value::Table, out: &mut Vec<McpServer>) {
    for (name, entry) in table {
        // The table may hold non-table keys (`[tools] web_search = true`);
        // anything that is not a server table is skipped.
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
        let args = entry
            .get("args")
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|x| x.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default();
        out.push(McpServer {
            name: name.clone(),
            transport: transport_for(&command, url),
            command,
            args,
            env_keys,
            project_root: None,
        });
    }
}

/// Codex TOML, both spellings.
///
/// Current Codex writes `[mcp_servers.*]`. `[tools.*]` is the older spelling
/// and is still what Hanger's own fixture carries, including the
/// credential-laden URL that covers `docs/scanning.md` §7. Reading both is
/// strictly additive: a file may use either or both, and nothing is lost.
fn parse_codex_toml(body: &str) -> Result<Vec<McpServer>, String> {
    let root: toml::Value =
        toml::from_str(body).map_err(|e| format!("Failed to parse TOML: {}", e))?;

    let mut out = Vec::new();
    for key in ["mcp_servers", "tools"] {
        if let Some(table) = root.get(key).and_then(|v| v.as_table()) {
            servers_from_toml_table(table, &mut out);
        }
    }
    Ok(out)
}

/// Read `claudeAiMcpEverConnected` — the connectors this account has attached.
///
/// Entries look like `"claude.ai Notion"`. The prefix names the host, which the
/// registration already records, so it is stripped from the server name.
///
/// There is deliberately no command: a connector runs on Anthropic's servers
/// and nothing local can start it. `transport` says "claude.ai" so the panel
/// can be honest about where it lives rather than implying a local process.
fn parse_claude_ai_connectors(body: &str) -> Result<Vec<McpServer>, String> {
    let root: serde_json::Value =
        serde_json::from_str(body).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    Ok(root
        .get("claudeAiMcpEverConnected")
        .and_then(|v| v.as_array())
        .map(|list| {
            list.iter()
                .filter_map(|v| v.as_str())
                .map(|raw| McpServer {
                    name: raw.strip_prefix("claude.ai ").unwrap_or(raw).to_string(),
                    command: String::new(),
                    args: Vec::new(),
                    transport: "claude.ai".to_string(),
                    env_keys: Vec::new(),
                    project_root: None,
                })
                .collect()
        })
        .unwrap_or_default())
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
        Dialect::ClaudeAiConnectors => parse_claude_ai_connectors(body),
    }
}
