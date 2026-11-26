# Round 19: shadcn components in place of Hanger's own

You asked to take the latest shadcn and swap its components in for Hanger's as the list work goes through each area.

Today Hanger has no shadcn. Tabs, popovers, menus, tooltips and toggles are all hand-built (`SegmentedTrack`, `OverviewPopover`, `OverflowMenu`, `ViewControl`, `Tooltip`, `FindingPopover`, `InfoPopover`).

T3 Code uses shadcn on Base UI (style `base-mira`, zinc, lucide icons), with extra components from the coss registry (`/Users/karthik/Work/Labs/t3code/apps/web/components.json`).

## What would swap, and when

| shadcn component | Replaces | In which task |
|---|---|---|
| Tabs | The kind tabs (`SegmentedTrack` in `CategoryFilterCards`) | The setup step, before Task 2 |
| Popover | `OverviewPopover`, and later `FindingPopover` and `InfoPopover` | Task 2 |
| Tooltip | `Tooltip` | Task 2 (window-bar buttons), then everywhere |
| Toggle | The window-bar buttons (`tbBtnClass`) | Task 2 |
| Collapsible | "Not loaded by {engine}" and "Switched off" | Task 3 |
| DropdownMenu | `ViewControl` and `OverflowMenu` | Task 3 |
| Separator | Hand-drawn hairlines and dividers | As each task touches them |

These stay hand-built: the two-line row (shadcn has no list row; T3 built its own too), `GelMeter`, and the card's sections.

:::question
Which primitives should shadcn sit on?

shadcn can build on Base UI or Radix. T3 uses Base UI, and it's what shadcn's newer styles default to. Either way the components work the same for you.

- [ ] Base UI, as T3 uses — the same base as the app we're following, so its components can be copied straight across
- [ ] Radix — older and more widely used

Recommended: Base UI, as T3 uses
:::

:::question
Whose look should the shadcn components have?

shadcn's components read their colours, radii and type from theme variables. We can point those at Hanger's existing tokens, or take a shadcn preset's look.

- [ ] Hanger's look: shadcn's variables point at Hanger's tokens, so nothing changes visually except where a component does — no design-system rework
- [ ] T3's look: the base-mira style with zinc, so Hanger looks more like T3 everywhere, not just on Global
- [ ] Decide per component as they come in

Recommended: Hanger's look: shadcn's variables point at Hanger's tokens
:::

:::question
When does the swap start?

Task 1, the two-line rows and the column, is being built right now without shadcn.

- [ ] After you approve Task 1's screenshots: one setup step (shadcn and the Tabs swap), then each later task swaps the components it touches, as in the table — the slice you're about to see doesn't change under you
- [ ] Now: stop Task 1, set up shadcn first, then redo the slice on it

Recommended: After you approve Task 1's screenshots
:::

## Answers (Karthik, 2026-11-26, Plannotator)

- q1: Base UI, as T3 uses.
- q2: Hanger's look. shadcn's variables point at Hanger's tokens.
- q3: The swap starts after Task 1's screenshots are approved. One setup step (shadcn plus the Tabs swap) comes first, then each later task swaps the components it touches, per the table.
