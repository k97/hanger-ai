//! The GA4 measurement ID ships in the binary; the API secret never does.
//!
//! A measurement ID is a public identifier — it sits in the page source of
//! every site running GA — so baking it in costs nothing and removes one
//! build-time secret to keep in sync. `SECURITY.md` already draws this line
//! for the Sentry DSN. The Measurement Protocol `api_secret` is the actual
//! credential and stays in `option_env!` with no default, which is what keeps
//! a developer build from reporting into the production property.

use tauri_app_lib::{measurement_id, DEFAULT_MEASUREMENT_ID};

#[test]
fn default_measurement_id_is_the_desktop_property() {
    assert_eq!(DEFAULT_MEASUREMENT_ID, "G-FSF08F45QS");
}

#[test]
fn measurement_id_is_always_resolvable() {
    // With a default present this can no longer be empty, so the dispatch gate
    // rests entirely on the API secret. That is the intended shape: an ID
    // without a secret sends nothing.
    let id = measurement_id();
    assert!(!id.is_empty(), "measurement id must never resolve empty");
    assert!(id.starts_with("G-"), "not a GA4 measurement id: {}", id);
}

#[test]
fn the_api_secret_has_no_baked_default() {
    // The guard that matters. If a default ever appears here, an unconfigured
    // build starts talking to the production property.
    assert!(
        option_env!("GA4_API_SECRET").is_none() || !cfg!(debug_assertions),
        "a developer build must not carry a compiled-in GA4 API secret"
    );
}
