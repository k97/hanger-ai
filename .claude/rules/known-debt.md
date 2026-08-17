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
