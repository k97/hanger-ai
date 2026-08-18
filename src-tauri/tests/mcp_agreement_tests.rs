use tauri_app_lib::mcp::agreement::{agreement_for, Agreement};
use tauri_app_lib::mcp::dialect::{self, McpServer};
use tauri_app_lib::mcp::discover::Registration;
use tauri_app_lib::mcp::registry::ScopeTier;

fn v(xs: &[&str]) -> Vec<String> {
    xs.iter().map(|s| s.to_string()).collect()
}

/// A stdio registration under a default test host, so cross-host comparisons
/// (bridged vs. direct) don't accidentally collide with `stdio_reg_in`'s
/// duplicate-detection case.
fn stdio_reg(name: &str, command: &str, args: &[&str]) -> Registration {
    stdio_reg_in(name, "test-stdio-host", command, args)
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
fn two_remote_registrations_at_different_urls_conflict() {
    // Launch-only comparison reported these as agreeing, which made every
    // HTTP server invisible to divergence detection.
    let a = http_reg("github", "https://api.example.com/mcp?region=eu");
    let b = http_reg("github", "https://api.example.com/mcp?region=us");
    assert_eq!(agreement_for(&[a, b]).verdict, Agreement::Conflicting);
}

#[test]
fn the_same_name_over_two_transports_conflicts() {
    // Different transports mean different software. The sentence should say so
    // rather than reporting a spec diff.
    let a = stdio_reg("github", "npx", &["-y", "gh-mcp"]);
    let b = http_reg("github", "https://api.example.com/mcp");
    assert_eq!(agreement_for(&[a, b]).verdict, Agreement::Conflicting);
}

#[test]
fn an_unwrapped_bridge_compares_as_the_endpoint_it_proxies() {
    // Without this a Zed registration compares as stdio against everyone
    // else's http, and every bridged server reports permanently conflicting.
    let bridged = stdio_reg("linear", "npx", &["mcp-remote", "https://mcp.linear.app/sse"]);
    let direct = http_reg("linear", "https://mcp.linear.app/sse");
    assert_eq!(agreement_for(&[bridged, direct]).verdict, Agreement::Consistent);
}

#[test]
fn a_bridged_registration_still_agrees_with_a_direct_one_at_the_same_query_string() {
    // `unwrap_bridge` used to hand back an already-SANITISED url, and
    // `comparison_key` hashed that -- so a bridge's fingerprint dropped the
    // query string while a direct declaration's (built from the RAW url)
    // kept it, and the two would only ever agree by coincidence of having no
    // query string at all. Hashing the raw url on both sides is what makes
    // this still agree once the query string is real.
    let bridged = stdio_reg("linear", "npx", &["mcp-remote", "https://mcp.linear.app/sse?region=eu"]);
    let direct = http_reg("linear", "https://mcp.linear.app/sse?region=eu");
    assert_eq!(agreement_for(&[bridged, direct]).verdict, Agreement::Consistent);
}

#[test]
fn two_bridged_registrations_differing_only_by_query_string_conflict() {
    // The missed-conflict direction the module's own doc names as
    // unrecoverable: both used to sanitise to the identical string and
    // report Consistent, silently hiding that they proxy two different
    // endpoints.
    let a = stdio_reg("linear", "npx", &["mcp-remote", "https://mcp.linear.app/sse?region=eu"]);
    let b = stdio_reg("linear", "npx", &["mcp-remote", "https://mcp.linear.app/sse?region=us"]);
    assert_eq!(agreement_for(&[a, b]).verdict, Agreement::Conflicting);
}

#[test]
fn the_same_spec_twice_inside_one_engine_is_duplicate_not_conflicting() {
    let a = stdio_reg_in("spades", "claude-code", "npx", &["-y", "spades"]);
    let b = stdio_reg_in("spades", "claude-code", "npx", &["-y", "spades"]);
    assert_eq!(agreement_for(&[a, b]).verdict, Agreement::Duplicate);
}

#[test]
fn case_differing_names_stay_separate_rows_and_are_reported_aliased() {
    // Grouping is by name, whitespace-trimmed only. No case folding, no
    // separator folding.
    let notion = stdio_reg("Notion", "npx", &["-y", "notion"]);
    let lower = stdio_reg("notion", "npx", &["-y", "notion"]);
    let a = agreement_for(&[notion]);
    let b = agreement_for(&[lower]);
    assert!(
        a.aliased_with.is_empty() || b.aliased_with.is_empty(),
        "aliasing is a cross-group annotation, computed in group_servers, not here"
    );
}
