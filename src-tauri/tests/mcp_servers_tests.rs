use tauri_app_lib::mcp::agreement::Agreement;
use tauri_app_lib::mcp::dialect::{self, McpServer};
use tauri_app_lib::mcp::discover::Registration;
use tauri_app_lib::mcp::probe::cache_key;
use tauri_app_lib::mcp::registry::ScopeTier;
use tauri_app_lib::mcp::servers::{apply_tool_counts, group_servers};

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
    // A path shape that cannot coincide with a real developer's $HOME on any
    // machine this suite runs on — `sanitise_path` falls back to
    // `<sanitised>/{filename}` for anything outside $HOME/$USERPROFILE, so
    // this pins that fallback deterministically. The dedicated
    // `the_override_is_sanitised_like_every_other_display_path` test below
    // covers the `~/...` branch, built from the real $HOME so it is
    // portable too.
    let rows = group_servers(&[
        stdio_reg_in("tauri", "claude-code", "npx", &["-y", "@tauri/mcp@2.9.1"]),
        local_reg("tauri", "claude-code", "npx", "/opt/repos/hanger-ai"),
    ]);
    assert_eq!(rows.len(), 1, "still one row — grouping by name is unchanged");
    assert_eq!(rows[0].registration_count, 2, "nothing lost from the count");
    assert_eq!(
        rows[0].project_override,
        Some("<sanitised>/hanger-ai".to_string())
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
        local_reg("tauri", "claude-code", "npx", "/opt/repos/hanger-ai"),
    ]);
    assert_eq!(rows[0].agreement, Agreement::Conflicting);
    assert_eq!(
        rows[0].project_override,
        Some("<sanitised>/hanger-ai".to_string())
    );
}

// Fix round 1: `project_override` was crossing IPC with the raw,
// unsanitised path — the house convention at the IPC boundary for a
// display-only path is `preferences::sanitise_path` (`ConfigProblem.path`'s
// own precedent, not `Tool.config_path`'s, which stays raw because it is
// used functionally to open a file). Built from the REAL `$HOME` env var
// rather than a hardcoded username, so this pins the `~/...` branch
// portably on whichever machine runs the suite.
#[test]
fn the_project_override_is_sanitised_like_every_other_display_path() {
    let home = std::env::var("HOME").expect("HOME must be set to run this test");
    let project_root = format!("{}/Work/hanger-ai", home);
    let rows = group_servers(&[
        stdio_reg_in("tauri", "claude-code", "npx", &["-y", "@tauri/mcp@2.9.1"]),
        local_reg("tauri", "claude-code", "npx", &project_root),
    ]);
    assert_eq!(
        rows[0].project_override,
        Some("~/Work/hanger-ai".to_string()),
        "project_override leaked the raw HOME-relative path instead of sanitising it: {:?}",
        rows[0].project_override
    );
}

// `apply_tool_counts` fills the Tools column from the probe cache
// (`preferences::get_probe_result`, wired up for real in
// `lib.rs::get_mcp_servers`). The cache is keyed per LAUNCH
// (`mcp::probe::cache_key`); `group_servers` groups by NAME. A `Consistent`
// or `Duplicate` row's registrations all resolve to the one launch, so the
// group's key stands for the whole row. A `Conflicting` row is two or more
// DISTINCT launches under one name — summing or picking one would assert a
// fact no single running server can back up, so that row always reads
// `None`, cache hit or not.

#[test]
fn a_consistent_row_with_a_cache_hit_gets_the_count() {
    let regs = [
        stdio_reg_in("tauri", "claude-code", "npx", &["-y", "@tauri/mcp@2.9.1"]),
        stdio_reg_in("tauri", "codex", "npx", &["-y", "@tauri/mcp@2.9.1"]),
    ];
    let mut rows = group_servers(&regs);
    assert_eq!(rows[0].agreement, Agreement::Consistent, "fixture sanity");

    let key = cache_key("npx", &v(&["-y", "@tauri/mcp@2.9.1"]), &[], None, "stdio");
    apply_tool_counts(&mut rows, &regs, |k| if k == key { Some(7) } else { None });

    assert_eq!(rows[0].tool_count, Some(7));
}

#[test]
fn a_consistent_row_with_a_cache_miss_gets_no_count() {
    let regs = [
        stdio_reg_in("tauri", "claude-code", "npx", &["-y", "@tauri/mcp@2.9.1"]),
        stdio_reg_in("tauri", "codex", "npx", &["-y", "@tauri/mcp@2.9.1"]),
    ];
    let mut rows = group_servers(&regs);
    assert_eq!(rows[0].agreement, Agreement::Consistent, "fixture sanity");

    apply_tool_counts(&mut rows, &regs, |_| None);

    assert_eq!(rows[0].tool_count, None);
}

#[test]
fn a_conflicting_row_gets_no_count_even_with_a_cache_hit_on_one_of_its_launches() {
    // Two distinct launch specs for one name — exactly what makes this row
    // Conflicting, per this file's own `grouping_is_by_name_and_never_by_launch_spec`.
    let regs = [
        stdio_reg_in("tauri", "claude-code", "npx", &["-y", "@tauri/mcp@latest"]),
        stdio_reg_in("tauri", "codex", "npx", &["-y", "@tauri/mcp@2.9.1"]),
    ];
    let mut rows = group_servers(&regs);
    assert_eq!(rows[0].agreement, Agreement::Conflicting, "fixture sanity");

    // The cache DOES hold an answer for one of the two launches — the
    // ruling is that a Conflicting row must ignore it, not that no answer
    // exists to ignore.
    let key = cache_key("npx", &v(&["-y", "@tauri/mcp@2.9.1"]), &[], None, "stdio");
    apply_tool_counts(&mut rows, &regs, |k| if k == key { Some(3) } else { None });

    assert_eq!(
        rows[0].tool_count, None,
        "a Conflicting row must never report a count from just one of its distinct launches"
    );
}
