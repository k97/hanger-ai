//! Config-side redaction. Spec §4.1.
//!
//! The process-side redactor lives in `mcp::observe` and is covered by
//! `mcp_observe_tests.rs`; these two must not be merged. See the module doc on
//! `mcp::redact` for why the argv vector cannot be recovered from a command line.

use tauri_app_lib::mcp::redact::redact_launch;

fn args(v: &[&str]) -> Vec<String> {
    v.iter().map(|s| s.to_string()).collect()
}

#[test]
fn a_bearer_token_in_a_header_argument_is_dropped_but_the_header_is_named() {
    // One argv element, four words. `observe::redact` would see
    // `Authorization:` as a secret-looking flag and leave `REDACT_ME_1`
    // exposed as an unrelated trailing word.
    let out = redact_launch(
        "npx",
        &args(&["mcp-remote", "https://example.com/sse", "--header", "Authorization: Bearer REDACT_ME_1"]),
    );
    assert!(!out.contains("REDACT_ME_1"), "token survived: {}", out);
    assert!(out.contains("Authorization: <redacted>"), "header name lost: {}", out);
    assert!(out.contains("--header"), "flag lost: {}", out);
}

#[test]
fn the_inline_spelling_of_the_same_flag_is_also_dropped() {
    let out = redact_launch("npx", &args(&["--header=Authorization: Bearer REDACT_ME_1"]));
    assert!(!out.contains("REDACT_ME_1"), "token survived: {}", out);
    assert!(out.contains("Authorization: <redacted>"), "header name lost: {}", out);
}

#[test]
fn a_secret_flag_takes_its_value_with_it_in_both_spellings() {
    let separate = redact_launch("server", &args(&["--api-key", "REDACT_ME_2"]));
    assert!(!separate.contains("REDACT_ME_2"), "{}", separate);
    assert!(separate.contains("--api-key <redacted>"), "{}", separate);

    let inline = redact_launch("server", &args(&["--auth-token=REDACT_ME_2"]));
    assert!(!inline.contains("REDACT_ME_2"), "{}", inline);
    assert!(inline.contains("--auth-token=<redacted>"), "{}", inline);
}

#[test]
fn credentials_inside_a_url_argument_are_stripped() {
    let out = redact_launch("npx", &args(&["https://user:REDACT_ME_3@example.com/mcp?key=REDACT_ME_3"]));
    assert!(!out.contains("REDACT_ME_3"), "credential survived: {}", out);
    assert!(out.contains("https://example.com/mcp"), "host lost: {}", out);
}

#[test]
fn an_ordinary_launch_is_returned_unchanged_and_readable() {
    // Redaction that mangles innocent launches makes the panel useless. The
    // overwhelming majority of servers carry no secret at all.
    let out = redact_launch("node", &args(&["/Applications/Spades Audio.app/mcp/index.js"]));
    assert_eq!(out, "node /Applications/Spades Audio.app/mcp/index.js");
}

#[test]
fn a_url_shaped_value_is_not_mistaken_for_a_secret_flag() {
    // "token" appears in the PATH, not in a flag. Redacting on any occurrence
    // of the word would blank ordinary arguments.
    let out = redact_launch("npx", &args(&["https://example.com/token-service/mcp"]));
    assert!(out.contains("https://example.com/token-service/mcp"), "{}", out);
}

#[test]
fn an_empty_command_yields_only_the_arguments() {
    // A remote server has no command; joining an empty one would leave a
    // leading space in the panel.
    let out = redact_launch("", &args(&["--flag"]));
    assert_eq!(out, "--flag");
}

#[test]
fn a_secret_shaped_toggle_does_not_swallow_the_next_secret_flag() {
    // `--oauth` looks secret (it contains "auth") but is a realistic valueless
    // toggle. If it consumes the next token as its own value, that token's
    // real flag and value are never recognised at all, and the value that
    // follows falls through unredacted.
    let out = redact_launch("npx", &args(&["--oauth", "--client-secret", "REDACT_ME_1"]));
    assert!(!out.contains("REDACT_ME_1"), "secret survived: {}", out);
    assert!(out.contains("--oauth"), "toggle lost: {}", out);
    assert!(out.contains("--client-secret <redacted>"), "value not redacted under its own flag: {}", out);
}

#[test]
fn a_pending_header_does_not_swallow_the_next_secret_flag() {
    // Same failure mode, but for a header flag with no value in front of a
    // secret-shaped flag.
    let out = redact_launch("npx", &args(&["-H", "--api-key", "REDACT_ME_2"]));
    assert!(!out.contains("REDACT_ME_2"), "secret survived: {}", out);
    assert!(out.contains("-H"), "header flag lost: {}", out);
    assert!(out.contains("--api-key <redacted>"), "value not redacted under its own flag: {}", out);
}

#[test]
fn a_secret_flags_value_that_starts_with_a_dash_is_still_redacted() {
    // The guard against swallowing only fires when the next token is itself a
    // RECOGNISED flag (a header flag, or secret-shaped). An ordinary
    // dash-prefixed value must still be consumed as the value it is.
    let out = redact_launch("server", &args(&["--api-key", "-REDACT_ME_3"]));
    assert!(!out.contains("REDACT_ME_3"), "{}", out);
    assert!(out.contains("--api-key <redacted>"), "{}", out);
}

#[test]
fn a_trailing_secret_flag_with_no_value_leaves_no_stray_marker() {
    let out = redact_launch("server", &args(&["--api-key"]));
    assert_eq!(out, "server --api-key");
}

#[test]
fn a_trailing_header_flag_with_no_value_leaves_no_stray_marker() {
    let out = redact_launch("npx", &args(&["-H"]));
    assert_eq!(out, "npx -H");
}

#[test]
fn a_secret_shaped_single_dash_value_is_still_redacted_not_mistaken_for_a_flag() {
    // Whether the PRECEDING flag was valueless is a question of shape, not
    // content: only a `--`-prefixed token (or a known header short form) is
    // structurally a flag. A single-dash token is a value no matter how
    // secret-shaped its text — testing "looks secret" here would misclassify
    // it as the guard firing and leave it unredacted.
    let out = redact_launch("server", &args(&["--api-key", "-secretREDACT_ME_1"]));
    assert!(!out.contains("REDACT_ME_1"), "value survived: {}", out);
    assert!(out.contains("--api-key <redacted>"), "{}", out);
}
