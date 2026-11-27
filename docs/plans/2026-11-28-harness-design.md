# T20 harness design: how the eight remaining pieces fit together

Written 2026-11-28 for Karthik's approval. Nothing is planned or built until
he approves it (round 42, option B). Sources: the brief and the eight files in
`docs/plans/research/`, named here by slug (`slice3-add-remove-registry`);
`2026-11-27-harness-model-layer-research.md` and its rulings; the Answers in
`2026-11-27-hanger-mcp-server.md`; `memory/hanger-tool-manager-direction.md`
(the "direction note"); rounds 41 and 42. Code claims were checked on `main`
at `bdaa4fc` and are cited by symbol.

## 1. Intent and why

Hanger is "the control panel for your AI coding harnesses" (Karthik,
2026-11-26). It already finds every engine's skills, rules, subagents and MCP
servers, shows what they cost, and switches servers and skills off and on,
each switch a reversible write.

The eight pieces finish the control panel and prepare the next stage: "a
harness for your harnesses", an agent whose only tools are Hanger's safe verbs
(list, measure, switch, link, undo), "proposing changes Karthik approves". The
build order follows from that sentence. Every safe, reversible operation built
now is a tool the model gets later. So each piece ships first as a verb a
person uses in Hanger's window, and reaches a model only through one approval
path, built once.

## 2. Goals, non-goals, anti-goals

**Goals.** A Hanger surface for each mcpick ability Karthik asked for:
per-project switching, add and remove, Registry add at a pinned version,
profiles, backup and restore, `gh skill`, Claude plugins. Version, update,
sign-in and settings for each engine CLI. One approval queue for writes a
model asks for, serving the user's engines through Hanger's MCP server and
later Hanger's own agent. Plaintext-secret and unpinned-package findings.
Honest copy, per engine, about when a change takes effect.

**Non-goals for this program.** The gateway as a running component (§4.6).
Status for the apps. Saved views, Ollama tagging and the Codex
`config/value/write` spike (rulings 5 to 7): phase B unblocks them, and none is
one of the eight. The hash-change and `curl | sh` findings (§4.3). T21, T24,
T25.

**Anti-goals: what Hanger never does.**

- **It never holds a secret of its own.** It never asks for a secret value,
  stores one, logs one, sends one over IPC or the MCP server, or shows one to a
  model. Two places already hold secrets, and this design names them rather
  than pretend: the Claude Code stash (`mcp::switch::vendor`, whose doc says
  "any credential in its `env` included") and the pre-write backups
  (`apply::safe_replace`). Both are byte copies of the user's own file, 0600,
  kept so a write can be undone and never parsed for values. No piece adds a
  third place. That rules out a Keychain launcher and an aggregating gateway.
- **It never runs an agent loop of its own.** No model, key or API client
  ships in Hanger. Phase B is one headless run of the user's own engine, whose
  only tools are Hanger's verbs.
- **It never writes without approval.** A person's click on a switch approves
  that one write. Anything a model asks for waits as a proposal until a person
  approves it in Hanger's window. Every write is atomic, with a receipt and an
  Undo.
- It never writes another engine's approval or trust settings (research rule
  4), never runs an update, never probes unasked, never starts a process from
  the MCP server (Decision 3), and never drives or bundles mcpick at runtime.

## 3. Constraints

- **Order:** "context control first (MCP on/off → add/remove/Registry →
  profiles → skills + Claude plugins etc. → gateway); the engine-status CLI
  plan … second" (direction note). Round 41 changed how it runs, not the
  order: "All eight at once, as a multi-agent workflow" and "Slices 2 to 6 wait
  for the T20 harness plan". Round 42: "one harness design (T20) decides the
  eight … then the surviving plans are written in parallel, each gated by
  `stage-gate --plan`."
- **How writes are made:** "MCP config writes … ported to Rust on Hanger's own
  dialect layer … Vendor-owned mechanisms go through the vendor CLI: `claude
  plugin`, `claude mcp`, `gh skill`"; "port its adapters, behaviours and tests"
  (direction note).
- **Write safety:** "every write ships atomic (temp + rename) with a
  timestamped pre-write copy and one Undo per write … Full backup/restore UI
  comes later with profiles" (direction note).
- **Switch scope:** "per-project overrides of global servers are a follow-up.
  Each engine's flag is verified with its own `mcp list` before its switch
  ships" (direction note). Context-control slice 1, Out of scope: "Writing
  `~/.claude.json` directly, or any key an engine was not shown to honour."
- **Cost:** "cached probe results only … Never auto-probe."
- **Engine status:** "never run it" for updates. For sign-in, "only the tool's
  own read-only status command … A tool with no command shows 'Not reported'".
  UI: "Engine detail = Context … + Status."
- **The MCP server** (Answers): 3, writes "approved in Hanger's window, as a
  proposal the app applies"; 7, "No free text in a proposal"; 8, "writes after
  its live proof, new findings in their own plan". G2 has passed.
- **The model layer** (rulings, 2026-11-27): 1, "none; the user picks"; 2,
  "ship Claude only via `--bare` with the user's own key"; 8, "run a
  `list_changed` spike per engine first".
- **T23:** "Before any task that renders model output on screen, put the
  question to him in Plannotator."
- **Secrets** (`docs/scanning.md` §7): values "are never captured in memory or
  written to domain structs."
- **House rules:** counts from the backend, `user_version` migrations, tokens
  only, no blocking dialogs (`invariants.md`). Per-kind counts before and
  after shared-code changes (`shared-asset-machinery.md`). A naming brief and a
  `/humanizer` pass for new strings (`ui-copy.md`). Red then green for every
  change under `src-tauri/src/` (`verification.md`).

## 4. The eight, decided

### 4.1 MCP phase 2: KEEP, as owner of the approval queue

Build Tasks 8 to 11 of the server plan with the eight corrections in
`mcp-phase2-proposals` §2. The load-bearing ones are checked:

- `tools.rs` → `public_key` admits, in a `shortcut:`, that two names sharing
  127 characters share one id. A proposal resolves the public id against the
  live context, needs exactly one match, and stores the real key in its 0600
  file.
- `Ask::Skill` takes an `asset_id`, resolved through
  `skill_switch::ops::switch_info_for`. Undo becomes `propose_undo(proposal_id)`.
- Previews cover all four `SWITCHES` engines, Antigravity included. The new
  tools run through `scanned()`.
- `strings::INSTRUCTIONS` ("Nothing here changes a file") and
  `docs/mcp-server.md` ("Five tools") are rewritten through a naming brief.

Verbs: on, off, undo. `Ask` is an enum that later pieces extend, never
replace, and every verb takes identifiers Hanger resolves, never values. The
app polls; `watcher.rs` → `TrackedCopyWatcher` is constructed nowhere outside
its own file, and polling keeps the README's "three events" true. Elicitation
is deferred: it was measured in Claude Code alone.

### 4.2 Slice 2, per-project overrides: KEEP, for three engines

`slice2-per-project-overrides` option A, in order Claude Code, Codex, Gemini
CLI, each with a measured key: Claude's
`projects[<realpath>].disabledMcpServers`, a Codex project
`.codex/config.toml` stub, Gemini's project `mcp.excluded`. Antigravity,
OpenCode, Cursor and Zed get an honest new read-only reason ("this engine has
no per-project switch") instead of `PerProjectComesNext`. The picker is the
repository view.

The code widens this slice twice:

- **`ops` cannot reach a project registration today.** Its module doc ("A key
  is not a path") says "a project registration is not in the machine pass, and
  switching one is not built here", although `SWITCHES` lists Codex at
  `Project`. So slice 2 extends what `ops` accepts. That extension is what
  slices 3 and 4 build on (§5).
- **Hanger doesn't read Claude's per-project lists.** A grep of
  `src-tauri/src` for `disabledMcpServers` is empty, so a server switched off
  in a project with `/mcp` shows as on. Reading them is a correctness fix that
  needs no ruling, and ships first whatever Question 1 says.

Codex and Gemini need a trusted folder; Hanger shows "needs trust" and never
writes it (rule 4).

### 4.3 Slice 3, add, remove, Registry, two findings: KEEP, staged by engine

`slice3-add-remove-registry` option C. Add and remove are dialect writes
behind `safe_replace`, with receipt and Undo; Claude Code reuses `vendor`'s
`add-json`/`remove` and stash. The first cut is the four `SWITCHES` engines;
the rest follow one live check at a time. A Registry add is a source of an
entry, not a new write path: `/v0.1` with `version=latest`,
`status == active`, exact versions only, `npm` → `npx -y pkg@ver`, `pypi` →
`uvx pkg==ver`, remotes → a URL entry, any other type refused with a reason.

**Slice 3 owns the plaintext-secret and unpinned-package findings the server
plan deferred** (Decision 10, Answer 8). The write-time warning and the
scan-time finding are one detector. It runs at the parse boundary and keeps
only `{key, pattern name}` (Question 3). Verdicts are computed in Rust and
returned with the inventory; `deriveReviewIssues` maps them, as it maps drift
today. Unpinned detection adds `uvx` without `==`, `npx` without `-y`,
`pnpm dlx`, `bunx` and `@latest` to mcpick's rule. The hash-change and
`curl | sh` findings concern skills and files, and go to a findings plan on
`docs/roadmap.md`.

With add built, Hanger could add its own MCP server. That revisits the server
plan's Decision 8, so it is a follow-on gated on Karthik's word.

### 4.4 Slice 4: KEEP, split

- **4a, Recent changes:** a list over `apply::latest_receipts`, the skill
  keep and the Claude stash; `restore_backup(receipt_id)`, itself a receipt;
  and the retention policy `KEPT_PER_FILE = 20` was left waiting for
  (`slice4-profiles-backup` option B). It only reads receipts plus one entry
  point in `apply`, so it starts at once.
- **4b, profiles:** files under `<data>/profiles/` holding names and states
  only. A load calls `set_enabled_for` in a fixed order, stops at the first
  failure, and returns its receipts so one Undo walks them last-first, the
  shape `useMcpSwitch` already has (the researcher cites
  `FlyoutAllEnginesSwitch`, which is a test file; the component is
  `AllEnginesSwitch`). Profiles never add a server; an undeclared name is
  skipped and listed. No migration. "Profile" needs a brief: the pane was
  renamed away from it, and Codex's `--profile` means something else.

### 4.5 Slice 5: KEEP, in three parts

- **5a:** a thin `gh skill` driver (list, search, preview, install, update),
  argv and `--json`.
- **5b:** an honest skill budget. `disable-model-invocation`,
  `skillOverrides` and the 1,536-character cap are applied around
  `scanner::parse_skill_frontmatter` before the card shows a skill figure,
  gated on a live session check (H1), since the researcher read it from docs.
- **5c:** Claude plugins through `claude plugin`; hooks and cache read-only
  with Open in editor. mcpick's hook disabling rewrites a vendor file the next
  update replaces, which the vendor-CLI ruling already excludes.

Plugin servers already read as `ManagedByPlugin` in `context.rs`, so slice 5
adds no switch path for them.

### 4.6 Slice 6, the gateway: CUT as a build; a spike and an "applies" line instead

`slice6-gateway` option C. Only Gemini CLI and Zed are reported to honour
`list_changed`. Claude Code's evidence is contradictory, Codex "still only
logs", and no source tests a *removed* tool. The aggregator breaks the secrets
anti-goal; the per-server shim is sound but unjustified so far. What ships:
the one-file spike, a live run per engine with Karthik's go-ahead, and
`EngineContext.applies` filled from what the runs show (`context.rs` always
builds it as `None` today). That is the direction note's "each engine
labelled with when a change applies". The shim goes to the roadmap with
Question 7's bar.

### 4.7 T19 engine status: KEEP, re-planned onto the overview card

`t19-engine-status` option A; its stale-marks table is the re-plan of
`2026-11-24-tool-manager-phase-a.md`. Build `ENGINE_CLIS` keyed to
`AGENT_CONFIGS` ids for five CLIs (Claude Code, Codex, Gemini CLI, OpenCode,
Antigravity CLI); `parse_version`, `is_newer`, install method and update
command; auth parsers for Claude, Codex and OpenCode (with `--standalone`, as
the planned argv hung); a daily check cached in `preferences`, with an off
switch; and `get_engine_status` beside `get_engine_contexts`, without widening
`EngineContext`. Two errors are fixed: OpenCode's package is `@opencode/cli`,
not `opencode-ai`, and a native Claude install is compared to its channel,
not `latest`. Apps wait, per the direction note. Gemini and Antigravity
sign-in read "Not reported", per the auth ruling.

### 4.8 Phase B, the in-app agent: KEEP, last, with spikes early

`phaseB-in-app-agent` option A: a one-shot child of the user's engine in an
empty run folder under Hanger's data directory. Claude runs only as `--bare -p
--tools "" --strict-mcp-config`, with Hanger's server in agent mode as its
only tool. Codex waits for a spike proving its shell tools can be stripped
(rule 3 settles that). Every write, and every read outside scope, is a
proposal in phase 2's queue. Output reaches the webview over a Tauri `Channel`
(none in use today). Run records are files. Before its first build task it
needs phase 2 merged, T19's `ENGINE_CLIS`, both spikes, and T23 ruled.

### Where the researchers disagreed, and how it was settled

- **A secret value at approval.** `mcp-phase2-proposals` §6 has required
  secrets "typed into the approval band"; `slice3-add-remove-registry` says
  "the form never asks for a value". Settled by `scanning.md` §7 and the
  anti-goal: neither takes a value, only a variable name. Literals are
  Question 2.
- **Where findings are computed.** `t19-engine-status` feeds
  `deriveReviewIssues`; slice 3 computes in the backend. The code reconciles
  them: `deriveReviewIssues` already maps backend facts
  (`AssetAnnotation::mechanism`, `parse_status`) to issues. New verdicts are
  computed in Rust; the frontend keeps the mapping.
- **Table sizes.** `HOSTS` has 17 entries by bounded grep, as slice 3 says;
  the 16 in `readme.md` and the memory index is stale. `AGENT_CONFIGS` has 12,
  as T19 says; `readme.md` says 11.
- **`per_project_comes_next` sites.** Slice 2 counts 7 files; a grep of `src`,
  `src-tauri` and `docs` (outside research) finds 8, plus two evidence files.
- **`STORE_VERSION`.** The server plan says no constant names the version;
  `preferences.rs` → `STORE_VERSION = 8` now exists, as phase B says.
- **OpenCode's version.** Slice 2 says 2.4.2; phase B and T19 say 2.4.1. T19
  explains: CLI 2.4.1 installed, npm and OpenCode.app at 2.4.2. No OpenCode
  write ships until a live check settles `disabled` against the `enabled` that
  the comment on `SWITCHES` assumes.

## 5. Shared machinery and owners

One owner each. The owner lands its interface first; others extend in the
order given, and a piece needing to change what it doesn't own asks the owner
over `SendMessage` or waits.

| Machinery | Owner | Interface landed first | Others, in order |
|---|---|---|---|
| `mcp::switch::ops` (keys, targets, `set_enabled_for`, `undo_for`) | **Slice 2** | A target type for a machine item or a project item, resolved only from discovery ("A key is not a path" kept); existing signatures source-compatible | Phase 2 calls unchanged → slice 3 adds a new-entry target at a path the host table names, and remove → 4b calls |
| `mcp::switch::edit` | **Slice 2** (flags), **slice 3** (entries) | Pure text functions, in separate files per concern so the diffs don't meet | — |
| `mcp::switch::apply` | **Slice 4a** | `restore_backup`, retention; `Receipt` unchanged | All others call it unchanged |
| `mcp::switch::vendor` | **Slice 3** | Claude Code add and remove | Slice 2 writes no Claude entry through it |
| `mcp::switch::context` (`EngineContext`, `ReadOnlyReason`, `applies`) | **Slice 2** | New reasons; item state per project | Slice 6 fills `applies` after; T19 adds a sibling reply |
| `skill_switch` | **Slice 5** | Installs land where `read_only_reason` allows a switch (Question 6) | Phase 2 and B call `set_enabled_for`, `undo_for`, `switch_info_for` unchanged |
| Overview card (`OverviewCard`, `OverviewHost`, `get_engine_contexts`) | **T19** | The engine section's Status rows | Slice 2 (repo row action) → 5b (skill figures) → 6 (applies line) → 4b (profile control), all drawn in **one combined layout round** first |
| `mcp_server` and the proposal queue (`<data>/mcp/proposals`) | **MCP phase 2** | `Proposal`, `Ask`, `approve.rs`, `list_mcp_proposals`, `decide_mcp_proposal`, the approval surface | Slice 3 adds remove, copy, add_from_registry → 4b adds apply_profile → phase B adds agent mode and read proposals |
| `engine_status` (`resolve`, `run`, `ENGINE_CLIS`) | **T19** | `ENGINE_CLIS` lookup by engine id, version parsing; `run_capture` signature frozen | Slice 5 (`gh`, `claude plugin`) → phase B's streaming sibling of `run_capture` |
| `SWITCHES` | **Slice 2** | Project-tier rows, each with its `mcp list` proof | Slice 3 keeps its own confirmed add/remove table beside it |
| `HOSTS`, `AGENT_CONFIGS` | None | No piece adds a host or engine. Tables keyed to them (`ENGINE_CLIS`, slice 5's `gh --agent` map) get a coverage assertion and floor in `brand-coverage.test.ts` in the same commit | — |
| Store schema (`user_version`) | None | No chosen option bumps it: proposals, profiles, run records and spike results are files; T19's cache is preferences. A piece that finds it needs one stops and asks | — |

Slices 2, 3, 4 and 6 write MCP files in directories that also own skills,
rules and subagents; slice 5 adds skill rows. Each plan captures per-kind
counts from the real store before its first commit and after its last.

## 6. Approaches for the program as a whole

**A. Eight tracks at once, merged by hand.** The literal reading of round 41.
It fails where code is shared: slices 2, 3 and 4b all change what `ops`
accepts, and five pieces change the overview card. Round 41's own warning
applies ("breaks silently"), and eight gate queues land on Karthik at once.

**B. Plans in parallel, six build tracks, one serial write spine
(recommended).** All eight plans are written and gated in parallel now. Six
worktrees build at once. The one chain that shares code runs in order: slice
2's `ops` target, then slice 3's add and remove, then 4b's load. The disjoint
parts of those slices (Registry client, detectors, pure `edit` functions,
Recent changes) still build alongside. Human gates are batched into one naming
round and one card layout round.

**C. Three waves, as round 41 recommended.** Safest, and it gives up "at
once", which Karthik chose against it.

**B keeps "all at once" for planning and for every track that owns its code.**
It can't hold in four places:

1. the `ops` spine (2 → 3 → 4b);
2. phase B, after phase 2 and T19's `ENGINE_CLIS`, its UI after T23;
3. the applies line, after the spike's human-paced live runs and slice 2's
   `context.rs` change;
4. the overview card, after one layout round settles every addition.

## 7. Waves and tracks

**Plans, written now in parallel, each with a fresh `stage-gate --plan`:**
P1 amends the server plan's Tasks 8–11; P2 slice 2 (read Claude's lists, the
`ops` target, three writers); P3 slice 3; P4 slice 4 (4a, 4b); P5 slice 5 (5a,
5b, 5c); P6 the spike and the applies line; P7 T19, replacing the stale parts
of `tool-manager-phase-a.md`; P8 phase B.

**Before any build, needing no code:** the slice 6 spike script; phase B's two
throwaway-`HOME` spikes; slice 2's live check of `/mcp disable`; the OpenCode
`disabled` check; and one batched naming brief covering "Off in this repo",
the add and remove labels, Registry search, the Profile noun, Recent changes,
the Status rows and their finding category, the proposal band and pill,
Plugins and Marketplaces, and the agent surface.

**Wave 1, six worktrees:**

| Track | Builds | Notes |
|---|---|---|
| Q | P1 | Consumes `ops`, `skill_switch` unchanged |
| W | P2 | Head of the spine; its `ops` target merges before anything else writes to `ops` |
| S | P7 | Owns `engine_status`, the card's Status rows |
| K | P5a, P5b | Skill figures on the card after the layout round |
| R | P4a | Owns `apply` |
| F | P3's disjoint parts | Registry client, detectors, per-dialect `edit` functions; no `ops` |

**Wave 2, each as its prerequisite merges:** P3's `ops` wiring, `vendor`, form
and findings (after W); P5c (after S's `ENGINE_CLIS`); P6's applies line
(after the runs and W); P8's backend (after Q and S).

**Wave 3:** P4b (after P3's `ops` change); P3 and P4b verbs into `Ask` (after
Q); P8's surface (after T23).

Merges go one at a time with `git -C <main checkout> merge --ff-only`, the
four gates rerun at each merged tree. Disjoint worktrees commit by explicit
path; `src/App.tsx` is staged by hunk (`shared-checkout.md`).

**Human gates:**

- Naming brief: one batched round, all tracks.
- Layout options at true width: the combined card round (S, W, K, P6, P4b);
  the proposal band (Q's G3); the add form and Registry results (P3); Recent
  changes (R); the Plugins pane (P5c); the agent surface (P8).
- Live checks: Q's G4 (a write and its Undo per kind); W per engine (the
  project key is path-exact); P3 per engine in a throwaway project; P5's H1 and
  one real `gh skill install`; P6 per engine with Karthik's go-ahead; S on a
  Finder-launched build; P8 with his key, ending in an approved switch and
  Undo.
- T23 in Plannotator before P8's first UI task; Anthropic's answer before any
  subscription route.
- `stage-gate --dev` before every push, `--release` after merge.

Karthik twice answered "done" to checks the files showed hadn't run (round
38); each gate is verified by its artefact.

## 8. Questions only Karthik can answer

Ordered by how much the answer changes what gets built.

1. **May Hanger write one key in `~/.claude.json`,
   `projects[<realpath>].disabledMcpServers`, atomically with receipt and
   Undo?** It lifts slice 1's out-of-scope rule for that key. (a) Yes. (b) No:
   Claude gets per-project state read but no switch; slice 2 is Codex and
   Gemini. **Pick (a):** it is Claude's own `/mcp` state, measured on 2.1.332,
   and no CLI writes it.
2. **May the add form take a literal secret?** (a) No: a variable reference in
   the engine's own spelling; an engine that can't expand one is told to add
   the secret by hand. (b) Yes, after a warning, and the file is flagged.
   **Pick (a), against the researcher's (b):** a typed value crosses IPC,
   which §7 and the anti-goal forbid.
3. **May the scanner read env and header values at the parse boundary to flag
   plaintext secrets, keeping only key and pattern name, with §7 amended in the
   same commit?** (a) Yes. (b) No: flag only a secret-looking key whose value
   isn't a `${VAR}` reference. **Pick (a):** mcpick's rule, and the value never
   leaves the parse step.
4. **How do writes roll out across engines?** (a) Proven engines first (Claude
   Code first in slice 2; the four `SWITCHES` engines in slice 3), others one
   live check at a time. (b) Every file host at once. (c) Claude Code only.
   **Pick (a).**
5. **Where does phase B's Anthropic key come from?** (a) `ANTHROPIC_API_KEY`
   from the login shell's environment at spawn, never stored, with a
   user-named `apiKeyHelper` as fallback. (b) The Keychain. **Pick (a):** no
   secret at rest.
6. **Where does `gh skill install` put a skill?** (a) `--agent universal`, in
   `~/.agents/skills`, the one place `skill_switch` can switch. (b) The
   engine's own folder, read-only to the switch. (c) Ask each time.
   **Pick (a).**
7. **What would justify building the gateway shim after the spike?** (a)
   Claude Code and one more engine drop a removed tool. (b) Any three engines.
   (c) Claude Code alone. **Pick (a).**
8. **When a profile loads, what happens to servers it doesn't name?** (a) Left
   alone, with "turn everything else off" as a preview checkbox. (b) Always
   switched off. **Pick (a).**
9. **What can Recent changes restore, and for how long?** (a) Any kept copy,
   behind a warning, the restore itself undoable; 20 copies per file, none
   evicted under 30 days. (b) The last write only. **Pick (a).**
10. **Do you accept approach B, with its serial spine?** (a) Yes. (b) All
    eight tracks regardless, overlaps merged by hand. **Pick (a).**

Dropped as already answered: where status shows (UI ruling); Gemini sign-in
and apps in T19 (direction note); writing trust (rule 4); a Keychain launcher
(anti-goal); Codex in phase B (rule 3); hook disabling and `gh skill`'s preview
status (vendor-CLI ruling); launching Hanger for a proposal (Decision 3);
phase 2's verbs (Answer 7). Moved to gates, where the answer is a rendered
layout or a brief: where a proposal shows and who it says is asking (G3, once
rmcp's exposure of `clientInfo` is checked), where "Off in this repo" sits,
and where the agent surface sits.

## 9. What's left to the builder

- Names inside the stated interfaces: the `ops` target type, proposal and
  profile file shapes, the `edit` file split, the spike's log format.
- Polling interval and proposal expiry (3 s and 10 minutes in the plan), and
  the daily check's timing.
- How a plugin's skills appear (the layout round decides; counts come from
  `count_assets` either way), and which Registry trust signals the form shows.
- Every count, `file:line` and SHA a plan states comes from a grep or `git
  cat-file` on the tree it describes, not from this document.

Unverified here, each a spike or live check in §7 rather than something to
build on: whether rmcp 3.12 exposes `clientInfo` to `call_tool`; Claude's
`/mcp disable` write from the real UI; `.claude/settings.local.json`'s effect;
Codex's `refresh_mcp_if_dirty` (read from an issue, not the source); whether
`--disable shell_tool --disable unified_exec` strips every Codex tool;
`@a2ui/react` under React 19.

## Addendum: the builder check (2026-11-28)

A fresh builder read this design to plan from it. Its six questions, sorted:

- **Already answered:** T19's daily check is on by default, with a preference
  to turn it off. The direction note says "check each tool's source for the
  latest version daily, plus a manual refresh … There is a preference to turn
  checks off." It's a network call to npm and GitHub, named in the T19 plan's
  telemetry notes; it isn't an MCP probe, so "never probes unasked" doesn't
  cover it.
- **Theirs, now in round 43:**
  - Undo for `~/.claude.json`, which Claude Code rewrites itself (merged into
    Q1).
  - Whether Hanger may write files inside a repository (Q2).
  - What a profile covers (Q8). It decides whether 4b leaves the serial chain.
  - What a receipt and Undo mean for writes made through a vendor CLI, and
    whether "never runs an update" covers only the engine CLIs (Q6).
  - Which actions a model may request at all (Q10). `Ask` can only be
    extended, so a wrong guess there is permanent.

§8's ten questions are restated, merged and reordered in
`docs/plans/2026-11-28-decisions-round-43.md`. That round is the one to
answer.

## Answers (Karthik, 2026-11-28, round 43): binding

1. **Q1:** Hanger may write `projects[<realpath>].disabledMcpServers` in `~/.claude.json`. Its Undo reverses that one key by re-reading the file and taking the project back out of the list. That is a new key-level Undo in `apply`, owned by 4a, and it survives Claude's own rewrites.
2. **Q2:** Repository files are written only when git does not track them; otherwise Hanger says why it can't switch there. Add and remove write at user scope by default.
3. **Q3:** The add form never takes a literal secret, only a variable name in the engine's spelling. An engine that can't expand one is told to add the secret by hand.
4. **Q4:** The scanner may read env and header values at the parse boundary and keep only `{key, pattern name}`. `docs/scanning.md` §7 is amended in the same commit.
5. **Q5:** Proven engines first: Claude Code first in slice 2, and the four `SWITCHES` engines first in slice 3. Each other engine follows its own live check.
6. **Q6:** A vendor-CLI write records a receipt holding the reverse command, shows in Recent changes, and Undo runs that command. "Never runs an update" covers the engine CLIs only, so skills and plugins update on click.
7. **Q7:** `gh skill install` uses `--agent universal`, which puts the skill in `~/.agents/skills`.
8. **Q8:** A profile covers the whole machine and holds servers only. Servers it doesn't name are left alone, and "turn everything else off" is a checkbox in the preview. **So 4b leaves the serial chain:** it calls `set_enabled_for` at the global tier and builds in wave 1. The chain is now slice 2, then slice 3's add and remove.
9. **Q9:** Recent changes can restore any kept copy, behind a warning, and the restore can be undone. 20 copies per file, none deleted before 30 days. A file the engine keeps rewriting (`~/.claude.json`) can be undone by key but not restored from an old copy.
10. **Q10:** A model may ask for on and off, Undo, add and remove (by Registry id or an existing entry), and loading a profile. It may not ask to restore an old copy or to install or update skills and plugins.
11. **Q11:** Phase B reads `ANTHROPIC_API_KEY` from the login shell at spawn and never stores it, falling back to the user's `apiKeyHelper`.
12. **Q12:** The shim is built only if Claude Code and at least one other engine drop a removed tool mid-session.
13. **Q13:** Approved, with approach B. All eight plans are written and gated in parallel, then built in six worktrees, with the one serial chain.
