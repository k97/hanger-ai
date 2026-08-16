<!-- Archived 2026-08-16. This was the root AGENTS.md; its content now lives in .claude/rules/verification.md, coding-guardrails.md, known-debt.md and CLAUDE.md. Kept verbatim for the record. -->

# AGENTS.md

## Standing Instructions
- **Package manager:** Bun. This project uses bun, never npm/pnpm/yarn. The harness shell does not source the login profile, so invoke it as ~/.bun/bin/bun or export PATH first.
- **Destructive Git Operations:** Any destructive git operation — reset --hard, checkout of a different base, force push, branch delete — is reported in the checkpoint that follows it, always.
- **Production Source Changes:** Production source changes are never staged in a commit prefixed test() or docs(), and never omitted from the checkpoint report. Any file under src-tauri/src/ that changes gets its own red/green cycle and its own diff in the report.
- **Enforcement File Edits:** Any edit to a test, detector or allowlist forced by another change is reported in the checkpoint with its cause and committed separately from the change that forced it. An unreported enforcement-file edit fails the task even if correct.
- A guard, detector or allowlist change is unverified until a planted violation outside its scope is shown to still fail. Green alone proves nothing.
- Numeric exit criteria are run in the dispatch that reports them. A figure copied from a previous log is fabricated evidence.
- A control that fails to fire is a finding about the detector and is reported. Replacing it with a control that fires, without disclosure, is fabricated evidence.
- **Specs Describe Intent:** Specifications and briefs describe intent, not implemented behaviour. Reconcile them against the code before acting. Where they disagree, the code is the fact and the disagreement is the report.



---

## Precedence

This repository runs Superpowers. Superpowers owns **method** — how work gets planned, tested, debugged and reviewed. Follow it.

This file owns **verification** — what counts as proof that work is done. Where the two disagree on whether something has been demonstrated, this file wins. Superpowers does not know this project's history and cannot be expected to.

If a Superpowers skill would have you declare a phase complete on evidence this file disallows, stop and report the conflict. Do not resolve it yourself.

---

## Test gates (pinned)

The gate commands, exactly as written, run from the repo root:

- Frontend: `npx vitest run` — the full suite, no filters, no exclusions. `bun run vitest` is NOT the gate; it aborts at CWD resolution without include scoping.
- Rust: `cargo test` from `src-tauri/`.
- Typecheck: `bunx tsc --noEmit` — report the exit code.
- Secrets: `gitleaks detect --source .` AND `gitleaks detect --source . --no-git -c .gitleaks.toml`, both from the repo root (the root `.gitleaks.toml` carries the allowlist; running from a subdirectory loses it and reports allowlisted findings as leaks).

A figure quoted from any other invocation is not a gate result.

## What counts as evidence

Ranked. Use the highest available.

1. A test that failed, then passed, with both runs committed.
2. Command output pasted verbatim, including the command and its exit code.
3. A file diff.
4. A screenshot taken from a running build.

Nothing else is evidence.

## What is never evidence

- **Any generated or synthesised image.** Screenshots come from a real running build or they do not exist. If you cannot run the build, say so.
- A description of a test rather than its output.
- A test written after the implementation and passing on first run. Red first, or it did not verify anything.
- A summary asserting a criterion is met without the artefact that shows it.
- A sign-off, checkmark, or completion marker you produced yourself.
- Prior conversation history. Context resets between sessions; a claim that something was done earlier is not proof it was done.
- A described UI outcome with no screenshot from a running build is fabricated evidence, regardless of whether backend tests pass. "Build succeeds" is not "the UI shows X".
- Stacking fixes on top of a diverged tree: when a verified baseline works and later changes break it, revert to the baseline before patching forward.
- A control proves only the artefact it ran against. A guard config validated on a scratch branch and re-authored on trunk is unproven.

## Backend-only work

When a task changes no meaningful UI, **no screenshot is acceptable evidence for its exit criteria.** If such a checkpoint contains an image, the checkpoint is rejected without review.

---

## Checkpoints

- Stop after each numbered section of the loop brief's Scope. Report, then wait.
- Do not chain sections. Do not begin section 3 because section 2 went smoothly.
- A checkpoint report contains: what was built, the evidence per §*What counts as evidence*, what is left, and anything encountered that contradicts the brief.
- Report blockers immediately rather than routing around them. A brief that turns out to be wrong is useful information; a workaround that hides it is not.

## Scope discipline

- The brief's "Out of scope" list is binding. Raise a blocker rather than building something on it, even when it is a two-line change and obviously needed.
- Decisions listed as locked in the brief are locked. Raise a blocker if implementation contradicts one; do not silently pick a different approach.
- Do not delete or weaken a test to make a build pass.

## Technical Debt

- `project_footprints` (Agent type, 8 files across frontend/tests) retains retired vocabulary. Rename to `project_paths` (or drop with the Agent type) the next time that pane area is reworked. Not user-visible.
- The frontend renders counts. It never computes them. A count is produced by a count command and rendered as received. `.length` on a filtered array, a `reduce` over inventory, or any sum of category arrays is a counting implementation and is forbidden. Counts come from `get_asset_counts`.
- 16 counting sites are enumerated in `docs/diagnostics/count-paths.md`. Consolidating them precedes building any new counting surface.
- Open question: `get_inventory` omits rows with `parse_status = 'failed'`; `get_asset_counts` includes them. The two must agree. Provisional decision: failed assets ARE assets and must be surfaced.
- Unverified claim from the count-paths diagnostic: a 1-asset delta attributed to "client-side deduplication in RepoPane.tsx" with no line quoted. Unproven. Resolve alongside the counting-site consolidation.
- Scan warnings panel shows 10 warnings for a root with 9 failed rows. A warning from another scope is leaking into a project-scoped panel.
- Non-blocking diagnostics use DisclosureBanner. Do not build a new banner, alert, or modal for warnings, parse errors, or status notices. See `.claude/DESIGN.md`.
- When a production change causes an existing test to fail, STOP and report the failure. Do not edit the test, and never edit a detector, matcher, or guard to make a violation invisible. Exceptions go in an explicit allowlist with a stated reason. Karthik decides whether the test or the change is wrong.

## Exit

A loop is complete when every exit criterion has evidence attached, in order, in one report. Partial completion is reported as partial. Do not round up.
