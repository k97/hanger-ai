// Assembles a plain-text diagnostics report — build info, engine detection,
// store counts, consents, and the current app log — and puts it on the
// clipboard. Silent by design: no confirmation dialog, the clipboard IS the
// output. Full paths are included deliberately; they carry product signal
// (Karthik-ruled 2026-08-12: no hashing/redaction).
//
// Every section degrades to an "unavailable: …" line rather than failing the
// whole report — a diagnostics feature that errors out is useless exactly
// when it is needed.

use std::fmt::Write as _;
use std::sync::atomic::Ordering;

use tauri::{AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;

pub const MENU_ID: &str = "hanger-copy-diagnostics";

/// Cap the embedded log so the report stays paste-able; the on-disk location
/// is named in the report for anything older or rotated away.
const MAX_LOG_BYTES: usize = 512 * 1024;

pub fn copy_to_clipboard(app: &AppHandle) {
    let report = build_report(app);
    match app.clipboard().write_text(report) {
        Ok(()) => log::info!("diagnostics report copied to clipboard"),
        Err(e) => log::error!("diagnostics copy failed: {e}"),
    }
}

fn build_report(app: &AppHandle) -> String {
    let mut r = String::new();
    let info = app.package_info();

    let _ = writeln!(r, "=== {} Diagnostics ===", info.name);
    let _ = writeln!(r, "app version: {}", info.version);
    let _ = writeln!(r, "tauri: {}", tauri::VERSION);
    let _ = writeln!(
        r,
        "build: {}",
        if cfg!(debug_assertions) { "debug" } else { "release" }
    );
    let _ = writeln!(r, "arch: {}", std::env::consts::ARCH);
    let _ = writeln!(r, "macos: {}", command_line("sw_vers", &["-productVersion"]));
    let _ = writeln!(r, "generated: {}", command_line("date", &[]));

    let _ = writeln!(r, "\n--- Detected engines ---");
    for agent in crate::scanner::get_global_agents() {
        let _ = writeln!(
            r,
            "{} ({}): {}",
            agent.name,
            agent.id,
            agent.global_config_path.as_deref().unwrap_or("no global config")
        );
    }

    let _ = writeln!(r, "\n--- Store ---");
    write_store_section(app, &mut r);

    let _ = writeln!(r, "\n--- Consents ---");
    let _ = writeln!(
        r,
        "crash: {}, usage: {}",
        crate::CRASH_CONSENT_ENABLED.load(Ordering::SeqCst),
        crate::USAGE_CONSENT_ENABLED.load(Ordering::SeqCst)
    );

    let _ = writeln!(r, "\n--- App log ---");
    write_log_section(app, &mut r);

    r
}

fn write_store_section(app: &AppHandle, r: &mut String) {
    let db_path = crate::get_db_path(app);
    let _ = writeln!(r, "db: {}", db_path.display());
    if let Ok(meta) = std::fs::metadata(&db_path) {
        let _ = writeln!(r, "db size: {} bytes", meta.len());
    }

    let store = match crate::get_store(app) {
        Ok(s) => s,
        Err(e) => {
            let _ = writeln!(r, "store unavailable: {e}");
            return;
        }
    };
    let conn = match store.connect() {
        Ok(c) => c,
        Err(e) => {
            let _ = writeln!(r, "store connection unavailable: {e}");
            return;
        }
    };

    let count = |sql: &str| -> String {
        conn.query_row(sql, [], |row| row.get::<_, i64>(0))
            .map(|n| n.to_string())
            .unwrap_or_else(|e| format!("unavailable: {e}"))
    };

    let _ = writeln!(r, "schema version: {}", count("PRAGMA user_version"));
    let _ = writeln!(r, "linked directories: {}", count("SELECT COUNT(*) FROM linked_directories"));
    let _ = writeln!(r, "engines: {}", count("SELECT COUNT(*) FROM engines"));
    let _ = writeln!(r, "roots: {}", count("SELECT COUNT(*) FROM roots"));
    let _ = writeln!(r, "assets: {}", count("SELECT COUNT(*) FROM assets"));
    for scope in ["global", "project"] {
        let _ = writeln!(
            r,
            "assets ({scope}): {}",
            conn.query_row(
                "SELECT COUNT(*) FROM assets WHERE scope = ?1",
                [scope],
                |row| row.get::<_, i64>(0),
            )
            .map(|n| n.to_string())
            .unwrap_or_else(|e| format!("unavailable: {e}"))
        );
    }
    let _ = writeln!(r, "links: {}", count("SELECT COUNT(*) FROM links"));
}

fn write_log_section(app: &AppHandle, r: &mut String) {
    let log_dir = match app.path().app_log_dir() {
        Ok(d) => d,
        Err(e) => {
            let _ = writeln!(r, "log dir unavailable: {e}");
            return;
        }
    };
    let _ = writeln!(r, "log dir: {}", log_dir.display());

    // Newest .log file is the active one; rotated siblings stay on disk.
    let mut logs: Vec<_> = std::fs::read_dir(&log_dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "log"))
        .collect();
    logs.sort_by_key(|e| e.metadata().and_then(|m| m.modified()).ok());

    let Some(newest) = logs.last() else {
        let _ = writeln!(r, "no log files found");
        return;
    };
    match std::fs::read_to_string(newest.path()) {
        Ok(content) => {
            let _ = writeln!(r, "{}", render_log_tail(&content, MAX_LOG_BYTES));
        }
        Err(e) => {
            let _ = writeln!(r, "log read failed ({}): {e}", newest.path().display());
        }
    }
}

/// The log section's body: repeats collapsed, then clamped to `max` bytes.
///
/// The order is the point. Clamping the raw file first spends the window on
/// whatever repeated most recently; collapsing first means the same window
/// holds distinct events. On 2026-08-27 a 4.0 MB log collapsed to 534 KB,
/// turning a tail of ~2,600 lines that were 81% one warning into ~3,500
/// lines of history.
fn render_log_tail(content: &str, max: usize) -> String {
    let (collapsed, folded) = collapse_repeats(content);
    let tail = clamp_tail(&collapsed, max);

    let mut out = String::with_capacity(tail.len() + 128);
    if folded > 0 {
        let _ = writeln!(
            out,
            "[{folded} repeated lines collapsed; {} bytes of log became {}]",
            content.len(),
            collapsed.len()
        );
    }
    if tail.len() < collapsed.len() {
        let _ = writeln!(
            out,
            "[log truncated to last {} bytes of {}; full history in the log dir]",
            tail.len(),
            collapsed.len()
        );
    }
    out.push_str(tail);
    out
}

/// Fold each run of consecutive lines that say the same thing into the first
/// of them plus a count. Returns the rendered text and how many lines went.
///
/// "The same thing" ignores the timestamp and every number the line carries,
/// because a log that repeats does not repeat verbatim: the flood this was
/// written for alternated between two callback ids across changing seconds,
/// so matching whole lines folded 15% of it and matching this key folded 84%.
fn collapse_repeats(s: &str) -> (String, usize) {
    let mut out = String::with_capacity(s.len());
    let mut folded = 0usize;
    let mut lines = s.lines().peekable();

    while let Some(line) = lines.next() {
        out.push_str(line);
        out.push('\n');

        let key = collapse_key(line);
        let mut run = 0usize;
        while lines.peek().is_some_and(|next| collapse_key(next) == key) {
            lines.next();
            run += 1;
        }
        if run > 0 {
            folded += run;
            let _ = writeln!(out, "[... {run} more lines like this one]");
        }
    }

    (out, folded)
}

/// What two lines have to share to count as repeats: everything except the
/// leading `[date][time]` stamp and the digits, each run of which flattens to
/// a single marker so ids, counts and numbered paths stop separating them.
fn collapse_key(line: &str) -> String {
    let body = strip_stamp(line);
    let mut key = String::with_capacity(body.len());
    let mut in_digits = false;
    for c in body.chars() {
        if c.is_ascii_digit() {
            if !in_digits {
                key.push('#');
                in_digits = true;
            }
        } else {
            in_digits = false;
            key.push(c);
        }
    }
    key
}

/// Drop exactly the two leading bracket groups a log line opens with. Any
/// line not shaped that way is returned whole.
fn strip_stamp(line: &str) -> &str {
    fn inner(line: &str) -> Option<&str> {
        let (_, rest) = line.strip_prefix('[')?.split_once(']')?;
        let (_, rest) = rest.strip_prefix('[')?.split_once(']')?;
        Some(rest)
    }
    inner(line).unwrap_or(line)
}

/// Last `max` bytes of `s`, advanced to the next line boundary so the tail
/// never starts mid-line.
fn clamp_tail(s: &str, max: usize) -> &str {
    if s.len() <= max {
        return s;
    }
    let mut start = s.len() - max;
    while !s.is_char_boundary(start) {
        start += 1;
    }
    let cut = &s[start..];
    match cut.find('\n') {
        Some(i) => &cut[i + 1..],
        None => cut,
    }
}

fn command_line(cmd: &str, args: &[&str]) -> String {
    std::process::Command::new(cmd)
        .args(args)
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

#[cfg(test)]
mod tests {
    use super::{clamp_tail, collapse_repeats, render_log_tail};

    #[test]
    fn clamp_tail_returns_short_input_unchanged() {
        assert_eq!(clamp_tail("a\nb\nc", 100), "a\nb\nc");
    }

    #[test]
    fn clamp_tail_cuts_on_line_boundary() {
        let s = "first line\nsecond line\nthird line\n";
        let tail = clamp_tail(s, 15);
        assert_eq!(tail, "third line\n");
        assert!(tail.len() <= 15);
    }

    #[test]
    fn clamp_tail_without_newline_in_window_returns_window() {
        let s = "x".repeat(100);
        assert_eq!(clamp_tail(&s, 10).len(), 10);
    }

    #[test]
    fn collapse_repeats_folds_lines_that_differ_only_in_their_numbers() {
        // The shape this exists for: one warning alternating between two
        // callback ids, each line stamped a different second. Byte-identical
        // matching folds none of it — measured 2026-08-27 against a 4.0 MB
        // log where collapsing identical lines cut 20,397 lines to 17,323
        // and left the clamped tail just as drowned.
        let log = "\
[2026-08-26][18:34:47][WARN][webview] Couldn't find callback id 599757555.
[2026-08-26][18:34:47][WARN][webview] Couldn't find callback id 1455880137.
[2026-08-26][18:34:48][WARN][webview] Couldn't find callback id 599757555.
[2026-08-26][18:34:49][WARN][webview] Couldn't find callback id 1455880137.
";
        let (out, folded) = collapse_repeats(log);

        assert_eq!(folded, 3);
        assert_eq!(out.lines().count(), 2);
        assert!(out.starts_with(
            "[2026-08-26][18:34:47][WARN][webview] Couldn't find callback id 599757555.\n"
        ));
        assert!(out.contains("[... 3 more lines like this one]"));
    }

    #[test]
    fn collapse_repeats_keeps_neighbours_that_differ_in_words() {
        // Two paths are two findings. Only the timestamp and the numbers are
        // treated as noise; anything else keeps the lines apart.
        let log = "\
[2026-08-26][18:34:47][WARN][scan] failed to parse /a/alpha.md
[2026-08-26][18:34:47][WARN][scan] failed to parse /a/bravo.md
";
        let (out, folded) = collapse_repeats(log);

        assert_eq!(folded, 0);
        assert_eq!(out.lines().count(), 2);
        assert!(out.contains("alpha.md") && out.contains("bravo.md"));
    }

    #[test]
    fn collapse_repeats_folds_neighbours_that_differ_only_by_a_number() {
        // The cost of the rule, pinned rather than left to be discovered:
        // consecutive lines about differently-numbered paths fold together.
        // The count marks it and the log dir keeps the originals, which is
        // the right side of the trade for a clipboard summary.
        let log = "\
[2026-08-26][18:34:47][WARN][scan] failed to parse /a/1.md
[2026-08-26][18:34:47][WARN][scan] failed to parse /a/2.md
";
        let (out, folded) = collapse_repeats(log);

        assert_eq!(folded, 1);
        assert!(out.contains("[... 1 more lines like this one]"));
    }

    #[test]
    fn render_log_tail_collapses_before_clamping_so_the_window_keeps_history() {
        // The repeats come last, so clamping first spends the whole window on
        // them and loses both real events. Collapsing first keeps them.
        let mut log = String::from(
            "[d][t][INFO][a] scan complete\n[d][t][ERROR][b] disk full\n",
        );
        for i in 0..400 {
            log.push_str(&format!("[d][t][WARN][w] callback id {i}\n"));
        }

        let out = render_log_tail(&log, 200);

        assert!(out.contains("scan complete"), "lost the earliest event: {out}");
        assert!(out.contains("disk full"), "lost the second event: {out}");
    }

    #[test]
    fn render_log_tail_leaves_a_log_without_repeats_alone() {
        let log = "[d][t][INFO][a] one\n[d][t][INFO][b] two\n";
        let out = render_log_tail(log, 4096);

        assert_eq!(out, log);
    }
}
