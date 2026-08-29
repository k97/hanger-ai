//! GA4 needs two parameters on every event before a person shows up as a user
//! in Realtime and the engagement reports: `session_id` and
//! `engagement_time_msec` (Measurement Protocol reference: "Common event
//! parameters like session_id and engagement_time_msec are important for user
//! activity to display in reports like Realtime"). Hanger sent neither, so its
//! events landed in the Events report while every user count read zero.
//!
//! The session is a pure state machine fed a clock, so these tests pin the
//! boundary GA4 itself uses (30 minutes without an event starts a new session)
//! without sleeping. The screen allowlist is pinned here too: `page_view` may
//! carry only one of six fixed names, never a path.

use tauri_app_lib::telemetry::{build_payload, screen_page, Session, SessionParams, SESSION_TIMEOUT_MS};

const T0: u64 = 1_756_400_000_000; // an arbitrary unix time in ms

#[test]
fn the_first_event_opens_a_session_stamped_in_seconds() {
    let mut s = Session::default();
    let p = s.touch(T0);
    assert_eq!(p.session_id, T0 / 1000);
    assert_eq!(
        p.engagement_time_msec, 1,
        "GA4 counts a user as active only when engagement is positive"
    );
}

#[test]
fn an_event_inside_the_window_keeps_the_session_and_reports_the_gap() {
    let mut s = Session::default();
    let first = s.touch(T0);
    let second = s.touch(T0 + 90_000);
    assert_eq!(second.session_id, first.session_id);
    assert_eq!(second.engagement_time_msec, 90_000);
}

#[test]
fn two_events_in_the_same_millisecond_still_report_positive_engagement() {
    let mut s = Session::default();
    s.touch(T0);
    let p = s.touch(T0);
    assert_eq!(p.engagement_time_msec, 1);
}

#[test]
fn thirty_minutes_of_silence_starts_a_new_session() {
    let mut s = Session::default();
    let first = s.touch(T0);
    let later = T0 + SESSION_TIMEOUT_MS + 1;
    let p = s.touch(later);
    assert_ne!(p.session_id, first.session_id);
    assert_eq!(p.session_id, later / 1000);
    assert_eq!(p.engagement_time_msec, 1);
}

#[test]
fn exactly_thirty_minutes_is_still_the_same_session() {
    let mut s = Session::default();
    let first = s.touch(T0);
    let p = s.touch(T0 + SESSION_TIMEOUT_MS);
    assert_eq!(p.session_id, first.session_id);
    assert_eq!(p.engagement_time_msec, SESSION_TIMEOUT_MS);
}

#[test]
fn every_payload_carries_the_session_beside_the_callers_params() {
    let session = SessionParams { session_id: T0 / 1000, engagement_time_msec: 90_000 };
    let body = build_payload("cid-1", "scan_completed", serde_json::json!({ "skills_count": 3 }), session);
    assert_eq!(body["client_id"], "cid-1");
    let event = &body["events"][0];
    assert_eq!(event["name"], "scan_completed");
    assert_eq!(event["params"]["skills_count"], 3, "the caller's params survive");
    assert_eq!(event["params"]["session_id"], (T0 / 1000).to_string(), "session_id goes as a string, as the MP examples do");
    assert_eq!(event["params"]["engagement_time_msec"], 90_000, "engagement goes as a number, as the MP examples do");
}

#[test]
fn an_empty_params_object_still_gets_the_session() {
    let session = SessionParams { session_id: 1, engagement_time_msec: 1 };
    let body = build_payload("cid-1", "settings_export", serde_json::json!({}), session);
    assert_eq!(body["events"][0]["params"]["session_id"], "1");
    assert_eq!(body["events"][0]["params"]["engagement_time_msec"], 1);
}

#[test]
fn the_six_screens_map_to_a_title_and_a_hanger_url() {
    for name in ["my_machine", "needs_review", "link_map", "discovery", "design_system", "repo"] {
        let (title, location) =
            screen_page(name).unwrap_or_else(|| panic!("{name} must be a screen"));
        assert_eq!(title, name);
        assert_eq!(location, format!("hanger://{name}"));
    }
}

#[test]
fn anything_that_is_not_one_of_the_six_names_is_dropped() {
    for raw in [
        "",
        "Link Map",
        "link-map",
        "/Users/someone/Work/repo",
        "repo/",
        " repo",
        "my_machine\n",
        "settings",
    ] {
        assert!(screen_page(raw).is_none(), "{raw:?} must not reach GA4");
    }
}
