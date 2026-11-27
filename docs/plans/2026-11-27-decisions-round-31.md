# Round 31: the repository card, as it runs

Captures from this branch's dev app (`Hanger AI (dev)`, 1024 × 700, light
theme), on the repository `~/Work/Projects/rkarthik/skills`. Tasks 1 to 6 and
8 of [the parity plan](2026-11-27-repo-view-parity.md) are built and reviewed.
Task 7 deletes `HeroBand` and the summary strip, and the plan waits for your
look before it runs.

:::question
Does the repository's overview card look right, so Task 7 can retire the old strip?

The card docks at the top right when the inspector is closed, and its button sits in the window bar when the inspector is open. Its "By engine" row first drew "Any agent" cut to "A.."; that is fixed in the shared card, so Global's rows are unchanged. The popover (⌘E) was not captured, because nothing here can press keys without moving your hands: you can try it in the running dev app.

- [ ] Docked · Accept — ![Repository, card docked](../evidence/2026-11-27-repo-view-parity/04-repo-docked-fixed-1024.png) the card in layout A, inspector closed
- [ ] Inspector open · Accept — ![Repository, inspector open](../evidence/2026-11-27-repo-view-parity/01-repo-all-1024.png) tabs in the lane, no strip, the card's button in the window bar
- [ ] Needs changes — say what in a note, and Task 7 waits

Recommended: Docked · Accept
:::

For comparison, Global with the same card:
![Global, card docked](../evidence/2026-11-27-repo-view-parity/03-global-docked-1024.png)

:::question
The repository reads "Showing 7 of 89", and its legend counts 7 assets while the card says 89. Is that worth a look now?

It is not from this work: the old summary strip read the same figures, and `.claude/rules/known-debt.md` records the same mismatch on another repository ("Showing 124 of 1"). The list shows the rows the scan loaded for this repository, while the tabs and the card's total come from the backend's count.

- [ ] Leave it in known debt — fix it in the later plan for the blocked rows
- [ ] Trace it now, in its own task after Task 9 — a separate fix on this branch

Recommended: Leave it in known debt
:::

## Answers (Karthik, 2026-11-27)

1. **Docked · Accept.** Task 7 runs.
2. **Leave it in known debt.**
