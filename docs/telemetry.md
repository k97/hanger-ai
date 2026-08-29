# Hanger Telemetry & Privacy Documentation

Hanger is designed as a local-first application, putting developer data privacy first. Crash reporting is opt-in and defaults to off. Usage analytics default to **on**,
shown pre-enabled on the onboarding consent step so the choice is visible and can
be refused before any event is sent; an explicit refusal is stored and wins over
the default. Both are sanitised locally to prevent path or credential disclosure.

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
- **Measurement ID:** compiled in as `DEFAULT_MEASUREMENT_ID`. A measurement ID is a
  public identifier rather than a credential, the same call this project makes for the
  Sentry DSN. `GA4_MEASUREMENT_ID` overrides it at build time.
- **API secret:** `GA4_API_SECRET`, injected at build time using `option_env!`, with no
  default. Absent secret means nothing is sent, which is what keeps a developer build
  out of the production property. It must belong to the same data stream as the
  measurement ID; a mismatched pair is rejected with 401.
- **Delivery is checked:** a non-2xx response is logged with its status, and the
  request URL — which carries the API secret — is never part of any log line.
- **Endpoint:** Dispatches HTTPS POST payloads to the Measurement Protocol endpoint:
  - Production: `https://www.google-analytics.com/mp/collect`
  - Debug Validation: `https://www.google-analytics.com/debug/mp/collect` (used in test profiles or when `GA4_DEBUG_ENDPOINT` is set).

### Client ID Management
- **Generation:** On granting consent, a random UUID v4 is minted and saved as `telemetry_client_id` in the local SQLite preferences store.
- **Scrubbing:** The client ID is entirely local and decoupled from system identifiers. Upon revoking consent, the `telemetry_client_id` key is permanently deleted from the store.

### Session Parameters (every event)

GA4 shows a person in Realtime and the engagement reports only when the event carries
`session_id` and `engagement_time_msec` (Measurement Protocol reference: "Common event
parameters like session_id and engagement_time_msec are important for user activity to
display in reports like Realtime"). `telemetry::build_payload` adds both to every event
after the consent, secret and client-id gates in `track_event_async`:

- **`session_id`** — unix seconds at the session's first event, sent as a string. A new
  session starts after thirty minutes without an event, GA4's own boundary
  (`telemetry::SESSION_TIMEOUT_MS`); exactly thirty minutes is still the same session.
- **`engagement_time_msec`** — milliseconds since the previous event in the session, `1`
  for the first (a zero would not count the user as active). This is the gap between
  events, not measured focus time; an idle app inflates it up to the session boundary.

The session is a pure state machine fed a clock (`telemetry::Session::touch`), pinned in
`src-tauri/tests/telemetry_session_tests.rs`. `first_visit` and `session_start` cannot be
sent over the Measurement Protocol, so "New users" never populates; sessions are derived
from `session_id` alone.

### Tracked Event Call-Sites & Payload Schema

All payloads carry counts, categories, durations and fixed screen names only — **NEVER
paths, names, or file content.**

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

#### H. `engine_icon_unmapped`
- **Call-Site:** `report_unmapped_engine` command in `src-tauri/src/lib.rs`, invoked once
  per session by the webview when `BrandIcon` draws the generic mark for an engine it
  has no mark for (`src/utils/reportUnmappedEngine.ts`).
- **Parameters:** `engine_key` (a backend-minted product identifier, sanitised by
  `sanitise_engine_key`: lowercase, ≤48 chars, `[a-z0-9_.-]` only) and, when one was
  given, `engine_name` (≤64 chars, no path separators). Anything outside that shape is
  dropped before dispatch.

#### I. `page_view`
- **Call-Site:** `track_screen_view` command in `src-tauri/src/lib.rs`, invoked by the
  effect on `selectedSidebarItem` in `src/App.tsx` — once for the screen restored at
  startup (after onboarding, once the stored selection has been read) and once per
  change. Every route — rail, palette, flyout, "show engine assets" — converges there.
- **Parameters:** `page_title` and `page_location` (`hanger://<title>`), where the title
  is one of six fixed names: `my_machine`, `needs_review`, `link_map`, `discovery`,
  `design_system`, `repo`. The webview maps its sidebar ids onto these
  (`src/utils/screenName.ts`); a repository screen reports as `repo`, never its path, and
  `telemetry::screen_page` drops any other string, so a path cannot become a title even
  if the map falls behind.
- **Why `page_view` and not `screen_view`:** the property is a `G-` web stream, and
  `screen_view` "is available only for App streams". `page_view` populates the
  Pages and screens report and `screenPageViews` with nothing to register.

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
