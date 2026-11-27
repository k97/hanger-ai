# Round 34: two replies the MCP server sends the model

Tasks 5 and 6 of [the MCP server plan](2026-11-27-hanger-mcp-server.md) are
built (`717a61e`, `ecb98d9`). A fresh review passed the spec but asked for
changes: 0 Critical, 2 Important, 6 Minor
(`.superpowers/mcp-review-t5-t6.md`). Two of the fixes need strings the model
reads, and nothing in the signed-off brief covers them.

**What happens now.** When a call has arguments that don't fit the tool (an
unknown key, a missing `engine_id`, a number where text should be), the
server answers with a protocol error reading "Invalid params". The model
can't see that the way it sees a tool's reply, so it can't fix its call. The
MCP spec's 2025-11-25 revision says input errors should come back as a tool
result marked as an error, for exactly this reason. A call to a tool that
doesn't exist stays a protocol error: the spec keeps it as one.

:::question
What should the model read when its arguments don't fit a tool?

- [ ] Name what the tool takes — "Those arguments don't fit engine_context. It takes engine_id, an id from list_engines." One line per tool, built from the same table that checks the arguments.
- [ ] One line for every tool — "Those arguments don't fit this tool. Its input schema lists what it takes."

Recommended: Name what the tool takes
:::

The five lines the first option would send:

| Tool | Reply |
|---|---|
| `list_engines` | Those arguments don't fit list_engines. It takes none. |
| `findings` | Those arguments don't fit findings. It takes none. |
| `engine_context` | Those arguments don't fit engine_context. It takes engine_id, an id from list_engines. |
| `find_assets` | Those arguments don't fit find_assets. It takes query, the text to search for, and an optional limit from 1 to 50. |
| `reach` | Those arguments don't fit reach. It takes asset_path, a path as find_assets returns it. |

:::question
What should a call to a tool that doesn't exist get back?

It stays a protocol error either way. Only the message changes.

- [ ] "Unknown tool: <name>", the form the MCP spec's own example uses
- [ ] "Hanger has no tool called <name>. tools/list gives the five it has."

Recommended: "Unknown tool: <name>"
:::

:::question
What should happen to the six Minor findings?

- In the same fix round: tool names kept in one table instead of three (M1); a `limit` schema bounded to 1–50 (M6); the docs page stops claiming the boundary test checks things it doesn't (M4); the repeated Antigravity sentence gets its T22 removal note (M5).
- Parked: the no-print guard is a text search (M2). The two probe tests run with your real environment, which is harmless today (M3).
- The server calls itself `hanger` in its handshake (M6). Engines show the name you give it in your config, not this one.

- [ ] Accept — fix four, park two, keep `hanger`
- [ ] Fix all six
- [ ] Something else — say in a note

Recommended: Accept
:::

## Answers (Karthik, 2026-11-27)

1. **Name what the tool takes.** The five lines in the table above, word for word.
2. **"Unknown tool: <name>"**, kept as a protocol error.
3. **Accept.** Fix M1, M4, M5 and M6's `limit` bounds; park M2 and M3; keep `hanger` as the handshake name.
