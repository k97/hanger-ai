# Hanger Scan Engine Documentation

This document describes the design, behaviour, and rules of the Hanger v1 scan engine backend.

---

## 1. Directory Traversal

The Hanger scanner walks linked root directories recursively. It ensures high performance and security by following these rules:
- **Git Ignore Compliance:** Respects `.gitignore` rules using the `ignore` crate.
- **Excluded Directories:** Never descends into `node_modules` or `.git` directories.
- **Privacy Gating:** Never reads, copies, or logs the contents of `.env` files. Missing credentials are only checked by key name.

---

## 2. Skills Detector

A Skill is identified as a folder containing a `SKILL.md` file.

### Identification Criteria
- **File Name:** `SKILL.md` (case-sensitive).
- **Structure:** Must contain a YAML frontmatter block enclosed in triple dashes (`---`).
- **Required Fields:**
  - `name`: string
  - `description`: string
- **Optional Fields:**
  - `version`: string (falls back to `v0.0.0-draft` if absent).
  - `source-origin`: string (alias: `source_origin`).

### Parse Warning Logic
- If the YAML frontmatter is malformed or missing any required fields, the scanner **does not panic or fail**.
- A warning message containing the file path and parse error is appended to the project's `parse_warnings` array, and the scan continues.

---

## 3. Rules Detector

A Rule is a file matching our standard known rules filename list.

### Known Rules List
The following exact filenames match case-sensitively:
- `CLAUDE.md`
- `AGENTS.md`
- `GEMINI.md`
- `.cursorrules`
- `copilot-instructions.md`
- `.windsurfrules`

### Rules Layering and Ordering
- Rules are detected at the project root and within all subdirectories.
- Multiple rules of the same family (e.g. two `AGENTS.md` files) are grouped into a chain.
- The chain is ordered from **root to deepest** (closest to code wins).
- If any rule family contains more than one file inside the linked root, the project's scan result is flagged with **`layered: true`**.
- Merging or precedence resolution of rules is not performed by the backend scan; the list chain is returned in full for UI consumption.

---

## 4. Agents Detector

Agents are detected based on the presence of their known configuration root paths on the local machine (not via active process tracking).

### Agent Config-Root Mapping

| Agent Engine | Global Home Config Root | Per-Project Footprint |
|---|---|---|
| **Claude Code** | `~/.claude/` or `~/.config/claude/` | `.claude/` |
| **Codex** | `~/.codex/` | `.codex/` |
| **Gemini / Antigravity** | `~/.gemini/` | `.agents/` |

- **Home directory expansion (`~`):** Resolved dynamically at runtime using the host OS home directory variables.
- **Project Footprints:** Discovered within linked directory roots during walk scanning.

---

## 5. Scope Semantics

Hanger assets carry a strict scope classification to indicate whether they are machine-global configurations or project-specific:

- **Global Scope (`Global { agent }`):**
  - Attached directly to a specific Agent engine, representing a computer-wide setup.
  - Sourced from the Agent's global config root directory (e.g., `~/.claude/settings.json`).
- **Project Scope (`Project { agent, root }`):**
  - Attached to a specific linked project root directory.
  - Sourced from the project's internal files (e.g., `[project-root]/CLAUDE.md`) or Agent project footprints (e.g., `[project-root]/.claude/settings.json`).

---

## 6. Tools Detector

Tools represent MCP, stdio, or API client endpoints.

### Target Files
Discovered in the following config files:
- `mcp.json`
- `.mcp.json`
- `mcp_config.json`
- `config.toml`
- `settings.json` (only if it contains an `mcpServers` key)

### Normalisation
Config files from different engines are unified into the single `Tool` domain type:
- `name`: the tool identification name.
- `command`: the executable command or script (falls back to `"internal"` for basic flat definitions).
- `transport`: resolved to `"stdio"` if a command is run locally, or `"http"` / `"sse"` if an online URL endpoint is resolved.
- `scope`: mapped to Global or Project depending on where the config file is stored.
- `owning_agent`: identifies which agent config root the tool belongs to (falls back to `"unknown"` if loose in a project).

---

## 7. Secret Hygiene

To guarantee security in developer environments, Hanger enforces the following absolute constraints:
- **No Value Storage:** Environment variable *values*, API keys, tokens, or headers are never captured in memory or written to domain structs.
- **Environment Names:** Only variable *names* (keys) are read to support env-presence checklists.
- **URL Credentials Masking:** Embedded URL credentials (e.g. `username:password` userinfo) and query parameters (e.g., `?api_key=123`) are stripped from stored transport endpoints.
- **Log and Error Protection:** Under no circumstances will a credentials string or user-specific secret appear in logs, error payloads, panic backtraces, or database stores.

---

## 8. Broad Root Exclusions & Guardrails

To prevent performance degradation (indefinite spinners or freezing) when linking very large workspaces or home directories:
- **Exclusion List:** Traversal automatically skips system and cache directories on all platforms (macOS-aware):
  - `Library/`
  - `.Trash/`
  - `.cache/`
  - `Caches/`
  - `.npm/`
  - `.cargo/registry/`
  - `.rustup/`
  - `.pnpm-store/`
  - plus standard `node_modules/` and `.git/` folders.
- **Broad Root Detection:** A root directory is classified as broad if it matches the current user's `$HOME` path or contains more than 50 first-level child entries.
- **Confirmation Dialog:** The user is prompted with a confirmation dialog before linking a broad root, advising them to link specific project folders instead.
- **Capped Traversal Depth:** If a broad root is linked, the traversal walk is strictly capped at **6 levels deep**. Deeper paths are skipped, and a warning is added to the project's `parse_warnings` log:
  `"Scan depth capped at 6 levels for broad root directory. Deeper folders skipped."`

---

## 9. Drift Hashing Size Limits

Drift checking calculates `blake3` file content checksums for hard-copy deployments to verify version alignment.
- **Target Size Cap:** Files larger than **10MB** are excluded from hashing.
- **Drift Warning Log:** Large files skip checksum calculation and log a warning in `parse_warnings`:
  `"Skipped drift check: File <path> exceeds the size limit (10MB)."`

---

## 10. Rules Section Splitting

To support interactive section-by-section diff merging, Rule files are parsed and split into distinct blocks:
- **Heading Boundaries:** Standard Markdown heading lines starting with `#` characters (e.g. `# Title`, `## Subheading`) define section boundaries. A valid heading line must be immediately followed by a space or the end of the line.
- **Preamble Handling:** Any content preceding the first heading in the file is compiled into a `Preamble` block (with `heading: null` and `heading_level: 0`).
- **Heading-Free Rules (e.g. `.cursorrules`):** Files containing only plain text or no headings are parsed in their entirety as a single `Preamble` section.
- **Merge Compilation:** The frontend compiles choices for each aligned section (Source vs. Target vs. Excluded) and sends the concatenated payload back to be written transactionally.
