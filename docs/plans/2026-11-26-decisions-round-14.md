# Decisions, round 14: the overview card's plan

The plan is `docs/plans/2026-11-26-overview-card.md`, in 8 tasks:

1. The skills "Switched off" group placement (your round 13 q4)
2. Group tick marks
3. The card component
4. Moving the figures into one hook
5. The card from the window bar with ⌘E
6. Pinned in the inspector, with Esc
7. Removing the chips and the summary
8. A live check with screenshots before any push

Mapping the code turned up the five points below.

:::question id=q1
Every bar in Hanger draws through one meter, the glassy GelMeter, and aqua is kept for a true share. How should the card's bars look?

- A plain ink bar, a GelMeter "rank" tone with no gloss and no aqua; unmeasured engines and kinds get an empty track (Recommended)
- The prototype's look, with a thin line and a tick at the end, plus dashed bars for not measured: a new meter style
:::

Recommended: **the rank tone**. It keeps one meter in the system, and an empty track already reads as "nothing here yet" without a new dashed style.

:::question id=q2
The All engines summary also holds the linked / drifted / broken / local-only filter for the list. Where should it go once the summary is removed?

- Into the card: with All engines picked, the second section shows "The global store · {n} assets" with that filter (Recommended)
- Drop it from Global
:::

Recommended: **into the card**. Picking All engines is the moment you're looking at the store as a whole, so the store's link state belongs there.

:::question id=q3
Where should the card's buttons go?

- Open: a button at the right of the main column's window bar, on Global only, with ⌘E. Pin: a button in the card's own header (Recommended)
- Both buttons in the window bar, as T3 does
:::

Recommended: **open in the window bar, pin in the card**. The inspector's window bar already has two buttons (Expand and Toggle inspector), so a third there would crowd it. In the card, pinning sits right next to what it pins.

:::question id=q4
Esc doesn't clear a selection anywhere today. The plan adds it: on Global with the card pinned, Esc clears the selected asset and the card comes back. Esc in an open menu, popover or the search palette still closes that first. Should Esc clear the selection everywhere, or only on Global?

- Only on Global, where it brings the card back (Recommended)
- Everywhere the inspector shows a selection
:::

:::question id=q5
New strings, with the full table in the plan's "Strings" section:

- the window-bar button: `Show overview  ⌘E` / `Hide overview  ⌘E`
- the pin button: `Pin to the inspector` / `Unpin from the inspector`
- the All engines section head: `The global store · {n} assets`
- the ticks: `Jump to a group`, and each tick `{group} · {count}`

Every other string in the card is one you already approved. Approve these?

- Approve as written (Recommended)
- Change some (add a note)
:::

:::question id=q6
Approve the plan and build it the way the skill switch was built: one subagent per task in a worktree, red-first tests, the four gates, then screenshots to you before anything is pushed?

- Yes (Recommended)
- Let me read the plan first; I'll note changes
:::

## Answers (Karthik, 2026-11-26, approved in Plannotator with no notes)

- q1: The rank tone. A plain ink GelMeter bar with no gloss and no aqua; unmeasured engines and kinds get an empty track.
- q2: The link-state filter moves into the card. With All engines picked, the second section shows "The global store · {n} assets" with the filter.
- q3: The open button goes at the right of the main column's window bar, on Global only, with ⌘E. The pin button goes in the card's own header.
- q4: Esc clears the selection only on Global, where it brings the card back.
- q5: The new strings are approved as written.
- q6: The plan is approved, to be built one subagent per task in a worktree, with screenshots before any push.
