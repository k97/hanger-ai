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
