# Hanger's MCP server

Hanger ships an MCP server inside the app: `Hanger AI mcp`. Add it to an
engine and that engine's model can ask about the engines on your Mac and
their skills, rules, subagents and MCP servers. Answers come from Hanger's
store and the engines' config files. The server only reads, and it never
changes a file.

It runs without the app open. The engine starts it in the background, it
reads what Hanger's last scan stored, and it exits when the engine closes
it. Until Hanger has finished one scan on your Mac, every tool answers that
it hasn't, rather than reporting an empty machine.

## What it answers

Five tools. These are the descriptions the engine's model reads:

- **`list_engines`**: Lists the engines Hanger finds on this Mac. For each engine that declares MCP servers, says how many are on and how many are off, and what the ones Hanger has measured cost in tokens. Engine folders and config files are read when you call this; the asset totals come from Hanger's last scan. Antigravity's MCP servers are not read.
- **`engine_context`**: Lists one engine's MCP servers: each server's name, its config file, whether it is on, and its tool count and token cost if Hanger has measured it. Reads the engine's config files when you call this. Launch commands, arguments and environment values are left out. Takes an engine_id from list_engines.
- **`find_assets`**: Searches the names and text of the skills, rules, subagents and MCP servers in Hanger's last scan, and the tools of servers Hanger has measured. Returns up to 50 matches, each with its kind, name, path and where it lives. The matching text is not returned. Paths start with ~/.
- **`reach`**: Says which engines read one asset in an engine's global folder, and through which folder link. Takes the asset's path as find_assets returns it. Assets in project folders aren't covered. Uses Hanger's last scan, and checks links on disk when you call it.
- **`findings`**: Lists broken and drifted links in engines' global folders, and files Hanger couldn't parse in any folder, from Hanger's last scan. Duplicates and drift in project folders are left out, so this is less than Hanger's Needs review list. Parser messages are not returned.

## What never leaves it

No launch command, argument, environment name or value, header, file body,
skill description or parser message. Paths are written from `~/`, never with
your home folder spelled out. Names are cut at 128 characters, with line
breaks and other control characters turned into spaces, because a skill's
name is whatever its file says. `src-tauri/tests/mcp_server_boundary_tests.rs`
checks all of this.

## Adding it

Each engine launches the app's own binary with the argument `mcp`. The path
has a space in it, so keep it quoted. Use a Hanger build that includes the
server: an older build ignores `mcp` and opens the app window instead.

**Claude Code**, for every project (`--scope user`):

```bash
claude mcp add --scope user --transport stdio hanger -- "/Applications/Hanger AI.app/Contents/MacOS/Hanger AI" mcp
```

The syntax is `claude mcp add [options] <name> -- <command> [args...]`.
Options go before the name, and everything after `--` is passed to the
server untouched
([Claude Code MCP docs](https://code.claude.com/docs/en/mcp), accessed
2026-11-27). The docs show `--scope user` only with an HTTP server, so the
line above combines the two forms. Not yet run. Check it with
`claude mcp list`, or `/mcp` inside Claude Code.

**Codex**, in `~/.codex/config.toml`:

```toml
[mcp_servers.hanger]
command = "/Applications/Hanger AI.app/Contents/MacOS/Hanger AI"
args = ["mcp"]
```

`command` is the "launcher command for an MCP stdio server" and `args` the
"arguments passed to the MCP stdio server command"
([Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference),
accessed 2026-11-27). Not yet run.

**Other engines** that take a JSON `mcpServers` entry:

```json
{
  "mcpServers": {
    "hanger": {
      "command": "/Applications/Hanger AI.app/Contents/MacOS/Hanger AI",
      "args": ["mcp"]
    }
  }
}
```

Unverified for any particular engine. Check its own docs for the file and
the key it uses.

## Once it is added

Hanger's server is then one more MCP server in that engine's config. After
the next scan it shows up in Hanger's MCP servers list like any other, and
for an engine Hanger can switch, you can switch it off there.
