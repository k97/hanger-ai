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
    // toggle. The next token, `--client-secret`, lands in a pending-value
    // position and is redacted unconditionally (the invariant this module
    // holds); because it is itself secret-shaped, redaction continues onto
    // the token after it too. The middle flag's own name is deliberately no
    // longer shown — two earlier rounds tried to guess "is this token a flag
    // or a value" from its shape and each guess left a differently-shaped
    // secret exposed, so the guessing was replaced with an invariant instead.
    let out = redact_launch("npx", &args(&["--oauth", "--client-secret", "REDACT_ME_1"]));
    assert!(!out.contains("REDACT_ME_1"), "secret survived: {}", out);
    assert_eq!(out, "npx --oauth <redacted> <redacted>");
}

#[test]
fn a_pending_header_does_not_swallow_the_next_secret_flag() {
    // Same invariant, for a header flag with no value in front of a
    // secret-shaped flag.
    let out = redact_launch("npx", &args(&["-H", "--api-key", "REDACT_ME_2"]));
    assert!(!out.contains("REDACT_ME_2"), "secret survived: {}", out);
    assert_eq!(out, "npx -H <redacted> <redacted>");
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
    // A pending-value position is never emitted verbatim, regardless of what
    // the token in it looks like — this is what closes the leak a
    // shape-or-content guard could not close in either direction.
    let out = redact_launch("server", &args(&["--api-key", "-secretREDACT_ME_1"]));
    assert!(!out.contains("REDACT_ME_1"), "value survived: {}", out);
    assert!(out.contains("--api-key <redacted>"), "{}", out);
}

#[test]
fn a_double_dash_secret_shaped_value_after_a_pending_flag_is_redacted() {
    // Round 2's guard required the flag half of its discriminator to start
    // with `--`, which closed the single-dash leak but reopened this one:
    // `--secretREDACT_ME_1` also starts with `--` and is secret-shaped, so
    // round 2 would have called it a recognised flag and pushed it bare. The
    // unconditional invariant redacts it regardless of shape.
    let out = redact_launch("server", &args(&["--api-key", "--secretREDACT_ME_1"]));
    assert!(!out.contains("REDACT_ME_1"), "value survived: {}", out);
    assert_eq!(out, "server --api-key <redacted>");
}

#[test]
fn a_double_dash_secret_shaped_value_after_a_pending_header_is_redacted() {
    let out = redact_launch("npx", &args(&["-H", "--secretREDACT_ME_1"]));
    assert!(!out.contains("REDACT_ME_1"), "value survived: {}", out);
    assert_eq!(out, "npx -H <redacted>");
}

#[test]
fn an_ordinary_multi_argument_launch_is_byte_identical_to_its_input() {
    // The invariant only fires inside a pending-value position. An ordinary
    // launch with no secret-shaped flag anywhere must never be touched by
    // it — over-redaction here would make the panel useless for the common
    // case, which is the vast majority of real MCP server declarations.
    let out = redact_launch("npx", &args(&["-y", "@scope/pkg", "--port", "3000"]));
    assert_eq!(out, "npx -y @scope/pkg --port 3000");
}
