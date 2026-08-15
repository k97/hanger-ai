//! What is actually running, and who started it.
//!
//! Hanger is not an MCP host, so it cannot ask a host what it spawned. It can
//! read the process table, which shows every host's children at once — the one
//! thing no individual host can see. A server running with no config behind it
//! is visible here and nowhere else.
//!
//! Read-only. Nothing is started, signalled or stopped.

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
pub fn redact(command_line: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    let mut redact_next = false;

    for word in command_line.split_whitespace() {
        if redact_next {
            out.push("<redacted>".to_string());
            redact_next = false;
            continue;
        }

        let lower = word.to_lowercase();
        let is_secret_flag = ["key", "token", "secret", "password", "auth"]
            .iter()
            .any(|k| lower.contains(k));

        if is_secret_flag {
            if let Some(eq) = word.find('=') {
                out.push(format!("{}=<redacted>", &word[..eq]));
            } else {
                // `--token secret` — the value is the next word.
                out.push(word.to_string());
                redact_next = true;
            }
            continue;
        }

        if word.contains("://") && word.contains('@') {
            let parts: Vec<&str> = word.splitn(2, "://").collect();
            let rest = parts[1];
            let host = rest.split('@').nth(1).unwrap_or(rest);
            out.push(format!("{}://{}", parts[0], host));
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
/// value (redacted). Operating on argv elements rather than on a joined string
/// matters — an environment value containing a space would otherwise split
/// into fragments that no longer look like assignments.
pub fn sanitise_argv(argv: &[String]) -> String {
    let kept: Vec<&str> = argv
        .iter()
        .map(String::as_str)
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

/// Every process currently running, redacted.
pub fn running_processes() -> Vec<RunningProcess> {
    let mut sys = System::new();
    // Two non-obvious requirements, both found by reading the live table.
    //
    // `cmd`: `refresh_processes` does NOT populate the command line — it
    // refreshes memory, cpu, disk usage and exe. Every argv then reads as ""
    // and the whole feature silently reports nothing running and nothing
    // unaccounted, with no error anywhere.
    //
    // `environ`: macOS returns argv and the environment in one buffer, and
    // sysinfo only knows where to cut when environ is refreshed too. Ask for
    // cmd alone and the entire environment is appended to every command line.
    // Nothing here reads `environ()`; it is requested so that `cmd()` is
    // correct, and `sanitise_argv` rejects the assignment shape regardless.
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing()
            .with_cmd(UpdateKind::Always)
            .with_environ(UpdateKind::Always),
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
        ("Windsurf", "Windsurf"),
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
    fn launchers_and_the_init_process_own_nothing() {
        // A detached server's chain is uv → launchd. Attributing it to either
        // would erase the fact that nothing accounts for it.
        for name in ["uv", "launchd", "npm", "node", "python3", "context7-mcp@2.1.4"] {
            assert_eq!(host(name), None, "{} should not resolve to a host", name);
        }
    }
}
