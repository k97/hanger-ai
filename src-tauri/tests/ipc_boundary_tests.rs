//! What the webview is allowed to receive.
//!
//! A config file may declare a credential in its launch arguments. The Rust
//! process legitimately holds it — it read the file. The webview must never
//! see it: once a value is in the JS heap it is in devtools, in any render site
//! that joins it, and in any future component that reaches for the field.
//!
//! This asserts the property directly rather than grepping call sites, so
//! removing the serde attribute fails here rather than shipping.

use tauri_app_lib::domain::{Scope, Tool};

fn tool_with_a_credential() -> Tool {
    Tool {
        id: "/tmp/mcp.json-protected".to_string(),
        name: "protected".to_string(),
        command: "npx".to_string(),
        args: vec![
            "mcp-remote".to_string(),
            "https://example.com/sse".to_string(),
            "--header".to_string(),
            "Authorization: Bearer REDACT_ME_1".to_string(),
        ],
        launch_display: "npx mcp-remote https://example.com/sse --header Authorization: <redacted>"
            .to_string(),
        transport: "stdio".to_string(),
        // Fix round 1 (task 9): this fixture's command/args ARE an
        // mcp-remote invocation -- `bridged: false` was internally
        // inconsistent with its own shape. `true` matches what
        // `unwrap_bridge` would derive for this exact command/args pair;
        // `transport` stays "stdio" untouched because no test in this file
        // asserts on it and correcting it is outside this fix's scope.
        bridged: true,
        config_path: "/tmp/mcp.json".to_string(),
        scope: Scope::Global { agent: "claude-code".to_string() },
        owning_agent: "claude-code".to_string(),
        drifted: None,
        is_symlink: None,
        source_path: None,
        parse_status: Some("ok".to_string()),
        parse_error: None,
        link_state: None,
        origin: None,
        origin_blocked: None,
    }
}

#[test]
fn a_serialised_tool_carries_no_launch_arguments() {
    let tool = tool_with_a_credential();
    // The fixture must actually carry the credential, or the assertion below
    // passes for the wrong reason. A guard that cannot fail is not a guard.
    assert!(
        tool.args.iter().any(|a| a.contains("REDACT_ME_1")),
        "the fixture stopped carrying a credential; this test now proves nothing"
    );
    let json = serde_json::to_string(&tool).expect("serialise");
    assert!(
        !json.contains("REDACT_ME_1"),
        "a credential from the config reached the IPC payload: {}",
        json
    );
    assert!(
        !json.contains("\"args\""),
        "the args field is serialised; the webview can read it: {}",
        json
    );
}

#[test]
fn a_serialised_tool_still_carries_its_redacted_launch() {
    // The counterpart: suppressing args must not suppress the thing that
    // replaced it, or the panel has nothing to show and the fix reads as a
    // regression rather than a redaction.
    let json = serde_json::to_string(&tool_with_a_credential()).expect("serialise");
    assert!(json.contains("launch_display"), "{}", json);
    assert!(json.contains("<redacted>"), "{}", json);
}

#[test]
fn a_tool_survives_a_json_round_trip_without_its_arguments() {
    // `default` is what keeps Deserialize working once the field stops being
    // written. Without it a round-trip fails at runtime rather than at compile
    // time.
    let json = serde_json::to_string(&tool_with_a_credential()).expect("serialise");
    let back: Tool = serde_json::from_str(&json).expect("deserialise");
    assert_eq!(back.name, "protected");
    assert!(back.args.is_empty(), "args must default to empty, not fail to parse");
}
