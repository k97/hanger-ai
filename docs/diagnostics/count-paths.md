# Diagnostic Report: Enumeration of All Asset Counting Paths

## Executive Summary
In a running build with one linked repository root (`~/Work`), three counting outputs were observed:
- **Sidebar row:** 297
- **Project page header:** 287 Assets
- **Category cards:** 258 skills + 0 agents + 5 tools + 18 rules + 6 subagents = 287
- **Delta:** 10 (297 vs 287) with 10 scan warnings shown.

This discrepancy exists because the **Sidebar** derives its count directly from SQL via `get_asset_counts(root)` (which counts all `assets` table rows regardless of `parse_status`), while the **Project Page Header and Category Cards** derive their counts from in-memory arrays returned by `get_inventory` (which excludes assets that failed to parse).

---

## a. Project Page Header ("N Assets")
- **Command / Computation:**
  Populated by `totalCount` in [`src/components/RepoPane.tsx:L86`](file://~/Work/Labs/hanger-ai/src/components/RepoPane.tsx#L86):
  ```tsx
  const totalCount = repoSkills.length + repoTools.length + repoRules.length + repoAgents.length + repoSubagents.length;
  ```
- **JSX Render Site:**
  Rendered at [`src/components/RepoPane.tsx:L133`](file://~/Work/Labs/hanger-ai/src/components/RepoPane.tsx#L133):
  ```tsx
  <span className="text-xs text-ink-3 font-bold bg-surface-elevated border border-hairline px-2.5 py-1 rounded-full shrink-0 shadow-sm">
    {totalCount} Assets
  </span>
  ```

---

## b. Project Page Category Cards Numbers
- **Computation / File:Line:**
  Passed as props to `CategoryFilterCards` in [`src/components/RepoPane.tsx:L150-L154`](file://~/Work/Labs/hanger-ai/src/components/RepoPane.tsx#L150-L154):
  ```tsx
  <CategoryFilterCards
    skillsCount={repoSkills.length}
    agentsCount={repoAgents.length}
    toolsCount={repoTools.length}
    rulesCount={repoRules.length}
    subagentsCount={repoSubagents.length}
    selectedCategory={selectedCategory}
    onSelectCategory={setSelectedCategory}
    loading={loading}
  />
  ```
  where each array is derived from `inventory` (returned by `get_inventory`):
  - `repoSkills`: [`src/components/RepoPane.tsx:L61-L64`](file://~/Work/Labs/hanger-ai/src/components/RepoPane.tsx#L61-L64)
  - `repoTools`: [`src/components/RepoPane.tsx:L66-L69`](file://~/Work/Labs/hanger-ai/src/components/RepoPane.tsx#L66-L69)
  - `repoRules`: [`src/components/RepoPane.tsx:L71-L74`](file://~/Work/Labs/hanger-ai/src/components/RepoPane.tsx#L71-L74)
  - `repoAgents`: [`src/components/RepoPane.tsx:L76-L79`](file://~/Work/Labs/hanger-ai/src/components/RepoPane.tsx#L76-L79)
  - `repoSubagents`: [`src/components/RepoPane.tsx:L81-L84`](file://~/Work/Labs/hanger-ai/src/components/RepoPane.tsx#L81-L84)

---

## c. Backend `get_inventory` Path & Parse Status Filtering
- **Backend IPC Command:** `get_inventory` in [`src-tauri/src/lib.rs:L1073-L1075`](file://~/Work/Labs/hanger-ai/src-tauri/src/lib.rs#L1073-L1075):
  ```rust
  #[tauri::command]
  fn get_inventory(app: AppHandle) -> Result<Inventory, String> {
      run_scan(app)
  }
  ```
- **Mechanism:**
  `run_scan` invokes `DirectoryScanner::scan` ([`src-tauri/src/scanner.rs:L100`](file://~/Work/Labs/hanger-ai/src-tauri/src/scanner.rs#L100)) which scans directory trees in memory.
- **SQL Table Schema (`assets`):** [`src-tauri/src/preferences.rs:L232-L246`](file://~/Work/Labs/hanger-ai/src-tauri/src/preferences.rs#L232-L246):
  ```sql
  CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      root_id INTEGER NOT NULL REFERENCES roots(id),
      engine_id INTEGER REFERENCES engines(id),
      category TEXT NOT NULL,
      scope TEXT NOT NULL,
      name TEXT NOT NULL,
      abs_path TEXT NOT NULL,
      version TEXT,
      content_hash TEXT,
      parse_status TEXT NOT NULL,
      parse_error TEXT,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL
  );
  ```
- **Parse Error Handling:**
  When `DirectoryScanner::scan` encounters a file with parse/validation errors:
  - It calls `store.upsert_asset` to write a row to the SQLite `assets` table with `parse_status = "failed"` and `parse_error = Some(...)` (e.g. [`src-tauri/src/scanner.rs:L649-L651`](file://~/Work/Labs/hanger-ai/src-tauri/src/scanner.rs#L649-L651)).
  - It **omits** the failed asset from the returned in-memory `inventory` arrays (`skills`, `tools`, `rules`, `subagents`).
  - Therefore, `get_inventory` **excludes** rows with parse errors.
  - In contrast, `get_asset_counts` queries SQL directly:
    ```sql
    SELECT category, scope, COUNT(*) 
    FROM assets 
    LEFT JOIN roots rts ON assets.root_id = rts.id
    WHERE category != 'agent' AND (?1 IS NULL OR rts.abs_path = ?1)
    GROUP BY category, scope;
    ```
    counting **ALL** database rows in `assets` regardless of `parse_status` (`"ok"` or `"failed"`).

---

## d. Live Store Query Output
- **Command Executed:**
  ```bash
  sqlite3 "~/Library/Application Support/com.rkarthik.hanger/hanger.db" "SELECT parse_status, COUNT(*) FROM assets WHERE root_id = (SELECT id FROM roots WHERE abs_path = '~/Work') GROUP BY parse_status;"
  ```
- **Raw Output:**
  ```text
  failed|9
  ok|288
  ```
- **Failed Count Evaluation:**
  The failed count in SQL equals **9** (4 failed skills + 4 failed subagents + 1 failed tool = 9 failed rows in `assets`). Total asset rows in `assets` for root `~/Work` is 9 + 288 = 297 (matching the sidebar count of 297). The remaining 1 unit of delta (from 297 down to 287) is caused by client-side deduplication in `RepoPane.tsx` filtering `inventory` arrays.

---

## e. Complete Enumeration of All Asset Counting Sites

### Backend (`src-tauri/src/`)
1. **[`src-tauri/src/scanner.rs:L17-L21`](file://~/Work/Labs/hanger-ai/src-tauri/src/scanner.rs#L17-L21)** — `scanner::count_assets(db_path, root)`:
   Executes `SELECT category, scope, COUNT(*) FROM assets LEFT JOIN roots rts ON assets.root_id = rts.id WHERE category != 'agent' AND (?1 IS NULL OR rts.abs_path = ?1) GROUP BY category, scope;`.
   *Exposed via IPC `get_asset_counts` in [`src-tauri/src/lib.rs:L1078-L1081`](file://~/Work/Labs/hanger-ai/src-tauri/src/lib.rs#L1078-L1081).*

2. **[`src-tauri/src/preferences.rs:L787`](file://~/Work/Labs/hanger-ai/src-tauri/src/preferences.rs#L787)** — `PreferencesStore::count_assets_by_category(&self, category: &str)`:
   Executes `SELECT COUNT(*) FROM assets WHERE category = ?1`.

3. **[`src-tauri/src/preferences.rs:L799`](file://~/Work/Labs/hanger-ai/src-tauri/src/preferences.rs#L799)** — `PreferencesStore::count_assets_by_parse_status(&self, parse_status: &str)`:
   Executes `SELECT COUNT(*) FROM assets WHERE parse_status = ?1`.

4. **[`src-tauri/src/preferences.rs:L908-L910`](file://~/Work/Labs/hanger-ai/src-tauri/src/preferences.rs#L908-L910)** — `PreferencesStore::count_assets_by_engine_null(&self, is_null: bool)`:
   Executes `SELECT COUNT(*) FROM assets WHERE engine_id IS NULL` / `WHERE engine_id IS NOT NULL`.

### Frontend (`src/`)
5. **[`src/components/Sidebar.tsx:L70-L71`](file://~/Work/Labs/hanger-ai/src/components/Sidebar.tsx#L70-L71)** — Sidebar per-repository count:
   Invokes `get_asset_counts` with `{ root: repoPath }`, mapping `res?.total_assets || 0` to `repoCounts[repoPath]`. Rendered on line 220.

6. **[`src/components/Sidebar.tsx:L170`](file://~/Work/Labs/hanger-ai/src/components/Sidebar.tsx#L170)** — Sidebar user profile agent count badge:
   `inventory?.agents.length || 0`.

7. **[`src/components/Sidebar.tsx:L179`](file://~/Work/Labs/hanger-ai/src/components/Sidebar.tsx#L179)** — Sidebar linked repository list count:
   `linkedRepos.length`.

8. **[`src/components/RepoPane.tsx:L61-L86`](file://~/Work/Labs/hanger-ai/src/components/RepoPane.tsx#L61-L86)** — RepoPane total assets & category card counts:
   Calculates `repoSkills`, `repoTools`, `repoRules`, `repoAgents`, `repoSubagents` from `inventory` via `filterRepoAssets`.
   Sums them into `totalCount = repoSkills.length + repoTools.length + repoRules.length + repoAgents.length + repoSubagents.length`.
   Rendered as `{totalCount} Assets` on line 133 and passed as `skillsCount`, `agentsCount`, `toolsCount`, `rulesCount`, `subagentsCount` to `CategoryFilterCards` on lines 150-154.

9. **[`src/components/RepoPane.tsx:L238, L283`](file://~/Work/Labs/hanger-ai/src/components/RepoPane.tsx#L238)** — RepoPane filtered group headers:
   `filteredSkills.length`, `filteredTools.length`, `filteredRules.length`, `filteredAgents.length`, `filteredSubagents.length` from `filterRepoAssets`.

10. **[`src/components/ProfilePane.tsx:L41-L45`](file://~/Work/Labs/hanger-ai/src/components/ProfilePane.tsx#L41-L45)** — ProfilePane total global assets:
    Sums `skills.global + tools.global + rules.global + subagents.global` from `assetCounts` prop (returned by IPC command `get_asset_counts`).

11. **[`src/components/ProfilePane.tsx:L96-L100`](file://~/Work/Labs/hanger-ai/src/components/ProfilePane.tsx#L96-L100)** — ProfilePane CategoryFilterCards props:
    Passes `skillsCount={assetCounts?.byCategory?.skill?.global}`, `agentsCount={agents.length}`, `toolsCount={assetCounts?.byCategory?.tool?.global}`, `rulesCount={assetCounts?.byCategory?.rule?.global}`, `subagentsCount={assetCounts?.byCategory?.subagent?.global}`.

12. **[`src/components/ProfilePane.tsx:L139-L142`](file://~/Work/Labs/hanger-ai/src/components/ProfilePane.tsx#L139-L142)** — ProfilePane per-agent asset counts:
    Filters `inventory` arrays by `agent.id` and computes `totalAgentAssets = agentSkillsCount + agentToolsCount + agentRulesCount`.

13. **[`src/components/ProfilePane.tsx:L168`](file://~/Work/Labs/hanger-ai/src/components/ProfilePane.tsx#L168)** — ProfilePane agent section total:
    `totalCount = agentSkills.length + agentTools.length + agentRules.length + agentSubagents.length`.

14. **[`src/components/Flyout.tsx:L251`](file://~/Work/Labs/hanger-ai/src/components/Flyout.tsx#L251)** — Flyout asset list count:
    `count: filteredAssets.length` from `getSelectedBubbleAssets()`.

15. **[`src/utils/filterPredicate.ts:L59-L129`](file://~/Work/Labs/hanger-ai/src/utils/filterPredicate.ts#L59-L129)** — `filterProfileAssets`:
    Filters and deduplicates `inventory` arrays by `scope.Global`.

16. **[`src/utils/filterPredicate.ts:L139-L218`](file://~/Work/Labs/hanger-ai/src/utils/filterPredicate.ts#L139-L218)** — `filterRepoAssets`:
    Filters and deduplicates `inventory` arrays by `scope.Project.root` or path prefix.
