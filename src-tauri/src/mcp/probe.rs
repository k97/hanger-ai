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
    let mut child = match Command::new(command)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
    {
        Ok(c) => c,
        Err(e) => return ProbeResult::failed(format!("Could not start the server: {}", e)),
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
