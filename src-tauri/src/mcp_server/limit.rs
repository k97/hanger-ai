//! A sliding-window rate limit, which the MCP spec makes a server MUST.

use std::collections::VecDeque;
use std::time::{Duration, Instant};

pub struct RateLimit {
    max: usize,
    window: Duration,
    calls: VecDeque<Instant>,
}

impl RateLimit {
    pub fn new(max: usize, window: Duration) -> Self {
        RateLimit { max, window, calls: VecDeque::new() }
    }

    /// Whether a call at `now` is allowed; an allowed call is counted.
    pub fn allow(&mut self, now: Instant) -> bool {
        while self.calls.front().is_some_and(|t| now.saturating_duration_since(*t) >= self.window) {
            self.calls.pop_front();
        }
        if self.calls.len() >= self.max {
            return false;
        }
        self.calls.push_back(now);
        true
    }
}
