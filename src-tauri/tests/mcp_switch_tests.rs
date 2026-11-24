//! Switching an MCP server off and on: which engines Hanger may switch, and how.
//!
//! Plan: docs/plans/2026-11-24-context-control.md
//! Evidence for every row: docs/plans/2026-11-24-context-control-engine-matrix.md

use std::collections::HashSet;

use tauri_app_lib::mcp::registry::{self, ScopeTier, SwitchKind};

/// The kind a host is switched by at one tier, or `None` where it has no switch.
fn kind_at(host_id: &str, tier: ScopeTier) -> Option<SwitchKind> {
    registry::switch_for(host_id, tier).map(|row| row.kind)
}

/// A key written into the server's own declaration.
fn is_a_key_in_the_file(kind: SwitchKind) -> bool {
    matches!(kind, SwitchKind::EnabledKey | SwitchKind::DisabledKey)
}

#[test]
fn every_switch_row_names_a_host() {
    assert!(!registry::SWITCHES.is_empty(), "the switch table is empty, so the loop below checks nothing");
    for row in registry::SWITCHES {
        assert!(
            registry::host_by_id(row.host_id).is_some(),
            "switch row names {}, which is not in registry::HOSTS",
            row.host_id
        );
    }
}

#[test]
fn every_switch_row_says_what_confirmed_it() {
    assert!(!registry::SWITCHES.is_empty(), "the switch table is empty, so the loop below checks nothing");
    for row in registry::SWITCHES {
        // The text is prose that gets re-dated, so only its presence is
        // pinned: a row with no evidence is a guess about someone's config.
        assert!(
            !row.confirmed.trim().is_empty(),
            "the {} row does not say which engine version and date confirmed it",
            row.host_id
        );
    }
}

#[test]
fn switch_rows_are_unique_per_host_and_tier() {
    assert!(!registry::SWITCHES.is_empty(), "the switch table is empty, so the loop below checks nothing");
    let mut seen = HashSet::new();
    for row in registry::SWITCHES {
        assert!(!row.tiers.is_empty(), "the {} row covers no tier, so it switches nothing", row.host_id);
        for tier in row.tiers {
            assert!(
                seen.insert((row.host_id, *tier)),
                "{} at {:?} has two switch rows; switch_for could only ever return the first",
                row.host_id,
                tier
            );
        }
    }
}

#[test]
fn codex_is_switchable_at_both_scopes() {
    // `enabled = false` reads `disabled` in `codex mcp list` from the global
    // file and from a trusted project's file alike.
    assert_eq!(kind_at("codex", ScopeTier::Global), Some(SwitchKind::EnabledKey));
    assert_eq!(kind_at("codex", ScopeTier::Project), Some(SwitchKind::EnabledKey));
    // Codex declares servers at no other tier, so a switch there would have
    // no file to write.
    for tier in [ScopeTier::Local, ScopeTier::User] {
        assert!(
            registry::switch_for("codex", tier).is_none(),
            "codex has a switch at {:?}, a tier it declares no servers in",
            tier
        );
    }
}

#[test]
fn gemini_is_never_switched_by_a_key_in_the_file() {
    // Positive first: a table with no gemini row would pass the loop below
    // without looking at anything.
    assert_eq!(kind_at("gemini", ScopeTier::Global), Some(SwitchKind::GeminiEnablementFile));
    for row in registry::SWITCHES.iter().filter(|row| row.host_id == "gemini") {
        assert!(
            !is_a_key_in_the_file(row.kind),
            "gemini 0.56.0 rejects its whole settings file over an unrecognised key; got {:?}",
            row.kind
        );
    }
}

#[test]
fn claude_code_is_never_switched_by_a_key_in_the_file() {
    assert_eq!(kind_at("claude-code", ScopeTier::User), Some(SwitchKind::ClaudeCli));
    for row in registry::SWITCHES.iter().filter(|row| row.host_id == "claude-code") {
        assert!(
            !is_a_key_in_the_file(row.kind),
            "claude 2.1.331 ignores a flag in the file and starts the server anyway; got {:?}",
            row.kind
        );
    }
}

#[test]
fn a_host_with_no_row_is_read_only() {
    for host_id in ["cursor", "opencode"] {
        // The id has to be a real host, or `None` below is only a typo.
        assert!(registry::host_by_id(host_id).is_some(), "{} is not in registry::HOSTS", host_id);
        assert!(
            registry::switch_for(host_id, ScopeTier::Global).is_none(),
            "{} has a switch row, and nothing in the engine matrix confirms one",
            host_id
        );
    }
}

#[test]
fn gemini_project_servers_have_no_switch() {
    // The global switch exists, so `None` at Project is a fact about the tier
    // and not about a lookup that finds nothing.
    assert!(registry::switch_for("gemini", ScopeTier::Global).is_some());
    assert!(registry::switch_for("gemini", ScopeTier::Project).is_none());
}

#[test]
fn claude_code_is_switchable_at_user_scope_only() {
    assert!(registry::switch_for("claude-code", ScopeTier::User).is_some());
    for tier in [ScopeTier::Global, ScopeTier::Local, ScopeTier::Project] {
        assert!(
            registry::switch_for("claude-code", tier).is_none(),
            "claude-code has a switch at {:?}; only user scope is covered",
            tier
        );
    }
}
