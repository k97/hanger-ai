# --dev review: feat/repo-view-parity at 8a3d9a6

Artifact: branch feat/repo-view-parity, diff 37d76b4...8a3d9a6. Reviewer: independent subagent (Opus), combined with the SDD final whole-branch review; given the requests, the plan and rulings, CLAUDE.md Verification and the diff-review lenses only.

---

## Review 1: whole-branch code review

**Pinned at:** `feat/repo-view-parity` @ `8a3d9a6d4167afc7c9e4a4f27545838eb9f01dcc`, base `37d76b4`, 13 commits, no `docs/reviews/` hunks. The worktree was clean when I started and when I finished. I read the code, test and DESIGN.md hunks in passes by file group with `git diff 37d76b4..8a3d9a6 -- <paths>`. I did not read the three PNGs, and I only confirmed what the HTML prototype is.

**Gates I ran at the pinned head, each from the worktree root in its own call:**
- `npx vitest run`: 184 files, 1754 tests passed, exit 0.
- `bunx tsc --noEmit`: exit 0.
- `gitleaks detect --source .`: "no leaks found" (1682 commits).
- `gitleaks detect --source . --no-git -c .gitleaks.toml`: "no leaks found".
- `cargo test`: not run. `git diff --stat 37d76b4..8a3d9a6 -- src-tauri` is empty, a fresh worktree would build a whole new `target/`, and the rules say `cargo test` relaunches the dev app.

**Mutation checks**, in a temp worktree I have since removed:
- Removing `key={repoPaneRoot}`: "going from one repository to another… opens the next on All" fails.
- Dropping `|| onRepo` from the Esc guard: both repository Esc tests fail.
- `pending={false}`: the Scanning test fails.
- `pending={!assetCounts}`: all 1324 component and `__tests__` tests stay green. That branch has no test (Minor 2 below).

**Plan alignment.** Tasks 1 to 8 are all present. Task 9 is this gate plus captures that are still owed.
- The one change outside the plan's Interfaces is `storeCaption` on `OverviewCard`. Round 29 q4 (the kind's own noun on a tab) needs it, so it is justified.
- Global's behaviour is unchanged. `OverviewHost` is a verbatim move: `dockedCardShown` and the dock gate are equivalent. Global's only intended changes are the approved "1 asset" and the `MarkCell` wrapper.
- No `src-tauri/` change. Counts still come from the backend. Type roles, the token guard and the no-dialog guard are green.
- Forced test edits are named with their causes in `f840cce` and `b1ee307`. The `type-roles.test.ts` guard edit went in its own commit (`8a779f9`) ahead of the deletion. The `design_system_pane.test.tsx` INVENTORY edit was combined with the specimen swap, with the reason stated. I checked that the reason holds: the page and the list cannot be green apart.

### Critical
None.

### Important
None.

### Minor

**Triage of the ledger's deferred and parked items:**
- **The nested-paths scroller is not keyboard-scrollable** (`src/components/RepoPane.tsx:332`, `max-h-[120px] overflow-y-auto` with no `tabIndex`). This is a real regression: the band used to show every path unclipped, and WebKit does not make a scroller with no focusable children focusable. I judge it Minor, not a blocker:
  - Screen readers still read every path.
  - `Promote…`, the next Tab stop, opens `SidebarScanModal`, which lists every candidate with focusable checkboxes. A keyboard user can still reach every path.
  - It only affects folders with more than about 10 nested repos.
  - The fix is `tabIndex={0}` with `role="region"` and an `aria-label`. That label is a new screen-reader string, which needs a naming brief under `ui-copy.md`, so it belongs in a follow-up rather than this merge.
- **Untested pending branch** (`RepoPane.tsx:588`). Counts are present with a total of 0 before a scan finishes, which is the usual state for a newly linked repository. The code is correct, but Review Focus 5's pin only covers `assetCounts={null}`, and that is the case the plan's own test asked for. The mutation above proves this branch is unpinned. A one-test addition is recommended.
- **Repository predicate written inline five times in `App.tsx`** (`:648`, `:667`, `:1472`, `:2109-2112`, `:2331`), two of them new. This follows the file's existing idiom. Leave it.
- **No negative-route Esc test.** The old "Esc leaves the selection alone" was flipped and nothing replaced it, so a guard that cleared on every route would stay green. Minor.
- **The "ignores ⌘E without a cap slot" half was decoration.** Resolved in `caff853`: `fireEvent`'s return value now fails it.
- **DESIGN.md HeroBand/SummaryStrip paragraphs, "hero band's foot row" and the `RepoPane.tsx:594` cite.** Resolved in `8a3d9a6`.
- **`window_chrome_sheet.test.tsx` mock now lists the repository on all seven walked screens.** Harmless. Leave it.
- **The `reviewLines` comment order, `OverviewCard.test.tsx`'s missing blank line, and DESIGN.md's ragged rewrap.** Cosmetic. Leave them.
- **"renders with no onSelectEngine": the second half only asserts that nothing throws.** It may not fail if `?.` were reverted, depending on how React 19 reports event-handler errors. I did not check this. Minor.
- **`describe("RepoPane hero band and pill")`** (`RepoPaneBand.test.tsx:89`) and the file name `hero_band_wiring.test.tsx` are stale names. Minor.
- **Test helpers leak empty `<span>` caps into `document.body`.** Harmless. Minor.
- **The `OverviewHost` specimen binds ⌘E on the Design system page** (`DesignSystemPane.tsx:1145`). No cap slot exists on that route, so nothing conflicts. Leave it.
- **`SummaryStrip.tsx` now holds only `LinkStateLegend` and `StripReview`.** The name is misleading, but the plan kept the file. Leave it.
- **`DESIGN.md:2779` and `:2911` cite `RepoPane.tsx:581`.** That cite was already wrong at the base commit, so it is not this branch's fault. It is still worth replacing with a symbol cite.

**New findings (not in the ledger):**
- **False citations this branch introduced in `.claude/DESIGN.md`:**
  - `:204` and `:212` name `OverviewCard.tsx` as a user of `text-display`/`leading-display`. It uses neither; only `NeedsReviewPane.tsx:97` and `DesignSystemPane.tsx:416` do.
  - `:286` cites `OverviewCard.tsx` as a surface that "carries no fill", but the card is `bg-page/86`.
  - Each is a one-word fix and should ride along with the merge.
- **Stale prose in `.claude/DESIGN.md`:**
  - `:1821` still says the cap slot is drawn "on Global only".
  - `:1713` says "ProfilePane decides" whether the card docks; RepoPane decides too now.
  - `:2778` says the nested repos "have left for the hero".
  - The new 120px cap is missing from the caps paragraph at `:2909`.

### Declined to judge
- **The 12 blocked matrix rows** (engine marks, engine lens, Not loaded, tool counts, View control and the rest). Answer 7 sends them to a separate plan.
- **"Showing 7 of 89" against the card's total.** Round 31 q2 left it in known debt.
- **Where the docked card lands, the 32px lane clearance, and whether the card flashes on a repository switch.** happy-dom lays nothing out, so these are screenshot claims. From the code, `usePaneWidth` sets the width in a layout effect, so I do not expect a flash, but I did not see it.
- **A docked card over a repository's centred empty or pending plane at widths near the dock threshold.** This matches Global, whose empty states do not take `laneBoxClass` either, and parity is the ask. It is geometry, so I recommend including an empty repository in Task 9's captures.
- **Whether the `MarkCell` wrapper changes how Global's engine rows look.** Round 31's Global capture sits in gitignored `docs/evidence/`, so I could not open it.
- **The orphaned `engines_band_open` row left in existing stores.** The plan is silent and it is harmless.

**Verdict: Ready to merge.** The doc fixes and the pending-branch test are cheap and recommended, but none of them blocks. Merging does not close the iteration: Task 9's captures and Karthik's look are still owed.

---

## Review 2: stage-gate `--dev`

**Pinned at:** `8a3d9a6d4167afc7c9e4a4f27545838eb9f01dcc`, diff `37d76b4...8a3d9a6`, with `docs/reviews/` excluded (it had no hunks). Every code hunk traces to the request or to a ruling in rounds 28, 29 and 31. Code shrinks overall: the `HeroBand` component and the `SummaryStrip` default export are gone (about 300 lines), against `OverviewHost` (107) and about 78 new lines in `OverviewCard`.

```
File: src/components/RepoPane.tsx:588
Lens: Verification
Guideline: New behaviour with no test exercising it is a finding
Why: The "zero before a finished scan" half of `pending` (Review Focus 5) survives a mutation to `pending={!assetCounts}` with 1324 tests green.
Suggested action: One RepoPaneBand case: assetCounts {total:0,…}, loading, scannedAt null, docked; assert no /\d+ assets?/.
```
```
File: .claude/DESIGN.md:204, :212, :286
Lens: Verification
Guideline: A file:line citation is stale until you open it (verification.md); DESIGN.md cites code for every statement
Why: This diff names OverviewCard.tsx as a text-display/leading-display user and as a fill-less card surface; it is neither.
Suggested action: Drop OverviewCard.tsx from those three citations.
```
```
File: .claude/DESIGN.md:1713, :1821, :2778
Lens: Verification
Guideline: A change to a component's shape moves the DESIGN.md paragraph that cites it (coding-guardrails.md 3)
Why: "on Global only", "ProfilePane decides" and "left for the hero" are false since Task 6.
Suggested action: Reword the three phrases; add the 120px nested-paths cap to the caps paragraph.
```
```
File: src/__tests__/overview_pinned.test.tsx (Esc describe), src/__tests__/overview_dock.test.tsx:382
Lens: Verification
Guideline: A green control must be able to fail (verification.md)
Why: The only negative-route Esc test was flipped, so nothing pins that Esc leaves the selection alone off Global and repositories.
Suggested action: One case on e.g. "discovery" asserting the inspector keeps its subject.
```
```
File: src/__tests__/window_chrome_sheet.test.tsx:38
Lens: Surgical
Guideline: Touch only what the request requires
Why: The linked-directory mock now applies to all seven walked screens, not just the repository case it was added for.
Suggested action: None now (parked); scope it per screen if the file is next touched.
```
```
File: (plan Task 6 Step 7, Task 9)
Lens: Verification
Guideline: Seeing it (plan Global Constraints); verifying-ui.md
Why: Round 31 holds only 1024 × 700 light captures, docked and inspector-open; the popover on a repository, 1440 × 900, every tab, dark, and the side-by-side with Global are not captured.
Suggested action: Task 9's capture set through the MCP bridge, then Karthik's look.
```

Gates: vitest 184 files / 1754 tests, exit 0; `tsc` exit 0; both gitleaks runs "no leaks found". `cargo test` was skipped because nothing under `src-tauri/` changed.

| # | Finding | Lens | Blocks push? |
|---|---|---|---|
| 1 | Pending zero-before-scan branch untested (`RepoPane.tsx:588`) | Verification | No |
| 2 | False `OverviewCard.tsx` citations (`DESIGN.md:204`, `:212`, `:286`) | Verification | No |
| 3 | Stale prose (`DESIGN.md:1713`, `:1821`, `:2778`) | Verification | No |
| 4 | No negative-route Esc test | Verification | No |
| 5 | `window_chrome_sheet` mock widened to all screens | Surgical | No |
| 6 | Task 6/9 captures owed (popover, 1440, dark, side-by-side) | Verification | No (Karthik's gate; push only on his word) |

**Verdict: Ship.** There are no blocking findings. 1 to 4 are cheap enough to fold in before the push.

I skipped `cargo test`, the PNGs and the gitignored evidence captures, and I did not test whether React 19 rethrows errors from event handlers. The main risk Karthik should know: the paths beyond 120px can only be reached by keyboard through Promote…, and the fix needs a new aria-label string, so it has to go through the naming-brief process first.