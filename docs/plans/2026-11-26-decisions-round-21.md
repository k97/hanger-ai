# Round 21: when the overview card docks

Task 2 is built and merged into local `main` (`c5706c4`, not pushed). All gates pass.

T3 docks its card only when the content column can stay at least 640 px wide beside it. Our plan copied that rule, and it needs a list area about 1,060 px wide. Your dev window is 1,024 px, which leaves a 968 px list area. So at your size the card never docks, and it lives behind the window-bar button.

The frame you approved has it docked at 1,024:

![approved](/Users/karthik/Work/Labs/hanger-ai/docs/evidence/2026-11-26-global-list/approved-HI.png)

:::question
When should the card dock beside the list?

Where: Global, nothing selected, at your 1,024 px window.

Before: the approved frame, with the card docked and the list column about 560 px wide.

After: depends on the choice below.

- [ ] When the column can stay at least 560 px wide, as in the approved frame — docks at 1,024 with nothing selected; a row selected sends it behind its button
- [ ] T3's rule, at least 640 px — at 1,024 the card is always behind its button; it docks from about a 1,100 px window
- [ ] Never dock; always open from the button

Recommended: When the column can stay at least 560 px wide, as in the approved frame
:::

## Answer (Karthik, 2026-11-26, Plannotator)

- q1: Dock when the column can stay at least 560 px wide, as in the approved frame. That's a list area of at least 560 + 280 + 12 + 32 = 884 px. At 1,024 with nothing selected (968 px) the card docks. With a row selected (about 584 px) it goes behind its button.
