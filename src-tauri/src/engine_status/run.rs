//! Run one program, once, and keep what it printed.
//!
//! Nothing is logged from this module, on any path: a CLI's output can carry
//! account details and its arguments can carry names.

use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;

/// What a program that ran to completion printed.
///
/// There is no stderr field: stderr is discarded at spawn, and is never
/// returned or logged.
pub struct Captured {
    /// Whether the program exited with status 0. `false` means it ran and
    /// refused, which a caller must be able to tell from "did not run".
    pub ok: bool,
    /// Everything written to stdout, with invalid UTF-8 replaced.
    pub stdout: String,
}

/// Run `program` with `args` and wait for it, for at most `timeout`.
///
/// `None` means the program produced no result: `program` is not an absolute
/// path, it could not be started, or it was still running at `timeout`. A
/// program that exits non-zero is `Some` with `ok: false`.
///
/// - No shell is involved. `args` reach the program as written, one argv
///   entry each.
/// - `envs` are added to the environment this process has. A CLI that is a
///   `#!/usr/bin/env node` script finds `node` only through a `PATH` entry
///   here; `resolve::search_path` is the value to pass.
/// - `stdin` bytes are written in full and the pipe is then closed, so the
///   program sees end of input. Without `stdin` the program reads
///   `/dev/null`. A value that must not appear in a process listing goes
///   here, never in `args`.
/// - On timeout the program is killed and reaped before this returns. Only
///   that one process: anything it started itself is not signalled.
///
/// The spawn carries `kill_on_drop(true)`, so dropping this future also kills
/// the program.
pub async fn run_capture(
    program: &Path,
    args: &[&str],
    stdin: Option<&[u8]>,
    envs: &[(&str, &str)],
    timeout: Duration,
) -> Option<Captured> {
    if !program.is_absolute() {
        return None;
    }

    let mut child = Command::new(program)
        .args(args)
        .envs(envs.iter().copied())
        .stdin(if stdin.is_some() { Stdio::piped() } else { Stdio::null() })
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .ok()?;

    let input = child.stdin.take();
    let output = child.stdout.take();

    // The child is owned outside the timed future, as in `mcp::probe::probe`:
    // a timeout drops that future without running any more of it, so the kill
    // has to happen out here.
    let exchange = async {
        let mut output = output?;
        let mut printed = Vec::new();
        // Written and read at once. A program that prints more than a pipe
        // holds before it has read its input would otherwise block both sides.
        let feed = async {
            if let (Some(mut pipe), Some(bytes)) = (input, stdin) {
                // A program may exit without reading its input; that is its
                // answer, reported through its exit status, not a failure here.
                let _ = pipe.write_all(bytes).await;
                let _ = pipe.shutdown().await;
            }
        };
        let (_, read) = tokio::join!(feed, output.read_to_end(&mut printed));
        read.ok()?;
        Some(printed)
    };

    let finished = tokio::time::timeout(timeout, async {
        let printed = exchange.await?;
        let status = child.wait().await.ok()?;
        Some(Captured {
            ok: status.success(),
            stdout: String::from_utf8_lossy(&printed).into_owned(),
        })
    })
    .await;

    match finished {
        Ok(result) => result,
        Err(_) => {
            let _ = child.kill().await;
            None
        }
    }
}
