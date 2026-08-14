# Implementation Plan - Hanger v1: Signed & Notarised Release Pipeline (Iteration R4)

This plan outlines the implementation of the signed, notarised macOS release pipeline, secret integration, release runbook, and tag-based automated verification.

---

## User Review Required

Please review the proposed release workflow, secret injection details, and dry-run job configuration.

### 1. Secrets Verification & Loud Failures
To prevent the generation of unsigned or unnotarised builds, the GitHub Actions workflow will check for the presence of the code-signing and app credentials secrets before launching the build. 
* **Behavior:** If any of the required signing secrets are absent, the workflow will explicitly output a loud error message and fail immediately, preventing waste of CI compute on unnotarised packages.

### 2. Manual Dry-Run Dispatch
* **Trigger:** Add `workflow_dispatch` to `.github/workflows/release.yml` to allow manual execution of the pipeline.
* **Input:** Add a boolean input `dry_run` (default: `true`). If `dry_run` is set to `true`, the workflow will compile, sign, and notarise the bundle but skip creating a GitHub Release or uploading production release assets.

---

## Proposed Changes

### CI/CD Workflow Setup

#### [NEW] [release.yml](file://~/Projects/demo/hanger-ai/.github/workflows/release.yml)
* **Triggers:**
  * Push to tag matching `v*` (e.g. `v0.1.0`, `v0.0.1-rc1`).
  * Manual execution (`workflow_dispatch`) with `dry_run` flag.
* **Steps:**
  1. **Pre-flight Secrets Validation:**
     * Asserts that Apple Developer and Telemetry credentials are set.
     * Fails with a clear message if missing.
  2. **Install & Setup:**
     * Installs node dependencies via `pnpm install`.
     * Installs Rust toolchain.
  3. **Build, Sign & Notarise:**
     * Uses `tauri-apps/tauri-action@v2` (configured for macOS).
     * Passes the signing certificate, App Store Connect developer API credentials, Sentry DSN, and GA4 credentials.
  4. **Release Upload (Non-dry-runs only):**
     * Publishes a GitHub Release with the notarised `.dmg` and `.zip` files.

---

## Secret Injection Specification

We will inject the following environment variables into the CI runner during the build step:

### A. macOS Code Signing & Notarisation (Apple API)
* `APPLE_CERTIFICATE`: Base64-encoded signing certificate (`.p12` format).
* `APPLE_CERTIFICATE_PASSWORD`: Encryption password protecting the certificate.
* `APPLE_SIGNING_IDENTITY`: Code-signing identity name (e.g., `Developer ID Application: YOUR_NAME (YOUR_TEAM_ID)`).
* `APPLE_ID`: Apple Developer account email address.
* `APPLE_PASSWORD`: App-specific password generated via Apple ID portal for notarisation.
* `APPLE_TEAM_ID`: 10-character Apple Developer team ID.

### B. Telemetry & Analytics (Bake-in)
* `SENTRY_DSN`: Production DSN for crash tracking (activates deep sanitisation).
* `GA4_MEASUREMENT_ID`: Google Analytics 4 measurement ID.
* `GA4_API_SECRET`: Measurement protocol secret key.

---

## Documentation Updates

#### [NEW] [release.md](file://~/Projects/demo/hanger-ai/docs/release.md)
A comprehensive runbook containing:
1. **Developer Setup:** Commands to export the Apple Developer ID Certificate as Base64.
2. **Release Execution:** Steps to tag and push to trigger automated builds.
3. **Emergency Checklists:** Action items if notarisation checks fail or Apple App Store Connect services reject the build.

---

## Verification Plan

### Test-Tag Verification (`v0.0.1-rc1`)
* We will push a release candidate tag `v0.0.1-rc1` to trigger a real production run in GitHub Actions.
* Extract and verify the real, unabridged notarisation log output directly from Apple's notarization tool (`xcrun notarytool`) in the CI logs to prove success.
