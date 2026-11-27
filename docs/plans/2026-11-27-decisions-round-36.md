# Round 36: the MCP server's live proof

Phase 1 of [the MCP server plan](2026-11-27-hanger-mcp-server.md) is built.
Tasks 1 to 6 are done, and so are two fix rounds after a fresh review. The
re-review approved them. The four gates pass at `f3917b6`: vitest 1751/1751,
cargo test 993 passed and 0 failed, tsc 0, and gitleaks clean twice. Nothing
is pushed.

What's left is Gate G2 (Task 7): one real engine talks to Hanger's server,
and each answer is checked against Hanger's own window. Three things are
yours: the setup page, how the server gets built, and which engine.

:::question
Is the setup page, `docs/mcp-server.md` (open beside this one), right to ship?

The plan needs your sign-off on it (Task 6 Step 2). Nobody has run its install
lines yet. They get run for the first time in this proof.

- [ ] Sign off
- [ ] Needs changes — say what in a note on the page

Recommended: Sign off
:::

:::question
How should the server be built for the proof?

The installed Hanger AI in `/Applications` is older than the `mcp` subcommand.
Started with `mcp`, it opens its window instead.

- [ ] A release build left inside the worktree — `cargo build --release`, and the engine runs `…/hanger-mcp-server/src-tauri/target/release/tauri-app mcp`. Nothing is installed and `/Applications` isn't touched.
- [ ] A full `tauri build` of the app, installed over `/Applications/Hanger AI.app`. Closest to what users get, but it replaces your installed app with an unsigned branch build.
- [ ] Wait for the next signed release

Recommended: A release build left inside the worktree
:::

:::question
Which engine should talk to it?

You add the server yourself, from the setup page. That's a write to your engine
config, so I don't make it. Then you ask the engine five things: the engines,
one engine's servers and their cost, a skill by name, that skill's reach, and
the findings. I compare each reply with Hanger's window.

- [ ] Claude Code
- [ ] Codex
- [ ] Gemini CLI

Recommended: Claude Code
:::

## Answers (Karthik, 2026-11-27)

1. **Sign off.** `docs/mcp-server.md` is signed off (Task 6 Step 2).
2. **A release build left inside the worktree.**
3. **Claude Code.**
