# Round 39: two signed-off strings that the --dev review found false

The `stage-gate --dev` review of the MCP server's phase 1
(`docs/reviews/2026-11-27-dev-feat-hanger-mcp-server.md`) says **Trim first**,
with three blocking findings. The builder is fixing the first now, with no
new string: server names inside keys and ids now go through the same
flattening and 128-character cap as every other name. It's also merging
`main`, so the branch has Antigravity CLI. The other two change wording you
signed off.

The [Gate G2 record](2026-11-27-hanger-mcp-server-g2.md) is also here for you
to accept. All five replies agreed with Hanger's window. Steps 4 to 6 ran on
your word in round 38.

:::question
`reach` tells the model to pass "the asset's path as find_assets returns it". For an MCP server, that path is the config file, and `reach` refuses it. It only answers when given the `id`, for example `~/.claude.json:chrome-devtools`. For skills, rules and subagents, the id and the path are the same. What should change?

- [ ] Rename the argument to `asset_id` and say "id" — reach: "…Takes the asset's id as find_assets returns it. …"; the bad-arguments line: "Those arguments don't fit reach. It takes asset_id, an id as find_assets returns it."
- [ ] Keep `asset_path`, change only the words — "…Takes the id find_assets returns for the asset. …" — so the name and the words disagree
- [ ] Something else — say in a note

Recommended: Rename the argument to `asset_id` and say "id"
:::

:::question
Now that `main` reads Antigravity CLI's config, "Antigravity's MCP servers are not read." is false in `list_engines`' description, the server's instructions and `docs/mcp-server.md`. What should replace it?

Once merged, the engine list also shows Gemini CLI and Antigravity CLI as two engines, where it used to show "Gemini / Antigravity".

- [ ] Delete the sentence in all three places, and add nothing
- [ ] Replace it with "Antigravity CLI's servers are read from ~/.gemini/config/mcp_config.json."

Recommended: Delete the sentence in all three places
:::

:::question
Do you accept the Gate G2 record as the live proof of phase 1?

It covers: the setup page's Claude Code line, run for the first time and connected; five asks answered and matching the window; the `hanger` row measured at 5 tools; and counts that moved only by that row. One finding: after an update, the server refuses until the new app has finished one scan. The refusal text tells the user what to do.

- [ ] Accept — after the three fixes and a scoped re-review, merge phase 1 into local `main`
- [ ] Accept, but don't merge yet
- [ ] Not accepted — say what's missing in a note

Recommended: Accept — after the three fixes and a scoped re-review, merge phase 1 into local `main`
:::

## Answers (Karthik, 2026-11-27)

1. **Rename the argument to `asset_id` and say "id".** The reach description reads "…Takes the asset's id as find_assets returns it. …", and its bad-arguments line reads "Those arguments don't fit reach. It takes asset_id, an id as find_assets returns it."
2. **Delete the sentence in all three places**, and add nothing.
3. **Accept.** After the three fixes and a scoped re-review, phase 1 merges into local `main`.
