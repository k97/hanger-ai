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

/// MCP's Shutdown/stdio steps are: close stdin, wait, THEN escalate to
/// SIGTERM, wait again, THEN SIGKILL. `Child::kill()` alone sends only
/// SIGKILL. A script that traps SIGTERM and writes a marker before exiting
/// proves the escalation happened — under a SIGKILL-only shutdown the trap
/// never runs and the marker never appears. The script ignores stdin EOF (it
/// loops on `sleep` after the read loop ends) so the marker can only be
/// evidence of SIGTERM, not of step 1 alone.
///
/// The trap kills `$SLEEP_PID` before it exits. Without that, the backgrounded
/// `sleep 3600` outlives the shell that started it — a parent exiting (by
/// `exit 0` here, or by the eventual SIGKILL in the sibling fixture below)
/// does not take its background jobs down with it; they get reparented to
/// pid 1 and keep running for the full duration. Found on this machine as
/// 107 orphaned `sleep 3600` processes, 1-2 accumulating per suite run,
/// invisible to `pgrep -f <script path>` because the orphan's own argv is
/// just `sleep 3600`, carrying none of the script's path.
#[cfg(unix)]
#[tokio::test]
async fn shutdown_escalates_to_sigterm_before_sigkill() {
    let dir = tempfile::tempdir().unwrap();
    let marker = dir.path().join("sigterm-received");
    let body = r#"#!/bin/sh
MARKER="$1"
trap 'kill "$SLEEP_PID" 2>/dev/null; touch "$MARKER"; exit 0' TERM
while IFS= read -r line; do
  case "$line" in
    *'"initialize"'*)
      printf '%s\n' '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{}},"serverInfo":{"name":"fake","version":"9.9.9"}}}' ;;
    *'"tools/list"'*)
      printf '%s\n' '{"jsonrpc":"2.0","id":2,"result":{"tools":[]}}' ;;
  esac
done
# stdin closed (EOF): the read loop above ends, but stay alive so the only
# way out is a signal — proving escalation, not merely stdin closing.
# `sleep N & wait` rather than a `sleep 1` poll loop: this macOS /bin/sh is
# bash 3.2, whose trap dispatch inside a `sleep`-poll loop is only checked
# once the running `sleep` returns, adding up to ~1s of pure shell artifact
# to the marker's arrival with no bearing on real signal latency. Blocking
# in `wait` instead measured at ~30ms trap-to-marker latency across 13 runs
# on this machine — that is what SHUTDOWN_TERM_WAIT is sized against.
sleep 3600 &
SLEEP_PID=$!
wait
"#;
    let s = write_script(dir.path(), "sigterm_trap.sh", body);

    let r = probe::probe(
        &s,
        &[marker.to_string_lossy().to_string()],
        Duration::from_secs(10),
    )
    .await;

    assert_eq!(r.error, None, "probe errored: {:?}", r.error);
    assert!(
        marker.exists(),
        "server never received SIGTERM — shutdown went straight to SIGKILL"
    );
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

/// `probe()`'s own `tokio::time::timeout` unwinds through cancellation, not
/// through `exchange`'s own `return`s — the one exit path that cannot run
/// cleanup code placed inside the cancelled future. A server that never
/// answers the handshake exercises exactly that unwind.
///
/// This deliberately does not *prove escalation* via a SIGTERM trap the way
/// `shutdown_escalates_to_sigterm_before_sigkill` does (the script below
/// does carry a trap, but only for its own process cleanup — see the note
/// below the elapsed-time bullet). A trap-as-proof (or a script
/// self-reporting its own pid) requires the shell to have been *scheduled*
/// long enough to run that line before the signal arrives, and under this
/// suite's own parallelism — several tests spawning real child processes at
/// once — that scheduling measurably lags: a marker placed on the very first
/// line of a script sometimes did not appear within seconds under load, even
/// though `probe()` itself always returned on schedule (confirmed by
/// spawning 15 concurrent probes against a pid-self-reporting script: `elapsed`
/// clustered tightly around 700ms in every run, but the pid file was often
/// never written at all). `shutdown`'s own waits run as timers in *this*
/// process, unaffected by the child's scheduling; only the child's ability to
/// run its own code is affected. So this test proves the same thing two ways
/// that do not depend on the child ever being scheduled to run anything:
///
/// - **Elapsed time.** `shutdown` deliberately waits ~500ms for the server to
///   exit before escalating to `SIGTERM`. The bare `child.kill()` this task
///   replaces returns near-instantly once the exchange's own 200ms timeout
///   fires, with no such wait coded. A silent server that never exits on its
///   own must therefore make `probe()` take meaningfully longer than 200ms —
///   proving the wait ran, not just that *some* kill eventually happened.
/// - **No leak.** `pgrep -f` against the script's own (uniquely
///   `tempfile`-generated) path queries the kernel's process table directly,
///   which records a still-running process regardless of whether that
///   process ever got scheduled to execute a single one of its own
///   instructions — unlike a marker file, which needs exactly that.
///
/// The script *does* still carry a `TERM` trap, but only to kill its own
/// backgrounded `sleep 3600` before exiting — a bare `sleep 3600 &` outlives
/// the shell that started it (reparented to pid 1, running for the full
/// hour) unless something explicitly kills it first, and `pgrep -f` above
/// cannot see that orphan: its argv is just `sleep 3600`, none of the
/// script's path. This trap's *reliability* is not load-bearing for either
/// assertion above the way the marker fixture's trap is for its own
/// assertion — if scheduling lag (see the doc comment above) ever keeps this
/// trap from running before a stray SIGKILL, the orphan risk is only ever a
/// possibility, never something this test's pass/fail depends on either way.
#[cfg(unix)]
#[tokio::test]
async fn probe_that_times_out_still_stops_the_child_via_shutdown() {
    let dir = tempfile::tempdir().unwrap();
    // Never answers initialize or tools/list, and never exits on stdin EOF —
    // probe()'s own timeout must fire, then shutdown must wait, then escalate.
    let s = write_script(
        dir.path(),
        "silent_forever.sh",
        "#!/bin/sh\ntrap 'kill \"$SLEEP_PID\" 2>/dev/null' TERM\nwhile IFS= read -r line; do :; done\nsleep 3600 &\nSLEEP_PID=$!\nwait\n",
    );

    let started = std::time::Instant::now();
    let r = probe::probe(&s, &[], Duration::from_millis(200)).await;
    let elapsed = started.elapsed();

    assert!(r.error.is_some(), "a silent server must time out with an error");
    assert!(
        elapsed >= Duration::from_millis(400),
        "shutdown returned in {:?} — too fast to have waited for the server \
         to exit before escalating; looks like a bare kill() again",
        elapsed
    );
    assert!(
        // Generous on purpose: this is a hang guard, not a timing assertion.
        // The nominal budget here is ~1.2s (200ms exchange timeout + up to
        // 500ms SHUTDOWN_WAIT + up to 500ms SHUTDOWN_TERM_WAIT), but a
        // saturated machine delays more than the child's own scheduling —
        // this process's own async task can go unscheduled too. A tighter
        // bound flakes under exactly the load this suite itself produces;
        // this only needs to catch a genuine hang.
        elapsed < Duration::from_secs(10),
        "shutdown after timeout must still be bounded: took {:?}",
        elapsed
    );

    // A failed `pgrep` invocation must fail this test, not silently pass it
    // — `.unwrap_or(false)` here would assert "no leak" on a missing or
    // erroring pgrep exactly as readily as on a genuinely clean process
    // table, which is the vacuous-control failure mode: a check that cannot
    // tell "verified absent" from "never actually checked".
    let output = std::process::Command::new("pgrep")
        .args(["-f", &s])
        .output()
        .expect("pgrep must be invocable to check for a leaked process");
    let leaked = !output.stdout.is_empty();
    assert!(!leaked, "a process matching `{}` is still running after probe() returned — leaked", s);
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

// ─── Dialect fidelity for registry-declared registrations ──────────────────
//
// A path that matches a SOURCES row (registry.rs) carries its true dialect on
// McpSource.dialect — the same one `read_source`/`discover_machine` use. A
// registration resolved *from the registry* must be read with that declared
// dialect, not guessed from the file extension the way `dialect_for_swept`
// guesses for genuinely ad-hoc, undeclared sweep files. Guessing here is how
// VS Code, Zed, OpenCode, Amp, Kilocode, claude-code's Local tier, and
// claude-ai connectors all silently stopped resolving.

static HOME_ENV_MUTEX: std::sync::OnceLock<std::sync::Mutex<()>> = std::sync::OnceLock::new();

/// Restores HANGER_TEST_HOME to whatever it was (usually unset) on drop, so a
/// test later in this file that never touches it gets the real $HOME back
/// rather than a stale tempdir from here. Process-global env var, guarded by
/// HOME_ENV_MUTEX against the parallel test threads cargo runs within one
/// binary — same hazard `mcp_scanner_tests.rs` documents for its own guard.
struct TestHome(Option<String>);
impl TestHome {
    fn set(path: &std::path::Path) -> Self {
        let prev = std::env::var("HANGER_TEST_HOME").ok();
        std::env::set_var("HANGER_TEST_HOME", path);
        TestHome(prev)
    }
}
impl Drop for TestHome {
    fn drop(&mut self) {
        match &self.0 {
            Some(v) => std::env::set_var("HANGER_TEST_HOME", v),
            None => std::env::remove_var("HANGER_TEST_HOME"),
        }
    }
}

#[test]
fn a_vscode_registration_is_read_with_its_declared_dialect_not_guessed() {
    let _guard = HOME_ENV_MUTEX.get_or_init(|| std::sync::Mutex::new(())).lock().unwrap_or_else(|e| e.into_inner());
    let home = tempfile::tempdir().unwrap();
    let _home_guard = TestHome::set(home.path());

    // The exact HomeRelative path SOURCES declares for vscode.
    let config = home.path().join("Library/Application Support/Code/User/mcp.json");
    std::fs::create_dir_all(config.parent().unwrap()).unwrap();
    // VS Code's own key is "servers", not "mcpServers". A dialect guessed
    // from the ".json" extension (dialect_for_swept's default, McpServers)
    // looks at the wrong key and finds nothing here.
    std::fs::write(
        &config,
        r#"{"servers":{"target":{"command":"code-command","args":["x"]}}}"#,
    )
    .unwrap();

    let key = format!("{}:target", config.to_string_lossy());
    let reg = tauri_app_lib::mcp::discover::resolve_registration(&key)
        .expect("must resolve a VS Code registration via its declared VsCodeServers dialect");
    assert_eq!(reg.server.command, "code-command");
    assert_eq!(reg.server.args, vec!["x".to_string()]);
}

#[test]
fn a_zed_registration_is_read_with_its_declared_dialect_not_guessed() {
    let _guard = HOME_ENV_MUTEX.get_or_init(|| std::sync::Mutex::new(())).lock().unwrap_or_else(|e| e.into_inner());
    let home = tempfile::tempdir().unwrap();
    let _home_guard = TestHome::set(home.path());

    // The exact HomeRelative path SOURCES declares for zed.
    let config = home.path().join(".config/zed/settings.json");
    std::fs::create_dir_all(config.parent().unwrap()).unwrap();
    // Zed nests under "context_servers" with a {command:{path,args}} shape —
    // unrelated to the top-level "mcpServers" a guessed McpServers dialect
    // would look for.
    std::fs::write(
        &config,
        r#"{"context_servers":{"target":{"command":{"path":"zed-command","args":["y"]}}}}"#,
    )
    .unwrap();

    let key = format!("{}:target", config.to_string_lossy());
    let reg = tauri_app_lib::mcp::discover::resolve_registration(&key)
        .expect("must resolve a Zed registration via its declared ZedContextServers dialect");
    assert_eq!(reg.server.command, "zed-command");
    assert_eq!(reg.server.args, vec!["y".to_string()]);
}

// ─── Glob sources must resolve too, not just literal ones ──────────────────
//
// `matching_sources` filtered out every glob row with `!s.path.contains('*')`
// at three call sites. The pre-existing glob
// (`.claude/plugins/marketplaces/*/.mcp.json`) was accidentally safe because
// its dialect (McpServers) is also `dialect_for_swept`'s fallback guess for a
// plain `.json` file, so the wrong-path fell through to `read_swept` and
// still happened to look under the right key. The per-profile VS Code row
// (`Code/User/profiles/*/mcp.json`) declares `VsCodeServers`, which reads
// `servers` — a key the McpServers fallback guess never looks under — so the
// same fallthrough here finds nothing and returns `Err`.

#[test]
fn a_vscode_default_profile_registration_resolves_as_a_non_glob_control() {
    // Control for `a_vscode_profile_registration_resolves_through_its_glob_source`
    // below: the existing, non-glob `Code/User/mcp.json` row must keep
    // resolving. A green on the glob test alone would not distinguish "glob
    // resolution works" from "VsCodeServers resolution works in general";
    // this one isolates the non-glob half of that claim.
    let _guard = HOME_ENV_MUTEX.get_or_init(|| std::sync::Mutex::new(())).lock().unwrap_or_else(|e| e.into_inner());
    let home = tempfile::tempdir().unwrap();
    let _home_guard = TestHome::set(home.path());

    let config = home.path().join("Library/Application Support/Code/User/mcp.json");
    std::fs::create_dir_all(config.parent().unwrap()).unwrap();
    std::fs::write(
        &config,
        r#"{"servers":{"target":{"command":"default-profile-command","args":["a"]}}}"#,
    )
    .unwrap();

    let key = format!("{}:target", config.to_string_lossy());
    let reg = tauri_app_lib::mcp::discover::resolve_registration(&key)
        .expect("must resolve the default-profile VS Code registration");
    assert_eq!(reg.server.command, "default-profile-command");
    assert_eq!(reg.host_id, "vscode");
}

#[test]
fn a_vscode_profile_registration_resolves_through_its_glob_source() {
    let _guard = HOME_ENV_MUTEX.get_or_init(|| std::sync::Mutex::new(())).lock().unwrap_or_else(|e| e.into_inner());
    let home = tempfile::tempdir().unwrap();
    let _home_guard = TestHome::set(home.path());

    let profile_dir = home
        .path()
        .join("Library/Application Support/Code/User/profiles/-1abc2def");
    std::fs::create_dir_all(&profile_dir).unwrap();
    let config = profile_dir.join("mcp.json");
    std::fs::write(
        &config,
        r#"{"servers":{"target":{"command":"profile-command","args":["z"]}}}"#,
    )
    .unwrap();

    let key = format!("{}:target", config.to_string_lossy());
    let reg = tauri_app_lib::mcp::discover::resolve_registration(&key).expect(
        "must resolve a per-profile VS Code registration through the glob VsCodeServers source, \
         not fall through to read_swept's guessed McpServers dialect",
    );
    assert_eq!(reg.server.command, "profile-command");
    assert_eq!(reg.server.args, vec!["z".to_string()]);
    assert_eq!(reg.host_id, "vscode");
}
