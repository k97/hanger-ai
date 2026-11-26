# Round 16: Global's list, from T3's code

These layouts are drawn from T3 Code's source (`/Users/karthik/Work/Labs/t3code/apps/web/src`), not from its screenshots. The full page with notes is `docs/plans/2026-11-26-global-list-prototypes.html`. Every frame is your dev window's size, 1024 × 700.

## Your marks, and where each one is now

| Your mark on the T3 screenshot | What T3's code does | Where it is in these layouts |
|---|---|---|
| The buttons at the top right of the window bar | 28 px toggles, 4 px apart; one opens the session card (`PanelLayoutControls.tsx:62-93`) | One card button and the inspector toggle, in every option |
| The tick marks left of the chat | 24 × 2 px ticks in the column's left margin, 12 px in (`TimelineMinimap.tsx:110-214`) | In the margin of the content column, in H, I and K |
| The vertical lines at the chat column's edges | A centred column, at most 736 px wide, with 48 px padding (`index.css:131,979-984`); it moves left to keep 32 px clear of the card (`chatCanvasLayout.ts:46-51`) | **H, I and K have the column. J doesn't.** This is the mark the last round dropped. |
| (Your later words) "changing the table into a fluid list" | Lists are rows: an icon, a name that truncates, and one slot on the right; no column headers (`SidebarThreadRow.tsx:1356-1408`) | H, I and J are lists. K keeps the table. |

## H · T3's layout (recommended)

![H](/private/tmp/claude-501/-Users-karthik-Work-Labs-hanger-ai/0bdba87d-1b7b-439d-b526-ace99cc83da0/scratchpad/gen/s-H.png)

One-line rows sit in the column, with quiet group headers ("Skills ——— 554"). The card floats at the top right at T3's size: 280 px, with 3 px meters. The column moves left to keep clear of it.

## H · with an asset selected

![H2](/private/tmp/claude-501/-Users-karthik-Work-Labs-hanger-ai/0bdba87d-1b7b-439d-b526-ace99cc83da0/scratchpad/gen/s-H2.png)

The details open on the right. The card goes back to its button and opens as a popover, drawn open here. T3 does this when there's no room to dock the card.

## I · Two-line rows, card in the right column

![I](/private/tmp/claude-501/-Users-karthik-Work-Labs-hanger-ai/0bdba87d-1b7b-439d-b526-ace99cc83da0/scratchpad/gen/s-I.png)

## J · Compact rows, with groups at the bottom

![J](/private/tmp/claude-501/-Users-karthik-Work-Labs-hanger-ai/0bdba87d-1b7b-439d-b526-ace99cc83da0/scratchpad/gen/s-J.png)

## K · Keep the table, quieter (smallest change)

![K](/private/tmp/claude-501/-Users-karthik-Work-Labs-hanger-ai/0bdba87d-1b7b-439d-b526-ace99cc83da0/scratchpad/gen/s-K.png)

:::question id=q1
Which layout should Global use?

- H · T3's layout: one-line rows in a centred column, with the card floating at the top right (Recommended)
- I · Two-line rows, with the card in the right column
- J · Compact rows, with "Switched off" and "Not loaded" at the bottom
- K · Keep the table, quieter
:::

Recommended: **H**. It's the only option that carries all three of your marks plus the list. I shows more per row but fits half as many. J drops the column.

:::question id=q2
T3 has no pin button. It docks the card when there's room (content column ≥ 640 px plus the card) and uses a popover otherwise. Should Hanger do the same, removing the pin button and its saved setting?

- Yes, the app decides from the space available, as T3 does (Recommended)
- No, keep the pin button
:::

:::question id=q3
T3's main area has no rounded panel around it. Hanger's does, and the design system is built on it. Should that change too?

- No: keep Hanger's rounded panel and change only what's inside Global (Recommended)
- Yes: go flat like T3, everywhere (a separate, larger piece of work)
:::

:::question id=q4
How the build is checked. Last time, the real screen was first seen after everything was merged. This time, the plan's first task builds the list and the column with real data, and I send you dev-app screenshots before any other task starts. Agreed?

- Yes: the first task is a visual slice you approve before the rest (Recommended)
- No, build it all and show me at the end
:::

## Answers (Karthik, 2026-11-26, Plannotator)

- q1: "I prefer H · T3's layout (recommended) but with the two line rows." So H's centred column, floating card and tick marks, with I's two-line rows.
- q2, q3 and q4 had no notes, so the recommended answers stand:
  - q2: the app docks the card when there's room and uses a popover otherwise; the pin button and its setting go.
  - q3: Hanger's rounded panel stays.
  - q4: the first build task is a visual slice in the real app, approved before the rest.
