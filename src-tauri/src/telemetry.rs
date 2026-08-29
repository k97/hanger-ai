//! What every GA4 event needs beyond its own parameters, and which screens
//! may be named in a `page_view`.
//!
//! GA4 shows a person in Realtime and the engagement reports only when the
//! event carries `session_id` and `engagement_time_msec` — the Measurement
//! Protocol reference: "Common event parameters like session_id and
//! engagement_time_msec are important for user activity to display in
//! reports like Realtime." Hanger sent neither until 2026-08-30, so events
//! reached the Events report while every user count read zero.
//!
//! The session boundary is GA4's own: thirty minutes without an event starts
//! a new session. `Session` is a pure state machine fed a clock so that
//! boundary is testable without sleeping (`telemetry_session_tests.rs`);
//! `session_params_now` feeds it the wall clock for `track_event_async`.

use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

/// GA4's own session boundary: thirty minutes without an event.
pub const SESSION_TIMEOUT_MS: u64 = 30 * 60 * 1000;

/// The two parameters every event carries.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SessionParams {
    /// Unix seconds at the session's first event — GA4 asks for "a positive
    /// number that identifies the user session".
    pub session_id: u64,
    /// Milliseconds since the previous event in this session; 1 for the
    /// first, because a zero would not count the user as active.
    pub engagement_time_msec: u64,
}

/// One session at a time, advanced by each event's timestamp.
#[derive(Debug)]
pub struct Session {
    started_ms: Option<u64>,
    last_ms: u64,
}

impl Session {
    pub const fn new() -> Self {
        Session { started_ms: None, last_ms: 0 }
    }

    /// Record an event at `now_ms` (unix milliseconds) and return the
    /// parameters it carries. A gap longer than `SESSION_TIMEOUT_MS` since
    /// the previous event opens a new session; exactly the timeout does not.
    pub fn touch(&mut self, now_ms: u64) -> SessionParams {
        let gap = now_ms.saturating_sub(self.last_ms);
        let fresh = self.started_ms.is_none() || gap > SESSION_TIMEOUT_MS;
        if fresh {
            self.started_ms = Some(now_ms);
        }
        let engagement_time_msec = if fresh { 1 } else { gap.max(1) };
        self.last_ms = now_ms;
        SessionParams {
            session_id: self.started_ms.unwrap_or(now_ms) / 1000,
            engagement_time_msec,
        }
    }
}

impl Default for Session {
    fn default() -> Self {
        Session::new()
    }
}

/// The process's one session.
static SESSION: Mutex<Session> = Mutex::new(Session::new());

/// The session parameters for an event happening now.
pub fn session_params_now() -> SessionParams {
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    match SESSION.lock() {
        Ok(mut session) => session.touch(now_ms),
        Err(poisoned) => poisoned.into_inner().touch(now_ms),
    }
}

/// The request body for one event: the caller's params with the session
/// beside them. `session_id` goes as a string and `engagement_time_msec` as
/// a number — the shapes the Measurement Protocol examples use.
pub fn build_payload(
    client_id: &str,
    name: &str,
    params: serde_json::Value,
    session: SessionParams,
) -> serde_json::Value {
    let mut params = match params {
        serde_json::Value::Object(map) => map,
        _ => serde_json::Map::new(),
    };
    params.insert(
        "session_id".to_string(),
        serde_json::Value::String(session.session_id.to_string()),
    );
    params.insert(
        "engagement_time_msec".to_string(),
        serde_json::json!(session.engagement_time_msec),
    );
    serde_json::json!({
        "client_id": client_id,
        "events": [{ "name": name, "params": params }]
    })
}

/// The six names a `page_view` may carry. The webview maps its sidebar ids
/// onto these (`src/utils/screenName.ts`); a repository screen is `repo`,
/// never its path.
pub const SCREENS: [&str; 6] = [
    "my_machine",
    "needs_review",
    "link_map",
    "discovery",
    "design_system",
    "repo",
];

/// The `page_title` and `page_location` for a screen name the webview
/// reports, or `None` for anything outside the six. Exact match, no
/// trimming or case-folding: a path can never become a title.
pub fn screen_page(raw: &str) -> Option<(String, String)> {
    SCREENS
        .iter()
        .find(|s| **s == raw)
        .map(|s| (s.to_string(), format!("hanger://{s}")))
}
