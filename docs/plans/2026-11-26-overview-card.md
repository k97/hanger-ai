# The Overview Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the engine chip row and the token summary at the top of Global with an overview card, after T3 Code's session card. The card opens from the window bar and can be pinned into the inspector. Tick marks beside the list jump between its groups.

**Architecture:** Today `ProfilePane` assembles the summary's figures from App's `engineContexts`. That assembly moves into a hook, `useGlobalOverview`, which App calls once. One presentational component, `OverviewCard`, draws the card in two places:

- in a popover from the content cap's button, while the card is unpinned;
- in Flyout's empty state, while it's pinned.

`ProfilePane` keeps the kind tabs and the list, and gains `GroupTicks`.

**Tech Stack:** React 19 + TypeScript, Tailwind tokens, Vitest + Testing Library. No backend change: `get_engine_contexts` already returns every engine's `EngineContext`.

**Spec:**
- `docs/plans/2026-11-26-decisions-round-13.md` (q1 F+G together, q2 ticks yes, q4 kept group placement)
- `docs/plans/2026-11-26-global-top-prototypes.html` (layouts F and G)
- `docs/plans/2026-11-26-decisions-round-14.md` (this plan's open rulings and strings)

## Global Constraints

- Gates before every merge, from the worktree root, each with `timeout`:
  - `npx vitest run --pool=forks`
  - `bunx tsc --noEmit`
  - `gitleaks detect --source .`
  - `gitleaks detect --source . --no-git -c .gitleaks.toml`
- Red-first tests. Name forced test edits in the commit body, and keep every commit on `main` green.
- No count is worked out on screen. Ranking sorts by `on_tokens_measured`. A bar's width is that figure divided by the heaviest engine's: that's scaling, not counting. Neither adds an entry to `no-frontend-counting.test.ts`'s allowlist.
- Every proportional bar draws through `GelMeter`. Aqua only marks a true share, so the ranking bars are never aqua.
- Every new string comes from the table below, as approved in round 14, and passes `/humanizer`. No engine name is hardcoded in a component (`no-hardcoded-engine-copy.test.ts`).
- Design system: each new component gets a specimen and a `.claude/DESIGN.md` paragraph. `EngineChipRow` goes, along with its specimen. The coverage test gets no new allowlist entries.
- Window-bar buttons use `tbBtnClass` from `App.tsx:1586`, with no third copy, and sit `relative` above `capDragOverlay`. Icons come from `components/icons.tsx` only.
- The card opens and closes with no animation. A button press keeps the 0.97 scale.

## Strings (approved by Karthik, round 14 q5, 2026-11-26; source of truth for the copy tests)

| Where | String | True because |
|---|---|---|
| Content cap button, tooltip and aria-label | `Show overview  ⌘E` / `Hide overview  ⌘E` | ⌘E toggles the card; nothing else binds ⌘E |
| Card, first section head | `Engines` · `tokens every session` | Every figure in the section is that engine's `on_tokens_measured` |
| Engine row value | `≈ {n}` (compact, e.g. `≈ 13.6k`) or `Not measured` | `n` = `on_tokens_measured`; null, or zero with servers on, reads Not measured (`measuredBudget`) |
| All engines row value | `{n} assets` | `n` = the store total the old summary used |
| Engine section head | `{engine}` · `{m} of {on} servers measured` | `budgetCaption`, unchanged |
| Engine section figure | `≈ {n}` + `tokens every session` | `engineStripHeadline`, unchanged |
| Engine kind rows | `MCP servers` `≈ {n}` · `Skills` / `Rules` / `Subagents` `Not measured` | Only MCP servers are measured (`context.rs:182`) |
| All engines section head | `The global store` · `{n} assets` | Store total |
| All engines legend | the existing link-state legend labels (linked, drifted, broken, local only) | Moved, not rewritten |
| Actions | `Needs review` `{n}` · `Rescan` / `Scanning` with the scan stamp | Existing strings |
| Pin button, aria-label and tooltip | `Pin to the inspector` / `Unpin from the inspector` | Pinned, the card fills the inspector's empty state |
| Ticks, aria-label | `Jump to a group` | One button per group |
| Tick, aria-label and tooltip | `{group} · {count}` | The group header's own words and count |

## Review Focus

1. **Empty engine list before the first scan.** The card must show only the store section and the actions, never a blank Engines head. Pinned in Task 4.
2. **The chosen engine vanishes after a rescan** (uninstalled). App already falls back to All engines (`App.tsx:1097`). The card must show All engines too, not a stale row. Pinned in Task 4.
3. **⌘E while focus is in a text field** (search, rename). It must not toggle the card while typing. Pinned in Task 5.
4. **Esc when a popover, menu or the search palette is open.** That component's Esc wins, and the selection stays. Pinned in Task 6.
5. **A narrow window** (inspector at its 384 px minimum). Engine names truncate, and values and bars never wrap. Pinned in Task 3.

---

### Task 1: The skills "Switched off" group follows the skills

**Files:**
- Modify: `src/components/ProfilePane.tsx:1520-1527`, `:1686`
- Test: `src/__tests__/kept_skills_inspector.test.tsx`

- [ ] **Step 1: Write the failing test.** Name it `"with an engine picked that loads no skills, the kept skills group sits just before Not loaded"`. Render App with one kept skill, an engine that has no skill rows, and the engine picked. Assert `kept-skills-group` precedes `not-loaded-group` (`compareDocumentPosition`), with no `section-header-tools` between them. Keep an assertion that with All engines it still directly follows the Skills rows.
- [ ] **Step 2:** Run `npx vitest run src/__tests__/kept_skills_inspector.test.tsx --pool=forks`. Expected: FAIL on the order assertion.
- [ ] **Step 3:** Render `KeptSkillsGroup` at `:1520` only when Skills rows show. Otherwise render it just before `NotLoadedGroup` at `:1686`.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5: Commit** `fix(skills): with no skill rows, the Switched off group sits before Not loaded (round 13 q4)`.

### Task 2: Group ticks beside the list

**Files:**
- Create: `src/components/GroupTicks.tsx`, `src/components/GroupTicks.test.tsx`
- Modify: `src/components/ProfilePane.tsx` (the group `<h3>`s and the scroll container `:1447`), `src/components/DesignSystemPane.tsx`, `.claude/DESIGN.md`

**Interfaces:**
- Produces: `GroupTicks({ groups, scrollRoot }: { groups: { id: string; label: string; count: number }[]; scrollRoot: RefObject<HTMLElement> })`.
- Each group header gets `id="group-<key>"`, with keys `skills`, `kept-skills`, `tools`, `kept-tools`, `rules`, `subagents` and `not-loaded`, plus `scroll-margin-top` set to the sticky header height through a token class.

- [ ] **Step 1: Write the failing tests.**
  - The tick nav has `aria-label="Jump to a group"`.
  - Each tick has `aria-label` `"Skills · 554"` (the header's own label and count).
  - Clicking a tick calls `scrollIntoView({ block: "start" })` on `#group-<key>`.
  - The tick whose group is nearest the top of `scrollRoot` has `aria-current="true"`.
- [ ] **Step 2:** Run them. Expected: FAIL, because the module doesn't exist.
- [ ] **Step 3:** Implement it. The active tick comes from one `IntersectionObserver` rooted on `scrollRoot`. Draw the ticks as 10×2 px bars, 14 px and `ink-1` when active, and show each tick's label in the `Tooltip` primitive. ProfilePane passes only the groups it renders, using the counts their headers already show.
- [ ] **Step 4:** Run them. Expected: PASS. Then run all four gates.
- [ ] **Step 5:** Add the specimen and the DESIGN.md paragraph. **Commit** `feat(global): tick marks beside the list jump between its groups`.

### Task 3: OverviewCard, the presentational card

**Files:**
- Create: `src/components/OverviewCard.tsx`, `src/components/OverviewCard.test.tsx`, `src/utils/overviewCopy.ts` (+ `.test.ts`)
- Modify: `src/components/GelMeter.tsx` (the rank variant from round 14 q1), `src/components/DesignSystemPane.tsx`, `.claude/DESIGN.md`

**Interfaces:**
- Produces `OverviewCard(props: OverviewCardProps)`:

```ts
interface OverviewCardProps {
  engines: EngineContext[];               // App's engineContexts, unsorted
  selectedEngineId: string | null;        // null = All engines
  onSelectEngine: (id: string | null) => void;
  storeTotal: number;                     // the old summary's total
  linkLegend: { counts: StripCounts; active: StateFilter | null; onFilter: (s: StateFilter | null) => void };
  engineFigures: EngineStripFigures | null; // from useGlobalOverview, null for All engines
  review: StripReview | null;
  scan: { scannedAt: number | null; scanning: boolean; onRescan: () => void };
  pinned: boolean;
  onTogglePin: () => void;
}
```

- Produces `rankEngines(engines: EngineContext[]): EngineContext[]` in `overviewCopy.ts`. It sorts by `on_tokens_measured` descending, puts not-measured engines last, and breaks ties by `engine_name`.
- Produces the copy helpers `overviewButtonLabel(open: boolean)`, `pinLabel(pinned: boolean)` and `compactTokens(n: number)` (`13598 → "13.6k"`).
- Produces `GelMeter` gaining `tone?: "gel" | "rank"`. `rank` paints one `ink-1` segment with no gloss and no aqua. An empty `segments` array draws the bare track.

- [ ] **Step 1: Write the failing tests.**
  - **Copy, `overviewCopy.test.ts`:** each string in the table matches exactly, and `compactTokens(13598) === "13.6k"`. `rankEngines` orders `[Claude Code 13598, Codex 9951, Claude.ai null]` exactly, and keeps a 0-with-servers-on engine below the measured ones.
  - **Card, `OverviewCard.test.tsx`:**
    - The engine rows render in rank order.
    - Clicking a row calls `onSelectEngine(id)`, and clicking "All engines" calls `onSelectEngine(null)`.
    - The selected row has `aria-current="true"`.
    - With an engine selected, the second section shows `engineStripHeadline`'s figure, "Measure all", and four kind rows, three of them "Not measured".
    - With All engines, the second section shows "The global store", the legend, and clicking a legend item calls `onFilter`.
    - Review Focus 1: `engines=[]` draws no "Engines" head.
    - Review Focus 5: a 384 px-wide container doesn't wrap a value. Assert the value cells have `whitespace-nowrap` and the names have `truncate`.
    - The pin button reads `pinLabel(pinned)` and calls `onTogglePin`.
- [ ] **Step 2:** Run them. Expected: FAIL, because the modules don't exist.
- [ ] **Step 3:** Implement it. Use the row grid from prototype F: 16 px mark, name, meter, 80 px value. Each bar's width is the engine's tokens over the top engine's, passed to `GelMeter` as `segments=[{key, value}]` against a track whose `max` is the top figure. Add `max?: number` to `GelMeter`. Engine marks come from the existing engine icon helper.
- [ ] **Step 4:** Run them. Expected: PASS. Then run all four gates.
- [ ] **Step 5:** Add the specimens (selected engine, All engines, empty) and the DESIGN.md paragraph. **Commit** `feat(global): the overview card`.

### Amendment (2026-11-26, after Task 3): portals, not a lifted hook

Task 4's implementer found a problem with lifting the figures into App. They depend on state only ProfilePane holds: the internal kind tab (`internalCategory`, which every kind row's `onSelect` sets), the `mcpReviewOnly` toggle inside `review.actions`, and the scoped rows from `filterProfileAssets`. Lifting them means lifting that state, and about 20 standalone ProfilePane tests would break.

**The replacement design.** ProfilePane keeps the figures and the state. App only provides two places to draw into, and ProfilePane draws the card there with `createPortal`.

- App renders an empty `<span ref={setCapSlot} className="relative contents" />` in the content cap's trailing group (`App.tsx` ~`:2042`), on Global only. In Flyout's empty branch, while the card is pinned on Global, App renders `<div ref={setInspectorSlot} />` through Flyout's new `emptyState?: ReactNode` prop.
- ProfilePane takes these props:
  - `overviewSlots?: { cap: HTMLElement | null; inspector: HTMLElement | null }`
  - `overviewPinned?: boolean`
  - `onToggleOverviewPin?: () => void`
- When the cap slot is present and the card isn't pinned, ProfilePane portals the button there.
- When the button is open, ProfilePane portals the popover to `document.body`, `position: fixed`, under the button.
- When pinned, ProfilePane portals `OverviewCard` into the inspector slot.
- ⌘E is a `window` keydown in ProfilePane, so it exists only on Global.
- App keeps what is App's: the `overview_pinned` pref and the Esc that clears the selection.
- With no slots, as in standalone ProfilePane tests, the card isn't drawn anywhere, and the strip stays until Task 7.

The task list changes accordingly. **Task 4 is withdrawn: no hook, and nothing moves.** **Task 5 becomes the slots, the button and the popover.** Its tests run through App. **Task 6 keeps its scope** (pinned and Esc) on the slot design. Tasks 7 and 8 are unchanged.

### Task 4: useGlobalOverview, lifting the figures out of ProfilePane (withdrawn, see the amendment above)

**Files:**
- Create: `src/hooks/useGlobalOverview.ts` (+ `.test.ts`)
- Modify: `src/components/ProfilePane.tsx:462`, `:701-880` (move out, don't copy), `src/App.tsx`

**Interfaces:**
- Consumes App's `engineContexts`, `selectedEngine`, `recordContext`, findings, inventory counts and `stateFilter`.
- Produces `useGlobalOverview(args): Omit<OverviewCardProps, "pinned" | "onTogglePin">`. It holds `measuringFor` and calls `invoke("measure_engine_context", { engineId })` exactly as `ProfilePane.tsx:756-766` does today.

- [ ] **Step 1: Write the failing hook tests.**
  - Measure all invokes `measure_engine_context` with the selected id and feeds `recordContext`.
  - The review is built from the same lines as today's pill: `count` equals the lines' count.
  - Review Focus 2: when `selectedEngine` isn't in `engineContexts`, `selectedEngineId` is `null`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Move `engineHeadline`, `measureEngine`, `engineFigures`, `mcpReview`/`assetReview` and `stripCounts`/`stripTotal` into the hook. ProfilePane keeps the strip, still fed by these figures through props, until Task 7. This step only moves code.
- [ ] **Step 4:** Run all four gates. Expected: PASS, with no other test edits.
- [ ] **Step 5: Commit** `refactor(global): the overview's figures come from one hook in App`.

### Task 5: The card from the window bar

**Files:**
- Create: `src/components/OverviewPopover.tsx` (+ test)
- Modify: `src/App.tsx:588-601` (⌘E), `:2042` (the content cap's trailing group)

**Interfaces:**
- Consumes `OverviewCard` and `useGlobalOverview`.
- Produces `OverviewPopover({ open, onClose, anchorRef, children })`. It's `position: fixed`, right-aligned to the anchor, `shadow-overlay`, `rounded-plane`, `role="dialog"`, `aria-label="Overview"`, and closes on Esc and on an outside pointerdown.

- [ ] **Step 1: Write the failing tests.**
  - On Global, the content cap has a button labelled `Show overview  ⌘E`. Clicking it opens the dialog and relabels the button `Hide overview  ⌘E`.
  - ⌘E toggles the card, and Esc closes it.
  - Review Focus 3: ⌘E with focus in an `<input>` does nothing.
  - The button is absent on other screens and while the card is pinned.
  - Picking an engine in the card changes `selected_engine` and keeps the card open.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement it. Use the button pattern at `App.tsx:2065-2078`, with the icon from round 14 q3 added to `icons.tsx`. The ⌘E branch in the global handler returns early when `event.target` is an input, a textarea or contenteditable.
- [ ] **Step 4:** Run it, then all four gates. Expected: PASS.
- [ ] **Step 5: Commit** `feat(global): the overview card opens from the window bar, ⌘E`.

### Task 6: Pinned in the inspector, and Esc brings it back

**Files:**
- Modify: `src/App.tsx` (the `overview_pinned` pref, beside `inspector_open` at `:939-957`; an app-level Esc), `src/components/Flyout.tsx:1224-1231`

- [ ] **Step 1: Write the failing tests.**
  - When pinned on Global with nothing selected, the inspector shows the card, not "Nothing selected".
  - Selecting an asset shows its details. Esc clears the selection and the card returns.
  - Review Focus 4: Esc while an `OverflowMenu` or the search palette is open leaves the selection alone. Check `event.defaultPrevented`, and have those components `preventDefault`.
  - Pinning opens the inspector if it's closed. The pref persists across a remount.
  - On other screens the empty state is unchanged, so the existing "Nothing selected" tests stay green untouched.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Flyout takes an `emptyState?: ReactNode` and renders it in place of the empty branch. App passes the card only on Global while pinned. Esc is a `window` keydown listener in App, added after the components' own listeners, that returns when `defaultPrevented`.
- [ ] **Step 4:** Run it, then all four gates. Expected: PASS.
- [ ] **Step 5: Commit** `feat(global): pin the overview card into the inspector; Esc returns to it`.

### Task 7: Remove the chip row and the summary from Global

**Files:**
- Delete: `src/components/EngineChipRow.tsx`, `src/components/chipClasses.test.tsx` (if it only tests the chips)
- Modify: `src/components/ProfilePane.tsx:1283-1302`, `src/components/DesignSystemPane.tsx` (drop the specimen), `.claude/DESIGN.md`, `src/__tests__/pane-block-rhythm.test.ts`
- Move tests: `engine_lens.test.tsx :234-308`, `engine_lens_pane.test.tsx :237-297, :454-569`, `ProfilePaneIntegration.test.tsx :139-370`, `ProfilePaneSelection.test.tsx`, `TccRelocation.test.tsx :88`, `toolbar_avionics.test.tsx :82-126`, `icon_rail.test.tsx :137`, `theme_auto.test.tsx :126-175`, `settings_editor_row.test.tsx`, `App.test.tsx :248-253`

- [ ] **Step 1:** Re-point each listed test to the card: open it with the window-bar button, then assert the same thing inside the dialog. Tests that wait on "Refresh scan" as a ready signal wait on the content cap's overview button instead. List every moved test in the commit body as a forced edit.
- [ ] **Step 2:** Add `"Global has no engine chips and no inventory summary"`. It asserts that `engine-chip-row` and `section[aria-label="Inventory summary"]` are absent on Global, and that RepoPane still has its summary. Run it and the moved tests. Expected: the new test FAILS. The moved tests pass already, because the card holds those controls since Tasks 5 and 6. If a moved test fails on an ambiguous match (the strip and the card both hold "Refresh scan"), scope it to the dialog.
- [ ] **Step 3:** Remove the chip row and the strip wrapper from ProfilePane. Remove `SummaryStrip`'s `engine` mode only if nothing else passes it (RepoPane doesn't), along with its specimen. Keep `SummaryStrip` itself for RepoPane.
- [ ] **Step 4:** Run all four gates. Expected: PASS.
- [ ] **Step 5: Commit** `feat(global): the overview card replaces the engine chips and the summary`.

### Task 8: Live check

- [ ] **Step 1:** Merge into local `main`. In the dev app, take each screenshot through the MCP bridge:
  - the card open and unpinned;
  - pinned with nothing selected;
  - pinned with an asset selected, then after Esc;
  - ⌘E;
  - a tick jump to MCP servers;
  - an engine picked that loads no skills, with a kept skill.
- [ ] **Step 2:** Show Karthik the screenshots before pushing. Pushing needs his word.
