# Hanger IPC Contract

This document specifies the Tauri IPC command signatures, payload schemas, and response formats for Hanger v1.

---

## 1. link_directory

Links a new root directory containing AI-agent assets to the Hanger preferences store.

- **Command Name:** `link_directory`
- **Arguments:**
  - `path`: `string` (absolute directory path to target)
- **Response:** `null` (success) or `string` (sanitised error message)

### Request Example
```json
{
  "path": "~/Projects/demo-project"
}
```

---

## 2. unlink_directory

Removes a linked directory path from the Hanger preferences store.

- **Command Name:** `unlink_directory`
- **Arguments:**
  - `path`: `string` (absolute directory path to unlink)
- **Response:** `null` (success) or `string` (sanitised error message)

### Request Example
```json
{
  "path": "~/Projects/demo-project"
}
```

---

## 3. get_linked_directories

Retrieves all directories currently registered in the database.

- **Command Name:** `get_linked_directories`
- **Arguments:** None
- **Response:** `string[]` (array of linked directory paths) or `string` (sanitised error message)

### Response Example
```json
[
  "~/Projects/demo-project",
  "~/Projects/another-project"
]
```

---

## 4. run_scan

Runs an inventory scan on all linked directories, returning aggregated Skills, Agents, Tools, and Rules.

- **Command Name:** `run_scan`
- **Arguments:** None
- **Response:** `Inventory` or `string` (sanitised error message)

### Response Example
```json
{
  "skills": [
    {
      "id": "~/Projects/demo-project/.agents/skills/design-tokens/SKILL.md",
      "name": "design-tokens",
      "description": "Standardised design tokens mapping for the Bluesky system.",
      "version": "1.0.0",
      "path": "~/Projects/demo-project/.agents/skills/design-tokens/SKILL.md",
      "source_origin": null
    }
  ],
  "agents": [
    {
      "id": "claude-desktop",
      "name": "Claude Desktop",
      "config_path": "~/.config/claude"
    }
  ],
  "tools": [
    {
      "id": "~/.config/claude/claude_desktop_config.json-weather-mcp",
      "name": "weather-mcp",
      "command": "node weather-server.js",
      "config_path": "~/.config/claude/claude_desktop_config.json"
    }
  ],
  "rules": [
    {
      "id": "~/Projects/demo-project/CLAUDE.md",
      "name": "CLAUDE.md",
      "path": "~/Projects/demo-project/CLAUDE.md",
      "content": "# CLAUDE.md Instructions"
    }
  ]
}
```

---

## 5. deploy_asset

Deploys a source asset to a target path using either a symlink or file copy, executing the transactional-write sequence behind the scenes.

- **Command Name:** `deploy_asset`
- **Arguments:**
  - `sourcePath`: `string` (absolute path of the asset source)
  - `targetPath`: `string` (absolute destination path)
  - `deployType`: `"symlink"` | `"copy"`
- **Response:** `null` (success) or `string` (sanitised error message)

### Request Example
```json
{
  "sourcePath": "~/Projects/src-project/CLAUDE.md",
  "targetPath": "~/Projects/dst-project/CLAUDE.md",
  "deployType": "copy"
}
```

---

## 6. get_preference / set_preference

Gets or sets general key-value settings in the local preferences store.

- **Command Name:** `get_preference` / `set_preference`
- **Arguments (get_preference):**
  - `key`: `string`
- **Arguments (set_preference):**
  - `key`: `string`
  - `value`: `string`
- **Response (get_preference):** `string | null`
- **Response (set_preference):** `null`

---

## 7. export_preferences / import_preferences

Exports or imports the entire preferences database as a file.

- **Command Name:** `export_preferences` / `import_preferences`
- **Arguments (export_preferences):**
  - `targetPath`: `string` (destination file path)
- **Arguments (import_preferences):**
  - `sourcePath`: `string` (source backup file path to import)
- **Response:** `null` (success) or `string` (sanitised error message)

---

## 8. check_deploy_target

Performs pre-flight checks on a target project workspace path before deploying an asset.

- **Command Name:** `check_deploy_target`
- **Arguments:**
  - `sourcePath`: `string` (absolute path of the asset source)
  - `targetProjectPath`: `string` (absolute path of the destination project root)
- **Response:** `PreflightResult`
  - `target_exists`: `boolean`
  - `collision`: `boolean`
  - `has_permissions`: `boolean`
  - `warning`: `string | null` (e.g., `"handled in Rules deploy"`)

---

## 9. execute_deploy

Deploys a source asset to a target project workspace using either a symlink or file copy. If a copy is executed, the checksum of the deployed asset is recorded to support drift detection on subsequent scans.

- **Command Name:** `execute_deploy`
- **Arguments:**
  - `sourcePath`: `string` (absolute path of the asset source)
  - `targetProjectPath`: `string` (absolute path of the destination project root)
  - `deployType`: `"symlink"` | `"copy"`
- **Response:** `null` (success) or `string` (sanitised error message)

> [!NOTE]
> Symlink deployments point directly to the source target and bypass drift tracking. Thus, symlink deployments skip checksum logging in the database, whereas hard copy deployments calculate and record the `blake3` checksum.

---

## 10. get_rule_sections

Parses a source rule file and target rule file into heading-demarcated blocks.

- **Command Name:** `get_rule_sections`
- **Arguments:**
  - `sourcePath`: `string` (absolute path of the source rule)
  - `targetPath`: `string` (absolute path of the target rule)
- **Response:** `ParsedRuleMergeData`
  - `source_sections`: `RuleSection[]`
  - `target_sections`: `RuleSection[]`

### RuleSection Schema
- `heading`: `string | null`
- `heading_level`: `number`
- `content`: `string`

---

## 11. execute_deploy_merged_rule

Writes a custom compiled merged rule payload to the target rule file path using the transactional backup-temp-validate-replace sequence.

- **Command Name:** `execute_deploy_merged_rule`
- **Arguments:**
  - `targetPath`: `string` (absolute target file path to write to)
  - `mergedContent`: `string` (complete concatenated merged file text)
- **Response:** `null` (success) or `string` (sanitised error message)

---

## 12. get_rules_target_memory

Retrieves the previously selected target file mapping for a rule family and destination project if recorded in the preferences database.

- **Command Name:** `get_rules_target_memory`
- **Arguments:**
  - `projectPath`: `string` (target project root path)
  - `rulePath`: `string` (rule family filename, e.g., `"AGENTS.md"`)
- **Response:** `string | null` (remembered target file path, or `null` if unmapped)

---

## 13. set_rules_target_memory

Records the chosen target file mapping for a rule family and destination project.

- **Command Name:** `set_rules_target_memory`
- **Arguments:**
  - `projectPath`: `string` (target project root path)
  - `rulePath`: `string` (rule family filename, e.g., `"AGENTS.md"`)
  - `targetFile`: `string` (selected target file path)
- **Response:** `null` (success) or `string` (sanitised error message)

---

## 14. clear_rules_target_memory

Removes any remembered target file mapping for a rule family and project.

- **Command Name:** `clear_rules_target_memory`
- **Arguments:**
  - `projectPath`: `string` (target project root path)
  - `rulePath`: `string` (rule family filename, e.g., `"AGENTS.md"`)
- **Response:** `null` (success) or `string` (sanitised error message)

---

## 15. get_engine_context

Returns one engine's MCP servers: which are switched on, which Hanger can switch, and what the switched-on ones cost by the probe cache's estimate. Reads config files and the probe cache. Starts no server: one nobody has asked yet comes back with `estimated_tokens` and `tool_count` both `null`.

- **Command Name:** `get_engine_context`
- **Arguments:**
  - `engineId`: `string` (a host id from `mcp/registry.rs` → `HOSTS`, such as `"codex"`)
- **Response:** `EngineContext`. An id that is no host's gives a context with no items. This command does not fail.

### EngineContext Schema
- `engine_id`: `string`
- `engine_key`: `string | null` (the key the asset annotations use for this engine, `"claude_code"` for `"claude-code"`; the webview matches an annotation's `engine_key` against it exactly. `null` for an id that is no host's)
- `engine_name`: `string` (the registry's display name)
- `applies`: `string | null` (when a switch takes effect; `null` for every engine today)
- `switches_by_name`: `boolean` (the engine is switched by server name alone, so one switch covers every server it declares under that name; `true` for Gemini CLI today)
- `items`: `ContextItem[]`
- `on_count`: `number`
- `off_count`: `number`
- `measured_on_count`: `number` (items that are on and measured)
- `on_tokens_measured`: `number` (the estimates of those items, with a launch the engine declares twice counted once)

### ContextItem Schema
- `key`: `string` (what `set_mcp_server_enabled` takes: the registration's key, or `"stash:<id>"` for a Claude Code server Hanger is keeping while it is off)
- `name`: `string`
- `tier`: `"global"` | `"user"` | `"project"`
- `config_path`: `string` (sanitised; empty for a kept server, which is declared in no file)
- `state`: `"on"` | `"off"`
- `read_only`: `null` (Hanger can switch it) or one of `"engine_not_confirmed"`, `"per_project_comes_next"`, `"switches_by_name_everywhere"`, `"managed_by_plugin"`, `"managed_by_policy"`, `"runs_on_vendor_servers"`, `"file_unparseable"`
- `estimated_tokens`: `number | null`
- `tool_count`: `number | null` (`null` exactly when `estimated_tokens` is)

An item holds no command, argument, address or env variable.

### Response Example
```json
{
  "engine_id": "codex",
  "engine_key": "codex",
  "engine_name": "Codex",
  "applies": null,
  "switches_by_name": false,
  "items": [
    {
      "key": "/Users/demo/.codex/config.toml:alpha",
      "name": "alpha",
      "tier": "global",
      "config_path": "~/.codex/config.toml",
      "state": "on",
      "read_only": null,
      "estimated_tokens": 120,
      "tool_count": 4
    },
    {
      "key": "/Users/demo/.codex/config.toml:beta",
      "name": "beta",
      "tier": "global",
      "config_path": "~/.codex/config.toml",
      "state": "off",
      "read_only": null,
      "estimated_tokens": null,
      "tool_count": null
    }
  ],
  "on_count": 1,
  "off_count": 1,
  "measured_on_count": 1,
  "on_tokens_measured": 120
}
```

---

## 16. set_mcp_server_enabled

Switches one MCP server off or on for one engine, where it is declared. How depends on the engine (`mcp/registry.rs` → `SWITCHES`): a flag in the server's own entry (Codex), an entry in the engine's state file (Gemini CLI), or the engine's own command, with Hanger keeping the server's entry while it is off (Claude Code, user scope).

- **Command Name:** `set_mcp_server_enabled`
- **Arguments:**
  - `engineId`: `string`
  - `key`: `string` (a `ContextItem.key` from that engine's context)
  - `enabled`: `boolean`
- **Response:** `SwitchReply` or `string` (a failure code, below)

The key is not a path and is not trusted. It is accepted only if it is still the key of an item in that engine's context, and that item has `read_only: null`. No path from the webview is opened.

### SwitchReply Schema
- `context`: `EngineContext` (built after the switch)
- `receipt_id`: `string | null` (what `undo_mcp_switch` takes; `null` when the server was already as asked and nothing was changed)
- `undoable`: `boolean` (`true` exactly when `receipt_id` is a string)

### Failure Codes
The error is one of these strings and nothing else. It carries no path, no text from a file and nothing a command printed.

| Code | Meaning |
|---|---|
| `not_found` | The key names no server Hanger found, or the server is gone from its file. |
| `wrong_engine` | The key is another engine's. |
| `read_only` | Hanger shows this server and does not switch it. Also: a kept server asked to be off. |
| `unparseable` | The file that would be changed cannot be read or does not parse. |
| `changed_since_read` | The file is not as Hanger read it. Nothing was written. |
| `write_failed` | The change, or the copy kept before it, could not be written. |
| `not_verified` | What Hanger read back does not confirm the change. It may or may not have been made. |
| `would_not_come_back` | Claude Code would not hand this server back unchanged, so it was not removed. |
| `cli_not_found` | No `claude` is on the search path. |
| `cli_failed` | Claude Code's command did not make the change. |
| `already_there` | A server of that name is declared again. Nothing was run. |
| `name_refused` | The server's name cannot be handed to a command. |
| `not_undoable` | `undo_mcp_switch` only: the receipt is not one of this engine's, or what it records can no longer be taken back. |

### Request Example
```json
{
  "engineId": "codex",
  "key": "/Users/demo/.codex/config.toml:alpha",
  "enabled": false
}
```

---

## 17. undo_mcp_switch

Takes back one switch. The reply carries a receipt id of its own, which undoes the Undo.

- **Command Name:** `undo_mcp_switch`
- **Arguments:**
  - `engineId`: `string` (the engine the switch was made for)
  - `receiptId`: `string` (the `receipt_id` of a `SwitchReply`)
- **Response:** `SwitchReply` or `string` (a failure code from the table under `set_mcp_server_enabled`)

A receipt is honoured only under the engine it was made for, and a file is put back only while it still holds exactly what the switch left. Anything else is `not_undoable`.

### Request Example
```json
{
  "engineId": "codex",
  "receiptId": "file:00000000-0000-4000-8000-000000000001"
}
```

---

## 18. measure_engine_context

Asks each of one engine's switched-on servers what it provides, one at a time, and returns the context with those answers in it. The only one of these four commands that can start a server, and it does so only when called.

- **Command Name:** `measure_engine_context`
- **Arguments:**
  - `engineId`: `string`
- **Response:** `EngineContext`. This command does not fail: a server that is asked and does not answer is measured at zero.

It starts no server that is switched off, none that has a fresh answer in the probe cache, and none that is already running.

---

## 19. get_kept_off_servers

Returns the MCP servers Hanger is keeping while they are switched off for Claude Code. Claude Code is switched off by removing the server from its config, so while it is off the server is declared in no file. It is therefore not a row of `get_mcp_servers` and not in any figure `get_asset_counts` returns, and comes back here instead, with counts of its own. Reads Hanger's stash and the machine's config files. Writes nothing and starts no server.

- **Command Name:** `get_kept_off_servers`
- **Arguments:** None
- **Response:** `KeptOff`. With nothing kept, or no stash folder, the lists are empty and both counts are `0`. This command does not fail.

### KeptOff Schema
- `servers`: `KeptOffServer[]` (newest first)
- `count`: `number` (the number of servers)
- `only_kept_count`: `number` (servers with `also_declared: false`: names the MCP servers list has no row for)

### KeptOffServer Schema
- `key`: `string` (`"stash:<id>"`: what `set_mcp_server_enabled` takes, with `enabled: true`, to switch it back on)
- `name`: `string`
- `engine_id`: `string` (the host switched through Claude Code's own command, `"claude-code"` today)
- `engine_name`: `string` (the registry's display name)
- `transport`: `string` (`"stdio"`, `"unknown"`, or an address without its userinfo or query string)
- `at_ms`: `number` (when it was switched off)
- `also_declared`: `boolean` (some config file on this machine still declares a server of this name, for any engine, outside one project's local scope; names are matched trimmed and nothing else, as the MCP servers list groups them)

A kept server holds no command, argument, env variable or header.

### Response Example
```json
{
  "servers": [
    {
      "key": "stash:00000000-0000-4000-8000-000000000001",
      "name": "beta",
      "engine_id": "claude-code",
      "engine_name": "Claude Code",
      "transport": "stdio",
      "at_ms": 1795566217263,
      "also_declared": false
    }
  ],
  "count": 1,
  "only_kept_count": 1
}
```

---

## 20. get_engine_contexts

Returns every engine's context from one pass over the machine's config files: for each engine, exactly what `get_engine_context` returns for it. The webview primes the overview from the cache on mount, then re-reads this once per scan; it keeps the one copy every surface reads. Reads config files and the probe cache, and starts no server.

- **Command Name:** `get_engine_contexts`
- **Arguments:** None
- **Response:** `EngineContext[]` (the schema under `get_engine_context`). This command does not fail.

The list holds each engine that has an item: every engine the config files declare a server for, outside one project's local scope, in the order they were found; then Claude Code, if Hanger is keeping a server for it and it declares none. Any other engine's context has no items and is left out.

---

## 21. get_skill_switch

Returns the On/Off switch for one skill in the global store, `~/.agents/skills`, or why it has none. The only skill-switch command that takes a path, because it only reads: metadata, Hanger's store, and nothing else.

- **Command Name:** `get_skill_switch`
- **Arguments:**
  - `skillPath`: `string` (the skill's folder, as the inventory gives it)
- **Response:** `SkillSwitchInfo | null`. `null` for a path that is not in the global store, for the store itself, and for a path where nothing is. This command does not fail.

A path through a folder that resolves to the store, such as `~/.claude/skills/x` where `~/.claude/skills` links to the store, is the store's.

### SkillSwitchInfo Schema
- `key`: `string` (`"skill:<name>"`: what `set_skill_enabled` takes)
- `read_only`: `"inside_another_folder" | "other_volume" | "has_tracked_copies" | null` (why there is no switch; `null` when there is one)

| `read_only` | Meaning |
|---|---|
| `inside_another_folder` | The skill is inside another folder of the store, not at its top. |
| `other_volume` | The store and Hanger's keep are on different disks, so the skill would have to be copied. |
| `has_tracked_copies` | Hanger copied this skill into a project and tracks the copy by its source path. |

---

## 22. set_skill_enabled

Switches a store skill off, or a kept one back on. Off moves the skill's folder into Hanger's keep, `<app data dir>/kept/skills/<uuid>/<name>`, with one rename, and removes the one-by-one links to it after recording each one's exact text. On renames it back to the same path and recreates each link from that text. Nothing is copied and nothing is overwritten (`docs/harness.md`, "Hanger moves skill folders").

- **Command Name:** `set_skill_enabled`
- **Arguments:**
  - `key`: `string` (`"skill:<name>"` with `enabled: false`, or `"kept-skill:<uuid>"` with `enabled: true`)
  - `enabled`: `boolean`
- **Response:** `SkillSwitchReply` or `string` (a failure code, below)

The key is not a path and is not trusted. `skill:<name>` must name a direct child of the store when it is used, and `kept-skill:<uuid>` must name a receipt in the keep that holds that id. A key asked for the state it is already in changes nothing and has `receipt_id: null`.

### SkillSwitchReply Schema
- `name`: `string` (the skill's folder name)
- `receipt_id`: `string | null` (`"kept:<uuid>"` after Off, `"restored:<name>"` after On; what `undo_skill_switch` takes; `null` when nothing changed)
- `undoable`: `boolean` (`true` exactly when `receipt_id` is a string)
- `links_count`: `number` (the links removed, or recorded for putting back)
- `links_not_restored`: `string[]` (links On could not put back because their folder is gone, each path with the home shown as `~`; no folder is made)
- `kept`: `KeptSkills` (the keep after the switch)

### Failure Codes
The error is one of these strings and nothing else. It carries no path and nothing from a file.

| Code | Meaning |
|---|---|
| `not_found` | No skill of that name is in the store, or no kept entry has that id. |
| `read_only` | Hanger shows this skill and does not switch it (`SkillSwitchInfo.read_only`). |
| `name_refused` | The name could reach outside the store, or a path or link text is not UTF-8. |
| `changed_since_read` | A link changed while Hanger was working. Nothing was moved. |
| `already_there` | A skill of that name is in the store again. Nothing was moved. |
| `link_place_taken` | Something other than the link is where a link was. Nothing was moved. |
| `changed_since_kept` | The kept skill is no longer what was kept. Nothing was moved. |
| `other_volume` | The store and the keep are on different disks. |
| `write_failed` | A move, a link or a receipt could not be written. |
| `not_verified` | The skill came back and does not match what was kept. The keep's record stays. |
| `not_undoable` | `undo_skill_switch` only: the receipt is not one Hanger can take back. |

### Request Example
```json
{
  "key": "skill:figma",
  "enabled": false
}
```

---

## 23. undo_skill_switch

Takes back one skill switch. `kept:<uuid>` switches the kept skill back on; `restored:<name>` switches the skill of that name off again, through every check Off makes. The reply carries a receipt id of its own, which undoes the Undo. The backend holds nothing between calls: the receipt is on disk, so an Undo still works after a rescan.

- **Command Name:** `undo_skill_switch`
- **Arguments:**
  - `receiptId`: `string` (the `receipt_id` of a `SkillSwitchReply`)
- **Response:** `SkillSwitchReply` or `string` (a failure code from the table under `set_skill_enabled`). A receipt id of any other shape, or one whose skill is no longer there to take back, is `not_undoable`.

### Request Example
```json
{
  "receiptId": "kept:00000000-0000-4000-8000-000000000001"
}
```

---

## 24. get_kept_skills

Returns the skills Hanger is keeping while they are switched off. A kept skill is not in the store, so it is in no row of the Skills list and in no figure `get_asset_counts` returns; it comes back here instead, with a count of its own. Reads the keep. Writes nothing.

- **Command Name:** `get_kept_skills`
- **Arguments:** None
- **Response:** `KeptSkills`. With nothing kept, or no keep folder, the list is empty and the count is `0`. This command does not fail.

### KeptSkills Schema
- `skills`: `KeptSkill[]` (newest first)
- `count`: `number` (the number of kept skills: the "Switched off" figure)

### KeptSkill Schema
- `key`: `string` (`"kept-skill:<uuid>"`: what `set_skill_enabled` takes, with `enabled: true`)
- `name`: `string`
- `at_ms`: `number` (when it was switched off)
- `links_count`: `number` (the links Hanger removed and will put back)
- `interrupted`: `boolean` (Hanger stopped partway through switching it off or on; switching it on finishes the job)
- `back_in_store`: `boolean` (a skill of that name is in the store again, so switching this one on refuses with `already_there`)

### Response Example
```json
{
  "skills": [
    {
      "key": "kept-skill:00000000-0000-4000-8000-000000000001",
      "name": "figma",
      "at_ms": 1795566217263,
      "links_count": 1,
      "interrupted": false,
      "back_in_store": false
    }
  ],
  "count": 1
}
```
