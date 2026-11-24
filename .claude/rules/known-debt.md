# Known debt

Carried from `AGENTS.md` (archived 2026-08-16); each item checked against the
tree that day. `docs/findings.md` holds the longer record of defects
deliberately left unfixed.

- `project_footprints` (the Agent type) still carries retired vocabulary
  across ten files in `src/`, `src-tauri/src/` and `src-tauri/tests/`.
  Rename to `project_paths`, or drop it with the Agent type, the next time
  that pane area is reworked. Not user-visible.
- Sixteen counting sites are enumerated in `docs/diagnostics/count-paths.md`.
  Consolidating them precedes building any new counting surface. The same
  diagnostic attributes a 1-asset delta to "client-side deduplication in
  RepoPane.tsx" with no line quoted — unproven; resolve alongside.
- Resolved: `get_inventory` once omitted rows with `parse_status = 'failed'`
  while `get_asset_counts` counted them. Failed assets are assets;
  `scanner_tests.rs::test_inventory_failed_assets_returned` and
  `::test_count_assets_failed_parse_rows_included` pin both sides.
- The scan warnings panel once showed 10 warnings for a root with 9 failed
  rows — a warning from another scope leaking into a project-scoped panel.
  Not re-verified since it was recorded.
- Non-blocking diagnostics use `DisclosureBanner`. Do not build a new banner,
  alert, or modal for warnings, parse errors, or status notices. The rule has
  no detector (`.claude/DESIGN.md`, "Not implemented"); the link map's notice
  card is a stated exception, and `docs/findings.md` discusses amending the
  rule.
- `transactional::write_transactional` keeps its backups in the relative
  path `.hanger/backups`, which resolves against the process's working
  directory, not the target's folder or the app's data directory. It has
  three call sites, all in `lib.rs`: two in `execute_deploy` (the symlink
  deploy and the copy deploy) and one in `execute_deploy_merged_rule`.
  Nothing under `src-tauri/src/` sets the working directory, so where a
  deploy's backup lands depends on how the app was started;
  `docs/plans/2026-11-24-context-control.md` (Task 4) gives that as `/` for
  an app opened from Finder, which was not measured for this entry.
  `docs/findings.md` F51 records the same path from the test side. Recorded
  2026-11-24 and not fixed: `transactional.rs` is unchanged. The config
  writer added that day, `mcp::switch::apply`, takes its backups folder as
  a parameter and refuses one that is not absolute.
