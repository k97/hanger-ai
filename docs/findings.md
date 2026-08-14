# Findings

Observations with evidence, recorded so they are not re-derived and not
silently "fixed" in passing. None of these is a decision; each needs its own
task. Line references verified 2026-08-14 on `redesign/mono-tight` unless
marked otherwise. Files marked *(held)* were being edited by a concurrent
session when recorded — treat their line numbers as approximate.

## Gates and tests

**F1 — The frontend gate could not go green on a clean tree. FIXED 2026-08-14**
(the one exception to "none of this is fixed" — it was promoted to a task and
resolved). `npx vitest run` exited 1 with every test passing: six unhandled
rejections from `useScanStatus.ts:29`, where `listen()` rejects under jsdom
(`window.__TAURI_INTERNALS__` absent) and the only `.catch` attached at
unmount, not creation. Ruled a production defect (an unhandled promise), fixed
at the definition with a branch `.catch` at creation. Evidence: gate red at
exit 1 / 320 passed / 6 errors, then green at exit 0 / 320 passed / 0 errors,
same tree.

**F2 — The gate has a silent wrong-directory mode.** Run from `src-tauri/`,
vitest resolves no config, matches zero test files, and exits 1 having tested
nothing. Guarded 2026-08-14 by `src-tauri/vitest.config.ts`, which throws a
loud startup error naming the fix. AGENTS.md already pinned the invocation;
the pin alone did not prevent the mistake in practice.

**F3 — `mcp_discovery_tests.rs:3-4` cites gitignored paths.** The tracked test
file's header cites `docs/superpowers/specs/2026-08-14-mcp-server-visibility-design.md`
and `docs/superpowers/plans/2026-08-14-mcp-discovery-correctness.md`;
`docs/superpowers/` is ignored (`.gitignore`), so a fresh clone has tracked
tests citing files that do not exist. Recommend promoting those two specs
somewhere tracked or removing the citations. Not fixed here — the file is
held by the concurrent session. *(held)*

## Citations and configuration

**F4 — `dialect.rs` cites `docs/scanning.md`** *(held)* — broken when the
docs move put scanning.md in the pen, repaired 2026-08-14 as a side effect of
promoting `scanning.md` back to `docs/` root (decision: contributor docs live
tracked at `docs/`). The citation resolves again; `dialect.rs` itself was
never edited. Fragility remains: nothing detects a tracked file citing an
untracked path. Same class as F3.

**F5 — `McpServerDetail.tsx:148` forward-references a rule that was never
written** *(held)*: a comment says 17–20 tools exceed a panel and "DESIGN.md
fixes" it. No design source defines a panel height. The component caps its
list at `max-h-[240px]` locally and `DisclosureBanner.tsx:83` independently
caps at 240px — the agreement is emergent, not specified. `.claude/DESIGN.md`
records the absence; do not point the comment at it, delete or rewrite the
comment into a real decision.

**F6 — The DisclosureBanner rule has no detector.** AGENTS.md mandates
DisclosureBanner for non-blocking diagnostics; nothing enforces it.
`no-blocking-dialogs.test.ts` bans only `confirm`/`alert`/`prompt` (`:24`).
Evidence: `rg -ln "DisclosureBanner"` across test files returns its own unit
test plus four feature tests, none asserting exclusivity. Convention only.

**F7 — `tauri.conf.json` sets `"targets": "all"` against a macOS-only
codebase.** `README.md:9` says macOS; nothing in the repo builds or tests
another platform. A config asserting something the product does not do.
Do not change it without deciding the platform question first (also listed as
a gap in `CLAUDE.md`).

**F8 — `release.md` held out of promotion.** Two lines block it from a public
repo pending a ruling: line 56 carries a machine-local
`file://~/Projects/demo/hanger-ai/...` link, and line 35 names
`k97/hanger-pvt-ai` as the private development archive. It stays in
`docs/to-be-reviewed/` until ruled; everything else a contributor needs was
promoted.

**F9 — `ipc.md` is stale in scope.** It documents 13 commands; `lib.rs`
registers 26. Promoted anyway as the best available contract doc; the gap is
the finding.

## Design tokens (from `.claude/DESIGN.md` §Not implemented)

**F10 — Two type voices, one value.** `--font-sans` and `--font-flex` are
byte-identical stacks (`tokens.css:27-28`); the distinction exists in markup
and resolves to nothing.

**F11 — Dark neutral ramp is partial.** Light declares 13 stops
(`tokens.css:77-89`); `.dark` redefines 4 (`tokens.css:165-168`). Anything
using `--n-200`…`--n-950` renders its light value in dark mode. Promoted to a
task in this run — see the consumer list and resolution in the run report.

**F12 — ~60 legacy token aliases still live** (`tokens.css:51-118`,
registered `index.css:19-91`), including brand hues revalued to `--ink-2`
(`tokens.css:61-63`) — the names survive with their meaning gone.

**F13 — `--radius-control: 6px` outlived its retirement note**
(`tokens.css:112`, called retired at `index.css:105`).

**F14 — "Semantic colour in exactly one place" is aspirational.** The legacy
layer still declares tinted state grounds (`tokens.css:66-74`, `:96-103`);
`DisclosureBanner` honours the rule, the tokens remain for anything that
does not.

**F15 — Vertical rhythm is not tokenised.** `--gutter: 18px` and `--step: 8px`
exist (`tokens.css:42-43`) but are unregistered; every use is a call-site
literal kept in agreement by hand.

**F16 — `--step: 8px` has no consumer at all**, alongside a deliberate 4px
grid (`index.css:96-103`).

**F17 — The 240px scroll-cap agreement is emergent** (same evidence as F5,
recorded once as a token-system fact: two independent 240px caps, no shared
token).

**F18 — Panel-height rule absent** — see F5.

## Documents

**F19 — `product_documentation.md` (pen) is wrong in its first paragraph**:
"cross-platform" (macOS-only, `README.md:9`) and "Bluesky Design System
tokens" (mono ink-and-paper, `tokens.css:1-16`). Most dangerous file in the
pen; reads as current.

**F20 — `DESIGN_RECONCILIATION.md` (pen) rules on documents that no longer
exist** and is wrong on every checkable value (type scale, radius, four
required tokens absent, theme default falsified). Detail in the session-2
delta; not re-derived here.

**F21 — The pen `DESIGN.md` icon section describes a superseded pipeline.**
It names `docs/icons/v8` as the app-icon source and `.agents` skill scripts
as the pipeline; the tree now carries an in-flight rework
(`src-tauri/scripts/generate-icons.sh`, `icon-tool.swift`, `dev_icon.rs`,
regenerated `src-tauri/icons/*`) by the concurrent session. Note: v8-as-bundle-
source vs v9-as-rail-mark is NOT a contradiction — different artifacts
(`HangerMark.tsx:3` reads v9 SVGs for the rail; the bundle pipeline used v8).
An earlier classification here called that "wrong"; retracted.

**F22 — A prior public-audit finding is stale in the good direction**:
`evidence/public-audit/publication-checklist.md` records LICENSE as ABSENT;
`LICENSE` and `SECURITY.md` are now present and tracked. Anyone acting on
that audit should re-verify its other findings first.

## Data layer (carried from the stop report, still open)

**F23 — `links` has no production writer.** One row-creation path
(`upsert_link`, `preferences.rs:1128`), test callers only; `execute_deploy`
writes nothing on the symlink branch and only `deploy_checksums` on the copy
branch. Behind the shipped `0 linked · 121 local only`. Items 7–8 of this run
address it; outcome in the run report.

**F24 — `count_assets` has no destination axis** (`scanner.rs:9-23`): one
parameter filtering the owning root; edges (source→destination) are
inexpressible without modification. Any second counting path is how the
sidebar and header once came to disagree — extend the function, in the open,
or do not count edges.

**F25 — `Subagent` lacks `drifted`/`is_symlink`** (`domain.rs:95-110`) —
the only asset struct without them; its `link_state` derivation differs from
the other seven sites. Accidental asymmetry or unwritten rule; needs a ruling.

**F26 — `upsert_asset` re-parents project-scope assets to the deepest
matching root** (`preferences.rs:1045-1050`) with `abs_path` as the dedup key
and no canonicalisation for project scope (`preferences.rs:1027-1028`).
Consequence for deployments probed in item 7 of this run; see the run report.

**F29 — Mixed-theme render on OS appearance change (running release build).**
Observed 2026-08-14 while capturing item-6 evidence: with `theme=auto`, an OS
dark→light flip left the running app (release bundle, pid 68229) in a mixed
state six seconds later — titlebar, sidebar, and inspector light; the content
column's ground and the selected row still dark. Six seconds is 30× the app's
200ms colour transition, so this is unlikely to be a transient paint frame.
Not the F11 ramp defect (that would be light values in dark; this is the
inverse) and not reproduced from the current tree. Screenshot retained in the
run report. Needs its own diagnosis: candidates include a `.dark`-scoped
subtree that misses the toggle, or a surface reading the OS scheme directly
instead of the resolved `darkMode` state.

## Mechanism / state vocabulary (recorded earlier, unchanged)

**F27 — `Mechanism::Copy` is unreachable in production** and the watcher
would silently skip it (`watcher.rs:75,130`); the decode fallback
`_ => TrackedCopy` (`preferences.rs:1146-1148`) absorbs unknown strings.
Left untouched by ruling 2026-08-14; the watcher gap is the actionable part.

**F28 — `LinkState::Broken` carries two meanings**: frontmatter parse failure
(scanner, asset concern) vs dangling destination (`resolve_state`, link
concern). UI already separates them ("Won't parse" / "Broken links"). No
rename; code touching these keeps them apart.
