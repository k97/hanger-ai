//! Finding and running an engine's CLI: `engine_status::resolve` and
//! `engine_status::run`.
//!
//! Every program here is a `#!/bin/sh` script in a temp dir. No test runs the
//! user's real shell or a real engine CLI, and none reads the real home, so
//! `resolve::search_path` itself is not called: it would start `$SHELL` with
//! the user's rc files. Its three parts are tested instead: `login_shell`,
//! `path_from_shell` against a fake shell, and `merge_paths`.

use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use tauri_app_lib::engine_status::resolve::{login_shell, merge_paths, path_from_shell, resolve_in};
use tauri_app_lib::engine_status::run::run_capture;

/// Long enough for a script that answers at once on a busy machine, short
/// enough that a wrongly hung child fails the test instead of stalling it.
const QUICK: Duration = Duration::from_secs(5);

fn write_file(dir: &Path, name: &str, body: &str, mode: u32) -> PathBuf {
    std::fs::create_dir_all(dir).unwrap();
    let path = dir.join(name);
    std::fs::write(&path, body).unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(mode)).unwrap();
    path
}

fn script(dir: &Path, name: &str, body: &str) -> PathBuf {
    write_file(dir, name, &format!("#!/bin/sh\n{body}\n"), 0o755)
}

/// Whether a process with this pid exists, running or zombie.
fn is_alive(pid: i32) -> bool {
    // SAFETY: signal 0 sends nothing; it only asks whether the pid exists.
    unsafe { libc::kill(pid, 0) == 0 }
}

// --- resolve_in ---

#[test]
fn the_first_path_entry_wins() {
    let tmp = tempfile::tempdir().unwrap();
    let native = script(&tmp.path().join("native"), "claude", "echo native");
    script(&tmp.path().join("npm"), "claude", "echo npm");
    let path = format!(
        "{}:{}",
        tmp.path().join("native").display(),
        tmp.path().join("npm").display()
    );

    assert_eq!(resolve_in("claude", &path), Some(native));
}

#[test]
fn resolves_through_login_shell_path_when_process_path_is_minimal() {
    let tmp = tempfile::tempdir().unwrap();
    let claude = script(&tmp.path().join("a"), "claude", "echo found");
    let own_path = std::env::var("PATH").unwrap_or_default();
    assert!(
        !own_path.contains(&tmp.path().display().to_string()),
        "the test process's own PATH must not already hold the temp dir"
    );

    let path = format!("{}:/usr/bin", tmp.path().join("a").display());
    assert_eq!(resolve_in("claude", &path), Some(claude));
}

#[test]
fn a_later_entry_is_found_when_earlier_ones_lack_the_binary() {
    let tmp = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(tmp.path().join("empty")).unwrap();
    let codex = script(&tmp.path().join("b"), "codex", "echo found");
    let path = format!(
        "{}:{}",
        tmp.path().join("empty").display(),
        tmp.path().join("b").display()
    );

    assert_eq!(resolve_in("codex", &path), Some(codex));
    assert_eq!(resolve_in("gemini", &path), None);
}

#[test]
fn a_non_executable_file_is_not_a_hit() {
    let tmp = tempfile::tempdir().unwrap();
    write_file(&tmp.path().join("a"), "claude", "#!/bin/sh\necho no\n", 0o644);
    let runnable = script(&tmp.path().join("b"), "claude", "echo yes");
    let path = format!(
        "{}:{}",
        tmp.path().join("a").display(),
        tmp.path().join("b").display()
    );

    assert_eq!(resolve_in("claude", &path), Some(runnable));
    assert_eq!(resolve_in("claude", &tmp.path().join("a").display().to_string()), None);
}

#[test]
fn a_directory_named_like_the_binary_is_not_a_hit() {
    let tmp = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(tmp.path().join("a").join("claude")).unwrap();
    let runnable = script(&tmp.path().join("b"), "claude", "echo yes");
    let path = format!(
        "{}:{}",
        tmp.path().join("a").display(),
        tmp.path().join("b").display()
    );

    assert_eq!(resolve_in("claude", &path), Some(runnable));
}

#[test]
fn a_bin_with_a_slash_is_refused() {
    let tmp = tempfile::tempdir().unwrap();
    script(&tmp.path().join("a").join("sub"), "claude", "echo yes");
    script(&tmp.path().join("a"), "claude", "echo yes");
    let path = tmp.path().join("a").display().to_string();

    // Both would be executable files if the name were joined as given.
    assert_eq!(resolve_in("sub/claude", &path), None);
    assert_eq!(resolve_in("../a/claude", &path), None);
}

#[test]
fn empty_and_relative_path_entries_are_skipped() {
    let tmp = tempfile::tempdir().unwrap();
    let claude = script(&tmp.path().join("a"), "claude", "echo yes");
    // Neither the empty entries nor the relative one may end the walk early.
    // That a relative entry is never a hit itself is the next test.
    let path = format!("::src:{}:", tmp.path().join("a").display());

    assert_eq!(resolve_in("claude", &path), Some(claude));
}

#[test]
fn a_relative_entry_holding_the_binary_is_not_a_hit() {
    // `sh` exists in `/bin`, and `../../../../../../../../bin` reaches it from
    // any working directory this suite runs in, so a resolver that accepted
    // relative entries would return a hit here.
    assert!(Path::new("../../../../../../../../bin/sh").exists());
    assert_eq!(resolve_in("sh", "../../../../../../../../bin"), None);
}

#[test]
fn a_symlinked_binary_is_returned_as_the_path_entry() {
    let tmp = tempfile::tempdir().unwrap();
    let target = script(&tmp.path().join("versions"), "2.1.330", "echo real");
    let bin = tmp.path().join("bin");
    std::fs::create_dir_all(&bin).unwrap();
    std::os::unix::fs::symlink(&target, bin.join("claude")).unwrap();

    assert_eq!(
        resolve_in("claude", &bin.display().to_string()),
        Some(bin.join("claude"))
    );
}

// --- the shell's PATH ---

#[tokio::test]
async fn path_from_shell_ignores_banner_noise_before_the_markers() {
    let tmp = tempfile::tempdir().unwrap();
    // `$4` is the script `path_from_shell` passes after `-l -i -c`, so the
    // fake runs the real script with a PATH of its own.
    let shell = script(
        tmp.path(),
        "fakeshell",
        "echo 'Last login: Tue Nov 24 on ttys001'\n\
         echo '__HANGER_PATH_START__/banner/decoy'\n\
         PATH=/fake/a:/fake/b\n\
         eval \"$4\"\n\
         echo\n\
         echo 'logout hook'",
    );

    assert_eq!(
        path_from_shell(&shell, QUICK).await.as_deref(),
        Some("/fake/a:/fake/b")
    );
}

#[tokio::test]
async fn the_shell_is_asked_as_a_login_and_interactive_shell() {
    let tmp = tempfile::tempdir().unwrap();
    let seen = tmp.path().join("argv");
    let shell = script(
        tmp.path(),
        "fakeshell",
        &format!(
            "printf '%s %s %s' \"$1\" \"$2\" \"$3\" > '{}'\nPATH=/fake/a\neval \"$4\"",
            seen.display()
        ),
    );

    assert_eq!(path_from_shell(&shell, QUICK).await.as_deref(), Some("/fake/a"));
    assert_eq!(std::fs::read_to_string(&seen).unwrap(), "-l -i -c");
}

#[tokio::test]
async fn path_from_shell_is_none_for_a_shell_that_exits_non_zero() {
    let tmp = tempfile::tempdir().unwrap();
    let shell = script(tmp.path(), "fakeshell", "PATH=/fake/a\neval \"$4\"\nexit 3");

    assert_eq!(path_from_shell(&shell, QUICK).await, None);
}

#[tokio::test]
async fn path_from_shell_is_none_for_a_shell_that_prints_no_markers() {
    let tmp = tempfile::tempdir().unwrap();
    let shell = script(tmp.path(), "fakeshell", "echo /fake/a:/fake/b");

    assert_eq!(path_from_shell(&shell, QUICK).await, None);
}

#[tokio::test]
async fn path_from_shell_is_none_when_the_end_marker_is_missing() {
    let tmp = tempfile::tempdir().unwrap();
    let shell = script(tmp.path(), "fakeshell", "printf '__HANGER_PATH_START__/fake/a'");

    assert_eq!(path_from_shell(&shell, QUICK).await, None);
}

#[tokio::test]
async fn path_from_shell_is_none_for_an_empty_path() {
    let tmp = tempfile::tempdir().unwrap();
    let shell = script(tmp.path(), "fakeshell", "PATH=\neval \"$4\"");

    assert_eq!(path_from_shell(&shell, QUICK).await, None);
}

#[tokio::test]
async fn path_from_shell_is_none_for_a_shell_that_hangs() {
    let tmp = tempfile::tempdir().unwrap();
    let shell = script(tmp.path(), "fakeshell", "exec /bin/sleep 30");

    let started = Instant::now();
    let got = path_from_shell(&shell, Duration::from_secs(1)).await;

    assert_eq!(got, None);
    assert!(started.elapsed() < Duration::from_secs(10), "took {:?}", started.elapsed());
}

#[test]
fn merge_keeps_shell_entries_first_and_drops_repeats() {
    let merged = merge_paths(
        Some("/home/u/.npm-global/bin:/usr/local/bin::/usr/bin:/usr/local/bin"),
        "/home/u/.local/bin:/usr/local/bin:/usr/bin:/bin",
    );

    assert_eq!(
        merged,
        "/home/u/.npm-global/bin:/usr/local/bin:/usr/bin:/home/u/.local/bin:/bin"
    );
}

#[test]
fn merge_without_a_shell_path_is_the_widened_path_alone() {
    assert_eq!(
        merge_paths(None, "/home/u/.local/bin:/usr/bin:/bin"),
        "/home/u/.local/bin:/usr/bin:/bin"
    );
}

#[test]
fn the_shell_is_shell_env_only_when_it_is_an_absolute_existing_file() {
    let tmp = tempfile::tempdir().unwrap();
    let fish = script(tmp.path(), "fish", "exit 0");
    let fallback = PathBuf::from("/bin/zsh");

    assert_eq!(login_shell(Some(&fish.display().to_string())), fish);
    assert_eq!(login_shell(None), fallback);
    assert_eq!(login_shell(Some("")), fallback);
    // `sh` resolves through PATH for a spawn, and is still not an absolute path.
    assert_eq!(login_shell(Some("sh")), fallback);
    assert_eq!(
        login_shell(Some(&tmp.path().join("gone").display().to_string())),
        fallback
    );
    assert_eq!(login_shell(Some(&tmp.path().display().to_string())), fallback);
}

// --- run_capture ---

#[tokio::test]
async fn a_hung_command_times_out_and_reports_nothing() {
    let tmp = tempfile::tempdir().unwrap();
    let pid_file = tmp.path().join("pid");
    // `exec` keeps the sleeper on the pid the script wrote down.
    let hung = script(tmp.path(), "claude", "echo $$ > \"$1\"\nexec /bin/sleep 30");

    let started = Instant::now();
    let got = run_capture(
        &hung,
        &[pid_file.to_str().unwrap()],
        None,
        &[],
        Duration::from_millis(1500),
    )
    .await;
    let elapsed = started.elapsed();

    assert!(got.is_none(), "a timed-out command reports nothing");
    assert!(elapsed >= Duration::from_millis(1400), "returned before the timeout: {elapsed:?}");
    assert!(elapsed < Duration::from_secs(10), "took {elapsed:?}");

    let pid: i32 = std::fs::read_to_string(&pid_file).unwrap().trim().parse().unwrap();
    assert!(pid > 1);
    assert!(!is_alive(pid), "the child must be gone, and reaped, once run_capture returns");
}

#[tokio::test]
async fn stdin_reaches_the_child() {
    let tmp = tempfile::tempdir().unwrap();
    let echo = script(tmp.path(), "claude", "exec /bin/cat");

    let got = run_capture(&echo, &[], Some(b"{\"command\":\"npx\"}"), &[], QUICK)
        .await
        .expect("the script runs");

    assert!(got.ok);
    assert_eq!(got.stdout, "{\"command\":\"npx\"}");
}

#[tokio::test]
async fn stdin_larger_than_a_pipe_buffer_round_trips() {
    let tmp = tempfile::tempdir().unwrap();
    let echo = script(tmp.path(), "claude", "exec /bin/cat");
    // Past the 64 KiB a pipe holds: a writer that finishes before anything
    // reads the child's output would block forever on this.
    let big = "0123456789abcdef".repeat(64 * 1024);

    let got = run_capture(&echo, &[], Some(big.as_bytes()), &[], QUICK)
        .await
        .expect("the script runs");

    assert!(got.ok);
    assert!(got.stdout == big, "the megabyte came back changed");
}

#[tokio::test]
async fn a_child_that_ignores_stdin_still_reports() {
    let tmp = tempfile::tempdir().unwrap();
    let deaf = script(tmp.path(), "claude", "echo done");
    let big = "x".repeat(1024 * 1024);

    let got = run_capture(&deaf, &[], Some(big.as_bytes()), &[], QUICK)
        .await
        .expect("a closed input pipe is not a failure to run");

    assert!(got.ok);
    assert_eq!(got.stdout, "done\n");
}

#[tokio::test]
async fn a_non_zero_exit_is_not_ok_and_keeps_its_stdout() {
    let tmp = tempfile::tempdir().unwrap();
    let refuses = script(tmp.path(), "claude", "echo 'No MCP server found'\nexit 1");

    let got = run_capture(&refuses, &[], None, &[], QUICK)
        .await
        .expect("a command that ran and refused is still a result");

    assert!(!got.ok);
    assert_eq!(got.stdout, "No MCP server found\n");
}

#[tokio::test]
async fn a_zero_exit_is_ok() {
    let tmp = tempfile::tempdir().unwrap();
    let fine = script(tmp.path(), "claude", "echo 2.1.330");

    let got = run_capture(&fine, &[], None, &[], QUICK).await.expect("the script runs");

    assert!(got.ok);
    assert_eq!(got.stdout, "2.1.330\n");
}

#[tokio::test]
async fn stderr_never_appears_in_stdout() {
    let tmp = tempfile::tempdir().unwrap();
    let noisy = script(
        tmp.path(),
        "claude",
        "echo on-stdout\necho 'signed in as someone@example.invalid' >&2",
    );

    let got = run_capture(&noisy, &[], None, &[], QUICK).await.expect("the script runs");

    assert_eq!(got.stdout, "on-stdout\n");
    assert!(!got.stdout.contains("example.invalid"));
}

#[tokio::test]
async fn args_reach_the_child_as_given_with_no_shell_in_between() {
    let tmp = tempfile::tempdir().unwrap();
    let marker = tmp.path().join("made-by-a-shell");
    let argv = script(tmp.path(), "claude", "for a in \"$@\"; do printf '[%s]' \"$a\"; done");
    let hostile = format!("x; touch '{}'", marker.display());

    let got = run_capture(&argv, &["mcp", "remove", &hostile, "$HOME"], None, &[], QUICK)
        .await
        .expect("the script runs");

    assert_eq!(got.stdout, format!("[mcp][remove][{hostile}][$HOME]"));
    assert!(!marker.exists(), "an argument was interpreted by a shell");
}

#[tokio::test]
async fn a_relative_program_is_not_run() {
    // `sh` is on every PATH this suite runs with, so a spawn that accepted a
    // bare name would run it and print.
    let got = run_capture(Path::new("sh"), &["-c", "echo ran"], None, &[], QUICK).await;

    assert!(got.is_none());
}

#[tokio::test]
async fn a_missing_program_is_none() {
    let tmp = tempfile::tempdir().unwrap();

    let got = run_capture(&tmp.path().join("claude"), &["--version"], None, &[], QUICK).await;

    assert!(got.is_none());
}

#[tokio::test]
async fn envs_are_added_to_the_inherited_environment() {
    let tmp = tempfile::tempdir().unwrap();
    // The inherited half needs a variable no shell invents for itself:
    // `/bin/sh` gives a child a default PATH even from an empty environment.
    // Cargo sets this one for every test process.
    let inherited = std::env::var("CARGO_PKG_NAME").expect("cargo sets CARGO_PKG_NAME for a test run");
    assert!(!inherited.is_empty());
    let prints = script(
        tmp.path(),
        "claude",
        "printf '%s|%s|%s' \"$CLAUDE_CONFIG_DIR\" \"$HANGER_FAKE_SECOND\" \"$CARGO_PKG_NAME\"",
    );

    let got = run_capture(
        &prints,
        &[],
        None,
        &[("CLAUDE_CONFIG_DIR", "/tmp/fake-config"), ("HANGER_FAKE_SECOND", "two")],
        QUICK,
    )
    .await
    .expect("the script runs");

    assert_eq!(got.stdout, format!("/tmp/fake-config|two|{inherited}"));
}

#[tokio::test]
async fn stdout_that_is_not_utf8_is_converted_not_dropped() {
    let tmp = tempfile::tempdir().unwrap();
    let binary = script(tmp.path(), "claude", "printf 'a\\377b'");

    let got = run_capture(&binary, &[], None, &[], QUICK).await.expect("the script runs");

    assert_eq!(got.stdout, "a\u{fffd}b");
}
