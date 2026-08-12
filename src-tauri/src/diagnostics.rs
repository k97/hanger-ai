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
            let tail = clamp_tail(&content, MAX_LOG_BYTES);
            if tail.len() < content.len() {
                let _ = writeln!(
                    r,
                    "[log truncated to last {} bytes of {}; full history in the log dir]",
                    tail.len(),
                    content.len()
                );
            }
            let _ = writeln!(r, "{tail}");
        }
        Err(e) => {
            let _ = writeln!(r, "log read failed ({}): {e}", newest.path().display());
        }
    }
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
    use super::clamp_tail;

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
}
