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

// Critical finding, final whole-branch review: `--header` is not
// flag-shaped-secret (`looks_secret("--header")` is false — it contains none
// of key/token/secret/password/auth) and `Authorization:` is not
// flag-shaped at all, so neither branch above ever armed a capture for
// either word. The header, name AND bearer token, fell through both
// branches and was pushed verbatim onto a screen this module exists to keep
// it off: RunningProcess.command_line -> ProcessMatch -> mcpServerView.ts's
// groupProcesses -> ProfilePane's undeclared-servers disclosure. This is the
// second time this module has leaked a credential; the config-side sibling
// `redact_launch` already had `HEADER_FLAGS` for this exact shape, and the
// module comment's claim that the invariant was "mirrored" from it was false
// for this one constant.

#[test]
fn a_header_flag_no_longer_leaks_its_bearer_token() {
    let out = observe::redact(
        "npx mcp-remote https://example.com/sse --header Authorization: Bearer REDACT_ME_1",
    );
    assert!(
        !out.contains("REDACT_ME_1"),
        "bearer token survived: {}",
        out
    );
    assert_eq!(
        out,
        "npx mcp-remote https://example.com/sse --header Authorization: <redacted> <redacted>"
    );
}

#[test]
fn the_short_header_flag_spelling_is_redacted_the_same_way() {
    let out = observe::redact("-H Authorization: Bearer REDACT_ME_1");
    assert!(
        !out.contains("REDACT_ME_1"),
        "bearer token survived: {}",
        out
    );
    assert_eq!(out, "-H Authorization: <redacted> <redacted>");
}

#[test]
fn header_mode_ends_the_moment_a_new_flag_begins() {
    // A header value has no length known in advance; header mode ends only
    // when a new flag starts. A word beginning with `-` must leave header
    // mode and be processed through the ordinary branches, not swallowed as
    // more header content.
    let out =
        observe::redact("--header Authorization: Bearer REDACT_ME_1 --other-flag value");
    assert!(
        !out.contains("REDACT_ME_1"),
        "bearer token survived: {}",
        out
    );
    assert_eq!(
        out,
        "--header Authorization: <redacted> <redacted> --other-flag value"
    );
}

#[test]
fn the_header_fix_does_not_change_an_ordinary_secret_flag() {
    // Regression guard: adding header mode must not touch the existing
    // pending-value path for a plain secret-shaped flag.
    let out = observe::redact("node server.js --api-key REDACT_ME_2");
    assert_eq!(out, "node server.js --api-key <redacted>");
}

#[test]
fn the_header_fix_does_not_let_a_secret_shaped_path_arm_the_capture() {
    // Regression guard for the older defect this module already fixed:
    // "/opt/token-service/run" contains "token" but is not flag-shaped, so it
    // must still not eat the real flag after it.
    let out = observe::redact("/opt/token-service/run --api-key REDACT_ME_2");
    assert_eq!(out, "/opt/token-service/run --api-key <redacted>");
}

// Two more shapes, found by a final whole-branch review after 140e119 closed
// the header-flag leak above — recorded in docs/roadmap.md until now.

#[test]
fn a_header_value_that_starts_with_a_dash_is_not_mistaken_for_a_new_flag() {
    // Base64url tokens can begin with `-`. The old exit test — any word
    // starting with `-` — left header mode at the value itself and pushed it
    // verbatim. Exiting only on a word that starts with `--` and does not
    // look secret keeps a single-dash value in header mode regardless of what
    // it contains.
    let out = observe::redact("--header X-Session: -abc123secretxyz");
    assert!(
        !out.contains("abc123secretxyz"),
        "header value survived: {}",
        out
    );
    assert_eq!(out, "--header X-Session: <redacted>");
}

#[test]
fn a_secret_flag_immediately_before_a_header_flag_does_not_eat_the_bearer_token() {
    // `--api-key` armed a pending-value capture; `--header` was consumed as
    // that "value" and redacted; header mode never armed; the real token fell
    // through untouched. The fix: when the token consumed in pending position
    // is itself a header flag, enter header mode instead of merely re-arming
    // pending, the same way a token that is itself secret-shaped re-arms.
    let out = observe::redact("--api-key --header Authorization: Bearer REDACT_ME_1");
    assert!(
        !out.contains("REDACT_ME_1"),
        "bearer token survived: {}",
        out
    );
    assert_eq!(
        out,
        "--api-key <redacted> Authorization: <redacted> <redacted>"
    );
}

#[test]
fn a_secret_shaped_flag_after_a_header_value_stays_redacted_over_redaction_accepted() {
    // The obvious fix for the first leak — exit header mode on any word that
    // is flag-shaped and not secret-looking — still fails: `--api-key` IS
    // secret-looking (contains "key"), so it would stay in header mode either
    // way. Pinning that directly: a secret-shaped flag encountered while
    // still in header mode is treated as more header content and redacted,
    // rather than risked as a new flag. Losing "--api-key" as a readable flag
    // name costs less than losing a credential.
    let out = observe::redact("--header Authorization: Bearer REDACT_ME_1 --api-key value");
    assert!(
        !out.contains("REDACT_ME_1"),
        "bearer token survived: {}",
        out
    );
    assert_eq!(
        out,
        "--header Authorization: <redacted> <redacted> <redacted> <redacted>"
    );
}

#[test]
fn a_command_line_with_no_secrets_is_byte_identical() {
    let line = "node /Applications/Spades Audio.app/Contents/Resources/mcp-server/dist/index.js --client-type=persistent";
    assert_eq!(observe::redact(line), line);
}

#[test]
fn a_query_string_credential_with_no_userinfo_is_no_longer_missed() {
    // The old URL branch fired only on `word.contains("://") &&
    // word.contains('@')` — a userinfo credential. A credential in a query
    // string with no userinfo, and no secret word in the parameter name
    // (`k`, not `key`/`token`/etc.), fell through untouched. `redact` now
    // delegates to `dialect::sanitise_url` — the same function the config
    // side already uses — instead of a third hand-rolled copy of URL
    // sanitising that could drift from the other two.
    let out = observe::redact("https://user:REDACT_ME_3@example.com/mcp?k=REDACT_ME_3");
    assert!(
        !out.contains("REDACT_ME_3"),
        "credential survived: {}",
        out
    );
    assert_eq!(out, "https://example.com/mcp");
}

#[test]
fn a_credential_free_url_survives_readable() {
    let out = observe::redact("https://example.com/mcp");
    assert_eq!(out, "https://example.com/mcp");
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
    assert_eq!(m.registration_keys, vec!["/home/.claude.json-spades-audio"]);
    assert_eq!(m.spawning_host.as_deref(), Some("Claude Code"));
}

#[test]
fn a_process_several_declarations_could_have_started_names_them_all() {
    // The case the panel gets wrong today. spades-audio is declared three
    // times on this machine, twice by Claude Code, and all three launches are
    // identical -- which is what makes them a duplicate rather than a
    // conflict. `find` returned whichever the scan recorded first, so one
    // arbitrary registration was told it was the running one, and the row
    // printed a spawning host that contradicted its own engine: a Claude Code
    // row reading `running - pid 52072 - Claude Desktop` (Karthik's
    // screenshot, 2026-08-30).
    //
    // Nothing in a process can say which identical declaration started it.
    // The honest answer is all of them, and the caller decides what to do
    // with an answer that names more than one.
    let regs = vec![
        (
            "/home/.claude/mcp.json-spades-audio".to_string(),
            "node".to_string(),
            vec!["/Applications/Spades Audio.app/index.js".to_string()],
        ),
        (
            "/home/.claude.json-spades-audio".to_string(),
            "node".to_string(),
            vec!["/Applications/Spades Audio.app/index.js".to_string()],
        ),
    ];
    let procs = vec![proc(
        52072,
        "node /Applications/Spades Audio.app/index.js",
        Some("Claude Desktop"),
    )];

    let out = match_processes(&regs, &procs);
    let m = out.iter().find(|m| m.pid == 52072).unwrap();
    assert_eq!(
        m.registration_keys,
        vec![
            "/home/.claude/mcp.json-spades-audio",
            "/home/.claude.json-spades-audio"
        ],
        "a process matching several identical declarations must name every one"
    );
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
    assert!(
        orphan.registration_keys.is_empty(),
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

// ---------------------------------------------------------------------------
// Why `launch_is_running` exists, and why it may not be rewritten in terms of
// `running_processes()`.
//
// `running_processes()` redacts every command line, because those strings are
// rendered. `matches_launch` needs every declared part to appear in the line it
// is given — so the moment a launch carries a credential, the declared value is
// present on one side and `<redacted>` on the other, and the launch reads as
// NOT RUNNING. That is the whole of Rule 2's input, and the servers it fails on
// are precisely the ones the rule cites: `anthropics/claude-code#40220` is a
// Telegram MCP whose bot token rides in its argv.
//
// `launch_is_running` compares against the raw argv inside that module and
// returns only a bool, so nothing unredacted crosses a boundary or reaches a
// render.
// ---------------------------------------------------------------------------

use tauri_app_lib::mcp::observe::launch_is_running;

/// The blind spot itself, with no process needed: a token-bearing launch
/// cannot match its own redacted command line. Deterministic, so it holds as
/// a statement about the redactor rather than about this machine.
#[test]
fn a_token_bearing_launch_never_matches_its_own_redacted_command_line() {
    let argv: Vec<String> = vec![
        "telegram-mcp".to_string(),
        "--bot-token".to_string(),
        "8891234567:AAH-not-a-real-token".to_string(),
    ];
    let redacted = observe::sanitise_argv(&argv);
    assert!(
        redacted.contains("<redacted>"),
        "precondition: the redactor must actually redact this shape, got {redacted:?}"
    );

    assert!(
        !observe::matches_launch(&redacted, "telegram-mcp", &argv[1..]),
        "this is the defect, stated as a fact: matched against the redacted line, \
         the one server Rule 2 names reads as not running"
    );
}

/// And the fix, against a real process on this machine carrying a
/// secret-shaped flag in its argv. This is the ONLY control that separates a
/// raw comparison from a redacted one: a fixture without a secret matches
/// either way, so rewiring that function back to `running_processes()` would
/// go unnoticed by every other test here.
///
/// The fixture blocks on `read`, a shell BUILTIN, so `sh` forks nothing. Two
/// reasons, both learned the hard way in the first draft, which used
/// `sleep 987654`:
///
/// - Killing `sh` does not kill a grandchild, so the sleep outlived the test —
///   the orphan class Task 3's fix round already cleaned 107 of.
/// - That orphan inherited the test binary's stdout, so `cargo test | tail`
///   never saw EOF and the whole run hung until the sleep's 987654 seconds
///   were up.
///
/// stdin is a pipe the test holds open and never writes to; stdout and stderr
/// are null, so nothing can hold a pipe open even if this fixture ever does
/// fork.
#[test]
fn launch_is_running_finds_a_process_whose_arguments_carry_a_secret() {
    use std::process::Stdio;

    let script = ": --bot-token 8891234567:AAH-hanger-observe-fixture; read _line";
    let mut child = std::process::Command::new("/bin/sh")
        .arg("-c")
        .arg(script)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("fixture must start");

    // Poll rather than sleep a fixed amount. A spawn takes a moment to appear
    // in the process table, and a single 300ms wait is a coin toss on a loaded
    // machine — this run shares a box with `tauri dev` rebuilding. Observed
    // failing exactly that way once before this became a deadline.
    let args = vec!["-c".to_string(), script.to_string()];
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    let mut found = false;
    while std::time::Instant::now() < deadline {
        if launch_is_running("/bin/sh", &args) {
            found = true;
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    // Kill before asserting, so a failure cannot leave the fixture behind.
    let _ = child.kill();
    let _ = child.wait();

    assert!(
        found,
        "the raw-argv comparison must see a launch that the redacted one cannot"
    );
}

/// The other direction, so the check above is not merely "returns true".
#[test]
fn launch_is_running_says_no_to_a_launch_nothing_is_running() {
    assert!(!launch_is_running(
        "hanger-observe-nothing-runs-this",
        &["--never".to_string()]
    ));
}

// ---------------------------------------------------------------------------
// Containment: the raw-argv path has no way to emit what it reads.
//
// `launch_is_running` runs `contains` against unredacted process command
// lines, and those genuinely carry secrets — measured on this machine, 59 of
// 983 processes have `KEY=value` elements in argv, five of them holding a live
// `CLAUDE_CODE_MESSAGING_TOKEN`. That is safe today for one reason and one
// reason only: the function has no output channel. It returns `bool`,
// `matches_launch` is a substring test with no panic path, nothing in the
// module logs, and no struct carries the raw line.
//
// Every part of that is a property of the current source and none of it was
// enforced. A `tracing::debug!` added while chasing a bug, a return widened to
// `Option<String>` to say WHICH process matched, a `#[derive(Debug)]` on
// something holding the line — each ships a token and fails no test.
// `invariants.md` records that this exact shape, a comment asserting a
// property no test exercises, is how a bearer token shipped once already, out
// of these very two redactors.
//
// Written in the idiom `agent_attribution_tests.rs` established for lib.rs
// (`include_str!` plus brace-depth isolation of one function's own body), so a
// match in a neighbouring function can never satisfy it.
//
// None of this proves non-exfiltration in general, and reading it that way
// would be the overclaim. These guards catch the accidental leak and the
// idiomatic one — the print left in from chasing a bug, the return type
// widened to say which process matched, the module-scope static a closure
// pushes into as a side channel. A source-text guard scans surface syntax; it
// has no view of what a value laundered through an innocuous-looking helper,
// an FFI call, or an unsafe block does two functions away, and it cannot stop
// someone who reads this comment and works around it on purpose. What these
// five tests hold is real only as long as nobody tries; the actual boundary
// is review of any diff that touches this module.
// ---------------------------------------------------------------------------

const OBSERVE_SRC: &str = include_str!("../src/mcp/observe.rs");

/// `launch_is_running`'s own body, isolated by brace depth.
fn launch_is_running_body() -> &'static str {
    let start = OBSERVE_SRC
        .find("pub fn launch_is_running(")
        .expect("launch_is_running must exist in observe.rs — if it moved, this guard moved with it");
    let body_start = OBSERVE_SRC[start..]
        .find('{')
        .map(|i| start + i)
        .expect("launch_is_running must have a body");

    let mut depth: i32 = 0;
    for (offset, ch) in OBSERVE_SRC[body_start..].char_indices() {
        match ch {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return &OBSERVE_SRC[body_start..body_start + offset + 1];
                }
            }
            _ => {}
        }
    }
    panic!("launch_is_running's body has unbalanced braces");
}

/// The return type is the containment. A `bool` cannot carry a command line
/// out; anything else can.
#[test]
fn launch_is_running_still_returns_only_a_bool() {
    assert!(
        OBSERVE_SRC.contains("pub fn launch_is_running(command: &str, args: &[String]) -> bool {"),
        "launch_is_running's signature changed. It reads unredacted process command lines, so its \
         return type is what stops one leaving the module — widening it to name WHICH process \
         matched hands a caller the raw line, secrets included."
    );
}

/// Nothing in that body may print, log, or otherwise emit.
#[test]
fn the_raw_argv_path_cannot_emit_what_it_reads() {
    let body = launch_is_running_body();
    for emitter in [
        "println!", "eprintln!", "print!", "eprint!", "dbg!", "write!", "writeln!",
        "log::", "tracing::", "info!", "debug!", "warn!", "error!", "trace!",
        "panic!", "unreachable!", "todo!", "unimplemented!", "assert!", "assert_eq!",
        "assert_ne!",
    ] {
        assert!(
            !body.contains(emitter),
            "launch_is_running's body contains `{emitter}`. It reads UNREDACTED command lines — \
             59 of 983 processes on the machine this was written on carried KEY=value argv \
             elements, five with a live token. Nothing here may emit."
        );
    }
}

/// The raw read must stay inside the function this guard checks. Moving it to
/// a helper would leave the two tests above passing over a body that no longer
/// touches raw argv, which is `verification.md`'s "moving a symbol disarms a
/// guard that reads it as text".
#[test]
fn the_raw_argv_read_has_not_moved_out_of_the_function_that_is_guarded() {
    assert!(
        launch_is_running_body().contains(".cmd()"),
        "launch_is_running no longer reads argv directly — if the raw read moved to a helper, \
         point the emit guard above at the helper too, or it is guarding an empty room"
    );
    assert_eq!(
        OBSERVE_SRC.matches(".cmd()").count(),
        2,
        "observe.rs reads raw argv in exactly two places: running_processes, which redacts before \
         anyone sees it, and launch_is_running, which compares and returns a bool. A third read is \
         a new path for an unredacted command line and needs its own containment argument."
    );
}

/// The other end of the boundary: the field that IS rendered may only ever be
/// filled by the redactor. `RunningProcess.command_line` crosses IPC and
/// reaches the screen.
#[test]
fn the_rendered_command_line_is_only_ever_the_redacted_one() {
    let assignments: Vec<&str> = OBSERVE_SRC
        .lines()
        .filter(|l| l.trim_start().starts_with("command_line:"))
        .collect();
    assert!(!assignments.is_empty(), "the field must still exist for this guard to mean anything");
    for line in assignments {
        let value = line.trim();
        assert!(
            value.contains("sanitise_argv(") || value.contains("p.command_line.clone()"),
            "`{value}` fills a rendered field from something other than the redactor. \
             RunningProcess.command_line is serialised across IPC and shown in the panel."
        );
    }
}

/// A fifth channel the emitter list above cannot see: a module-scope
/// `static` that a closure pushes the raw line into. `launch_is_running`
/// holds unredacted argv in scope for the length of one call; a `static`
/// gives that value a lifetime and a name outside the call, which is a
/// channel out that no function signature pins — the emitter list, the
/// return-type guard and the `.cmd()`-count guard above all read clean over
/// it, because none of them look at module scope. Only an item declaration
/// (a line whose trimmed form starts with `static`, optionally after a
/// `pub`/`pub(crate)`/`pub(super)` visibility modifier) counts; `&'static
/// str` lifetime annotations, which this file legitimately has, do not
/// start a line that way and must not trip this.
#[test]
fn observe_declares_no_static_items() {
    let offenders: Vec<&str> = OBSERVE_SRC
        .lines()
        .filter(|line| {
            let trimmed = line.trim_start();
            let after_vis = trimmed
                .strip_prefix("pub(crate) ")
                .or_else(|| trimmed.strip_prefix("pub(super) "))
                .or_else(|| trimmed.strip_prefix("pub(self) "))
                .or_else(|| trimmed.strip_prefix("pub "))
                .unwrap_or(trimmed);
            after_vis.starts_with("static ")
        })
        .collect();
    assert!(
        offenders.is_empty(),
        "observe.rs declares a `static` item: {offenders:?}. This module holds raw, \
         unredacted argv in scope while launch_is_running runs; a static is a channel \
         out that no function signature can see — a `Mutex<Vec<String>>` declared at \
         module scope and pushed to from inside the `.any(...)` closure leaves the \
         signature, return-type and `.cmd()`-count guards above all green while the raw \
         line survives the call that read it."
    );
}
