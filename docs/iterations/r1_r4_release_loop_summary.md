# Hanger AI - Final Release Loop Summary (R1–R4)

This document provides the final status audit of Hanger v1 development iterations (R1 through R4), listing achievements, verification status, and all deferred/parked items.

---

## 1. Iteration Summaries & Status

### 🚀 R1: Core Onboarding & Wizard Flow
* **Status:** `COMPLETE` (Verified on macOS dev build)
* **Accomplishments:**
  * Multi-step onboarding sequence layout (theme-compliant, light/dark).
  * System access requests (TCC status check and retry hooks).
  * Consent form settings (Crash & Usage, default-off, persistent across app restarts).

### 🚀 R2: Telemetry Integration (Sentry & GA4)
* **Status:** `COMPLETE` (Verified on macOS production release build)
* **Accomplishments:**
  * Opt-in crash reporting (Sentry) and server-side usage analytics (GA4 Measurement Protocol).
  * Strong client-side privacy sanitisation (`before_send` filter to strip user home paths, GitHub tokens, and absolute filenames).
  * Dynamic consent revocation (toggling OFF immediately detaches Sentry client hub and stops event dispatching).

### 🚀 R3: Visual Identity & Naming Alignment
* **Status:** `COMPLETE` (Verified on macOS Dock & App Switcher)
* **Accomplishments:**
  * Branded off-white squircle App Icon with centered orange/blue Hanger mark.
  * Product bundle configuration frozen as **Hanger AI** and bundle ID set to `com.rkarthik.hanger`.
  * Dock icon, Command-Tab switcher, and Menu Bar naming successfully updated.

### 🚀 R4: Release Pipeline, Apple Signing & Notarisation
* **Status:** `COMPLETE` (Verified on GHA and clean account test install)
* **Accomplishments:**
  * Secure macOS release workflow on GitHub Actions.
  * Passwordless Developer certificate keychain import and pre-flight validation.
  * Apple Notarytool upload and Stapler script verification (Run `29418346967` successfully marked as `Accepted` by Apple).
  * Published signed DMG to GitHub Release.

---

## 2. Realised Telemetry & Security Verification (All Pass)
During R4 closeout, the production release build was downloaded and tested manually:
* **Gatekeeper Audit:** App launches cleanly on a clean user account with standard user prompts (no unsigned warnings or blockages).
* **GA4 Telemetry:** Events (`consent_changed`, `scan_completed`, etc.) successfully logged in Realtime View with fully redacted / path-free metadata.

---

## 3. Parked & Deferred Scope Items (V1.1+)
To maintain the v1 project scope, the following features were deferred to future iterations:

| Feature / System | Decided Stage | Notes / Reasons |
| :--- | :--- | :--- |
| **Hook-sniffing** | `DEFERRED` | Scanner walks directories for assets but does not sniff hooks (v1.1+). |
| **Agent ➔ Tool mapping** | `DEFERRED` | Complex graphing of agent-to-tool connections was simplified to direct inventory listing. |
| **Constellation retirement** | `PARKED` | The cleanup flow for retiring and unlinking deprecated project assets was parked. |
| **Subagents / Hooks / Permissions** | `DEFERRED` | Navigation and inventory scans are strictly scoped to the 4 active tabs (Skills, Agents, Tools, Rules). |
| **Discovery Review Pipeline** | `DEFERRED` | Active review queues for discovered assets were deferred to focus on symlinking / copy deployment mechanisms. |

---

*This concludes the Hanger v1 development cycle.*
