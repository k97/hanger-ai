# Antigravity engine: naming brief

Task 0 of [the Antigravity engine plan](2026-11-27-antigravity-engine.md). `ui-copy.md` asks for a researched brief and Karthik's sign-off before a first-time label lands. The sign-off is the plan's "Answers (Karthik, 2026-11-27, in Plannotator)" section, Q1: **Gemini CLI** and **Antigravity CLI**.

## What each product calls itself

From the plan's evidence, gathered 2026-11-27; the Hanger rows were re-read for this brief.

| Source | Its words |
|---|---|
| `agy --help` (1.5.18) | "agy" |
| Antigravity docs (antigravity.google/docs), as cited in the plan | "Antigravity CLI", "Antigravity IDE", "Antigravity App" |
| Gemini CLI docs, as cited in the plan | "Gemini CLI" |
| Hanger today, `src/utils/assetProvenance.ts` `NAMES.gemini` and `mcp/observe.rs` | "Gemini CLI" |
| Hanger today, `agents.rs` and `registry.rs` | "Gemini / Antigravity", one engine for both |

## What each row covers

- **Gemini CLI** (`gemini`, unchanged id): `~/.gemini` and a repo's `.gemini/`, MCP servers in `~/.gemini/settings.json`, switched through `~/.gemini/mcp-server-enablement.json`.
- **Antigravity CLI** (`antigravity`, new id): `~/.gemini/config`, MCP servers in `~/.gemini/config/mcp_config.json`. The vendor's MCP page says the IDE reads the same file, but the IDE was not measured and may still read `~/.gemini/antigravity/mcp_config.json`, which this row does not read. That is why the label names the CLI and not the whole family.

## Where the labels render

Engine tiles on Global, MCP host rows in the server inspector, the inspector's "Engine" field, the README coverage region, and the deploy refusal "Antigravity CLI declares no project directory to deploy into" (`lib.rs`, an existing format string).

## `/humanizer` pass

Run 2026-11-27 over "Gemini CLI", "Antigravity CLI" and the refusal above. Both labels are product names with nothing to change; the refusal is an existing string filled with the new name and reads plainly. No change.
