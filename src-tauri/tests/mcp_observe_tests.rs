//! Process observation. The pure functions are tested against fixed strings;
//! the live process table is only smoke-tested, because asserting on another
//! process's existence is a flaky test.

use tauri_app_lib::mcp::observe;

#[test]
fn a_launch_matches_however_the_config_spelled_it() {
    // ~/.claude.json declares spades-audio as command + args; ~/.codex/config.toml
    // declares tauri as one string with the args baked in. Both must match the
    // same running process.
    let line = "node /Applications/Spades Audio.app/Contents/Resources/mcp-server/dist/index.js";
    assert!(observe::matches_launch(
        line,
        "node",
        &["/Applications/Spades Audio.app/Contents/Resources/mcp-server/dist/index.js".to_string()]
    ));
    assert!(observe::matches_launch(
        "npx @hypothesi/tauri-mcp-server",
        "npx @hypothesi/tauri-mcp-server",
        &[]
    ));
}

#[test]
fn a_different_server_started_by_the_same_runtime_does_not_match() {
    // Every Node MCP server starts with "node". Matching on the executable
    // alone would report every one of them as the same process.
    let line = "node /Applications/Other.app/Contents/Resources/mcp-server/dist/index.js";
    assert!(!observe::matches_launch(
        line,
        "node",
        &["/Applications/Spades Audio.app/Contents/Resources/mcp-server/dist/index.js".to_string()]
    ));
}

#[test]
fn an_empty_launch_never_matches() {
    // A remote server and a Claude.ai connector both have no command. Matching
    // on empty would mark every running process as theirs.
    assert!(!observe::matches_launch("node /x/y.js", "", &[]));
    assert!(!observe::matches_launch("", "", &[]));
}

#[test]
fn credentials_on_a_command_line_are_redacted() {
    // docs/scanning.md §7: values are never stored. A process's argv is the
    // one place a secret can arrive without any config file being read.
    //
    // The fixture values are deliberately not vendor-shaped. `redact` keys on
    // the flag NAME, never on the value, so a realistic-looking key would test
    // the same branch while leaving a string in the repository that gitleaks
    // and every future reviewer has to re-adjudicate as a false positive.
    let line = "node server.js --api-key=REDACT_ME_1 --token REDACT_ME_2 --url https://u:p@h/x";
    let out = observe::redact(line);
    assert!(!out.contains("REDACT_ME_1"), "api key survived: {}", out);
    assert!(!out.contains("REDACT_ME_2"), "token value survived: {}", out);
    assert!(!out.contains("u:p@"), "url credentials survived: {}", out);
    assert!(
        out.contains("node server.js"),
        "redaction ate the command: {}",
        out
    );
}

#[test]
fn reading_the_process_table_does_not_panic_and_redacts_everything() {
    let procs = observe::running_processes();
    for p in &procs {
        assert!(
            !p.command_line.contains("--api-key=sk-"),
            "raw key in {}",
            p.command_line
        );
        assert!(p.pid > 0);
    }
}
