//! Which file the user's terminal would run for an engine's command name.
//!
//! An app opened from Finder inherits `/usr/bin:/bin:/usr/sbin:/sbin`. An
//! engine's CLI is rarely there: `claude` sits in `~/.local/bin`, `codex`
//! under whatever prefix npm was given. So the search path comes from the
//! user's own shell, started the way a terminal starts it.

use std::collections::HashSet;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::time::Duration;

use tokio::sync::OnceCell;

use super::run::run_capture;

/// How long `search_path` waits for the shell before it falls back.
const SHELL_TIMEOUT: Duration = Duration::from_secs(5);

/// The shell used when `$SHELL` is unset or unusable. macOS's default.
const FALLBACK_SHELL: &str = "/bin/zsh";

const PATH_START: &str = "__HANGER_PATH_START__";
const PATH_END: &str = "__HANGER_PATH_END__";

/// What the shell is asked to run. The markers fence the value off from
/// whatever the shell's startup files print around it.
const PATH_SCRIPT: &str = r#"printf '__HANGER_PATH_START__%s__HANGER_PATH_END__' "$PATH""#;

/// The login shell's own PATH, once it has given one.
static SHELL_PATH: OnceCell<String> = OnceCell::const_new();

/// The PATH a terminal would give the user, then Hanger's own widened
/// fallback (`mcp::probe::widened_path`).
///
/// The shell is `login_shell` of `$SHELL`, asked through `cached_shell_path`
/// with a 5 s timeout. Its answer is cached for the process. If it gives no
/// answer, this call gets the widened fallback alone and nothing is cached:
/// a shell that was slow during a busy boot is asked again on the next call,
/// so a CLI it puts on PATH is not hidden until Hanger restarts.
///
/// `async` because the shell is a child process on the tokio runtime. The
/// caller that first gets an answer pays for the shell; callers that arrive
/// meanwhile wait for it.
pub async fn search_path() -> String {
    let shell = login_shell(std::env::var("SHELL").ok().as_deref());
    let from_shell = cached_shell_path(&SHELL_PATH, &shell, SHELL_TIMEOUT).await;
    merge_paths(from_shell.as_deref(), &crate::mcp::probe::widened_path())
}

/// `shell`'s PATH through `path_from_shell`, kept in `cache` once it answers.
/// Testable: the cache and the shell are parameters.
///
/// Only an answer is kept. A shell that fails or times out leaves `cache`
/// empty, so the next call asks it again. A caller that arrives while the
/// shell is being asked waits for that run; if the run fails, the waiter asks
/// next, so concurrent callers of a failing shell are served one after
/// another, each bounded by `timeout`.
pub async fn cached_shell_path(
    cache: &OnceCell<String>,
    shell: &Path,
    timeout: Duration,
) -> Option<String> {
    cache
        .get_or_try_init(|| async { path_from_shell(shell, timeout).await.ok_or(()) })
        .await
        .ok()
        .cloned()
}

/// The shell to ask: `shell_env` (the value of `$SHELL`) when it is an
/// absolute path to an existing file, otherwise `/bin/zsh`.
pub fn login_shell(shell_env: Option<&str>) -> PathBuf {
    match shell_env.map(Path::new) {
        Some(shell) if shell.is_absolute() && shell.is_file() => shell.to_path_buf(),
        _ => PathBuf::from(FALLBACK_SHELL),
    }
}

/// Ask one shell for its PATH. Testable: the shell is a parameter.
///
/// Runs `<shell> -l -i -c <script>` through `run::run_capture`, so stdin is
/// `/dev/null` and stderr is discarded. Login **and** interactive: on macOS a
/// PATH entry is commonly added in `.zshrc`, which a login shell that is not
/// interactive never reads.
///
/// Startup files may print a banner before the script runs and a logout hook
/// may print after it, so the value is whatever lies between the last start
/// marker and the end marker that follows it.
///
/// `None` when the shell does not finish within `timeout`, exits non-zero,
/// prints no pair of markers, or reports an empty PATH.
pub async fn path_from_shell(shell: &Path, timeout: Duration) -> Option<String> {
    let captured = run_capture(shell, &["-l", "-i", "-c", PATH_SCRIPT], None, &[], timeout).await?;
    if !captured.ok {
        return None;
    }
    let after_start = captured.stdout.rfind(PATH_START)? + PATH_START.len();
    let rest = &captured.stdout[after_start..];
    let value = &rest[..rest.find(PATH_END)?];
    (!value.is_empty()).then(|| value.to_string())
}

/// The shell's PATH entries, then the widened fallback's, each entry once at
/// its first position. Empty entries are dropped. With no shell PATH the
/// result is the fallback's entries alone.
pub fn merge_paths(shell: Option<&str>, widened: &str) -> String {
    let mut seen = HashSet::new();
    shell
        .unwrap_or_default()
        .split(':')
        .chain(widened.split(':'))
        .filter(|entry| !entry.is_empty() && seen.insert(*entry))
        .collect::<Vec<_>>()
        .join(":")
}

/// First executable hit for `bin` in a colon-separated `path`.
///
/// Returns the PATH entry joined with `bin`, not a symlink's target: the
/// caller runs the same file the user's terminal would name.
///
/// An entry is skipped when it is empty or relative, and a candidate is
/// skipped when it is a directory or carries no execute bit for anyone. A
/// `bin` containing `/` is refused: it is a path, not a command name.
pub fn resolve_in(bin: &str, path: &str) -> Option<PathBuf> {
    if bin.contains('/') {
        return None;
    }
    path.split(':')
        .filter(|entry| Path::new(entry).is_absolute())
        .map(|entry| Path::new(entry).join(bin))
        .find(|candidate| {
            std::fs::metadata(candidate)
                .map(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
                .unwrap_or(false)
        })
}
