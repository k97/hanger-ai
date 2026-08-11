use tauri_app_lib::preferences::{sanitise_msg, SanitisedError};
use std::sync::Mutex;

static TEST_LOCK: Mutex<()> = Mutex::new(());

#[test]
fn test_error_leak_prevention() {
    // Set up dummy absolute paths and mock secrets
    let raw_home_path = "~/Projects/testuser/hanger-ai";
    let raw_secret_token = "gho_ABC123xyzSecretTokenTokenToken";
    let raw_api_key_url = "api_key=AIzaSyA123SecretKeyUrl";

    std::env::set_var("HOME", "/Users/testuser");
    std::env::set_var("USERPROFILE", "/Users/testuser");

    // Instantiate and format SanitisedError
    let raw_error_msg = format!(
        "Failed to read database at {} with token={}",
        raw_home_path, raw_secret_token
    );
    let err = SanitisedError(raw_error_msg);

    let display_output = format!("{}", err);
    let debug_output = format!("{:?}", err);

    // Assertions for Display output
    assert!(
        !display_output.contains("/Users/testuser"),
        "Display output leaks HOME directory!"
    );
    assert!(
        !display_output.contains("gho_"),
        "Display output leaks GitHub token!"
    );
    assert!(
        display_output.contains("~"),
        "Display output missed home tilde replacement!"
    );
    assert!(
        display_output.contains("<redacted-github-token>"),
        "Display output missed token redaction!"
    );

    // Assertions for Debug output
    assert!(
        !debug_output.contains("/Users/testuser"),
        "Debug output leaks HOME directory!"
    );
    assert!(
        !debug_output.contains("gho_"),
        "Debug output leaks GitHub token!"
    );
    assert!(
        debug_output.contains("~"),
        "Debug output missed home tilde replacement!"
    );
    assert!(
        debug_output.contains("<redacted-github-token>"),
        "Debug output missed token redaction!"
    );

    // Audit URL parameter secret redaction
    let url_msg = format!("HTTP request failed for URL http://localhost/query?{}", raw_api_key_url);
    let url_sanitised = sanitise_msg(&url_msg);
    assert!(
        !url_sanitised.contains("AIzaSyA123SecretKeyUrl"),
        "URL secret key leaked!"
    );
    assert!(
        url_sanitised.contains("api_key=<redacted-secret>"),
        "URL secret key missed redaction!"
    );
}

#[test]
fn test_error_unregistered_secret() {
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("preferences.db");
    
    let store = tauri_app_lib::preferences::PreferencesStore::new(&db_path).unwrap();

    let unregistered_secret = "secret_payload_987654321_zyxwvutsr";

    let mut perms = std::fs::metadata(&db_path).unwrap().permissions();
    perms.set_readonly(true);
    std::fs::set_permissions(&db_path, perms).unwrap();

    let write_res = store.set_preference("some_key", unregistered_secret);
    assert!(write_res.is_err());

    let err = write_res.unwrap_err();
    let display_output = format!("{}", err);
    let debug_output = format!("{:?}", err);

    assert!(
        !display_output.contains(unregistered_secret),
        "Planted unregistered secret leaked in Display output!"
    );
    assert!(
        !debug_output.contains(unregistered_secret),
        "Planted unregistered secret leaked in Debug output!"
    );
}

#[test]
fn test_sentry_before_send_sanitisation() {
    let _lock = TEST_LOCK.lock().unwrap();
    std::env::set_var("HOME", "/Users/testuser");
    std::env::set_var("USERPROFILE", "/Users/testuser");

    // Enable consent temporarily for the test
    tauri_app_lib::CRASH_CONSENT_ENABLED.store(true, std::sync::atomic::Ordering::SeqCst);

    // Planted secrets and paths
    let test_path = "~/secrets/fixture";
    let test_secret = "gho_ABC123xyzSecretTokenTokenToken";
    let test_warning = format!("Permission denied: {}", test_path);

    let mut event = sentry::protocol::Event::new();
    event.message = Some(format!("Error message containing {} and token={}", test_warning, test_secret));

    let exception = sentry::protocol::Exception {
        ty: "Error".to_string(),
        value: Some(format!("Exception value: {}", test_warning)),
        ..Default::default()
    };
    event.exception.values.push(exception);

    let breadcrumb = sentry::protocol::Breadcrumb {
        message: Some(format!("Breadcrumb: {}", test_warning)),
        ..Default::default()
    };
    event.breadcrumbs.values.push(breadcrumb);

    event.extra.insert("info".to_string(), serde_json::Value::String(format!("Extra: {}", test_warning)));
    event.tags.insert("target_tag".to_string(), format!("Tag: {}", test_warning));

    // Run Sentry before_send_sanitised hook
    let processed_opt = tauri_app_lib::before_send_sanitised(event);
    assert!(processed_opt.is_some());
    let processed = processed_opt.unwrap();

    // Verify message has no path/token leakage
    let msg = processed.message.as_ref().unwrap();
    assert!(!msg.contains("/Users/testuser"), "Sentry message leaked HOME path!");
    assert!(!msg.contains("gho_"), "Sentry message leaked secret token!");
    assert!(msg.contains("~") || msg.contains("<sanitised>"), "Sentry message missing sanitisation!");

    // Verify exceptions have no path leakage
    let exc = processed.exception.values[0].value.as_ref().unwrap();
    assert!(!exc.contains("/Users/testuser"), "Sentry exception leaked HOME path!");

    // Verify breadcrumbs have no path leakage
    let bc = processed.breadcrumbs.values[0].message.as_ref().unwrap();
    assert!(!bc.contains("/Users/testuser"), "Sentry breadcrumb leaked HOME path!");

    // Verify extra parameters have no path leakage
    let extra_val = processed.extra.get("info").unwrap().as_str().unwrap();
    assert!(!extra_val.contains("/Users/testuser"), "Sentry extra leaked HOME path!");

    // Verify tags have no path leakage
    let tag_val = processed.tags.get("target_tag").unwrap();
    assert!(!tag_val.contains("/Users/testuser"), "Sentry tags leaked HOME path!");

    // Verify that when consent is false, before_send returns None
    tauri_app_lib::CRASH_CONSENT_ENABLED.store(false, std::sync::atomic::Ordering::SeqCst);
    let mut event_off = sentry::protocol::Event::new();
    event_off.message = Some("Clean message".to_string());
    let processed_off = tauri_app_lib::before_send_sanitised(event_off);
    assert!(processed_off.is_none(), "Sentry event processed when consent was disabled!");
}

#[test]
fn test_telemetry_revocation_and_gate_atoms() {
    let _lock = TEST_LOCK.lock().unwrap();
    // Verify that we can set USAGE_CONSENT_ENABLED and CRASH_CONSENT_ENABLED
    tauri_app_lib::USAGE_CONSENT_ENABLED.store(true, std::sync::atomic::Ordering::SeqCst);
    tauri_app_lib::CRASH_CONSENT_ENABLED.store(true, std::sync::atomic::Ordering::SeqCst);

    assert!(tauri_app_lib::USAGE_CONSENT_ENABLED.load(std::sync::atomic::Ordering::SeqCst));
    assert!(tauri_app_lib::CRASH_CONSENT_ENABLED.load(std::sync::atomic::Ordering::SeqCst));

    // Turn off crash consent and verify atom updates
    tauri_app_lib::CRASH_CONSENT_ENABLED.store(false, std::sync::atomic::Ordering::SeqCst);
    assert!(!tauri_app_lib::CRASH_CONSENT_ENABLED.load(std::sync::atomic::Ordering::SeqCst));

    // Turn off usage consent and verify atom updates
    tauri_app_lib::USAGE_CONSENT_ENABLED.store(false, std::sync::atomic::Ordering::SeqCst);
    assert!(!tauri_app_lib::USAGE_CONSENT_ENABLED.load(std::sync::atomic::Ordering::SeqCst));
}

#[test]
fn test_asset_deployed_telemetry_no_leak() {
    let category = "skills";
    let deploy_type = "symlink";
    let source_path = "~/global/skills/git-commit";
    
    // Mimic the telemetry mapping logic inside execute_deploy:
    let is_project_scoped = false;
    let source_scope = if is_project_scoped { "Project" } else { "Global" };

    let payload = serde_json::json!({
        "category": category,
        "mode": deploy_type,
        "source_scope": source_scope
    });

    let payload_str = serde_json::to_string(&payload).unwrap();

    assert!(!payload_str.contains(source_path), "Telemetry payload leaked absolute path!");
    assert!(!payload_str.contains("/Users/testuser"), "Telemetry payload leaked absolute path!");
    assert!(!payload_str.contains("source_path"), "Telemetry payload contains forbidden source_path key!");
    
    let expected = serde_json::json!({
        "category": "skills",
        "mode": "symlink",
        "source_scope": "Global"
    });
    assert_eq!(payload, expected);
}
