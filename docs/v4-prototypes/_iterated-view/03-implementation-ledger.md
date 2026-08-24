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

Pending.

---

## Phase 3 — the strip and the track

Pending.
