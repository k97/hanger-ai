//! `consent_usage` defaults to on.
//!
//! The preference is unset until the user passes the onboarding consent step,
//! and unset has to mean something. It used to mean off, via
//! `unwrap_or_default() == "true"` on an `Option<String>`, where `None`
//! flattened to `""`. It now means on: the onboarding screen shows the box
//! pre-ticked, so nothing is sent before the user has seen the choice and had
//! the chance to refuse it.
//!
//! An explicit stored value always wins over the default, which is the half
//! worth pinning — a user who turned analytics off must stay off across
//! restarts, and that is the regression this file exists to catch.

use tauri_app_lib::usage_consent_from_stored;

#[test]
fn unset_preference_enables_usage_analytics() {
    assert!(
        usage_consent_from_stored(None),
        "an unset consent_usage must default to on"
    );
}

#[test]
fn explicit_false_stays_off_across_restarts() {
    assert!(
        !usage_consent_from_stored(Some("false".to_string())),
        "a user who declined must not be re-enabled by the new default"
    );
}

#[test]
fn explicit_true_stays_on() {
    assert!(usage_consent_from_stored(Some("true".to_string())));
}

#[test]
fn empty_string_is_not_consent() {
    // The old code path produced "" for a missing row. If a write ever stores
    // an empty string, it must not be read as the new default-on.
    assert!(
        !usage_consent_from_stored(Some(String::new())),
        "an empty stored value is a written value, not an absent one"
    );
}

#[test]
fn unrecognised_value_is_not_consent() {
    assert!(!usage_consent_from_stored(Some("yes".to_string())));
    assert!(!usage_consent_from_stored(Some("1".to_string())));
}
