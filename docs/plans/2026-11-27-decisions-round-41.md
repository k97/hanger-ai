# Round 41: can the eight go in one go?

A correction first. The MCP server's phase 2 isn't waiting on Question 8. You
answered it already: "read-only first, writes after its live proof". The live
proof passed tonight (round 39), so phase 2 can start now.

## Why not all eight in parallel

Three things stop it, and none of them is how many agents can run:

1. **They share machinery.** Slices 2, 3 and 4 (per-project overrides,
   add/remove/Registry, profiles) all write configs through `mcp::switch`.
   MCP phase 2 applies its proposals through the same code. Run them side by
   side and they collide in the same files, which `shared-asset-machinery.md`
   says breaks silently.
2. **Your own ruling (T18).** You asked to plan Hanger as a harness first
   (T20), then see which of slices 2 to 6 that plan covers. The research note
   exists, but the plan doesn't yet. Building the slices first risks building
   what the plan folds away.
3. **Your gates.** Every track needs your sign-off at points: naming briefs,
   layout options before UI, live checks. Eight tracks put eight queues of
   questions in front of you at once. Today, three tracks already meant
   rounds 28 to 40. The account also hit its 5-hour limit once tonight.

## What can run together

| Wave | Runs side by side | Why these fit together |
|---|---|---|
| **1 (now)** | MCP phase 2 (proposals approved in Hanger) · T20: the harness plan, written and gated · T19: engine status, re-planned against Global, then the CLIs built | Separate code. Phase 2 owns the write path, T20 is a document, and T19 reads CLI versions. |
| **2** | Whatever T20 keeps from slices 2–4, **one after another** · slice 5 (skills via `gh skill`, then Claude plugins) alongside | 2–4 share `mcp::switch`. Slice 5 is the skill switch's own code. |
| **3** | Slice 6 (the gateway, after its `list_changed` spike) · Phase B (the in-app agent, after T20 and the A2UI question, T23) | Both need wave 2's verbs to exist. |

:::question
How should the eight run?

- [ ] In waves — start wave 1 now: three tracks in their own worktrees, the way today's three ran
- [ ] All eight at once, as a multi-agent workflow — dozens of agents, a large token bill, and the overlapping tracks have to be merged by hand
- [ ] One at a time, MCP phase 2 first

Recommended: In waves — start wave 1 now
:::

:::question
Should slices 2 to 6 still wait for the T20 harness plan, as you ruled for T18?

- [ ] Yes — T20 decides which slices survive, and wave 2 waits for it
- [ ] No — build slices 2 to 4 in sequence anyway, and T20 plans around them

Recommended: Yes — T20 decides which slices survive
:::

## Answers (Karthik, 2026-11-27)

1. **All eight at once, as a multi-agent workflow.**
2. **Yes.** Slices 2 to 6 wait for the T20 harness plan.

Round 42 reconciles the two.
