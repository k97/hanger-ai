# What each engine does when an MCP server is switched off

Task 1 of [the context-control plan](2026-11-24-context-control.md). Measured on 2026-11-24 on Karthik's machine. Every command ran against a throwaway config directory; no real config file was written. These are existence proofs for the installed versions, not a sample.

`$S` stands for the session's scratch directory. Output is otherwise verbatim. Each command ran with stdin closed and a time limit.

## Summary

| Engine | Version | How a server goes off | Confirmed by | Slice 1 |
|---|---|---|---|---|
| Codex | codex-cli 0.171.0 | `enabled = false` in the server's `[mcp_servers.<name>]` table | `codex mcp list` → `disabled` | Switchable |
| Gemini CLI | 0.56.0 | `{"<name>": {"enabled": false}}` in `~/.gemini/mcp-server-enablement.json` | `gemini mcp list` → `Disabled` | Switchable, through that file |
| Claude Code | 2.1.331 | `claude mcp remove`, config kept by Hanger; `claude mcp add-json` restores it | `claude mcp list`, and a byte-equal round trip | Switchable, user scope |
| OpenCode | v2.4.1 | `"enabled": false` on the server | `opencode debug config` only; `opencode mcp list` could not be isolated | **Open — Karthik rules** |
| Cursor, Claude Desktop, Zed, VS Code | — | The vendor documents a toggle in the app and no key in the file | Not checked | Read-only (decision 11) |

Three results differ from the plan as approved. They are listed under "What this changes in the plan".

## Codex — honoured

```
$ cat $S/codexhome/config.toml
[mcp_servers.alpha]
command = "echo"
args = ["hi"]

[mcp_servers.beta]
command = "echo"
args = ["hi"]
enabled = false

$ CODEX_HOME=$S/codexhome codex mcp list
Name   Command  Args  Env  Cwd  Status    Auth       
alpha  echo     hi    -    -    enabled   Unsupported
beta   echo     hi    -    -    disabled  Unsupported
exit=0
```

## Gemini CLI — a key in the server entry breaks the config; its own file works; its own command does not

A `disabled` key on a server entry is rejected. mcpick's `gemini-cli` adapter writes exactly this.

```
$ cat $S/ghome/.gemini/settings.json
{"mcpServers":{"alpha":{"command":"echo","args":["hi"]},"beta":{"command":"echo","args":["hi"],"disabled":true}}}

$ HOME=$S/ghome gemini mcp list
Invalid configuration in $S/ghome/.gemini/settings.json:

Error in: mcpServers.beta
    Unrecognized key(s) in object: 'disabled'

Please fix the configuration.
See: https://geminicli.com/docs/reference/configuration/
```

`gemini mcp disable` exists, and on 0.56.0 it cannot find a server that `gemini mcp list` shows. The folder was trusted through `trustedFolders.json`, and no file changed.

```
$ HOME=$S/g2/home gemini mcp list
Configured MCP servers:

✗ alpha: echo hi (stdio) - Disconnected
✗ beta: echo hi (stdio) - Disconnected
exit=0

$ HOME=$S/g2/home gemini mcp disable beta
Error: Server 'beta' not found. Use 'gemini mcp' to see available servers.
exit=0

$ diff before.sha after.sha        # shasum of every file under the home
(no output)
```

The cause is in the shipped bundle (`@google/gemini-cli/bundle/gemini-54R2PJOR.js`): the command looks the name up in the return value of `getMcpServersFromConfig()`, which returns the admin-allowlist filter's result object, not the server map. Note the exit code is 0 on failure.

The state file the command would have written is honoured when written directly. The bundle's `McpServerEnablementManager` reads `<global gemini dir>/mcp-server-enablement.json`, keys it by `serverId.toLowerCase().trim()`, treats an absent key as enabled, and removes the key to enable.

```
$ echo '{"beta":{"enabled":false}}' > $S/g2/home/.gemini/mcp-server-enablement.json
$ HOME=$S/g2/home gemini mcp list
Configured MCP servers:

✗ alpha: echo hi (stdio) - Disconnected
○ beta: echo hi (stdio) - Disabled
```

Two properties to carry into the code:

- The file is keyed by name alone. Switching `beta` off switches off every server named `beta` that Gemini loads, at any scope.
- In an untrusted folder Gemini lists every server as Disabled, whatever this file says. That is the trust gate already recorded in `docs/roadmap.md`, not a switch.

Karthik's real `~/.gemini/` has four servers and no enablement file today.

## Claude Code — a flag is ignored; remove and restore round-trips

```
$ cat $S/cchome/.claude.json
{"mcpServers":{"alpha":{"command":"echo","args":["hi"]},"beta":{"command":"echo","args":["hi"],"disabled":true}}}

$ CLAUDE_CONFIG_DIR=$S/cchome claude mcp list
Checking MCP server health…

alpha: echo hi - ✘ Failed to connect — CONNECTION_CLOSED: Connection closed
beta: echo hi - ✘ Failed to connect — CONNECTION_CLOSED: Connection closed
exit=0
```

`beta` was started exactly like `alpha`. The real `~/.claude.json` (199,616 bytes, nine user-scope servers) carries only per-project keys for this: `disabledMcpjsonServers` and `enabledMcpjsonServers`.

Remove and restore, with the config on stdin and never in argv:

```
$ printf '%s' '{"type":"stdio","command":"echo","args":["hi","--flag","two words"],"env":{"FIXTURE_KEY":"fixture-value-1","OTHER":"x y"}}' \
    | CLAUDE_CONFIG_DIR=$S/cc2/home claude mcp add-json beta - --scope user
Added stdio MCP server beta to user config
exit=0

$ CLAUDE_CONFIG_DIR=$S/cc2/home claude mcp remove beta --scope user
Removed MCP server beta from user config
File modified: $S/cc2/home/.claude.json
exit=0

$ CLAUDE_CONFIG_DIR=$S/cc2/home claude mcp list
No MCP servers configured. Use `claude mcp add` to add a server.

$ CLAUDE_CONFIG_DIR=$S/cc2/home claude mcp add-json beta - --scope user < stash.json
Added stdio MCP server beta to user config
exit=0
round trip equal: True          # the restored entry == the entry saved before the remove, as parsed JSON

$ CLAUDE_CONFIG_DIR=$S/cc2/home claude mcp remove nope --scope user
No MCP server named "nope" in user scope
exit=1
```

Unlike Gemini, a failed `remove` exits 1.

### What `add-json` gives back, by shape of entry

Measured later the same day, same version, same throwaway directory. Each entry went in on stdin; "written" is what `mcpServers.<name>` held afterwards.

| Entry handed to `claude mcp add-json <name> - --scope user` | Output | Written |
|---|---|---|
| `{"command":"echo","args":["hi"]}` (no `type`) | `Added stdio MCP server notype to user config` | Equal |
| `{"type":"stdio","command":"echo","args":[],"timeout":30.0,"env":{}}` | `Added stdio MCP server floaty to user config` | Equal as parsed by Python, where `30.0 == 30`; the number's spelling was not checked |
| `{"type":"http","url":"https://example.com/mcp","headers":{…}}` | `Added http MCP server http to user config` | Equal |
| `{"url":"https://example.com/mcp"}` (a `url`, no `type`) | `Invalid configuration: it has a "url" but no "type". Add "type": "http" (or "sse" / "ws").` | Nothing |
| `{"command":"echo","args":["hi"],"disabled":true,"description":"x","unknownKey":{"a":1}}` | `Added stdio MCP server extra to user config` | `{"command": "echo", "args": ["hi"]}` only |

So `add-json` drops every key it does not know, `description` included, and still reports success. One of the nine user-scope entries in the real `~/.claude.json` carries `description`.

This is why `mcp::switch::vendor::claude_off` runs a pre-flight: it hands the entry to `add-json` in a private scratch config directory first, and removes the server only if what comes back is equal. A server Claude Code would not give back unchanged is not switched off.

## OpenCode — the config reader accepts the flag; `mcp list` could not be isolated

`opencode mcp list` talks to the background service by default, so it lists the real config whatever the environment says. This session also runs inside OpenCode, which sets `OPENCODE_CONFIG_CONTENT` and four other `OPENCODE_*` variables; they were unset for these runs.

```
$ cat $S/oc2/cfg/opencode/opencode.json
{"$schema":"https://opencode.ai/config.json","mcp":{"alpha":{"type":"local","command":["echo","hi"]},"beta":{"type":"local","command":["echo","hi"],"enabled":false}}}

$ XDG_CONFIG_HOME=$S/oc2/cfg XDG_DATA_HOME=… XDG_STATE_HOME=… XDG_CACHE_HOME=… opencode debug config --standalone
[
 {
  "type": "document",
  "path": "$S/oc2/cfg/opencode/opencode.json",
  "info": {
   "$schema": "https://opencode.ai/config.json",
   "mcp": {
    "servers": {
     "alpha": { "type": "local", "command": ["echo", "hi"] },
     "beta":  { "type": "local", "command": ["echo", "hi"], "disabled": true }
    }
   }
  }
 },
 …
]

$ (same environment) opencode mcp list --standalone
No MCP servers configured
exit=0
```

OpenCode's own reader turns `"enabled": false` into `"disabled": true`, so it understands the key. The same isolated run lists no servers at all, including `alpha`, so `mcp list` neither confirms nor contradicts it. Decision 6 asks for `mcp list`. That needs one switch on the real config, read back through the real background service, which is a write only Karthik can allow.

## The four installed apps — the vendors document no key in the file

Fetched 2026-11-24.

| App | Source | What it says |
|---|---|---|
| Cursor | https://cursor.com/docs/context/mcp | "Toggle servers on/off without removing them: Open **Customize** in the sidebar… Use the toggle." The `mcp.json` field tables list `type`, `command`, `args`, `env`, `envFile`, `url`, `headers`, `auth`. No on/off key. |
| VS Code | https://code.visualstudio.com/docs/agents/run/manage-mcp-servers | "Use the toggle beside the server… The configuration destination doesn't determine the enablement scope." Enablement is stored apart from the config file, per global, workspace or session scope. |
| Claude Desktop | https://modelcontextprotocol.io/docs/develop/connect-local-servers | Documents `claude_desktop_config.json` with `command`, `args`, `env`. No on/off key. |
| Zed | https://zed.dev/docs/ai/mcp, https://zed.dev/docs/ai/agent-settings | Servers are managed in **Settings → AI → MCP Servers**. Neither page documents an on/off key under `context_servers`. |

So for all four, the documented switch is a toggle in the app whose state is not in the file Hanger reads. A key written into the file is a guess. Decision 11 keeps them read-only until checked; the sheets below are that check.

### Check sheets (for Karthik; about two minutes each)

For each app: quit it, add the throwaway server below by hand, reopen it, look where the sheet says, then delete the entry.

| App | File | Entry to add | Where to look | "Off" must look like |
|---|---|---|---|---|
| Cursor | `~/.cursor/mcp.json` → `mcpServers` | `"hanger-check": {"command": "echo", "args": ["hi"], "disabled": true}` | Sidebar → Customize → MCP | The server is listed with its toggle off, and Cursor reports no config error |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` → `mcpServers` | the same entry | Settings → Developer | The server is listed as disabled, and not as failed or running |
| Zed | `~/.config/zed/settings.json` → `context_servers` | `"hanger-check": {"command": "echo", "args": ["hi"], "enabled": false}` | Settings → AI → MCP Servers | The server is listed switched off, with no red indicator |
| VS Code | `~/.copilot/mcp-config.json` → `mcpServers` | `"hanger-check": {"type": "stdio", "command": "echo", "args": ["hi"], "disabled": true}` | Chat: Open Customizations → MCP Servers | The server is listed with its toggle off |

**Cursor, one more step (Karthik, 2026-11-25, Q14 of `2026-11-25-t3-code-review.md`):** after you switch a real server off in Cursor's own toggle, look for `~/.cursor/projects/<slug>/mcp-disabled.json` (the slug is the project root with every run of non-alphanumeric characters turned into `-`). If it is there, Cursor keeps its off list per project, outside `mcp.json`, and that shapes how Hanger could switch Cursor.

If an app shows the server as on, failed, or missing, the key is not honoured. That app then needs either remove-and-keep, as for Claude Code, or it stays read-only. That is a ruling for after the checks.

## When a change applies — not observed

The plan's Step 4 asked for a running session to be checked after a switch. A session needs the engine signed in, a throwaway config directory is not, and Hanger does not read credential files. So no observation was made, and no engine gets an "applies to new sessions" line from this task. Task 13 can observe it on the real config with Karthik's go-ahead.

## What this changes in the plan

1. **Gemini CLI is switched through its enablement file, not its command.** The plan's `GeminiCli` kind and `gemini_set` (Task 2, Task 6) assumed `gemini mcp disable` works. On 0.56.0 it fails and exits 0. The confirmed mechanism is a small JSON file that Hanger's safe-replace can write.
2. **This file lives in `docs/plans/`, not `docs/evidence/`.** `docs/evidence/` is in `.gitignore` (`documentation.md`), and the `SWITCHES` table's evidence has to be something a reader can open.
3. **"Applies to new sessions" has no evidence yet** (above).

## Found on the way, outside this slice

- **VS Code's MCP configuration has moved.** Its documentation now calls `.vscode/mcp.json` and the profile `mcp.json` (the `servers` format) the deprecated Local harness, to be removed in February 2027. The Copilot harness reads `~/.copilot/mcp-config.json` and a workspace-root `.mcp.json`, both `mcpServers`. `registry.rs` → `SOURCES` reads only the old pair for the `vscode` host, so Hanger does not see servers declared the new way.
- **`gemini mcp disable` and `enable` are broken on 0.56.0** for every server, by the look of the bundle. The installed version is fifteen minor versions behind the latest (0.71.1 on 2026-11-24), where it may be fixed.
