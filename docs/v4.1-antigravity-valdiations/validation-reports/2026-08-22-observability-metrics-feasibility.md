# Feasibility Gap Analysis: Master Observability Metrics

Based on a review of Hanger's current Rust architecture (`src-tauri/src/domain.rs`, `scanner.rs`, `mcp/`), here is the gap analysis for the 10 data points requested from the brainstorming session.

Hanger is built primarily as a static configuration parser and symlink manager. Metrics that rely on static ASTs, file states, and basic process inspection are feasible. Metrics that require runtime orchestration or deep semantic analysis face significant architectural blockers.

### ✅ 100% Feasible Today (No Backend Changes Needed)

These metrics can be populated immediately by just querying existing Rust structs and passing the aggregated counts to the frontend payload.

*   **System Fragmentation (Canonical vs Shadow):** Hanger's `HydratedLink` and `LinkState` enums already classify every asset as `Linked` (Canonical) or `Foreign` (Shadow/Unmanaged).
*   **Version Drift Alert:** Hanger hashes all files (`source_hash`, `dest_hash`) and `SkillFrontmatter` already extracts the `version`. Detecting divergence across engine roots is an existing capability.
*   **Orphaned Context:** Hanger's Reach system (`annotations.rs`) computes which engines track which skills. An "Orphan" is trivially identified as a skill with an empty reach list.
*   **Namespace Health (Collisions):** Hanger records discovered MCP tools in SQLite. A simple query (`SELECT name FROM mcp_tools GROUP BY name HAVING count(*) > 1`) detects collisions across servers.

---

### 🟡 Feasible but Requires Backend Work (Medium Gap)

These require modifying Hanger's parsers (`scanner.rs` or `probe.rs`) to retain data they currently discard.

*   **Privilege Audit (Unsandboxed):**
    *   **The Gap:** Hanger parses `SKILL.md` frontmatter, but doesn't parse the markdown body for `BypassSandbox`. For MCPs, `mcp/probe.rs` extracts the `name` and `description` into `ProbedTool`, but drops the `inputSchema` where privileges would be declared.
    *   **The Fix:** Modify the parser to scan skill bodies, and update the MCP probe to parse/store specific security flags from the JSON schema.
*   **Static Schema Footprint:**
    *   **The Gap:** Hanger discards the raw JSON payload size after probing an MCP server.
    *   **The Fix:** Add a byte/token counter in `probe.rs` before dropping the `tools/list` schema, and store a `schema_weight` column in the SQLite DB.
*   **Active Workspace Globs:**
    *   **The Gap:** The `Rule` struct stores raw file `content`, but does not extract or index the `glob` patterns from `.cursorrules` or `.mdc` frontmatter.
    *   **The Fix:** Update the rule parser to extract and count glob array lengths.

---

### 🔴 Architecturally Blocked (Very High Gap)

These metrics conceptually violate Hanger's role as a local harness interface and would require massive scope creep.

*   **Rule Conflict Index:**
    *   **The Gap:** Hanger can merge rule sections (`ParsedRuleMergeData`), but detecting *conflicts* requires semantic analysis of overlapping globs and contradictory natural language directives. This is beyond a static file manager.
*   **Active Computations & Pool Saturation (Subagents):**
    *   **The Gap:** Hanger inspects static assets and background MCP processes via `sysinfo` (`mcp/observe.rs`). It does *not* supervise LLM subagents. The subagent thread pools are managed inside the memory of the host engines (Claude Code, Cursor, Zed, etc.).
    *   **The Fix:** Impossible to build reliably unless all 11 engines agree on a standard local IPC protocol to broadcast their live orchestration states to Hanger.
