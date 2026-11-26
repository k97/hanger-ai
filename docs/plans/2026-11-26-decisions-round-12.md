# Decisions, round 12: the top of Global

The prototypes are in `docs/plans/2026-11-26-global-top-prototypes.html`; open it in a browser. Every frame shows the real window size (1024 × 640) with the details panel open, the width where today's engine chips wrap to three rows.

![All five layouts](/private/tmp/claude-501/-Users-karthik-Work-Labs-hanger-ai/0bdba87d-1b7b-439d-b526-ace99cc83da0/scratchpad/proto/full.png)

| Layout | Pick an engine | Compares engines | Height before the list |
|---|---|---|---|
| A · Today | 1 click | No | ~330 px |
| B · Engine menu | 2 clicks, or ⌘E | Yes: ranked costs in the menu | ~180 px |
| C · Engines in the sidebar | 1 click | Yes: always visible | ~180 px, but the details panel has to close at this width |
| D · Picker in the window bar | 2 clicks, or ⌘E | Yes: same menu as B | ~180 px, harder to find |
| E · One row of engine icons | 1 click | No | ~220 px; the three Claude marks look alike |

:::question id=q1
Which layout should the top of Global use?

- B · Engine menu (Recommended)
- C · Engines in the sidebar
- D · Picker in the window bar
- E · One row of engine icons
- A · Keep today's
:::

Recommended: **B**. It frees the most height while keeping the details panel open, and opening the menu doubles as a ranked comparison of every engine's cost. That comparison is the question Hanger exists to answer. E is the runner-up if one-click switching matters more than comparing.

:::question id=q2
Should the summary's second line become one plain line, "MCP servers ≈ 13,598 (11 of 17 measured) · Skills, Rules, Subagents not measured", instead of today's chip and separate "Not measured" line?

- Yes (Recommended)
- No, keep today's two lines
:::

Recommended: **Yes**. It's the change that takes the summary from four lines to two in every layout except A. The exact words would go through the naming brief before shipping.

:::question id=q3
Once you pick, should I write the plan and build it, the same way as the skill switch?

- Yes: plan, then build in a worktree, then show you screenshots before merging (Recommended)
- Plan only; I'll review it first
:::

## Outcome (2026-11-26)

Dismissed in Plannotator. Karthik asked to iterate on T3's session card instead, which became layouts F and G and round 13.
