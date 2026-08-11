# Project-Scoped Rules

## Verification integrity
Generated images must NEVER be used as verification evidence; if a capture cannot be produced, say so explicitly and stop — never substitute.
A checkpoint with any verification item marked INCOMPLETE must not be merged. Incomplete verification blocks merge until a human explicitly accepts the gap in writing.
Browser-mock shims must never be added to application code. UI verification occurs only in the real Tauri window. If the browser agent cannot drive the Tauri app, verification is handed to the human — never simulated in a mocked web build.
Steps gated on human action (verification, confirmation, approval) must never be narrated as completed unless the human's result is present in the conversation. Restoring and removing a verification mechanism without the human's confirmation in between is a false completion claim — the most serious protocol violation, identical in kind to fabricated evidence.
When a task names an external reference (design spec, API doc, standard), the reference must be fetched and cited in the plan before implementation. Building from memory of a named reference is a verification-integrity violation.
Self-instrumentation and reading your own runtime logs is permitted and encouraged for DIAGNOSIS. Final VERIFICATION of user-facing behaviour remains human-gated as before.
- User confirmation applies ONLY to the specific items the user explicitly named. Extending a partial confirmation to unnamed checklist items is fabrication of human sign-off — the same violation class as fabricated evidence.
- GUI automation against the REAL application window (via macOS accessibility/MCP tooling) with corroborating state evidence (database reads, file checks) is valid verification evidence. However: closing an iteration still requires explicit human ratification in the conversation. Automation may EXECUTE verification; only the human may DECLARE it closed. Marking walkthroughs complete or merging on self-executed verification without ratification is a gate violation.
- A described UI outcome with no screenshot from a running build is fabricated evidence, regardless of whether backend tests pass. "Build succeeds" is not "the UI shows X".
- Stacking fixes on top of a diverged tree: when a verified baseline works and later changes break it, revert to the baseline before patching forward. Do not stack fixes on a tree that has diverged from a known-good state.

## Technical Debt
- `project_footprints` (Agent type, 8 files across frontend/tests) retains pre-Loop-V vocabulary. Rename to `project_paths` (or drop with the Agent type) during Loop W's pane rework. Not user-visible.
- The frontend must never compute an asset count. A count is produced by a count command and rendered. `.length` on a filtered array is a counting implementation and is forbidden.
- 16 counting sites are enumerated in `diagnostics/count-paths.md`. Consolidating them is Cockpit section 1, before any rail is drawn.
- Open question for Cockpit: `get_inventory` omits rows with `parse_status = 'failed'`; `get_asset_counts` includes them. The two must agree. Provisional decision: failed assets ARE assets and must be surfaced, per the Broken row state in `LOOP_W_shell.md`.
- Unverified claim from the count-paths diagnostic: a 1-asset delta attributed to "client-side deduplication in RepoPane.tsx" with no line quoted. Unproven. Resolve in Cockpit.
- Scan warnings panel shows 10 warnings for a root with 9 failed rows. A warning from another scope is leaking into a project-scoped panel.
- The frontend renders counts. It never computes them. `.length` on a filtered array, a `reduce` over inventory, or any sum of category arrays is a counting implementation and is forbidden. Counts come from get_asset_counts and are rendered as received.
- Non-blocking diagnostics use DisclosureBanner. Do not build a new banner, alert, or modal for warnings, parse errors, or status notices. See DESIGN.md.
- When a production change causes an existing test to fail, STOP and report the failure. Do not edit the test, and never edit a detector, matcher, or guard to make a violation invisible. Exceptions go in an explicit allowlist with a stated reason. Karthik decides whether the test or the change is wrong.


## Standing Instructions

Standing instructions for all agents working in this workspace. Read before starting any task. Context resets between sessions — this file and `.agents/skills/` are the only persistent memory. If a decision here conflicts with your instinct, this file wins.

### What we are building

Hanger: a local-first Tauri desktop app that scans a developer's machine, inventories AI-agent assets across nine categories (Skills, Agents, Tools, Rules, Memory, Subagents, Hooks, Permissions, Plugins), and deploys assets between projects via symlink or tracked copy. Full context lives in `PRD.md` and `Hanger_Validation_Report.md` at the repo root — the report supersedes the PRD wherever they conflict.

### Current phase

We are building **v1 only**: Skills, Agents, Tools, Rules categories; My Machine / Discovery two-segment navigation; scan + constellation + drill-down; symlink/hard-copy deploys; Rules per-section diff with per-project target memory; Tier 5 preferences store with crash sanitisation and local export/import. Do NOT build Subagent/Hook gating, Permissions audit, Plugin installs, or Discovery review pipelines — those are v1.1+. If a task appears to require them, stop and flag it.

### Stack and conventions

- **Frontend:** React + Vite + TypeScript (strict mode). No JavaScript files. Tailwind CSS.
- **Backend:** Rust, Tauri 2.x. Tokio for async. Never block the IPC bridge.
- **Language:** All user-facing copy and code comments in Australian English (colour, behaviour, formalise, artefact).
- **Package manager:** Bun. This project uses bun, never npm/pnpm/yarn. The harness shell does not source the login profile, so invoke it as ~/.bun/bin/bun or export PATH first.
- **Destructive Git Operations:** Any destructive git operation — reset --hard, checkout of a different base, force push, branch delete — is reported in the checkpoint that follows it, always.
- **Production Source Changes:** Production source changes are never staged in a commit prefixed test() or docs(), and never omitted from the checkpoint report. Any file under src-tauri/src/ that changes gets its own red/green cycle and its own diff in the report.
- **Enforcement File Edits:** Any edit to a test, detector or allowlist forced by another change is reported in the checkpoint with its cause and committed separately from the change that forced it. An unreported enforcement-file edit fails the task even if correct.

### Design system — non-negotiable

- All colours come from CSS custom properties (`--surface`, `--surface-elevated`, `--ink-1`, `--ink-2`, `--ink-3`, `--accent`, `--hairline`, `--scrim`). **Never hardcode a hex value in a component.** The token definitions live in `src/styles/tokens.css` with `:root` (light) and `.dark` (inverted) blocks.
- Light theme derives from the Bluesky DESIGN.md (`design/DESIGN.md` in this repo). Dark theme uses the same structural logic, inverted. Both must work from day one — every component is built and verified in both.
- One typeface: InterVariable, weights 400–700. Hierarchy through size and weight only. No second font family, ever.
- Shape rules: pills (`border-radius: 9999px`) for all buttons, controls, and badges. Bubbles (circles) only for data-viz nodes (projects, agent roots). Cards at 12px radius, modals at 21px.
- One saturated accent per screen, on the primary action only. Everything else is the ink ladder.
- Category identity is expressed through icon glyphs (lucide-react), never colour-coding.

### Filesystem safety — non-negotiable

- Every config-file write goes through the transactional sequence: backup to `.hanger/backups/[timestamp]_filename.bak` → write to temp buffer → validate syntax → atomic replace. No agent writes a scanned config file directly. See `.agents/skills/transactional-writes/`.
- Scanning respects `.gitignore` (use the `ignore` crate). Never descend into `node_modules` or `.git`.
- Never read, copy, log, or transmit the contents of `.env` files or anything resembling a credential. Hanger detects missing env keys by name only.
- The Tier 5 store contains user paths and decisions. Nothing from it may appear in any log line, error message, or telemetry payload. Error types wrap paths behind a `Sanitised` display impl.

### Definition of done

- `cargo test` and `cargo clippy -- -D warnings` pass.
- `pnpm typecheck` and `pnpm vitest run` pass.
- UI changes verified in the browser in both light and dark themes; attach the walkthrough artefact.
- New Tauri commands documented in IPC specs with their payload shapes.
- No new dependency without a one-line justification in the PR description.

### Working style

- Prefer small, reviewable diffs over sweeping refactors. One concern per PR.
- Plan first on any multi-file task; surface the implementation plan artefact before writing code.
- When the PRD and the validation report disagree, the report wins. When the report is silent, ask — do not invent scope.
- Every task branch is cut from up-to-date main, never from another feature branch. One branch, one PR, one iteration.
- Every iteration begins with a PLAN artefact and an explicit stop for approval before any code is written. Skipping the plan gate is a protocol violation.
- The macOS MCP server may be used for verification and diagnosis of Hanger itself. It must never be used to interact with unrelated applications beyond window focus management, and quitting or killing the user's other applications requires asking first.

