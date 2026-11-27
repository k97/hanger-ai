# Round 42: how to research and plan the eight

What you asked for, as I understand it: research all eight remaining pieces
and write their plans, with agents working in parallel. Each plan gets a
`--plan` gate from a fresh reviewer before anything is built. The eight are:

1. MCP phase 2
2. Slices 2 to 6
3. Engine status (T19)
4. Phase B, the in-app agent

The aim stays what it has been: Hanger as the control panel for your AI
coding harnesses, and later a harness for your harnesses.

Your round 41 answers pull two ways:

- **"All eight at once"** wants them planned together.
- **"Slices 2–6 wait for the T20 plan"** wants the harness plan to decide
  which of them survive, and in what form.

## What the code already settles

MCP phase 2 and slices 2 to 4 write through `mcp::switch`, so whatever plans
them has to name one owner for that code and an order. Phase B needs the
A2UI question asked again (T23) before any model output goes on screen.
Slice 6 waits on a `list_changed` spike for each engine.

## Three ways to do it

- **A. Eight plans in parallel, right now.** Fastest. But T20 is written
  beside the slices, not before them, so it can only reconcile afterwards.
  That breaks your Q2 answer and risks planning slices the harness plan then
  folds away.
- **B. Research in parallel, one design, then plans in parallel.** Eight
  research agents run at once, one per piece, each reading the code and the
  outside facts it depends on. Their findings feed **one design**, the T20
  harness design. It decides which slices survive, merges what overlaps,
  names the owner of shared code, and sets the order and the waves. You
  approve it. Then the surviving pieces get their plans, written in parallel
  and gated in parallel. Roughly 20 agents in all, over two or three
  approval rounds.
- **C. T20 first, alone, then the rest.** It keeps Q2 most strictly, but
  gives up "at once". Nothing else starts until the harness plan is gated.

:::question
Which way should the research and planning run?

- [ ] B — parallel research, one harness design you approve, then parallel plans
- [ ] A — eight plans in parallel now, reconciled afterwards
- [ ] C — T20 alone first, then the others

Recommended: B — parallel research, one harness design you approve, then parallel plans
:::

## Answer (Karthik, 2026-11-28)

**B.** Research runs in parallel, one harness design (T20) decides the eight and you approve it, then the surviving plans are written in parallel, each gated by `stage-gate --plan`.
