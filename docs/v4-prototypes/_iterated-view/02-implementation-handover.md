# Handover — taking the v4 prototypes into Hanger

**Status:** nothing implemented. Written 2026-08-23 at the end of the
design cycle. The prototypes are the specification; this file is the
order to build them in, what each phase depends on, and what is still
blocked.

---

## Two sessions, two models

Planning runs on the strong model; execution runs on a cheaper one. That
split only works if the plan carries every decision, so the executor
never has to make one.

**The planner owns:** reading the prototypes, extracting every literal
(class names, token names, px values, string content) into the plan,
resolving every open question into a written instruction, and deciding
task order and granularity.

**The executor owns:** nothing but doing what the plan says, verifying
it, and stopping when the plan does not fit.

### What a plan must contain to be executable by a cheaper model

This is the acceptance bar for the planning session. A plan that fails it
will produce guesswork downstream.

1. **One task = one commit = one red/green cycle.** No task bundles two
   concerns.
2. **Every literal is in the plan, not behind a reference.** A task may
   not say "match the prototype's card". It states the class, the token,
   the value, the exact string. The executor should never need to open an
   HTML file to know what to type.
3. **The failing test is written out** — its file, its name, its
   assertion, and what its failure message should say before the fix.
4. **The verification command is written out**, with the directory to run
   it from and the expected result. Not "run the tests".
5. **No task contains a choice.** If two approaches exist, the planner
   picks one and says why in a line. "Either X or Y" in a plan is a
   defect.
6. **Dependencies are explicit.** Task N states which tasks must be
   green before it starts.
7. **Each task has a stop condition** — the specific thing that means
   "this plan is wrong, stop and escalate" rather than "adapt".

Execution runs through `superpowers:subagent-driven-development`, which
dispatches a **fresh subagent per task**. That adds three requirements,
and they are the ones most likely to be missed:

8. **Every task is a complete standalone brief.** A subagent starts cold
   with no memory of the other tasks. No task may say "as in task 3", or
   rely on a convention established earlier, or assume a file is already
   open. Whatever a task needs, it restates — even if that means the same
   paragraph appears in six tasks.
9. **Every task is marked parallel-safe or sequential, with the reason.**
   The orchestrator needs to know what it can fan out.
10. **No two parallel-safe tasks touch the same file.** Concurrent
    subagents cannot see each other's edits, so two of them in one file is
    the shared-checkout problem in miniature — last writer wins and the
    other's work vanishes silently. If two tasks need the same file, they
    are sequential and the plan says so.

### The orchestrator verifies; it does not trust

A cheaper subagent reporting "I wrote the test and it passes" is not
evidence of anything — `verification.md` is explicit that a test written
after the implementation and passing on its first run has verified
nothing. The orchestrator checks each returned task for the **red run and
the green run**, and rejects the task if only the green is present. This
is the single highest-value check in the whole execution loop, because it
is the one a cheaper model will silently skip.

### The executor's standing contract

**Do not adapt. Stop.** A cheaper model improvising around a plan that
does not fit is the failure mode this split exists to avoid. When
reality and the plan disagree — a file is not where the plan says, a test
does not fail the way it should, a symbol does not exist — the executor
records it and halts that task. The planner fixes the plan.

### Which phases suit a cheaper executor

| Phase | Suits a cheap executor? |
|---|---|
| 1 — the map | **Yes.** Self-contained pane, mechanical once the plan carries the literals. |
| 2a — inspector body | **Yes**, with a long plan. Repetitive section-format work. |
| 2b — inspector header | **No — keep on the strong model.** It moves controls out of `App.tsx`'s cap row, which is the column's window drag region, and `App.tsx:1644-1648` already argues about where those controls belong. Cross-component state, a live architectural argument, and a rule that reads like a suggestion until you break it. |
| 3 — strip and track | **Yes**, once the two new tokens exist and the two rulings land. |

---

## Prompt 1 — planning (strong model)

> I am implementing the v4 inspector, map and summary-strip redesign in
> Hanger. **Do not write implementation code.** Your entire job this
> session is to produce implementation plans that a cheaper model can
> execute without making a single decision.
>
> Read, in this order:
> 1. `docs/v4-prototypes/_iterated-view/02-implementation-handover.md` —
>    the phase order, the dependency map, the invariants that bite, the
>    plan-quality bar, and the ten open rulings.
> 2. `docs/v4-prototypes/_iterated-view/00-gap-analysis-and-constraints.md`
>    — the feasibility analysis and every ruling with its date.
> 3. The three prototype pages, **opened in a browser, not only read as
>    markup**: `inspector-iterated.html`, `banner-iterated.html`,
>    `map-iterated.html`. Click the tabs, open the menus and popovers,
>    resize. Each page's legend at the foot is its specification.
> 4. `CLAUDE.md`, every file in `.claude/rules/`, `.claude/DESIGN.md`,
>    `docs/harness.md`.
>
> Then invoke `superpowers:writing-plans`. We have already brainstormed —
> do not re-enter brainstorming, and do not invoke any implementation
> skill.
>
> Write **one plan document per phase**, in the order the handover sets
> out, to `docs/superpowers/plans/`. Meet the plan-quality bar in the
> handover — in particular: extract every literal into the plan so the
> executor never opens a prototype; write out each failing test and each
> verification command; and leave no choices in any task. "Either X or Y"
> in a task is a defect.
>
> Phase 1 and Phase 2a are for a cheaper model — write them for a
> reader with no context and no judgement. Phase 2b stays with a strong
> model, so it may assume more, but say so at its head. Phase 3 is for a
> cheaper model.
>
> Where the handover lists an open ruling, the prototype's drawn state is
> the instruction. Write the drawn state into the plan as the decision,
> and note in one line that it is unruled so I can overrule it later.
>
> The fourteen unsigned strings go into the plans **verbatim as drawn**.
> Do not improve, shorten or re-word any of them, and do not invent new
> user-facing strings.
>
> Before you finish: re-read each plan against the code and check every
> symbol it names actually exists at the path and line you cite. Briefs
> that name symbols which have moved are the most common way this goes
> wrong. Report anything the prototypes assert that the code contradicts.

## Prompt 2 — execution (cheaper model)

> Execute the implementation plans in `docs/superpowers/plans/` for the
> Hanger v4 redesign, in numbered order, using
> `superpowers:subagent-driven-development`. Dispatch one subagent per
> task. Fan out the tasks the plan marks parallel-safe; run the rest in
> order. Never run two subagents in the same file at once — they cannot
> see each other's edits and the second silently discards the first.
>
> **Verify every returned task; do not trust its report.** A subagent
> saying the test passes is not evidence. Check that it shows you the
> test failing FIRST and then passing. A test that only ever passed has
> verified nothing — send that task back.
>
> Work in an isolated worktree — `superpowers:using-git-worktrees` first,
> because other sessions commit to this branch.
>
> **The plan is the specification. Do not adapt it.** If reality and the
> plan disagree — a file is not where the plan says, a symbol does not
> exist, a test does not fail the way the plan says it should — record it
> in the ledger and **stop that task**. Do not improvise a way around it,
> do not redesign, do not pick between options. A human will fix the
> plan. Improvising around a plan that does not fit is the one failure
> mode that matters here.
>
> Each subagent uses `superpowers:test-driven-development`: write the
> failing test the plan gives it, watch it fail, then make it pass. Each
> subagent's brief is the plan's task, whole — it starts cold and knows
> nothing of the other tasks, so pass it the task verbatim rather than
> summarising.
>
> Use `superpowers:systematic-debugging` the moment something misbehaves,
> before proposing a fix.
>
> After each task: commit. After each phase: run the four pinned gates
> from `CLAUDE.md` — `npx vitest run` from the repo root, `cargo test`
> from `src-tauri/`, `bunx tsc --noEmit`, and `gitleaks detect` twice —
> and paste their output verbatim with exit codes into
> `docs/v4-prototypes/_iterated-view/03-implementation-ledger.md`.
> Then continue to the next phase without waiting.
>
> **Never do these.** Edit a test, detector or allowlist to make
> something pass. Re-word a user-facing string. Invent a user-facing
> string. Run a destructive git operation. Mark a UI change verified
> without a screenshot from a running build.
>
> **Always stop for a human on:** a pinned gate that will not go green, a
> plan that does not fit the code, anything needing a design decision.

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
