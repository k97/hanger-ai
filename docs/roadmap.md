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

## Reach is gated after declaration — Hanger shows the gate as open

Recorded 2026-08-27. Three mechanisms sit between a declared registration and
an engine actually loading it, and the Reach column models none:

- Claude Code holds `.mcp.json` servers at "Pending approval" until accepted
  in an interactive session (observed on this machine via `claude mcp list`,
  2026-08-27).
- Codex ignores a project `.codex/config.toml` unless the project has
  `trust_level = "trusted"`.
- A deployed `managed-mcp.json` takes exclusive control: every other source is
  suppressed, including plugin servers, and `allowedMcpServers` /
  `deniedMcpServers` in managed settings filter what remains
  (code.claude.com/docs/en/managed-mcp). **Hanger reads that file as of
  2026-08-27 but still lists the suppressed sources as reaching** — shipped
  knowingly on Karthik's ruling that day, with the gap recorded here rather
  than blocking the read.

Also outside registry reach entirely: MDM-delivered policy (the
`com.anthropic.claudecode` preference domain) and server-managed settings from
the claude.ai console, where no local config file exists. The
`ClaudeAiConnectors` breadcrumb (`registry.rs`) is the precedent for naming a
non-file source honestly. This is a design question for the Reach column, not
a registry row, and needs a naming brief per `ui-copy.md` before any state
label ships.

**Open question, NOT verified 2026-08-27**: gemini-cli's enterprise
documentation may describe a system *defaults* file alongside the system
settings file at `/Library/Application Support/GeminiCli/` — distinct from
the system settings row this branch already added. Nobody has fetched that
doc to confirm the file exists or that it can carry `mcpServers`; if it can,
it would be a sibling gap to the one above. Flagged here as something to
check, not a confirmed finding.

## Config-directory env vars: honoured, with one ceiling

Updated 2026-08-28. `CLAUDE_CONFIG_DIR` and `CODEX_HOME` are now honoured for
all four asset kinds through one chokepoint, `agents::engine_base` — agent
detection and MCP source resolution both call it, so a relocated directory
cannot be followed for tools and missed for skills.

`CLAUDE_CONFIG_DIR` relocating `.claude.json` is measured, not inferred: with
the variable set, `claude mcp list` returned a server declared in
`$DIR/.claude.json` and stopped returning those in `~/.claude.json`, so the
variable substitutes rather than adding a search root.

**Ceiling, unfixed by design.** Hanger reads only its own process environment.
Launched from Finder it inherits launchd's, not the user's shell, so a
variable exported in `~/.zshrc` is invisible and the un-relocated path is
scanned. Reading shell init files to reconstruct the environment is guesswork
with its own failure modes and was not attempted.

**Not covered:** `GEMINI_CLI_SYSTEM_SETTINGS_PATH`, which relocates a
system-absolute path rather than a home-relative one and needs a different
mechanism; and `XDG_CONFIG_HOME`, which affects the Linux layout this
macOS-only app does not ship.

## No help surface, and one homeless sentence waiting for it

Recorded 2026-08-28. Hanger has no help, about or terms screen. The rail's
gear opens "Hanger Settings & Maintenance" (`App.tsx`, the settings modal),
which is an export/import dialog for the local store — not a place for
explanatory text about how the harness behaves.

This surfaced when the Contents card's "Only SKILL.md is read into context"
line was removed from the inspector (Karthik's ruling, 2026-08-28: it is a
fact about the harness, not about the asset on screen, so the panel was
restating it on every asset opened). The fact itself now lives in
`docs/harness.md` under the conventions the code encodes, which is the right
home for the model but reaches no user of the app.

Whoever builds the help surface: that sentence is the first thing that
belongs in it, and it is unlikely to be the only one. The Context ledger's
own caveat — "Token figures are bytes divided by four. Every engine
tokenises differently, so treat them as a size, not a count."
(`AssetDetail.tsx`, `CONTEXT_NOTE`) — is the same shape, currently behind an
`InfoPopover` on every asset, and would move there too.

Deliberately not built as part of the provenance work: a help screen is
product work with its own naming and copy decisions under `ui-copy.md`, not
somewhere to tuck a line that had nowhere else to go.
