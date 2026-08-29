//! The debug-endpoint line used to read `[Telemetry Debug Validation] HTTP 200
//! — {…}` with no event name, so a run that produced three lines could not
//! say which three events they were — attributing them on 2026-08-29 meant
//! counting lines around a Rescan click. The line names the event now.

use tauri_app_lib::debug_validation_line;

#[test]
fn the_debug_line_names_the_event_it_validated() {
    let line = debug_validation_line("page_view", 200, "{\n  \"validationMessages\": [ ]\n}");
    assert!(line.starts_with("[Telemetry Debug Validation] page_view: HTTP 200"), "{line}");
    assert!(line.contains("validationMessages"), "the validator's own text still follows: {line}");
}

#[test]
fn the_debug_line_carries_nothing_but_name_status_and_the_validators_text() {
    let line = debug_validation_line("scan_completed", 200, "{}");
    assert_eq!(line, "[Telemetry Debug Validation] scan_completed: HTTP 200 — {}");
}
