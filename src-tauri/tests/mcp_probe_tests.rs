//! Verify probe: spawn a server, handshake, list its tools, stop it.
//!
//! Hermetic — every test drives a shell script standing in for an MCP server.
//! Nothing here needs a real server installed, and nothing touches the network.
//!
//! The wire shape under test was transcribed from a real exchange against
//! spades-audio and mcp-server-tauri, not guessed.

use std::time::Duration;
use tauri_app_lib::mcp::probe;

#[cfg(unix)]
fn write_script(dir: &std::path::Path, name: &str, body: &str) -> String {
    use std::os::unix::fs::PermissionsExt;
    let path = dir.join(name);
    std::fs::write(&path, body).unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
    path.to_string_lossy().to_string()
}

/// A minimal MCP server: answers initialize and tools/list, ignores the rest.
#[cfg(unix)]
fn fake_server(dir: &std::path::Path, tools_json: &str) -> String {
    let body = format!(
        r#"#!/bin/sh
while IFS= read -r line; do
  case "$line" in
    *'"initialize"'*)
      printf '%s\n' '{{"jsonrpc":"2.0","id":1,"result":{{"protocolVersion":"2025-06-18","capabilities":{{"tools":{{}}}},"serverInfo":{{"name":"fake","version":"9.9.9"}}}}}}' ;;
    *'"tools/list"'*)
      printf '%s\n' '{{"jsonrpc":"2.0","id":2,"result":{{"tools":{}}}}}' ;;
  esac
done
"#,
        tools_json
    );
    write_script(dir, "fake_server.sh", &body)
}

#[cfg(unix)]
#[tokio::test]
async fn probe_reports_identity_and_tools() {
    let dir = tempfile::tempdir().unwrap();
    let s = fake_server(
        dir.path(),
        r#"[{"name":"alpha","description":"does alpha"},{"name":"beta","description":"does beta"}]"#,
    );

    let r = probe::probe(&s, &[], Duration::from_secs(10)).await;

    assert_eq!(r.error, None, "probe errored: {:?}", r.error);
    assert_eq!(r.server_name.as_deref(), Some("fake"));
    assert_eq!(r.server_version.as_deref(), Some("9.9.9"));
    assert_eq!(r.protocol_version.as_deref(), Some("2025-06-18"));
    assert_eq!(r.capabilities, vec!["tools"]);
    assert_eq!(r.tools.len(), 2);
    assert_eq!(r.tools[0].name, "alpha");
    assert_eq!(r.tools[0].description.as_deref(), Some("does alpha"));
}

#[cfg(unix)]
#[tokio::test]
async fn probe_times_out_instead_of_hanging_the_ui() {
    // A server that reads forever and never answers. Without a timeout this
    // blocks the Tauri command and freezes the panel.
    let dir = tempfile::tempdir().unwrap();
    let s = write_script(dir.path(), "silent.sh", "#!/bin/sh\nwhile true; do sleep 1; done\n");

    let started = std::time::Instant::now();
    let r = probe::probe(&s, &[], Duration::from_millis(600)).await;

    assert!(r.error.is_some(), "a silent server must produce an error");
    assert!(
        started.elapsed() < Duration::from_secs(5),
        "probe did not honour its timeout: took {:?}",
        started.elapsed()
    );
    assert!(r.tools.is_empty());
}

#[cfg(unix)]
#[tokio::test]
async fn probe_survives_a_server_that_writes_noise_to_stdout() {
    // Servers sometimes print banners before speaking JSON-RPC. A non-JSON
    // line must be skipped, not treated as a protocol error.
    let dir = tempfile::tempdir().unwrap();
    let body = r#"#!/bin/sh
printf '%s\n' 'starting up, please wait'
while IFS= read -r line; do
  case "$line" in
    *'"initialize"'*)
      printf '%s\n' 'another banner line'
      printf '%s\n' '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{}},"serverInfo":{"name":"noisy","version":"1.0"}}}' ;;
    *'"tools/list"'*)
      printf '%s\n' '{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"solo"}]}}' ;;
  esac
done
"#;
    let s = write_script(dir.path(), "noisy.sh", body);

    let r = probe::probe(&s, &[], Duration::from_secs(10)).await;

    assert_eq!(r.error, None, "banner lines must not break the probe: {:?}", r.error);
    assert_eq!(r.server_name.as_deref(), Some("noisy"));
    assert_eq!(r.tools.len(), 1);
    assert_eq!(r.tools[0].name, "solo");
    assert_eq!(r.tools[0].description, None, "a tool may omit its description");
}

#[tokio::test]
async fn probe_reports_a_missing_binary_as_an_error_not_a_panic() {
    let r = probe::probe("definitely-not-a-real-binary-xyz", &[], Duration::from_secs(5)).await;
    assert!(r.error.is_some());
    assert!(r.tools.is_empty());
}

/// Evidence against a real server, not a shell stand-in.
///
/// #[ignore] so the pinned `cargo test` gate stays hermetic — it depends on
/// Spades Audio being installed. Run explicitly:
///   cargo test --test mcp_probe_tests -- --ignored --nocapture real_server
#[cfg(unix)]
#[tokio::test]
#[ignore]
async fn real_server_probe_lists_tools() {
    let script = "/Applications/Spades Audio.app/Contents/Resources/mcp-server/dist/index.js";
    if !std::path::Path::new(script).exists() {
        eprintln!("skipped: Spades Audio not installed at {}", script);
        return;
    }

    let r = probe::probe("node", &[script.to_string()], Duration::from_secs(20)).await;

    println!(
        "server={:?} v{:?} protocol={:?} caps={:?} tools={}",
        r.server_name, r.server_version, r.protocol_version, r.capabilities, r.tools.len()
    );
    for t in r.tools.iter().take(3) {
        println!("  {} -- {}", t.name, t.description.as_deref().unwrap_or(""));
    }

    assert_eq!(r.error, None);
    assert_eq!(r.server_name.as_deref(), Some("spades-audio"));
    assert_eq!(r.tools.len(), 17);
}

// ─── Launch resolution ───────────────────────────────────────────────────────

#[test]
fn a_command_carrying_its_own_arguments_is_split() {
    // Real configs on this machine declare tauri as a single string:
    //   {"command": "npx @hypothesi/tauri-mcp-server"}   (~/.claude.json)
    //   command = "npx @hypothesi/tauri-mcp-server"      (~/.codex/config.toml)
    // Passed verbatim, Command::new looks for a binary with that literal name
    // and fails with ENOENT.
    let (prog, args) = probe::split_launch("npx @hypothesi/tauri-mcp-server", &[]);
    assert_eq!(prog, "npx");
    assert_eq!(args, vec!["@hypothesi/tauri-mcp-server"]);
}

#[test]
fn an_explicit_args_list_is_never_second_guessed() {
    let given = vec!["/some/server.js".to_string()];
    let (prog, args) = probe::split_launch("node", &given);
    assert_eq!(prog, "node");
    assert_eq!(args, given);
}

#[test]
fn a_path_with_spaces_is_left_alone() {
    // "/Applications/Spades Audio.app/..." must not be torn in half. An
    // absolute path is a path, whatever whitespace it contains.
    let cmd = "/Applications/Spades Audio.app/Contents/MacOS/server";
    let (prog, args) = probe::split_launch(cmd, &[]);
    assert_eq!(prog, cmd);
    assert!(args.is_empty());
}

#[test]
fn a_bare_command_with_no_arguments_is_unchanged() {
    let (prog, args) = probe::split_launch("node", &[]);
    assert_eq!(prog, "node");
    assert!(args.is_empty());
}

/// The exact declaration that failed with ENOENT in the running app:
/// `{"command": "npx @hypothesi/tauri-mcp-server"}` with no args.
#[cfg(unix)]
#[tokio::test]
#[ignore]
async fn real_server_probe_handles_a_self_contained_command() {
    let r = probe::probe("npx @hypothesi/tauri-mcp-server", &[], Duration::from_secs(45)).await;
    println!(
        "server={:?} v{:?} protocol={:?} caps={:?} tools={} error={:?}",
        r.server_name, r.server_version, r.protocol_version, r.capabilities, r.tools.len(), r.error
    );
    assert_eq!(r.error, None);
    assert!(r.tools.len() >= 15, "expected tauri's tool list, got {}", r.tools.len());
}

// ─── Remote (HTTP) servers ───────────────────────────────────────────────────

#[test]
fn a_streamable_http_reply_is_read_whether_json_or_sse() {
    // Streamable HTTP servers may answer a POST with plain JSON or with an SSE
    // frame. Reading only one shape makes half of them look broken.
    let plain = r#"{"jsonrpc":"2.0","id":1,"result":{"serverInfo":{"name":"remote","version":"2.0"}}}"#;
    let v = probe::extract_rpc(plain).expect("plain JSON");
    assert_eq!(v["result"]["serverInfo"]["name"], "remote");

    let sse = "event: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"serverInfo\":{\"name\":\"remote\",\"version\":\"2.0\"}}}\n\n";
    let v = probe::extract_rpc(sse).expect("SSE frame");
    assert_eq!(v["result"]["serverInfo"]["name"], "remote");
}

#[test]
fn sse_noise_before_the_payload_is_skipped() {
    let sse = ": ping\nevent: message\nid: 7\ndata: {\"jsonrpc\":\"2.0\",\"id\":2,\"result\":{\"tools\":[{\"name\":\"alpha\"}]}}\n\n";
    let v = probe::extract_rpc(sse).expect("payload after noise");
    assert_eq!(v["result"]["tools"][0]["name"], "alpha");
}

#[test]
fn a_body_with_no_json_payload_is_none() {
    assert!(probe::extract_rpc(": keepalive\n\n").is_none());
    assert!(probe::extract_rpc("").is_none());
}

/// The real endpoint from the mei-recipes repo. It requires OAuth, so the
/// probe must report that clearly rather than an opaque failure.
#[tokio::test]
#[ignore]
async fn real_remote_probe_reports_authentication_clearly() {
    let r = probe::probe_http(
        "https://mei-recipes-api.karthik-rk.workers.dev/mcp",
        Duration::from_secs(30),
    )
    .await;
    println!("error={:?} tools={}", r.error, r.tools.len());
    let msg = r.error.expect("an OAuth-protected endpoint must report why");
    let lower = msg.to_lowercase();
    // Name the scheme, the scopes the server asked for, and why the same tools
    // are visible in Claude. "Requires authentication" alone tells the reader
    // less than the 401 did.
    assert!(lower.contains("oauth"), "scheme not named: {}", msg);
    assert!(lower.contains("scope"), "scopes not named: {}", msg);
    assert!(lower.contains("claude"), "does not explain why Claude can see them: {}", msg);
}

#[test]
fn the_auth_challenge_yields_where_to_look_up_what_is_required() {
    // A 401 carries WWW-Authenticate, and MCP servers point it at
    // oauth-protected-resource metadata that names the scopes. Reporting
    // "requires authentication" while ignoring the detail the server just
    // handed us is a worse answer than the server gave.
    let h = r#"Bearer realm="OAuth", resource_metadata="https://example.com/.well-known/oauth-protected-resource", error="invalid_token""#;
    assert_eq!(
        probe::resource_metadata_url(h).as_deref(),
        Some("https://example.com/.well-known/oauth-protected-resource")
    );
    assert_eq!(probe::resource_metadata_url("Bearer realm=\"OAuth\""), None);
    assert_eq!(probe::resource_metadata_url(""), None);
}

#[test]
fn scopes_are_read_from_the_metadata_document() {
    let doc = r#"{"resource":"https://x","scopes_supported":["read","write"],"bearer_methods_supported":["header"]}"#;
    assert_eq!(probe::scopes_from_metadata(doc), vec!["read", "write"]);
    assert!(probe::scopes_from_metadata("{}").is_empty());
    assert!(probe::scopes_from_metadata("not json").is_empty());
}

// ─── Single-file resolution (mcp_probe stops re-walking the filesystem) ────
//
// `mcp_probe` used to call `run_scan` — a full walk of every engine root on
// the machine — before every probe, measured at 11.2s. A registration key
// already names the one file the server was declared in
// (`"{config_path}:{server_name}"`, `RegistrationKey::new`), so resolution
// only needs to open that file.

#[cfg(unix)]
#[test]
fn resolves_one_server_from_its_exact_file_without_reading_a_sibling() {
    use tauri_app_lib::mcp::discover;

    let root = tempfile::tempdir().unwrap();
    let real_dir = root.path().join("real");
    let decoy_dir = root.path().join("decoy");
    std::fs::create_dir_all(&real_dir).unwrap();
    std::fs::create_dir_all(&decoy_dir).unwrap();

    let real_config = real_dir.join("config.json");
    std::fs::write(
        &real_config,
        r#"{"mcpServers":{"target":{"command":"real-command","args":["a"]}}}"#,
    )
    .unwrap();

    // A sibling directory's config is what a filesystem walk starting from a
    // common ancestor would also find. A FIFO has no writer, so opening it
    // for a read blocks forever; if resolution ever touches it the test
    // hangs on the recv below instead of quietly passing. That is a stronger
    // proof than "the returned value happened to be right" — the old
    // `mcp_probe` looked the server up by its full registration key too
    // (config path *and* name) after scanning everything, so a same-name,
    // different-command decoy would not have caught it walking.
    let decoy_fifo = decoy_dir.join("config.json");
    let status = std::process::Command::new("mkfifo")
        .arg(&decoy_fifo)
        .status()
        .expect("mkfifo must be available on this machine");
    assert!(status.success(), "failed to create decoy FIFO");

    let key = format!("{}:target", real_config.to_string_lossy());

    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let result = discover::resolve_registration(&key);
        let _ = tx.send(result);
    });

    let result = rx
        .recv_timeout(std::time::Duration::from_secs(2))
        .expect("resolve_registration hung — it opened something besides the named file");

    let reg = result.expect("must resolve the server declared in the exact file the key names");
    assert_eq!(reg.server.command, "real-command");
    assert_eq!(reg.server.args, vec!["a".to_string()]);
}

#[test]
fn an_unresolvable_key_is_an_error_not_a_panic() {
    use tauri_app_lib::mcp::discover;

    let root = tempfile::tempdir().unwrap();
    let config = root.path().join("config.json");
    std::fs::write(&config, r#"{"mcpServers":{"target":{"command":"c","args":[]}}}"#).unwrap();

    // Right file, wrong name.
    let key = format!("{}:nonexistent", config.to_string_lossy());
    assert!(discover::resolve_registration(&key).is_err());

    // No colon at all — malformed key, not a path that happens not to exist.
    assert!(discover::resolve_registration("no-colon-here").is_err());
}
