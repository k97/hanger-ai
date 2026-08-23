# Handover — taking the v4 prototypes into Hanger

**Status:** nothing implemented. Written 2026-08-23 at the end of the
design cycle. The prototypes are the specification; this file is the
order to build them in, what each phase depends on, and what is still
blocked.

---

## The handover prompt

One paste, into a fresh session. It runs end to end.

> I am implementing the v4 inspector, map and summary-strip redesign in
> Hanger, end to end, in one run. The design is finished and lives in
> `docs/v4-prototypes/_iterated-view/`. The prototypes are the
> specification — not a mood board. Where a prototype and my description
> disagree, the prototype wins; where a prototype and the code disagree,
> stop and report.
>
> **Read first, in this order.**
> 1. `docs/v4-prototypes/_iterated-view/02-implementation-handover.md` —
>    the phase order, the dependency map, the invariants that bite, and
>    what is unresolved.
> 2. `docs/v4-prototypes/_iterated-view/00-gap-analysis-and-constraints.md`
>    — the feasibility analysis and every ruling with its date.
> 3. The three prototype pages, **opened in a browser, not only read as
>    markup**: `inspector-iterated.html`, `banner-iterated.html`,
>    `map-iterated.html`. Click the tabs, open the menus and popovers,
>    resize. Each page's legend at the foot is its specification.
> 4. `CLAUDE.md`, every file in `.claude/rules/`, `.claude/DESIGN.md`,
>    and `docs/harness.md`.
>
> **How to run it.** Use superpowers throughout:
> - `superpowers:using-git-worktrees` first. Other sessions commit to
>   this branch; work in an isolated worktree and integrate at the end.
> - `superpowers:writing-plans` to produce the plan for **all four
>   phases** up front, saved to disk, before touching code. We have
>   already brainstormed — do not re-enter brainstorming.
> - `superpowers:executing-plans` to work through it. Use
>   `superpowers:subagent-driven-development` for independent tasks
>   within a phase.
> - `superpowers:test-driven-development` on every change. Red first.
> - `superpowers:systematic-debugging` the moment something misbehaves —
>   before proposing a fix, not after the third attempt.
> - `superpowers:verification-before-completion` and
>   `superpowers:requesting-code-review` at each phase boundary.
> - `superpowers:finishing-a-development-branch` at the end.
>
> **Do not stop between phases.** Commit at each boundary, append to the
> ledger (below), and continue to the next. I am not driving this
> task by task.
>
> **The ledger.** Maintain
> `docs/v4-prototypes/_iterated-view/03-implementation-ledger.md` as you
> go. One section per phase: what landed, the gate output verbatim with
> exit codes, every deviation from the prototype and why, every
> human-gated item you could not self-certify, and anything you found
> that contradicts the design. Append as you finish each phase, not at
> the end — it is how I follow along without interrupting you.
>
> **When something is undecided, do not halt.** The prototypes draw a
> chosen state for almost everything. Implement what is drawn, record the
> alternative and the fact that it is unruled in the ledger, and keep
> going. This applies to all ten open decisions listed in the handover.
>
> **What you must never self-certify.** `.claude/rules/verification.md`
> is binding and outranks any superpowers skill on whether something has
> been demonstrated. Three things need me and cannot be signed off by you
> — collect them in the ledger and carry on rather than blocking:
> 1. **Copy.** Fourteen first-time strings are drawn and unsigned.
>    Implement them **verbatim as drawn**; do not improve, shorten or
>    re-word any of them, and do not invent new user-facing strings. If a
>    layout genuinely cannot hold a string, record it — do not solve it by
>    rewriting the string.
> 2. **UI acceptance.** A screenshot from a running build is evidence of
>    what is on screen; only I close an iteration. Take them per
>    `.claude/rules/verifying-ui.md` — window frontmost, bounds re-read
>    immediately before every click, and the frame corroborated by state,
>    because a capture by window id is not evidence your click reached
>    that window.
> 3. **The ten open rulings** in the handover.
>
> **Hard stops — these do halt the run and wait for me.** A pinned gate
> that will not go green. A prototype that contradicts the code. Any
> destructive git operation. Any change that would need a test, detector
> or allowlist weakened to pass. A schema migration whose test you cannot
> write first.
>
> **Non-negotiables, from `.claude/rules/`.** Counts come from the
> backend, never the frontend. Styling is semantic tokens only. Link
> state is derived at read time. Schema changes are `PRAGMA user_version`
> migrations in `preferences.rs::init_db`, and `store_migration_tests.rs`
> is the source of truth for the current version, not prose. Any change
> under `src-tauri/src/` gets its own red/green cycle and its own diff.
> Any edit to a test, detector or allowlist is reported with its cause
> and committed separately from the change that forced it.
>
> **The four pinned gates**, run from the stated directory, in the
> dispatch that reports them, at every phase boundary: `npx vitest run`
> from the repo root, `cargo test` from `src-tauri/`, `bunx tsc --noEmit`,
> and `gitleaks detect` twice per `CLAUDE.md`. A gate result is valid only
> for the tree at the moment it ran.
>
> Start now. Plan all four phases, then build them in order.

## What gates the whole programme

Two things cost no code and block everything downstream. Do them first.

**1. The copy pass.** Fifteen first-time strings are drawn in the
prototypes and unsigned. `.claude/rules/ui-copy.md` requires a
`/humanizer` pass and Karthik's sign-off before a string lands. All
fifteen have had the humanizer pass; one (`Needs review · 1`) is ruled.
The other fourteen are pending, and two of them additionally **wrap at
384px** in the drawn design, so the copy decision and a layout decision
are the same decision.

**2. The open design decisions.** Each is small; each blocks a specific
phase.

| Decision | Blocks |
|---|---|
| The finding dot's colour when severity is warning, not danger | inspector, map |
| Duplicate registration said in the popover and again in the verdict card — one or both | inspector |
| Whether the MCP cost section stays in Tools (my inference, not a ruling) — it pushes that panel 454px past the fold | inspector |
| Whether the eyebrow truncates instead of the Review chip collapsing | inspector |
| `Copy path` in both the ⋮ menu and the path row — keep both or drop one | inspector |
| The Finder glyph as both an action and a type glyph | inspector |
| The code block's resting scroll signal | inspector |
| Aqua for the MCP coverage meter's answered share | strip |
| Whether the active tab is remembered per kind | inspector |
| At 368px, a scrolling track or counts under labels | strip |

---

## Phase order

The ordering principle is **blast radius, ascending** — and introducing
each shared primitive alongside its first real caller rather than ahead of
it, per `coding-guardrails.md` ("a shared component earns its existence
with a second real caller"). The second caller arrives in the next phase
and generalises it.

### Phase 1 — The map

Lowest blast radius: `LinkMapPane.tsx` and `LinkMapPlacecard.tsx`, one
pane, no navigation change, no shared state.

Introduces three primitives **with real callers**: the section format
(eyebrow + one bordered card of icon · label · value rows), the mini
button tier at `--radius-control`, and the finding chip with its popover.
If any of the three is shaped wrong, this is the cheapest pane to find out
in.

Also lands: hover focus, the state dot on a node, the extended layers
panel, the scan stamp.

Backend: optional. Per-kind counts / `linked_from` on graph nodes (small)
if the placecard is not to call `get_asset_counts(root)` on selection.

Ends with a screenshot from a running build for Karthik.

### Phase 2a — The inspector body

`AssetDetail.tsx`, `McpServerDetail.tsx`, `Flyout.tsx` below the header.

Underline tabs, content first (`Content · Details` for a skill,
`Tools N · Details` for an MCP server). Every section becomes the format
Phase 1 proved. The Context section. Identity gains Path, Size, Modified.

Backend, each with its own red/green cycle:
- `list_asset_dir` (small) — "In this skill"
- asset `mtime` at read time (small) — Modified
- `allowed-tools` in `SkillFrontmatter` (small, ~4 lines) — Capabilities
- MCP tool-description bytes (small — descriptions are already stored at
  `mcp/probe.rs:72-76`; this is a sum, and per the counting invariant it
  must be backend-owned)

### Phase 2b — The inspector header

Split from 2a deliberately: **this is the riskiest change in the
programme.** The identity row takes over the 40px cap row in `App.tsx`,
which is the column's `data-tauri-drag-region` and whose height keeps the
panel aligned with the toolbar. Expand and Hide inspector *move* into the
header — `App.tsx:1644-1648` already refuses a second control doing the
same job from a different place, so they must not be copied.

Also: the ⋮ overflow menu, the progressive shed at 424.4px, the path row,
the eyebrow breadcrumb, the Review chip and its popover.

The menu is an **extraction, not a new component**. `ViewControl.tsx`
already draws `role="menu"` with `aria-haspopup`, `menuitemradio` rows,
Escape and outside-pointerdown, styled `bg-page border-line rounded-inner
shadow-overlay`, and `ViewControl.test.tsx` covers it with seven cases
including "is a popover, not a blocking dialog". This header is the second
real caller that earns extracting it. Those seven tests must stay green
through the extraction.

New icon: ellipsis-vertical. None of the 45 exports in `icons.tsx` is one.
Kind glyphs per asset kind if the eyebrow's word is ever dropped — not
needed while it stays.

Keeping 2a and 2b separate means a revert of the header does not lose the
body.

### Phase 3 — The strip and the segmented track

`SummaryStrip.tsx`, `CategoryFilterCards.tsx`, and the pane state in
`ProfilePane.tsx` / `RepoPane.tsx`.

The category chips become one segmented track with a raised capsule; the
row moves above the strip; the meter's meaning follows the selected
category.

Depends on two **new tokens** — `--capsule` and `--capsule-shadow` — which
must land in `src/styles/tokens.css` and be registered in
`src/styles/index.css`'s theme block before any component can use them,
because `no-off-token-styles` permits nothing else. The dark value is a
lighter surface rather than a shadow; a shadow is invisible on black.

Backend: a disagreeing-servers count (small).

Blocked until: the aqua ruling and the 368px ruling.

### Phase 4 — Deferred, and not in this programme

- **`inputSchema` bytes.** `probe.rs` discards them; they are the larger
  half of an MCP tool definition. Needs `PRAGMA user_version` 8 in
  `preferences.rs::init_db`, pinned by `store_migration_tests.rs` — write
  the migration test first. The inspector draws this half as pending, so
  Phases 1–3 ship without it.
- **Per-host tool-name collision detection.** A new `ReviewIssue` kind;
  `reviewIssues.ts:24` types four today.
- **The context-cost surfaces** in `01-context-cost-brainstorm.md`. Not
  designed. Do not build from that file.

---

## Dependency map

### Design system, in the order it is needed

| What | New or existing | First needed |
|---|---|---|
| Section format — eyebrow + one bordered card of rows | new | Phase 1 |
| Mini button tier, `--radius-control` | **token exists, unused** (`tokens.css:139`, registered `index.css:117`, so `rounded-control` already works) | Phase 1 |
| Finding chip + popover, edge-clamped | new; `Tooltip.tsx` has the clamp pattern | Phase 1 |
| Underline tabs | new | Phase 2a |
| Overflow menu | **extract from `ViewControl.tsx`** | Phase 2b |
| Ellipsis-vertical icon | new | Phase 2b |
| Segmented track + raised capsule | new | Phase 3 |
| `--capsule`, `--capsule-shadow` | **new tokens** | Phase 3 |

`.claude/DESIGN.md` is amended as each lands, not in advance. It is
derived from code with every statement cited, so a claim goes in when the
code makes it true. The two-button-radius ruling is currently in its
*Not implemented* section and moves up when Phase 1 renders
`rounded-control`.

### Backend, by phase

| Item | Size | Phase | Note |
|---|---|---|---|
| Per-kind counts / `linked_from` on graph nodes | small | 1 | optional |
| `list_asset_dir` | small | 2a | read-only |
| Asset `mtime` at read time | small | 2a | no column — read-time derivation is the invariant |
| `allowed-tools` in `SkillFrontmatter` | small | 2a | ~4 lines |
| MCP description bytes | small | 2a | data already stored; this is the sum |
| Disagreeing-servers count | small | 3 | |
| `inputSchema` bytes | medium | 4 | `user_version` 8 migration |
| Tool-name collisions | medium | 4 | new `ReviewIssue` kind |

### Invariants that will bite

- **Counts come from the backend, never the frontend.** Enforced by
  `src/__tests__/no-frontend-counting.test.ts`. The new design puts
  several *new* figures on screen — the Review chip's count, per-tool
  byte sizes, folder file counts, the description-bytes sum. Each needs a
  backend owner. `reviewIssues.ts` carries a documented exemption for
  derived groupings of flagged assets; check whether the chip's count
  qualifies rather than assuming it does.
- **Styling is semantic tokens only**, enforced against a file-and-line
  allowlist. The guard reads prose and comments too — write "radius" and
  "elevation", never the bare words it matches.
- **No blocking dialogs.** The menu and popover do not violate this
  (`window.confirm/alert/prompt` is what is banned), but the guard is
  worth reading before building either.
- **Link state is derived at read time, not stored.** Anything new that
  depends on reach inherits this.
- **Schema changes are `PRAGMA user_version` migrations** in
  `preferences.rs::init_db`. The store is at 7;
  `store_migration_tests.rs` is the source of truth for that number, not
  prose.
- **Moving a symbol can disarm a guard that reads it as text.** Grep the
  guards for a const's name before relocating it.

---

## Verification per phase

`.claude/rules/verification.md` owns this; the short version:

- Karthik has authorised **continuous execution across phases** — the
  run does not stop at each boundary. It commits, appends to the ledger,
  and continues. That is a deliberate relaxation of this rule's "stop,
  report, wait", and it relaxes only the *pausing*. It does not relax
  what counts as proof: nothing human-gated may be self-certified, and
  anything that cannot be demonstrated goes in the ledger as outstanding
  rather than being marked done.
- A phase that changes UI needs **a screenshot from a running build**,
  taken per `.claude/rules/verifying-ui.md` — the window must be
  frontmost, its bounds re-read immediately before any click, and the
  frame corroborated by state (a store read, or something only the new
  state could contain). A capture by window id is not evidence the click
  reached that window.
- Backend-only work takes no screenshot; a checkpoint containing one is
  rejected.
- The four pinned gates, run from the stated directory, in the dispatch
  that reports them: `npx vitest run` (repo root), `cargo test`
  (`src-tauri/`), `bunx tsc --noEmit`, `gitleaks detect` twice. A gate
  result is valid only for the tree at the moment it ran.
- Only Karthik declares an iteration closed.

## Shared checkout

Other sessions commit to this branch. `git log` cannot tell you who wrote
a commit — every commit authors as Karthik. Do not revert or clean up
changes you did not make; ask on `SendMessage`. In a file both sessions
have touched, stage by hunk and then commit with **no paths at all** —
passing the path re-adds the whole working-tree file and discards the
hunks you just staged.
