# Round 30: when to start building Hanger's MCP server

The plan is approved with your nine answers
([the MCP server plan](2026-11-27-hanger-mcp-server.md)). Two other code tracks
are building right now, each in its own worktree: the repository-view parity
(Task 6 of 9) and T22, the Antigravity engine split (Tasks 0 to 4).

:::question
Should the MCP server's read-only phase start building now, as a third track?

Its first tasks change the store's read path, the scan's finish and the app's
data folders (`preferences.rs`, `scanner.rs`, `lib.rs`). T22 also edits
`scanner.rs`, so whichever merges second resolves a conflict there. Parity
touches only the frontend, so it doesn't overlap.

- [ ] Start now, in its own worktree — all three tracks run at once; one merge conflict in `scanner.rs` to resolve
- [ ] Start after T22 merges — no conflict, but the server waits a few hours
- [ ] Start after parity and T22 both merge — the calmest, and the slowest

Recommended: Start now, in its own worktree
:::

## Answer (Karthik, 2026-11-27)

**Start now, in its own worktree.**
