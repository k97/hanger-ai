# Hanger v4 Banner Prototypes — Validation & Feasibility Report

**Date:** 2026-08-22  
**Analyzed Assets:** `docs/v4-antigravity-prototypes/banner-iteration/`  
(`Master Observability Banner.html`, `hanger_polymorphic_banners.html`, `hanger_kitchen_sink_banners.html`, `hanger_observability_banners.html`, `hanger_combined_banners.html`)  
**Target Location:** `docs/v4-antigravity-prototypes/validation-reports/`  
**Applied Frameworks:** `software-design-philosophy` (Ousterhout), `software-architecture` (DDD & Clean Architecture), `.claude/DESIGN.md`, `docs/harness.md`, `.claude/rules/invariants.md`.

---

## Executive Summary

The prototypes in `docs/v4-antigravity-prototypes/banner-iteration/` explore rich visual telemetry for Hanger's top-of-view banner, introducing segmented KPI blocks, polymorphic per-category stats (Skills, MCP, Rules, Subagents), version drift alerts, and progress meters.

However, a strict validation against Hanger’s production codebase reveals **four critical feasibility and architectural gaps**:
1. **Design System & Token Violations:** The prototypes use multi-colored rainbow pastels (`--gel-purple`, `--gel-cyan`, `--gel-orange`), saturated gradients, and arbitrary font sizes that violate Hanger's monochromatic ink-and-paper design system (`.claude/DESIGN.md`) and would fail automated CI guards (`no-off-token-styles.test.ts`).
2. **Conceptual & Positioning Mismatch:** The prototypes treat Hanger as a cloud APM / DevOps monitoring tool ("Global Workspace Observability", "System Fragmentation", "Shadow Assets"). In reality, Hanger is a **local desktop interface for coding agent harness assets** (`docs/harness.md`), where assets have exclusive ownership, reach across engines, and 4 specific link states (`linked`, `drifted`, `broken`, `local`).
3. **Backend Invariant Collisions:** Several prototype metrics require frontend-calculated aggregations, directly violating the core architectural invariant that all counts must be backend-owned via `count_assets` (`src/__tests__/no-frontend-counting.test.ts`).
4. **Profile vs. Repo Level Ambiguity:** The prototypes flatten global machine state and repository workspace state into one generic view, blurring the distinct needs of the **Profile View** (global store `~/.agents`, cross-engine reach) and the **Repo View** (workspace mounts, project rules, nested repositories).

---

## 1. Detailed Prototype Analysis

| Prototype File | Key Ideas Explored | Strengths | Feasibility & Design System Blockers |
| :--- | :--- | :--- | :--- |
| **`Master Observability Banner.html`** | Polymorphic banner switching layout and metrics based on active category pill. | High visual appeal; highlights specific insights (e.g. MCP duplicate versions). | Saturated pastel gradients; non-token font sizes (28px); references unbacked data concepts ("Shadow assets"). |
| **`hanger_polymorphic_banners.html`** | Tab-specific KPI grids (Skills by engine, MCP by transport, Rules chains). | Good category-specific metric focus. | Heavy glassmorphism violates Karthik's 2026-08-15 ruling (banners sit flat on `--plane`); hardcodes styling outside `--line` / `--plane`. |
| **`hanger_kitchen_sink_banners.html`** | Multi-row dense telemetry layout with live pulsing green dots, badges, and warnings. | Comprehensive metric exploration. | Extreme cognitive overload; APM-style "pulsing dots" imply background network daemons which Hanger does not run. |
| **`hanger_observability_banners.html`** | Focused 3-column operational layout with version drift alerts and reach bars. | Clean grid structure. | Uses ad-hoc color scales; drift alerts simulate complex multi-file diffing inside the banner. |
| **`hanger_combined_banners.html`** | Unified polymorphic container with smooth view-transitions. | Smooth layout transitions across category selections. | Styling incompatible with Dark Mode tokens; computes counts on the client. |

---

## 2. Validation Against Hanger Architecture & Rules

### A. Design System (`.claude/DESIGN.md`)
* **The Ink & Paper Constraint:** `.claude/DESIGN.md:24-41` specifies that every neutral is a value step (`--page`, `--plane`, `--plane-2`, `--tint`, `--line`, `--ink-1`, `--ink-2`, `--ink-3`). Saturated color is allowed in **only three places**: system states (`--state-success`, `--state-warning`, `--state-danger`), the rail brand mark (`--brand`), and the `GelMeter` progress fill (`--gel-aqua`).
* **Banner Surface Ground:** Per Karthik's ruling on 2026-08-15, hero banners in Hanger sit flat with a border (`border border-line rounded-plane`), not floating glassmorphic gradient bubbles.
* **Typography:** The typographic scale is strictly closed at 5 steps (`text-micro` 11px, `text-small` 12px, `text-base-app` 13px, `text-lg-app` 16px, `text-display` 32px) and 2 weights (normal/medium).

### B. Domain & Positioning Model (`docs/harness.md`, `src-tauri/src/domain.rs`)
* **The 4 Asset Kinds:** Hanger models exactly four asset kinds: `Skill`, `Rule`, `Subagent`, `Tool` (MCP).
* **The 4 Link States:** `Linked` (active symlink/match), `Drifted` (content modified), `Broken` (dangling destination), and `Local` (unlinked local file).
* **Reach Model:** Reach is recomputed on read: (1) Reached through link, (2) Reached in place (shared convention), or (3) Root not linked.
* **Profile Level vs. Repo Level:**
  * **Profile View (`ProfilePane.tsx`):** Displays global inventory across `~/.agents`, `~/.claude`, etc., engine detection status, and global reach.
  * **Repo View (`RepoPane.tsx`):** Displays workspace assets (`<repo>/.claude`, `<repo>/.cursor`), project mounts (`PROJECT_MOUNT_DIRS`), local overrides (`Scope::Local`), and nested repository candidate alerts.

### C. Software Design Philosophy (Ousterhout Principles)
* **Depth of Module:** The banner component should remain *deep* — a compact, clean interface (`total`, `counts`, `scannedAt`, `onFilterState`, `onRescan`, `scope`) that hides layout complexity rather than exposing 15 leaky props.
* **Information Hiding & Low Cognitive Load:** The banner must communicate the health of the harness in **under 3 seconds**. Layering multiple conflicting telemetry boxes creates "change amplification" and high cognitive load.

---

## 3. The New Compliant Prototype: Architecture & Features

To bridge the gap between the prototypes' interactive ambition and Hanger's production rigor, we created **`hanger_v4_compliant_banner_prototype.html`** in `docs/v4-antigravity-prototypes/validation-reports/`.

### Key Enhancements in the Compliant Prototype:
1. **100% Token-Compliant Ink & Paper Palette:** Uses Hanger's exact CSS variables (`--page`, `--plane`, `--plane-2`, `--line`, `--ink-1`, `--ink-2`, `--ink-3`, `--brand`, `--gel-aqua`, `--state-warning`, `--state-danger`).
2. **Light / Dark Mode Native Toggle:** Uses Hanger's `.dark` class toggle system to verify contrast and styling across both modes.
3. **Dedicated Profile-Level and Repo-Level Modes:**
   - **Profile Level:** Shows total global assets, `GelMeter` link health distribution, engine reach summary (11 engines detected/reachable), and MCP probe freshness.
   - **Repo Level:** Shows repository assets, project-to-store mount status, local rule chains, and nested repository candidate disclosures.
4. **Interactive State Filtering & Rescan:** Directly mirrors `SummaryStrip.tsx` and `GelMeter.tsx` behaviors, allowing interactive filtering by `linked`, `drifted`, `broken`, and `local`.
5. **Zero Classitis & Zero Leakage:** Built as a clean, unified surface matching macOS HIG guidelines and Hanger's AST test gates.
