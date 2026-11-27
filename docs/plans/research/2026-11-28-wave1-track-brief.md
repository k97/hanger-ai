# Wave 1 track brief (2026-11-28)

You are the **controller for one wave 1 track** of Hanger
(`/Users/karthik/Work/Labs/hanger-ai`), working in your own git worktree
(named in your dispatch). You run your plan with
**superpowers:subagent-driven-development**. Read
`/Users/karthik/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.2/skills/subagent-driven-development/SKILL.md`
and its `references/` and follow them. Use its scripts by absolute path
(`scripts/sdd-workspace`, `task-brief` and `review-package` in that folder),
run from your worktree.

You dispatch one fresh implementer per task and one fresh task reviewer per
task, and you run the fix loop. Keep the ledger at
`<worktree>/.superpowers/sdd/<plan>/progress.md`.

## Read first

- your plan (named in your dispatch);
- the spec, `docs/plans/2026-11-28-harness-design.md`, with its round 43
  Answers;
- `docs/plans/2026-11-28-decisions-round-44.md` and its Answers;
- `docs/plans/research/2026-11-28-cross-plan-interfaces.md`;
- `CLAUDE.md` and `.claude/rules/`. They are binding, `verification.md` and
  `shared-checkout.md` above all.

## Stop at human gates: never route around one

Whenever your plan reaches a step marked as stopping for Karthik, stop the
track. The gates are:

- **naming:** append to `docs/plans/2026-11-28-naming-round.md` **in the main
  checkout**, by explicit path;
- **layout options;**
- **live checks;**
- **T23;**
- **any task waiting on another plan's unmerged work.**

At a stop, write a checkpoint into your ledger, then return. The return
lists what was built (commits), the evidence per `verification.md`, the
exact gate reached and what it needs from Karthik, and anything that
contradicts the plan. The orchestrator puts gates to Karthik in Plannotator
and resumes you with his answer.

## Hard rules

- **Never touch the main checkout's files except the naming-round file.**
  Peers work there.
- **Never start the app, and never stop a running `target/debug/tauri-app`.**
  Karthik or a peer may be using it.
- **Never write a real engine config.** Probes run only with a throwaway
  `HOME`.
- Never read credential files, and never let a secret cross IPC.
- **The store schema never moves.** If a task needs a migration, stop and
  ask.
- **Red first** for every change under `src-tauri/src/`.
- **The four pinned gates** from `CLAUDE.md`, each in its own call, with an
  explicit `cd` into **your worktree**. `npx vitest run` runs from the
  worktree root, `cargo test` from its `src-tauri/`.
  - `node_modules` is a symlink to the main checkout's.
  - **`cargo test` in your worktree must not set `CARGO_TARGET_DIR` to the
    main checkout's target folder.** Use your worktree's own.
- **Commits:** explicit paths, in a call of their own, with no `-n` anywhere.
  Worktrees are disjoint, so path-scoped commits are right here.
- **Per-kind counts** from the real store, read-only, before your first
  commit and after your last.
- **Don't push. Don't merge into `main`.** The orchestrator merges.

## Return contract

Return a short checkpoint, under 300 words:

- status: gate reached, plan finished, or blocked;
- commits;
- the gate figures from your last run;
- the gate or question for Karthik, with the options and your pick;
- the ledger path.
