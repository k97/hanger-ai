# Slice 6, the gateway: switching MCP servers mid-session (research, 2026-11-28)

## 1. What it is and why

Today a switch rewrites an engine's config, so it applies when the next session starts. The gateway puts Hanger between each engine and its MCP servers. A switch then changes what Hanger passes through, and `notifications/tools/list_changed` tells the running session to fetch the tool list again. It only matters where an engine acts on that notification, and the evidence below says most engines do not act on it reliably.

## 2. What exists today

- **Switching by config write:** `mcp::switch` (`apply::safe_replace`, `Receipt`, `undo`; `ops::set_enabled_for`), with `registry::SWITCHES` saying which engines can be switched. For Claude Code, `switch::vendor` runs `claude mcp remove` and `add-json` and keeps the whole entry, env values included, in a 0600 stash. Hanger therefore already stores secrets for Claude Code servers that are switched off.
- **When a change applies:** `context::EngineContext.applies: Option<String>` is always `None`. The engine matrix says "When a change applies — not observed" (`docs/plans/2026-11-24-context-control-engine-matrix.md`).
- **Launching servers:** `mcp::probe::probe` spawns a stdio server with only `PATH` set (`widened_path`). It passes no declared env.
- **Identity:** `dialect::McpServer` records `env_keys` (names only). `dialect::unwrap_bridge` already looks through `mcp-remote`, so the same server compares equal behind a bridge. A wrapper would need the same treatment.
- **Hanger's own server:** `mcp_server::run_from_args` (called from `main.rs`) dispatches on `argv[1] == "mcp"` before Tauri starts, so the binary already runs headless as an engine's child. rmcp 3.12 has `notify_tool_list_changed`, the 2026-07-28 revision and `subscriptions/listen`, plus `client` and `transport-child-process` features that Hanger doesn't enable.
- **mcpick** has no gateway. Its server declares `listChanged: false`, and its CLI tells users to restart Claude Code.
- **Rulings:** config writes first, then the gateway as its own plan, after a `list_changed` spike for each engine (`hanger-tool-manager-direction.md`; research note Q8: "Run a `list_changed` spike per engine first").

## 3. Outside facts (all read 2026-11-28)

**Spec.** Under 2026-07-28, a server that declares `tools.listChanged` sends the notification only to clients that opened a `subscriptions/listen` stream with `toolsListChanged: true`. Every request carries `_meta` with the protocol version and client info, and "MCP has no protocol-level session" ([spec, tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)). Older revisions send the notification unprompted after `initialize`, so a proxy has to speak both.

**Cost of switching mid-session.** "Modifying tool definitions … invalidates the entire cache" ([Claude prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)). Each switch in a running session therefore costs a full prompt-cache miss.

| Engine | Honours `list_changed` today? | Source |
|---|---|---|
| Claude Code | **Contradictory.** The docs say an interactive session "fetches the updated list" and `-p` refreshes tools only. Open bugs say otherwise: the deferred-tool/ToolSearch index isn't refreshed (#66084, open, updated 2026-11-20), a lazily reconnected stdio server ignores it (#108287, open), and the Desktop app doesn't act on it (#88483, open) | [docs](https://code.claude.com/docs/en/mcp); `gh search issues list_changed --repo anthropics/claude-code` |
| Codex | **No.** `on_tool_list_changed` "still only logs" (#10105, open, comment 2026-10-07). Per #37417 (open, read from source at `fcc4ca5`), `refresh_mcp_if_dirty` re-reads a server *whose config changed* between turns. That would make a config write apply mid-session. Not verified | openai/codex #10105, #37417, #33266 |
| Gemini CLI | **Yes, since PR #14375** (merged 2025-12-04). A follow-up bug about it not working, #19509, was closed as completed 2026-03-04. The refresh path still drops the server timeout (#29041, open) | google-gemini/gemini-cli |
| Antigravity CLI | **Not found.** The docs mention a manual Refresh in the settings UI and cached tool definitions under `~/.gemini/antigravity-cli/mcp/` | [antigravity.google/docs/mcp](https://www.antigravity.google/docs/mcp/) |
| Cursor | **Unreliable.** Staff, 2026-10-15: "a known issue that we're tracking". Reconnecting reuses the cached list. The workaround is to bump a dummy `env` or header in `mcp.json` | [forum 174607](https://forum.cursor.com/t/mcp-tool-list-caching/174607) |
| VS Code Copilot | **Claimed.** "The editor's MCP client also supports dynamic tool discovery", and clients "refresh their tool catalogs differently". The Configure Tools UI doesn't refresh (#349603, open) | [VS Code MCP guide](https://code.visualstudio.com/api/extension-guides/ai/mcp) |
| OpenCode | **No for new tools** in 2.3.0 (#64117, open, 2026-11-15). On 2026-07-28 connections, the listen stream is never reopened once it ends (#66072, open) | anomalyco/opencode |
| Zed | **Yes.** It "automatically reloads the tool list without requiring a server restart". A race was fixed (#57473, closed) | [Zed MCP docs](https://zed.dev/docs/ai/mcp) |

Every row is about tools *added* to a server. The gateway's main case is tools *removed*, and no source tests that. The spike must.

**Prior art** (licences from `gh api repos/*/license`):
- **MIT:** sparfenyuk/mcp-proxy (a stdio↔HTTP bridge), TBXark/mcp-proxy, metatool-ai/metamcp (**archived 2026-11-12**), ravitemer/mcp-hub (`tool_list_changed` events, last push 2025-10-24), docker/mcp-gateway and microsoft/mcp-gateway.
- **Apache-2.0:** 1mcp-app/agent, whose "presets … and preset change notifications" are the closest match to profiles; stacklok/toolhive; IBM/mcp-context-forge; and agentgateway (Rust).
- **MPL-2.0:** MCPJungle.

Every project except the bridge aggregates: the engine sees one server, with every tool renamed under it. None is a transparent wrapper that switches one server.

## 4. Options

**A. Aggregator, one stdio gateway per engine** (or one localhost HTTP server; MetaMCP and 1mcp work this way). Each engine's servers move into Hanger and the engine config gets one `hanger` entry.
- Costs: Hanger has to hold every server's env, since the engine no longer launches them, which means storing secrets. Tool names change from `mcp__<server>__<tool>` to `mcp__hanger__…`, which breaks users' permission allowlists. The engine's own `/mcp` view and Hanger's inventory collapse to one server. The HTTP variant also needs a resident process (a LaunchAgent), a localhost auth token and DNS-rebinding defences, and Claude Code's HTTP stream gives up after limited reopens (docs, "Notification streams on the v2 runtime").
- Install moves every entry, so Undo means restoring everything at once.

**B. Per-server stdio shim** (`"Hanger AI" shim -- <original command> <args>`). The engine still launches each server, with its own env, through the shim. The shim passes JSON-RPC lines through unchanged, with four exceptions: it declares `tools.listChanged`, filters `tools/list` by Hanger's switch state, answers `tools/call` to a switched-off tool with an error, and sends `list_changed` when the state flips.
- Costs: one config edit per wrapped server. `unwrap_bridge`-style unwrapping is needed in `dialect`, `probe::cache_key`, `agreement` and `observe`. The proxy must speak both the legacy and the 2026-07-28 revision. If the binary path disappears, every wrapped server breaks.
- Gains: server names, tool names, permissions and env stay where they are, and Hanger reads no values. The shim runs without the app, as `mcp` does, and reads a state file under the app data directory (not SQLite, so the `BEGIN IMMEDIATE` writers aren't contended). It can only subtract tools. An engine that ignores the notification still gets the switch at its next session.
- Remote (URL) servers stay on config writes, because wrapping them would hand their OAuth to Hanger.

**C. No gateway: config writes plus each engine's own reload, labelled honestly.** Fill `applies` per engine from observation. Codex may already apply a config change between turns (#37417), Cursor reconnects when `mcp.json` changes (forum), OpenCode has `opencode reload`, and Claude Code has `/mcp reconnect`. Cost: the spike, plus copy. No new process and no new security surface.

**Pick: C now, measured in the same spike; B only if the spike clears the bar in Q1.** A is ruled out by secrets and permissions.

**Spike design (not built).** One stdlib Python file with no SDK, so that no SDK behaviour colours the result:
- It answers `initialize` with the client's version and `tools.listChanged: true`, and also accepts `subscriptions/listen`.
- It serves set A (`spike_alpha`) or set B (`spike_alpha`, `spike_beta`).
- It flips by two triggers. One is in-band: a tool `spike_flip`. The other is out-of-band, the real gateway case: the mtime of `$SPIKE_DIR/flip`, polled every 500 ms.
- It logs every inbound method, with a timestamp and without payloads, to `$SPIKE_DIR/log.jsonl`.
- Per engine and version, with tool search on and off where the engine has it, record:
  - (a) the protocol revision it negotiated;
  - (b) whether `tools/list` follows the notification within 5 s;
  - (c) whether the model can call a tool that was *added*, in the next turn, without reconnecting;
  - (d) whether a *removed* tool stops being offered;
  - (e) for option C, whether a config edit alone changes (c) and (d).
- Runs need a signed-in session, so each one is a live check on Karthik's machine with his go-ahead, as Task 13 3b was.

## 5. Shared machinery

- **`mcp::switch`:** B reroutes `set_enabled_for` to a state flip for wrapped servers, and installing B is a `safe_replace` write with a `Receipt`, or `vendor` `add-json` for Claude Code. This collides with **Slice 2** (per-project overrides) and **Slice 3** (add/remove must not strip or duplicate a wrapper). Undo of an install is valid only right after it. Later removal has to be an inverse edit ("unwrap"), not a byte restore, for the reason `vendor.rs` gives about `.claude.json`.
- **`dialect`, `probe`, `agreement`, `observe`:** wrapper unwrapping, the same shape as `unwrap_bridge`. Inventory counts must not change (`shared-asset-machinery.md`: capture per-kind counts before and after).
- **`HOSTS`/`SWITCHES`:** a per-engine "honours `list_changed` from version X" fact. Collides with **T19** (version-gated flags).
- **`mcp_server`:** shares the binary and the `run_from_args` dispatch (a new `shim` arm), and nothing else. The read-only server must not join the data path of third-party servers. Collides with **MCP phase 2**: a proposed switch would write the same state file.
- **Overview card:** the "applies" line and the per-engine budget. Collides with **Slice 4** (loading a profile through B is one state write).
- **Store schema:** none for C. B can use a JSON state file and needs no `user_version` bump.

## 6. Depends on / unblocks

- **Depends on:** the spike, and T19's engine versions so that "applies" can be version-gated.
- **Benefits from:** Slice 3 landing first, so add/remove knows about wrappers from the start.
- **Unblocks:** Slice 4 profiles that apply live, and Phase B usage data. A shim could count tool calls per server, though that is a privacy question nobody has ruled on.

## 7. Questions only Karthik can answer

1. **Bar for building B after the spike.** (a) Claude Code plus one more engine passes removal (d); (b) any three engines; (c) Claude Code alone. *Pick: (a).*
2. **Shape if built.** (a) per-server shim; (b) aggregator. *Pick: (a), because it keeps names, permissions and env in place.*
3. **Who opts in.** (a) per engine, off by default; (b) on for every switchable server. *Pick: (a), in the spirit of reaping being off by default.*
4. **Remote servers.** (a) stay on config writes; (b) bridged through the shim, with Hanger handling OAuth. *Pick: (a).*

## 8. Size

- **Spike:** 1 task to write the script. Then a human-gated live run for each of the eight engines, which can't run in a throwaway `HOME` because sessions need sign-in. Then 1 task to fill `applies` from the results (option C).
- **B, if the bar is met:** about 9 tasks.
  - The `shim` subcommand as a pass-through.
  - Filtering and injection, for both protocol revisions.
  - The state file and its watcher.
  - Unwrapping in dialect, probe, agreement and observe.
  - Install and unwrap writes for each dialect.
  - The Claude Code path through `add-json`.
  - Switch routing.
  - A Needs review finding for a missing shim path.
  - Live proof.
- **Human gates for B:** a naming brief for the user-facing noun ("gateway" is internal), layout options for the opt-in, and Karthik's go-ahead for the first real install write.

---
Not checked: the Claude Code issues were read by title and status only, not reproduced. Codex's `refresh_mcp_if_dirty` claim is taken from #37417's reading of the source, not from the source itself. How fast the Tauri binary starts in shim mode wasn't measured.
