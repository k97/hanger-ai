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

// ─── Discovery ───────────────────────────────────────────────────────────────

use std::path::Path;
use tauri_app_lib::mcp::discover;

fn fixture_home() -> &'static Path {
    Path::new("tests/fixtures/mcp_home")
}

#[test]
fn discovery_finds_every_registration_in_the_fixture_home() {
    let result = discover::discover_machine(fixture_home());
    assert_eq!(
        result.registrations.len(),
        16,
        // 14 servers plus 2 Claude.ai connectors read from the same
        // ~/.claude.json by a different dialect.
        "expected 16 registrations, got {:#?}",
        result.registrations.iter().map(|r| (&r.server.name, r.host_id)).collect::<Vec<_>>()
    );
}

#[test]
fn library_resident_sources_are_read_despite_the_walk_exclusion() {
    let result = discover::discover_machine(fixture_home());
    let desktop: Vec<&str> = result
        .registrations
        .iter()
        .filter(|r| r.host_id == "claude-desktop")
        .map(|r| r.server.name.as_str())
        .collect();
    assert_eq!(desktop, vec!["spades-audio"]);

    let vscode: Vec<&str> = result
        .registrations
        .iter()
        .filter(|r| r.host_id == "vscode")
        .map(|r| r.server.name.as_str())
        .collect();
    assert_eq!(vscode, vec!["figma"], "VS Code's `servers` key must be read");
}

#[test]
fn the_walk_exclusion_itself_is_unchanged() {
    // The carve-out is "open registry paths directly", NOT "weaken
    // is_excluded". A Library path presented to the walk guard must still be
    // excluded.
    assert!(tauri_app_lib::scanner::is_excluded(Path::new(
        "/Users/x/Library/Application Support/Code/User/mcp.json"
    )));
}

#[test]
fn one_host_registering_the_same_server_twice_yields_two_registrations() {
    let result = discover::discover_machine(fixture_home());
    let spades: Vec<&str> = result
        .registrations
        .iter()
        .filter(|r| r.server.name == "spades-audio" && r.host_id == "claude-code")
        .map(|r| r.config_path.as_str())
        .collect();
    assert_eq!(
        spades.len(),
        2,
        "expected .claude.json and .claude/mcp.json, got {:?}",
        spades
    );
}

#[test]
fn plugin_marketplace_servers_are_discovered_through_the_glob() {
    let result = discover::discover_machine(fixture_home());
    let names: Vec<&str> = result
        .registrations
        .iter()
        .filter(|r| r.config_path.contains("marketplaces"))
        .map(|r| r.server.name.as_str())
        .collect();
    assert_eq!(names.len(), 2, "expected github and context7, got {:?}", names);
}

#[test]
fn local_tier_registrations_carry_their_project_root() {
    let result = discover::discover_machine(fixture_home());
    let local: Vec<(&str, &str)> = result
        .registrations
        .iter()
        .filter(|r| r.tier == ScopeTier::Local)
        .map(|r| (r.server.name.as_str(), r.server.project_root.as_deref().unwrap()))
        .collect();
    assert!(local.contains(&("repo-local", "/repo/tracked")), "got {:?}", local);
    assert!(local.contains(&("stray", "/repo/untracked")), "got {:?}", local);
}

#[test]
fn nothing_outside_the_two_mcp_keys_is_read_from_claude_json() {
    let result = discover::discover_machine(fixture_home());
    let rendered = format!("{:#?}", result.registrations);
    assert!(!rendered.contains("must never be read"));
}

#[test]
fn a_recognised_source_yielding_no_servers_warns_instead_of_vanishing() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join(".claude")).unwrap();
    // Valid JSON, recognised path, zero servers — the exact shape that made
    // VS Code's figma server disappear without trace.
    std::fs::write(dir.path().join(".claude/mcp.json"), "{}").unwrap();

    let result = discover::discover_machine(dir.path());
    assert!(
        result.warnings.iter().any(|w| w.contains("mcp.json")),
        "expected a warning naming the empty source, got {:?}",
        result.warnings
    );
}

#[test]
fn a_missing_source_is_silent() {
    let dir = tempfile::tempdir().unwrap();
    let result = discover::discover_machine(dir.path());
    assert!(result.registrations.is_empty());
    assert!(
        result.warnings.is_empty(),
        "absent files must not warn: {:?}",
        result.warnings
    );
}

#[test]
fn codex_toml_reads_both_mcp_servers_and_the_legacy_tools_table() {
    // Current Codex writes [mcp_servers.*]. Hanger's own fixture -- and the
    // URL-credential sanitisation assertion attached to it -- uses [tools.*].
    // Supporting both is strictly additive and loses nothing.
    let body = r#"
[tools.git-reader]
command = "git"
url = "http://fake-user:fake-pass@localhost:9000/codex?secret=abc&token=my_token"

[tools.file-writer]
command = "fs"

[mcp_servers.modern]
command = "node"
"#;
    let servers = dialect::parse(body, Dialect::CodexToml, ScopeTier::Global).unwrap();
    assert_eq!(names(&servers), vec!["file-writer", "git-reader", "modern"]);

    let git = servers.iter().find(|s| s.name == "git-reader").unwrap();
    assert_eq!(
        git.transport, "http://localhost:9000/codex",
        "userinfo and query string must be stripped"
    );
}

// ─── Arguments ───────────────────────────────────────────────────────────────

#[test]
fn args_are_captured_because_a_command_alone_cannot_start_a_server() {
    // ~/.claude.json declares spades-audio as `node <path>`. Storing only
    // "node" makes the Verify probe launch a bare Node REPL that never speaks
    // MCP -- the command is meaningless without its arguments.
    let body = r#"{"mcpServers": {"spades-audio": {
        "command": "node",
        "args": ["/Applications/Spades Audio.app/Contents/Resources/mcp-server/dist/index.js"]
    }}}"#;
    let servers = dialect::parse(body, Dialect::McpServers, ScopeTier::Global).unwrap();
    assert_eq!(
        servers[0].args,
        vec!["/Applications/Spades Audio.app/Contents/Resources/mcp-server/dist/index.js"]
    );
}

#[test]
fn codex_toml_captures_args_from_both_spellings() {
    let body = r#"
[mcp_servers.computer-use]
command = "codex"
args = ["mcp"]

[tools.legacy]
command = "git"
args = ["--version", "--quiet"]
"#;
    let servers = dialect::parse(body, Dialect::CodexToml, ScopeTier::Global).unwrap();
    let modern = servers.iter().find(|s| s.name == "computer-use").unwrap();
    assert_eq!(modern.args, vec!["mcp"]);
    let legacy = servers.iter().find(|s| s.name == "legacy").unwrap();
    assert_eq!(legacy.args, vec!["--version", "--quiet"]);
}

#[test]
fn a_server_with_no_args_gets_an_empty_list_not_a_missing_field() {
    let body = r#"{"mcpServers": {"bare": {"command": "node"}}}"#;
    let servers = dialect::parse(body, Dialect::McpServers, ScopeTier::Global).unwrap();
    assert!(servers[0].args.is_empty());
}

// ─── Claude.ai connectors ────────────────────────────────────────────────────

#[test]
fn claude_ai_connectors_are_discovered_from_the_breadcrumb() {
    // Account-level connectors live on Anthropic's servers, not on disk, so
    // there is no config file to read. What IS on disk is the list of ones ever
    // connected. Ignoring it means Hanger claims to show every MCP server while
    // silently omitting seven of them.
    let body = r#"{
      "claudeAiMcpEverConnected": [
        "claude.ai Google Drive",
        "claude.ai mei-recipes",
        "claude.ai Notion"
      ],
      "mcpServers": {"local-one": {"command": "node"}}
    }"#;
    let servers = dialect::parse(body, Dialect::ClaudeAiConnectors, ScopeTier::Global).unwrap();
    assert_eq!(names(&servers), vec!["Google Drive", "Notion", "mei-recipes"]);
}

#[test]
fn a_connector_carries_no_command_because_there_is_nothing_local_to_run() {
    let body = r#"{"claudeAiMcpEverConnected": ["claude.ai Gmail"]}"#;
    let servers = dialect::parse(body, Dialect::ClaudeAiConnectors, ScopeTier::Global).unwrap();
    assert_eq!(servers[0].name, "Gmail");
    assert!(servers[0].command.is_empty());
    assert!(servers[0].args.is_empty());
    assert_eq!(
        servers[0].transport, "claude.ai",
        "transport must say where it actually lives"
    );
}

#[test]
fn a_file_with_no_connector_breadcrumb_yields_none() {
    let servers = dialect::parse(r#"{"mcpServers":{}}"#, Dialect::ClaudeAiConnectors, ScopeTier::Global).unwrap();
    assert!(servers.is_empty());
}

#[test]
fn the_registry_declares_claude_ai_as_a_host() {
    let host = registry::host_by_id("claude-ai").expect("claude-ai host");
    assert_eq!(host.kind, HostKind::McpHost);
    assert!(
        registry::SOURCES.iter().any(|s| s.dialect == Dialect::ClaudeAiConnectors),
        "no source reads the connector breadcrumb"
    );
}

// ─── Transports ──────────────────────────────────────────────────────────────

/// Every dialect must read a `url` declaration as a remote server, not skip it.
/// A server is a server whether it is spawned or dialled.
#[test]
fn http_servers_are_discovered_by_every_json_dialect() {
    let cases = [
        (Dialect::McpServers, r#"{"mcpServers":{"remote":{"url":"https://api.example.com/mcp"}}}"#),
        (Dialect::VsCodeServers, r#"{"servers":{"remote":{"type":"http","url":"https://api.example.com/mcp"}}}"#),
        (Dialect::ZedContextServers, r#"{"context_servers":{"remote":{"url":"https://api.example.com/mcp"}}}"#),
        (Dialect::ClaudeJson, r#"{"mcpServers":{"remote":{"url":"https://api.example.com/mcp"}}}"#),
    ];
    for (dialect, body) in cases {
        let servers = dialect::parse(body, dialect, ScopeTier::Global)
            .unwrap_or_else(|e| panic!("{:?} failed: {}", dialect, e));
        assert_eq!(servers.len(), 1, "{:?} found no remote server", dialect);
        assert_eq!(servers[0].transport, "https://api.example.com/mcp", "{:?}", dialect);
        assert!(servers[0].command.is_empty(), "{:?} invented a command", dialect);
    }
}

#[test]
fn codex_toml_discovers_http_servers_too() {
    let body = r#"
[mcp_servers.remote]
url = "https://api.example.com/mcp"

[mcp_servers.local]
command = "node"
args = ["server.js"]
"#;
    let servers = dialect::parse(body, Dialect::CodexToml, ScopeTier::Global).unwrap();
    let remote = servers.iter().find(|s| s.name == "remote").unwrap();
    let local = servers.iter().find(|s| s.name == "local").unwrap();
    assert_eq!(remote.transport, "https://api.example.com/mcp");
    assert_eq!(local.transport, "stdio");
    assert_eq!(local.args, vec!["server.js"]);
}

#[test]
fn a_mixed_file_yields_both_transports_side_by_side() {
    // The real shape of a repo .mcp.json next to a machine config: stdio and
    // http servers coexist and both must be listed.
    let body = r#"{"mcpServers": {
        "mei-recipes": {"url": "https://mei-recipes-api.example.workers.dev/mcp"},
        "spades-audio": {"command": "node", "args": ["/Applications/x/index.js"]}
    }}"#;
    let servers = dialect::parse(body, Dialect::McpServers, ScopeTier::Project).unwrap();
    assert_eq!(names(&servers), vec!["mei-recipes", "spades-audio"]);
    let remote = servers.iter().find(|s| s.name == "mei-recipes").unwrap();
    assert!(remote.transport.starts_with("https://"));
    assert!(remote.command.is_empty(), "a remote server has nothing to spawn");
}
