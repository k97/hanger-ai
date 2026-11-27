# --plan review: docs/plans/2026-11-27-repo-view-parity.md

Artifact: docs/plans/2026-11-27-repo-view-parity.md (untracked, as written 2026-11-27), tree at a7a8f49. Reviewer: independent subagent, given the request, the plan, CLAUDE.md Verification and the plan-gate checklist only.

---

**Plan gate: `/Users/karthik/Work/Labs/hanger-ai/docs/plans/2026-11-27-repo-view-parity.md`, checked against the tree at `a7a8f49`**

## 1. Per-step table

| Step | Traceable to request? | Verifiable? | Notes |
|---|---|---|---|
| Phase 1 evidence + parity matrix | Yes: "parity" | Yes, mostly | All 10 cited SHAs resolve, and their subjects match the claims. Matrix counts check out: 13 drift, 11 intentional, 12 blocked, 5 same, 41 rows in all. |
| T1 Tabs in the lane, root drops `bg-page` | Yes (H3, H4) | Yes: red-first class tests plus the sheet walk | The root also lacks `relative`, and T6 depends on it (see findings). |
| T2 Review follows the tab | Yes (H18) | Partly. The test body is only comments, but its inputs and expected output are named. | The rationale is half-true (see false claims). |
| T3 `OverviewHost` extraction | Yes, if Q1 = Yes. It is speculative if Q1 = "only small changes". | Yes: new tests red because the file is missing, plus four named guards kept unedited | `laneBoxClass` is private to `ProfilePane`, and the plan never moves or exports it. |
| T4 Human gates G1/G2 | Yes. The copy and shape rules require them. | Observable: Karthik's picks | Good: it stops and goes through Plannotator, as asked. |
| T5 Card takes repository props | Yes | Yes for the three new props | It has no prop for the pending state that Review Focus 5 needs. `EngineCountRow` misstates `HeroBandRow`. |
| T6 Repository opens with the card | Yes | Partly. Focus 3 (repo to repo) and Focus 5 have no implementing step. The dock's position can't be checked in happy-dom. | The list of forced test edits leaves one out (`hero_band_wiring`). |
| T7 Retire HeroBand / SummaryStrip | Yes, only if Q1 = Yes | Yes: a grep pre-check, then the gates | Guard edits go in a separate commit, as the rules require. |
| T8 Esc on a repository | Yes, only if Q4 = Yes | Yes: red-first test | |
| T9 Live check and hand-off | Yes | Yes: captures plus `stage-gate --dev` on a bounded range | |
| Questions Q1–Q7 | Yes | n/a | Q1, Q4 and Q7 surface the real forks. |

## 2. Findings

**Unstated assumptions**
- **The dock has no positioned parent on a repository.** `OverviewHost` docks the card with `absolute right-3 top-3`. `ProfilePane`'s root is `relative` (`ProfilePane.tsx:1427`). `RepoPane`'s root is `flex-1 flex flex-col min-h-0 overflow-hidden bg-page font-sans` (`RepoPane.tsx:547`), with no `relative`. T1 and T6 both leave it out, so the card would anchor to App's `<main … relative>` and sit over the window bar. happy-dom cannot see this, and T6's tests only check that the dock exists.
- **`laneBoxClass` is module-private** (`ProfilePane.tsx:227`, `const laneBoxClass = …`). T3 says "the pane keeps" it, and T6 uses it "as `ProfilePane` does". No step moves it to `utils/overviewLayout.ts` or exports it.
- **`RepoPane` has no `key`** (`App.tsx:2339`, under `selectedSidebarItem.startsWith("/")`). Going from one repository to another keeps the same instance. That keeps `internalCategory` (already true today) and, after T6, the host's popover-open state. Review Focus 3 says both are pinned. T6's only test covers leaving a repository, and no step adds a key or a reset.
- **The card can't stay quiet before the scan.** `OverviewCard` prints `storeAssetsLabel(storeTotal)` unconditionally (`OverviewCard.tsx:178`, `:218`). With `assetCounts` null, `stripTotal` is 0 and the card reads "0 assets" before `scannedAt`. Review Focus 5 / T6 says the card "asserts no absence", but T5's interface adds no pending prop.
- **A required prop is missing.** `onSelectEngine` is required in `OverviewCardProps` (`OverviewCard.tsx:62`). T6's card prop list leaves it out, so `tsc` fails unless T5 makes it optional.

**Silent interpretation picks**
- **The Spec line is presented as a quote, but it is a paraphrase.** Its "Header first." is not in the user's words ("whatever header changes in global…", "make sure the repoview is similar to the global view, parity"). The order of work it implies was picked, not asked for.
- **Four rows are classed "intentional" by the plan's own judgment, with no question asked:** H20, L11, L14 and L15. L12 cites "a repo's own skills later", which is a deferral, so it is closer to "blocked" than "intentional".
- **Parity was read two ways at once.** One reading is the same component and the same behaviour. The other is the same look with the repository's own figures (H2, H14). The plan takes the second without naming the first. Q2 covers it only for the engine section.

**Speculative scope**
- T3 and T7 only make sense if Q1 = Yes. The plan says "the questions come first" but does not mark T3 as conditional, the way T8 is marked.

**Weak criteria**
- T2 Step 1 is a comment skeleton, so the red run is not pinned to concrete assertions.
- T5 and T6 Step 3 just say "Implement." That holds up only because the tests carry the spec, and Focus 3 (repo to repo) and Focus 5 have no test asserting them.
- Dock placement (top-right, inside the pane) is layout. It needs a capture, not a class check. T6 Step 7 captures, but doesn't name this as something to check.

**False claims, with the check that disproves each**
1. **"`hero_band_wiring.test.tsx` › 'each pane's pill gets only the issues…' must pass unedited."** Its case "the project pane sees its own issue…" clicks a bare `screen.getByText("Needs review 1")` on the strip. After T6 the pill sits inside the card. In happy-dom the card doesn't dock (width 0) and stays behind the popover, so this test needs an edit the plan doesn't list. Check: `sed -n 159,170p src/__tests__/hero_band_wiring.test.tsx`.
2. **"App does not know a repository's tab."** App passes `selectedCategory={selectedSidebarItem.includes(":") ? … split(":")[1] : null}` to `RepoPane`. It knows the tab set by the route, just not tab clicks inside the pane (`onCategoryChange` really is not passed). The conclusion, narrowing inside `RepoPane`, still holds. Check: `sed -n 2339,2345p src/App.tsx`.
3. **"`EngineCountRow` = today's `HeroBandRow` fields, moved here."** `HeroBandRow` also has `secondary?` and `word`, and its `value` is `number | string | null`, not `number`. Check: `grep -n "interface HeroBandRow" -A12 src/components/HeroBand.tsx`. `RepoPane.tsx:245` sets `word`.

**Claims confirmed true:**
- Cap slot only on `profile` / `global*` (`App.tsx:2119`).
- `RepoPane` root has `bg-page`, and its facet block is `flex items-center gap-3 > min-w-0 flex-1` (`RepoPane.tsx:547`, `:554`, `:560`).
- `window_chrome_sheet` walks six screens and no repository (`:173`).
- `storeAssetsLabel(1)` → "1 assets".
- `discover_machine_at` filters `HomeRelative | SystemAbsolute`, and `look` calls it.
- The annotations comment exists (`annotations.rs:111`).
- Esc is guarded by `isGlobalItem` (`App.tsx:1484`).
- `mr-[306px]` and `DOCKED_LANE_CLEARANCE` (324) are as described.
- Every cited test file and test name exists.

## 3. Verdict

**Needs answers.** Blocking questions, in the order they block:
1. Q1: does the card replace the strip? T3, T5, T6 and T7 depend on it, so T3 should be marked conditional.
2. Q2 and Q6: what goes in the card's first section on a repository, and does anything fold? These fill in T5's interface.
3. Plan fix: add `relative` to `RepoPane`'s root in T1 or T6, and say where `laneBoxClass` moves.
4. Plan fix: how does the card stay quiet before the scan (Focus 5)? Add the prop to T5's interface and a test to T6.
5. Plan fix: repo-to-repo navigation. Key `RepoPane` on `repoPaneRoot` or reset the state, and add a test for Focus 3 between two repositories.
6. Plan fix: add `hero_band_wiring` › "the project pane sees its own issue…" to T6's forced-edit list, and correct the `EngineCountRow` and "App does not know the tab" wording.
7. Q3, Q4 and Q5 can wait until T6 and T8.

I didn't run any gate or test. Every claim above comes from reading files and grepping at `a7a8f49`. I didn't open `.claude/DESIGN.md` or the round-14/18/21 decision files to check the rulings the plan cites.