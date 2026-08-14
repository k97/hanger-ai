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
