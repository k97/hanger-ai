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

Pending.

---

## Phase 2b — the inspector header

Pending.

---

## Phase 3 — the strip and the track

Pending.
