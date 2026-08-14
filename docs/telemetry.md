# Hanger Telemetry & Privacy Documentation

Hanger is designed as a local-first application, putting developer data privacy first. Telemetry collection is entirely opt-in (default-off) and is sanitised locally to prevent path or credential disclosure.

---

## 1. Sentry Crash Reporting

### DSN Resolution & Lifecycle
- **Compile-Time Binding:** Sentry DSN is resolved at compile time using `option_env!("SENTRY_DSN")`. If this env variable is missing during build, crash reporting is permanently disabled (absent-safe).
- **Consent Check:** Sentry is only initialized at startup if the database preference `consent_crash` is `"true"`.
- **Dynamic Revocation:** If `consent_crash` is toggled off mid-session:
  1. The global consent atom `CRASH_CONSENT_ENABLED` is set to `false`.
  2. Sentry's client is detached dynamically by calling `sentry::Hub::current().bind_client(None)`.
  3. No subsequent error traces or logs are caught or dispatched.

### Local Sanitisation (`before_send`)
Every caught exception, panic, or log is routed through `before_send_sanitised` before reaching Sentry. The sanitiser scrubs:
- **Messages & Exceptions:** Replaces absolute system paths (e.g., `/Users/username/`) with `~` or `<sanitised>`, and filters scan warning signatures like `"Permission denied: <path>"`.
- **Breadcrumbs, Extras, and Tags:** Traverses all metadata key-value collections and replaces strings matching path indicators, GitHub tokens (`gho_`), or other secrets with redacted placeholders.
- **Fail-Safe Gate:** If `CRASH_CONSENT_ENABLED` is `false` when `before_send` triggers, the event is immediately discarded (`None` returned).

---

## 2. Google Analytics 4 (GA4) Measurement Protocol

### Endpoint & Secrets
- **Secrets:** `GA4_MEASUREMENT_ID` and `GA4_API_SECRET` are injected at build time using `option_env!`. If absent, analytics are disabled.
- **Endpoint:** Dispatches HTTPS POST payloads to the Measurement Protocol endpoint:
  - Production: `https://www.google-analytics.com/mp/collect`
  - Debug Validation: `https://www.google-analytics.com/debug/mp/collect` (used in test profiles or when `GA4_DEBUG_ENDPOINT` is set).

### Client ID Management
- **Generation:** On granting consent, a random UUID v4 is minted and saved as `telemetry_client_id` in the local SQLite preferences store.
- **Scrubbing:** The client ID is entirely local and decoupled from system identifiers. Upon revoking consent, the `telemetry_client_id` key is permanently deleted from the store.

### Tracked Event Call-Sites & Payload Schema

All payloads carry counts, categories, and durations only — **NEVER paths, names, or file content.**

#### A. `scan_completed`
- **Call-Site:** Background thread scan walk task completion in `src-tauri/src/lib.rs`.
- **Parameters:**
  ```json
  {
    "skills_count": 5,
    "agents_count": 2,
    "tools_count": 12,
    "rules_count": 4
  }
  ```

#### B. `asset_deployed`
- **Call-Site:** End of `execute_deploy` in `src-tauri/src/lib.rs`.
- **Parameters:**
  ```json
  {
    "category": "skills" | "rules" | "agents" | "tools" | "unknown",
    "mode": "symlink" | "copy"
  }
  ```

#### C. `rules_merge_completed`
- **Call-Site:** Completion of transactional write in `execute_deploy_merged_rule` in `src-tauri/src/lib.rs`.
- **Parameters:**
  ```json
  {
    "merged_size": 2548
  }
  ```

#### D. `settings_export`
- **Call-Site:** Success return of `export_preferences` command in `src-tauri/src/lib.rs`.
- **Parameters:** `{}`

#### E. `settings_import`
- **Call-Site:** Successful SQLite commit in `import_preferences` command in `src-tauri/src/lib.rs`.
- **Parameters:** `{}`

#### F. `onboarding_completed`
- **Call-Site:** Intercepted in `set_preference` when `onboarding_complete` changes to `"true"`.
- **Parameters:** `{}`

#### G. `consent_changed`
- **Call-Site:** Intercepted in `set_preference` when `consent_crash` or `consent_usage` values change.
- **Parameters:**
  ```json
  {
    "crash_consent": true | false,
    "usage_consent": true | false,
    "state": "on" | "off" | "crash_on" | "crash_off"
  }
  ```

---

## 3. Consent Revocation Event Ordering

To ensure compliance, revoking usage consent follows a strict transactional sequence:
1. **Final Dispatch:** While `USAGE_CONSENT_ENABLED` is still `true`, dispatch `consent_changed` with `state: "off"` to the Measurement Protocol.
2. **Close Gate:** The atomic flag `USAGE_CONSENT_ENABLED` is updated to `false`, blocking all future outgoing request dispatches.
3. **Purge ID:** The `telemetry_client_id` key is deleted from the preferences database.

---

## 4. Developer Notes for Testing

> [!IMPORTANT]
> Because `option_env!` bakes secrets into the binary at compile time, dev builds compiled without variables will have telemetry permanently disabled (silently no-op). Positive-path validation testing requires compiling with environment variables set:
> ```bash
> GA4_MEASUREMENT_ID=xxx GA4_API_SECRET=yyy SENTRY_DSN=zzz cargo build
> ```
