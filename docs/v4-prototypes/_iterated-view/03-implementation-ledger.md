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
