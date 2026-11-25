# Context control: naming brief

Gate G1 of [the context-control plan](2026-11-24-context-control.md). Nothing here is in the app yet. `ui-copy.md` asks for a researched brief and Karthik's sign-off before a first-time label lands, and a `/humanizer` pass on every string. Every string below has had that pass: plain verbs, no dashes, sentence case, and nothing the code doesn't do.

Three choices are real decisions and are asked as questions. The rest are tables: annotate any string you'd change.

## What the engines and their neighbours call this

Read on 2026-11-24, from each tool's own output or documentation.

| Source | Its words |
|---|---|
| `codex mcp list` (0.171.0) | A `Status` column reading `enabled` or `disabled` |
| `gemini mcp list` (0.56.0) | `Disabled`; the commands are `gemini mcp enable` and `gemini mcp disable` |
| `claude mcp --help` (2.1.331) | "disabled for this project", "Pending approval" |
| Cursor docs (cursor.com/docs/context/mcp) | "Toggle servers on/off without removing them… Use the toggle to enable or disable it. Disabled servers won't load or appear in chat." |
| VS Code docs (manage-mcp-servers) | "**Enable** or **Disable**: Control availability without deleting the configuration." "Disabling is different from stopping." |
| Zed docs (agent-settings) | "a toggle to enable or disable it" |
| mcpick | `mcpick enable`, `mcpick disable` |

Everyone's verb is enable/disable. Cursor is the only one that also says on/off.

Hanger's own words, already on screen: "engine" for Claude Code and the rest, "MCP servers" (never "tools"), "≈ N tokens", and "Not measured", which today labels input schemas in the server inspector ("Input schemas · Usually the larger part of a definition · Not measured").

## The three decisions

Answered by Karthik in Plannotator on 2026-11-25, each with the recommendation: the section is **Engines**, the states are **On** and **Off**, and the budget reads **"≈ 12,400 tokens of tool descriptions"** with **"12 of 15 servers measured"** under it. He made no change to the tables below. The brief is signed off as a whole when he approves it with the layout options (gate G2), since the strings are only seen in a layout.

:::question
What is the new rail section called?

It lists each engine and, for the one you pick, what it loads and what that costs. The rail's other entries are "Search", "My machine", "Link map", "Discovery", "Needs review" and "Settings". "Engine" is already the app's word everywhere else: the Reach column, the engine tiles, every sentence that names Claude Code or Codex.

- [x] Engines — the app's own noun; matches every other screen
- [ ] Coding tools — your phrase for what Hanger manages; collides with "tools", which the app avoids because it also means MCP tools
- [ ] Agents — what the vendors say; `ui-copy.md` rules it out for Claude Code and the rest

Recommended: Engines
:::

:::question
What are the two states of a server called?

Every vendor says enabled and disabled. But for Claude Code, Hanger's "off" removes the server from Claude Code's config and keeps a copy, so no file says "disabled" anywhere. For Gemini the flag lives in a separate state file. "Off" is true of all three; "disabled" is the word you'd see if you checked `codex mcp list`.

- [x] On and Off — short, true of every mechanism, reads naturally on a switch
- [ ] Enabled and Disabled — the vendors' word; matches what the engines' own lists print

Recommended: On and Off
:::

:::question
How should the budget line read?

The figure is an estimate from the tool descriptions each switched-on server sends: bytes divided by four. Input schemas aren't counted, and the inspector already says so. The line also has to say how much of the total is measured, because unmeasured servers add nothing to it.

- [x] "≈ 12,400 tokens of tool descriptions" with "12 of 15 servers measured" under it — says exactly what was counted
- [ ] "≈ 12,400 tokens" with "12 of 15 servers measured · schemas not counted" under it — shorter headline, the caveat moves to the caption
- [ ] "At least 12,400 tokens" with "12 of 15 servers measured" under it — leads with the fact that the real cost is higher

Recommended: "≈ 12,400 tokens of tool descriptions" with "12 of 15 servers measured" under it
:::

## Labels and lines

`{engine}`, `{server}` and `{file}` come from the backend. `{file}` is the sanitised path Hanger already shows (`~/.codex/config.toml`).

| Where | String | True because |
|---|---|---|
| Rail entry, tooltip and screen title | Engines | Question 1 |
| Heading in an engine's detail | Context | Ruled 2026-11-24: an engine's detail shows Context first |
| A server that is on | On | Question 2 |
| A server that is off | Off | Question 2 |
| A switch's accessible name | {server} | The switch's own on/off state is announced by its role |
| Budget headline | ≈ {n} tokens of tool descriptions | `on_tokens_measured`: description bytes ÷ 4, over measured, switched-on servers |
| Budget caption | {measured} of {on} servers measured | `measured_on_count` and `on_count`, both computed in Rust |
| Budget caption, when some are off | {off} off | `off_count` |
| A server's cost | ≈ {n} tokens | `estimated_tokens` |
| A server nobody has measured | Not measured | `estimated_tokens` is null. Already your wording (decision 7). It also labels input schemas in the inspector; both uses mean "Hanger hasn't got a figure". |
| The button | Measure all | Decision 7 |
| The button while it runs | Measuring… | The command returns when every probe has answered |
| Under the button | Starts each server that's on and has no recent answer, and reads its tool list. | What `cached_probe` does: a fresh cached answer is reused; a switched-off server is never started |
| After switching off | {server} is off for {engine}. | The reply's context shows it Off |
| After switching on | {server} is on for {engine}. | The reply's context shows it On |
| The way back | Undo | `undo_mcp_switch` |
| After Undo | {server} is back on for {engine}. / {server} is off for {engine} again. | The reply's context |
| An engine with no servers | {engine} declares no MCP servers. | Shown only after the first reply lands; nothing is claimed while it is pending |
| When a switch takes effect | (no line yet) | Ruling 19: nothing is said until Task 13 has watched a real session |
| ⌘K action | Switch {server} off for {engine} / Switch {server} on for {engine} | Calls the same command as the switch |
| MCP servers list, a kept server | Off for {engine} | Task 8A |

## Lines that explain a mechanism

Shown once, beside the server they describe.

| When | String |
|---|---|
| A Claude Code server that is off | Removed from {engine}. Hanger keeps its configuration and puts it back when you switch it on. |
| A Gemini server, on or off | {engine} switches by name, so this covers every server named {server}. |

## Why a server has no switch

One line per reason, shown in place of the switch.

| Reason code | String |
|---|---|
| `engine_not_confirmed` | Hanger can't switch {engine} servers yet. Nothing has confirmed how {engine} turns one off. |
| `per_project_comes_next` | Hanger can't switch servers declared in {file} yet. |
| `switches_by_name_everywhere` | Declared in a project. {engine}'s switch covers every project, so Hanger leaves this one alone. |
| `managed_by_plugin` | Declared by a plugin. A change here would be undone when the plugin updates. |
| `managed_by_policy` | Set by a managed configuration. Hanger doesn't change managed files. |
| `runs_on_vendor_servers` | Runs on the vendor's servers. There's nothing on this machine to switch. |
| `file_unparseable` | Hanger can't read {file}, so it can't switch this server. |

## When a switch doesn't happen

The backend returns a code; the webview shows the line. No line quotes a file or a command's output.

| Failure code | String |
|---|---|
| `changed_since_read` | {file} changed while Hanger was working. Nothing was written. Try again. |
| `would_not_come_back` | {engine} wouldn't give this server back unchanged, so Hanger left it on. Its own command drops settings it doesn't recognise. |
| `cli_not_found` | Hanger couldn't find the {engine} command on this machine. |
| `cli_failed` | {engine}'s command didn't make the change. Nothing was lost. |
| `not_verified` | Hanger couldn't confirm the change, so it kept its copy. Check {engine}'s own list. |
| `already_there` | {server} is already declared for {engine}. Hanger changed nothing and kept its copy. |
| `not_undoable` | This can't be undone now. The file has changed since. |
| `unparseable` | Hanger can't read {file}. Fix it in an editor and try again. |
| `write_failed` | Hanger couldn't write the change. The list shows where things stand now. |
| `read_only` | Hanger can't switch this server. |
| `not_found` | Hanger can't find that server any more. |
| `wrong_engine` | Hanger can't find that server for {engine}. |
| `name_refused` | Hanger won't pass this server's name to {engine}'s command. |

The thirteen codes are `mcp::switch::ops::SwitchFailure` as built in `2b674b4`. Three cover more than one cause, and their lines are written to be true of each:

- `write_failed` is a failed file write, a failed write of Hanger's kept copy, and the editor's own safety check refusing a rewrite. In one of those (the kept copy could not be removed after a successful switch-on) the change did happen, so the line makes no claim either way and points at the list, which is re-read after every failure.
- `not_verified` is a file that did not read back as written (Hanger puts the original back) and a Claude Code entry that came back different (Hanger keeps its copy).
- `read_only` is a server with a stated reason, and a server in a form Hanger does not switch.

## Renames, 2026-11-25

Karthik approved these as his answer to Q1 of [the IA plan](2026-11-25-ia-engines-into-global.md) on 2026-11-25: one word for one idea, and one verb for one action. They land with T3 of that plan.

| Where | Was | Now |
|---|---|---|
| The band on Global › MCP servers | By host | By engine |
| The strip on Global › MCP servers | MCP servers · {n} tool descriptions across {m} hosts | MCP servers · {n} tool descriptions across {m} engines |
| The same, before anything is measured | MCP servers across {m} hosts | MCP servers across {m} engines |
| The inspector's Tools section, before an answer | Verify | Measure |
| The inspector's re-check (tooltip and accessible name) | Check again | Measure again |

The ⌘K placeholder gains the tail the approved plan's D7 names. "Search skills, rules, subagents and MCP servers" becomes "Search skills, rules, subagents and MCP servers, or switch a server". This lands with T5.

The singular forms follow: "1 host" is now "1 engine". The inspector has no in-flight label to rename: it asks on open and shows no "Verifying…" (the control is withheld while the probe runs). The band's Measure all reads "Measuring…" while it runs, as the Engines tab's does.

The band reuses this brief's strings and adds none. Each engine's row shows the budget's token figure without its tail ("≈ {n} tokens"), the budget caption ("{measured} of {on} servers measured", with "· {off} off" when some are off), or "Not measured" when the engine's context has not arrived. Its Measure all carries the caption under the Engines tab's button, as the band's note and as the button's tooltip. Its active filter is a chip with the engine's name. "A tool counts once per host that carries it." is gone with the tool figures (D4).

## Global seen by engine, 2026-11-25

Karthik approved these with [the engine-lens plan](2026-11-25-ia-global-by-engine.md) on 2026-11-25, taking each of its three new labels as proposed. They land with its Phase 1.

| Where | String | True because |
|---|---|---|
| The engine chip row's first chip, the unfiltered choice | All engines | `selected_engine` is empty: no engine narrows the list |
| The strip's headline with an engine picked | ≈ {n} tokens every session | Phase 1: `on_tokens_measured` of the picked engine's MCP servers, the only kind measured. It reads "Not measured" when servers are on and none is measured, by the band's rule (`measuredBudget`) |
| The folded group at the end of Global's list | Not loaded by {engine} | Assets whose `get_asset_annotations` reach for the engine is `reached: false`. No figure: no backend command counts them |

The group's rows reuse the inspector Reach card's titles for a miss, "Not linked" and "Another engine's format" (ruled 2026-08-28). The strip's segments reuse the kind tabs' own labels ("MCP servers", "Skills", "Rules", "Subagents"), the brief's "Not measured", the budget caption, "Measure all" and its caption. Today's "≈ {n} tokens of tool descriptions" has no caller once the Engines tab's budget card is gone.

### Approved in decisions round 2, 2026-11-25

Karthik approved these as his answers to `docs/plans/2026-11-25-decisions-round-2.md`, Wording, on 2026-11-25. Each was built from labels already approved; none had been approved as written.

| Where | String | True because |
|---|---|---|
| The strip's headline when nothing for the picked engine is measured | Not measured · {engine} | `measuredBudget` is null: servers are on and none is measured. Already on screen since Phase 1 (`engineStripHeadline`) |
| The strip's headline with a figure | ≈ {n} tokens every session · {engine} | The approved headline above, with the engine's name after it. Already on screen since Phase 1 (`engineStripHeadline`) |

The strip's quiet line, "Skills · Rules · Subagents: Not measured" (Q1 of the same file), needs no ruling of its own: it is the kind tabs' labels joined by " · ", then the brief's "Not measured". Karthik confirmed that on 2026-11-25. A kind that gains a figure leaves the line for a segment of its own.
