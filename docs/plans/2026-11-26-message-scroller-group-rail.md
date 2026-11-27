# MessageScroller Group Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use shadcn MessageScroller behavior and a title/count HoverCard for Hanger’s Global and Repository group ticks, without changing their layout or adding chat behavior.

**Architecture:** Use `@shadcn/react/message-scroller` headless parts around the existing scroll viewport and lane. Each rendered group is a stable `MessageScroller.Item`; `GroupTicks` reads visible item IDs and uses the provider’s jump method. A local shadcn Base UI HoverCard wrapper supplies the preview, while Hanger retains its own styling.

**Tech Stack:** React 19, TypeScript, Tauri 2, Bun 1.3.14, Tailwind v4 semantic tokens, Vitest, `@shadcn/react/message-scroller`, shadcn Base UI HoverCard.

**Spec:** [MessageScroller group-rail design](../superpowers/specs/2026-11-26-message-scroller-group-rail-design.md), approved in [round 26](2026-11-26-decisions-round-26.md) and corrected in [round 27](2026-11-26-decisions-round-27.md).

## Global Constraints

- Apply the behavior to Global and Repositories; keep the 24 × 2 px ticks, current group ordering, row contents, lane geometry, and overview card.
- Set `defaultScrollPosition="start"` and `autoScroll={false}`. Do not render `MessageScroller.Button` or set `scrollAnchor`.
- Every application-supplied direct child of `MessageScroller.Content` is an `Item` with a stable `messageId`; the library adds one internal spacer with `hidden` and `aria-hidden="true"`. Set Content to `role="list"` and `aria-live="off"`, and each item to `role="listitem"`.
- Choose the first visible ticked item in `visibleMessageIds` document order; fall back to the first ticked group. Clicks call `scrollToMessage(id, { align: "start" })`.
- Replace only the group-tick Tooltip with a HoverCard. Open after 100 ms; show only the group title and known count; keep the trigger’s existing accessible name. No new visible copy.
- Override the viewport’s default “Messages” accessible name with existing context: “Global”, the current repository folder name, or “Design system” in the specimen.
- Use Hanger tokens only: `rounded-inner`, `border-line`, `bg-page`, and `shadow-overlay` for the preview. Do not add tokens or chat/streaming behavior.
- Do not write production code until this plan is approved in Plannotator. Do not push without Karthik’s explicit instruction. Do not stage unrelated untracked files.

## Review Focus

1. **Rescan/filter changes while scrolled:** no new chat-turn anchoring or move to a newly added group. Assert that no rendered item has `data-scroll-anchor="true"` in the pane tests, and test first-visible/fallback selection in `GroupTicks.test.tsx`.
2. **Groups not represented in the rail:** ignore visible IDs that are not in `groups`; select the first visible ticked group. Pin this with an ordered `visibleMessageIds` fixture in `GroupTicks.test.tsx`.
3. **Zero, one, or count-less groups:** show no rail below two groups, and show a title-only preview when `count` is `null`. Pin both in `GroupTicks.test.tsx`.
4. **Collapsible Global groups and separate panes:** each item keeps a stable ID, and tick names still match its heading. Pin Global in `global_groups.test.tsx`, Global tick data in `ProfilePaneGroupTicks.test.tsx`, and Repository structure in `RepoPaneList.test.tsx`.
5. **Keyboard and pointer use of the preview:** focus and hover open the card, click still jumps, and the popup contains no row details. Pin behavior in `GroupTicks.test.tsx`; verify actual positioning in the Tauri screenshots.

---

### Task 1: Add the two UI primitives

**Files:**
- Evidence: `docs/evidence/2026-11-26-message-scroller/`
- Modify: `package.json`
- Modify: `bun.lock`
- Create: `src/components/ui/hover-card.tsx`
- Modify: `src/components/DesignSystemPane.tsx`
- Modify: `src/__tests__/design_system_pane.test.tsx`
- Modify: `.claude/DESIGN.md`
- Test unchanged: `src/__tests__/design-system-coverage.test.ts`

**Interfaces:**
- Produces the headless MessageScroller exports from `@shadcn/react/message-scroller`.
- Produces local `HoverCard`, `HoverCardTrigger`, and `HoverCardContent` exports using the existing `components.json` aliases and Base UI dependency.

- [x] **Step 1: Capture the real-app baseline before editing**

Capture the current Global and Repository panes in the running Tauri app before changing files. Save them as `00-before-global.png` and `00-before-repositories.png` under `docs/evidence/2026-11-26-message-scroller/`, inspect them, and share them with Karthik as the starting state.

- [x] **Step 2: Write the failing design-system specimen test**

In `src/__tests__/design_system_pane.test.tsx`, add `"HoverCard"` to the component `INVENTORY` and add `opens the HoverCard specimen on focus and hover`. Assert that focusing or hovering the sample trigger reveals the sample group title/count and that the card contains no row details.

- [x] **Step 3: Run the specimen test red**

Run: `npx vitest run src/__tests__/design_system_pane.test.tsx` from the repository root.  
Expected: FAIL because the page has no HoverCard specimen.

- [x] **Step 4: Add the headless package with Bun**

Run from the repository root:

```bash
~/.bun/bin/bun add @shadcn/react
```

Expected: `package.json` and `bun.lock` record `@shadcn/react`; no unrelated dependency changes.

- [x] **Step 5: Add the Base UI HoverCard wrapper**

Run:

```bash
~/.bun/bin/bunx --bun shadcn@latest add hover-card
```

Expected: `src/components/ui/hover-card.tsx` is created under the alias configured by `components.json`; Base UI is reused, not duplicated as a dependency.

- [x] **Step 6: Match the wrapper to Hanger’s overlay**

In `src/components/ui/hover-card.tsx`, retain the shadcn Base UI parts and `data-slot` markers, use `cn` from `src/lib/utils`, and style the popup with `bg-page text-ink-1 border border-line rounded-inner shadow-overlay`. Keep motion absent, as in Hanger’s Popover. Leave `side`, `align`, offsets, and trigger delay caller-configurable.

- [x] **Step 7: Add the component’s own specimen**

In `DesignSystemPane.tsx`, import `HoverCard`, `HoverCardTrigger`, and `HoverCardContent` directly from `./ui/hover-card`. Add a component specimen captioned “HoverCard” that previews the existing sample `Skills · 7` without adding product copy. Add `HoverCard` to `.claude/DESIGN.md`’s shadcn component inventory.

- [x] **Step 8: Run the design-system tests**

Run:

```bash
npx vitest run src/__tests__/design_system_pane.test.tsx src/__tests__/design-system-coverage.test.ts
```

Expected: PASS, including the guard that every `src/components/ui/*.tsx` module is imported by the Design System page or explicitly exempted.

- [x] **Step 9: Type-check the primitives**

Run: `~/.bun/bin/bunx tsc --noEmit` from the repository root.  
Expected: exit 0.

- [x] **Step 10: Commit the dependency, wrapper, and specimen**

Stage only the files listed in this task; commit as `feat: add message scroller and hover card primitives`.

---

### Task 2: Integrate group tracking, preview, and list structure

**Files:**
- Modify: `src/components/GroupTicks.tsx`
- Modify: `src/components/ProfilePane.tsx`
- Modify: `src/components/RepoPane.tsx`
- Modify: `src/components/DesignSystemPane.tsx`
- Modify: `src/components/GroupTicks.test.tsx`
- Modify: `src/components/ProfilePaneGroupTicks.test.tsx`
- Modify: `src/components/RepoPaneList.test.tsx`
- Modify: `src/__tests__/global_groups.test.tsx`
- Modify: `src/__tests__/design_system_pane.test.tsx`
- Modify: `.claude/DESIGN.md`
- Test unchanged: `src/components/ProfilePaneList.test.tsx`

**Interfaces:**
- Consumes `MessageScroller.Provider`, `Root`, `Viewport`, `Content`, `Item`, `useMessageScroller`, and `useMessageScrollerVisibility` from `@shadcn/react/message-scroller`.
- Changes `GroupTicks` to `GroupTicks({ groups }: { groups: TickGroup[] })`; `TickGroup` remains `{ id: string; label: string; count: number | null }`.
- `useMessageScrollerVisibility()` supplies `visibleMessageIds: string[]`; `useMessageScroller()` supplies `scrollToMessage(messageId, { align: "start" }): boolean`.

- [x] **Step 1: Write failing `GroupTicks` behavior tests**

In `src/components/GroupTicks.test.tsx`, replace the IntersectionObserver geometry stub with a mock of the two public MessageScroller hooks. Name the tests:

- `marks the first visible ticked item current in document order`
- `falls back to the first ticked group when none are visible`
- `jumps to the selected group item with start alignment`
- `opens the title/count preview on hover and keyboard focus`
- `omits a null count and draws no rail for fewer than two groups`

For the first test, provide `visibleMessageIds = ["group-agents", "group-tools", "group-rules"]` and groups Skills, MCP servers, Rules. Pin:

```ts
expect(screen.getByRole("button", { name: "MCP servers · 33" }).getAttribute("aria-current")).toBe("true");
expect(screen.getByRole("button", { name: "Rules · 3" }).getAttribute("aria-current")).toBeNull();
```

For the jump test, assert `scrollToMessage` receives `"group-tools"` and `{ align: "start" }`. For the preview test, advance the 100 ms trigger delay and assert it shows `MCP servers · 33`, while row text such as `atlas` is absent. The null-count case shows only its group label.

- [x] **Step 2: Run the focused test red**

Run: `npx vitest run src/components/GroupTicks.test.tsx` from the repository root.  
Expected: FAIL because the current component uses IntersectionObserver/`scrollIntoView` and Tooltip.

- [x] **Step 3: Implement `GroupTicks` with the public hooks**

In `src/components/GroupTicks.tsx`, remove `scrollRoot`, IntersectionObserver state/effect, Tooltip, and direct `scrollIntoView`. Read `visibleMessageIds` and `scrollToMessage` from the hooks. Resolve the active tick as the first `visibleMessageIds` entry present in `groups`, otherwise `groups[0]`. Preserve `groupHead`, button names, `aria-current`, nav placement, 24 × 2 tick classes, and the fewer-than-two-groups early return.

Wrap each tick button with `HoverCard`/`HoverCardTrigger`/`HoverCardContent`. Use `delay={100}`, `side="right"`, `align="center"`, and `sideOffset={8}` (matching the existing Tooltip gap). Use the existing button as the trigger via the Base UI `render` prop so the button remains the sole interactive element. Render only the `groupHead` label/count in the card with `whitespace-nowrap px-3 py-2 text-small font-medium text-ink-3`, matching GroupHead’s typography; the 12 × 8 px padding and 12px type make it a larger card than Tooltip’s 8 × 4 px padding and 11px type without a fixed width.

- [x] **Step 4: Run `GroupTicks` tests green**

Run: `npx vitest run src/components/GroupTicks.test.tsx`.  
Expected: PASS, including `scrollToMessage` calls and HoverCard hover/focus states.

- [x] **Step 5: Write failing pane-structure tests**

Update `ProfilePaneGroupTicks.test.tsx`, `RepoPaneList.test.tsx`, `global_groups.test.tsx`, and `design_system_pane.test.tsx`. Name the structure test `uses static list semantics and stable group items` and assert:

```ts
const children = Array.from(content.children);
const spacers = children.filter((child) => child.hasAttribute("data-message-scroller-spacer"));
const items = children.filter((child) => !child.hasAttribute("data-message-scroller-spacer"));

expect(content.getAttribute("role")).toBe("list");
expect(content.getAttribute("aria-live")).toBe("off");
expect(spacers).toHaveLength(1);
expect(spacers[0]?.getAttribute("aria-hidden")).toBe("true");
expect(spacers[0]?.hasAttribute("hidden")).toBe(true);
expect(items.every((item) => item.getAttribute("role") === "listitem")).toBe(true);
expect(content.querySelector('[data-scroll-anchor="true"]')).toBeNull();
```

Also assert that each ticked group’s `data-message-id` equals its existing group ID, its heading keeps its current DOM `id` and accessible name, the Agents-only section has the non-rail item ID `group-agents`, and each viewport uses its existing pane name instead of “Messages”. Keep the existing wide/narrow lane assertions and 24 × 2 tick dimensions.

- [x] **Step 6: Run the focused pane tests red**

Run:

```bash
npx vitest run src/components/ProfilePaneGroupTicks.test.tsx src/components/ProfilePaneList.test.tsx src/components/RepoPaneList.test.tsx src/__tests__/global_groups.test.tsx src/__tests__/design_system_pane.test.tsx
```

Expected: FAIL because the panes and Design System specimen do not yet provide MessageScroller parts or static list roles.

- [x] **Step 7: Wrap the existing list DOM without changing its geometry**

In `ProfilePane.tsx`, `RepoPane.tsx`, and `DesignSystemPane.tsx`, use this structure:

```tsx
<MessageScroller.Provider defaultScrollPosition="start" autoScroll={false}>
  <MessageScroller.Root>{/* existing rail and viewport layout */}</MessageScroller.Root>
</MessageScroller.Provider>
```

Use `MessageScroller.Root` for the existing relative flex wrapper, `Viewport` for the current scroll node/classes, and `Content` for the existing lane element/classes. Remove ProfilePane's `listRef`/`setListNode`, RepoPane's `listRef`, and the Design System specimen's `list` ref; GroupTicks' hooks replace their only consumer and the MessageScroller parts own their internal refs. Keep any ProfilePane dock-clearance wrapper outside `Content`. Wrap every rendered section in a direct-child `MessageScroller.Item` with `role="listitem"` and stable `messageId`; set `role="list"` and `aria-live="off"` on Content. Keep every existing group heading DOM ID. Put `mt-2.5 first:mt-0` on each top-level Item whose section currently has that margin. Keep the existing nested `GroupHead`/`CollapsibleGroup` class strings: each becomes the Item's first child, so its `first:mt-0` suppresses the nested margin while the Item preserves the inter-group gap, avoiding a shared-component API change. Do not add that margin to the Agents-only section or Design System specimen, whose current spacing comes from their own heading padding. Give Agents-only its `group-agents` item ID without changing visible markup. The Design System’s four sample sections use their existing `ds-ticks-*` IDs as item IDs. Set each Viewport `aria-label` from the existing pane label, not “Messages”. Do not set `scrollAnchor`, add `MessageScroller.Button`, or alter row/group content.

- [x] **Step 8: Update the design reference**

Rewrite `.claude/DESIGN.md`’s `GroupTicks` paragraph to document its `groups`-only prop, MessageScroller visibility/jump hooks, first-visible tick selection, 100 ms HoverCard, unchanged ticks, and updated tests. Keep the paragraph derived from the implementation.

- [x] **Step 9: Run the focused UI tests**

Run the command from Step 6 plus `src/components/GroupTicks.test.tsx`.  
Expected: PASS; existing pane/lane assertions remain unchanged and the new list/item, accessible-name, and preview assertions pass.

- [x] **Step 10: Commit the integration**

Stage only the files listed in this task; preserve any unrelated changes in the shared checkout. Commit as `feat: add message scroller group navigation`.

---

### Task 3: Verify the real Tauri UI and repository gates

**Files:**
- Evidence: `docs/evidence/2026-11-26-message-scroller/`
- Verify only; do not edit unrelated files.

**Interfaces:**
- Consumes the integrated Global and Repository lists from Task 2.
- Produces real Tauri screenshots and pinned gate results for this exact tree.

- [x] **Step 1: Capture the changed states in the real Tauri app**

Use the running dev app, not a browser mock. In both Global and Repositories, capture the wide lane with the preview closed, the preview open from pointer hover, the preview open from keyboard focus, and the list after a tick jump. Confirm the 24 × 2 ticks and existing rows/lane are unchanged; the active tick follows the visible group; a click lands the group item at the viewport start; and no visible label, count, or row content was added. Save captures in `docs/evidence/2026-11-26-message-scroller/`, inspect each, and share them with Karthik as they are captured.

- [x] **Step 2: Run the pinned full frontend suite**

Run `npx vitest run` from the repository root.  
Expected: all frontend tests pass.

- [x] **Step 3: Run the Rust gate**

Run `cargo test` from `src-tauri/`.  
Expected: exit 0.

- [x] **Step 4: Run TypeScript**

Run `bunx tsc --noEmit` from the repository root.  
Expected: exit 0.

- [x] **Step 5: Run both secret scans**

Run separately from the repository root:

```bash
gitleaks detect --source .
gitleaks detect --source . --no-git -c .gitleaks.toml
```

Expected: both exit 0.

- [x] **Step 6: Report evidence and stop**

Link the screenshots and report the exact command and result for every gate. The visual iteration remains open until Karthik reviews the real-app screenshots. Do not push.

## References

- [Headless Message Scroller API](https://ui.shadcn.com/docs/react/message-scroller#api-reference): package installation, parts, default roles, `visibleMessageIds`, and `scrollToMessage`.
- [shadcn Base UI Hover Card](https://ui.shadcn.com/docs/components/base/hover-card): installation, trigger delay, positioning, and composition.
