# CLAUDE.md

Orientation: what this project is and how it is built.

Two other files own their own domains, and this one does not repeat them:

- **`AGENTS.md`** — verification. What counts as proof, the pinned gate
  commands, checkpoints, scope discipline. Read it before reporting any work
  as done.
- **`.claude/DESIGN.md`** — the design system, derived from code with every
  statement cited. Colour, type, spacing, motion, the component inventory, and
  a "Not implemented" section recording what the code does not yet do.

## What Hanger is

A local-first macOS desktop app that inventories, monitors, and deploys AI
agent assets — skills, rules, subagents, MCP tools — across Claude Code,
Codex, and Gemini CLI (`src-tauri/Cargo.toml:4`, `README.md:3`). It scans the
directories those engines read from, records what it finds in a local SQLite
store, and shows where each asset is deployed and whether it still matches its
source.

macOS only, shipped as a universal binary for Apple silicon and Intel
(`README.md:9-10`).

## Stack

React 19 + TypeScript 5.6 in a Tauri 2 webview, Rust backend, SQLite via
bundled `rusqlite`, Tailwind v4, Vite 6, Vitest 2 (`package.json:14-40`).
Bun is the package manager, pinned at `bun@1.3.14` (`package.json:5`).

The harness shell does not source the login profile, so invoke Bun as
`~/.bun/bin/bun` or export `PATH` first (`AGENTS.md`, Standing Instructions).

## Run, build, test

```bash
bun run tauri dev      # full app: Rust backend + webview
bun run dev            # frontend only, Vite on :8397
bun run build          # tsc && vite build
bun run tauri build    # bundled .app / .dmg
```

The dev port is fixed at 8397 with `strictPort: true` (`vite.config.ts:19-21`),
because Tauri loads it by absolute URL (`src-tauri/tauri.conf.json:9`); a
floating port would break `tauri dev`. Build hooks are at
`src-tauri/tauri.conf.json:7-11`.

The gate commands are pinned in `AGENTS.md` — use those exact invocations, not
these. Two traps worth knowing before you run them:

- `npx vitest run` must run from the **repo root**. Run it from `src-tauri/`
  and it resolves no test files and exits 1 having tested nothing. The Bash
  tool's working directory persists between calls, so a previous `cd` into
  `src-tauri/` will silently cause this.
- `bun run vitest` is not the gate and is not equivalent.

Suite sizes as of this writing: 11 Rust integration test files
(`src-tauri/tests/`), 47 frontend test files.

## Layout

```
src/              React frontend
  components/     24 components, flat, one per file, PascalCase
  utils/          pure functions, heavily unit-tested
  hooks/          useScanStatus only
  data/           static data (Discovery directory listing)
  styles/         tokens.css (CSS variables) + index.css (Tailwind @theme)
  __tests__/      integration and guard suites
src-tauri/src/    Rust backend
  lib.rs          all #[tauri::command] definitions and the invoke_handler
  scanner.rs      the filesystem walk and asset counting
  preferences.rs  SQLite store, schema, and migrations
  domain.rs       shared types crossing the IPC boundary
  mcp/            MCP server discovery (registry, dialects, probe)
  scan/           scan status and progress
src-tauri/tests/  Rust integration tests
docs/             gitignored except where noted below
```

There is no router. Views switch on a single string state in `src/App.tsx:217`,
persisted under the `selected_sidebar_item` preference.

## Invariants

Things a change could plausibly break without any test obviously failing.

**Bundle identifier is `com.rkarthik.hanger`** (`src-tauri/tauri.conf.json:5`).
It keys the app's data directory and its update identity; changing it strands
every existing install's database and preferences.

**The crate is `tauri-app`, the lib is `tauri_app_lib`**
(`src-tauri/Cargo.toml:2`, `:9`). The names look like scaffolding left over
from `create-tauri-app`, but `main.rs` and every integration test import
`tauri_app_lib`. Renaming is a mechanical change with a wide blast radius.

**Counts come from the backend, never from the frontend.** One function,
`count_assets(db_path, root)` (`src-tauri/src/scanner.rs:9`), is the source
for every count on screen, exposed as the `get_asset_counts` command. The
frontend renders what it is given. `.length` on a filtered array, a `reduce`
over inventory, or a sum of category arrays is a counting implementation and
is forbidden — enforced by `src/__tests__/no-frontend-counting.test.ts`, which
fails on any match not on an explicit allowlist, and also fails when an
allowlist entry stops matching.

**Link state is derived at read time, not stored.** The `links` table has a
`mechanism` column (`src-tauri/src/preferences.rs:256`) but no `state` column;
`update_link_state` persists only `dest_hash` and `last_verified_at`
(`preferences.rs:1171-1178`). Whether a link is linked, drifted, or dangling
is recomputed from the filesystem on each read. Do not add a cached state
column without deciding what invalidates it.

**Schema changes are `PRAGMA user_version` migrations in
`preferences.rs::init_db`.** There are no `.sql` files and no migration
directory. The store is at version 3, pinned by
`src-tauri/tests/store_migration_tests.rs`.

**Styling is semantic tokens only.** No raw hex, no `text-red-500`. Enforced
by `src/__tests__/no-off-token-styles.test.ts` against a file-and-line
allowlist. See `.claude/DESIGN.md` for the token set.

**No blocking webview dialogs.** `window.confirm/alert/prompt` and bare
`confirm(` are banned across `src/`, enforced by
`src/__tests__/no-blocking-dialogs.test.ts`. Native
`@tauri-apps/plugin-dialog` surfaces are allowed but must be imported under an
alias so call sites stay distinguishable.

**Asset reaping is off by default** behind `HANGER_ENABLE_REAP`
(`README.md:27-30`). It is disabled because it caused data loss twice when
transient unmounts or interrupted walks made live assets look stale.

## This checkout may be shared

More than one Claude Code session can be working in this directory at the same
time, and they commit to the same branch. Two consequences:

- **A gate result is valid only for the tree at the moment it ran.** If files
  changed underneath you — including files another session is mid-edit — rerun
  or say the result is stale. Reporting a green from a tree that has since
  moved is fabricated evidence under `AGENTS.md`.
- **Check before you assume authorship.** `git log` and `git status` may show
  commits and modifications that are not yours. Do not revert, stash, or
  "clean up" changes you did not make; confirm whose they are first.

`ListAgents` shows the other live sessions.

## Documentation

`docs/` is gitignored wholesale except for targeted exceptions in
`.gitignore`. Files under `docs/to-be-reviewed/` are a holding pen and are not
authoritative — several assert behaviour the code does not implement. Do not
treat anything there as a specification without checking it against the code
first. `docs/findings.md` records known defects that have been deliberately
left unfixed, each with evidence.

## Gaps

Things not established at the time of writing, left out rather than guessed:

- Whether CI runs the pinned gates on push, and where that workflow lives.
- Whether a Windows or Linux build is intended; the code and README are
  macOS-only, but `tauri.conf.json` sets `"targets": "all"`.
- The release process. `docs/release.md` exists but is in the holding pen and
  was not verified against the actual workflow.
