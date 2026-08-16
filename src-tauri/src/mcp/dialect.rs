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

/// Strip `//` and `/* */` comments and trailing commas so `serde_json` can
/// read a JSONC file. String literals are respected, so a `//` inside a value
/// — a URL, say — survives. A no-op on strict JSON, so every JSON parse in
/// this module runs input through it: it costs one pass and removes a whole
/// class of silent miss (a commented config reading as zero servers).
pub fn strip_jsonc(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    let mut in_string = false;
    let mut escaped = false;

    while let Some(c) = chars.next() {
        if in_string {
            out.push(c);
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == '"' {
                in_string = false;
            }
            continue;
        }
        match c {
            '"' => {
                in_string = true;
                out.push(c);
            }
            '/' if chars.peek() == Some(&'/') => {
                for n in chars.by_ref() {
                    if n == '\n' {
                        out.push('\n');
                        break;
                    }
                }
            }
            '/' if chars.peek() == Some(&'*') => {
                chars.next();
                let mut prev = '\0';
                for n in chars.by_ref() {
                    if prev == '*' && n == '/' {
                        break;
                    }
                    prev = n;
                }
            }
            _ => out.push(c),
        }
    }

    strip_trailing_commas(&out)
}

/// Remove a comma that is followed only by whitespace and a closing brace or
/// bracket. Runs after comment stripping, and skips string contents.
fn strip_trailing_commas(input: &str) -> String {
    let bytes: Vec<char> = input.chars().collect();
    let mut out = String::with_capacity(input.len());
    let mut in_string = false;
    let mut escaped = false;

    for (i, &c) in bytes.iter().enumerate() {
        if in_string {
            out.push(c);
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == '"' {
                in_string = false;
            }
            continue;
        }
        if c == '"' {
            in_string = true;
            out.push(c);
            continue;
        }
        if c == ',' {
            let next = bytes[i + 1..].iter().find(|ch| !ch.is_whitespace());
            if matches!(next, Some('}') | Some(']')) {
                continue;
            }
        }
        out.push(c);
    }
    out
}

/// Turn a `{name: {...}}` object into servers. Shared by every dialect whose
/// servers live under one flat key — `McpServers`, `VsCodeServers`,
/// `OpenCodeMcp`, `AmpSettingsKey`, and the non-local tier of `ClaudeJson`.
fn collect_named_servers(map: Option<&serde_json::Value>) -> Vec<McpServer> {
    map.and_then(|v| v.as_object())
        .map(|m| m.iter().map(|(n, e)| server_from_json(n, e)).collect())
        .unwrap_or_default()
}

/// Read a `{name: {...}}` object living under `key`.
fn parse_json_map(body: &str, key: &str) -> Result<Vec<McpServer>, String> {
    let root: serde_json::Value = serde_json::from_str(&strip_jsonc(body))
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;
    Ok(collect_named_servers(root.get(key)))
}

/// OpenCode's `type: "local"` servers declare `command` as `["run", "me"]` —
/// the executable and its arguments together in one array — where every other
/// dialect `server_from_json` reads uses a string `command` plus a separate
/// `args` array. Left alone, `entry.get("command")` finds an array where it
/// expects a string, `.as_str()` returns `None`, and the server is emitted
/// with an empty command: present in the inventory with nothing to run, and
/// no error anywhere.
///
/// Rewritten here, before the entry reaches the shared parser, so
/// `server_from_json` never has to know a second shape exists — it stays the
/// one function `McpServers`, `VsCodeServers`, `ZedContextServers`,
/// `ClaudeJson` and `AmpSettingsKey` also rely on, unwidened.
fn normalise_opencode_command(entry: &serde_json::Value) -> serde_json::Value {
    let Some(parts) = entry.get("command").and_then(|v| v.as_array()) else {
        // Not array-shaped — a remote server's `url`-only entry, or already
        // the string form. Nothing to normalise.
        return entry.clone();
    };
    let mut strings = parts.iter().filter_map(|v| v.as_str());
    let Some(command) = strings.next() else {
        return entry.clone();
    };
    let args: Vec<serde_json::Value> =
        strings.map(|s| serde_json::Value::String(s.to_string())).collect();

    let mut normalised = entry.clone();
    if let Some(obj) = normalised.as_object_mut() {
        obj.insert("command".to_string(), serde_json::Value::String(command.to_string()));
        obj.insert("args".to_string(), serde_json::Value::Array(args));
    }
    normalised
}

/// OpenCode's `mcp` key, with array-shaped `command` normalised first.
fn parse_opencode_mcp(body: &str) -> Result<Vec<McpServer>, String> {
    let root: serde_json::Value = serde_json::from_str(&strip_jsonc(body))
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;
    let servers = root
        .get("mcp")
        .and_then(|v| v.as_object())
        .map(|m| {
            m.iter()
                .map(|(name, entry)| server_from_json(name, &normalise_opencode_command(entry)))
                .collect()
        })
        .unwrap_or_default();
    Ok(servers)
}

/// Zed nests the launch under `command`: `{path, args, env}`, where every
/// other dialect `server_from_json` reads puts a string `command` at the entry
/// root with `args` and `env` beside it. Left alone, `entry.get("command")`
/// finds an object where it expects a string, `.as_str()` returns `None`, and
/// the server is emitted with an empty command and an "unknown" transport:
/// present in the inventory with nothing to run, and no error anywhere.
///
/// Rewritten here, before the entry reaches the shared parser, so
/// `server_from_json` never has to know a second shape exists.
///
/// Both shapes are in the wild — newer Zed writes the flat form — so an entry
/// that is already flat passes through untouched.
fn normalise_zed_command(entry: &serde_json::Value) -> serde_json::Value {
    let Some(nested) = entry.get("command").and_then(|v| v.as_object()) else {
        // Already flat, or a `url`-only remote entry. Nothing to normalise.
        return entry.clone();
    };
    let Some(path) = nested.get("path").and_then(|v| v.as_str()) else {
        return entry.clone();
    };

    let mut normalised = entry.clone();
    if let Some(obj) = normalised.as_object_mut() {
        obj.insert("command".to_string(), serde_json::Value::String(path.to_string()));
        // `args` and `env` are lifted out of the nested object too. Leaving
        // them there would read the entry root instead, where Zed puts
        // nothing — an empty arg list and no env names at all.
        if let Some(args) = nested.get("args") {
            obj.insert("args".to_string(), args.clone());
        }
        if let Some(env) = nested.get("env") {
            obj.insert("env".to_string(), env.clone());
        }
    }
    normalised
}

/// Zed's `context_servers` key, with a nested `command` normalised first.
fn parse_zed_context_servers(body: &str) -> Result<Vec<McpServer>, String> {
    let root: serde_json::Value = serde_json::from_str(&strip_jsonc(body))
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;
    let servers = root
        .get("context_servers")
        .and_then(|v| v.as_object())
        .map(|m| {
            m.iter()
                .map(|(name, entry)| server_from_json(name, &normalise_zed_command(entry)))
                .collect()
        })
        .unwrap_or_default();
    Ok(servers)
}

fn parse_claude_json(body: &str, tier: ScopeTier) -> Result<Vec<McpServer>, String> {
    let root: serde_json::Value = serde_json::from_str(&strip_jsonc(body))
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

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
        _ => Ok(collect_named_servers(root.get("mcpServers"))),
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
    let root: serde_json::Value = serde_json::from_str(&strip_jsonc(body))
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

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
        Dialect::ZedContextServers => parse_zed_context_servers(body),
        Dialect::CodexToml => parse_codex_toml(body),
        Dialect::ClaudeJson => parse_claude_json(body, tier),
        Dialect::ClaudeAiConnectors => parse_claude_ai_connectors(body),
        Dialect::OpenCodeMcp => parse_opencode_mcp(body),
        Dialect::AmpSettingsKey => parse_json_map(body, "amp.mcpServers"),
    }
}
