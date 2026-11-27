# Round 37: your turn in Claude Code (Gate G2, Steps 3 and 4)

The release binary is built inside the worktree (`82aaf26`, 21:23). A smoke
test sent only the handshake and the tool list: it answered as `hanger 0.7.1`
with the five tools, exited cleanly, wrote nothing to stderr, and opened no
window. The per-kind baseline was taken at 21:22. Claude Code has no
user-scope server named `hanger` yet.

## Step 3: add the server (you run this)

This is the setup page's Claude Code line, with the worktree binary in place
of `/Applications`:

```bash
claude mcp add --scope user --transport stdio hanger -- /Users/karthik/.config/superpowers/worktrees/hanger-ai/hanger-mcp-server/src-tauri/target/release/tauri-app mcp
```

Then `claude mcp list` should show `hanger` connected. This is also the first
time anyone has run the page's line.

## Step 4: ask it five things (you run this)

Start a fresh Claude Code session and ask, one at a time:

1. Using the hanger MCP server, which engines are on this Mac?
2. What MCP servers does Claude Code have, and what does each cost?
3. Find the skill called zoom-out.
4. Which engines read that skill?
5. What findings does Hanger have?

Then `/export` the session to
`/Users/karthik/.config/superpowers/worktrees/hanger-ai/hanger-mcp-server/docs/evidence/2026-11-27-hanger-mcp-server/g2-transcript.txt`.

When the proof is over, `claude mcp remove --scope user hanger` takes it out
again. The binary lives in a worktree that goes away after the merge.

:::question
How did Steps 3 and 4 go?

- [ ] Done, transcript exported — the add worked and all five got answers
- [ ] Something went wrong — say which step in a note

Recommended: Done, transcript exported
:::

:::question
For each reply, the plan wants a screenshot of Hanger showing the same fact: Claude Code's servers and cost, zoom-out's row and reach, and the Needs review list. Getting to those screens takes clicks. How should I get them?

- [ ] Let me drive `Hanger AI (dev)` for about five minutes once you answer — keyboard focus and the pointer move to it, so stay out of it meanwhile
- [ ] You open each screen and tell me in a note when it's up — I capture without touching anything
- [ ] Skip the screenshots — compare the replies against the store instead, and say so in the report

Recommended: Let me drive `Hanger AI (dev)` for about five minutes
:::
