# Global's List, After T3 Code: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Global's list becomes two-line rows in a centred column, with tick marks in its margin. The overview card docks at the top right when there's room and opens as a popover otherwise, the way T3 Code's session card does.

**Architecture:**
- A new `ListRow` draws every row in two lines, on Global and on Repositories (round 18 q4: both in this plan). `AssetRow` and `AssetHeaderRow` are retired in Task 4.
- ProfilePane's list moves into a centred lane, at most 736 px wide, with 48 px padding when there's room.
- `GroupTicks` sits in the lane's left margin.
- One ResizeObserver on the list area decides whether the card docks (absolute, 280 px) or stays behind its window-bar button. The pin, its setting and the inspector slot are removed.

**Tech Stack:** React 19, TypeScript, Tailwind tokens, Vitest. No backend change unless round 18 q1 asks for one.

**Spec. Read all of it, and look at the pictures:**
- `docs/evidence/2026-11-26-global-list/t3-reference-marked.png`: Karthik's marked-up T3 screenshot. **This is the reference.**
- `docs/evidence/2026-11-26-global-list/approved-HI.png` and `approved-HI2.png`: the approved frames (H's layout with I's two-line rows).
- `docs/plans/2026-11-26-decisions-round-16.md`: the answers, and the "your marks" table.
- `docs/plans/2026-11-26-decisions-round-18.md`: the rulings this plan needs.
- T3's source, for exact behaviour: `/Users/karthik/Work/Labs/t3code/apps/web/src`. Use `components/sidebar/SidebarThreadRow.tsx`, `components/pullRequest/PullRequestListRow.tsx`, `components/chat/ThreadDetailsCard.tsx`, `components/chat/ThreadDetailsUsage.tsx`, `components/chat/chatCanvasLayout.ts`, `components/chat/threadDetailsCardLayout.ts`, and `index.css:131,979-984`.

## Mark checklist (every task ends by checking it)

| Karthik's mark | Must be true in the dev app |
|---|---|
| The top-right window-bar buttons | The card button is a 28 px toggle with an 8 px radius and a tint when on, right of the content cap |
| The tick marks left of the content | 24 × 2 px ticks, 12 px into the lane's left margin, shown only when that margin is ≥ 48 px |
| The edges of the centred column | The list sits in a lane of at most 736 px. Docked, the lane's right edge keeps 32 px clear of the card. |
| "Changing the table into a fluid list" | No column headers on Global. Every row is two lines: name on top, muted details below, one slot on the right. |

## Global Constraints

- **Gates,** each with `timeout`:
  - `npx vitest run --pool=forks`
  - `bunx tsc --noEmit`
  - `gitleaks detect --source .`
  - `gitleaks detect --source . --no-git -c .gitleaks.toml`
  - Regenerate README counts with `bun run src/__tests__/readmeCounts.ts`.
- **Tests:** red-first. Name forced test edits in the commit body.
- **No count worked out on screen,** and no new allowlist entries.
- **Tokens only.** Text sizes are 11, 12, 13 and 16, unless round 18 q3 adds 14. `rounded-[6px]` is allowed, and `h-9` is 36 px.
- **Design system:** every new component gets a specimen and a DESIGN.md paragraph.
- **Copy:** every new string comes from round 18's table and is run through `/humanizer`.
- **Seeing it:** happy-dom has no layout. **Every task that changes what you see ends with dev-app screenshots taken through the MCP bridge, compared against the approved frames.** The parent looks at them before the next task starts.

## Review Focus

1. **A long name with every right-slot item present:** the name truncates, and the right slot never wraps or pushes line 2. Pinned in Task 1.
2. **A window too narrow to dock (the inspector open at 1024):** the card is behind its button, and the lane re-centres. Pinned in Task 2.
3. **Scrolling past MCP servers into Subagents:** no stale "MCP servers" header over the Subagent rows (today's bug). Pinned in Task 3.
4. **Keyboard:** Tab reaches every row, focus is visible, and Enter selects. Pinned in Task 1.
5. **Rules with no description, and servers with no token figure:** line 2 shows only what exists. No "—" placeholders. Pinned in Task 1.

---

### Task 1: The visual slice. ListRow, the lane and the ticks. Karthik approves the screenshots before Task 2.

**Files:**
- Create: `src/components/ListRow.tsx`, `src/components/ListRow.test.tsx`, `src/utils/listRowCopy.ts` (+ test).
- Modify: `src/components/ProfilePane.tsx` (the list container `:1551-1557`, row rendering, group headings), `src/components/GroupTicks.tsx` (24 × 2 ticks at `left-3`), `src/components/InspectorCap.tsx` (export `KIND_ICON` for sharing), `DesignSystemPane.tsx`, `.claude/DESIGN.md`.

**Interfaces:**
- Produces `ListRow(props)`:

  ```ts
  {
    kind: "skill" | "rule" | "subagent" | "server";
    name: string;
    chip?: string;            // transport, servers only
    detail?: string;          // line 2 left: description, or the status sentence
    figure?: string;          // line 2 right: beyond-the-store words, or tokens/tools per q1
    reach: ReachTile[];       // the engine marks, line 1 right
    selected: boolean;
    onSelect: () => void;
  }
  ```

  - The row is two lines. Line 1 is 22 px; line 2 is `text-small text-ink-3`. Padding is `py-[7px] px-2.5`, radius `rounded-[6px]`, with a 1 px gap between rows.
  - Hover is `bg-plane`. Selected is `bg-page` plus an inset `line-2` ring, as T3 does.
  - Keep `AssetRow`'s scroll-into-view behaviour.
- Produces `listRowDetail(item)` and `listRowFigure(item)` in `listRowCopy.ts`, with the strings from round 18.
- Lane: `mx-auto w-full max-w-[736px] px-12`, or `px-3` when the list is narrower than 640 px. It's measured, with a `forceLane` prop for tests.
- Group heads: a T3 shelf header, `h-8 px-2.5 text-small text-ink-3 font-medium`: the label, a hairline `flex-1 h-px bg-line`, then the count. No column labels.
- `ViewControl` moves into the Skills/All header's trailing slot and keeps Sort. Header-click sorting goes.

- [ ] **Step 1: Write the failing tests** (in `ListRow.test.tsx`, `listRowCopy.test.ts` and a ProfilePane test):
  - On Global, there's no "Name", "Kind", "Reach", "Registered in" or "Tools" column label.
  - Each row shows name, chip, marks, detail and figure in that order.
  - A skill's detail is its `description`.
  - Review Focus 5: a rule with no description renders no detail element, and `beyond: null` shows the round 18 string.
  - Review Focus 1: the name has `truncate`, and the right slot has `shrink-0 whitespace-nowrap`.
  - Review Focus 4: rows are focusable, and Enter calls `onSelect`.
  - The lane class is `max-w-[736px]`.
  - The ticks are `w-6 h-0.5`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Build `ListRow` and the copy helpers, then switch ProfilePane's Global rendering to them (skills, rules, subagents and servers). Carry descriptions through from `Skill.description` and `Subagent.description` (dropped today at `ProfilePane.tsx:944-956` and `:1140-1148`).
- [ ] **Step 4:** Run the gates. Move every test that pinned Global's columns to the new rows; Repositories' tests stay untouched until Task 4. List each moved test. Tests known to break:
  - `pane-block-rhythm.test.ts` finds the list by its exact class string and wants every side inset at 18 px. Keep `@container` first in the list's classes, and write the lane's padding as `px-12`, not `px-[48px]`. If the test still has to change, name the forced edit.
  - `asset_table_avionics`, `narrow_width_avionics`, `a6_r2_defects`, `pane_list_type_roles`, `mcp_card_row`, `AssetRow.test`, `ProfilePaneIntegration`, `engine_lens_pane`, `mcp_tile_switch`, `ProfilePaneGroupTicks` and `kept_skills_inspector`: wherever they assert Global's columns.
  - `global_overview_replaces_strip.test.tsx`: check that it still holds.
- [ ] **Step 5: Commit** `feat(global): two-line rows in a centred column`.
- [ ] **Step 6: Screenshots** (the parent does this). In the dev app, take Global at 1024 × 700: All, Skills, MCP servers, scrolled into Subagents, and with a row selected. Put each beside `approved-HI.png`, check the mark checklist, and send the pictures to Karthik through Plannotator. **Stop until he approves.**

### Task 1b: shadcn on Base UI with Hanger's tokens, and the kind tabs (round 19)

Runs after Karthik approves Task 1's screenshots.

**Files:**
- Create: `components.json`, `src/lib/utils.ts` (`cn`), and `src/components/ui/tabs.tsx`.
- Modify: `package.json` (add `@base-ui/react`, `class-variance-authority`, `tailwind-merge` and `clsx`), `src/styles/index.css` (the shadcn semantic variables, mapped onto Hanger's tokens), `src/components/CategoryFilterCards.tsx` (drawn with `Tabs`/`TabsList`/`TabsTrigger`), `DesignSystemPane.tsx`, `.claude/DESIGN.md`, and `design-system-coverage.test.ts`, so that `src/components/ui/*` is covered by its own specimen.

**The rules (from round 19):**
- Base UI, configured like T3's `components.json` (`/Users/karthik/Work/Labs/t3code/apps/web/components.json`): `style: base-mira`, `iconLibrary: lucide`, `cssVariables: true`, `tsx`, no RSC.
- **Hanger's look:**
  - shadcn's variables (`--background`, `--foreground`, `--muted`, `--muted-foreground`, `--popover`, `--popover-foreground`, `--accent`, `--border`, `--input`, `--ring`, `--radius` and the rest) are each set to an existing Hanger token (`--page`, `--ink-1`, `--ink-3`, `--tint`, `--line`, …).
  - No new colour values.
  - `init` must not overwrite `tokens.css` or Hanger's `@theme`. Run it with `--dry-run` first, and hand-merge.
- Use the CLI (`bunx --bun shadcn@latest add tabs`), never files fetched from GitHub. Read every file it adds and fix it to Hanger's rules: tokens only, `cn()`, no raw colours.
- **The kind tabs look the same as today.** Same pill track, same counts, and ←/→ keys still work. Screenshot them before and after.

- [ ] **Step 1: Write the failing tests.**
  - The kind tabs render `role="tablist"` from `src/components/ui/tabs.tsx`.
  - Each count still shows.
  - ←/→ move between tabs, and selecting one calls `onSelectCategory`.
  - The coverage test finds the `ui/tabs` specimen.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Set up shadcn as above, and switch `CategoryFilterCards` to `Tabs`. Retire `SegmentedTrack` if nothing else uses it.
- [ ] **Step 4:** Run the gates. Name every forced test edit.
- [ ] **Step 5: Commit** `feat(ui): shadcn on Base UI with Hanger's tokens; the kind tabs use its Tabs`.
- [ ] **Step 6:** Screenshots of the kind tabs before and after, which must look the same.

**From here on, each task swaps the components it touches (round 19 table), with the same rules: CLI add, tokens, specimens.**
- **Task 2:** `popover` (OverviewPopover), `tooltip` (the window-bar buttons' tooltips) and `toggle` (the window-bar buttons).
- **Task 3:** `collapsible` (Not loaded, Switched off), `dropdown-menu` (ViewControl, OverflowMenu) and `separator`.
- **Task 4:** the same components on Repositories.

### Task 2: The card docks or pops over, and the pin goes

**Files:**
- Modify: `OverviewCard.tsx` (drop `pinned` and `onTogglePin` and the pin markup; width 280; T3 sections and 32 px rows; 3 px meters with an end tick, through a `GelMeter` `tone: "line"`), `OverviewPopover.tsx` (`w-[280px]`), `ProfilePane.tsx` (dock measurement and the docked render), `App.tsx` (remove `overviewPinned`, the pref, `toggleOverviewPin`, `inspectorSlot` and the `emptyState` wiring), `Flyout.tsx` (remove `emptyState`), `utils/overviewCopy.ts` (remove `pinLabel`), the design system, and DESIGN.md.

**Interfaces:**
- `shouldDockOverview(listWidth: number, inspectorOpen: boolean): boolean` in `utils/overviewLayout.ts` returns `listWidth >= 640 + 280 + 12 + 32 + 2*48 && !inspectorOpen`.
- When docked:
  - ProfilePane renders `<OverviewCard>` `absolute right-3 top-3 w-[280px]`.
  - The lane gets `margin-right: 280 + 12 + 32`.
  - The window-bar button toggles the docked card's visibility. The setting is `overview_hidden`; open by default.
- Not docked: the button opens the popover, as today.

- [ ] **Step 1: Write the failing tests.**
  - `shouldDockOverview` at 1059, 1060 and with the inspector open.
  - Docked: the card is in the list area, and there's no dialog.
  - Not docked (Review Focus 2): the button opens the dialog.
  - There's no "Pin to the inspector" anywhere.
  - The meter rows are 24 px with a 3 px bar.
  - The Esc rule still clears the selection on Global.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement it. Use one ResizeObserver on the list wrapper, with a `forceDock?: boolean` prop for tests.
- [ ] **Step 4:** Run the gates. Delete the pin tests in `overview_pinned.test.tsx` and `OverviewCard.test.tsx`, and name them in the commit body. The three tests in `overview_window_bar.test.tsx` (`:140`, `:157`, `:191`) assume a popover. Run them with `forceDock={false}`, and add one docked case.
- [ ] **Step 5: Commit** `feat(global): the overview card docks when there's room, as T3's does; the pin goes`.
- [ ] **Step 6:** Screenshots, docked and not docked, compared with `approved-HI.png` and `approved-HI2.png`, against the mark checklist.

### Task 3: Kept, Not loaded and problem rows; group heads; the stale sticky header

**Files:**
- Modify: `KeptSkillsGroup.tsx`, `NotLoadedGroup.tsx`, the kept-server rows (`ProfilePane.tsx` ~`:1716-1735`), and `McpConfigProblemRow` (~`:417`). All draw through `ListRow` (or its shelf header).
- Remove the sticky `section-header-tools` and its `scroll-mt-11` rules: group heads aren't sticky in T3. Move `ViewControl` per Task 1.

- [ ] **Step 1: Write the failing tests.**
  - Kept and Not loaded rows are `ListRow`s, with their existing lines as `detail`.
  - Review Focus 3: no group header is sticky (`sticky` is absent from every group head on Global).
  - The ticks still jump to each group.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run the gates. Name every moved test.
- [ ] **Step 5: Commit** `feat(global): every group on Global draws as two-line rows under quiet headers`.
- [ ] **Step 6:** Screenshots, scrolled through every group, including Subagents after MCP servers.

### Task 4: Repositories uses the same rows, column and ticks (round 18 q4)

**Files:**
- Modify: `src/components/RepoPane.tsx` (its list at `:736` and its rows at `:742` and `:758-833`, into the lane with `ListRow` and quiet group heads), `DesignSystemPane.tsx`, `.claude/DESIGN.md`.
- Delete: `AssetRow.tsx` and `AssetHeaderRow.tsx` once nothing uses them, along with their specimens, their tests and their entries in `type-roles.test.ts`'s `ROLE_FILES`.

- [ ] **Step 1: Write the failing tests.**
  - A repository's list has no column labels.
  - Its rows are `ListRow`s, with the repo-specific line 2 coming from today's Engine and State words (`getRowState`), moved, not rewritten.
  - The repository summary strip stays.
  - `pane-block-rhythm`'s repository checks still hold.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement it. Move `getRowState` and `beyondCell` into `listRowCopy.ts` as they are.
- [ ] **Step 4:** Run the gates. Name every moved or deleted test, including `RepoPaneIntegration.test.tsx:417`.
- [ ] **Step 5: Commit** `feat(repos): a repository's list uses the same two-line rows as Global`.
- [ ] **Step 6:** Screenshots of a repository with skills, rules and servers, at 1024 × 700, against the mark checklist.

### Task 5: Live check and hand-off

- [ ] Merge into local `main`.
- [ ] Take screenshots at 1024 × 700 and at 1440 × 900: every tab on Global, a repository, and the card both docked and as a popover.
- [ ] Send them to Karthik with the mark checklist filled in. Push only on his word.
