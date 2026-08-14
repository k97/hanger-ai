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
use tokio::process::Command;

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
        // Say what is wrong and where to fix it. The realm names the scheme.
        let realm = resp
            .headers()
            .get("www-authenticate")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        let scheme = if realm.to_lowercase().contains("oauth") { "OAuth" } else { "a token" };
        return ProbeResult::failed(format!(
            "This server requires authentication ({}). Hanger sends no credentials, so it cannot list the tools of a protected endpoint.",
            scheme
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
/// The child is killed on every exit path, including timeout and error. A
/// leaked probe process is worse than a failed probe.
pub async fn probe(command: &str, args: &[String], timeout: Duration) -> ProbeResult {
    match tokio::time::timeout(timeout, exchange(command, args)).await {
        Ok(result) => result,
        Err(_) => ProbeResult::failed(format!(
            "Timed out after {}s waiting for the server to respond",
            timeout.as_secs_f32()
        )),
    }
}

async fn exchange(command: &str, args: &[String]) -> ProbeResult {
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
        let _ = child.kill().await;
        return ProbeResult::failed("Could not open the server's input stream");
    };
    let Some(stdout) = child.stdout.take() else {
        let _ = child.kill().await;
        return ProbeResult::failed("Could not open the server's output stream");
    };

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
    if let Err(e) = write_line(&mut stdin, &initialize).await {
        let _ = child.kill().await;
        return ProbeResult::failed(format!("Could not send initialize: {}", e));
    }

    // Read until both responses have arrived. Non-JSON lines are skipped —
    // servers sometimes print banners on stdout before speaking protocol.
    let mut initialized = false;
    loop {
        let line = match lines.next_line().await {
            Ok(Some(l)) => l,
            Ok(None) => {
                let _ = child.kill().await;
                return ProbeResult::failed("The server closed its output before answering");
            }
            Err(e) => {
                let _ = child.kill().await;
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
                if write_line(&mut stdin, &notify).await.is_err()
                    || write_line(&mut stdin, &list).await.is_err()
                {
                    let _ = child.kill().await;
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
                let _ = child.kill().await;
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
