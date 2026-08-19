//! What is actually running, and who started it.
//!
//! Hanger is not an MCP host, so it cannot ask a host what it spawned. It can
//! read the process table, which shows every host's children at once — the one
//! thing no individual host can see. A server running with no config behind it
//! is visible here and nowhere else.
//!
//! Read-only. Nothing is started, signalled or stopped.

use crate::mcp::dialect::sanitise_url;
use crate::mcp::redact::{looks_secret, HEADER_FLAGS};
use serde::{Deserialize, Serialize};
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunningProcess {
    pub pid: u32,
    pub parent_pid: u32,
    /// Redacted. A raw argv can carry an API key, so it never leaves this
    /// module unprocessed — see `redact`.
    pub command_line: String,
    /// The application that spawned it, resolved through the parent chain.
    pub spawning_host: Option<String>,
}

/// Strip secrets from a command line before it is stored or shown.
///
/// docs/scanning.md §7 forbids capturing values. A process's argv is the one
/// place a credential can reach Hanger without any config file being read:
/// `--api-key=…`, `--token …`, or userinfo in a URL.
///
/// Three defects have lived here, all the class the spec forbids: never
/// render a token verbatim. First, the branch that arms a pending-value
/// capture used to fire on any word merely *containing* a secret substring,
/// not just a flag — so a path like `/opt/token-service/run` armed the
/// capture and ate the real flag after it. It is now gated on
/// `word.starts_with('-')`. Second, a valueless secret-shaped toggle
/// (`--oauth`) could itself be captured as a "value" by nothing, then
/// swallow the real flag that followed it. That is closed the way
/// `mcp::redact::redact_launch` closes it on the config side: a token in a
/// pending-value position is never emitted verbatim, full stop, regardless
/// of what it looks like.
///
/// Third: `--header Authorization: Bearer …` arrives here as four
/// whitespace-separated words, and none of them is both flag-shaped AND
/// secret-worded — `--header` contains no secret word, `Authorization:` is
/// not flag-shaped. Neither branch above ever armed for it, so the whole
/// header, including the bearer token, was pushed verbatim. `HEADER_FLAGS`
/// is now imported from `mcp::redact` rather than re-declared, so the two
/// modules cannot drift apart the way they did the first time — see
/// `header_mode` below. The URL branch had the same shape of gap: it fired
/// only when a word held BOTH `://` AND `@`, so a query-string credential
/// with no userinfo survived. It now delegates to `dialect::sanitise_url`
/// instead of hand-rolling a third copy of URL sanitising.
///
/// Fourth and fifth, found by a final whole-branch review after the third fix
/// landed (`140e119`): header mode exited on any word starting with a single
/// `-`, so a base64url header value beginning with `-` (`-abc123secretxyz`)
/// left header mode at the value itself and leaked it. It now exits only on a
/// word starting with `--` that does not look secret — gating on
/// "flag-shaped and not secret" alone still fails, since a leaking value can
/// itself contain a secret word. And a secret flag with no value immediately
/// followed by a header flag (`--api-key --header Authorization: Bearer …`)
/// consumed `--header` as the api-key's redacted "value" and never armed
/// header mode, leaking the token that followed; the pending-value branch now
/// checks whether the token it just redacted was itself a header flag and
/// arms header mode if so, rather than only re-arming pending.
pub fn redact(command_line: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    let mut pending = false;
    // Separate from `pending`: a header value can span several words
    // (`Authorization: Bearer <token>`), where `pending` only ever captures
    // exactly one.
    let mut header_mode = false;

    for word in command_line.split_whitespace() {
        if header_mode {
            if word.starts_with("--") && !looks_secret(word) {
                // The header value has no length known in advance; it ends
                // only when a new flag begins. Testing merely
                // `word.starts_with('-')` let a base64url token that itself
                // begins with a single dash (`-abc123secretxyz`) exit header
                // mode and leak. Testing "flag-shaped and not secret" instead
                // of "starts with a single dash" also fails on its own,
                // because that same value contains "secret" and would still
                // read as flag-shaped-and-secret. `--` plus not-secret is the
                // shape only a genuine next flag reliably has; a secret-shaped
                // `--` flag (`--api-key`) stays in header mode and is
                // redacted, over-redaction accepted. Leave header mode and
                // fall through to the ordinary branches below for this word —
                // it is not more header content.
                header_mode = false;
            } else if word.ends_with(':') {
                // The header NAME (`Authorization:`) is diagnostic, not a
                // credential — same rule as redact_launch's
                // redact_header_value — and is kept.
                out.push(word.to_string());
                continue;
            } else {
                out.push("<redacted>".to_string());
                continue;
            }
        }

        if pending {
            // Invariant, mirrored from `redact_launch`: a token in a
            // pending-value position is never emitted verbatim. Redact it
            // unconditionally, then re-arm if this same token could itself
            // start a fresh capture, so the token after it is redacted too.
            // Never fall through to the flag-detection logic below for a
            // token consumed here.
            out.push("<redacted>".to_string());
            if HEADER_FLAGS.contains(&word) {
                // The token consumed here was itself a header flag
                // (`--api-key --header Authorization: Bearer …`): `--header`
                // got redacted as `--api-key`'s "value", and without this,
                // header mode never arms and the bearer token that follows
                // falls through untouched. Enter header mode instead of
                // merely re-arming pending, mirroring the secret-looking
                // re-arm below.
                header_mode = true;
                pending = false;
            } else {
                pending = word.starts_with('-') && looks_secret(word);
            }
            continue;
        }

        if HEADER_FLAGS.contains(&word) {
            out.push(word.to_string());
            header_mode = true;
            continue;
        }

        if looks_secret(word) {
            if let Some(eq) = word.find('=') {
                out.push(format!("{}=<redacted>", &word[..eq]));
                continue;
            }
            // Only a flag-shaped word arms the capture. A word that merely
            // *contains* a secret substring — a path like
            // `/opt/token-service/run` — is not a flag and must not eat the
            // real flag that follows it.
            if word.starts_with('-') {
                out.push(word.to_string());
                pending = true;
                continue;
            }
        }

        if word.contains("://") {
            out.push(sanitise_url(word));
            continue;
        }

        out.push(word.to_string());
    }

    out.join(" ")
}

/// Is this argv element an environment assignment rather than an argument?
///
/// macOS hands argv and the environment back in one buffer, and sysinfo only
/// separates them when `environ` is refreshed alongside `cmd`. Requesting both
/// fixes the split for the ordinary case, but not for every process: some
/// still arrive with an assignment sitting in argv. Since environment *values*
/// are never captured, the shape is rejected wherever it appears rather than
/// trusted to have been filtered upstream.
///
/// A real flag starts with `-`, so `--client-type=persistent` is kept and
/// `HOME=/Users/karthik` is not.
fn is_env_assignment(token: &str) -> bool {
    if token.starts_with('-') {
        return false;
    }
    let Some(eq) = token.find('=') else {
        return false;
    };
    let name = &token[..eq];
    !name.is_empty()
        && name
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_alphabetic() || c == '_')
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// Turn a process's raw argv into a command line safe to store and show.
///
/// Two passes, because there are two ways a credential arrives: the whole
/// environment riding along in argv (dropped), and a secret passed as a flag
/// value (redacted).
///
/// The filter runs per whitespace-separated word, not per argv element. An
/// element is not reliably one word: a server launched through a shell arrives
/// as `zsh -c '<entire script>'`, one element holding a whole command line with
/// its assignments inside it. Testing the element as a unit, the name-before-
/// the-first-`=` spans a space, the element does not look like an assignment,
/// and every `KEY=value` in it survives into storage. Found by the live guard
/// in mcp_observe_tests, which watches the real process table for exactly this.
pub fn sanitise_argv(argv: &[String]) -> String {
    let kept: Vec<&str> = argv
        .iter()
        .flat_map(|e| e.split_whitespace())
        .filter(|t| !is_env_assignment(t))
        .collect();
    redact(&kept.join(" "))
}

/// Does this running process correspond to that declared launch?
///
/// Matching on the executable alone is useless: every Node MCP server starts
/// with `node`. The distinguishing part is the arguments, so both the command
/// and every argument must appear. Configs spell the same launch two ways —
/// command + args, or one string with args baked in — and both must match.
///
/// Deliberately strict. `npx foo` re-executes itself as `npm exec foo`, so a
/// registration spelled with `npx` will not match its own running process.
/// Relaxing that to a subset match would let `node` alone claim every Node
/// server on the machine, which is the failure this function exists to avoid.
pub fn matches_launch(command_line: &str, command: &str, args: &[String]) -> bool {
    let declared: Vec<&str> = command
        .split_whitespace()
        .chain(args.iter().map(String::as_str))
        .collect();

    // A remote server or connector declares no command. Treating that as a
    // wildcard would mark every process on the machine as theirs.
    if declared.is_empty() {
        return false;
    }

    declared.iter().all(|part| command_line.contains(part))
}

/// Is this exact launch already running on this machine?
///
/// Rule 2 rests entirely on this answer (`cached_probe` in `lib.rs`), so its
/// blind spots are the rule's blind spots — which is why it does NOT go
/// through [`running_processes`].
///
/// That function redacts every command line, because those strings are
/// rendered. [`matches_launch`] requires every declared part to appear in the
/// line it is given. Put together, a launch carrying a credential has the
/// declared value on one side and `<redacted>` on the other, and therefore
/// reads as not running — for `telegram-mcp --bot-token <token>`, measured:
///
/// ```text
/// redacted line = "telegram-mcp --bot-token <redacted>"   matched = false
/// ```
///
/// The server that fails is the one the rule is named after:
/// `anthropics/claude-code#40220` is a Telegram MCP whose bot token rides in
/// its argv, and whose long-polling permits one connection per token. The rule
/// protected everything except its own example.
///
/// So the comparison happens here, against the raw argv, in the module that
/// already holds it. Nothing unredacted leaves this function: it returns a
/// `bool`, the joined line is a local, and no caller can ask for it. Env
/// assignments are deliberately NOT dropped the way [`sanitise_argv`] drops
/// them for display — a Docker-backed server declares `-e KEY=value` as a real
/// argument, and filtering those out here would reintroduce the same class of
/// false negative for a different shape.
///
/// Costs one process-table refresh: 61ms against 1033 processes, measured. The
/// `npx` blind spot is NOT fixed here and is recorded in `docs/findings.md` —
/// `npx foo` re-executes as `npm exec foo`, which shares no text with the
/// declaration, and no comparison of the two strings can bridge that.
pub fn launch_is_running(command: &str, args: &[String]) -> bool {
    let mut sys = System::new();
    // `cmd` only — see `running_processes` for the measurement that retired
    // the `environ` flag. This is the panel-open path, so the ~4ms it cost is
    // paid every time a server is opened, for no measured effect.
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing().with_cmd(UpdateKind::Always),
    );

    sys.processes().values().any(|proc_| {
        let raw: Vec<String> = proc_
            .cmd()
            .iter()
            .map(|s| s.to_string_lossy().to_string())
            .collect();
        matches_launch(&raw.join(" "), command, args)
    })
}

/// Every process currently running, redacted.
pub fn running_processes() -> Vec<RunningProcess> {
    let mut sys = System::new();
    // `cmd` is required: `refresh_processes` does NOT populate the command
    // line — it refreshes memory, cpu, disk usage and exe. Every argv then
    // reads as "" and the whole feature silently reports nothing running and
    // nothing unaccounted, with no error anywhere.
    //
    // `environ` USED to be requested here too, under a comment claiming that
    // macOS returns argv and the environment in one buffer and that asking for
    // cmd alone appends the whole environment to every command line. Measured
    // 2026-08-19 on sysinfo 0.39.6 / macOS 26.5.2 (build 25F84), comparing the
    // two refreshes by pid across 971 processes:
    //
    //   cmd() lines differing between with- and without-environ: 0
    //   argv elements of KEY=value shape:      60 either way
    //   a live CLAUDE_CODE_MESSAGING_TOKEN:     6 processes, either way
    //   refresh cost:                          15ms with, 11ms without
    //
    // So the flag changed nothing, and — the part that matters — the token is
    // in `cmd()` whether it is set or not, because those processes genuinely
    // carry it in their own argv. The flag was never what kept the environment
    // out. `sanitise_argv`'s `is_env_assignment` filter is, and
    // `no_observed_command_line_carries_an_environment_assignment` is the live
    // control over that: it reads the real table and fails if any rendered
    // command line carries an assignment. If a future sysinfo or macOS does
    // start appending the environment, that test is what says so — a control
    // that fires, rather than a flag nobody can tell is working.
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing().with_cmd(UpdateKind::Always),
    );

    sys.processes()
        .iter()
        .map(|(pid, proc_)| {
            let argv: Vec<String> = proc_
                .cmd()
                .iter()
                .map(|s| s.to_string_lossy().to_string())
                .collect();
            let parent = proc_.parent().map(|p| p.as_u32()).unwrap_or(0);
            RunningProcess {
                pid: pid.as_u32(),
                parent_pid: parent,
                command_line: sanitise_argv(&argv),
                spawning_host: spawning_host(&sys, parent),
            }
        })
        .collect()
}

/// A running process, and the registration it belongs to if any.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessMatch {
    /// Empty when nothing on disk accounts for this process.
    pub registration_key: String,
    pub pid: u32,
    pub command_line: String,
    pub spawning_host: Option<String>,
}

/// Which MCP servers are running, and which running servers nobody declared.
///
/// The second half is the interesting one. A server with no config behind it
/// is invisible to every host — each knows only its own children — and to
/// Hanger's own scan, which reads files. It shows up only here.
///
/// `regs` is `(registration_key, command, args)`.
pub fn match_processes(
    regs: &[(String, String, Vec<String>)],
    procs: &[RunningProcess],
) -> Vec<ProcessMatch> {
    let mut out = Vec::new();

    for p in procs {
        let matched = regs
            .iter()
            .find(|(_, cmd, args)| matches_launch(&p.command_line, cmd, args));

        match matched {
            Some((key, _, _)) => out.push(ProcessMatch {
                registration_key: key.clone(),
                pid: p.pid,
                command_line: p.command_line.clone(),
                spawning_host: p.spawning_host.clone(),
            }),
            // Only report an unmatched process when it looks like an MCP
            // server AND nothing spawned it. Every process on the machine is
            // not a finding, and neither is one a host started.
            //
            // The spawning-host clause is load-bearing. Measured against the
            // live process table: 230 processes matched no registration, but
            // 64 of them had a host — Claude Code, Cursor, VS Code. Those are
            // declared; Hanger just cannot say by which registration, because
            // npx and uvx rewrite argv past recognition (`npx
            // @playwright/mcp@0.0.69` runs as `node
            // ~/.npm/_npx/<hash>/node_modules/.bin/playwright-mcp`). Calling
            // them undeclared put a 230-strong warning in front of the user
            // where the true figure was the 166 nothing owns.
            //
            // Known gap, stated rather than papered over: a host-spawned
            // process Hanger cannot match appears in neither list. Widening
            // the match to fix that is how `node` starts claiming every Node
            // server on the machine.
            None if p.spawning_host.is_none() && looks_like_mcp(&p.command_line) => {
                out.push(ProcessMatch {
                    registration_key: String::new(),
                    pid: p.pid,
                    command_line: p.command_line.clone(),
                    spawning_host: p.spawning_host.clone(),
                })
            }
            None => {}
        }
    }

    out
}

/// A heuristic, and deliberately a narrow one.
///
/// There is no protocol-level way to tell an MCP server from any other process
/// without speaking to it, and probing every process on the machine is not
/// acceptable. Naming is the available signal: servers are conventionally
/// `*-mcp`, `mcp-*`, or launched with an `mcp` subcommand.
fn looks_like_mcp(command_line: &str) -> bool {
    let l = command_line.to_lowercase();
    l.contains("-mcp") || l.contains("mcp-") || l.contains(" mcp ") || l.ends_with(" mcp")
}

/// Walk up the parent chain to the application that owns this process.
///
/// A host rarely spawns its server directly — there is usually a launcher in
/// between, so the immediate parent is `npm exec …` or `uv` rather than the
/// app. Observed on this machine: the context7 server's parent is
/// `context7-mcp@2.1.4`, whose parent is `claude`. Four levels covers every
/// chain seen so far, and is bounded so a cycle cannot hang the scan.
///
/// Returning `None` is meaningful, not a failure: a process reparented to
/// `launchd` has outlived whatever started it, which is exactly the state the
/// unaccounted-process disclosure is about.
fn spawning_host(sys: &System, mut pid: u32) -> Option<String> {
    for _ in 0..4 {
        // pid 1 is launchd — the top of the tree, and nobody's MCP host.
        if pid <= 1 {
            return None;
        }
        let p = sys.process(sysinfo::Pid::from_u32(pid))?;
        if let Some(host) = host_for_process_name(&p.name().to_string_lossy()) {
            return Some(host.to_string());
        }
        pid = p.parent().map(|x| x.as_u32()).unwrap_or(0);
    }
    None
}

/// Map a process name to the MCP host it belongs to.
///
/// Order is load-bearing, and so is case. The Claude Code CLI's process is
/// `claude`, lowercase; Claude Desktop's is `Claude` with its `Claude Helper`
/// children. They are different hosts reading different config files, and
/// lowercase-exact is what separates them. Checking a case-insensitive
/// `contains("claude")` first would file every Claude Code server under
/// Claude Desktop.
///
/// `Code` must likewise come after `claude`: on this machine Claude Code runs
/// inside a VS Code terminal, so its parent chain reaches `Code Helper` too.
/// The host is whichever matches first walking up, and that is the process
/// that actually read the config and spawned the server.
fn host_for_process_name(name: &str) -> Option<&'static str> {
    // Claude Code CLI. Exact, lowercase — see the note above.
    if name == "claude" || name == "claude-code" {
        return Some("Claude Code");
    }
    if name == "codex" {
        return Some("Codex");
    }
    if name == "gemini" {
        return Some("Gemini CLI");
    }
    for (needle, host) in [
        ("Claude Helper", "Claude Desktop"),
        ("Claude", "Claude Desktop"),
        ("Cursor", "Cursor"),
        // Both process names, one display name. This column is rendered raw
        // — `spawning_host` never passes through a label map — so a stale
        // value here is not an internal id, it is the words on the row. The
        // panel showed a Devin Desktop user host "Devin Desktop" and, beside
        // it, spawned-by "Windsurf".
        ("Windsurf", "Devin Desktop"),
        ("Devin", "Devin Desktop"),
        ("Code Helper", "VS Code"),
        ("Code", "VS Code"),
    ] {
        if name.contains(needle) {
            return Some(host);
        }
    }
    if name.eq_ignore_ascii_case("zed") {
        return Some("Zed");
    }
    None
}

#[cfg(test)]
mod tests {
    use super::host_for_process_name as host;

    /// The ordering hazards, pinned. Each of these was got wrong by the
    /// obvious table — a case-insensitive `contains` walked in declaration
    /// order — and each was checked against `ps` output on 2026-08-15.
    #[test]
    fn claude_code_and_claude_desktop_are_not_confused() {
        // The CLI. Lowercase, exact. Every MCP server observed on this
        // machine hangs off one of these.
        assert_eq!(host("claude"), Some("Claude Code"));
        // The desktop app and its renderer children.
        assert_eq!(host("Claude"), Some("Claude Desktop"));
        assert_eq!(host("Claude Helper (Renderer)"), Some("Claude Desktop"));
    }

    #[test]
    fn claude_code_running_inside_vs_code_is_still_claude_code() {
        // `claude` in a VS Code terminal has `Code Helper (Plugin)` further up
        // the chain. Whichever matches first walking up is the process that
        // read the config, so `claude` must be reachable before `Code`.
        assert_eq!(host("Code Helper (Plugin)"), Some("VS Code"));
        assert_eq!(host("claude"), Some("Claude Code"));
    }

    #[test]
    fn devin_desktop_is_recognised_under_either_process_name() {
        // Cognition rebranded Windsurf to Devin Desktop on 2026-06-02, but the
        // binary and its process name did not necessarily follow in lockstep
        // on every install — both are matched, and both answer with the name
        // the product now has. `registry.rs` retired "Windsurf" as a display
        // name in the same commit that added the Devin process match here;
        // this column is the one place it survived.
        assert_eq!(host("Windsurf"), Some("Devin Desktop"));
        assert_eq!(host("Devin"), Some("Devin Desktop"));
    }

    #[test]
    fn launchers_and_the_init_process_own_nothing() {
        // A detached server's chain is uv → launchd. Attributing it to either
        // would erase the fact that nothing accounts for it.
        for name in ["uv", "launchd", "npm", "node", "python3", "context7-mcp@2.1.4"] {
            assert_eq!(host(name), None, "{} should not resolve to a host", name);
        }
    }
}
