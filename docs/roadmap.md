# Roadmap

Deferred work, with the reason it was deferred. Written 2026-08-17 alongside the
MCP detector's stage 1.

## MCP

- **Continue's registry row.** Its config was verified upstream —
  `~/.continue/config.yaml`, YAML, top-level `mcpServers` — and the parser can
  already report it honestly via `Dialect::Unsupported`. The row is not added
  because `src/__tests__/brand-coverage.test.ts` requires every id in
  `registry.rs`'s `HOSTS` to resolve to a mark in `src/data/brands.ts`, and a
  mark needs a sourced SVG, a licence and provenance entry in
  `src/assets/brand/SOURCES.md`, and a sprite registration. Two lines the day a
  Continue mark lands.
- **Windows and Linux config locations.** `registry.rs`'s `SOURCES` carries
  macOS paths only. Hanger ships macOS-only today; rows for other platforms
  would be untested paths in a binary that never runs there.
- **OAuth for remote servers.** Ships as an `Auth soon` state only. Open
  question when it lands: does Hanger hold tokens, or observe host authorisation
  and deep-link out? Leaning observe-only — "authorised in Cursor, not in Claude
  Code" is a finding no single host can report.
- **Tool-list diffing on reload.** `github: 26 → 31 tools, 5 added` beats a
  blind reload. Enabled by keying probe results on the launch rather than the
  server name.
- **Register in… and Reconcile.** The list diagnoses conflicts it cannot fix.
  Propagation, not authoring.
- **Not building New MCP Server.** Every host ships it; authoring configs means
  modelling a dozen dialects and makes Hanger the thirteenth way to do the thing
  it exists to document.
- **Plugin-supplied servers.** Reconciling one by hand is undone at the next
  plugin update. Needs a ruling on exclusion from Reconcile.
- **Bridge registry growth.** `registry.rs`'s `BRIDGES` holds `mcp-remote`,
  today's common wrapper. Others will appear; adding one is a row.
- **Divergence detection is blind to remote servers.** The check compares launch
  strings, and a remote server's launch is empty — its endpoint lives in
  `transport`, which the check never reads. Two registrations pointing at
  different URLs read as agreeing. `sanitise_url` also drops the entire query
  string, so `?region=eu` versus `?region=us` compares equal. Both predate this
  work; the fix belongs with a launch normaliser that compares transport too.
- **Two spellings of one asset path, latent.** `upsert_asset` preserves its
  caller's spelling by design (`preferences.rs:1275`): it canonicalises, then
  undoes the `/private` prefix only when the caller had not already asked for
  it. That straddle is load-bearing — `record_walk_symlink` looks assets up by
  exact match on an `fs::canonicalize` path, while the tracked-copy watcher and
  link resolution use raw walk paths. Imposing one policy breaks one or the
  other: stripping `/private` unconditionally fails three tests in
  `asset_annotations_tests`, keeping `fs::canonicalize` output fails four in
  `scanner_tests`. Both measured 2026-08-18.

  The cost is that two callers passing different spellings of one file would
  write two rows. The scanner has two such callers — the per-agent sweep
  pre-canonicalises (`scanner.rs:890`), the registry pass does not (`:1280`) —
  and instrumenting both against a real home showed they are **not disjoint**:

  ```
  site A: 5   site B: 24   INTERSECTION: 5
  [DISJOINT] site=A fresh=true  ~/.codex/config.toml:tauri
  [DISJOINT] site=B fresh=false ~/.codex/config.toml:tauri
  ```

  `fresh=false` is why nothing is broken today: `seen_registrations`
  (`scanner.rs:767`) is keyed on the raw pair and shared by every write site,
  so the second insert collides and that site skips. The divergence is latent,
  held latent by an ordering dependency — pinned since 2026-08-18 by
  `mcp_scanner_tests::one_registration_is_one_row_however_many_passes_reach_it`.

  Not fixed by converging the write sites: forcing the registry pass to
  pre-canonicalise flips `abs_path` for the 19 registrations only it sees, and
  since `upsert_asset` matches on that column, the old rows are orphaned rather
  than updated — while reaping is off by default. A data migration to repair a
  defect that is not occurring.
- **Repo-scoped MCP grouping.** `get_mcp_servers` calls `discover_machine`
  only; there is no repo-scoped equivalent. `RepoPane` therefore receives
  machine-global rows it cannot use — rendering them would put every server
  on the machine inside one repository's view — so its Tools section stays
  per-registration, and `fetchRepoCounts` deliberately does not pass the
  active grouping to `get_asset_counts`, keeping that pane's header and rows
  in agreement with each other (the global path, `refreshGlobalCounts`,
  passes grouping in both). The pieces to close this exist: `discover_repo`
  and `group_servers` are both shipped and already tested. Deferred anyway
  (Task 7 of the mono-tight MCP list, 2026-08-18) because adding a command
  was unasked Rust scope mid-plan; the choice was between a feature gap
  across two panes and a correctness gap where a header contradicts its own
  rows, and the correctness gap was the one removed. Done looks like: a
  `get_repo_mcp_servers` command (`discover_repo` + `group_servers`,
  mirroring `get_mcp_servers`), `RepoPane` rendering grouped rows from it,
  and `fetchRepoCounts` passing the active grouping the way
  `refreshGlobalCounts` already does.
