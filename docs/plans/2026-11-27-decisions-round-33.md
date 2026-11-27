# Round 33: Antigravity CLI, Task 5

The repository view is merged into local `main` (`c5a1baf`). All four gates
passed on the merged tree, and its worktree and branch are gone. This dev app
(`Hanger AI (dev)`) is now running from the Antigravity branch. You check ⌘E
and dark for the repository view once this branch merges, in `main`'s dev app.

## The mark

The overview card's engine list, from this branch's dev app, with the
inspector closed. Light theme first, then dark, read from the store.

![Engine list, light](../evidence/2026-11-27-antigravity-engine/05-mark-light-crop.png)
![Engine list, dark](../evidence/2026-11-27-antigravity-engine/04-mark-dark-crop.png)

Full window: ![Global, light](../evidence/2026-11-27-antigravity-engine/02-global-card-light.png)

:::question
Does the Antigravity CLI mark look right at this size, in both themes?

- [ ] Accept
- [ ] Needs changes — say what in a note

Recommended: Accept
:::

## Your check

This is the part `mcp list` can't prove. I've already made a private copy of
`~/.gemini/config/mcp_config.json` (taken at 20:34, never read), so I can diff
it afterwards and print only key names.

1. In the dev app, open the `cua` MCP server and switch it **off for
   Antigravity CLI only**.
2. In a terminal: `agy mcp list` shows `cua … disabled`. Start `agy`, run
   `/mcp`: `cua` is not connected. `gemini mcp list` still shows `cua`
   enabled.
3. Switch `cua` back **on** for Antigravity CLI in Hanger. `agy mcp list`
   shows it enabled again.

After step 3 I'll check that the file differs from the copy by exactly one
line, `"disabled": false` in `cua`'s entry.

:::question
How did the check go?

- [ ] All as described
- [ ] Something differed — say which step in a note

Recommended: All as described
:::

:::question
The plan also wants a screenshot of `cua`'s detail, showing its Gemini CLI row and its Antigravity CLI row, each with a switch. Opening it needs a click, so how should I get it?

- [ ] Leave `cua`'s detail open when you finish — I capture it without touching anything
- [ ] Let me drive the dev app for about a minute (⌘K, type `cua`, Enter) — your mouse and keyboard focus move to it
- [ ] Skip that screenshot

Recommended: Leave `cua`'s detail open when you finish
:::

## Answers (Karthik, 2026-11-27)

1. **Accept.** The mark stands, light and dark.
2. **All as described.** The files disagree: see round 35. Task 5 Step 2 stays open until they agree.
3. **Leave `cua`'s detail open.** At 20:41 the dev window showed Global with nothing selected.
