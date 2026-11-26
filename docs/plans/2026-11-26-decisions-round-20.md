# Round 20: Task 1's screenshots, from the dev app

These come from the real app (1024 × 700), merged into local `main` at `e42461e` and not pushed. The approved frame is first, for comparison.

**Approved frame (H with two-line rows):**

![approved](/Users/karthik/Work/Labs/hanger-ai/docs/evidence/2026-11-26-global-list/approved-HI.png)

**The app now, All, top of the list:**

![All](/Users/karthik/Work/Labs/hanger-ai/docs/evidence/2026-11-26-global-list/task1-all.png)

**MCP servers:**

![MCP servers](/Users/karthik/Work/Labs/hanger-ai/docs/evidence/2026-11-26-global-list/task1-mcp.png)

**A row selected:**

![Selected](/Users/karthik/Work/Labs/hanger-ai/docs/evidence/2026-11-26-global-list/task1-selected.png)

**Scrolled into Subagents** (the stuck "MCP servers" header is Task 3's fix):

![Scrolled](/Users/karthik/Work/Labs/hanger-ai/docs/evidence/2026-11-26-global-list/task1-scrolled.png)

## Your marks, checked on these screenshots

| Mark | Now |
|---|---|
| A centred column | Yes: 736 px, centred, while nothing is selected |
| Tick marks in its margin | Yes, while nothing is selected |
| A list instead of a table | Yes: two-line rows, no column headers |
| Window-bar buttons and the docked card | Not yet (Task 2) |

The repeated rows (four `xlsx`) were in the old table too. They're separate copies on disk.

:::question
Approve Task 1's slice and go on to the shadcn setup and Task 2?

- [ ] Approve and go on
- [ ] Approve, with changes noted below
- [ ] Not right yet (say what)

Recommended: Approve and go on
:::

:::question
With a row selected, the list is 548 px wide. That's under T3's 640 px minimum, so the column fills the space and the tick marks hide. The approved frame had drawn them. Which rule should win?

Where: Global with a row selected (the third screenshot).

Before: the approved frame (HI2) shows a 48 px margin and tick marks beside a narrower column.

After: the column fills the width, with no margin and no tick marks.

- [ ] Keep T3's rule: no margin and no tick marks below 640 px — the list keeps every pixel when space is tight
- [ ] Always keep the margin and the tick marks, as in the approved frame — the list loses 96 px when the inspector is open

Recommended: Keep T3's rule: no margin and no tick marks below 640 px
:::

## Answers (Karthik, 2026-11-26, Plannotator)

- q1: Task 1's slice is approved. Go on to the shadcn setup and Task 2.
- q2: T3's rule stays: below 640 px the list has no margin and no tick marks.
