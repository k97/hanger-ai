use tauri_app_lib::mcp::agreement::Agreement;
use tauri_app_lib::mcp::dialect::{self, McpServer};
use tauri_app_lib::mcp::discover::Registration;
use tauri_app_lib::mcp::registry::ScopeTier;
use tauri_app_lib::mcp::servers::group_servers;

fn v(xs: &[&str]) -> Vec<String> {
    xs.iter().map(|s| s.to_string()).collect()
}

fn stdio_reg_in(name: &str, host_id: &'static str, command: &str, args: &[&str]) -> Registration {
    Registration {
        server: McpServer {
            name: name.to_string(),
            command: command.to_string(),
            args: v(args),
            transport: "stdio".to_string(),
            env_keys: Vec::new(),
            project_root: None,
            bridged: false,
            url_fingerprint: None,
        },
        host_id,
        tier: ScopeTier::Global,
        config_path: "/test/config.json".to_string(),
    }
}

/// A `ScopeTier::Local` registration — Claude Code's own per-project tier,
/// keyed to `project_root`, living in the same `.claude.json` a `Global`/
/// `User` declaration of the same name would. `project_root` is set only for
/// this shape (`dialect.rs:31-32`'s own doc comment).
fn local_reg(name: &str, host_id: &'static str, command: &str, project_root: &str) -> Registration {
    Registration {
        server: McpServer {
            name: name.to_string(),
            command: command.to_string(),
            args: Vec::new(),
            transport: "stdio".to_string(),
            env_keys: Vec::new(),
            project_root: Some(project_root.to_string()),
            bridged: false,
            url_fingerprint: None,
        },
        host_id,
        tier: ScopeTier::Local,
        config_path: "/test/.claude.json".to_string(),
    }
}

fn http_reg(name: &str, url: &str) -> Registration {
    Registration {
        server: McpServer {
            name: name.to_string(),
            command: String::new(),
            args: Vec::new(),
            // The real parser never stores the raw URL as `transport` — every
            // remote registration goes through `transport_for`, which
            // sanitises it. A fixture that skips that step tests a launch
            // shape production never produces.
            transport: dialect::sanitise_url(url),
            env_keys: Vec::new(),
            project_root: None,
            bridged: false,
            // The precomputed fingerprint of the raw URL, exactly as the
            // real parser sets it — the one place the query string this
            // fixture is testing for still survives.
            url_fingerprint: Some(dialect::url_fingerprint(url)),
        },
        host_id: "test-http-host",
        tier: ScopeTier::Global,
        config_path: "/test/config.json".to_string(),
    }
}

#[test]
fn a_server_registered_in_three_engines_is_one_row_carrying_the_count() {
    let rows = group_servers(&[
        stdio_reg_in("tauri", "claude-code", "npx", &["-y", "@tauri/mcp@2.9.1"]),
        stdio_reg_in("tauri", "codex", "npx", &["-y", "@tauri/mcp@2.9.1"]),
        stdio_reg_in("tauri", "gemini", "npx", &["-y", "@tauri/mcp@2.9.1"]),
    ]);
    assert_eq!(rows.len(), 1, "one server");
    assert_eq!(rows[0].registration_count, 3, "three registrations");
    assert_eq!(rows[0].distinct_spec_count, 1, "all three agree");
}

#[test]
fn grouping_is_by_name_and_never_by_launch_spec() {
    // Grouping by spec would split `tauri` back into two rows, which is the
    // bug this stage exists to fix. The spec detects divergence INSIDE a
    // group; it does not form one.
    let rows = group_servers(&[
        stdio_reg_in("tauri", "claude-code", "npx", &["-y", "@tauri/mcp@latest"]),
        stdio_reg_in("tauri", "codex", "npx", &["-y", "@tauri/mcp@2.9.1"]),
    ]);
    assert_eq!(rows.len(), 1, "one server, two specs");
    assert_eq!(rows[0].distinct_spec_count, 2);
    assert_eq!(rows[0].agreement, Agreement::Conflicting);
}

#[test]
fn whitespace_is_trimmed_but_case_is_not_folded() {
    let rows = group_servers(&[
        stdio_reg_in("Notion", "claude-ai", "npx", &["-y", "notion"]),
        stdio_reg_in("notion", "codex", "npx", &["-y", "notion"]),
    ]);
    assert_eq!(rows.len(), 2, "Notion and notion stay separate rows");
    assert!(
        rows.iter().any(|r| !r.aliased_with.is_empty()),
        "and are reported aliased, since their specs match"
    );
}

#[test]
fn two_remote_registrations_differing_only_by_query_string_still_conflict() {
    // The fingerprint Task 3 added is why this works. Grouping from `Tool`
    // instead of `Registration` would drop it and this would read consistent.
    let rows = group_servers(&[
        http_reg("github", "https://api.example.com/mcp?region=eu"),
        http_reg("github", "https://api.example.com/mcp?region=us"),
    ]);
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].agreement, Agreement::Conflicting);
}

// §6.3 state 9: a project-scope override of a user-scope name is a finding
// to surface, never a silent merge. `group_servers` still folds both into
// one row by name (that grouping is correct, per this same file's first
// test) — `project_override` is the additional signal that lets the
// frontend say WHY there are two, rather than leaving the misleading
// `Duplicate`/`Conflicting` sentence stand as the only explanation.

#[test]
fn a_local_tier_registration_alongside_a_wider_one_is_flagged_as_a_project_override() {
    let rows = group_servers(&[
        stdio_reg_in("tauri", "claude-code", "npx", &["-y", "@tauri/mcp@2.9.1"]),
        local_reg("tauri", "claude-code", "npx", "/Users/karthik/Work/hanger-ai"),
    ]);
    assert_eq!(rows.len(), 1, "still one row — grouping by name is unchanged");
    assert_eq!(rows[0].registration_count, 2, "nothing lost from the count");
    assert_eq!(
        rows[0].project_override,
        Some("/Users/karthik/Work/hanger-ai".to_string())
    );
}

#[test]
fn no_override_when_every_registration_of_the_name_is_local_tier() {
    // Two projects, no wider declaration anywhere — nothing here is
    // overriding anything; there is no user-wide default to supersede.
    let rows = group_servers(&[
        local_reg("tauri", "claude-code", "npx", "/Users/a/repo-one"),
        local_reg("tauri", "claude-code", "npx", "/Users/a/repo-two"),
    ]);
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].project_override, None);
}

#[test]
fn no_override_when_every_registration_shares_one_wider_tier() {
    // The ordinary multi-engine case this file's own first test covers —
    // no Local-tier registration anywhere, so nothing to flag.
    let rows = group_servers(&[
        stdio_reg_in("tauri", "claude-code", "npx", &["-y", "@tauri/mcp@2.9.1"]),
        stdio_reg_in("tauri", "codex", "npx", &["-y", "@tauri/mcp@2.9.1"]),
    ]);
    assert_eq!(rows[0].project_override, None);
}

#[test]
fn the_override_survives_a_conflicting_verdict_too() {
    // The Local-tier declaration deliberately differs from the user-wide
    // one (that IS the point of a project-specific pin) — `agreement_for`
    // correctly still reports `Conflicting` (different launch specs), and
    // `project_override` is the independent signal that explains WHY,
    // rather than leaving "different launch specs" as the only story.
    let rows = group_servers(&[
        stdio_reg_in("tauri", "claude-code", "npx", &["-y", "@tauri/mcp@latest"]),
        local_reg("tauri", "claude-code", "npx", "/Users/karthik/Work/hanger-ai"),
    ]);
    assert_eq!(rows[0].agreement, Agreement::Conflicting);
    assert_eq!(
        rows[0].project_override,
        Some("/Users/karthik/Work/hanger-ai".to_string())
    );
}
