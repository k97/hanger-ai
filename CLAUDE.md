# CLAUDE.md

Hanger is an interface for the agent harness: it inventories, monitors and
deploys harness assets — four kinds, no more — across the engines that keep
directories of their own (`agents.rs` → `AGENT_CONFIGS`) and the MCP hosts
that declare servers (`mcp/registry.rs` → `HOSTS`). It scans the directories
those engines read from, records what it finds in a local SQLite store, and
shows which engines reach each asset and through which path, and whether it
still matches its source. React 19 + TypeScript in a Tauri 2 webview, Rust
backend, SQLite via bundled `rusqlite`, Tailwind v4 semantic tokens, Vitest.

[docs/harness.md](docs/harness.md) is the model the code is built on — the
harness has conventions and no interface, ownership is exclusive and reach is
not. Read it before changing `agents.rs`, `annotations.rs`, or anything that
draws the Reach column. There is no router: views switch on one string state,
`selectedSidebarItem` in `src/App.tsx`, persisted as the
`selected_sidebar_item` preference.

## Commands

Bun is the package manager, pinned at `bun@1.3.14`. The Bash tool's shell does
not source the login profile: invoke it as `~/.bun/bin/bun` or export `PATH`
first.

- `bun run tauri dev` — full app. The Vite port is pinned at 8397 with
  `strictPort` (`vite.config.ts`) because Tauri loads it by absolute URL
  (`src-tauri/tauri.conf.json`); a floating port breaks `tauri dev`.
- `cargo sweep --time 30` / `cargo clean`, from `src-tauri/` — Cargo never
  collects `target/`; it reached 94 GiB. `docs/setup.md` → Build artifact
  hygiene.

## Rules

- [Coding guardrails](.claude/rules/coding-guardrails.md) — think before
  coding, simplest thing, surgical diffs, goal-driven. Always on.
- [Verification](.claude/rules/verification.md) — what counts as evidence and
  what never does, human-gated steps, checkpoints and reporting, scope, exit.
  Read it before reporting any work as done.
- [Invariants](.claude/rules/invariants.md) — what a change can break without
  a test obviously failing: bundle id, crate name, backend-owned counts,
  read-time link state, `user_version` migrations, tokens-only styling, no
  blocking dialogs, reaping off by default.
- [Shared checkout](.claude/rules/shared-checkout.md) — other sessions commit
  to this branch: authorship, stale greens, staging by hunk, and the git
  defaults that aim at their work.
- [UI copy](.claude/rules/ui-copy.md) — labels get a naming brief, every
  string gets a `/humanizer` pass, empty states are findings.
- [Verifying UI](.claude/rules/verifying-ui.md) — taking a screenshot of the
  dev app that tells the truth.
- [Releasing](.claude/rules/releasing.md) — tag triggers, the four version
  files, the updater's semver and key checks, never `--tags`.
- [Shared asset machinery](.claude/rules/shared-asset-machinery.md) — the
  four kinds share directories, dedup sets, roots and counting; check the
  other three before changing one, and prove it with per-kind counts.
- [Known debt](.claude/rules/known-debt.md) — open items to know before
  touching counting, scan warnings, or diagnostics UI; the DisclosureBanner
  rule.
- [Tauri opener](.claude/rules/tauri-opener.md) — `openPath`'s two silent
  failures: the capability refuses a named app unless it is allowlisted, and
  the existence check is skipped once one is.
- [The README](.claude/rules/readme.md) — the front door's fixed section set,
  its generated figures, and the clauses in it that nothing enforces.
- [Documentation](.claude/rules/documentation.md) — what `docs/` holds, which
  subdirectories are local-only, and why `to-be-reviewed/` is not a spec.
- [Design system](.claude/DESIGN.md) — derived from code with every statement
  cited, and a "Not implemented" section for what the code does not yet do.
- [UI primitives](.claude/rules/ui-primitives.md) — shadcn tooling, the
  MessageScroller item/spacer contract, and the local `cn`.

Queued work with a defined finish line lives in [docs/TODO.md](docs/TODO.md);
deferred work and unruled questions in [docs/roadmap.md](docs/roadmap.md).

## Gates

Run the `stage-gate` skill at each boundary, even when the work looks finished — dispatch a fresh reviewer, do not gate your own work: plan written → `--plan`, code written before push → `--dev`, merged → `--release`.

Gate commits: auto

## Verification

These four are the pinned gates. Run exactly these, from the repo root; a
figure from any other invocation is not a gate result:

- `npx vitest run` — the full frontend suite. From the repo root: run from
  `src-tauri/` it resolves no test files and exits 1 having tested nothing,
  and the Bash tool's working directory persists between calls. `bun run
  vitest` is not the gate.
- `cargo test` — from `src-tauri/`.
- `bunx tsc --noEmit` — report the exit code.
- `gitleaks detect --source .` and
  `gitleaks detect --source . --no-git -c .gitleaks.toml` — both from the
  repo root; the root `.gitleaks.toml` carries the allowlist.

A gate result is valid only for the tree at the moment it ran (Shared
checkout).
