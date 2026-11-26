# Decisions, round 13: the overview card, and two kept-panel points

## 1. The top of Global, after T3

You dismissed round 12 and asked to iterate on T3's card. The prototype page (`docs/plans/2026-11-26-global-top-prototypes.html`) now has two more layouts:

- **F**: an overview card that drops from a button at the right of the window bar.
- **G**: the same card pinned into the right column, with tick marks that jump between the list's groups.

![F, the card open](/private/tmp/claude-501/-Users-karthik-Work-Labs-hanger-ai/0bdba87d-1b7b-439d-b526-ace99cc83da0/scratchpad/proto/f.png)

![G, the card pinned](/private/tmp/claude-501/-Users-karthik-Work-Labs-hanger-ai/0bdba87d-1b7b-439d-b526-ace99cc83da0/scratchpad/proto/g.png)

The card has three parts:

- **Engines:** every engine ranked by cost, each with a thin meter bar. Clicking one picks it.
- **The chosen engine:** its total, a Measure all button, and one meter for each kind. A dashed bar means that kind isn't measured yet.
- **Actions:** Needs review and Rescan.

The page itself keeps only the kind tabs, so the list starts right under them.

:::question id=q1
Which layout should the top of Global use?

- F and G together: the card opens from the window bar and can be pinned (Recommended)
- F only: the card opens from the window bar, no pinning
- G only: the card always sits in the right column when nothing is selected
- B: the engine menu from round 12
:::

Recommended: **F and G together**, as T3 does. Pinned, the card fills today's empty details column, so the totals sit where you can see them at rest. Unpinned, the card is one click away and the window keeps its room. Picking an asset shows its details in that column, and Esc brings the card back.

:::question id=q2
Should G's tick marks (one per group, click to jump) be part of it?

- Yes (Recommended)
- No, leave them out for now
:::

## 2. Two points from the kept-panel fix

The kept skill's panel now has one switch, the header's. That's merged into local `main` (`f8c1c3e`), all gates pass, and it's not pushed yet. The subagent stopped on two other parts and gave its reasons.

:::question id=q3
A switched-off MCP server's panel has two switches, and they don't do the same thing. The body switch puts back this engine's copy. The header switch covers every engine: when another engine has the server on, it reads "mixed" and clicking it switches that engine's copy off. It also doesn't appear until the engine list has loaded. What should the kept server panel do?

- Keep both switches. They do different things, and the body's row names its engine (Recommended)
- Make the header switch put back only the kept copy in this panel, and remove the body switch
:::

:::question id=q4
The skills "Switched off" group already sits right after the Skills rows on the All tab. The screenshot that looked wrong had OpenCode picked. OpenCode loads no global skills, so the Skills rows moved down to "Not loaded by OpenCode" and the group was left alone above MCP servers. Where should it go when an engine is picked and no Skills rows show?

- Just before the "Not loaded by {engine}" group at the end of the list (Recommended)
- Leave it where it is
:::

:::question id=q5
Push the kept skill panel fix (`f8c1c3e`) now?

- Yes (Recommended)
- Wait and push it with the next change
:::

## Answers (Karthik, 2026-11-26, approved in Plannotator with no notes)

- q1: F and G together: the card opens from the window bar and can be pinned.
- q2: Yes, the tick marks are part of it.
- q3: Keep both switches in a kept MCP server's panel.
- q4: When an engine is picked and no Skills rows show, the skills "Switched off" group goes just before "Not loaded by {engine}".
- q5: Push `f8c1c3e` now.
