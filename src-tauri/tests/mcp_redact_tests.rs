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
