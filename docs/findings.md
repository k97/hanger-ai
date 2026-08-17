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

**F23 — `links` has no production writer. PARTIALLY FIXED 2026-08-14.**
Was: one row-creation path (`upsert_link`), test callers only; behind the
shipped `0 linked · 121 local only`. Landed: the v4 migration (dedup,
`UNIQUE(asset_id, dest_path)`, `dest_root_id` index, tracked-copy backfill
from `deploy_checksums`), a real upsert preserving `created_at`, and
deploy-time recording on both `execute_deploy` branches via
`record_deploy_link`, which declines when the source was never scanned
rather than inventing an asset row (see F26). Real-machine accounting on a
store copy: `user_version 4`, 0 checksum rows → 0 backfilled links, fully
accounted. **The scan-time symlink backfill landed 2026-08-14 evening**
(86c7c70 store half: `record_walk_symlink` with typed decline reasons;
2fbaa2c walk half: call sites on dir and file entries — a symlinked skill
directory is yielded but never descended, so the dir entry is the only
chance to see it). Verification is an accounting, pinned by
`tests/walk_symlink_backfill_tests.rs`: every symlink the walk meets either
records a row or carries a typed reason (TargetNotInStore, TargetInSameRoot,
unresolvable). F23 is now CLOSED except by later regression. Root-level
engine symlinks stay out of `links` permanently by design: one filesystem
object must not become N rows; engine reachability derives from `roots` at
read time — which is exactly how the link map draws its store→engine edges.

**F24 — `count_assets` has no destination axis** (`scanner.rs:9-23`): one
parameter filtering the owning root; edges (source→destination) are
inexpressible without modification. Any second counting path is how the
sidebar and header once came to disagree — extend the function, in the open,
or do not count edges. *Outcome 2026-08-14: the link map counts neither.*
Its edge counts are counts of LINKS (rows in `links`, root-level symlinks
for engine edges — `linkmap.rs`), a different quantity; its node asset
counts come from `count_assets` per root. The destination axis for asset
counts remains absent, and nothing new counts assets.

**F25 — `Subagent` lacks `drifted`/`is_symlink`** (`domain.rs:95-110`) —
the only asset struct without them; its `link_state` derivation differs from
the other seven sites. Accidental asymmetry or unwritten rule; needs a ruling.

**F26 — `upsert_asset` re-parenting: RULED A BUG, 2026-08-14. FIXED the same
evening** (4a8a248): when the existing row's canonical path lies outside
every project root, the row keeps its root_id — a project walk that reaches
such a path has followed a symlink, and a link is not ownership. The probe
flipped from documenting the defect to guarding the fix (red pasted:
root_id 2≠1; then green), with a companion pinning that genuine nested
project assets still resolve to the deepest root. Real-store accounting on
a live-DB copy: 351 assets, every per-root count identical before and after
a full rescan — no stolen rows existed on this machine, and the fixed walk
steals nothing. Original mechanism, proven by `tests/reparenting_probe_tests.rs`
against real behaviour: the project walk canonicalizes a symlinked asset's
path (`scanner.rs::canonicalize_asset_path` resolves symlinks), so the upsert
arrives with the store's canonical path; `abs_path` dedup finds the existing
store row (`preferences.rs:1052-1057`); `resolve_deepest_root` cannot match a
store path to any project root and falls back to the passed project root id
(`preferences.rs:1045-1050`); the existing-row UPDATE then **moves `root_id`
to the project while `scope` is not in its column list**
(`preferences.rs:1068-1071`). Result: one row, root stolen last-walk-wins,
`scope='global'` frozen under a project root — the store's count silently
loses the asset and the project gains it in its *global* bucket. This is the
mechanism behind shipped count disagreements of the 121-vs-329 class. Intent
witnesses all point the other way: the walk's own comment defends against
exactly this re-parenting (`scanner.rs:1298-1304`), the v2 migration purged
the mirror-image incoherence, and the deepest-real-location doctrine
(`scanner.rs:830-843`) puts the row with the store. Fix belongs in
`upsert_asset`: when the existing row's canonical path lies outside every
project root, keep the existing `root_id`. The probe test asserts the
defective behaviour on purpose and must flip into the fix's red/green pair.

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

**F30 — Link map edge labels can collide near a shared source anchor.**
Observed in the running build (2026-08-14 screenshots, dark, 1280 and 860):
several long edges leaving one store node place their "N symlink(s)" labels
at curve midpoints, and two labels overlap where the curves run close.
Legible at 1280, tight at 860. Labels are positioned from endpoints only —
the same determinism rule that keeps the map from reshuffling — so any fix
is deliberate label layout, not jitter. Polish task; the data is right.

**F31 — `test_write_transactional_validation_failure_rollback` is
load-flaky.** Failed once ("Expected ValidationFailed error" — a different
`TransactionError` variant came back) while three gate processes ran in
parallel, then passed 3/3 in isolation and in the full serial suite, twice.
`transactional.rs` is untouched since the initial commit. Suggests
`write_transactional` can surface a non-validation error under filesystem
contention; worth a look at its error taxonomy before anyone trusts a red
from a busy machine.

**F32 — HEAD did not compile from a fresh clone between 12:02 and ~20:45
on 2026-08-14. FIXED** (recorded so the class is remembered, not the
instance): commit 4dcccfc referenced `dev_icon.rs` and, at compile time,
`include_bytes!("../icons/dev-Assets.car")` while both stayed untracked in
the shared working tree — every clone since failed `cargo build`. Traced by
a concurrent session (`git log -S "pub mod dev_icon"`), surfaced to the
user, and landed properly as b5ab6e4 with an explicit tracked-vs-generated
decision. The class: in a shared checkout, a commit can silently depend on
a neighbour's uncommitted files, and `cargo test` run locally will never
notice. The same day also produced e394bf5 (swept an in-flight function)
and ac54d57 (swept a staged 70-file set; reset within the minute, recommitted
clean as d6e5dd4). Only `git commit -- <paths>` is safe here, and a red gate
is not trustworthy without checking mtimes of what it read.

**F33 — `get_inventory` is a sync command that runs a full scan on the main
thread.** `#[tauri::command] fn get_inventory` (lib.rs) calls `run_scan`,
the same shape that froze the webview for a measured 11.2 seconds in
`get_mcp_processes` until 93e2b90 made that command `(async)`. Every sync
command runs on the main thread in Tauri 2; any that touch the filesystem
inherit the hazard. `link_graph` had the shape and was fixed the same day;
`get_inventory` predates every current session and is load-bearing at boot,
so it is recorded rather than flipped in passing — flipping it changes
which thread a boot-critical path runs on and deserves its own red/green.
Lead credit: the MCP session, 2026-08-15.

**F34 — Warning banners explain faults in two places; Needs Review should be
the only one. RECOMMENDED, deliberately not built (2026-08-15).** Today a
diagnostic gets a DisclosureBanner body in whichever pane noticed it *and*
a ReviewInspector body in Needs Review — two anatomies for one fault, and
neither authoritative. The proposal (Karthik's, this session): banners keep
their summary line and gain an action that navigates to Needs Review with
the exact issue selected and the inspector open; the accordion body goes
away. Doctrine agrees — the rail already frames Needs Review as "what is
wrong with them" — and App already holds `reviewKind`, `reviewPlace`,
`selectedIssue` and `inspectorOpen`, so the navigation itself is a helper,
not new plumbing.

Not built because the prerequisite is a model change, not a UI move:
`ReviewIssue` is per-asset (`reviewIssues.ts:27-51`) and
`deriveReviewIssues` reads only `Inventory`, while three of the four banner
payloads have no asset to key on — RepoPane's scan warnings are walk events
(`project_scans.parse_warnings`), ProfilePane's undeclared MCP servers are
processes outside `Inventory` entirely, and the link map's graph warnings
are Rust-side strings, one of which reports that the asset row itself is
gone. Each needs a new `IssueKind` and its own derivation before it can be
selected.

Three consequences to accept first: the rail badge inflates (scan warnings
alone move 91 upward — arguably more honest, but the number changes
meaning); `AGENTS.md:88` currently *mandates* DisclosureBanner for
non-blocking diagnostics, so this is a governance amendment (see F6, which
notes the rule has no detector); and DisclosureBanner's accordion becomes
dead weight, reducing it to a one-line notice with an action across
ProfilePane and RepoPane.

**One banner must not move**: the link map's "Per-asset project links have
not been recorded yet" is an empty-state explainer, not a fault — sending
someone to Needs Review to find nothing is worse than the accordion.

Suggested order if taken up: grow the review model to hold non-asset faults
(load-bearing, independently testable) → navigate-to-issue helper → flip
banners one pane at a time → amend AGENTS.md and DESIGN.md → simplify
DisclosureBanner last. Sequencing note: `NeedsReviewPane.tsx` was claimed
by a concurrent session on 2026-08-15.

**F35 — Local-scoped rows lose their engine and mark; the inspector shows
both. PRE-EXISTING, not fixed here.** `ProfilePane.tsx:208,228,244,259` and
`RepoPane.tsx:192,214,231,247` each build a row's `engine` field from
`scope?.Global?.agent || scope?.Project?.agent` — a two-branch chain that
predates `Scope::Local`. `AssetDetail.tsx:140` instead calls the Local-aware
`scopeAgent(asset.scope as Scope)` (`src/utils/scopeAccess.ts:30-36`), which
also checks `"Local" in scope`. Divergence: for a `Scope::Local { agent, root
}` asset, the row-construction chain finds neither `Global` nor `Project` and
falls back to `null`, so the table row reads "Any agent" with no brand mark;
opening that same row's inspector calls `scopeAgent`, which resolves the
`Local` branch and shows the real engine with its mark. This predates the
brand-mark work: `scopeAccess.ts`'s own header (lines 1-11) records that
adding `Scope::Local` "broke all of them silently" across five files because
it matches neither `Global` nor `Project` — the row-construction sites in
ProfilePane and RepoPane were never updated to route through it. The
brand-mark feature did not introduce the gap; it made the divergence visible
as a missing mark where before it was only a missing engine label. Reproduce:
find or create a Local-scoped asset (`Scope::Local`, private to one repo
directory rather than `Project`-shared or machine-wide `Global`), locate its
row in ProfilePane or RepoPane — it reads "Any agent" with no brand mark —
then open its inspector and see the real engine with its mark. Not fixed
here: out of scope for the brand-icons feature, and row construction in both
panes has its own tests.

## Agent detection: scan cost and modelling gaps

**F43 — Scan cost after the agent-detection expansion: no measurable
regression.** The walk gained roughly thirteen new global/project roots
across eight new `AgentConfig` rows (`src-tauri/src/agents.rs:58-184`,
Trae/OpenCode/Amp/Zed/Roo Code/Kilo Code/Cline plus Kiro). Measured on
Karthik's machine (macOS 26.5.2, arm64, 14 logical cores) by building two
detached `git worktree` checkouts — `f2cb533` (this work's branch point,
"before") and `ed1ee22` (current `redesign/mono-tight` HEAD at measurement
time, "after") — and timing `DirectoryScanner::scan(Path::new(""))` (the same
global-scan call shape `lib.rs`'s `run_scan` uses) against the operator's
real `$HOME`, `cargo test --release`, 5 runs each after a warm build:
before 179/186/141/135/125 ms (mean 153.2 ms), after 178/175/129/134/148 ms
(mean 152.8 ms) — flat, well inside noise, nowhere near the plan's ~20%
threshold. `--test scanner_tests` wall time (the brief's fallback proxy, not
a real-directory scan) moved from 2.90–2.98 s (38 tests) to 2.98–3.00 s (39
tests, one new test added by this work) — also flat. Both signals agree: on
this machine most of the newly added roots don't exist, so the walk pays a
cheap missing-directory stat per root, not a full traversal. This is a
single-machine, single-point-in-time measurement on one real home directory,
not a synthetic worst case with every new agent's directories populated —
recorded as a measurement, not a guarantee for every install.

**F44 — Aider is not modelled. DECIDED, not a defect.** Aider has no config
*directory* to inventory — one `.aider.conf.yml` about runtime behaviour
(model choice, edit format, auto-commit), plus arbitrarily-named files the
user points at with `--read`/`--file` on the command line. Nothing
category-shaped (skills/rules/subagents) for an `AgentConfig` row
(`src-tauri/src/agents.rs:20-34`) to hold.

**F45 — Goose is not modelled. DECIDED, not a defect.** Goose's config is a
flat `~/.config/goose/config.yaml`, and its per-project file,
`.goosehints`, is walked hierarchically N levels up the directory tree the
way `.editorconfig` is — not read from one fixed project root. Hanger's
`AgentConfig` shape is one global root plus one project root
(`global_roots`/`project_roots`, `agents.rs:24-26`); there is no slot for a
file resolved by upward directory search.

**F46 — Amp's five-tier rules resolution is not modelled. DECIDED, not a
defect.** Amp resolves rules across five tiers (cwd-and-parents, subtree,
system-wide, user-config, home). Amp's `AgentConfig` row detects it only via
the shared `.agents/` convention (`reads_agents_dir: true`, `rules: None`,
`agents.rs:122-132`) — a *reach* edge, not ownership of any rules tier. The
five-tier resolution itself has no representation.

**F47 — Windsurf/Devin's machine-wide system tier is not modelled. DECIDED,
not a defect.** Devin Desktop (formerly Windsurf) has a
machine-wide rules directory, `/Library/Application Support/Devin/rules/`,
that applies across every user and project on the machine. `Scope` has only
`Global` (home-relative) and `Project` (repo-relative) variants
(`src-tauri/src/domain.rs:4-11`); Devin Desktop itself is modelled only as an
MCP host, not an `AgentConfig` row, with sources at `.config/devin/config.json`
(Global tier) and `.devin/config.json` / `.devin/mcp_config.json` (Project
tier) (`src-tauri/src/mcp/registry.rs:148-150`). Neither tier reaches a
machine-wide directory outside any one user's home.

**F48 — Roo Code's Custom Modes are not modelled as subagents. DECIDED, not
a defect.** Roo Code's own docs describe Custom Modes as behavioural
specialisations of the one agent, not independent delegates — unlike Claude
Code's `.claude/agents/` or Codex's `.codex/agents/`, which spawn separate
subagent processes. Roo Code's `AgentConfig` row accordingly ships
`subagents: None` (`agents.rs:146-158`), matching Kilo Code and Cline, its
siblings in the same family — Custom Modes are not surfaced as a subagent
category anywhere in the product. Recorded with that caveat here so a future
change that *does* add a Custom Modes surface knows going in that they are
not peers of a true subagent, per Roo Code's own documentation.

## Mechanism / state vocabulary (recorded earlier, unchanged)

**F27 — `Mechanism::Copy` is unreachable in production** and the watcher
would silently skip it (`watcher.rs:75,130`); the decode fallback
`_ => TrackedCopy` (`preferences.rs:1146-1148`) absorbs unknown strings.
Left untouched by ruling 2026-08-14; the watcher gap is the actionable part.

**F28 — `LinkState::Broken` carries two meanings**: frontmatter parse failure
(scanner, asset concern) vs dangling destination (`resolve_state`, link
concern). UI already separates them ("Won't parse" / "Broken links"). No
rename; code touching these keeps them apart.
