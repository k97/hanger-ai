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
