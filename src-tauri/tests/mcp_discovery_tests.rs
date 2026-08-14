//! MCP discovery: registry shape, dialect parsing, and filesystem resolution.
//!
//! Spec: docs/superpowers/specs/2026-08-14-mcp-server-visibility-design.md
//! Plan: docs/superpowers/plans/2026-08-14-mcp-discovery-correctness.md

use tauri_app_lib::mcp::registry::{self, Dialect, HostKind, ScopeTier, SourceLocation};

#[test]
fn registry_declares_every_known_host() {
    let ids: Vec<&str> = registry::HOSTS.iter().map(|h| h.id).collect();
    for expected in [
        "claude-code",
        "codex",
        "gemini",
        "claude-desktop",
        "vscode",
        "cursor",
        "windsurf",
        "zed",
    ] {
        assert!(ids.contains(&expected), "registry is missing host {}", expected);
    }
}

#[test]
fn agent_hosts_are_separated_from_mcp_only_hosts() {
    let kind = |id: &str| registry::host_by_id(id).unwrap().kind;
    assert_eq!(kind("claude-code"), HostKind::Agent);
    assert_eq!(kind("codex"), HostKind::Agent);
    assert_eq!(kind("gemini"), HostKind::Agent);
    assert_eq!(kind("claude-desktop"), HostKind::McpHost);
    assert_eq!(kind("vscode"), HostKind::McpHost);
    assert_eq!(kind("cursor"), HostKind::McpHost);
}

#[test]
fn every_source_names_a_declared_host() {
    for source in registry::SOURCES {
        assert!(
            registry::host_by_id(source.host_id).is_some(),
            "source {} names unknown host {}",
            source.path,
            source.host_id
        );
    }
}

#[test]
fn claude_json_supplies_both_user_and_local_tiers() {
    let tiers: Vec<ScopeTier> = registry::SOURCES
        .iter()
        .filter(|s| s.path.contains(".claude.json"))
        .map(|s| s.tier)
        .collect();
    assert!(
        tiers.contains(&ScopeTier::User),
        "expected a user-tier .claude.json source"
    );
    assert!(
        tiers.contains(&ScopeTier::Local),
        "expected a local-tier .claude.json source"
    );
}

#[test]
fn vscode_and_codex_declare_their_own_dialects() {
    let dialect_for = |needle: &str| {
        registry::SOURCES
            .iter()
            .find(|s| s.path.contains(needle))
            .unwrap_or_else(|| panic!("no source matching {}", needle))
            .dialect
    };
    assert_eq!(dialect_for("Code/User/mcp.json"), Dialect::VsCodeServers);
    assert_eq!(dialect_for(".codex/config.toml"), Dialect::CodexToml);
    assert_eq!(dialect_for("zed/settings.json"), Dialect::ZedContextServers);
}

#[test]
fn repo_relative_sources_use_relative_paths() {
    for source in registry::SOURCES {
        if source.location == SourceLocation::RepoRelative {
            assert!(
                !source.path.starts_with('/') && !source.path.starts_with('~'),
                "repo-relative source {} must not be absolute",
                source.path
            );
        }
    }
}

// ─── Dialects ────────────────────────────────────────────────────────────────

use tauri_app_lib::mcp::dialect::{self, McpServer};

fn names(servers: &[McpServer]) -> Vec<String> {
    let mut n: Vec<String> = servers.iter().map(|s| s.name.clone()).collect();
    n.sort();
    n
}

#[test]
fn codex_toml_reads_mcp_servers_not_tools() {
    // The real shape of ~/.codex/config.toml. The pre-existing parser read a
    // `tools` key and found nothing here.
    let body = r#"
[features]
web_search = true

[mcp_servers]
[mcp_servers.node_repl]
command = "node"
args = ["--experimental-repl"]
[mcp_servers.node_repl.env]
NODE_OPTIONS = "--max-old-space-size=4096"

[mcp_servers.computer-use]
command = "codex"
args = [ "mcp" ]

[mcp_servers.tauri]
command = "npx @hypothesi/tauri-mcp-server"
args = []
"#;
    let servers = dialect::parse(body, Dialect::CodexToml, ScopeTier::Global).unwrap();
    assert_eq!(names(&servers), vec!["computer-use", "node_repl", "tauri"]);
}

#[test]
fn codex_toml_captures_env_names_but_never_values() {
    let body = r#"
[mcp_servers.secretive]
command = "node"
[mcp_servers.secretive.env]
API_KEY = "sk-live-do-not-store-this"
"#;
    let servers = dialect::parse(body, Dialect::CodexToml, ScopeTier::Global).unwrap();
    assert_eq!(servers[0].env_keys, vec!["API_KEY"]);
    let rendered = format!("{:?}", servers);
    assert!(!rendered.contains("sk-live"), "env value leaked into the domain struct");
}

#[test]
fn vscode_servers_key_is_read() {
    let body = r#"{"servers": {"figma": {"type": "http", "url": "https://mcp.figma.com/mcp"}}}"#;
    let servers = dialect::parse(body, Dialect::VsCodeServers, ScopeTier::Global).unwrap();
    assert_eq!(servers.len(), 1);
    assert_eq!(servers[0].name, "figma");
    assert_eq!(servers[0].transport, "https://mcp.figma.com/mcp");
}

#[test]
fn zed_context_servers_key_is_read() {
    let body = r#"{"context_servers": {"local-tool": {"command": "node"}}}"#;
    let servers = dialect::parse(body, Dialect::ZedContextServers, ScopeTier::Global).unwrap();
    assert_eq!(names(&servers), vec!["local-tool"]);
}

#[test]
fn claude_json_user_tier_reads_only_top_level_mcp_servers() {
    let body = r#"{
      "mcpServers": {"spades-audio": {"command": "node"}, "tauri": {"command": "npx tauri-mcp"}},
      "projects": {"/repo/a": {"mcpServers": {"local-only": {"command": "node"}}}},
      "history": [{"display": "secret prompt text"}]
    }"#;
    let servers = dialect::parse(body, Dialect::ClaudeJson, ScopeTier::User).unwrap();
    assert_eq!(names(&servers), vec!["spades-audio", "tauri"]);
    assert!(servers.iter().all(|s| s.project_root.is_none()));
    assert!(!format!("{:?}", servers).contains("secret prompt text"));
}

#[test]
fn claude_json_local_tier_reads_only_project_keyed_servers() {
    let body = r#"{
      "mcpServers": {"user-wide": {"command": "node"}},
      "projects": {
        "/repo/a": {"mcpServers": {"local-only": {"command": "node"}}},
        "/repo/b": {"mcpServers": {}}
      }
    }"#;
    let servers = dialect::parse(body, Dialect::ClaudeJson, ScopeTier::Local).unwrap();
    assert_eq!(names(&servers), vec!["local-only"]);
    assert_eq!(servers[0].project_root.as_deref(), Some("/repo/a"));
}

#[test]
fn url_credentials_are_stripped_from_transport() {
    let body = r#"{"mcpServers": {"remote": {"url": "https://user:pw@example.com/mcp?api_key=123"}}}"#;
    let servers = dialect::parse(body, Dialect::McpServers, ScopeTier::Global).unwrap();
    assert_eq!(servers[0].transport, "https://example.com/mcp");
}

#[test]
fn a_recognised_file_with_no_servers_is_an_empty_success_not_an_error() {
    // Callers distinguish "parsed, zero servers" (warn) from "failed to parse"
    // (error). Both were previously indistinguishable Ok(0).
    let servers = dialect::parse("{}", Dialect::McpServers, ScopeTier::Global).unwrap();
    assert!(servers.is_empty());
}

#[test]
fn malformed_json_is_an_error() {
    assert!(dialect::parse("{ not json", Dialect::McpServers, ScopeTier::Global).is_err());
}

// ─── Host kind is derived, never stored ──────────────────────────────────────

#[test]
fn engine_kind_derives_from_the_registry_not_the_database() {
    // `kind` is a compile-time fact about what a program IS, not per-machine
    // state. Storing it in the `engines` table would duplicate this registry
    // in SQLite and require a schema migration to correct a typo.
    assert_eq!(registry::host_by_engine_key("claude_code").unwrap().kind, HostKind::Agent);
    assert_eq!(registry::host_by_engine_key("codex").unwrap().kind, HostKind::Agent);
    assert_eq!(registry::host_by_engine_key("claude_desktop").unwrap().kind, HostKind::McpHost);
    assert_eq!(registry::host_by_engine_key("vscode").unwrap().kind, HostKind::McpHost);
    assert!(registry::host_by_engine_key("nonexistent").is_none());
}

#[test]
fn engine_keys_are_underscored_and_round_trip_to_their_host() {
    for host in registry::HOSTS {
        let key = host.engine_key();
        assert!(!key.contains('-'), "engine key {} must not contain hyphens", key);
        assert_eq!(
            registry::host_by_engine_key(&key).unwrap().id,
            host.id,
            "engine key {} did not round-trip", key
        );
    }
}

// ─── Engine key resolution ───────────────────────────────────────────────────

#[test]
fn unknown_engine_ids_are_not_silently_filed_under_gemini() {
    assert_eq!(tauri_app_lib::scanner::get_engine_key("claude-code"), Some("claude_code"));
    assert_eq!(tauri_app_lib::scanner::get_engine_key("codex"), Some("codex"));
    assert_eq!(tauri_app_lib::scanner::get_engine_key("gemini"), Some("gemini"));

    // The regression this test exists for: these previously all returned
    // "gemini" via a `_ =>` catch-all, which would misattribute every
    // MCP-only host's servers to the Gemini engine while looking like it
    // worked.
    assert_eq!(tauri_app_lib::scanner::get_engine_key("claude-desktop"), None);
    assert_eq!(tauri_app_lib::scanner::get_engine_key("vscode"), None);
    assert_eq!(tauri_app_lib::scanner::get_engine_key("totally-unknown"), None);
}

#[test]
fn scanner_and_registry_agree_on_every_engine_key_they_both_know() {
    // scanner::get_engine_key covers every engine Hanger records, including
    // rules-only ones like copilot that declare no MCP servers. The MCP
    // registry covers MCP hosts. The sets overlap but are not equal, so the
    // invariant to enforce is agreement on the intersection, not identity.
    for host in registry::HOSTS {
        if let Some(scanner_key) = tauri_app_lib::scanner::get_engine_key(host.id) {
            assert_eq!(
                scanner_key,
                host.engine_key(),
                "scanner and registry disagree on the engine key for {}",
                host.id
            );
        }
    }
}
