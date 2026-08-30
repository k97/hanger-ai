# README structure, and the guard that keeps it true

**Date:** 2026-08-30
**Status:** Design approved in conversation; implementation not started.
**Scope:** `README.md`, two new `docs/` files, one new rule, one generator, one guard test.

## 1. Problem

`README.md` is 134 lines and does the wrong job. Roughly half of it is
contributor internals — a `cfg`-keyed table of macOS assumptions, the
`HANGER_ENABLE_REAP` safeguard, and ~40 lines on how the *dev* app icon
obtains Liquid Glass. It carries no orientation: a reader cannot learn from it
how a scan works, what the process boundaries are, or what the test suites
assert.

Three of those internals sections are also duplicated by `docs/` files that
say the same thing more fully, so the README costs maintenance without adding
reach.

Two things are missing from the repository entirely, not just from the README:
there is **no architecture document**, and the four verification gates are
recorded only in `CLAUDE.md`, which is agent-facing.

## 2. Decisions taken

Each was put to Karthik on 2026-08-30 and chosen by him.

1. **The README's job: hybrid.** It carries Architecture and Testing at full
   depth, because those exist nowhere else. Quick Start, How It Works and
   Design Decisions are short, diagram-led orientation that links into `docs/`.
   `docs/setup.md` and `docs/harness.md` keep their depth and their standing.
2. **Figures are generated and guarded, and kept few.** Only figures that mean
   something appear. A script emits them into a marked block; a test fails when
   the checked-in block differs from a fresh run. No LOC totals, no vanity
   charts.
3. **The rule governs `README.md` alone**, plus a keep-current clause. A house
   style for all of `docs/` was rejected: `docs/` holds explainers, a contract
   reference, ledgers and a TODO, and one style would either guard nothing or
   force diagrams into files that do not want them.

A fourth instruction, given mid-design: *anything duplicated and does not add
value goes out.* Section 4 applies it.

## 3. The README outline

Nine sections. Five are new, four survive from today.

| # | Section | Diagram | Source |
|---|---|---|---|
| 1 | Hanger AI — intro, screenshot | — | today's opening, kept |
| 2 | Quick Start | flowchart: `bun install` → `tauri dev` → four gates | `CLAUDE.md` → Commands |
| 3 | How It Works | sequence: disk → walk → detectors → SQLite → read-time derivation → UI | `scanner.rs`, `annotations.rs` |
| 4 | Architecture | layered graph, four tiers | §3.1 |
| 5 | Asset coverage | generated counts block | `agents.rs:111`, `mcp/registry.rs:103` |
| 6 | Testing | four gates, plus the guard-test table | `CLAUDE.md` → Verification |
| 7 | Design Decisions | one callout per invariant | `.claude/rules/invariants.md` |
| 8 | Installation | — | today's, kept |
| 9 | Platform support, licence | — | trimmed to two sentences, links out |

Three sections carry a mermaid diagram — Quick Start, How It Works and
Architecture. Testing is a table, Design Decisions is a set of callouts, and
Asset coverage is the generated block; none of those three is a diagram.

### 3.1 What each diagram shows

**How It Works** carries the one non-obvious fact. Reach and link state are
never stored: the `links` table has a `mechanism` column and no `state`
column, and whether a link is linked, drifted or dangling is recomputed from
the filesystem on every read (`.claude/rules/invariants.md`, "Link state is
derived at read time"). A sequence diagram makes that legible in a way the
prose in `docs/harness.md` cannot.

**Architecture** — four tiers, every figure verified 2026-08-30:

- React 19 webview: 102 files under `src/components`, 48 under `src/utils`,
  no router — views switch on one string state, `selectedSidebarItem`.
- Tauri IPC: **42 commands** (`src-tauri/src/lib.rs:2066-2109`) and three
  events — `scan://progress`, `scan://complete`, `scan://error`.
- Rust core: 16,349 lines across 32 `.rs` files, of which 12 are the `mcp/`
  subsystem. Largest: `scanner.rs` (2,820), `lib.rs` (2,508),
  `preferences.rs` (1,777), `provenance.rs` (1,020).
- SQLite: 10 tables — `assets`, `roots`, `engines`, `links`,
  `linked_directories`, `preferences`, `probe_results`,
  `asset_classifications`, `deploy_checksums`, `rules_target_memory`.

**Testing** shows what is actually distinctive here: 73 frontend and 44 Rust
test files, and a class of *guard* tests that encode repository rules —
`no-frontend-counting`, `no-off-token-styles`, `no-blocking-dialogs`,
`type-roles`, `brand-coverage`, `design-system-coverage`. The section is a
table of guard → what it forbids → what happens if you try.

**Design Decisions** is sourced entirely from `invariants.md`: counts come
from the backend and never the frontend; link state is derived at read time;
schema changes are `PRAGMA user_version` migrations; styling is semantic
tokens only; no blocking webview dialogs; reaping is off by default.

## 4. Redundancy ledger

Every row below was established by grep against the tree on 2026-08-30, not
by inspection. `.claude/worktrees/search-palette/` is a second checkout and
`docs/superpowers/`, `docs/to-be-reviewed/`, `docs/evidence/`,
`docs/references/` are gitignored; all were excluded.

### 4.1 Out — duplicated

| README today | Duplicated by | Action |
|---|---|---|
| Local Development, 15 lines | `docs/setup.md:7-48`, a strict superset | Cut. Quick Start keeps `bun run tauri build`, the one command setup.md lacks, plus the gates |
| "Scanning respects `.gitignore`…", line 70 | `docs/scanning.md:10-12`, fuller — it also covers `.env` gating | Delete; link out |
| "eleven engines… `agents.rs:69`" | `docs/harness.md:50-51`, same fact and same citation | Delete the prose; the generated block carries the number |
| Reaping rationale, "caused data loss twice…" | `.claude/rules/invariants.md:66-69`, same sentence | Delete the rationale. Keep three lines: off by default, and the launch command — that part is user-facing and exists nowhere else |

Approximately 70 of 134 lines leave before anything is added.

### 4.2 Relocated — unique, wrong home

Neither is duplicated in any tracked file, so the "duplicated" test does not
fire. They move because a README is the wrong place for them, and they are
not deleted because deleting unique, correct engineering knowledge is the
only irreversible act available here.

- **App-icon pipeline, ~40 lines → `docs/app-icon.md`.** Checked: the only
  other mentions are `.claude/DESIGN.md:1868` and
  `.claude/rules/verifying-ui.md:54`, both of which concern
  `dev_icon::window_title` — window *identity*, a different subject. The
  `Assets.car` / stub-bundle / `RunEvent::Ready` material exists nowhere else.
- **Platform-support table → `docs/platforms.md`.** No tracked doc carries it.
  The README keeps two sentences and a link.

### 4.3 Stays

The sixteen-MCP-hosts figure (unique to README and `CLAUDE.md`), the intro,
Installation, and the licence line.

## 5. The counts block and its generator

`scripts/readme-counts.sh` emits a table between
`<!-- hanger:counts:start -->` and `<!-- hanger:counts:end -->`.

Figures emitted: engines with directories of their own; MCP hosts; asset
kinds; Tauri commands; frontend test files; Rust test files.

**The generator counts entries between an array literal's bounds — it never
greps a token.** This is not a style preference; it is the defect the
generator exists to prevent. While designing this document the author
hand-counted the Tauri command list three times and got 41, 38 and 1536
before getting 42, and then counted `AGENT_CONFIGS` and `HOSTS` by grepping
`AgentConfig {` and `McpHost {`, obtaining 12 and 18 against documented and
correct values of 11 and 16 — the surplus being one `pub struct` line in each
case and one `impl` block in the second. A token grep would have made the
guard confidently wrong, which is worse than no guard. The generator resolves
the start and end lines of each array and counts entries inside them.

### 5.1 Precedent in this repository

This decision has been made here before, for the same reason. `agents.rs:48-57`
records that the Global empty-state copy "listed three engines by hand and went
stale the moment `AGENT_CONFIGS` grew past them, so the copy reads this instead
and the table below stays the only place the roster is written down." The README
takes the same route the UI copy already took: read the table, never restate it.

## 6. The rule and its guards

`.claude/rules/readme.md`, linked from `CLAUDE.md` → Rules alongside the
existing ten.

| Clause | Enforced by |
|---|---|
| The README carries the section set in §3 | guard: section presence |
| Figures come from the generated block, never typed | guard: regenerate and diff |
| Relative links and `file:line` citations in the README resolve | guard: path and line-range check |
| A change that invalidates a diagram moves it in the same commit | **prose only — unguarded** |

The fourth clause is unenforceable and the rule will say so in those words.
Per `verification.md`, a clause that nothing can fail is decoration; naming it
as prose is the honest alternative to pretending otherwise.

`src/__tests__/readme-sync.test.ts` implements the first three.

## 7. Proving the guards are not decoration

`verification.md`: a green control proves nothing until a violation has been
shown to redden it. Before this work is reported done, for each of the three
enforced clauses:

1. Plant the violation — a twelfth fake entry in `AGENT_CONFIGS` for the
   counts clause; a deleted `##` heading for the section clause; a citation
   pointing past end-of-file for the link clause.
2. Run the guard, capture the red output verbatim.
3. Revert, re-run, capture the green.
4. Commit both runs.

A guard that cannot be made to fail is removed from the rule, not counted.

## 8. Forced edits, reported

`.claude/rules/invariants.md:66` cites `README.md:27-30` for the reaping rule.
Lines 27-30 are the platform-support table; reaping is at line 72. **The
citation is already stale**, and restructuring the README makes it wronger.
Fixing it is caused by this work, so it lands in its own commit naming the
cause, per `verification.md` → Checkpoints and reporting.

It is not the only one. Verified 2026-08-30, while checking citations this
design would otherwise have repeated on trust:

| Citation | Cited in | Actually at |
|---|---|---|
| `agents.rs:69` for `AGENT_CONFIGS` | `CLAUDE.md`, `README.md`, `docs/harness.md:51` | `agents.rs:111` |
| `mcp/registry.rs:91` for `HOSTS` | `CLAUDE.md`, `README.md` | `mcp/registry.rs:103` |
| `domain.rs:323-326` / `domain.rs:373-378` for the four asset kinds | `CLAUDE.md`, `.claude/rules/shared-asset-machinery.md` | neither — see below |

The last cannot be repaired by moving a line number. There is no enum: category
is a plain `String` (`domain.rs:362`), so no single site defines the four kinds
and the citation has nothing to point at. That is a finding to raise, not a
number to correct silently.

Only the `README.md` occurrences are in scope for this work. The rest are
reported here and left.

## 9. Out of scope

- **`docs/ipc.md` documents 14 of 42 commands.** A real gap, predating this
  work. Reported, not fixed.
- **Pointing the link guard at `CLAUDE.md` and `.claude/rules/*.md`.** §8
  found four stale citations there, not one, so this is demonstrably worth
  doing rather than hypothetically. It is still a separate control over
  separate artefacts and needs its own decision.
- **Repairing the citations in §8 outside `README.md`**, including deciding
  what the four-kinds citation should point at given that no enum exists.
- Any restyling of `docs/` beyond the two files created in §4.2.
- The `docs/plans/task.md` file and anything else already in `docs/plans/`.

## 10. Exit criteria

Each needs evidence attached, per `verification.md`'s ranking.

1. `README.md` carries the nine sections of §3 with three rendered mermaid diagrams —
   screenshot or rendered-markdown evidence.
2. Every §4.1 row is removed from `README.md`; `git diff` shows it.
3. `docs/app-icon.md` and `docs/platforms.md` exist and carry the §4.2
   content without loss — `git diff` plus a word-count comparison.
4. `scripts/readme-counts.sh` runs clean and its output matches the committed
   block — command output pasted with exit code.
5. `.claude/rules/readme.md` exists and is linked from `CLAUDE.md` → Rules.
6. `src/__tests__/readme-sync.test.ts` passes, and the §7 red/green cycle is
   committed for all three enforced clauses.
7. `invariants.md:66` cites the correct location, in its own commit.
8. The four pinned gates pass on the final tree: `npx vitest run`,
   `cargo test`, `bunx tsc --noEmit`, and both `gitleaks` invocations.
