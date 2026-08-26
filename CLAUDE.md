# CLAUDE.md

Hanger is an interface for the agent harness: it inventories, monitors and
deploys harness assets — four kinds, no more
(`src-tauri/src/domain.rs:323-326`) — across eleven engines with directories
of their own (`src-tauri/src/agents.rs:69`) and sixteen MCP hosts
(`src-tauri/src/mcp/registry.rs:91`). It scans the directories those engines
read from, records what it finds in a local SQLite store, and shows which
engines reach each asset and through which path, and whether it still matches
its source. React 19 + TypeScript in a Tauri 2 webview, Rust backend, SQLite
via bundled `rusqlite`, Tailwind v4 semantic tokens, Vitest (`package.json`,
`src-tauri/Cargo.toml`).

`docs/harness.md` is the model the code is built on — the harness has
conventions and no interface, ownership is exclusive and reach is not. Read
it before changing `agents.rs`, `annotations.rs`, or anything that draws the
Reach column.

Two places own their own domains:

- **`.claude/rules/`** — the rules, linked below. `verification.md` is what
  counts as proof; read it before reporting any work as done.
- **`.claude/DESIGN.md`** — the design system, derived from code with every
  statement cited, and a "Not implemented" section for what the code does not
  yet do.

## Commands

Bun is the package manager, pinned at `bun@1.3.14`. The Bash tool's shell does
not source the login profile: invoke it as `~/.bun/bin/bun` or export `PATH`
first.

- `bun run tauri dev` — full app. The Vite port is pinned at 8397 with
  `strictPort` (`vite.config.ts`) because Tauri loads it by absolute URL
  (`src-tauri/tauri.conf.json`); a floating port breaks `tauri dev`.
- `bun run build` / `bun run tauri build` — `tsc && vite build` / bundled .app.

There is no router: views switch on one string state, `selectedSidebarItem`
in `src/App.tsx`, persisted as the `selected_sidebar_item` preference.

## Rules

- [Coding guardrails](.claude/rules/coding-guardrails.md) — think before
  coding, simplest thing, surgical diffs, goal-driven. Always on.
- [Verification](.claude/rules/verification.md) — what counts as evidence and
  what never does, human-gated steps, checkpoints and reporting, scope, exit.
- [Invariants](.claude/rules/invariants.md) — what a change can break without
  a test obviously failing: bundle id, crate name, backend-owned counts,
  read-time link state, `user_version` migrations, tokens-only styling, no
  blocking dialogs, reaping off by default.
- [Shared checkout](.claude/rules/shared-checkout.md) — other sessions commit
  to this branch: authorship, stale greens, staging by hunk.
- [UI copy](.claude/rules/ui-copy.md) — labels get a naming brief, every
  string gets a `/humanizer` pass, empty states are findings.
- [Verifying UI](.claude/rules/verifying-ui.md) — taking a screenshot of the
  dev app that tells the truth.
- [Releasing](.claude/rules/releasing.md) — tag triggers, the four version
  files, the updater's semver and key checks, never `--tags`.
- [Known debt](.claude/rules/known-debt.md) — open items to know before
  touching counting, scan warnings, or diagnostics UI; the DisclosureBanner
  rule.

Queued work with a defined finish line lives in [docs/TODO.md](docs/TODO.md).
T1 was blocked on the concurrent sessions, which have now ended.

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

## Documentation

`docs/` is tracked except for four local-only subdirectories in `.gitignore`
(`to-be-reviewed/`, `superpowers/`, `evidence/`, `references/`).
`docs/to-be-reviewed/` is a holding pen, not a specification — several files
there assert behaviour the code does not implement; check the code first.
`docs/harness.md` is the conceptual model; `docs/findings.md` records defects
deliberately left unfixed, with evidence; `docs/roadmap.md`, deferred work.

## Gaps

Not established, left out rather than guessed: whether Windows or Linux builds
are intended (`tauri.conf.json` sets `"targets": "all"`, the README says macOS
only). Resolved 2026-08-26: `ci.yml` runs all four gates on every push and PR;
the release process is verified and lives in
[Releasing](.claude/rules/releasing.md).
