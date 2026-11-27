# Plan brief, shared by the eight plan writers (2026-11-28)

You are one of eight writers producing implementation plans in parallel for
Hanger (`/Users/karthik/Work/Labs/hanger-ai`, a Tauri 2 + React 19 + Rust
macOS app). **You write one plan and change no code.**

## Read first, in this order

1. `/Users/karthik/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.2/skills/writing-plans/SKILL.md`.
   This is the plan format and method, and you follow it exactly. There are
   two exceptions. The plan goes in `docs/plans/` (the repo rule), not
   `docs/superpowers/`. And the execution handoff is already decided: plans
   run through superpowers:subagent-driven-development, so leave that section
   out.
2. `docs/plans/2026-11-28-harness-design.md`: **the spec.** Your piece's
   section in §4, the owner table in §5, the waves and gates in §7, and the
   **binding "Answers (Karthik, 2026-11-28, round 43)"** at the end. Where an
   answer and the body disagree, the answer wins.
3. Your piece's research file in `docs/plans/research/` (named in your
   dispatch).
4. `CLAUDE.md` and `.claude/rules/`, at least `coding-guardrails.md`,
   `verification.md`, `invariants.md`, `shared-asset-machinery.md`,
   `ui-copy.md`, `shared-checkout.md` and `verifying-ui.md`. The four pinned
   gates are in `CLAUDE.md` → Verification.

## Rules for every plan

- **Code facts come from the code on `main`.** Cite symbols, not line
  numbers. Every count you state comes from a grep you ran. Where the design
  or the research disagrees with the code, the code is the fact, and the plan
  says so.
- **Red first** for every change under `src-tauri/src/`. Name the test, give
  its assertions with real values, and give the exact command and the output
  that means it failed.
- **Human gates as tasks.** Write each gate the design names as its own
  explicit step, marked as stopping for Karthik:
  - naming briefs (a new label gets a researched brief and his sign-off;
    every string gets a `/humanizer` pass);
  - layout options at true width before any new UI;
  - live checks verified by their artefact (a file diff, a receipt, a store
    read, a screenshot), never by an answer;
  - T23, asked again in Plannotator before any model output is shown on
    screen.
- **Shared machinery:** respect the owner table in design §5.
  - **If your piece owns something,** your plan's first task lands that
    interface and states it exactly: names, types, file. Other plans build
    on it.
  - **If you consume something,** write a "Cross-plan interfaces" section
    listing every name and type you assume from another plan, with which plan
    owns it. Don't define it yourself. If it doesn't exist yet, mark the task
    as waiting on that plan.
- **Per-kind counts.** Capture them before your first commit and after your
  last, from the real store, read-only.
- **The store schema never moves.** If the plan needs a migration, stop and
  ask instead.
- **Secrets never cross IPC or reach a model.** Never read credential files.
  Probes run only with a throwaway `HOME`.
- **Commit steps** commit with explicit paths, in their own call, with no
  `-n` anywhere.
- **Proportion:** the plan holds decisions, not code bodies.

## Output

Write `docs/plans/2026-11-28-<slug>-plan.md`, using the header format from
the skill. **Spec:** `docs/plans/2026-11-28-harness-design.md`. Then add a
section listing each human gate and where it sits. Run the skill's
self-review and fix what it finds.

Don't commit, and don't edit any file but your plan. Return **only** the
path, the task count, the human gates in one line, and the cross-plan
interfaces you assume, in one line each.
