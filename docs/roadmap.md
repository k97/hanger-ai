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
- **Two residual credential shapes the process-side redactor still misses.**
  `mcp::observe::redact` works from a flat command line recovered from the
  process table, so it cannot see argument boundaries the way its config-side
  sibling can. Two shapes survive it, both found by review and both predating
  the header fix in `140e119`. First: a header *value* that itself begins with
  `-` — plausible, since base64url tokens can — exits header mode and is pushed
  verbatim, as in `--header X-Api-Key: -abc123secret`. Second: a secret flag
  with no value immediately followed by a header flag, as in
  `--api-key --header Authorization: Bearer <token>`; the `--header` word is
  consumed as the api-key's redacted value, header mode never arms, and the
  token that follows leaks. Both reach ProfilePane's undeclared-servers
  disclosure. Fixing either by widening the exit condition costs
  over-redaction of ordinary flags after a header, which is the safe direction
  but wants a deliberate ruling rather than a reflex.
