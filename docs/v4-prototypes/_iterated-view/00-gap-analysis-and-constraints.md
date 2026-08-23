# v4 prototypes — gap analysis, constraints, iteration strategy

Written 2026-08-22 against local `main` at `7a91c9b`. Every claim about
the code cites the file that makes it true; every claim about a prototype
cites the file it was read from. The Antigravity validation reports under
`docs/v4.1-antigravity-valdiations/` were read and re-checked; where they
and the code disagree, the code is recorded and the disagreement is
flagged (§1.4).

Three design surfaces are explored across eleven HTML files:

| Family | Files | What it proposes |
|---|---|---|
| **Banner** | `banner-iteration/1.Master Observability Banner.html`, `2.polymorphic_banners.html`, `observability_banners.html` | A hero that changes shape with the selected category chip and carries per-category telemetry: fragmentation, version drift, token tax, activity, privilege audit, rule globs, subagent pool saturation |
| **Inspector panels** | `inspector-panels/mcp-panel/*.html`, `skill-panel/*.html` | A 380px panel, floating (glass) or docked, with tabs (`Tools · Details`, `Content · Details`), health boxes (context bloat, namespace collisions, privilege boundaries), identity, transport, links, reach |
| **Map** | `mapview/map_upgraded.html`, `map_panel_{canonical,engine,project}.html` | A three-column topology with search, filters (All / Errors only / Orphans), hover-focus dimming, numeric badges on nodes, engine→project edges; and tabbed placecards per node kind |

---

## 1. Gap analysis and feasibility

### 1.1 What is already built

More of the explorations exists than the explorations assume. Checked in
the running app (`tauri dev`, screenshots in this session) and the code:

- **The strip.** `SummaryStrip.tsx` is the hero: 32px backend-owned total,
  subtitle, scan age, `GelMeter`, a four-state legend that filters, Rescan,
  and a `Review N →` pill gated on a real count. Flat on the page by ruling
  (`SummaryStrip.tsx:81-83`). The category chips are `CategoryFilterCards`.
- **The inspector** is a docked 384–480px `<aside>` (`App.tsx:1617-1626`,
  pinned by `inspector_avionics.test.tsx`), with `Flyout` routing five
  bodies. `AssetDetail` already shows state line, path chip with Copy and
  Reveal, Link to… / Open in editor, a facts `<dl>` (Engine, Scope, Origin,
  Version, **Size**, **Allowed tools** — the last two measured from the
  body text, `AssetDetail.tsx:89-94`, `:198`), **Reach grouped by three
  verdicts** ("Reaches it", "Root not linked", "Another engine's format" —
  one more verdict than the prototype draws), and Preview/Source document
  tabs. `McpServerDetail` already shows Identity (verified age, server
  version, protocol, capabilities), Registered in (host, tier, config path,
  redacted launch, tool count, running pid), Tools (probed list, Check
  again), Environment (names only).
- **The map** (`LinkMapPane.tsx`, `linkMapLayout.ts`, `linkMapCamera.ts`)
  is three sorted columns, bézier edges with mechanism in the dash and
  state in the colour, edge labels ("2 symlinks"), a legend built from the
  same enums the renderer matches on, a layers panel (Projects), a notices
  control with an unread dot, zoom/pan/fit, and a 300px docked
  `LinkMapPlacecard` with node, edge and notices bodies — the one surface
  in the app carrying the one elevation.

So the question for each exploration is not "can this be built" but "what
does it add, and is the data real".

### 1.2 Datum-by-datum feasibility

Verdicts: **Have** (in the payload today) · **Derivable** (frontend may
derive it without counting) · **Backend** (new field/command; size given)
· **Not in model** (nothing on disk or in the harness model records it) ·
**Blocked** (contradicts a ruling or the app's premise).

#### Banner family

| Prototype datum | Where it comes from today | Verdict |
|---|---|---|
| Total per scope; per-category counts | `count_assets` → `AssetCounts` (`scanner.rs:23`, `domain.rs:372-381`) | **Have** |
| linked / drifted / broken / local split | `linkStateCounts.ts` loops over annotations; total stays backend-owned (`:102-105`) | **Have** |
| Scan age ("2m ago") | `lastScanAt` set on `scan://complete` (`App.tsx:664-685`); the backend stores no scan time | **Have** (frontend) |
| "7 engines" | `detectedEngines` (`get_detected_engines`) | **Have** |
| "16 host configs read" | `mcpCoverage.checked_file_count` (`mcp/discover.rs:103-123`) | **Have** |
| Tools per engine, answered / not asked / can't ask | `McpEngineSummary` (`mcp/engine_summary.rs:92-109`) — rendered today only in the inspector's empty body | **Have** — a strip can show it |
| A machine-wide tools total ("450 tools") | rows carry `tools_known` per engine; no total field | **Backend, small** (one field on `McpEngineSummary`) |
| Servers declared more than once / disagreeing | `McpServerRow.agreement`, `distinct_spec_count` per row (`mcp/servers.rs:25-65`) | **Backend, small** for a count (frontend may not count rows); **Have** per row |
| "Canonical vs shadow" fragmentation | `LinkState::Foreign` exists (`domain.rs:247-254`) but means a link whose target is not its recorded source — folded into mechanism `drift` (`annotations.rs:381-386`). Nothing classifies an asset as "shadow" | **Not in model** — the model is ownership and reach (`docs/harness.md`); reframe as the existing linked/local split |
| Version drift ("3 versions of github-stdio") | For MCP: launch divergence *is* detected (`Agreement::Conflicting`). For skills: `assets.version` is stored per row, nothing compares rows | MCP: **Have**. Skills: **Backend, medium** — and content drift by hash already exists (`LinkState::Drifted`) |
| Undeclared servers ("shadow MCPs") | `ProcessMatch` with empty `registration_key` (`mcp/observe.rs:345-352`); shown today as a DisclosureBanner ("168 undeclared MCP servers") | **Have** |
| Token tax / context load / "tokens per request" | `ProbedTool` keeps `name` + `description` only; `inputSchema` never read (`mcp/probe.rs:436-444`, `:620-636`) | **Backend, medium** for a *byte* size; tokens are tokenizer-specific — **Blocked** as a figure the app asserts |
| Namespace collisions across servers | Agreement compares launches of the *same* server name; no tool-name comparison across servers | **Backend, medium** — probe results hold tool names as JSON (`probe_results.tools`); meaningful only within one host's registered set |
| Orphaned skills (no engine reaches them) | `EngineReach.reached` all false = "Root not linked" everywhere | **Backend, small** for the count; the fact per asset is **Have** |
| Privilege audit / "8 unsandboxed" | `allowed-tools` is parsed on the frontend from one asset's body (`skillDocument.ts`); backend `SkillFrontmatter` keeps only name/description/version/source-origin (`scanner.rs:433-440`) | **Backend, medium** to extract per asset; "unsandboxed" is a judgment, not a fact — show the field, not the verdict |
| 30-day activity, hot/cold, "called 142 times" | Nothing observes engines invoking skills | **Blocked** — Hanger reads files, it does not watch engines (`docs/harness.md`) |
| Rule globs, "matching 104 files" | Rules are raw text plus a filename; no frontmatter parser (`domain.rs:153-169`) | **Backend, medium** for extraction; glob evaluation against workspaces is a second scanner — defer |
| Rule conflict index | Semantic comparison of natural-language directives | **Blocked** |
| Subagents: running tasks, pool saturation, compute budget | Hanger does not supervise engines' subagent execution | **Blocked** |
| "Daemon active · uptime · file watcher on 3 dirs" | There is no daemon; scans are on demand (`start_scan`) | **Blocked** — copy must be literally true of the code |
| Environment readiness (missing env vars) | Env var *names* only, values never read (`mcp/dialect.rs:29-30`); names do not reach the frontend at all (`domain::Tool` has no env field) | **Blocked** by design |
| Per-category colour, gradients, glass | `tokens.css`: saturated colour in state, brand, gel, favourite only; one elevation; flat cards (DESIGN.md §1, §3) | **Blocked** by the design system and `no-off-token-styles.test.ts` |

#### Inspector panels

| Prototype datum | Today | Verdict |
|---|---|---|
| Floating 380px glass panel | The inspector is a docked aside (`inspector_avionics.test.tsx`); the only elevation belongs to surfaces above the map canvas (`tokens.css` Overlay block) | **Blocked**; the docked form is the app's, and `inspectorExpanded` already gives a full-width mode |
| Tabs `Tools · Details` / `Content · Details` | Sections; document Preview/Source tabs at the bottom | **Frontend** — a design choice, rendered as Option B |
| MCP identity: protocol, server version, capabilities | `ProbeResult` (`mcp/probe.rs:78-89`) | **Have**. "Unsupported" is not knowable — only *offered / not offered in the handshake* |
| Transport: command, args, env | `launch_display` (redacted), `args` never cross IPC (`domain.rs:61-62`); env names only | **Have** in the honest form; `=***` implies a value was read — **Blocked** |
| Registered in (host, scope, path) | `McpServerDetail` Registered in | **Have** |
| Links (GitHub repo, docs) | No registry/package metadata anywhere | **Not in model** |
| Context bloat box (tokens, cache hit rates) | See token tax above | **Blocked** as an alert; bytes per tool are **Backend, medium** |
| Namespace collisions box | See above | **Backend, medium**; if built it is a `ReviewIssue`, not a panel box (F34) |
| Verdict card: "declared N times, launches agree/disagree" + Compare / Open config | `agreement`, `distinct_spec_count`, registration keys are fields; `docs/TODO.md` T10 names exactly this card as the unfinished §6.1 | **Have** (data) — **Frontend** (card) |
| Skill: Content preview / source toggle | `AssetDetail` document tabs | **Have** |
| Skill: path, version, size, allowed tools | `AssetDetail` facts | **Have** |
| Skill: "Primary owner", "Last reviewed", "Structural pattern: Linear", "Tool exposure: Optimized", "~100 tokens" | Nothing reads authorship, review dates, usage, or a taxonomy of skill shapes | **Not in model** |
| Skill architecture: `SKILL.md`, `references/`, `scripts/` | `read_asset_body` returns one file's text (`lib.rs:1434-1477`) | **Backend, small** — a `list_asset_dir` command (top-level entries with per-folder counts) |
| Reach (reaches it / root not linked) | `AssetDetail` Reach, three verdicts | **Have** — the app's is the fuller one |
| "⚠ N issues" button routing to an Issues screen (v4.1) | `deriveReviewIssues` (`reviewIssues.ts:226`) keys issues per asset; Needs review is the screen; F34 (`docs/findings.md:257-295`) asks for exactly this routing | **Derivable + Frontend** |

#### Map view

| Prototype datum | Today | Verdict |
|---|---|---|
| Search box in the canvas | The toolbar field (`filterText`) exists; the map ignores it | **Frontend** — reuse the field; no second box |
| Filter group All / Errors only / Orphans | Edge `state`, node `linked` are in `LinkGraph` (`linkmap.rs`); the layers panel exists | **Frontend** — as two more layer toggles, not a second control |
| Hover-focus dimming | Not implemented (`LinkMapPane.tsx:400-412` is per-edge hover only) | **Frontend, small** |
| Numeric badges on nodes ("1" drift, "!" broken) | Per-node counts of edge states are not fields | A **boolean** dot is **Derivable** (`invariants.md`: a boolean from an array is not a count); a numeral is **Backend, small** |
| Edge labels ("2 tracked", "1 modified") | `edgeSummary` ("2 symlinks") | **Have** |
| Engine → project edges (Claude Code → mei-recipes) | Project reach is store → project mounts (`PROJECT_MOUNT_DIRS`, `annotations.rs:240`); nothing records an engine reading a project | **Not in model** |
| "Last scan: 2m ago" in the map header | `lastScanAt` exists; the map cap shows only Rescan | **Frontend, trivial** |
| Legend "Symlinked / Active context / Local drift / Broken" | Legend is mechanism × state from the enums | **Have** — keep the app's, which cannot describe an undrawn style |
| Placecard: per-kind asset counts for a node | `get_asset_counts(root)` per root is a command (`lib.rs:1620-1633`) | **Have** (command) — **Frontend** to call it on selection, or **Backend, small** to carry it on `GraphNode` |
| Placecard: "Linked from N engine roots" | A count of edges | **Backend, small** (field on the node) |
| Placecard: "1.4 MB on disk" | No file sizes are stored (`preferences.rs` schema) | **Not in model** |
| Placecard: "Hanger Daemon syncs to 4 roots automatically" | No daemon; deployments are explicit (`execute_deploy`) | **Blocked** — false copy |
| Placecard: Link health (linked / local / broken per node) + Rescan | Per-root link-state counts are not fields; Rescan is in the cap | **Backend, small**; Rescan stays where it is |
| Engine placecard: config layers (`settings.json`, `settings.local.json`), approval mode, verbose logging | Hanger models four asset kinds and no more (`domain.rs:323-326`) | **Out of scope** by premise |
| Engine placecard: "Open engine repository table →" | `selectedBubble {type:"agent"}` renders that list in the Flyout (`Flyout.tsx:768-866`) | **Frontend** — one action, cross-view |
| Project placecard: git branch | No git dependency, no git command | **Not in model** |
| Project placecard: "Last Hanger scan" per project | Only a global `lastScanAt` | **Not in model** per project |
| Project placecard: rules present, `.cursor/rules` globs, `.claude/settings.json`, `.mcp.json` | Rule rows are inventory (`Have`, listed not counted); globs **Not in model**; settings.json **Out of scope**; project MCP registrations exist as `Scope::Project` tools — but `get_mcp_servers` is machine-global and the repo-scoped grouping is deferred (`docs/roadmap.md`, "Repo-scoped MCP grouping") | mixed; drawn as rule names only |

### 1.3 Structural mismatches

1. **State and routing.** The prototypes are five `display:none` panes
   switched by `onclick`. The app has one string state
   (`selectedSidebarItem`) and no router; the category is pane-local and
   reported upward (`profileCategory`, `App.tsx:1471`). A category-aware
   strip is therefore a prop change on `SummaryStrip`, not a new view.
2. **Styling.** Every prototype defines its own palette (`--mac-*`,
   `--gel-purple`, `--gel-cyan`…) with 13–39 hex literals, `backdrop-filter`,
   drop shadows, 600/700 weights and a 9.5–32px size ramp. The app has a
   closed token set (five sizes, two weights, four radii, one elevation —
   DESIGN.md §1–3) enforced by `no-off-token-styles.test.ts`,
   `tokens_contrast.test.ts`, `spacing-scale.test.ts`. Nothing in the
   prototypes' CSS is portable; the anatomy is.
3. **Counting.** The banners compute widths and totals client-side
   (`(data.linked / total) * 100`, v4.1 `hanger_v4_polymorphic_diagnostic_banner.html`).
   The app forbids frontend counting (`no-frontend-counting.test.ts`) and
   `GelMeter` sizes segments by `flex: value` so no arithmetic is needed.
   Every new figure is a backend field with a red/green test first.
4. **Diagnostics placement.** The prototypes put red/orange health boxes
   inside the inspector and the banner. The app's rule is `DisclosureBanner`
   for non-blocking diagnostics (`known-debt.md`) and the recorded
   direction (F34) is stricter still: a finding is stated once and routed
   to Needs review. The v4.1 "Issues button" idea agrees with F34 and is
   adopted; the inline boxes are not.
5. **Nouns.** "Global Workspace Observability", "Canonical / Shadow",
   "System fragmentation", "Engine Integrations", "Project Contexts",
   "Registry Assets" are not the app's vocabulary. The app says *engine*,
   *MCP servers*, *the global store*, *Needs review*, *Canonical store /
   Engine root / Project* (`LinkMapPlacecard.tsx:56-60`). First-time labels
   need a naming brief (`ui-copy.md`).

### 1.4 The v4.1 validation reports, re-checked

Three claims in `docs/v4.1-antigravity-valdiations/validation-reports/` do
not survive contact with the code:

- *"`HydratedLink` and `LinkState` already classify every asset as Linked
  (Canonical) or Foreign (Shadow)"* — `Foreign` is a link whose target is
  not its recorded source (`domain.rs:288-335`), and `HydratedLink` never
  crosses IPC. No asset is classified as shadow anywhere.
- *"A simple query `SELECT name FROM mcp_tools GROUP BY name HAVING
  count(*) > 1` detects collisions"* — there is no `mcp_tools` table;
  tools are a JSON column on `probe_results` keyed by launch hash
  (`preferences.rs:568-576`).
- *"100% token-compliant"* for the "compliant" prototypes — the banner
  files keep 2–5 literals outside the token block (window-chrome dots,
  drop shadows) and the panel files keep 25–28 plus six or seven
  `backdrop-filter`s. The compliant banner also restates `--gel-aqua` with
  different stops from the real token.

The report's three-tier feasibility split (feasible / backend work /
blocked) is directionally right for most items and is superseded by §1.2.

### 1.5 Suggested mechanisms, assessed

Karthik's list from another chat (2026-08-22), checked against the
backend and the premise in `CLAUDE.md` — Hanger is an interface to the
harness asset layer, not an agent runtime.

| Mechanism | What the code has | Fit |
|---|---|---|
| **A static token footprint** of MCP schemas and skill files | Descriptions ARE stored (`mcp/probe.rs:72-76`, `ProbedTool { name, description }`); `inputSchema` is discarded; `SkillFrontmatter` parses name + description (`scanner.rs:434-440`); skill bodies are read whole (`read_asset_body`) | **Fits, and it was mispriced here.** This row previously costed the whole thing as "backend, medium, keep the schema size in `probe_results`" — that conflated descriptions with schemas. Descriptions and skill frontmatter are already in the store, so those halves are derivable **now**, no migration. Only `inputSchema` needs `user_version` 8 — and since schemas are the LARGER half of the per-request toll (500–1,400 tokens per tool in the field), that migration is worth more than it was priced. **Not `tiktoken`** (Karthik, 2026-08-23): it buys precision against a BPE these engines may not use, and ships several MB of vocab. Bytes are the fact; an approximate token figure is allowed only if visibly labelled an estimate, and only where the engine it applies to is named — no engine's disclosure behaviour has been verified. See `01-context-cost-brainstorm.md` |
| **Milvus / a local vector store** for progressive disclosure | Nothing; Hanger serves no context to any engine | **Does not fit.** It would put Hanger in the request path, which is the agent runtime's job and the premise says no |
| **stdio / SSE client calling `tools/list`** | Already built: `mcp/probe.rs` (`ProbeLaunch::Spawn \| Dial`, protocol 2025-06-18, one launch at a time, never while the server is running, cached in `probe_results` with a 7-day TTL and mtime invalidation) | **Exists** |
| **Schema and namespace parsers** for tool-name collisions | Tool names are stored per launch as JSON (`probe_results.tools`); nothing compares across servers | **Fits**, backend medium. Scope it to one host's registered set (two servers registered in different hosts never collide) and surface it as a Needs review issue kind, not a panel box (F34) |
| **`atime` / `mtime` for hot vs cold** | The scan reads and hashes every asset (`scanner.rs:580`, `:966`…). Checked on this machine: a skill the scan read minutes ago still shows `atime == mtime` from July — APFS here does not record reads at all | **`atime`: does not fit** — no signal, and where it did exist Hanger's own scan would overwrite it. **`mtime`: fits** as a fact ("Modified 3 days ago"), read at annotation time like link state (no column; read-time derivation is the invariant) |
| **FSEvents watcher** on `~/.agents` and projects | `watcher.rs` — `TrackedCopyWatcher` over `notify`, non-recursive, tracked-copy sources only — exists and is **constructed only in tests**; nothing starts it at runtime. Reaping is off by default because transient unmounts made live assets look stale twice (`invariants.md`) | **Fits narrowly**: an invalidation signal ("changed since the last scan" on the strip's stamp) with no automatic rescan and no reaping. A daemon that re-derives state on events does not fit — that is the failure reaping had |
| **Tool groups / scoping rules** (least-privilege filters per skill) | Hanger does not author engine or server configs (`roadmap.md`: "Not building New MCP Server… the thirteenth way") | **Does not fit** as enforcement. Showing what a skill *declares* (`allowed-tools`) already exists per asset; extracting it in the backend for counts is §1.2's "privilege" row |
| **Glob matchers** for `.cursorrules` / `.mdc` | `glob = "0.3"` is a dependency (used for paths, not rules); rules are unparsed text | **Fits later**, low value for its cost: extracting `globs:` from `.mdc` frontmatter is small; evaluating them against every workspace is a second walk; "conflicting" stays semantic and blocked. Roadmap entry, not this cycle |

---

## 2. Constraints

### 2.1 Non-negotiable technical constraints

1. **Counts are backend-owned.** Any number on screen comes from a command
   (`count_assets`, `link_graph`, `get_mcp_engine_summary`, …). A new
   figure = a new field + a failing test first. A boolean derived from an
   array is allowed; `.length` as a number is not. Allowlist edits are
   reported separately and never made to reach green.
2. **Tokens only, closed scales.** Colour via semantic utilities; five
   type sizes; two weights; radii `plane / inner / soft / pill`; one
   elevation (`shadow-overlay`) reserved for surfaces above the map canvas;
   flat cards on the page; no gradient but the gel meter; saturated colour
   only in state, brand, gel, favourite. Dark is a `.dark` class — `dark:`
   utilities do nothing here.
3. **Layout contract.** Rail 56 · optional source list 216–320 · pane ·
   inspector 384–480 docked; every cap is `h-10 flex items-center`. The
   map is the one view with no inspector column; its placecard is 300px,
   docked in-canvas. Rescan lives in the strip on panes
   (`toolbar_avionics.test.tsx`) and in the cap on the map.
4. **Diagnostics.** No blocking dialogs. Non-blocking diagnostics use
   `DisclosureBanner`; the direction of travel (F34) is one summary line
   that routes to Needs review. No new banner, alert or modal component.
5. **Schema and state.** Link state is derived at read time, never cached.
   Schema changes are `PRAGMA user_version` migrations pinned by
   `store_migration_tests.rs` (store at v7). Reaping stays off by default.
6. **Privacy posture.** Env var values are never read; `args` never cross
   IPC; launch strings are redacted by `mcp::redact`, whose predicates
   `observe` must share. A server is probed one launch at a time and never
   while it is already running.
7. **Identity.** Tool identity is `RegistrationKey`
   (`no-adhoc-registration-format.test.ts`, `no-config-path-identity.test.ts`);
   engine and host ids resolve through `src/data/brands.ts`
   (`brand-coverage.test.ts`). Several guards anchor on Rust symbols by
   text — moving `AGENT_CONFIGS`, `HOSTS`, `get_engine_key`,
   `RULE_FILE_OWNERS` disarms them.
8. **Performance budget.** Inventory is in the hundreds of rows (366
   assets on this machine); panes render from props with no context and
   no store. New data arrives on `scan://complete` refreshes or on
   selection — no polling, no daemon, no per-row `invoke`. The map's
   geometry is a pure function of the graph; hover state must not re-run
   layout.
9. **Motion.** One spring, three beats (`duration-hover/nav/press`,
   `ease-spring`), three entrance animations; everything off under
   `prefers-reduced-motion`. `animate-fade-in` / `animate-in` classes in
   `App.tsx`, `RepoPane.tsx`, `DiffChooser.tsx`, `ProfilePane.tsx`,
   `SidebarScanModal.tsx` are **undefined today** (no `@utility`, no
   plugin) — a pre-existing finding, not something the new work may lean on.
10. **Gates** are the four pinned in `CLAUDE.md`, run from the stated
    directories, valid only for the tree they ran on; UI verification is a
    screenshot from the running build, corroborated by state.
11. **macOS-only, WKWebView.** `backdrop-filter` cost and Windows/Linux
    layouts are moot; trackpad pinch/⌘-wheel conventions are the map's.

### 2.2 UI/UX constraints

1. **Ink and paper.** The state carries the colour, never the ground. A
   warning is `text-state-warning` on a neutral plane.
2. **One meter.** Every proportional bar is `GelMeter`; aqua marks the
   linked share only (ruling 2026-08-15). Using aqua for "answered" on the
   MCP meter needs a ruling — flagged in the banner view.
3. **Pane composition** today: strip (`mx-[18px] mt-[18px]`), chip row,
   list plane, foot (DESIGN.md §6). The strip is one shape; what changes
   with the category is its content. **Proposed change (Karthik,
   2026-08-22):** once the strip follows the selected chip, the chip row
   moves *above* the strip — the chip is the control for the figure and
   sits above what it changes, the reasoning that already puts Rescan
   inside the strip. The iterated banner view draws today's order once as
   the baseline and the new order for both options; `ProfilePane` and
   `RepoPane` would swap two blocks and `ProfilePaneIntegration.test.tsx`
   / `RepoPaneIntegration.test.tsx` would pin the new order.
4. **Inspector anatomy** today: eyebrow · title · state dot + line ·
   path chip with Copy/Reveal · actions · facts `<dl>` · Reach grouped by
   verdict · document tabs. MCP: Identity · Registered in · Tools ·
   Environment. **Ruled (Karthik, 2026-08-22): the inspector gets a tab
   row, breakdown first.** The header (eyebrow, title, state line, path
   chip, actions, and the routed issue line) stays above the tabs because
   it belongs to the asset; the first tab is the full breakdown —
   *Content* for a skill (the folder listing, then the document),
   *Tools N* for an MCP server (the probed list) — and *Details* is second
   (facts + Reach; Identity, verdict card, Registered in, Environment).
   The Preview/Source pair becomes an icon toggle inside Content. **The
   tabs are underline tabs, not chips** (Karthik's reference, 2026-08-22):
   labels in `--ink-2` on a `--line` baseline, the active one in
   `--ink-1` at medium weight with a 2px `--ink-1` rule beneath, the rule
   sliding on `--dur-nav` / `--spring`. Two idioms on purpose: the pane's
   category selector is a segmented track (it filters a list), the
   inspector's tabs are underline tabs (they switch views within one
   surface). **Section format (ruled 2026-08-22):** every section is an
   eyebrow (with its right-aligned meta) above one bordered list card —
   `border-line rounded-inner bg-page` — whose rows are icon · label ·
   right-aligned value, with a hairline only *between* rows (a one-row
   card has none). This is the "In this skill" card applied to Identity,
   Capabilities, Reach, Identity & capabilities, Registered in,
   Environment and Context. **Said once (ruled 2026-08-22):** transport
   was repeating four times — the header pill, a section head, a row, and
   an identical launch line in each of three registration rows — and
   "Links" was the launch read another way, so both fold into the
   Identity & capabilities card (Server · Protocol · Transport · Runs
   from, then the three capability rows). The launch returns to the
   registration rows only when the launches *disagree* — that is when it
   is the finding, and `agreement` / `distinct_spec_count` already report
   it per row. Actions are a **mini set**
   (Karthik's second reference): equal outlined pills, 26px, icon +
   label, side by side — Link to… / Open in editor, Compare / Open
   config, Review →. Open: whether Link to… keeps `--fill` as the one
   strong action at that size, or joins the set outlined. Open: whether the active tab is
   remembered per kind (a preference like `inspector_width`) or every
   open starts on the breakdown.
5. **Copy is literally true of the code.** "Empty is a finding; pending is
   not" — no pane asserts an absence before `scannedAt`. Every string goes
   through `/humanizer`; first-time labels get a naming brief and
   sign-off; suggested wording is direction, not the string.
6. **Brand marks** are the vendor's own via `BrandIcon`; a reached engine
   is the mark alone, an unreached one an empty slot.
7. **The map states its diagnostics in one place** (the notices control
   and placecard); it carries no banner strip.
8. **Accessibility conventions**: every control has an `aria-label`;
   toggles `aria-pressed`; decorative icons `aria-hidden`; one global focus
   ring; no colour-only state (the unread dot adds ", unread").

---

## 3. Iteration strategy

**Pruned 2026-08-23.** Each page now renders the chosen design only —
the alternatives it existed to compare are deleted, and every ruling they
carried moved into that page's legend. What each page settles is settled;
the "what it settles" column below is kept as the record of why the page
was drawn, not as an open question.

**Merged 2026-08-23.** `topnav-iterated.html` is deleted; the segmented
track and the strip whose figures follow it were the same subject drawn
twice, and since `.track` moved into `_proto.css` they shared one rule.
`banner-iterated.html` survives because it shows the control in context;
the isolated 584px and 368px specimens, the semantics note and the open
narrow-width question moved into it intact.

Three iterated views, each a review page rendered at the app's true
dimensions (1024×700 window, 56px rail, 384px inspector, 300px placecard)
in the app's own tokens — `_proto.css` imports `src/styles/tokens.css` by
relative path, so light and dark are the running values and the pages
cannot drift from the palette. Figures are this machine's, 2026-08-22,
watermarked "sample". Each page ends with a *carried over / changed /
dropped* ledger.

| Page | Options rendered | What it settles |
|---|---|---|
| `banner-iterated.html` | **Option A, ruled 2026-08-23** — chips above the strip, category-aware meter (All: link state; MCP servers: probe coverage), plus a facts line of backend fields. The chip row is the segmented track from the top nav, not a second control that resembles it. B's routed finding line was **not** taken. Absorbed `topnav-iterated.html` on 2026-08-23: the track at 584px and 368px, the capsule ruling (raised, no border, a tight contact shadow, and in dark a lighter surface since a shadow is invisible on black), and the semantics note. | Settled: the strip's meaning follows the chip; the capsule. Consequence recorded on the page: the "declared more than once" finding now relies on Needs review alone. Still open: the aqua ruling for the coverage meter; what the track does at 368px (scroll, or counts under labels); whether the row becomes a `tablist` semantically |
| `inspector-iterated.html` | **Chosen, ruled 2026-08-22** — tab row under the header, breakdown first: `Content · Details` for a skill, `Tools N · Details` for an MCP server; every section one bordered card of rows. Header rebuilt 2026-08-23 (the ten rulings below). The two reference shells are deleted. | Settled: tabs, content first; the section format; transport said once. Still open: which additions earn a backend change; whether the active tab is remembered; the header's one-row-versus-two fit at 384px |
| `map-iterated.html` | One canvas with hover focus, a state dot on a node, the layers panel extended (Unlinked roots, Only drift and dangling), a scan stamp in the cap, and three placecard bodies with per-kind facts and one action each | Whether the placecard may call `get_asset_counts(root)` on selection or the node should carry the figures; whether "Show its assets →" (engine) and "Rules here" (project) earn their place |

### Recommended order, if approved

1. **Map** first — almost entirely frontend, the graph payload already
   carries what is needed, and the hover/dot/layers trio is small and
   self-contained. One small backend field (`linked_from` on engine/store
   nodes) is optional.
2. **Inspector** second — the verdict card closes T10's §6.1, the routed
   issue line closes F34's direction, the folder listing is one read-only
   command with a test.
3. **Strip** last — the category-aware meter touches `ProfilePane` /
   `RepoPane` state, needs the aqua ruling and one backend field (a
   disagreeing-servers count), and its copy needs naming briefs.

### Rulings, 2026-08-23 — the inspector header

Karthik gave a screenshot reference for the header and answered ten
questions against it. Recorded here because several of them are
system-wide, not header-local.

1. **Two button radii, and the radius follows the size, not the role.**
   A normal button (30px, `.btn`) stays a full pill — unchanged. A mini
   button (26px, `.mini`) takes a small radius. The two tiers must never
   read as the same control at two scales.
2. **`.claude/DESIGN.md` is amended accordingly.** It says four radii;
   this is a fifth. Because DESIGN.md is derived from code with every
   statement cited, the rule goes into its *Not implemented* section
   until the token exists in `src/styles/tokens.css`, and moves up when
   the code lands. Proposed value `--radius-mini: 8px`; 6/8/10 drawn at
   true size for the ruling.
3. **"Squircle" was figurative.** A radius value, not a superellipse.
   No `corner-shape`, no `clip-path`, nothing that depends on WebKit
   support we have not verified in the real webview.
4. **The kind word stays visible** in the header (his first screenshot).
   Dropping it — and letting the icon carry the kind alone — stays
   available as a later iteration; it would need four drawn kind marks
   first, since only MCP has a glyph today (`ServerIcon`).
5. **Scope folds into the kind icon as a tooltip.** The eyebrow was
   `Skill · Global`; the visible word is now the kind alone and
   `Skill · Global` is the icon's tooltip. The place is not dropped —
   it moves.
6. **The finding moves into a popover on the Review chip**, which makes
   the chip a button. The header's state line and its disclosure card
   both go. This keeps F34 — the fault is explained once, in the
   popover, with the route to Needs review — and buys back two rows.
7. **The path chip is dissolved.** The path becomes plain mono text; its
   two buttons join the trailing icon cluster, which reads Copy path,
   Reveal in Finder, Expand, Hide inspector.
8. **No chevron on `Link to…`.** The ellipsis stays, the panel takeover
   stays, and every string stays sentence case — no Title Case.
9. **The two button tiers split by place.** Header actions are minis
   with tone: `Link to…` filled, `Open in editor` tonal. Actions inside
   sections are the equal outlined mini set. This closes the open
   question of whether `Link to…` keeps `--fill`: it does, at mini size,
   in the header only.
10. **Sizes get drawn, not guessed.**

**Two facts from the code that constrain 6 and 7.** The 40px row at the
top of the inspector column is `data-tauri-drag-region`
(`src/App.tsx:1633`) — it is how the window is dragged from that column,
and its height is what keeps the panel aligned with the toolbar. It
cannot simply be deleted, so the identity row takes it over. And
`src/App.tsx:1641-1646` already refuses a second close control on the
grounds that one control at the window's trailing edge beats two doing
the same job — so Expand and Hide inspector **move** into the header,
they are never copied into it.

**The fit.** The one-row header he drew needs roughly 431px of content
against 348px available inside a 384px aside. His reference is ~537px
wide, which is why it reads comfortably there; the real column clamps
384–480 (`src/App.tsx:1118`), so the row fits only near the maximum.
Both layouts are drawn at 384px — one row as ruled, and a two-row
fallback — and the choice is his.

### Decisions needed before the plan

1. ~~Banner: Option A, B, or A with B's routed line.~~ **Ruled
   2026-08-23: Option A**, with the chip row rendered as the segmented
   track rather than as outlined pills. B's routed line was not taken —
   the consequence is recorded on the page.
2. ~~Inspector: sections (A) or tabs (B).~~ **Ruled 2026-08-22: tabs,
   breakdown first** (Content / Tools N, then Details). Remaining
   sub-question: remember the active tab per kind, or always open on the
   breakdown.
3. Which backend additions are in scope now: `list_asset_dir` (small),
   a disagreeing-servers count (small), per-kind counts / `linked_from` on
   graph nodes (small), per-tool schema bytes (medium), cross-server
   tool-name collisions (medium). ~~Recommendation: the four small ones;
   defer the two medium ones.~~ **Karthik (2026-08-22) wants the MCP
   panel's Identity & capabilities, Transport, Links and Context sections
   in** — so the two medium items move into scope: schema bytes per tool
   and per server kept at probe time (`probe_results` gains a column or
   the tools JSON gains a `bytes` field; a `user_version` 8 migration
   pinned by `store_migration_tests.rs`), and a per-host tool-name
   collision check surfaced as a `ReviewIssue` kind and as one routed
   line in the panel. Links need no backend: derived from the launch
   (npm / PyPI page from the runner, endpoint host for remote, Reveal in
   Finder for an app bundle); a repository or docs URL stays undrawn
   until a real source exists. Tokens stay out until a tokenizer is
   named on the figure. **The skill panel likewise** (same ruling):
   Details is sectioned — Identity (plus `Modified`, the file's mtime
   read at request time: small backend), Capabilities (declared
   `allowed-tools` as pills, "Runs commands through Bash" stated when
   present — a restatement, not a rating), Links only when
   `source-origin` is a URL, then Reach. "Primary owner", "Last
   reviewed", "Structural pattern", "Tool exposure: Optimized" and
   "Risk: Med" have no source and are not drawn; rating shell access
   would be a Needs-review issue kind and a ruling.
4. The aqua ruling for the MCP coverage meter (answered share as progress).
5. ~~Top navigation: which capsule.~~ **Ruled 2026-08-23: the raised
   capsule (B)** — no border, a tight contact shadow, and in dark a
   lighter surface instead, since a shadow is invisible on black. Still
   open: at 368px, a scrolling track or counts under the labels; and
   whether the row becomes a `tablist` semantically. Both of those now
   live in `banner-iterated.html`, under "Still open".
6. The inspector header: where `Link to…` lives — on the surface as the
   one strong action, or inside the ⋮ menu with everything else. The
   overflow menu replaced the one-row-versus-two question: the row
   Karthik drew needed 485px against a column that clamps to 384–480
   (`src/App.tsx:1118`), and moving the actions into a menu is what made
   it fit rather than choosing a fallback.
7. `--radius-mini`: 6, 8 or 10px, drawn at true size.
8. Naming briefs for the first-time labels that survive: "Unlinked roots",
   "Only drift and dangling", "In this skill", "Show its assets", "Rules
   here", "Described in", "answered / not yet asked / can't be asked" (the
   last three already exist in `McpEngineSummary` copy, unsigned — T11).
