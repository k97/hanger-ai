//! Process observation. The pure functions are tested against fixed strings;
//! the live process table is only smoke-tested, because asserting on another
//! process's existence is a flaky test.

use tauri_app_lib::mcp::observe;
use tauri_app_lib::mcp::observe::{match_processes, RunningProcess};

fn proc(pid: u32, line: &str, host: Option<&str>) -> RunningProcess {
    RunningProcess {
        pid,
        parent_pid: 1,
        command_line: line.to_string(),
        spawning_host: host.map(str::to_string),
    }
}

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
fn a_path_containing_a_secret_word_does_not_eat_the_following_flag() {
    // "/opt/token-service/run" contains "token". Before the flag-shape gate it
    // armed the redactor, swallowed --api-key as its "value", and let the real
    // credential through untouched.
    let out = observe::redact("/opt/token-service/run --api-key REDACT_ME_1");
    assert!(!out.contains("REDACT_ME_1"), "credential survived: {}", out);
    assert!(
        out.contains("/opt/token-service/run"),
        "the path is not a secret and must survive: {}",
        out
    );
}

#[test]
fn a_valueless_secret_toggle_does_not_swallow_the_next_flag() {
    // The same defect Task 1 fixed on the config side: --oauth matches "auth",
    // claims --client-secret as its value, and the real value falls through.
    let out = observe::redact("node s.js --oauth --client-secret REDACT_ME_2");
    assert!(!out.contains("REDACT_ME_2"), "credential survived: {}", out);
    assert!(out.contains("--oauth"), "the toggle is not a secret: {}", out);
}

#[test]
fn a_secret_flags_value_is_redacted_even_when_it_looks_like_a_flag() {
    // A single-dash token is a value however secret-shaped its text. Treating
    // it as a flag is what reopened the leak on the config side in round 1.
    let out = observe::redact("server --api-key -secretXvalue");
    assert!(!out.contains("secretXvalue"), "credential survived: {}", out);
}

#[test]
fn a_trailing_secret_flag_with_no_value_emits_no_stray_marker() {
    let out = observe::redact("server --api-key");
    assert_eq!(out, "server --api-key");
}

#[test]
fn a_running_process_is_attributed_to_its_registration() {
    let regs = vec![(
        "/home/.claude.json-spades-audio".to_string(),
        "node".to_string(),
        vec!["/Applications/Spades Audio.app/index.js".to_string()],
    )];
    let procs = vec![proc(
        8269,
        "node /Applications/Spades Audio.app/index.js",
        Some("Claude Code"),
    )];

    let out = match_processes(&regs, &procs);
    let m = out.iter().find(|m| m.pid == 8269).unwrap();
    assert_eq!(m.registration_key, "/home/.claude.json-spades-audio");
    assert_eq!(m.spawning_host.as_deref(), Some("Claude Code"));
}

#[test]
fn a_server_running_with_no_config_behind_it_is_reported() {
    // The whole point. On 2026-08-15 this machine had macos-mcp on port 8000
    // and four chroma-mcp instances, none in any config Hanger reads.
    let regs: Vec<(String, String, Vec<String>)> = vec![];
    let procs = vec![proc(
        1649,
        "macos-mcp serve --transport streamable-http --port 8000",
        None,
    )];

    let out = match_processes(&regs, &procs);
    let orphan = out.iter().find(|m| m.pid == 1649).unwrap();
    assert_eq!(
        orphan.registration_key, "",
        "an unaccounted process must still be reported"
    );
}

#[test]
fn a_host_spawned_server_is_never_called_undeclared() {
    // Measured in the running app on 2026-08-15: of 230 processes reported as
    // unaccounted, 64 had a spawning host — 54 Claude Code, 7 Cursor, 3 VS
    // Code. A process Claude Code started is not undeclared; Claude Code read
    // a config to start it. Hanger simply cannot say WHICH registration,
    // because npx and uvx rewrite argv beyond recognition: `npx
    // @playwright/mcp@0.0.69` runs as
    // `node ~/.npm/_npx/<hash>/node_modules/.bin/playwright-mcp --extension`.
    //
    // Reporting those as findings would have put "230 undeclared MCP servers"
    // in front of the user, which is the banner nobody reads twice.
    let regs: Vec<(String, String, Vec<String>)> = vec![];
    let procs = vec![proc(
        12294,
        "node /Users/k/.npm/_npx/a80a913f4f8f2557/node_modules/.bin/playwright-mcp --extension",
        Some("Claude Code"),
    )];
    assert!(
        match_processes(&regs, &procs).is_empty(),
        "a process with a known spawning host must not be reported as undeclared"
    );
}

#[test]
fn processes_unrelated_to_mcp_are_not_reported() {
    let regs: Vec<(String, String, Vec<String>)> = vec![];
    let procs = vec![proc(500, "/usr/sbin/cfprefsd agent", None)];
    assert!(match_processes(&regs, &procs).is_empty());
}

#[test]
fn the_environment_is_never_part_of_a_command_line() {
    // macOS returns argv and the environment in one buffer. sysinfo splits
    // them only when `environ` is refreshed and otherwise dumps the whole
    // environment into `cmd()`, so on 2026-08-15 every observed command line
    // carried HOME, LOGNAME, PATH and a live CLAUDE_CODE_MESSAGING_TOKEN.
    //
    // Values are never captured (docs/scanning.md §7), so an environment
    // assignment is dropped whole rather than redacted.
    let argv = vec![
        "chrome-devtools-mcp".to_string(),
        // Synthetic. The observed value was a live per-session IPC token, and
        // pasting it here is how an argv secret gets committed to a repository
        // by the very test written to prove argv secrets are never stored.
        "CLAUDE_CODE_MESSAGING_TOKEN=REDACT_ME_3".to_string(),
        "HOME=/Users/karthik".to_string(),
        "PATH=/usr/bin:/bin".to_string(),
    ];
    let out = observe::sanitise_argv(&argv);
    assert_eq!(out, "chrome-devtools-mcp", "environment survived: {}", out);
}

#[test]
fn real_arguments_that_contain_equals_are_kept() {
    // The env filter must not eat flags. Everything a server is actually
    // launched with is the useful half of this feature.
    let argv = vec![
        "chroma-mcp".to_string(),
        "--client-type=persistent".to_string(),
        "--data-dir".to_string(),
        "/Users/karthik/.claude-mem/chroma".to_string(),
    ];
    let out = observe::sanitise_argv(&argv);
    assert_eq!(
        out,
        "chroma-mcp --client-type=persistent --data-dir /Users/karthik/.claude-mem/chroma"
    );
}

#[test]
fn an_assignment_buried_inside_a_shell_wrapper_is_still_dropped() {
    // A server started through a shell is ONE argv element holding a whole
    // script. Testing the element as a unit, the name before the first `=`
    // spans a space, so it does not look like an assignment and every KEY=value
    // inside it survives. The live guard caught this on a real process; the
    // shape that matters is a credential rather than the PATH seen there.
    let argv = vec![
        "/bin/zsh".to_string(),
        "-c".to_string(),
        "API_KEY=REDACT_ME_4 PATH=/usr/bin exec some-mcp --port 8000".to_string(),
    ];
    let out = observe::sanitise_argv(&argv);
    assert!(!out.contains("REDACT_ME_4"), "credential survived: {}", out);
    assert!(!out.contains("PATH=/usr/bin"), "PATH survived: {}", out);
    assert!(
        out.contains("exec some-mcp --port 8000"),
        "ate the command: {}",
        out
    );
}

#[test]
fn sanitise_argv_still_redacts_secret_flags() {
    // The two sanitisers compose: environment assignments are dropped, and
    // secret-bearing flags in what remains are still redacted.
    let argv = vec![
        "node".to_string(),
        "server.js".to_string(),
        "SECRET_ENV=nope".to_string(),
        "--api-key=REDACT_ME_1".to_string(),
    ];
    let out = observe::sanitise_argv(&argv);
    assert!(!out.contains("nope"), "env value survived: {}", out);
    assert!(!out.contains("REDACT_ME_1"), "flag value survived: {}", out);
    assert!(out.contains("node server.js"), "ate the command: {}", out);
}

#[test]
fn no_observed_command_line_carries_an_environment_assignment() {
    // The live guard for the same defect. Every process on this machine, not
    // a fixture: if the split regresses, HOME= and PATH= reappear here.
    for p in observe::running_processes() {
        for token in p.command_line.split_whitespace() {
            assert!(
                !token.starts_with("HOME=")
                    && !token.starts_with("PATH=")
                    && !token.starts_with("LOGNAME="),
                "environment leaked into pid {}: {}",
                p.pid,
                p.command_line
            );
        }
    }
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

#[test]
fn the_process_table_actually_carries_command_lines() {
    // The failure this pins is silent and total. sysinfo's `refresh_processes`
    // does not populate `cmd()` — it refreshes memory, cpu, disk and exe — so
    // every command line comes back "", every match fails, and the feature
    // reports nothing running and nothing unaccounted with no error raised.
    // Asserting only "does not panic" passed happily through 1053 blank
    // processes on 2026-08-15.
    //
    // Not flaky: this test binary is itself a running process with an argv.
    let procs = observe::running_processes();
    assert!(!procs.is_empty(), "no processes read at all");

    let with_cmd = procs.iter().filter(|p| !p.command_line.is_empty()).count();
    assert!(
        with_cmd > 0,
        "read {} processes and not one command line — cmd() is not being refreshed",
        procs.len()
    );
}
