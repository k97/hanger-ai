//! Verify a server by handshake.
//!
//! Hanger is not an MCP host, so it cannot show a running server's tools by
//! asking whoever spawned it. What it can do is start its **own** private copy,
//! perform the `initialize` + `tools/list` exchange, record the answer, and
//! stop it. No other host's session is touched.
//!
//! This is the honest equivalent of VS Code's "start server" — VS Code restarts
//! a server specifically to discover its tools. Same payload, no interference.
//! The control is labelled Verify, not Start, because that is what it does.
//!
//! A config file declares how to *start* a server; it never declares what the
//! server provides. Nothing on disk records a tool list — this exchange is the
//! only way to learn one.

use std::process::Stdio;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};

/// First bounded wait in `shutdown`: after closing stdin, how long to give
/// the server to exit on its own before escalating to `SIGTERM`. Who pays
/// this, and how much, splits in two, measured directly against this
/// module's own fixtures rather than assumed:
///
/// - A server that exits on stdin EOF (the shape of most of this module's
///   fixtures, and of a well-behaved short-lived CLI-style server) pays
///   close to nothing — `wait_briefly` returns the moment the child exits,
///   not at the deadline. Warm-run measurement: ~3ms total.
/// - A server whose event loop stays alive after stdin closes — not a
///   "wedged" server, just one that does not treat EOF as a shutdown signal,
///   which describes a good number of real Node and Python MCP servers —
///   pays the full window on *every* probe. Measured directly (a fixture
///   that answers the handshake correctly but never exits on EOF): 3-4ms
///   before this fix, 507-519ms with it. That extra ~500ms is this
///   constant, paid in full, not a worst case.
///
/// This is spec-correct and is the point of the task, so the number is not
/// tuned down to make the second case cheaper — closing stdin without
/// waiting for a response is exactly the bare-`kill()` behaviour being
/// replaced. But it does mean a later stage that probes on every panel open
/// (rather than only on a Verify click) inherits this cost per probe against
/// exactly the servers most likely to still be running: whoever reads this
/// next needs the real number, not a reassuring one.
const SHUTDOWN_WAIT: Duration = Duration::from_millis(500);

/// Second bounded wait in `shutdown`: after `SIGTERM`, how long to give the
/// server to act on it before `SIGKILL`. A process that traps and handles
/// `SIGTERM` at all typically unwinds in ~10-30ms on an idle machine
/// (measured directly against this module's SIGTERM-trap fixture). Set equal
/// to `SHUTDOWN_WAIT` rather than shorter, on evidence, not the original
/// 200ms guess: under this suite's own parallelism — several tests spawning
/// real child processes at once — signal *handling* can lag well past 200ms
/// even though signal *delivery* does not, because a caught signal needs the
/// target to be scheduled to run its handler, and a busy machine can delay
/// that scheduling. 200ms produced real, repeatable failures under
/// `cargo test`'s own concurrency (not a contrived stress case); 500ms did
/// not, across repeated full-suite runs. A truly wedged server ignores
/// `SIGTERM` outright and pays the full window regardless of how long it is,
/// so the only cost of the larger number is on an already-uncooperative
/// path, never the common one.
const SHUTDOWN_TERM_WAIT: Duration = Duration::from_millis(500);

/// The protocol revision Hanger advertises. A server may answer with its own —
/// `spades-audio` speaks 2025-06-18, `mcp-server-tauri` speaks 2024-11-05 —
/// and both are recorded as reported rather than treated as a fault.
const CLIENT_PROTOCOL_VERSION: &str = "2025-06-18";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProbedTool {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProbeResult {
    pub server_name: Option<String>,
    pub server_version: Option<String>,
    pub protocol_version: Option<String>,
    /// Sorted capability keys the server advertises, e.g. `["prompts", "tools"]`.
    pub capabilities: Vec<String>,
    pub tools: Vec<ProbedTool>,
    /// `None` on success. Present means the probe did not complete; the panel
    /// shows it instead of an unexplained empty tool list.
    pub error: Option<String>,
}

impl ProbeResult {
    fn failed(msg: impl Into<String>) -> Self {
        Self {
            error: Some(msg.into()),
            ..Default::default()
        }
    }
}

/// Resolve a declaration into an executable and its arguments.
///
/// Configs are inconsistent about where the arguments live. `~/.claude.json`
/// declares spades-audio as `{"command": "node", "args": [...]}` but tauri as
/// `{"command": "npx @hypothesi/tauri-mcp-server"}` with no args at all, and
/// `~/.codex/config.toml` does the same with an explicitly empty `args = []`.
/// Passed verbatim, the second form makes `Command::new` search for a binary
/// named "npx @hypothesi/tauri-mcp-server" and fail with ENOENT.
///
/// Splitting is confined to the case that needs it: no arguments were given,
/// the command contains whitespace, and it is not a path. An absolute or
/// relative path is left whole however much whitespace it carries, so
/// "/Applications/Spades Audio.app/..." survives intact.
pub fn split_launch(command: &str, args: &[String]) -> (String, Vec<String>) {
    let looks_like_path =
        command.starts_with('/') || command.starts_with('.') || command.starts_with('~');

    if args.is_empty() && !looks_like_path && command.split_whitespace().count() > 1 {
        let mut parts = command.split_whitespace();
        let prog = parts.next().unwrap_or(command).to_string();
        return (prog, parts.map(str::to_string).collect());
    }

    (command.to_string(), args.to_vec())
}

/// What a probe of one declaration will actually do.
///
/// The distinction is not cosmetic: `Spawn` starts a third-party process on
/// this machine and `Dial` starts nothing at all. Every decision downstream —
/// which function runs the handshake, what the cache is keyed on, whether
/// there is a file worth stat-ing — turns on it, and inlining the test at
/// each of those places is how three copies of one rule drift apart.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProbeLaunch {
    /// `probe(program, argv)`: a local process, arguments already resolved by
    /// [`split_launch`].
    Spawn { program: String, argv: Vec<String> },
    /// `probe_http(url)`: an endpoint is dialled and nothing is spawned.
    Dial { url: String },
}

/// Decide whether a declaration is spawned or dialled.
///
/// The condition is the one `mcp_probe` has always used: an empty command
/// plus an `http(s)` transport is a remote server. Anything else is spawned,
/// including a `claude.ai` connector — callers that must not touch one check
/// the transport themselves, because "there is nothing to spawn" and "there
/// is nothing Hanger can reach at all" are different facts.
pub fn probe_launch(command: &str, args: &[String], transport: &str) -> ProbeLaunch {
    if command.trim().is_empty() && (transport.starts_with("http://") || transport.starts_with("https://")) {
        return ProbeLaunch::Dial { url: transport.to_string() };
    }
    let (program, argv) = split_launch(command, args);
    ProbeLaunch::Spawn { program, argv }
}

/// The `probe_results` row this declaration's answer belongs in:
/// `mcp::identity::launch_hash` over what [`probe_launch`] resolved.
///
/// Two inputs are not obvious, and both were defects waiting to happen.
///
/// **A dial is keyed on its URL.** A remote declaration has an empty command
/// and empty args, so hashing those alone yields the same string for every
/// remote server on the machine — Notion and Linear landing on one row, the
/// first probed answering for both under the other's name. The URL is what a
/// dial actually contacts, so the URL is what the key carries. It rides in
/// the args slot rather than the command slot because `normalise_launch`
/// basenames the command, which would reduce every `https://…/mcp` endpoint
/// to `mcp`.
///
/// **A spawn is keyed after [`split_launch`], not before.** `~/.claude.json`
/// writes `{"command": "npx pkg"}` and `~/.codex/config.toml` writes the same
/// server as a command plus `args = []`; `probe` reconciles them before
/// spawning, so a key taken before that split would probe and cache the same
/// server twice depending on which host's declaration was opened. This is
/// deliberately unlike `mcp::agreement::comparison_key`, which does not
/// split: that key compares how hosts *declare* a server, where the spelling
/// is the subject. This one describes what gets *run*.
///
/// Env keys are NAMES only, as everywhere else — `normalise_launch`'s
/// signature cannot accept values.
pub fn cache_key(
    command: &str,
    args: &[String],
    env_keys: &[String],
    project_root: Option<&str>,
    transport: &str,
) -> String {
    let (key_command, key_args) = match probe_launch(command, args, transport) {
        ProbeLaunch::Spawn { program, argv } => (program, argv),
        ProbeLaunch::Dial { url } => (String::new(), vec![url]),
    };
    let normalised = crate::mcp::identity::normalise_launch(&key_command, &key_args, env_keys, project_root);
    crate::mcp::identity::launch_hash(&normalised)
}

/// The mtime, in milliseconds, of the file worth stat-ing for this launch —
/// `mcp::freshness::stat_target`'s answer, actually stat-ed.
///
/// `None` is the ordinary case, not a failure: an `npx pkg@latest` launch has
/// no path to stat and a dial has no file at all, and `freshness::verdict`
/// falls back to the TTL alone for both.
///
/// The two halves come from different places on purpose. The path candidates
/// are the *normalised* args, so `~/servers/x.js` has been expanded to
/// something `metadata` can open; the command is the *raw* post-split
/// program, because `normalise_launch` reduces it to a basename and would
/// discard the absolute path of a bare-executable launch — the one
/// `stat_target` falls back to when no argument is a path.
pub fn launch_mtime_ms(command: &str, args: &[String], transport: &str) -> Option<i64> {
    let ProbeLaunch::Spawn { program, argv } = probe_launch(command, args, transport) else {
        return None;
    };
    let normalised = crate::mcp::identity::normalise_launch(&program, &argv, &[], None);
    let target = crate::mcp::freshness::stat_target(&program, &normalised.args)?;
    let modified = std::fs::metadata(target).ok()?.modified().ok()?;
    Some(modified.duration_since(std::time::UNIX_EPOCH).ok()?.as_millis() as i64)
}

/// PATH for the child, widened beyond what a GUI process inherits.
///
/// An app launched from Finder gets `/usr/bin:/bin:/usr/sbin:/sbin` — not the
/// shell's PATH. Every common MCP launcher lives outside that set: npx and node
/// under /usr/local/bin, uvx under ~/.local/bin, bunx under ~/.bun/bin. Without
/// this, Verify reports "No such file or directory" for servers that run
/// perfectly well from a terminal.
fn widened_path() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    let mut dirs: Vec<String> = vec![
        format!("{}/.local/bin", home),
        format!("{}/.bun/bin", home),
        format!("{}/.cargo/bin", home),
        "/opt/homebrew/bin".to_string(),
        "/usr/local/bin".to_string(),
    ];
    if let Ok(existing) = std::env::var("PATH") {
        dirs.push(existing);
    } else {
        dirs.push("/usr/bin:/bin:/usr/sbin:/sbin".to_string());
    }
    dirs.join(":")
}

/// Pull a JSON-RPC message out of a Streamable HTTP reply.
///
/// A POST may be answered with plain JSON or with an SSE frame, and servers
/// choose freely. Reading only one shape makes half of them look broken. SSE
/// carries the payload on `data:` lines, interleaved with comments (`:`),
/// `event:` and `id:` lines that must be skipped.
pub fn extract_rpc(body: &str) -> Option<serde_json::Value> {
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(body.trim()) {
        if v.is_object() {
            return Some(v);
        }
    }
    for line in body.lines() {
        if let Some(payload) = line.strip_prefix("data:") {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(payload.trim()) {
                return Some(v);
            }
        }
    }
    None
}

/// The metadata document a 401 points at, from its `WWW-Authenticate` header.
///
/// MCP servers answer an unauthenticated request with
/// `Bearer realm="OAuth", resource_metadata="https://…/.well-known/…"`.
/// That document names the scopes required, so reporting only "needs auth"
/// discards detail the server volunteered.
pub fn resource_metadata_url(www_authenticate: &str) -> Option<String> {
    let key = "resource_metadata=\"";
    let start = www_authenticate.find(key)? + key.len();
    let rest = &www_authenticate[start..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

/// The scopes an OAuth-protected resource declares it needs.
pub fn scopes_from_metadata(body: &str) -> Vec<String> {
    serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| {
            v.get("scopes_supported")
                .and_then(|s| s.as_array())
                .map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect())
        })
        .unwrap_or_default()
}

/// Verify a remote server over Streamable HTTP.
///
/// A remote server has no process to spawn — it is dialled, not launched. The
/// exchange is the same three JSON-RPC messages, POSTed to the endpoint instead
/// of written to a pipe.
///
/// Nothing is sent but the handshake: no credentials are read from disk or
/// invented. An endpoint behind OAuth answers 401, and saying so is a better
/// answer than an empty tool list.
pub async fn probe_http(url: &str, timeout: Duration) -> ProbeResult {
    let client = match reqwest::Client::builder().timeout(timeout).build() {
        Ok(c) => c,
        Err(e) => return ProbeResult::failed(format!("Could not build an HTTP client: {}", e)),
    };

    let post = |body: serde_json::Value, session: Option<String>| {
        let mut req = client
            .post(url)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json, text/event-stream")
            .json(&body);
        if let Some(sid) = session {
            req = req.header("Mcp-Session-Id", sid);
        }
        req.send()
    };

    let init = serde_json::json!({
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {
            "protocolVersion": CLIENT_PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": { "name": "hanger-probe", "version": "0.1" }
        }
    });

    let resp = match post(init, None).await {
        Ok(r) => r,
        Err(e) => return ProbeResult::failed(format!("Could not reach {}: {}", url, e)),
    };

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        let challenge = resp
            .headers()
            .get("www-authenticate")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();

        // Follow the pointer the server gave us and name the scopes, rather
        // than reporting a bare "needs auth" that is less specific than the
        // 401 already was.
        let mut detail = String::new();
        if let Some(url) = resource_metadata_url(&challenge) {
            if let Ok(meta) = client.get(&url).send().await {
                if let Ok(body) = meta.text().await {
                    let scopes = scopes_from_metadata(&body);
                    if !scopes.is_empty() {
                        detail = format!(" It asks for the {} scope{}.",
                            scopes.join(" and "),
                            if scopes.len() == 1 { "" } else { "s" });
                    }
                }
            }
        }

        let scheme = if challenge.to_lowercase().contains("oauth") { "OAuth" } else { "a bearer token" };
        return ProbeResult::failed(format!(
            "This server is protected by {} and refuses the handshake without a token.{} \
             Hanger holds no credentials, so it cannot list these tools. They appear in \
             Claude because Claude signed in to this server and holds a token of its own.",
            scheme, detail
        ));
    }
    if !resp.status().is_success() {
        return ProbeResult::failed(format!("{} answered {}", url, resp.status()));
    }

    let session = resp
        .headers()
        .get("mcp-session-id")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);

    let body = match resp.text().await {
        Ok(b) => b,
        Err(e) => return ProbeResult::failed(format!("Could not read the reply: {}", e)),
    };
    let Some(msg) = extract_rpc(&body) else {
        return ProbeResult::failed("The server's reply carried no JSON-RPC payload".to_string());
    };

    let mut out = ProbeResult::default();
    let result = msg.get("result");
    out.protocol_version = result
        .and_then(|r| r.get("protocolVersion"))
        .and_then(|v| v.as_str())
        .map(str::to_string);
    if let Some(info) = result.and_then(|r| r.get("serverInfo")) {
        out.server_name = info.get("name").and_then(|v| v.as_str()).map(str::to_string);
        out.server_version = info.get("version").and_then(|v| v.as_str()).map(str::to_string);
    }
    if let Some(caps) = result.and_then(|r| r.get("capabilities")).and_then(|v| v.as_object()) {
        out.capabilities = caps.keys().cloned().collect();
        out.capabilities.sort();
    }

    let _ = post(
        serde_json::json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }),
        session.clone(),
    )
    .await;

    let list = serde_json::json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {} });
    let resp = match post(list, session).await {
        Ok(r) => r,
        Err(e) => {
            out.error = Some(format!("Could not request the tool list: {}", e));
            return out;
        }
    };
    let body = resp.text().await.unwrap_or_default();
    if let Some(msg) = extract_rpc(&body) {
        if let Some(tools) = msg.get("result").and_then(|r| r.get("tools")).and_then(|v| v.as_array())
        {
            out.tools = tools
                .iter()
                .filter_map(|t| {
                    let name = t.get("name").and_then(|v| v.as_str())?.to_string();
                    let description =
                        t.get("description").and_then(|v| v.as_str()).map(str::to_string);
                    Some(ProbedTool { name, description })
                })
                .collect();
        }
    }
    out
}

/// Run the exchange, or return a `ProbeResult` carrying the reason it could not.
///
/// The child is stopped via `shutdown` on every exit path, including timeout
/// and error. A leaked probe process is worse than a failed probe.
///
/// `child` and `stdin` are owned here, not inside `exchange`, and
/// `shutdown` is called exactly once, unconditionally, right after the
/// timed call resolves — whichever way it resolves. That is deliberate:
/// `tokio::time::timeout` cancels `exchange`'s future by dropping it, which
/// runs no further async code, so a `shutdown` call placed *inside*
/// `exchange` can never run on the timeout path. Owning the child outside
/// the timed future is what makes timeout reach the same orderly shutdown
/// as every other exit, instead of falling back to `kill_on_drop`'s bare
/// `SIGKILL`.
pub async fn probe(command: &str, args: &[String], timeout: Duration) -> ProbeResult {
    // stderr is discarded rather than inherited or piped. Servers log freely to
    // it, and an unread pipe fills and deadlocks the child.
    let (program, argv) = split_launch(command, args);

    let mut child = match Command::new(&program)
        .args(&argv)
        .env("PATH", widened_path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            return ProbeResult::failed(format!(
                "Could not start `{}`: {}",
                program, e
            ))
        }
    };

    let Some(mut stdin) = child.stdin.take() else {
        shutdown(&mut child, None).await;
        return ProbeResult::failed("Could not open the server's input stream");
    };
    let Some(stdout) = child.stdout.take() else {
        shutdown(&mut child, Some(stdin)).await;
        return ProbeResult::failed("Could not open the server's output stream");
    };

    let outcome = tokio::time::timeout(timeout, exchange(&mut stdin, stdout)).await;
    shutdown(&mut child, Some(stdin)).await;

    match outcome {
        Ok(result) => result,
        Err(_) => ProbeResult::failed(format!(
            "Timed out after {}s waiting for the server to respond",
            timeout.as_secs_f32()
        )),
    }
}

/// Stop `child` per the MCP specification's Lifecycle §Shutdown/stdio: close
/// the input stream, wait for exit or send `SIGTERM` if it does not exit in
/// time, then `SIGKILL` if `SIGTERM` does not work either.
/// `tokio::process::Child::kill()` alone is documented as "equivalent to
/// sending a SIGKILL on unix platforms" — no stdin close, no `SIGTERM` — so
/// it is reached here only as the last resort, never as the first move.
/// `kill_on_drop(true)` on the spawned command stays as the backstop for
/// panics and early returns; this function is the orderly path every normal
/// exit takes instead.
async fn shutdown(child: &mut Child, stdin: Option<ChildStdin>) {
    // Step 1: close the input stream by dropping it.
    drop(stdin);

    // Step 2: wait for the server to exit on its own.
    if wait_briefly(child, SHUTDOWN_WAIT).await {
        return;
    }

    // Step 2, escalated: SIGTERM, then wait again.
    if let Some(pid) = child.id() {
        // SAFETY: `pid` was read from `Child::id()` immediately above, and
        // `child` is still held here unreaped, so the OS cannot have
        // recycled this pid to an unrelated process yet — a terminated but
        // unreaped child stays a zombie holding its pid. `libc::kill` with a
        // valid pid and SIGTERM cannot cause memory unsafety; its only
        // failure mode here (ESRCH, the process already exited) is silently
        // correct — there is nothing left to signal.
        unsafe {
            libc::kill(pid as libc::pid_t, libc::SIGTERM);
        }
        if wait_briefly(child, SHUTDOWN_TERM_WAIT).await {
            return;
        }
    }

    // Step 3: SIGKILL, waiting for the reap.
    let _ = child.kill().await;
}

/// Wait up to `dur` for `child` to exit. `true` if it did within the window.
async fn wait_briefly(child: &mut Child, dur: Duration) -> bool {
    matches!(tokio::time::timeout(dur, child.wait()).await, Ok(Ok(_)))
}

/// The JSON-RPC handshake itself: `initialize`, then `tools/list`. Owns
/// neither the child process nor its stdin — `probe` retains both so it can
/// run `shutdown` after this returns, cancels, or times out.
async fn exchange(stdin: &mut ChildStdin, stdout: ChildStdout) -> ProbeResult {
    let mut lines = BufReader::new(stdout).lines();
    let mut out = ProbeResult::default();

    let initialize = serde_json::json!({
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {
            "protocolVersion": CLIENT_PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": { "name": "hanger-probe", "version": "0.1" }
        }
    });
    if let Err(e) = write_line(stdin, &initialize).await {
        return ProbeResult::failed(format!("Could not send initialize: {}", e));
    }

    // Read until both responses have arrived. Non-JSON lines are skipped —
    // servers sometimes print banners on stdout before speaking protocol.
    let mut initialized = false;
    loop {
        let line = match lines.next_line().await {
            Ok(Some(l)) => l,
            Ok(None) => {
                return ProbeResult::failed("The server closed its output before answering");
            }
            Err(e) => {
                return ProbeResult::failed(format!("Could not read from the server: {}", e));
            }
        };

        let Ok(msg) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };

        match msg.get("id").and_then(|v| v.as_i64()) {
            Some(1) if !initialized => {
                initialized = true;
                let result = msg.get("result");
                out.protocol_version = result
                    .and_then(|r| r.get("protocolVersion"))
                    .and_then(|v| v.as_str())
                    .map(str::to_string);
                if let Some(info) = result.and_then(|r| r.get("serverInfo")) {
                    out.server_name = info.get("name").and_then(|v| v.as_str()).map(str::to_string);
                    out.server_version =
                        info.get("version").and_then(|v| v.as_str()).map(str::to_string);
                }
                if let Some(caps) = result.and_then(|r| r.get("capabilities")).and_then(|v| v.as_object())
                {
                    out.capabilities = caps.keys().cloned().collect();
                    out.capabilities.sort();
                }

                let notify = serde_json::json!({
                    "jsonrpc": "2.0", "method": "notifications/initialized"
                });
                let list = serde_json::json!({
                    "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}
                });
                if write_line(stdin, &notify).await.is_err()
                    || write_line(stdin, &list).await.is_err()
                {
                    return ProbeResult::failed("Could not request the tool list");
                }
            }
            Some(2) => {
                if let Some(tools) = msg
                    .get("result")
                    .and_then(|r| r.get("tools"))
                    .and_then(|v| v.as_array())
                {
                    out.tools = tools
                        .iter()
                        .filter_map(|t| {
                            let name = t.get("name").and_then(|v| v.as_str())?.to_string();
                            let description = t
                                .get("description")
                                .and_then(|v| v.as_str())
                                .map(str::to_string);
                            Some(ProbedTool { name, description })
                        })
                        .collect();
                }
                return out;
            }
            _ => continue,
        }
    }
}

async fn write_line(
    stdin: &mut tokio::process::ChildStdin,
    value: &serde_json::Value,
) -> std::io::Result<()> {
    let mut line = serde_json::to_vec(value)?;
    line.push(b'\n');
    stdin.write_all(&line).await?;
    stdin.flush().await
}
