# Naming brief: Hanger's own MCP server (Gate G1)

For [the MCP server plan](2026-11-27-hanger-mcp-server.md), Gate G1. Every
string an engine's model or its person sees from the server: the five tool
names, their titles and descriptions, the seven refusal texts, and the
server's `instructions`. None of these strings is in code yet. Tasks 3 and 4
return data and codes only; Task 5 is the first task that ships any of them,
and it waits for your sign-off here.

Every candidate below went through `/humanizer`. Copy is written to be true
at the commit that ships it, against this tree (`b96b221`). Your Question 9
ruling ("Antigravity is not read" until T22 lands) is carried as a line of
its own in the last block, because the literal claim needs one word more.

## What I read

All accessed 2026-11-27.

- **The MCP spec's naming rules** ([tools, 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)): names "SHOULD be between 1 and 128 characters", case-sensitive, letters, digits, `_`, `-` and `.` only, unique within a server. `title` is an "optional human-readable name of the tool for display purposes"; `description` is a "human-readable description of functionality". The spec's own examples are verb-first: `get_weather`, `get_current_time`, `calculate_sum`.
- **The reference filesystem server** ([README](https://github.com/modelcontextprotocol/servers/blob/main/src/filesystem/README.md)): fifteen tools, every one verb-first and unprefixed: `list_directory`, `search_files`, `get_file_info`, `list_allowed_directories`, `directory_tree` (the one noun). It sets no `title` on any tool. Its descriptions say what is left out in plain words: `search_files` "Recursively find files/directories by name … not by content: it never reads or searches inside files".
- **The reference git server** ([README](https://github.com/modelcontextprotocol/servers/blob/main/src/git/README.md)): fourteen tools, all prefixed `git_` (`git_status`, `git_log`, `git_show`), descriptions in the third person ("Shows the working tree status").
- **How an engine shows the name.** In Claude Code a tool arrives as `mcp__<server>__<tool>`, where `<server>` is the name the person gave when adding it (seen in this session: `mcp__claude_ai_Granola__get_meetings`). So with `docs/mcp-server.md`'s `claude mcp add … hanger`, a model sees `mcp__hanger__list_engines`, and a `hanger_` prefix would read `mcp__hanger__hanger_list_engines`. How Codex and other engines namespace tools was not checked.

What the tools return, from the code (plan Task 3): `list_engines` mixes live reads (engine folders, MCP config files) with the store (asset totals, probe cache). `engine_context` reads config files when called, with token figures from the probe cache. `find_assets`, `reach` and `findings` answer from the store, with `reach`'s links judged against the filesystem when called. So "answers reflect Hanger's last scan" is true of three tools and half-true of two, and the descriptions say which part is which.

---

:::question
What should the five tools be called?

Where: `tools/list` → `name`, and what a model types to call one. Claude Code shows them as `mcp__hanger__<name>`.
Before: (new) the plan's working names `list_engines`, `engine_context`, `find_assets`, `reach`, `findings`
After: `list_engines`, `get_engine_servers`, `find_assets`, `get_reach`, `list_findings`, in that order

Both reference servers name tools verb-first, and the spec's examples do too. Three of the plan's five are bare nouns, and `engine_context` uses Hanger's internal word for what a person calls "an engine's MCP servers" (`ui-copy.md`: use the app's nouns, "MCP servers").

- [ ] `list_engines`, `get_engine_servers`, `find_assets`, `get_reach`, `list_findings` — verb-first like the reference servers; "servers" is the app's noun
- [ ] `list_engines`, `engine_context`, `find_assets`, `reach`, `findings` — the plan's names, short, two of them read as nouns a model may not take for actions
- [ ] `hanger_list_engines` and so on — matches the git server's prefix, but doubles up in Claude Code (`mcp__hanger__hanger_…`)

Recommended: `list_engines`, `get_engine_servers`, `find_assets`, `get_reach`, `list_findings`
:::

:::question
What should the tools' display titles say?

Where: `tools/list` → `title`, shown by engines that display one (the spec makes it optional; the filesystem server sets none).
Before: (new, no title)
After: `list_engines` "Engines on this Mac" · `get_engine_servers` "An engine's MCP servers" · `find_assets` "Find skills, rules, subagents and servers" · `get_reach` "Which engines read an asset" · `list_findings` "Broken links and parse failures"

- [ ] Set these five titles — a person scanning an engine's tool list gets plain words, and the last one names what it holds instead of "findings"
- [ ] No titles, as the filesystem server does — less copy to keep true, engines fall back to the name

Recommended: Set these five titles
:::

:::question
`list_engines`: what does its description say?

Where: `tools/list` → `description` of `list_engines`. Models read it to decide when to call the tool.
Before: (new)
After: "Lists the engines Hanger finds on this Mac. For each engine that declares MCP servers, says how many are on and how many are off, and what the ones Hanger has measured cost in tokens. Engine folders and config files are read when you call this; the asset totals come from Hanger's last scan." *(amended 2026-11-27, round 39: the Antigravity sentence is deleted)*

- [ ] As written — says which half is live and which half is the last scan
- [ ] Shorter: "Lists the engines on this Mac, their MCP servers on and off, and Hanger's asset totals." — reads easier, hides that the totals can be older than the server counts

Recommended: As written
:::

:::question
`get_engine_servers`: what does its description say?

Where: `tools/list` → `description` of the tool the plan calls `engine_context`.
Before: (new)
After: "Lists one engine's MCP servers: each server's name, its config file, whether it is on, and its tool count and token cost if Hanger has measured it. Reads the engine's config files when you call this. Launch commands, arguments and environment values are left out. Takes an engine_id from list_engines."

- [ ] As written — names the fields that leave and the ones that never do
- [ ] Drop the "left out" sentence — shorter, but a model asked "what command does X run?" will keep trying

Recommended: As written
:::

:::question
`find_assets`: what does its description say?

Where: `tools/list` → `description` of `find_assets`.
Before: (new)
After: "Searches the names and text of the skills, rules, subagents and MCP servers in Hanger's last scan, and the tools of servers Hanger has measured. Returns up to 50 matches, each with its kind, name, path and where it lives. The matching text is not returned. Paths start with ~/."

The search does match on body text (the index holds name, description and body), so "names and text" is literal; the snippet the app shows is what is left out.

- [ ] As written — says the body is searched and not returned, so a model doesn't expect to read file contents
- [ ] "Finds assets by name." — simpler, and false: a body-text match would come back with no visible reason

Recommended: As written
:::

:::question
`get_reach`: what does its description say?

Where: `tools/list` → `description` of the tool the plan calls `reach`.
Before: (new)
After: "Says which engines read one asset in an engine's global folder, and through which folder link. Takes the asset's id as find_assets returns it. Assets in project folders aren't covered. Uses Hanger's last scan, and checks links on disk when you call it." *(amended 2026-11-27, round 39: "path" became "id", and the argument is `asset_id`)*

- [ ] As written — "global folder" is the limit the annotations have (`annotations.rs`: project assets are not annotated)
- [ ] Leave out the project-folder sentence — a project asset then answers "not found" with no reason given

Recommended: As written
:::

:::question
`list_findings`: what does its description say?

Where: `tools/list` → `description` of the tool the plan calls `findings`.
Before: (new)
After: "Lists broken and drifted links in engines' global folders, and files Hanger couldn't parse in any folder, from Hanger's last scan. Duplicates and drift in project folders are left out, so this is less than Hanger's Needs review list. Parser messages are not returned."

Decision 7 says tool copy must not call this list "Needs review"; it names Needs review only to say this is less than it.

- [ ] As written — each list's scope stated, and the gap to the app named
- [ ] Without the Needs review comparison — avoids the app's label entirely, but a person comparing the two will see different numbers and no reason

Recommended: As written
:::

:::question
What do the four store refusals say?

Where: the text block of a tool result with `isError: true`, one per `Refusal` code. The model reads it, and often relays it.
Before: (new)
After:
- `not_scanned_yet`: "Hanger hasn't finished a scan on this Mac yet. Open Hanger, let it scan, then ask again."
- `other_version`: "Hanger's store was written by a different version of Hanger. Open Hanger once, then ask again."
- `busy`: "Hanger's store is busy, probably mid-scan. Try again in a few seconds."
- `unreadable`: "Hanger couldn't read its store."

`other_version` is literal for the common case, a store older than the binary: opening the app runs its migrations. A store newer than the binary (two installs) is not fixed by opening this one, so the text promises nothing about what opening does. `busy` says "probably" because the same code covers a read cut off at its 1 s deadline.

- [ ] As written — each says what happened and what the person can do
- [ ] Codes only (`not_scanned_yet`) — exact, and a model will paraphrase them into guesses

Recommended: As written
:::

:::question
What do the three argument refusals say?

Where: as above, for `not_found`, `bad_argument` and `slow_down`.
Before: (new)
After:
- `not_found`: "Hanger has nothing under that engine id or path. list_engines and find_assets give ones it knows."
- `bad_argument`: "Those arguments don't fit find_assets. It takes query, the text to search for, and an optional limit from 1 to 50." *(amended 2026-11-27, round 34: only find_assets' limit can be out of range, and it is checked with the other arguments, so this reads as that check does)*
- `slow_down`: "More than 30 calls in 10 seconds. Wait a few seconds, then try again."

`bad_argument` names `limit` because it is the only bounded argument in phase 1; a phase 2 argument brings its own wording back here. `slow_down` states the limit Task 3 builds (`RateLimit` at 30 per 10 s).

- [ ] As written — a model can fix the call from the text alone
- [ ] One generic line for all three ("That request can't be answered.") — fewer strings, no self-correction

Recommended: As written
:::

:::question
What do the server's instructions say, and how is the Antigravity gap worded?

Where: the `instructions` field of the server's `initialize` / `server/discover` result. Engines that use it put it in the model's context once per session.
Before: (new)
After: "Read-only answers about the AI engines on this Mac and their skills, rules, subagents and MCP servers, from Hanger's store and the engines' config files. Most answers come from Hanger's last scan, and every reply carries as_of_ms, the time that scan finished. Paths start with ~/. Nothing here changes a file." *(amended 2026-11-27, round 39: the Antigravity sentence is deleted)*

Your Question 9 ruling was "Antigravity is not read" until T22 lands. Literally, Hanger does read part of Antigravity today: the engine in this tree is "Gemini / Antigravity" (`registry.rs` `HOSTS`, `agents.rs`), and its skills under `~/.gemini/skills` are scanned (`agents.rs` → `AGENT_CONFIGS`, `skills: Some("skills")`). What is unread is `~/.gemini/antigravity/mcp_config.json`, the Antigravity CLI's MCP servers (`docs/TODO.md` T22). "Antigravity is not read" would be false of those skills. The line appears in the instructions and in `list_engines`, the two places a model forms its picture of the machine, and T22's author removes both in T22's commit.

- [ ] "Antigravity's MCP servers are not read." in the instructions and `list_engines` — true at every commit, names exactly what is missing
- [ ] "Antigravity is not read." as ruled — shorter, and false of the skills under `~/.gemini/skills`, which Hanger does scan
- [ ] The line in the instructions only — one place to keep true, but `list_engines` is where a model counts servers and would miss it

Recommended: "Antigravity's MCP servers are not read." in the instructions and `list_engines`
:::

## Answers (Karthik, 2026-11-27, in Plannotator)

1. Tool names: **`list_engines`, `engine_context`, `find_assets`, `reach`, `findings`** (the plan's names, not the brief's `get_`/`list_` renames). The descriptions in Q4, Q6 and Q7 apply to `engine_context`, `reach` and `findings` respectively.
2. to 9. **As written** (the recommendations): the five titles, the five descriptions, the four store refusals and the three argument refusals.
10. **"Antigravity's MCP servers are not read."** in the instructions and `list_engines`. When T22 (`fix/antigravity-source`) merges, whichever branch merges second removes it (Karthik's MCP plan ruling Q9).

## Amendments after sign-off

`src-tauri/src/mcp_server/strings.rs` matches this brief word for word,
including these lines, which no question above carried.

**Round 34** (`docs/plans/2026-11-27-decisions-round-34.md`, amended 2026-11-27, round 39 for `reach`). What a call whose arguments don't fit its tool reads, as a tool error:

- `list_engines`: "Those arguments don't fit list_engines. It takes none."
- `engine_context`: "Those arguments don't fit engine_context. It takes engine_id, an id from list_engines."
- `find_assets`: "Those arguments don't fit find_assets. It takes query, the text to search for, and an optional limit from 1 to 50."
- `reach`: "Those arguments don't fit reach. It takes asset_id, an id as find_assets returns it." *(amended 2026-11-27, round 39)*
- `findings`: "Those arguments don't fit findings. It takes none."

A call to a tool that doesn't exist stays a protocol error: "Unknown tool: <name>" (round 34).

**Round 39** (`docs/plans/2026-11-27-decisions-round-39.md`). `reach`'s argument is `asset_id`, and its description says "id". The Antigravity sentence is deleted from `list_engines` and the instructions, with nothing in its place.
