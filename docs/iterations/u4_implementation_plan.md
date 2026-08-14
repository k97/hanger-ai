# Implementation Plan — Iteration U4: Onboarding Reconciliation + Polish

This iteration focuses on aligning the onboarding flow to a profile-first experience, relocating macOS TCC scan permissions warnings into contextual repository flows, sweeping empty states for a 5-category taxonomy, and validating the full user journey under both fresh and migration states.

---

## 1. User Review Required

> [!IMPORTANT]
> **Onboarding Flow Shift**
> Onboarding Step 3 (Link first directory wizard screen) is removed completely. Submission of Telemetry Consent (Step 2) now marks onboarding as complete, immediately launches the background profile scan, and transitions the user directly to the **Global User Profile** view with an invite to add their first repository.

> [!NOTE]
> **Contextual TCC Warning Relocation**
> The macOS folder access warning ("TCC Fix Panel") from R1 is moved directly into `RepoPane`. If a repository scan encounters `Permission denied` warnings, the warning panel will display at the top of that specific repository view with a **Retry Scan** CTA.

---

## 2. Proposed Changes

### Component 1: Onboarding Flow (`src/App.tsx`)

#### [MODIFY] [App.tsx](file://~/Projects/demo/hanger-ai/src/App.tsx)
- **Onboarding Complete Action**: Update Step 2's submission handler to mark onboarding as complete:
  - Invoke `set_preference("onboarding_complete", "true")`.
  - Set `onboardingComplete = true`.
  - Trigger `triggerScan()` immediately so global agent assets scan and populate on load.
  - Set `selectedSidebarItem = "profile"`.
- **Remove Onboarding Step 3**: Delete the `onboardingStep === 3` JSX wizard step.
- **Migration Safeguard**: Ensure that `initializeApp` checks the persistent preference database first, so existing users who completed onboarding never see the welcome screens again.

---

### Component 2: TCC Access Warnings relocation

#### [MODIFY] [RepoPane.tsx](file://~/Projects/demo/hanger-ai/src/components/RepoPane.tsx)
- **Contextual TCC Detection**: Extract from `projectScan.parse_warnings` if there are warnings containing `"Permission denied"`.
- **Contextual TCC Panel**: If a permission error is detected, display a prominent notice at the top of the repository content:
  - **Heading**: *"macOS Folder Scan Access Denied"* (using Australian spelling)
  - **Description**: *"To proceed, grant Hanger permission to access this folder. Open System Settings → Privacy & Security → Files & Folders (or Full Disk Access), check Hanger, and then retry the scan."*
  - **Button**: Pill-shaped *"Retry Scan"* (invokes `onRefresh` with a loading spinner).
- **Mute Standard Warning List**: Filter out matching `"Permission denied"` strings from the bottom warnings list so the warning is not redundant.

---

### Component 3: Sweep Empty States (5-Category World)

We will sweep and polish all empty states to support the five asset categories: `Skills`, `Agents`, `Tools`, `Rules`, and `Subagents`. All copy will adopt Australian English spelling (`initialise`, `categorised`).

#### [MODIFY] [ProfilePane.tsx](file://~/Projects/demo/hanger-ai/src/components/ProfilePane.tsx)
- **Global Profile Empty State**: (If `agents.length === 0`)
  - *"No developer agent folders detected. Hanger scans global configurations residing across ~/.claude, ~/.gemini, and ~/.codex. Run your agent command-lines to initialise them."*
- **Category-specific Empty State**: (If a category card is active but has 0 items)
  - *"No global {category} found in ~/.claude, ~/.gemini, or ~/.codex."*

#### [MODIFY] [Sidebar.tsx](file://~/Projects/demo/hanger-ai/src/components/Sidebar.tsx)
- **Empty Repositories Sidebar list**: (If `linkedRepos.length === 0`)
  - *"No repositories linked. Link a project folder to manage and deploy assets."*
  - Render an "Add Repo" shortcut.

#### [MODIFY] [RepoPane.tsx](file://~/Projects/demo/hanger-ai/src/components/RepoPane.tsx)
- **Repo Empty State**: (If `totalCount === 0`)
  - *"No AI assets found in this repository. This folder contains no agent profiles, skills, tools, rules, or subagents."*
  - Render the "Link an asset from Profile" CTA button.
- **Category-specific Empty State**: (If a category card is active but has 0 items in the repo)
  - *"No project-level {category} found in this repository."*

---

## 3. Verification Plan

### Automated Tests
- Write a frontend test `src/components/OnboardingReconciliation.test.tsx` checking:
  - Step 2 submission correctly triggers onboarding completion, defaults selected view to `"profile"`, and skips Step 3.
  - Existing profiles with `onboarding_complete` set to `true` skip welcome steps entirely.
- Write a frontend test `src/components/TccRelocation.test.tsx` verifying:
  - Contextual macOS TCC panel renders at the top of `RepoPane` when a `Permission denied` warning exists in the scan warnings.
  - Standard warnings list does not render redundant permission warnings.
- Run all quality gates:
  - `cd src-tauri && cargo test`
  - `cd src-tauri && cargo clippy -- -D warnings`
  - `pnpm typecheck`
  - `pnpm vitest run`

### Manual Verification
The following two walkthrough scenarios will be documented as **PENDING USER VERIFICATION** in `walkthrough.md` for the closing pass:

#### Scenario A: Fresh Launch Journey
1. Clear Hanger preferences/sqlite database to simulate cold-start.
2. Launch Hanger: welcome page appears.
3. Advance to Telemetry page, accept/toggle options, and click **Continue**:
   - Verify app immediately loads the **Global User Profile** screen.
   - Verify scan starts automatically and lists global assets.
   - Verify sidebar lists "No repositories linked" with an add button.
4. Click **Add repository...**, select a restricted directory (e.g. mock a directory that triggers permission warning or reject permission):
   - Verify the **macOS Folder Scan Access Denied** panel is rendered.
   - Click **Retry Scan** and verify reloading indicator.

#### Scenario B: Migration Journey
1. Launch Hanger on a profile where `onboarding_complete` is already `true`.
2. Verify that the welcome wizard is completely skipped and the app loads directly into the main application.
