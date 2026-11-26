# Round 18: the plan for H with two-line rows

The plan is `docs/plans/2026-11-26-global-list.md`. It names your marked-up T3 screenshot as the reference and has a checklist of your marks that every task is checked against. Task 1 is a visual slice: I'll send you dev-app screenshots and wait for your approval before Task 2 starts.

What you approved:

![H with two-line rows](/Users/karthik/Work/Labs/hanger-ai/docs/evidence/2026-11-26-global-list/approved-HI.png)

Reading the code turned up four gaps between that picture and the data.

:::question
With All engines picked, what should an MCP server's second line show on the right?

A server's token cost is only known for one engine at a time. With All engines there's no single figure, so the picture's "≈ 7,294 tokens" can only appear once an engine is picked.

- [ ] Its tool count ("12 tools") with All engines, and its tokens once an engine is picked — both figures exist today, no backend change
- [ ] Its heaviest engine's tokens ("up to ≈ 7,294 tokens") — needs a new backend figure
- [ ] Nothing with All engines; tokens once an engine is picked

Recommended: Its tool count ("12 tools") with All engines, and its tokens once an engine is picked
:::

:::question
Approve the new row wording?

Most row text reuses words you've already approved. A skill's line 2 is its own description from its file. A server's line 2 is its existing status sentence. Rows with nothing to say show nothing, not "—". One string is new.

Where: line 2, right side, of a skill, rule or subagent that isn't used in any project.

Before: workflow-threads-manager · · · —

After: workflow-threads-manager / Oversee other Claude threads · · · Global only

- [ ] Approve "Global only"
- [ ] Use other words (add a note)

Recommended: Approve "Global only"
:::

:::question
How big should the row names be?

T3 uses 14 px names. Hanger's type scale has 11, 12, 13 and 16 px, and a test blocks other sizes.

- [ ] 13 px medium, from the existing scale — the picture drew 14, the difference is slight
- [ ] Add a 14 px size to the scale, for list names only

Recommended: 13 px medium, from the existing scale
:::

:::question
Repositories uses the same rows and table as Global. Should it change too?

- [ ] Not now: Global first, then Repositories as its own piece once you've seen Global — keeps this change smaller
- [ ] Yes, both in this plan

Recommended: Not now: Global first, then Repositories as its own piece once you've seen Global
:::

:::question
Approve the plan and build it?

It runs one subagent per task in a worktree, with red-first tests and the four gates. Task 1's screenshots come to you before Task 2 starts, and nothing is pushed without your word.

- [ ] Yes, build it
- [ ] Let me read the plan first (add notes)

Recommended: Yes, build it
:::

## Answers (Karthik, 2026-11-26, Plannotator)

- q1: Its tool count ("12 tools") with All engines, and its tokens once an engine is picked. (recommended)
- q2: "Global only" approved. (recommended)
- q3: 13 px medium, from the existing scale. (recommended)
- q4: **Yes, Repositories changes in this plan too.** The plan gains Task 4, and the row is renamed `ListRow`.
- q5: The plan is approved; build it. (recommended)
