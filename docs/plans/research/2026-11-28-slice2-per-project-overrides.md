# Slice 2: per-project overrides of global MCP servers (research, 2026-11-28)

## 1. What it is and why

Today Hanger switches a server where it is declared: global means that engine
everywhere. Karthik also wants "off in this repo only" for a global server
(`docs/plans/2026-11-24-context-control.md` → "Later slices", item 2; T18).
Such rows now read `read_only: "per_project_comes_next"` and show "Hanger can't
switch servers declared in {file} yet." Slice 2 replaces that line with a
real, project-scoped switch plus a way to pick the project.

## 2. What exists today

- `mcp/registry.rs` → `SWITCHES`: four rows. codex `EnabledKey` (Global, Project);
  claude-code `ClaudeCli` (User only); gemini `GeminiEnablementFile` (Global only);
  antigravity `DisabledKey` (Global only). No row for cursor, opencode, zed.
- `mcp/switch/context.rs` → `standing_reason` returns `PerProjectComesNext`
  for any host that has a `SWITCHES` row, but not at that tier. The ruling
  text: "switch where declared; per-project overrides come as a follow-up".
- `mcp/switch/vendor.rs` and `ops.rs` (`ClaudeCli`) do remove-and-restore
  through `claude mcp`, with a stash. Never writes `~/.claude.json`
  (plan, "Out of scope": "Writing `~/.claude.json` directly").
- `mcp/switch/edit.rs` / `apply.rs`: atomic write, pre-write copy, Undo receipt.
- Frontend: `src/utils/switchCopy.ts` (`readOnlyLine`), `OverviewCard`/`OverviewHost`,
  `HeaderSwitch`, `AllEnginesSwitch`. `read_only` is in `docs/ipc.md`.
- grep: `per_project_comes_next` appears in 7 files (3 TS tests/utils, `engineContext.ts`,
  `mcp_switch_tests.rs`, `docs/ipc.md`, the naming brief).
- mcpick (`/Users/karthik/Work/Labs/mcpick`): no per-project override. It only
  writes `projects[cwd].mcpServers` for local-scope servers (`client-config.ts`,
  `dev-override.ts`) and reads it in `doctor.ts`. Nothing to port. Grep for
  `disabledMcp|enabledMcp` over its `src`, `docs`, `CONTEXT.md`: no hits.

## 3. Outside facts (all measured with a throwaway HOME, 2026-11-28)

| Engine | Per-project off for a global server | Verified |
|---|---|---|
| Claude Code 2.1.332 | `~/.claude.json` → `projects["<realpath>"].disabledMcpServers: ["name"]`. `claude mcp list` and `get` print "Disabled for this project (re-enable via /mcp)"; the same server in another cwd is unaffected. The key must be the real path: a `/var/...` path that resolves to `/private/var/...` did nothing. Applies to user and local scope. | run |
| Claude Code, `.mcp.json` servers | `disabledMcpjsonServers` (and `enabledMcpjsonServers`) in the same project entry. `get` printed "Rejected (see disabledMcpjsonServers in settings)". Also read from `.claude/settings.local.json` per the binary's own text (my settings.local test did not change `list`, so not proven). | run, partial |
| Codex 0.172.0 | Project `.codex/config.toml` with a partial `[mcp_servers.beta] enabled = false` merges over the global entry. `codex mcp list --json` printed `enabled:false`. Only when `[projects."<path>"] trust_level = "trusted"` is in the global config; untrusted, it is ignored. Other directories unaffected. | run |
| Gemini CLI 0.56.0 | Project `.gemini/settings.json` `{"mcp":{"excluded":["beta"]}}` makes `gemini mcp list` show beta "Blocked", alpha untouched. Requires a trusted folder (`~/.gemini/trustedFolders.json`); in an untrusted folder every server is "Disabled", user-level ones too. `gemini mcp disable <name>` has `--session` only, no project flag. | run |
| Antigravity CLI 1.5.18 | `agy mcp list` ignored a workspace `.agents/mcp_config.json` for both a `disabled:true` override and an added server. `mcp` subcommands have no scope flag. No per-project way found. | run, negative |
| Cursor | Docs list `.cursor/mcp.json` (project) and `~/.cursor/mcp.json` (global) and a UI toggle. They say nothing on override, precedence or a per-project disabled key. Not found. Not installed here. | cursor.com/docs/context/mcp, read 2026-11-28 |
| OpenCode (CLI 2.4.2) | Docs: a higher-precedence project config replaces the whole server object of the same name; disable with `disabled: true` plus the required fields (`type`, `command`). Hanger's registry assumes `"enabled": false`; the docs say `disabled`. Not run: `opencode mcp list` cannot be isolated (engine matrix). | opencode.ai/docs/mcp-servers, 2026-11-28 |
| Zed | Docs name no project override and no per-server `enabled`; only profile-scoped `enable_all_context_servers` and per-tool permissions. Not found. | zed.dev/docs/ai/mcp, 2026-11-28 |

Fetches are summaries from the tool's page reader, not the raw page.

## 4. Options

**A. Claude Code and Codex and Gemini only, each by its own file (pick).**
Write exactly the keys above: Claude `projects[p].disabledMcpServers`
(direct JSON edit on `~/.claude.json`, atomic and with Undo), Codex a
project `.codex/config.toml` stub (`edit.rs` already toggles `enabled` for the
Project tier), Gemini project `mcp.excluded`. Cost: lifts the "never write
`~/.claude.json`" rule for one key; three writers; trust preconditions to
surface (Codex trusted, Gemini trusted). Trade: covers the three engines with a
measured mechanism.

**B. Claude Code only.** Smallest, and Claude is where the context cost sits.
Leaves Codex and Gemini `per_project_comes_next` forever; wrong copy.

**C. Wait for the gateway (slice 6).** One per-project policy for every engine.
Needs the unmeasured `list_changed` spike and never helps Cursor/Zed either.

Pick A, sequenced Claude, then Codex, then Gemini. Antigravity, OpenCode,
Cursor and Zed get a new honest reason ("this engine has no per-project
switch") instead of "comes next". OpenCode's `disabled` vs `enabled` conflict
needs a live check before any OpenCode write, global or project.

Project picker: the repository view already scopes everything to one root, so
the picker is that view. A server row on a repo's overview card gets "Off in
this repo", with the engine chips marking which engines can honour it. A
"Where is it off?" list on the server inspector shows each project's
override, read from the stores above. Do not add a separate global picker
first: Claude's own `/mcp disable` is per-project too.

## 5. Shared machinery

- `mcp::switch` (`context.rs`, `edit.rs`, `ops.rs`, `vendor.rs`): new `ScopeTier`
  override concept; `ItemState` becomes per (server, project). Ties to piece 1.
- `registry.rs` `SWITCHES`/`SwitchKind`; `brand-coverage.test.ts` floors if rows are added.
- The overview card and `ReadOnlyReason` enum (`engineContext.ts`, `switchCopy.ts`,
  `docs/ipc.md`); `mcp_server` `engine_context` output (items gain a project key).
- Store schema: no change needed (state lives in the engine files). Only a
  project-path to realpath normaliser, shared with `shared-asset-machinery` roots.
- Other asset kinds: none touched (MCP-only). Per-kind counts must still match.
- Collides with: **1 (MCP phase 2)** on `mcp::switch`; **4 (profiles)** which
  would save and load the same override sets; **6 (gateway)** if it takes over
  scoping; **7 (T19)** for trust state (Codex/Gemini trusted folders).

## 6. Depends on / unblocks

Depends on nothing for Claude. Codex/Gemini rows want piece 7's trust reads, or
read the trust keys directly (not credentials). Enables piece 4 (a profile can
carry per-project sets) and an `engine_context(project)` argument for the MCP server.

## 7. Questions for Karthik

1. Allow Hanger to write `~/.claude.json` for the one `disabledMcpServers` key?
   Options: yes, atomic with Undo (pick); or only via `/mcp disable` instructions.
2. Where does "off in this repo" live in the UI? Options: repo overview card row
   action (pick); server inspector list; both.
3. Codex/Gemini need a trusted folder. Hanger may not set trust. Show "needs trust" (pick) or write it?
4. Ship Claude alone first (pick) or all three together?

## 8. Size

About 9 tasks: realpath/project normaliser; Claude writer + read; Codex
project stub; Gemini `mcp.excluded`; new `ReadOnlyReason` copy (humanizer pass);
repo-card row action; inspector list; `docs/ipc.md` and `engine_context`;
guards and fixtures. Human gates: one live check per engine on the real app
(the projects key is path-exact), a naming brief for the "off in this repo" label,
layout options for the card, and OpenCode's `disabled` key.

Not checked: Claude's `/mcp disable` write by the real UI (I only read what
`mcp list` does), `.claude/settings.local.json` effect, Cursor or Zed behaviour in the apps.
