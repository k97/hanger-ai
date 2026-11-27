# A Repository Gets Global's Header, Then Global's List: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A repository screen opens the way Global does: kind tabs in the list's lane, the overview card (docked, popover, ⌘E) in place of the summary strip and its "By engine" band, and a list that matches Global wherever the backend has the data.

**Architecture:** Frontend only. The overview card's chrome (the cap button, the popover, the docked frame, ⌘E) moves out of `ProfilePane` into one component both panes render. `OverviewCard` gains three optional props so a repository can fill it with its own figures. `RepoPane` drops `SummaryStrip` and `HeroBand`; App gives it the cap slot, `inspectorOpen` and `overview_hidden`. Everything in the list that needs per-repository reach, engine contexts or grouped servers is blocked on backend work and stays out (matrix, "blocked").

**Tech Stack:** React 19, TypeScript, Tailwind v4 tokens, shadcn on Base UI (`ui/toggle`, `ui/tooltip`), Vitest + Testing Library in happy-dom.

**Spec:** Karthik's words, 2026-11-27, verbatim: "whatever header changes in global, lets write a plan to bring that into the repo view" and "lets also make sure the repoview is similar to the global view, parity". Doing the header first is this plan's ordering choice, not his: the header is what he named first, and the list is already mostly carried (`aa5e5ee`, `487dbfe`). The Global header it refers to was built by `docs/plans/2026-11-26-overview-card.md`, `docs/plans/2026-11-26-global-list.md` and `docs/plans/2026-11-25-ia-global-by-engine.md`, with rulings in `docs/plans/2026-11-26-decisions-round-14.md` (q2, q4), `-round-18.md` (q1 to q4) and `-round-21.md`.

**Status:** Draft. `stage-gate --plan` returned "Needs answers" (`docs/reviews/2026-11-27-plan-2026-11-27-repo-view-parity.md`); its plan fixes are applied below. The questions at the end come first.

**What runs depends on Q1.** If Q1 is "Yes", Tasks 1 to 9 run, Task 8 only if Q4 is "Yes". If Q1 is "Only the small changes", only Tasks 1, 2, 8 (if Q4) and 9 run: Tasks 3, 5, 6 and 7, and G1 of Task 4, exist only to put the card on a repository.

## How the Global header got here (evidence, Phase 1)

Commits on `ProfilePane.tsx`, newest first, that changed what sits above the list (`git log -- src/components/ProfilePane.tsx`):

| Commit | What it did to Global | Carried to a repository? |
|---|---|---|
| `cbebe86` | Kind tabs keep their counts when narrow (`CategoryFilterCards`, shared) | Yes, by sharing the component |
| `7d70ef6`, `c5706c4` | The card docks at the top right when the pane keeps a 560px column (`shouldDockOverview`), the lane box keeps 324px clear (`laneBoxClass`, `DOCKED_LANE_CLEARANCE`), the pin goes, `overview_hidden` | No |
| `82ea45f` | Kind tabs on shadcn `Tabs` | Yes, by sharing the component |
| `e42461e` | Kind tabs move into the list's lane ("Facet chips, in the list's lane so they share the rows' left edge") | No: `RepoPane` keeps a full-width `min-w-0 flex-1` wrapper |
| `10e0bc8` | The overview card replaces the engine chips and the summary strip | No: `RepoPane` keeps `SummaryStrip` and `HeroBand` |
| `962ad04` | The card opens from the window bar, ⌘E | No: App renders `overview-cap-slot` only when `selectedSidebarItem` is `profile` or starts with `global` |

What was carried, and by which commit: `aa5e5ee` gave a repository `ListRow`, the lane, `GroupTicks` and quiet `GroupHead`s; `487dbfe` gave both panes `MessageScroller` items and the tick HoverCard.

Why the repository kept its strip: Task 4 of `docs/plans/2026-11-26-global-list.md` said "The repository summary strip stays", and `.claude/DESIGN.md` ("The lane and group heads, on Global and on a repository") records "On a repository (Task 4) only the list does: its facet row and summary strip keep their full-width blocks." Those were plan decisions, not rulings Karthik made on the repository; today's ask supersedes them. `docs/plans/2026-11-25-ia-global-by-engine.md` Q6 (approved) deferred the engine selector on a repository to "Phase 3", backend "probably none". The code says otherwise: see the matrix's blocked rows.

## Parity matrix

Every visible part of Global, its state on a repository, and what to do. "Drift" is brought over by this plan. "Intentional" stays different, with the reason. "Blocked" needs backend data that does not exist; the data is named.

### Header

| # | Global's part (evidence) | On a repository (evidence) | State | Class | Why, or what it needs |
|---|---|---|---|---|---|
| H1 | Kind tabs, `CategoryFilterCards` on `ui/tabs` (`ProfilePane` render) | Same component (`RepoPane` render) | same | | |
| H2 | Tab counts are global-scope figures: `assetCounts.byCategory.*.global`, All is `sumGlobalAssets` | `assetCounts.byCategory.*.total` and `assetCounts.total` from `get_asset_counts({ root })` (`App.tsx` → `fetchRepoCounts`) | different | intentional | A repository's tabs count its own root. |
| H3 | Tabs sit in the lane: `laneBoxClass(dockedCardShown)` > `px-[18px] pt-[18px] pb-3.5` > `laneClass(laneWide)` | `px-[18px] pt-[18px] pb-3.5 flex items-center gap-3` > `min-w-0 flex-1`, no lane | different | drift | `e42461e` never reached `RepoPane`. Task 1. |
| H4 | Pane root paints no ground: `relative flex-1 flex flex-col min-h-0 overflow-hidden font-sans` | Root carries `bg-page`, which squares off the content sheet's top corners; `window_chrome_sheet.test.tsx` walks six screens and no repository | different | drift | The standing sheet-corner rule (memory `every-screen-carries-the-sheet-corner`). Task 1. |
| H5 | The overview card is the summary (`OverviewCard`, built as `overviewCard` in `ProfilePane`) | `SummaryStrip` with `HeroBand` as its child | different | drift | Today's ask. Tasks 5 and 6. |
| H6 | Cap button: `Toggle` + `Tooltip`, `overviewButtonLabel`, portalled into App's `overview-cap-slot` | Absent: the slot renders on Global only (`App.tsx`, content cap `<header>`) | missing | drift | Tasks 3 and 6. |
| H7 | ⌘E toggles the card, ignored in a text field (`isTextEntryTarget`) | Absent | missing | drift | Tasks 3 and 6. |
| H8 | Docks at the top right (`shouldDockOverview(paneWidth, inspectorOpen)`, `data-testid="overview-dock"`, `absolute right-3 top-3`) against a `relative` pane root, lane box `mr-[306px]` (`laneBoxClass`, private to `ProfilePane.tsx`) | Absent; `RepoPane` gets no `inspectorOpen`, and its root has no `relative`, so an absolute card would anchor to App's `<main … relative>` | missing | drift | Tasks 1, 3 and 6. |
| H9 | Popover when not docked (`OverviewPopover`) | Absent | missing | drift | Tasks 3 and 6. |
| H10 | `overview_hidden` preference, App's `toggleOverviewHidden` | Absent | missing | drift | Shared or separate: Q3. Task 6. |
| H11 | Engines section: All engines, then engines ranked by `on_tokens_measured` (`rankEngines`, `engineRowValue`) | Absent | missing | blocked | The figures are the machine's: `get_engine_contexts` → `mcp::switch::ops::contexts_for` → `look` → `discover_machine_at`, which reads only `HomeRelative` and `SystemAbsolute` sources. A repository's own `.mcp.json` (`RepoRelative`, `discover_repo`) is in no context. Needs a repository-scoped context. Q2. |
| H12 | Picked engine and the engine lens (`selectedEngine`, `reachFor`, `inEngineFilter`, `leadEngine`) | Absent | missing | blocked | `annotations::asset_annotations` says "Project-scoped assets are not annotated here; the repo pane keeps its own columns by ruling", so `reachFor` has no verdict for any repository row; and H11's contexts hold none of its servers. Needs `get_asset_annotations` for a root, and H11. |
| H13 | Budget: `EngineSection` ("≈ N tokens every session", kind rows, Measure all) | Absent | missing | blocked | Depends on H11 and H12. |
| H14 | (Global has no per-engine asset count) | `HeroBand` "By engine": `assetCounts.engines` rows, "none" last, hidden on a category tab (`engineRows`, ruling recorded in `e0bc07d`) | different | intentional | The content is the repository's own and stays. Its place moves with H5: G1 decides where. |
| H15 | Store section: `STORE_HEAD` "The global store", caption `storeAssetsLabel(storeTotal)` | Numeral `stripTotal` and subtitle "assets in ‹repo›" / "‹kind› in ‹repo›" (`stripSubtitle`) | different | drift | The card needs a repository head and caption: G2 naming brief. `storeAssetsLabel(1)` prints "1 assets" (`overviewCopy.ts`), the shape `known-debt.md` saw as "1 assets in rkarthik". |
| H16 | Link-state legend in the card (`LinkStateLegend`, `legendCounts`) | Same component inside `SummaryStrip`, `linkStateCounts(inventory, { kind: "repo", root })` | different | drift | Moves with H5; the figures stay the repository's. |
| H17 | Needs review row in the card (`StripReview`, `ReviewPillActions`) | The strip's pill, same `StripReview` (`review` in `RepoPane`) | different | drift | Moves with H5. |
| H18 | Needs review follows the tab: App passes `issues` filtered by `profileActiveCategory` | App passes `review.issues.filter((i) => i.whereKeys.includes(repoPaneRoot))`, never narrowed by tab | different | drift | Task 2. |
| H19 | MCP mode: on MCP servers the review lists disagreeing servers (`mcpMode`, `conflictingRows`) | Absent | missing | blocked | Needs grouped rows with an `agreement` verdict for a root: `get_repo_mcp_servers` (`docs/roadmap.md`, "Repo-scoped MCP grouping"). |
| H20 | Unaccounted processes in the review lines (`processLines`, `get_mcp_processes`) | Absent | missing | intentional | A running process is the machine's, not a repository's. |
| H21 | Rescan and the scan stamp in the card's action row | The strip's Rescan button | different | drift | Moves with H5. |
| H22 | (none) | Nested repositories: `HeroBand` foot, paths, depth note, Promote… (`nestedFoot`) | different | intentional | A repository fact. Its strings say "counts towards this row", which is the band; a new home needs new words: G1, G2. |
| H23 | (none) | macOS access panel, Choose Folder Again / Retry Scan (`tccWarnings`) | different | intentional | A repository fact. Docked, the card must not cover it (Review Focus 4). |

### List and inspector

| # | Global's part (evidence) | On a repository (evidence) | State | Class | Why, or what it needs |
|---|---|---|---|---|---|
| L1 | Two-line `ListRow`s | Same (`aa5e5ee`) | same | | |
| L2 | Lane, `GroupTicks`, tick HoverCard, `MessageScroller` items | Same (`aa5e5ee`, `487dbfe`) | same | | |
| L3 | Quiet `GroupHead` with the backend's figure (`*HeadFigure`) | Same, with the same pre-answer fallback (`known-debt.md`) | same | | |
| L4 | Line 2 left: the file's description (`listRowDetail`) | The Engine word (`repoRowDetail` → `formatEngineLabel`); skill rows carry no `description` | different | intentional | Task 4 of the global-list plan moved the columns' words "moved, not rewritten". With no engine marks (L6) the word is a repository row's only engine signal. Q5. |
| L5 | Line 2 right: beyond-the-store words or "Global only" (`listRowFigure`, from the annotation) | The State word (`repoRowFigure` → `getRowState`) | different | blocked | Needs H12's annotations for a root. |
| L6 | Engine marks (`reach={annotation?.reach}`) | `reach={null}` | missing | blocked | H12's annotations. |
| L7 | Tile switches (`tileSwitchFor`, `useMcpSwitch`) | Absent | missing | blocked | H11: a repository's registrations are in no context, so no key to switch. |
| L8 | Server status sentence and tool count (`cardSecondLine`, `toolCount` from `get_mcp_servers`) | Per-registration rows only | missing | blocked | `get_repo_mcp_servers` (roadmap). Also `known-debt.md`: "A repo's MCP rows have no annotation and no tool count". |
| L9 | View control on the first head (`ViewControl`, `serverGrouping`, `serverSort`) | Absent; `RepoPane`'s own comment says a control "would be inert chrome" | missing | blocked | `get_repo_mcp_servers`, and `fetchRepoCounts` passing grouping (roadmap). |
| L10 | Config problem rows (`configProblemRows` from `get_mcp_coverage`) | Absent | missing | blocked | `get_mcp_coverage` calls `discover_machine`; a root's problems need a repository-scoped coverage. |
| L11 | "Switched off" servers (`CollapsibleGroup`, `get_kept_off_servers`) | Absent | missing | intentional | Switches act only on H11's machine contexts, so nothing a repository declares can be kept; `KeptOffServer` has no root field either. |
| L12 | "Switched off" skills (`KeptSkillsGroup`, `get_kept_skills`) | Absent | missing | intentional | The skill switch covers direct children of `~/.agents/skills` only (`docs/plans/2026-11-26-skill-switch.md`, round 10 Q2: "a repo's own skills later"). |
| L13 | "Not loaded by ‹engine›" (`NotLoadedGroup`) | Absent | missing | blocked | H12. |
| L14 | Agents group on the Agents route | No Agents section (`RepoPane` comments on `nothingToShow`, `isAllEmpty`) | missing | intentional | An engine is the machine's, not a repository's. |
| L15 | Empty and pending planes (`pendingState`, `emptyState`, A.1/A.2) | Own planes and copy, `FolderSyncIcon` (`isRepoPending`, `isRepoEmpty`) | different | intentional | `.claude/DESIGN.md` › "Empty is a finding, pending is not" records both sets of strings. |
| L16 | Foot line: Showing n of N, scan status | Same, plus "N nested repos counted here" | same | | |
| L17 | Esc clears the inspector's subject (`App.tsx`, `isGlobalItem` guard) | Absent | missing | intentional | Round 14 q4: "Esc clears the selection only on Global, where it brings the card back". The card-coming-back half went with the pin (`c5706c4`). Q4. |
| L18 | Inspector Reach card (`AssetDetail` draws `ReachCard` when `annotation.reach` is non-empty) | Never drawn for a repository asset | missing | blocked | H12. |

**Counts:** 13 drift (H3 to H10, H15 to H18, H21), 11 intentional (H2, H14, H20, H22, H23, L4, L11, L12, L14, L15, L17), 12 blocked (H11 to H13, H19, L5 to L10, L13, L18), 5 same (H1, L1 to L3, L16). Every list difference is intentional or blocked, so the list needs no task beyond Q4 and Q5.

## Global Constraints

- **No backend change.** Nothing under `src-tauri/` changes; a task that would need it stops and reports (`verification.md`, Scope). So no per-kind count capture is required (`shared-asset-machinery.md` applies to scanner work).
- **Gates,** each in its own call, from the repo root unless stated: `npx vitest run`; `cargo test` from `src-tauri/`; `bunx tsc --noEmit` (report the exit code); `gitleaks detect --source .`; `gitleaks detect --source . --no-git -c .gitleaks.toml`. A result holds only for the tree it ran on (`shared-checkout.md`). `cargo test` relaunches the dev app: never alongside a capture.
- **Counts come from the backend.** No `.length` count, no new allowlist entry in `no-frontend-counting.test.ts`. A filter that narrows lines (Task 2) is not a count; `reviewLineCount` stays the one allowlisted figure.
- **Tokens only** (`no-off-token-styles.test.ts`), type roles from `typeRoles.ts`, no blocking dialogs.
- **Copy:** every new string goes through a naming brief, `/humanizer`, and Karthik's sign-off before it lands (`ui-copy.md`). Reused strings: "By engine", "Needs review", "Rescan", "Scanning", "Promote…", "Show overview  ⌘E", "Hide overview  ⌘E", `storeAssetsLabel`, the nested-repo and depth-cap lines.
- **Shape:** the repository card's layout is a new shape. Render the options at true width in real tokens and let Karthik pick before code (memory `design-options-before-building`).
- **Red first.** A test that passes on its first run proves nothing. A test edit forced by a behaviour change is named in its commit body with its cause, and committed separately unless no ordering keeps both commits green (`verification.md`, Checkpoints).
- **Design system:** a new component gets a specimen (`design-system-coverage.test.ts`); a changed shape moves its `.claude/DESIGN.md` paragraph in the same commit, citing symbols, not lines.
- **Seeing it:** happy-dom lays nothing out. Every task that changes the screen ends with dev-app captures through tauri-plugin-mcp-bridge (`verifying-ui.md`: filter CGWindowList by the dev pid, assert the `Hanger AI (dev)` title, name the theme, read `selected_sidebar_item` and put it back). Karthik looks before the next task starts.
- **Commits:** you are not alone on `main`. Read `git status` and `git diff HEAD --name-only` first; stage only your files by explicit path; if a peer holds hunks in a file you touch (`src/App.tsx` is the usual one), stage by exact blob per `shared-checkout.md`. Commit in its own Bash call (the hook refuses any call containing `-n`). No push.

## Review Focus

1. **A repository with one asset.** The card says "1 asset", not "1 assets" (`storeAssetsLabel`), if G2 approves the singular. Pinned in Task 5.
2. **A category tab.** The per-engine rows are hidden, as `engineRows` hides them today (a root-wide figure beside a kind's figure read as one claim, `e0bc07d`); the nested-repository section stays, since it is about the root. Pinned in Task 6.
3. **Leaving a repository with the popover open, for Global or another repository.** The popover closes, ⌘E acts on the pane on screen, and `RepoPane`'s internal tab does not leak into the next repository. Today App renders one unkeyed `RepoPane` for every route that starts with `/` or `~`, so going from one repository to another keeps the same instance and its `internalCategory` (and, after Task 6, the host's popover state). Task 6 keys it on `repoPaneRoot` and pins both, between two repositories.
4. **A macOS-blocked repository at a docked width.** The access panel sits inside the lane box, so the docked card does not cover Choose Folder Again. Pinned in Task 6.
5. **A repository whose scan is still running.** The card renders, says Scanning in its action row, and its store section asserts no absence before `scannedAt` (pending is not a finding). `OverviewCard` prints `storeAssetsLabel(storeTotal)` unconditionally today, so without a change a repository with no counts yet would read "0 assets". Task 5 adds a `pending` prop; Task 6 pins it.

---

### Task 1: The kind tabs sit in the lane, and the pane paints no ground of its own

**Files:**
- Modify: `src/components/RepoPane.tsx` (the facet block; the root `div`: drop `bg-page`, add `relative`), `.claude/DESIGN.md` ("The lane and group heads, on Global and on a repository"; "Pane composition", whose track classes and line citations are already stale)
- Test: `src/components/RepoPaneList.test.tsx`, `src/__tests__/window_chrome_sheet.test.tsx`

**Interfaces:** Consumes `laneClass(wide: boolean): string` from `utils/listLane.ts`. Produces nothing new. Task 6 wraps this block in `laneBoxClass`.

- [ ] **Step 1: Write the failing tests.**

In `RepoPaneList.test.tsx`, inside `describe("a repository's list")`:

```tsx
it("puts the kind tabs in the list's lane, so they share the rows' left edge", () => {
  renderPane();
  const box = screen.getByRole("tablist").closest('[class*="max-w-[736px]"]');
  expect(box).not.toBeNull();
  expect(box!.className).toContain("px-12");
});
it("narrows the tabs' lane with the list's", () => {
  renderPane({ forceLane: "narrow" });
  expect(screen.getByRole("tablist").closest('[class*="max-w-[736px]"]')!.className).toContain("px-3");
});
it("is its own positioned box, so a docked card anchors to the pane and not to the window", () => {
  const { container } = renderPane();
  expect((container.firstElementChild as HTMLElement).className.split(/\s+/)).toContain("relative");
});
```

(`renderPane` returns `{ onSelectAsset }` today; add `container` from `render`'s result to what it returns.)

In `window_chrome_sheet.test.tsx`, add the repository route `"/home/user/project"` to the first `for (const screen of [...])` walk (the left corner and "the pane paints no ground over it"). If the mocks need a linked directory for that route to render, add it in that file's mock, nowhere else.

- [ ] **Step 2: Run them.** `npx vitest run src/components/RepoPaneList.test.tsx src/__tests__/window_chrome_sheet.test.tsx`. Expected: FAIL, "expected null not to be null", the missing `relative`, and "pane root paints bg-page over the sheet".
- [ ] **Step 3: Implement.** The facet block becomes `<div className="px-[18px] pt-[18px] pb-3.5"><div className={laneClass(laneWide)}><CategoryFilterCards … /></div></div>`, as on Global. The root becomes `relative flex-1 flex flex-col min-h-0 overflow-hidden font-sans`, `ProfilePane`'s root classes. `pane-block-rhythm.test.ts` must stay green unedited.
- [ ] **Step 4: Run the gates.** Expected: all green.
- [ ] **Step 5: Commit** `feat(repos): the kind tabs sit in the list's lane, and the pane paints no ground`.
- [ ] **Step 6: Capture** a repository at 1024 × 700 with the source list collapsed: the tabs' left edge on the rows', and the sheet's top-left curve visible. Stop for Karthik.

### Task 2: Needs review follows the tab on a repository

**Files:**
- Modify: `src/components/RepoPane.tsx` (`reviewLines`)
- Test: `src/components/RepoPaneBand.test.tsx`

**Interfaces:** Consumes `ReviewIssue.category: IssueCategory` (`utils/reviewIssues.ts`). The narrowing lives in `RepoPane`, not App. App passes `RepoPane` the tab a route names (`selectedCategory`, from the `:` suffix of `selectedSidebarItem`), but it never hears of a tab clicked inside the pane: `RepoPane` declares `onCategoryChange` and App's call passes none. Only the pane knows the tab on screen in both cases.

- [ ] **Step 1: Write the failing test** in `describe("RepoPane hero band and pill")`, with the file's own `base` fixture (one non-TCC parse warning in `parse_warnings`):

```tsx
it("a category tab narrows this repository's review lines to that kind; scan warnings stay", () => {
  const skill = { id: "s1", name: "math", category: "Skills", kind: "broken", problem: "Target is gone", path: "/Users/test/proj/math", whereLabel: "proj", whereKeys: ["/Users/test/proj"], crossRepo: false };
  const rule = { id: "r1", name: "style.md", category: "Rules", kind: "broken", problem: "Rule target is gone", path: "/Users/test/proj/style.md", whereLabel: "proj", whereKeys: ["/Users/test/proj"], crossRepo: false };
  render(<RepoPane {...base} selectedCategory="Skills" issues={[skill, rule] as never} />);
  fireEvent.click(screen.getByText("Needs review 2"));
  const text = screen.getAllByTestId("finding-popover-line").map((l) => l.textContent).join("\n");
  expect(text).toContain("math");
  expect(text).toContain("The scan skipped something it could not read.");
  expect(text).not.toContain("style.md");
});
```

The pill reads 2, the Skills issue and the warning; unnarrowed it reads 3. After Task 6 the pill is the card's Needs review row, and this test moves with the others in Task 6's Step 4.

- [ ] **Step 2: Run it.** Expected: FAIL, "Needs review 2" is not found (the pill reads "Needs review 3").
- [ ] **Step 3: Implement.** Build `reviewLines` from `issues.filter((i) => selectedCategory === null || i.category === selectedCategory)`; pass the same filtered list to `ReviewPillActions`. Warnings are about the root and stay on every tab.
- [ ] **Step 4: Run the gates.**
- [ ] **Step 5: Commit** `fix(repos): Needs review follows the tab, as on Global`.

### Task 3: The overview card's chrome becomes one component

Only if Q1 is "Yes". A refactor of `ProfilePane` with no change on screen. The evidence is the existing overview tests staying green unedited, plus the new component's own tests, red first because the file does not exist yet.

**Files:**
- Create: `src/components/OverviewHost.tsx`, `src/components/OverviewHost.test.tsx`
- Modify: `src/components/ProfilePane.tsx` (the cap portal, `OverviewPopover`, the docked `div`, `overviewOpen`, `overviewButtonRef`, the dock-closes-popover effect, the ⌘E effect all move out; `laneBoxClass` moves out too), `src/utils/overviewLayout.ts` (gains `laneBoxClass`), `src/components/DesignSystemPane.tsx` (a specimen), `.claude/DESIGN.md` (`OverviewCard` / `OverviewPopover` paragraphs)

**Interfaces:**
- Produces `OverviewHost({ card, capSlot, docked, hidden, onToggleHidden }: { card: ReactNode; capSlot: HTMLElement | null; docked: boolean; hidden: boolean; onToggleHidden?: () => void }): ReactNode`. With `capSlot` null it draws nothing and binds no ⌘E. It owns the popover's open state. Docked and not hidden, it draws `card` in `data-testid="overview-dock"` with today's classes.
- The pane keeps `docked = forceDock ?? shouldDockOverview(paneWidth, inspectorOpen)` and `dockedCardShown = capSlot !== null && docked && !hidden`, because its lane needs them.
- Produces `export const laneBoxClass = (docked: boolean): string` in `utils/overviewLayout.ts`, moved from module scope in `ProfilePane.tsx` with its doc comment, the `"mr-[306px]"` literal kept whole (Tailwind reads classes as text; `utils/listLane.ts` → `laneClass` already carries `max-w-[736px]` the same way). `ProfilePane` imports it; Task 6's `RepoPane` imports it. `overview_dock.test.tsx` pins the class through the DOM (`laneBoxes()`), not the source, so the move cannot disarm it; it must stay green unedited.

- [ ] **Step 1: Write the failing tests** in `OverviewHost.test.tsx`, each rendering a `<span>` as `capSlot`:
  - `it("draws nothing, and ignores ⌘E, without a cap slot")`
  - `it("docked, draws the card in the pane and no dialog; the button reads Hide overview  ⌘E and asks to hide it")`
  - `it("docked and hidden, draws no card; the button reads Show overview  ⌘E")`
  - `it("not docked, opens the card in a dialog from the button and from ⌘E, and Esc closes it")`
  - `it("closes an open popover when the card docks")`
  - `it("leaves ⌘E typed into a text field alone")`
- [ ] **Step 2: Run them.** Expected: FAIL, cannot resolve `./OverviewHost`.
- [ ] **Step 3: Implement** by moving the code out of `ProfilePane`, unchanged. Specimen: a docked-false host in the Design system page with its own span as the slot.
- [ ] **Step 4: Run the gates.** `overview_dock.test.tsx`, `overview_window_bar.test.tsx`, `global_overview_replaces_strip.test.tsx` and `design-system-coverage.test.ts` must pass with no edit. An edit to any of them fails this task.
- [ ] **Step 5: Commit** `refactor(global): the overview card's button, popover and dock are one component`.

### Task 4: Human gates. The repository card's layout options and its strings

No code. Stop at the end. G1 runs only if Q1 is "Yes"; G2 runs either way, for whatever new strings the chosen path needs.

**Files:**
- Create: `docs/design-ref-prototypes/2026-11-27-repo-overview-options.html`, `docs/plans/2026-11-27-repo-view-parity-naming-brief.md`

- [ ] **Step 1: G1, layout options.** Render three options of the repository card at its true 280px, in the app's tokens, docked beside a 560px list and as the popover, light and dark: (A) per-engine asset rows as the card's first section, the repository's store section, nested repositories as a section above the actions; (B) the same, with nested repositories as a `ListRow`-style notice above the list instead; (C) no engine section (Q2's third answer). Each shows a category tab (engine rows gone, Review Focus 2) and a macOS-blocked repository (Review Focus 4).
- [ ] **Step 2: G2, naming brief.** One entry per new string, each researched and run through `/humanizer`: the engine section's head and caption on a repository (candidate: "By engine", already approved, with `storeAssetsLabel` values); the store section's head (candidate: the folder name itself, so no label) and caption; the nested-repository line once it is not "towards this row"; and "1 asset" for `storeAssetsLabel(1)`.
- [ ] **Step 3: Send both to Karthik through Plannotator and wait.** His picks fill in Task 5's and Task 6's Interfaces. A pick other than (A) changes those blocks before they start.

### Task 5: The overview card takes a repository's figures

Only if Q1 is "Yes". Written for option (A) and the candidate strings. Amend after Task 4.

**Files:**
- Modify: `src/components/OverviewCard.tsx`, `src/utils/overviewCopy.ts` (`storeAssetsLabel` singular, if G2 approves), `src/components/DesignSystemPane.tsx` (a repository specimen), `src/data/designSystemFixtures.ts`, `.claude/DESIGN.md` (`OverviewCard`)
- Test: `src/components/OverviewCard.test.tsx`, `src/utils/overviewCopy.test.ts`

**Interfaces:** `OverviewCardProps` changes, all optional so Global's call is unchanged:
- `onSelectEngine` becomes optional (`onSelectEngine?: (id: string | null) => void`, called with `?.`). It is required today, and a repository card has no engine to pick. Global keeps passing it.
- `storeHead?: string`, default `STORE_HEAD`.
- `engineCounts?: EngineCountRow[]` where `EngineCountRow = { key: string; engineKey: string; engineName: string; value: number }`. This is a narrower shape than `HeroBandRow`, not the same fields: `HeroBandRow` also has `secondary?`, `word` and `filter?`, and its `value` is `number | string | null`. `RepoPane`'s `engineRows` set `value` from `assetCounts.engines` (always a number) and `word` to "asset"/"assets"; the card formats the figure itself, so `word`, `secondary` and `filter` are dropped. Given, the first section draws these rows under G2's head, a `BrandIcon` and the figure each, none a button and no All engines row; `engines` is ignored. An empty array draws no section.
- `notice?: ReactNode`, drawn as its own section, bordered, between the store section and the actions.
- `pending?: boolean`, default `false`. True, the store section's caption and the All engines row's value print no figure (the head stays), and `engineCounts` rows draw no figure: no "0 assets" before the answer is in.

- [ ] **Step 1: Write the failing tests:**
  - `it("with engineCounts, lists each engine's asset count and offers no engine to pick")`: no element with `aria-current`, no "All engines", one row per entry, "none" last as given.
  - `it("heads the store section with storeHead in place of The global store")`
  - `it("draws the notice between the store section and the actions")`
  - `it("pending, prints no asset figure anywhere, and still draws the head, the legend and Rescan")`: `pending` with `storeTotal={0}`; `queryByText(/\d+ assets?/)` is null.
  - `it("renders with no onSelectEngine")`: `engineCounts` given, no `onSelectEngine`, nothing throws and no row is a button.
  - In `overviewCopy.test.ts`: `it("says 1 asset, and 2 assets")`, only if G2 approved it.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the gates.** Every existing `OverviewCard.test.tsx` case passes unedited.
- [ ] **Step 5: Commit** `feat(overview): the card can carry a repository's engines, head and notice`.

### Task 6: A repository opens with the overview card

Only if Q1 is "Yes".

**Files:**
- Modify: `src/components/RepoPane.tsx` (drop the `SummaryStrip` block and `HeroBand`; build the card; render `OverviewHost`; `laneBoxClass` from `utils/overviewLayout.ts` on the facet block, the access-panel block and the list, as `ProfilePane` does), `src/App.tsx` (render `overview-cap-slot` on a repository route too; give `RepoPane` `key={repoPaneRoot}`; pass `overviewSlots`, `inspectorOpen`, `overviewHidden`, `onToggleOverviewHidden`; drop `enginesBandOpen` / `onToggleEnginesBand` from the call), `.claude/DESIGN.md` (`RepoPane`, "Pane composition", "The lane and group heads")
- Test: `src/components/RepoPaneList.test.tsx`, `src/components/RepoPaneBand.test.tsx`, `src/__tests__/nested_repo_banner.test.tsx`, `src/__tests__/global_overview_replaces_strip.test.tsx`, `src/__tests__/pane-block-rhythm.test.ts`, `src/__tests__/overview_window_bar.test.tsx`

**Interfaces:**
- Consumes `OverviewHost` (Task 3) and the card props (Task 5).
- `RepoPaneProps` gains `overviewSlots?: { cap: HTMLElement | null }`, `inspectorOpen?: boolean`, `overviewHidden?: boolean`, `onToggleOverviewHidden?: () => void`, `forceDock?: boolean` (test-only, as on `ProfilePane`), and loses `enginesBandOpen`, `onToggleEnginesBand`.
- The card: `engines={[]}`, `selectedEngineId={null}`, no `onSelectEngine` (optional since Task 5), `storeHead={repoFolderName}`, `storeTotal={stripTotal}`, `pending={!assetCounts || (stripTotal === 0 && (loading || !hasScanned))}` (a figure the backend has given is shown; only a zero before a finished scan is withheld), `engineCounts={engineRows}` (still empty on a category tab), `linkLegend` from `stripCounts`, `engineFigures={null}`, `review`, `scan`, `notice={nestedFoot || undefined}` rebuilt with G2's line.
- `laneArea` uses `DOCKED_LANE_CLEARANCE` when docked, exactly as `ProfilePane`.
- `key={repoPaneRoot}` remounts the pane on a change of repository, which resets `internalCategory` and the host's popover state together. A tab change within one repository is not a remount (the key is the root, not `selectedSidebarItem`).

- [ ] **Step 1: Write the failing tests.**
  - `RepoPaneList.test.tsx`: `it("draws the overview card docked, headed by the repository, with no summary strip")` (`forceDock`, a span slot): `overview-dock` present, the folder name in it, no `section[aria-label="Inventory summary"]`.
  - `RepoPaneList.test.tsx`: `it("keeps the macOS access panel inside the lane box when the card docks")` (Review Focus 4): the panel's block has `mr-[306px]`.
  - `RepoPaneBand.test.tsx`: `it("a category tab draws no engine rows in the card; the nested-repository section stays")` (Review Focus 2).
  - `RepoPaneBand.test.tsx`: `it("says Scanning in the card's action row while the repository's scan runs, and asserts no absence")` (Review Focus 5): `loading`, `scannedAt={null}`, `assetCounts={null}`, docked with a span slot; the card's action row reads "Scanning" and `queryByText(/\d+ assets?/)` is null.
  - `overview_window_bar.test.tsx`: `it("is on a repository too, and its popover closes when the repository is left")` (Review Focus 3).
  - `overview_window_bar.test.tsx`: `it("going from one repository to another closes the popover and opens the next on All")` (Review Focus 3): two linked directories in that file's `get_linked_directories` mock; on the first, click the Skills tab and open the card; pick the second from the source list; no `dialog`, and the tab track's selected tab is All. Red today on the tab half (the unkeyed pane keeps Skills).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Forced test edits,** each named with its cause in the commit body (the ask reverses what they pin):
  - `RepoPaneList.test.tsx` › "keeps the summary strip, and draws no overview card": removed, replaced by Step 1's first test.
  - `global_overview_replaces_strip.test.tsx` › "a repository still has its summary": now asserts the overview button is in the cap and no `Inventory summary` section exists.
  - `pane-block-rhythm.test.ts` › "gives the summary strip its wrapper class on a repository, and Global draws none": now asserts neither pane matches `<SummaryStrip\b`.
  - `RepoPaneBand.test.tsx` and `nested_repo_banner.test.tsx`: every `hero-band*` query moves to the card's section; "ships folded so the notice stays non-intrusive" is deleted, since a card section has no fold (Q6). List each by name.
  - `hero_band_wiring.test.tsx` › "the band's fold is a preference…" (two tests): deleted with the prop.
  - `hero_band_wiring.test.tsx` › "the project pane sees its own issue and neither of the global ones": it clicks a bare `screen.getByText("Needs review 1")`, the strip's pill. After this task that row is inside the card, behind the cap button in happy-dom (width 0, so not docked). It opens the card the way the Global case beside it does (`openGlobalCard`, `cardPill`; generalise the helper's name if it is Global-only) and asserts the same two lines. The block's two Global cases must pass unedited.
  - `RepoPaneBand.test.tsx` › Task 2's "a category tab narrows this repository's review lines…": opens the card's Needs review row in place of the pill, same assertions.
- [ ] **Step 5: Run the gates.**
- [ ] **Step 6: Commit** `feat(repos): a repository opens with the overview card, docked or behind ⌘E`.
- [ ] **Step 7: Capture** at 1024 × 700 (inspector closed: docked; open: popover) and 1440 × 900, every tab, a repository with nested candidates, and the macOS-blocked state if one can be produced honestly (otherwise say so). Compare against G1's pick. Check by eye, since happy-dom has no layout and no test above can: the docked card sits at the pane's top right, 12px in, below the window bar and inside the content sheet, not over the cap or the window's edge (the `relative` root from Task 1); the lane keeps 32px clear of it; going from one repository to another, the docked card does not flash to the popover state. Stop for Karthik.

### Task 7: Retire what the card replaced

Only if Q1 is "Yes", and only after Karthik accepts Task 6's captures.

**Files:**
- Delete: `src/components/HeroBand.tsx`, `src/components/HeroBand.test.tsx`
- Modify: `src/components/SummaryStrip.tsx` (drop the default export; keep `LinkStateLegend` and `StripReview`, which `OverviewCard`, `ProfilePane` and `RepoPane` import), `src/__tests__/summary_strip.test.tsx` (keep the legend's two cases, "legend buttons toggle their state filter" and "clicking the active legend state clears the filter", against `LinkStateLegend`; delete the rest), `src/components/DesignSystemPane.tsx` and `src/__tests__/design_system_pane.test.tsx` (the `SummaryStrip` specimen becomes `LinkStateLegend`; the `HeroBand` specimen goes), `src/data/designSystemFixtures.ts` (`SAMPLE_ENGINE_BAND_ROWS`), `src/__tests__/type-roles.test.ts` (`ROLE_FILES`: drop `HeroBand.tsx`), `src/App.tsx` (`enginesBandOpen`, `toggleEnginesBand`, the `engines_band_open` read and write), `.claude/DESIGN.md` (`SummaryStrip`, `HeroBand`)

- [ ] **Step 1:** `grep -rn "HeroBand\|engines_band_open\|enginesBandOpen" src` and `grep -rn "from \"./SummaryStrip\"" src` before deleting; every hit is in the list above or the task stops.
- [ ] **Step 2:** Delete and edit. A guard edited here (`type-roles.test.ts`, `design_system_pane.test.tsx`) goes in its own commit, before the deletion, with its cause.
- [ ] **Step 3: Run the gates.**
- [ ] **Step 4: Commit** `refactor(repos): retire HeroBand and the summary strip; the legend stays`.

### Task 8: Esc clears the inspector on a repository

Only if Q4 is "Yes".

**Files:**
- Modify: `src/App.tsx` (the Esc effect's guard: a Global item or a repository route; its comment's ruling citation becomes this plan's Q4)
- Test: `src/__tests__/overview_dock.test.tsx`

- [ ] **Step 1: Write the failing test** in `describe("the Esc rule still clears the selection on Global")`: `it("on a repository, Esc drops the selection too")`.
- [ ] **Step 2: Run it.** Expected: FAIL, the asset stays selected.
- [ ] **Step 3: Implement.** Esc inside a menu, popover or the palette still wins (`defaultPrevented`).
- [ ] **Step 4: Run the gates.**
- [ ] **Step 5: Commit** `feat(repos): Esc clears the inspector on a repository, as on Global`.

### Task 9: Live check and hand-off

- [ ] Run `stage-gate --dev` with a fresh reviewer on this plan's commits only (bound the range to them; a peer's commits may sit between).
- [ ] Capture Global and a repository side by side at 1024 × 700 and 1440 × 900, docked and as a popover, light and dark, through the MCP bridge.
- [ ] Send them to Karthik with the matrix's drift rows ticked or not. Only he closes the iteration. Push only on his word.

## Questions for Karthik

:::question
Should a repository's summary strip and its "By engine" band give way to Global's overview card?

Your ask brings Global's header over, and the card is that header. Task 4 of the global-list plan kept the strip on purpose, but that was the plan's call, not a ruling of yours, and the card docks, pops over and answers ⌘E the same way on both screens.

- [ ] Yes: the card replaces both, and HeroBand retires — one header, one set of controls to learn
- [ ] Only the small changes: tabs in the lane and the sheet corner, keep the strip — the smallest change, but the screens still differ

Recommended: Yes: the card replaces both, and HeroBand retires
:::

:::question
What goes in the card's first section on a repository?

On Global it lists every engine by tokens per session, and picking one filters the list. Those figures are the machine's: a repository's own `.mcp.json` is in no engine's context, and no repository asset has a reach verdict, so picking would filter nothing correctly. The repository already has its own per-engine asset counts in the "By engine" band.

- [ ] The repository's asset counts per engine, not clickable — true of the repository, already approved words
- [ ] The machine's engines and tokens, as on Global — looks the same, but credits the repository with the machine's budget
- [ ] No engine section — the shortest card, and the engine counts are lost

Recommended: The repository's asset counts per engine, not clickable
:::

:::question
When you hide the docked card, should it stay hidden on both Global and repositories?

Today `overview_hidden` is one preference, Global's. A second one would let each screen remember its own choice.

- [ ] One preference for both screens — one button that means one thing everywhere
- [ ] A separate preference per screen — each remembers its own

Recommended: One preference for both screens
:::

:::question
Should Esc clear the inspector on a repository too?

You ruled Esc clears the selection only on Global, because there it brought the pinned card back (round 14 q4). The pin has gone since, and parity is the ask.

- [ ] Yes, on repositories too — the same key does the same thing on both screens
- [ ] No, Global only — keeps your round 14 ruling as it stands

Recommended: Yes, on repositories too
:::

:::question
What should a repository row's second line show on the left?

Global's shows the file's own description. A repository's shows the engine that owns the asset ("Claude Code", "Any agent"), because its rows have no engine marks yet: that needs backend work.

- [ ] Keep the engine word until the marks exist — it is the row's only engine signal today
- [ ] The description, as on Global — matches Global, but a repository row then names no engine at all

Recommended: Keep the engine word until the marks exist
:::

:::question
The band folds today and remembers it. Should the card's repository sections fold?

The card's sections on Global never fold. The nested-repository paths can run long on a broad folder, which is why the band shipped folded.

- [ ] No fold: the card draws every section, and a long path list scrolls inside the card — the same card as Global's
- [ ] Keep a fold on the nested-repository section only — shorter by default, one control Global lacks

Recommended: No fold: the card draws every section, and a long path list scrolls inside the card
:::

:::question
Twelve of the gaps need backend data: engine marks, the engine lens, Not loaded, tool counts, the View control and more. Plan that now or after?

All of them come down to three missing pieces: reach verdicts for a repository's assets, a repository's servers in each engine's context, and a repository-scoped `get_mcp_servers`. Each touches the scanner or the switch, so each needs per-kind counts and its own rulings.

- [ ] A separate plan after this one lands — this plan stays frontend only and shippable
- [ ] Fold it into this plan — one cycle, but far larger and Rust-heavy

Recommended: A separate plan after this one lands
:::

## Answers (Karthik, 2026-11-27, in Plannotator)

All seven took the recommendation:

1. **Yes:** the overview card replaces the repository's summary strip and its "By engine" band, and `HeroBand` retires. Tasks 3, 5, 6, 7 and gate G1 run.
2. The card's first section on a repository shows **the repository's asset counts per engine, not clickable.**
3. Hiding the docked card is **one preference for both screens.**
4. **Esc clears the inspector on repositories too.** Task 8 runs.
5. A repository row's second line **keeps the engine word until the marks exist.**
6. **No fold:** the card draws every section, and a long path list scrolls inside the card.
7. The twelve blocked rows get **a separate plan after this one lands.**
