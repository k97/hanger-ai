# Hanger AI — U-Loop Exit Summary (U1–U4)

This document provides the exit audit and summary of the Hanger v1 User/UX Loop iterations (U1 through U4), detailing accomplishments, verification status, and scope resolution.

---

## 1. Iteration Summaries & Status

### 🚀 U1: Symlink & Checksum engine
* **Status:** `COMPLETE` (Verified on macOS dev build)
* **Accomplishments:**
  * Implemented symlink and hard-copy deployment mechanisms.
  * Symlinked assets skip database checksum tracking, remaining linked to source.
  * Hard-copy deploys compute Blake3 checksum hashes, registering files in the local database for drift tracking.
  * Transactional backup system implemented under `.hanger/backups/`.

### 🚀 U2: Drift Detection & Tracking
* **Status:** `COMPLETE` (Verified on macOS dev build)
* **Accomplishments:**
  * Dynamic drift checking computes live Blake3 hashes on scanned project copies and compares them to registry values.
  * Assets with mismatched hashes are flagged with a prominent "Drifted" badge in the UI.
  * Side-by-side local file restoration triggers automatic backup creation before overwrite.

### 🚀 U3: Rules Diff Side-by-Side Merging
* **Status:** `COMPLETE` (Verified on macOS dev build)
* **Accomplishments:**
  * Split rule visual editor comparing source vs destination configurations side by side.
  * Safe diff merge options: "Take Both" (appends source block under target block) and "Overwrite".
  * Resolved details flyout routing to dynamically display correct category items (agents, rules, tools) contextual to the selected row.

### 🚀 U3.5: Subagents Display & Gating
* **Status:** `COMPLETE` (Verified on macOS dev build)
* **Accomplishments:**
  * Extended scanning engine to discover subagent configurations (such as `.claude/agents/` or Gemini equivalents).
  * Added Subagents card displaying inventory counts and list rows showing declared tools.
  * Symlink/Copy buttons suppressed for Subagent rows (gated to v1.1).

### 🚀 U4: Onboarding Reconciliation & Polish
* **Status:** `COMPLETE` (Verified and Ratified on macOS dev build)
* **Accomplishments:**
  * Simplified welcome wizard to a profile-first layout (removed step 3 folder select).
  * Relocated macOS TCC permissions warnings contextually to the top of the repository view (`RepoPane`) on permission errors.
  * Standardised all empty states app-wide to support the 5-category taxonomy (Australian English spelling).

---

## 2. Telemetry & GUI Verification Status

All user scenarios for the final release of the U-loop have been verified using automated GUI testing tools on the real application window and ratified by the user:
- **Scenario A (Fresh Launch):** Welcome screen click, telemetry toggles saved, immediate redirection to Global User Profile, and contextual macOS Folder Scan warnings.
- **Scenario B (Migration):** Verification that existing completed onboarding profiles bypass the wizard and preserve crash/usage analytics selection in SQLite storage.

---

*This concludes the Hanger v1 User Loop.*
