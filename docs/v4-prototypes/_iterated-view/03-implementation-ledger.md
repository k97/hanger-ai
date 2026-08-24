# v4 implementation ledger

Gate output for each phase of the v4 redesign, pasted verbatim with exit
codes. The four pinned gates are `CLAUDE.md` → Verification: `npx vitest run`
from the repo root, `cargo test` from `src-tauri/`, `bunx tsc --noEmit`, and
`gitleaks detect` twice. A gate result is valid only for the tree at the
moment it ran.

Execution runs in an isolated worktree at
`.worktrees/v4-redesign`, branch `v4-redesign`, created from `main` at
`563d922`. Per-task progress, the preflight conflict scan and every ruling
live in `.superpowers/sdd/<plan-name>/progress.md` inside that worktree.

---

## Baseline — tree at `563d922`, before any Phase 1 task

Established so that every later red is attributable.

```
$ npx vitest run          # from the repo root

 Test Files  83 passed (83)
      Tests  698 passed (698)
   Duration  4.69s
```
exit 0

```
$ cargo test --manifest-path src-tauri/Cargo.toml

33 test suites, all "test result: ok."; 0 failed.
```
exit 0

```
$ bunx tsc --noEmit
(no output)
```
exit 0

---

## Phase 1 — the map

### Phase 1 complete-pending-hardening — gates at `c8be53a`

All seventeen plan tasks plus two Karthik-authorised additions are committed.
Task 17 (the screenshot) is human-gated and outstanding — see below. Phase 1
is recorded as **complete-pending-hardening**: the code is done and reviewed,
and a separate hardening pass Karthik is authoring will replace six tests
that pass without asserting what they name. That pass is additive and does not
block Phase 2a.

```
$ npx vitest run          # from the repo root

 Test Files  89 passed (89)
      Tests  729 passed (729)
   Duration  4.90s
```
exit 0  (baseline was 83 files / 698 tests — this phase added 6 files, 31 tests)

```
$ cargo test              # from src-tauri/

every suite "test result: ok."; 430 passed, 0 failed, 6 ignored.
```
exit 0  (baseline 33 suites, all ok)

```
$ bunx tsc --noEmit
(no output)
```
exit 0

```
$ gitleaks detect --source .
759 commits scanned.
scanned ~7043886 bytes (7.04 MB) in 2.29s
no leaks found
```
exit 0

```
$ gitleaks detect --source . --no-git -c .gitleaks.toml
scanned ~10123005 bytes (10.12 MB) in 663ms
no leaks found
```
exit 0

**Running-binary provenance at gate time** (see the SDD ledger for why this is
recorded): `find src-tauri/src -type f -newer src-tauri/target/debug/tauri-app`
returned empty, so the dev app's Rust side carries every backend change in the
tree. The same command shape against `src/` returns seven files, which is how
the empty result is known to be meaningful rather than a check that cannot
fire.

### Task 17 — screenshot, OUTSTANDING, awaiting Karthik

Not executed. The dev app is running from this worktree and Karthik is at the
keyboard; driving it with synthetic clicks while he is using it was not
something to do unasked. Handed to him with the two things the capture must
settle, both raised by reviewers as un-assertable in `happy-dom`:

1. **The `ListCard` divider** — that a divider is drawn only *between* rows,
   never beneath the last one and never on a one-row card. The unit test can
   only assert the class substring `[&>*+*]:border-t`, because Tailwind's
   compiled CSS never loads in the test environment.
2. **The state dot's ring** — that `stroke-page` reads as a cutout against the
   node's own `fill-page` surface rather than as a visible border.

---

### Phase 1 partial — gates at the stop, tree with Task 8 uncommitted

Tasks 1-7, 10 and 14 are committed (HEAD `9491d7e`). Task 8's work is in the
working tree, uncommitted, blocked on a plan defect (see the SDD ledger).
These gates therefore describe a tree that includes Task 8's edits.

```
$ npx vitest run          # from the repo root

 FAIL  src/components/LinkMapPane.test.tsx > LinkMapPane > draws one box per node and one visible path per edge
 AssertionError: expected [ SVGGElement{ …(2), …(40) }, …(4) ] to have a length of 4 but got 5

 ❯ src/components/LinkMapPane.test.tsx:84:49
     82|   it("draws one box per node and one visible path per edge", () => {
     83|     renderPane(graph());
     84|     expect(screen.getAllByTestId(/^map-node-/)).toHaveLength(4);
       |                                                 ^
     85|     expect(screen.getAllByTestId("map-edge")).toHaveLength(4);
     86|   });

 Test Files  1 failed | 88 passed (89)
      Tests  1 failed | 715 passed (716)
```
exit 1 — the single failure is the Task 8 blocker, not a regression.
Baseline was 83 files / 698 tests; the branch has added 6 files and 18 tests.

```
$ cargo test --manifest-path src-tauri/Cargo.toml

33 test suites, all "test result: ok."; 0 failed.
```
exit 0

```
$ bunx tsc --noEmit
(no output)
```
exit 0

```
$ gitleaks detect --source .
749 commits scanned.
scanned ~7011410 bytes (7.01 MB) in 1.96s
no leaks found
```
exit 0

```
$ gitleaks detect --source . --no-git -c .gitleaks.toml
scanned ~10098928 bytes (10.10 MB) in 649ms
no leaks found
```
exit 0



---

## Phase 2a — the inspector body

Complete. 33 commits across three parallel lanes — the Rust backend, the asset
inspector, and the MCP server panel — plus nine correction commits landing
Karthik's rulings of 2026-08-24.

### Gates at `d273c09`

```
$ npx vitest run          # from the repo root

 Test Files  90 passed (90)
      Tests  750 passed (750)
   Duration  4.93s
```
exit 0  (Phase 1 closed at 89 files / 729 tests; this phase added 1 file, 21 tests)

```
$ cargo test              # from src-tauri/

every suite "test result: ok."; 440 passed, 0 failed.
```
exit 0  (Phase 1 closed at 430)

```
$ bunx tsc --noEmit
(no output)
```
exit 0

```
$ gitleaks detect --source .
797 commits scanned.
scanned ~7158060 bytes (7.16 MB) in 2.62s
no leaks found
```
exit 0

```
$ gitleaks detect --source . --no-git -c .gitleaks.toml
scanned ~10196300 bytes (10.20 MB) in 666ms
no leaks found
```
exit 0

**Running-binary provenance:** `find src-tauri/src -type f -newer
src-tauri/target/debug/tauri-app` returns empty, so the dev app's Rust side
carries every backend change in the tree — including this phase's
`symlink_metadata` and `Option<i64>` work, which rebuilt and restarted the app.

### How the suite went green

Four tests stood red when the phase's implementation finished, and both causes
were resolved by ruling rather than by editing assertions:

- Three failed because the verdict card repeated, word for word, a sentence the
  Registered-in section already rendered on the same tab. The card now carries
  a detail line **only when the launches agree**; the diverging explanation
  stays beside the aligned diff that shows which part differs. **The three tests
  went green untouched** — `git diff` on the test file after the fix was empty.
- One failed because `UnderlineTabs` correctly marks the active tab with
  `aria-selected`, which a row-count assertion was matching. The query narrowed
  to `[data-selected="true"]` — what rows actually carry — at all three sites
  that had it, including two that were passing only by document order. No
  assertion's matcher or expected value changed, proved by an empty
  `git diff | grep "^[-+].*expect"`.

### Copy signed off

Thirty first-time strings had landed marked "unsigned" across both plans —
the convention those plans adopted, which `.claude/rules/ui-copy.md` does not
permit. Karthik reviewed both Copy tables on 2026-08-24 and five changes
followed: the finding chip now states a count (`{n} flagged`) rather than
promising an action two clicks away, with its accessible name finally matching
its visible text and its action naming its destination (`Needs review →`);
the summary strip's pill became `Needs review {n}` with no arrow, because it is
a filter toggle and nothing navigates; `In this skill` became `Contents`;
`runs commands` became `Shell access`; `Only drift and dangling` became
`Only drifted and dangling`, matching the map legend's own words.

### Task 17 and S1 — screenshots, OUTSTANDING, awaiting Karthik

Neither phase's screenshot has been taken. The dev app is running from this
worktree and Karthik is at the keyboard, so driving it with synthetic clicks
was not something to do unasked. Five things the captures must settle, all
un-assertable in `happy-dom`:

1. **The `ListCard` divider** — drawn only between rows, never beneath the last,
   never on a one-row card. The unit test can only assert a class substring,
   because Tailwind's compiled CSS never loads in the test environment.
2. **The state dot's ring** — whether `stroke-page` reads as a cutout against
   the node's own `fill-page`, or as a visible border.
3. **The finding popover's clamp** — its correction branch never executes under
   `happy-dom`, where every `getBoundingClientRect` is 0x0.
4. **The symlink row** in Contents — `LinkIcon` and an em dash, a controller
   ruling rather than a plan decision, and the one change here Karthik has not
   seen rendered.
5. **The new copy in situ** — the five strings above at real width.

---

## Phase 2b — the inspector header

**Complete**, run out of order after Phase 3. H1–H6 landed; H7 (screenshot) is
human-gated and outstanding. Fifteen commits: the `EllipsisVerticalIcon` the
plan wrongly assumed existed, `OverflowMenu` extracted from `ViewControl`,
`issuesForAsset`, `InspectorCap`, the wiring into `App.tsx`, and `DESIGN.md` —
plus four forced test-edit commits and four corrections, each committed
separately with its cause.

### Gates — run at `d6d99e2`, `git status --porcelain` empty

```
$ npx vitest run                      # from the repo root
 Test Files  95 passed (95)
      Tests  802 passed (802)

$ cargo test                          # from src-tauri/
binaries=36 passed=442 failed=0

$ bunx tsc --noEmit; echo "tsc exit=$?"
tsc exit=0

$ gitleaks detect --source .
INF 832 commits scanned.
INF scanned ~7298585 bytes (7.30 MB) in 2.74s
INF no leaks found
exit=0

$ gitleaks detect --source . --no-git -c .gitleaks.toml
INF scanned ~10313602 bytes (10.31 MB) in 1.34s
INF no leaks found
exit=0
```

Movement: frontend **766 → 802** (+36); backend unchanged at 442 — this phase
touched no Rust.

### A third defect, found by review rather than by the screenshot

**The inspector column could no longer be dragged.** The identity row took over
the strip carrying `data-tauri-drag-region`, and the plan instructed its root
to be `relative` so it would sit "above the drag overlay". Tauri's injected
`drag.js` starts a drag on a bare attribute only when the pointer's exact
target carries it — `if (attr === '' || attr === 'true') return el ===
composedPath[0]` — so a positioned, full-width root painting over the overlay
killed dragging across the whole strip. Found by reading the vendor's source,
confirmed against DOM paint order, and fixed by dropping that one class; each
of the row's children already carried its own `relative`, which is what keeps
the controls clickable.

This is the invariant the plan named as its own biggest risk, and it would
otherwise have been discovered by dragging a window that did not move.

Two plan Decisions were also found unimplemented (7: the review route did not
clear standing filters; 13: the title block's padding and border). Decision 13
turned out to be wrong as written — it assumes a tab row supplies the
separating line, which holds for only one of the four views sharing that
wrapper, so the border is now conditional on a tab row actually following.

### Two defects found during execution, both ruled on by Karthik

**A server was about to inherit its config file's findings.** `~/.claude.json`
typically declares ten servers, and the plan matched an asset's findings by its
path — which for a server is that shared file. A healthy server would have worn
a danger dot and a count belonging to a neighbour. Ruled: match by identity,
never by file. Now enforced by the type system (`AssetIdentity`), not by a
comment — the guard was watched rejecting the mixed shape (`TS2345`, `tsc`
exit 2) before being counted as working.

**Every clicked asset reported itself as Global.** Pre-existing and unrelated
to this plan: `handleSelectAsset` carried `scopeBadge`, a display string, but
never `scope`, the object `placeOf` reads — so `AssetDetail`'s Identity › Scope
row had been wrong all along, and the new cap eyebrow would have read
`SKILL · GLOBAL` for every project asset. Ruled: fix before the screenshot,
since that capture is the only evidence for the cap.

### Task H7 — screenshot, OUTSTANDING, awaiting Karthik

Two things here are unreachable by any test, and one of them is the invariant
this phase most risks:

1. **The window still drags from the inspector cap.** The identity row takes
   over the strip that carries `data-tauri-drag-region`. Drag the window by the
   cap and record that it moved (window bounds before and after, via
   CGWindowList). Nothing in the suite can confirm this.
2. **The measured shed.** A `useEffect` climbs a rung when the row overflows,
   and a `ResizeObserver` resets it when the row grows back. Under the test
   environment neither runs — `happy-dom` has a `ResizeObserver` whose
   `observe()` is a no-op, and `scrollWidth`/`clientWidth` stay 0 — so a broken
   threshold, a flipped comparison or a disconnected ref would pass every test.
   The collapsed states are driven in tests by a `forceShed` prop instead.

The plan's capture list: four shots at the 384px floor and at 480 (drag the
column edge; read `inspector_width` from the store to corroborate) — a skill
with a finding (chip + state dot), the ⋮ open at 480 (three items, no divider),
the ⋮ open at 384 (`Link to…` above a divider), and an MCP server (no ⋮ at all,
chip on the surface at every width).

The brief was to execute the plans in numbered order. Execution went
1 → 2a → **3**, and 2b was never dispatched: there is no
`.superpowers/sdd/2026-08-23-v4-phase-2b-inspector-header/` workspace, and
neither `InspectorCap` nor `OverflowMenu` exists under `src/components/`.
Its six tasks (H1, H3–H7) are all outstanding.

Phase 3's own header states "**Prerequisites:** Phases 1, 2a, 2b merged". That
line was read during Phase 3's preflight and not acted on — the miss is
recorded here rather than quietly repaired.

**Phase 3 did not depend on it in practice.** The same header adds that the
plan "touches none of their files except `SummaryStrip.tsx`", and the two
plans' file sets are in fact disjoint apart from `App.tsx`, where Phase 3 added
only the `mcpEngineSummary` state and its refresh. All four gates are green at
Phase 3's final tree, so nothing shipped broken — but 2b is real, unexecuted
work, and it is the change its own plan calls "the riskiest in the programme".

---

## Phase 3 — the strip and the track

**Complete.** S1–S7 landed; S8 (screenshot) is human-gated and outstanding.

Eight commits: `ce4ff2f` capsule tokens · `e40db04` `conflicting_server_count`
· `cb47be2` forced tablist test edit (red) · `e3f7960` `SegmentedTrack` ·
`e1c7c83` second forced test edit (red, controller ruling) · `2de751a` track
above strip · `a066c9e` strip MCP mode · `778c766` forced fixture edit (red) ·
`9509e63` panes feed the strip · `0532c44` DESIGN.md.

### Gates — run at `0532c44`, `git status --porcelain` empty

```
$ npx vitest run                      # from the repo root
 Test Files  92 passed (92)
      Tests  766 passed (766)
   Duration  5.75s

$ cargo test                          # from src-tauri/
binaries=36 passed=442 failed=0

$ bunx tsc --noEmit; echo "tsc exit=$?"
tsc exit=0

$ gitleaks detect --source .
INF 808 commits scanned.
INF scanned ~7207409 bytes (7.21 MB) in 2.17s
INF no leaks found
exit=0

$ gitleaks detect --source . --no-git -c .gitleaks.toml
INF scanned ~10236577 bytes (10.24 MB) in 710ms
INF no leaks found
exit=0
```

Movement: frontend **750 → 766** (+16), backend **440 → 442** (+2).

### Task S8 — screenshot, OUTSTANDING, awaiting Karthik

Two things here cannot be asserted in `happy-dom` at all, both proven by
mutation during review rather than assumed:

1. **The capsule's position.** Swapping `top` and `left` in `SegmentedTrack`'s
   positioning leaves all three of its tests passing, because every
   `offsetTop`/`offsetLeft`/`offsetWidth` is 0 under the test environment.
   "The capsule slides to the selection" — the point of the whole task — is
   confirmed by nothing but a real capture.
2. **The capsule's contrast**, which is outside `tokens_contrast.test.ts`
   permanently and by construction: that guard collects `bg-*` class names
   from `.tsx`, and the capsule's surface comes from the `capsule-raised` CSS
   utility, which exists precisely because no `.tsx` line may contain the word
   `shadow`. Measured by hand it is fine — `--ink-1` on `--capsule` is 21:1
   light, 15.7:1 dark — but nothing will notice if either token moves.

The plan's own capture list: Global with All (track above the strip); Skills
selected (headline and noun); MCP servers selected with the summary loaded
(coverage meter, facts line, the pill); the pill pressed (list filtered); and
the window narrowed until the source list sits beside a 368px pane, to show
the track scrolling. Read `selected_sidebar_item` before and after.
