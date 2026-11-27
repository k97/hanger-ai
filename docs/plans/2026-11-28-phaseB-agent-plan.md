# Phase B, the in-app agent: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Reconciled 2026-11-28** after the `--plan` review (`docs/reviews/2026-11-28-plan-2026-11-28-phaseB-agent-plan.md`), applying `docs/plans/research/2026-11-28-reconciliation-rulings.md` R3 (restated against P1's committed names: one filing function per verb, `Preview { target, change }`, `Ask` tagged by `verb`, the tools `propose_server_switch` and `propose_skill_switch`; `AGENT_TOOLS` includes the skill tool), R5 (P7 produces `engine_status::auth::{parse_auth, AuthState}` for this plan) and the P8 fixes, two of them Karthik's own calls in the rulings file: an agent run may have at most 2 proposals waiting at once, counted inside P1's queue cap of 5, and gets `slow_down` over it; the Claude child runs with `HOME` set to its run folder, and only the agent-mode server sees the real home. `Ask::Read` **ruled in round 44 Q3 (the recommended option)** and the `apiKeyHelper` fallback is **dropped (ruled in round 44 Q4)**; both are built to the ruled option. The review's mechanical findings are fixed in place. Shared names: `docs/plans/research/2026-11-28-cross-plan-interfaces.md`.

**Goal:** Let a person ask a question about the selected engine, asset or the whole machine, and have Hanger answer it by running the user's own Claude Code once, headless, with Hanger's MCP server as its only tool and every write or out-of-scope read waiting as a proposal for the person to approve.

**Architecture:** The app spawns `claude --bare -p --tools "" --strict-mcp-config` in an empty run folder under Hanger's data directory. The only server it may load is the app's own binary in a new agent mode (`<app> mcp --agent <run-id>`), which reads the run's scope from a file the app wrote, answers in-scope reads from phase 1's sanitised tools, and files everything else into P1's proposal queue. The app parses Claude's `stream-json` into a typed event enum and sends it to the webview over a Tauri `Channel`; the run's record is a file, written by hash.

**Tech Stack:** Rust (tokio `process`, `rmcp` 3.12 stdio server already in `mcp_server`, `serde_json`, `sha2`, `libc` for SIGINT), Tauri 2 `ipc::Channel`, React 19 + TypeScript, Vitest.

**Spec:** `docs/plans/2026-11-28-harness-design.md` (§4.8, §5, §7 and the binding "Answers, round 43"). Research: `docs/plans/research/2026-11-28-phaseB-in-app-agent.md`; model-layer research and its rulings: `docs/plans/2026-11-27-harness-model-layer-research.md`.

## Global Constraints

- Claude only, run as `--bare -p --tools "" --strict-mcp-config`, with Hanger's server in agent mode as its only tool (design §4.8). Codex is not built; only its spike is (Task 2).
- **Q11:** "Phase B reads `ANTHROPIC_API_KEY` from the login shell at spawn and never stores it, falling back to the user's `apiKeyHelper`." **The fallback is dropped (ruled in round 44 Q4)**: a helper on Claude's command line is visible to `ps` and can hold a literal key. Phase B needs `ANTHROPIC_API_KEY` in the login shell and says so when it's missing.
- **Q10:** "A model may ask for on and off, Undo, add and remove (by Registry id or an existing entry), and loading a profile. It may not ask to restore an old copy or to install or update skills and plugins."
- Model-layer ruling 1: no default engine; "the user picks". Ruling 2: Claude only via `--bare` with the user's own key; Anthropic is asked before any subscription route.
- The model sees only the sanitised view: phase 1's tool replies (`tools.rs`: names through `public_name`, paths through `sanitise_path`, no launch command, argument, env name or value, file text, or parser message). Phase B adds no tool that returns file text.
- Every write, and every read outside the run's scope, is a proposal in P1's queue. Phase B writes no engine file itself.
- Output reaches the webview over a Tauri `Channel`. No new `app.emit` event (the README's "three events" stays true).
- Run records are files under `<data>/agent/runs/<run-id>/`, 0600 in 0700 folders. No migration: `preferences::STORE_VERSION` stays `8`. A task that finds it needs one stops and asks.
- Secrets never cross IPC, reach a model, a log, a run record or a telemetry event. That covers the key and the `apiKeyHelper` command string, which can embed a literal key. Hanger never reads a credential file. Every probe runs with a throwaway `HOME`.
- Model-layer rule 8: "Log by hash: request, enum action, hashes of texts in context, approval, receipt. No config values."
- `telemetry.rs` never carries model input or output, and the agent code never imports it.
- T23 is asked again in Plannotator before any task renders model output on screen.
- House rules (`invariants.md`): counts from the backend, tokens-only styling, type roles, no blocking dialogs. Every user-facing string gets a naming brief where it is new and a `/humanizer` pass (`ui-copy.md`).
- Red first for every change under `src-tauri/src/` (`verification.md`).
- **Commit steps:** `git add <paths>` in one call; check `git diff --cached --name-only` lists only this task's paths in a second call; then `git commit -m "…" -- <paths>` in its own call. No `-n` anywhere in the committing call (the hook reads it as `--no-verify`). That recipe is right in this track's own worktree. A commit made from the shared main checkout that includes `src/App.tsx` (or any file a peer holds edits in) stages that file as an exact blob (`git hash-object -w`, `git update-index --cacheinfo`), then runs a **bare** `git commit` with no paths, then builds the commit in a detached worktree and runs `npx vitest run` there (`shared-checkout.md`).
- Gates (`CLAUDE.md` → Verification): `npx vitest run` and `bunx tsc --noEmit` and both `gitleaks` runs from the repo root; `cargo test` from `src-tauri/`, each in its own call.

## Decisions this plan makes

Hanger's choices, not rulings. Karthik can veto any at `stage-gate --plan`.

1. **Scope.** The app writes `Scope { machine: bool, engine_ids: BTreeSet<String>, asset_ids: BTreeSet<String> }` when a run starts, built from the run's subject:
   - `Subject::Machine` (Global, nothing selected): `machine: true`, so every read is in scope.
   - `Subject::Engine { engine_id }`: that id, plus the public ids of its `engine_context` items and of every asset whose annotation reaches it. Annotations key engines by `scanner::get_engine_key(id)`, a different id space from `AGENT_CONFIGS`, so the match goes through that function.
   - `Subject::Asset { asset_id }`: that id, plus every engine its annotation reaches.

   In agent mode, `list_engines` is always answered. `engine_context(e)` and `reach(a)` are answered when the id is in scope, and otherwise file a read proposal. "In scope" uses P1's rule for public ids, not bare membership: the id is resolved against the live data (`context_for` items, the store's assets), exactly one item must match, and that item's real key must be in the scope. Two items sharing a public id (`public_key`'s 127-character collision, or a path outside home sanitising to its basename) are never answered without a proposal. `find_assets` and `findings` are always answered, with out-of-scope items dropped and one `outside_scope_count` added per reply (the sum across lists). The join key is `public_key(abs_path)` against `asset_ids` (`tools::Finding` carries only `{category, name, path}`, so its sanitised `path` is matched through the same `public_key`). Every count already in the reply (`FoundAssets.total`, `Findings`' three `*_count` fields) is recomputed after filtering, so no figure counts what was dropped. A query is model text, so it is never put in a proposal for a person to read (Answer 7, T23).
2. **Waiting inside the call.** An agent-mode proposal tool polls the proposal file every 1 s for up to `AGENT_WAIT = 120 s` before returning `waiting`. An approved read is granted for the rest of that run, kept in the server process's memory.
3. **Limits:** `RUN_TIMEOUT = 600 s` (P1's proposal expiry), `MAX_TURNS = 12`, `MAX_BUDGET_USD = "0.50"`, `QUESTION_CAP = 2000` characters. One run at a time. **At most 2 of a run's proposals wait at once** (`MAX_WAITING_PER_RUN = 2`, Karthik's call in the rulings file), counted inside P1's global `MAX_WAITING = 5`, so the user's own engines always keep 3 slots. A third is refused with `Refusal::SlowDown` (code `slow_down`), added by this plan, and the run continues. The count is the run's ids in `<run>/filed` that `proposals::waiting` still lists. P1's `queue_full` still applies on top when the global queue is full.
4. **No `apiKeyHelper` fallback (ruled in round 44 Q4).** `KeySource` is `Shell` or `None`, and readiness says the key is missing. Hanger never reads, passes or names a helper. A helper named in Hanger's preferences is out too: it would put a possibly secret command at rest in Hanger, the anti-goal.
5. **No `--include-partial-messages`.** The surface shows progress (tool calls and proposals by Hanger's own names) and then the final answer. There is no run history UI; records are for audit. `shortcut:` records are never pruned; add retention when a history view needs it.
6. **Cancel leaves waiting proposals in the queue.** They expire after P1's 10 minutes, and approving one still applies the person's own decision.
7. **Minimum Claude Code** is the version Task 1 proves (`MIN_CLAUDE`), compared with P7's `parse_version`. Older versions get a "needs an update" state, not a guess.
8. The run's filed proposal ids are appended by the agent-mode server to `<run>/filed` (one id per line, 0600). `Proposal` gains no field, so P1's `a_proposal_carries_no_free_text` key list holds. `asked_by` comes from `clientInfo`, so an agent-filed write reads "Claude Code asks…" in P1's band; only a read can say "Hanger's agent asks", and Task 3's copy is true of both.
9. **The Claude child's environment** (Karthik's call in the rulings file, plus F10). `run_streaming` clears the environment (`env_clear()`) and sets only `PATH` (the login shell's), `HOME` = `<run>` (the run folder, so anything `claude --bare -p` writes under `HOME`, a `~/.claude.json` `projects` entry included, lands in the run folder and never in the real `~/.claude.json`), and `ANTHROPIC_API_KEY` from `SpawnAuth`, when there is one. A stale key in Hanger's own environment never reaches the child. Only the agent-mode server sees the real home: the mcp-config's `env` sets `HOME` to it for the server process. Task 1 records which other variables Claude passes to the server (the key included), and Task 6's server never reads `ANTHROPIC_API_KEY`.

## Cross-plan interfaces

Each name below is the owning plan's own spelling (ruling R3); the full table is `docs/plans/research/2026-11-28-cross-plan-interfaces.md`. A task that consumes one still starts by grepping `main` for it, and uses whatever P1's Gate N renamed.

- **P1 (MCP phase 2), owner of `mcp_server` proposals and the approval surface.** Needed by Tasks 5, 6, 10, 14 and 15. P1 must be merged first.
  - `mcp_server::proposals::{Proposal, Ask, Status, save, load, waiting, sweep, Filed, ProposalState, EXPIRES_AFTER_MS (600_000), MAX_WAITING (5)}`.
  - `Ask` is `#[serde(tag = "verb", rename_all = "snake_case")]`, extended only. **Phase B adds `Ask::Read { tool: ReadTool, id: String }`** (owner table: "phase B adds agent mode and read proposals"), wire `{"verb":"read","tool":"engine_context","id":"gemini"}`.
  - One filing function per verb: P1's `propose_server`, `propose_skill`, `propose_undo` and `get_proposal`; **this plan adds `propose_read`**, in P1's signature shape `(p: &ServerPlaces, tool: ReadTool, id: &str, asked_by: Option<&'static str>, now_ms: i64) -> Result<Fresh<Filed>, Refusal>`.
  - `tools::Refusal` (this plan adds `SlowDown`, code `slow_down`), `Fresh`, and `tools::public_key`, `scanned` and `measure`, which P1 makes `pub(crate)`.
  - `mcp_server::approve::{Preview, PreviewTarget, Change, pending, decide}`, with `Preview { id, at_ms, expires_at_ms, asked_by, undo, name, to: Option<ItemState>, target: PreviewTarget, change: Change }`. A read previews with `to: None`, `change: Change::Nothing`, and a target arm this plan adds, `PreviewTarget::Read { tool: ReadTool, engine_id: Option<String> }`.
  - IPC `list_mcp_proposals() -> PendingProposals`, `decide_mcp_proposal(id: String, approve: bool) -> Result<Proposal, String>` and `undo_mcp_proposal(id: String)`.
  - The tools in `TOOLS` (`mcp_server/mod.rs`): `propose_server_switch(engine_id, key, state)`, `propose_skill_switch(asset_id, state)`, `propose_undo(proposal_id)` and `get_proposal(proposal_id)`, under the names P1's Gate N signs off. P1's `Spec.run` stays `fn(&ServerPlaces, &JsonObject, Option<&'static str>)`; agent mode has its own dispatch (Task 6), which calls P1's filing functions after its scope and per-run checks.
  - `ServerPlaces.proposals: PathBuf` (`<data>/mcp/proposals`).
  - The approval band and pill (P1's Gate G3 and Task 6), polling every 3 s, and `src/types/mcpProposals.ts`. Phase B adds the `Read` target arm to both (Task 14).
- **P7 (T19), owner of `engine_status`** (ruling R5). Needed by Tasks 8, 10 and 14. P7 must be merged first.
  - `engine_status::clis::cli_for("claude-code")` (`EngineCli.bin == "claude"`).
  - `engine_status::version::{parse_version, is_newer}`.
  - `engine_status::auth::{parse_auth, AuthState}` with `AuthProbe::ClaudeJson` on `claude auth status`, used only for copy: "signed in with a subscription; the agent needs an API key". Which `authMethod` value means "subscription" is unmeasured (P7's note).
  - `run_capture`'s signature stays frozen. **Phase B adds the streaming sibling** in a new file `engine_status/stream.rs` (owner table: "phase B's streaming sibling of `run_capture`").
- **P3 (slice 3), add and remove propose tools** `propose_server_add`, `propose_server_remove` and `propose_registry_add` (filing `Ask::Add`, `Ask::Remove`, `Ask::AddFromRegistry`). Optional. When they are on `main` at Task 6, they go in `AGENT_TOOLS`. When they land later, P3 adds them there in its own commit.
- **P4 (4b), the `propose_profile_load` tool** (filing `Ask::ApplyProfile`). The same as P3.
- **Naming round (§7).** Phase B appends its section to `docs/plans/2026-11-28-naming-round.md` in Task 3.

## Review Focus

1. **A login shell that is slow, prints a banner, or sets the key only in `.zshrc`.** The key read uses `-l -i` with markers and a 5 s timeout. If no key is found, the state says so honestly, with no hang. (Task 7: `a_key_set_in_zshrc_behind_a_banner_is_read`, `a_hanging_shell_gives_no_key_within_the_timeout`.)
2. **Claude missing, too old, or a node shim that needs PATH.** Readiness names each state, and the child gets the login shell's PATH. (Task 10: `readiness_reports_missing_old_and_ready`, `the_child_gets_the_login_shell_path`.)
3. **A model that floods out-of-scope reads.** A third proposal waiting from one run reads `slow_down` and the run continues; the user's own engines keep 3 of P1's 5 slots. (Task 6: `a_third_waiting_proposal_in_one_run_is_slow_down`.)
4. **Cancel or window close mid-run, with a proposal waiting.** The child gets SIGINT, then a kill. No child process outlives the run. The record reads `cancelled`. (Task 8: `cancel_sends_sigint_then_kills_a_child_that_ignores_it`; Task 10: `a_cancelled_run_records_cancelled_and_leaves_no_process`.)
5. **Claude version drift in the stream.** An unknown event type or a non-JSON line is skipped. A run that ends with no `result` is `failed: unreadable_stream`. Budget and turn caps read as their own outcomes. (Task 9: `unknown_events_and_noise_are_skipped`, `a_stream_without_result_is_unreadable`, `budget_and_turn_caps_are_outcomes`.)

---

### Task 1: Spike A, Claude under `--bare` (throwaway `HOME`, no code)

**Files:**
- Create: `docs/plans/research/2026-11-28-phaseB-spike-results.md` (section "Claude"). It holds the fake server script inline, every command, and its pasted output.

**Interfaces:** Produces `MIN_CLAUDE`, the exact argv Task 9 encodes, and sanitised stream fixtures for Task 9 (event shapes only, with any text replaced by `"<text>"`).

- [ ] **Step 0: Per-kind baseline** before this plan's first commit, read-only, to `docs/evidence/phaseB/counts-before.txt`: the `sqlite3` command in Task 4, Step 3.
- [ ] **Step 1: Write the fake stdio MCP server** (Python stdlib, kept in the results file). It answers `initialize` and `tools/list` with two tools, `ping` (immediate) and `slow` (sleeps 130 s), and logs each request's method to a file in the throwaway folder.
- [ ] **Step 2: No-key run.** Use `HOME=$(mktemp -d)`, `ANTHROPIC_API_KEY` unset, and cwd an empty folder, with stdin `"call ping"`:
  `claude --bare -p --tools "" --strict-mcp-config --mcp-config '{"mcpServers":{"hanger":{"command":"python3","args":["<fake>"]}}}' --allowedTools "mcp__hanger__*" --output-format stream-json --verbose --no-session-persistence --max-turns 2`.
  Record:
  - the `system/init` event's `tools` list. It must equal exactly `["mcp__hanger__ping","mcp__hanger__slow"]`. Any other entry fails the spike.
  - `mcp_servers` status `connected`.
  - the exit code and `result` subtype with no key.
  - `find "$HOME" -type f` after the run, which lists every file Claude wrote.
- [ ] **Step 3: Human gate: stop for Karthik.** Ask for his go-ahead to make two keyed runs with his key from his login shell, under the same throwaway `HOME`. Do not proceed without his written yes.
- [ ] **Step 4: Keyed runs.**
  - (a) Stdin "call ping". The tool is called and not denied by Manual mode: no `permission_denied` event.
  - (b) Stdin "call slow". Record whether a 130 s call completes, or what error appears. If it times out, repeat with `MCP_TOOL_TIMEOUT=150000` in the env and record the result. This sets whether `AGENT_WAIT = 120 s` holds.
  - (c) Not run: round 44 Q4 dropped the `apiKeyHelper` fallback.
  - (d) `--append-system-prompt "<placeholder>"` is accepted under `--bare`.
  - (e) Record `claude --version`. That is `MIN_CLAUDE`.
  - (f) Save one full stream per run, sanitised to shapes only.
  - (g) Have the fake server log the **names** (never values) of the environment variables it receives, and record whether `ANTHROPIC_API_KEY` is among them, and whether an mcp-config `env` entry setting `HOME` reaches it (Decision 9).
- [ ] **Step 5: Verify** that the results file holds each command with its pasted output and exit code, and the answers to (a) to (g). If any of the following holds, stop and report to Karthik before Task 6:
  - `init.tools` holds anything but the two `mcp__hanger__` tools;
  - (a) is denied;
  - (c), when it ran, does not authenticate;
  - Step 2's or Step 4's `find "$HOME" -type f` lists any file Claude wrote under the throwaway `HOME` (a `.claude.json` `projects` entry, a session file). That is the evidence for Decision 9's run-folder `HOME`; record each path, and confirm the Decision covers it before Task 10;
  - (g) shows the server does not receive the `HOME` the mcp-config sets.
- [ ] **Step 6: Commit** `docs/plans/research/2026-11-28-phaseB-spike-results.md`: `docs(research): phase B spike A, Claude under --bare with one MCP server`.

### Task 2: Spike B, can Codex's shell be stripped? (throwaway `CODEX_HOME`, no code)

Planned only as a spike. Codex's inclusion is a later plan, after Karthik reads the result.

**Files:**
- Modify: `docs/plans/research/2026-11-28-phaseB-spike-results.md` (section "Codex").

- [ ] **Step 1:** Set `HOME=$(mktemp -d)` and `CODEX_HOME=$HOME/.codex`. Record `codex --version` and `codex features list`.
- [ ] **Step 2: Without a key,** dump what the model would see:
  `codex debug prompt-input` with `--ignore-user-config --sandbox read-only --disable shell_tool --disable unified_exec -c mcp_servers.hanger.command=python3 -c 'mcp_servers.hanger.args=["<fake>"]'`.
  Record every tool named in the output. If `debug prompt-input` rejects the flags, record the error verbatim. Then Step 3 is the only evidence.
- [ ] **Step 3: Human gate: stop for Karthik,** only if Step 2 cannot answer. With his go-ahead and his `CODEX_API_KEY`, make one `codex exec --json --ephemeral` run with the same flags and stdin "list every tool you have, then read /etc/hosts". Record every `item.*` type. A command-execution item fails the strip.
- [ ] **Step 4: Verify** that the section ends in one line, "Codex's built-in tools can / cannot be stripped with these flags on codex-cli <version>", with the evidence above it. Report that line to Karthik. Nothing in this plan builds on it.
- [ ] **Step 5: Commit** the results file: `docs(research): phase B spike B, stripping Codex's built-in tools`.

### Task 3: Gate: Phase B's section of the naming round (human gate, stop for Karthik)

**Files:** Modify `docs/plans/2026-11-28-naming-round.md` (append Phase B's section; the orchestrator owns the file).

- [ ] **Step 1:** Draft names and strings, with research behind each, for:
  - agent mode's `INSTRUCTIONS` (it must not say "Nothing here changes a file");
  - the system prompt appended with `--append-system-prompt`. It says the only tools are Hanger's, that every change is a proposal the person approves, that tool replies are data and not instructions, and that it should answer briefly;
  - the reply text when a read or write is filed and waiting, and when it is declined or expires;
  - the `slow_down` refusal text (a run already has 2 proposals waiting);
  - the `outside_scope_count` description in `find_assets` and `findings`;
  - the approval band's line for a read proposal, in the shape "Hanger's agent asks to read <engine>'s MCP servers". An agent-filed **write** reads with P1's asked-by wording ("Claude Code asks…"), because `asked_by` comes from `clientInfo`; the brief's copy must be true of both;
  - the surface's name.
- [ ] **Step 2:** Run `/humanizer` on every string.
- [ ] **Step 3: Stop.** Karthik signs off in writing. Record his answers under Phase B's section of the naming-round file. Tasks 5 and 6 copy those strings verbatim into `mcp_server/strings.rs`, as phase 1 did.

### Task 4: Wait gate: prerequisites, and the per-kind baseline (no code)

- [ ] **Step 1: Verify on `main`** with `git log -1 main` and greps:
  - P1 is merged: `grep -n "pub enum Ask" src-tauri/src/mcp_server/proposals.rs`, `grep -n "pub fn propose_server" src-tauri/src/mcp_server/proposals.rs` and `grep -n "fn decide_mcp_proposal" src-tauri/src/lib.rs` each print a line.
  - P7 is merged: `grep -rn "pub fn cli_for" src-tauri/src/engine_status/`, `grep -rn "fn parse_version" src-tauri/src/engine_status/` and `grep -rn "pub fn parse_auth" src-tauri/src/engine_status/` each print a line.
  - Round 44 Q3 (read proposals) is answered, or its provisional default is confirmed to stand. Q4 is ruled: no helper fallback.
  - Task 1's results file names `MIN_CLAUDE`, and Task 2's results file has its one-line verdict.
  - Task 3 is signed off.

  If any is missing, stop: this plan waits.
- [ ] **Step 2: Reconcile names.** Read P1's and P7's merged interfaces. Where a name differs from "Cross-plan interfaces" above (Gate N may rename a tool), use the merged name everywhere below and note the difference in Task 5's commit body.
- [ ] **Step 3: Re-capture the baseline** immediately before the first code task (a peer's scan moves it), read-only, to `docs/evidence/phaseB/counts-before-code.txt`:
  `sqlite3 -readonly "$HOME/Library/Application Support/com.rkarthik.hanger/hanger.db" "select category, scope, count(*) from assets group by category, scope order by category, scope;"`

### Task 5: Read proposals: `Ask::Read` (ruled in round 44 Q3 (the recommended option))

Q10's list doesn't name a read, and `Ask` can only grow. **Round 44 Q3** asks whether to add `Read`. Provisional default, the recommended option: yes, a read outside the run's scope becomes a proposal the person approves (design §4.8, §5). If Karthik answers no, this task is skipped, agent mode refuses every out-of-scope read outright (`NotFound`, no file written), and Task 6 drops its read-proposal tests.

**Files:**
- Modify: `src-tauri/src/mcp_server/proposals.rs` (one variant and `propose_read`), `src-tauri/src/mcp_server/approve.rs` (a preview arm and a decide arm that write nothing), `src-tauri/src/mcp_server/tools.rs` (`Refusal::SlowDown`), `src-tauri/src/mcp_server/strings.rs` (Task 3's strings)
- Test: `src-tauri/tests/mcp_proposal_tests.rs`

**Interfaces** (P1's committed names, ruling R3):
- Consumes: P1's `Ask`, `save`, `load`, `waiting`, `Filed`, `Fresh`, `Refusal`, `scanned`, `public_key`, `approve::decide`, `Preview`, `PreviewTarget`, `Change::Nothing`.
- Produces:
  - `Ask::Read { tool: ReadTool, id: String }`, wire `{"verb":"read","tool":"engine_context","id":"gemini"}`;
  - `#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Hash)] #[serde(rename_all = "snake_case")] pub enum ReadTool { EngineContext, Reach }`;
  - `pub fn propose_read(p: &ServerPlaces, tool: ReadTool, id: &str, asked_by: Option<&'static str>, now_ms: i64) -> Result<Fresh<Filed>, Refusal>`. It runs `scanned(p)?` first. `id` must resolve to exactly one item, by P1's rule (the read tool's own lookup returns `Ok`), else `NotFound` or `Ambiguous`, and no file is written. Then P1's queue check. The stored `id` is the real key it resolved to;
  - `Refusal::SlowDown`, code `slow_down` (used by Task 6);
  - a preview arm: `name` resolved by Hanger (the engine's display name, or the asset's `public_name`), never the model's spelling; `to: None`; `target: PreviewTarget::Read { tool, engine_id: Option<String> }`; `change: Change::Nothing`;
  - a decide arm: approval writes no file outside the queue and saves `Status::Applied { receipt_id: None, stopped_at: None }`.

- [ ] **Step 1: Write the failing tests.**
  - `a_read_proposal_names_a_tool_and_an_id_only`: the serialised `Ask::Read` is exactly `{"verb":"read","tool":"engine_context","id":"<real key>"}`, and P1's `the_ask_wire_shape_is_pinned` gains that literal.
  - `a_read_proposal_for_an_unknown_id_is_not_found_and_writes_nothing`: the proposals folder is empty afterwards.
  - `approving_a_read_writes_no_engine_file`: a fixture Codex `config.toml`'s bytes are identical before and after, and the status is `Applied { receipt_id: None }`.
  - `a_read_preview_is_nothing_with_hangers_own_name`: `change == Change::Nothing`, `to == None`, `target == PreviewTarget::Read { tool: EngineContext, engine_id: Some("codex") }`, and `name == "Codex"` for `engine_context` of `codex`.
  - `the_user_facing_server_never_files_a_read`: in the non-agent server, `tools/list` has no read-proposal tool, and calling `engine_context` with any id never writes into the proposals folder.
- [ ] **Step 2: Run** `cargo test --test mcp_proposal_tests` from `src-tauri/`. Expected: compile error ``no variant named `Read` found for enum `Ask` ``.
- [ ] **Step 3: Implement** the variant, `propose_read`, the preview arm and the decide arm. Tell P1 on `SendMessage` before editing its files.
- [ ] **Step 4: Run** the file, then the full `cargo test`. Expected: PASS. Extending P1's wire-shape test with the new literal is an extension P1's rule expects, not a forced edit. If any other P1 test needs an edit to accept the new variant, stop and report it: per `verification.md`, that is a forced enforcement edit, committed separately with its cause.
- [ ] **Step 5: Commit** the four source files and the test file: `feat(mcp-server): a read outside an agent run's scope waits as a proposal`.

### Task 6: Agent mode: `mcp --agent <run-id>`

**Files:**
- Create: `src-tauri/src/mcp_server/agent.rs`
- Modify:
  - `src-tauri/src/mcp_server/mod.rs`: `run_from_args` branches on `args[2] == "--agent"`, and `HangerServer` gains an optional agent state; when it is set, `call_tool` dispatches through `agent::AGENT_SPECS` instead of P1's `TOOLS` (P1's `Spec.run` signature is unchanged);
  - `src-tauri/src/mcp_server/tools.rs`: `find_assets` and `findings` gain scope-filtered variants (`public_key`, `scanned` and `measure` are already `pub(crate)` from P1's Task 2);
  - `src-tauri/src/mcp_server/places.rs`: `agent_runs: PathBuf` = `<data>/agent/runs`;
  - `src-tauri/src/mcp_server/strings.rs`: Task 3's strings.
- Test: `src-tauri/tests/agent_mode_tests.rs` (new); `README.md` `tests` figure.

**Interfaces:**
- Consumes: Task 5's `Ask::Read`, `propose_read` and `Refusal::SlowDown`; P1's `propose_server`, `propose_skill`, `propose_undo`, `get_proposal`, `waiting` and `load`; P1's `public_key`.
- Produces:
  - `pub struct Scope { pub machine: bool, pub engine_ids: BTreeSet<String>, pub asset_ids: BTreeSet<String> }` (`Serialize + Deserialize`);
  - `pub fn scope_path(runs: &Path, run_id: &str) -> PathBuf` → `<runs>/<run_id>/scope.json`;
  - `pub fn filed_path(runs: &Path, run_id: &str) -> PathBuf` → `<runs>/<run_id>/filed`;
  - `pub fn valid_run_id(s: &str) -> bool`, which accepts lowercase hex and `-` only, 1 to 64 characters;
  - `pub const AGENT_TOOLS: &[(&str, &[&str])]`: each tool name with the `Ask` verbs it may file, the one table both the dispatch and the Q10 test walk. Rows: the five read tools (each `&["read"]` for `engine_context` and `reach`, `&[]` for the rest), `get_proposal` (`&[]`), `propose_server_switch` (`&["server"]`), `propose_skill_switch` (`&["skill"]`) and `propose_undo` (`&["undo"]`), plus P3's `propose_server_add` (`&["add"]`), `propose_server_remove` (`&["remove"]`) and `propose_registry_add` (`&["add_from_registry"]`) and P4b's `propose_profile_load` (`&["apply_profile"]`) if merged. No other name.
  - `pub const MAX_WAITING_PER_RUN: usize = 2`.
  - `AGENT_SPECS`: agent mode's own dispatch table, one entry per `AGENT_TOOLS` row. Each proposal entry runs the scope check, then the per-run check (`slow_down`), then calls P1's filing function for its verb, then appends the id to `<run>/filed`.
  - `pub const AGENT_WAIT: Duration = Duration::from_secs(120)`, or the value Task 1 proved.

  Agent mode with a missing or unreadable scope file, or an invalid run id, exits with failure before serving.

- [ ] **Step 1: Write the failing tests.** Each runs the binary as `tauri-app mcp --agent <id>` in a child process with `HOME` set to a fixture home, as phase 1's protocol tests do.
  - `agent_mode_lists_exactly_agent_tools`: the `tools/list` names equal `AGENT_TOOLS`' names, in order.
  - `agent_tools_hold_only_what_q10_allows`: every verb in `AGENT_TOOLS` is in the fixed Q10 set `{"server","skill","undo","read","add","remove","add_from_registry","apply_profile"}`, and every `AGENT_SPECS` entry files only the verbs its row lists (checked by calling each on a fixture and reading the filed `ask.verb`). A name check alone would let a differently named tool through.
  - `the_agent_can_switch_a_skill`: `propose_skill_switch` for an out-of-scope-free skill files `Ask::Skill`.
  - `an_in_scope_engine_context_answers`: scope `{engine_ids: {"codex"}}`; `engine_context{engine_id:"codex"}` returns the same JSON as the user-facing server.
  - `an_out_of_scope_engine_context_files_a_read_proposal`: with `"gemini"`, one proposal file appears with `Ask::Read{tool: engine_context, id: "gemini"}`, its id is the only line of `<run>/filed`, and after `AGENT_WAIT` (set to 1 s by a test-only env, `HANGER_AGENT_WAIT_MS`) the reply is Task 3's waiting string, carrying the proposal id.
  - `an_approved_read_is_answered_in_the_same_call`: a helper thread writes `Applied` into the proposal file after 300 ms, and the call returns `engine_context`'s answer.
  - `a_granted_read_is_answered_again_without_a_new_proposal`: a second call files nothing.
  - `find_assets_drops_out_of_scope_hits_and_counts_them`: the fixture has 3 matching assets and 1 in scope, so the reply has `assets.len() == 1` and `outside_scope_count == 2`.
  - `findings_are_filtered_to_scope`: each of `findings`' three lists keeps only in-scope entries, matched by `public_key` of the sanitised path; each `*_count` equals its filtered list's length as computed in Rust; `outside_scope_count` is the sum dropped across the three.
  - `a_machine_scope_answers_every_read`: `machine: true`, and no proposal is filed for any of the five tools.
  - `a_third_waiting_proposal_in_one_run_is_slow_down`: two proposals from this run waiting, the third gets the `slow_down` refusal and no file; a proposal from the user's own engine still files (P1's global cap counts 3 of 5).
  - `an_out_of_scope_id_sharing_a_public_id_is_not_answered`: two assets whose public ids collide (names over 128 characters sharing their first 127), one in scope: a read of that public id files a read proposal (or `Ambiguous`) and is never answered from scope.
  - `agent_mode_refuses_a_bad_run_id_or_missing_scope`: `../x`, `ABC` and a missing `scope.json` each exit non-zero with nothing written to stdout.
  - `agent_mode_replies_pass_the_same_boundary`: the boundary assertions of `mcp_server_boundary_tests.rs`, run against agent-mode replies, hold: no launch command, env name or value, or raw home.
  - `the_server_module_never_prints` stays green unchanged.
- [ ] **Step 2: Run** `cargo test --test agent_mode_tests`. Expected: compile error ``unresolved import `tauri_app_lib::mcp_server::agent` ``.
- [ ] **Step 3: Implement.**
  - The scope check resolves the public id against the live data by P1's exactly-one-match rule and tests the resolved real key's membership (Decision 1), never the public id alone.
  - The per-run check counts this run's `<run>/filed` ids that `proposals::waiting` still lists.
  - The wait reads the file every 1 s through P1's `load`.
  - The granted set is a `Mutex<HashSet<(ReadTool, String)>>` in the server.
  - `<run>/filed` is appended with `O_APPEND` at mode 0600.
  - Agent mode writes nothing else.
- [ ] **Step 4: Run** the file, then `cargo test`. Expected: PASS. Then plant a row `("propose_restore", &["restore"])` into `AGENT_TOOLS` and run `agent_tools_hold_only_what_q10_allows`: expected FAIL on the verb, not the name. Revert by inverse edit, never `git checkout --`.
- [ ] **Step 5: Docs.** In `docs/mcp-server.md`, add a section "Agent mode" stating that it is launched only by Hanger, that the user never adds it to an engine, the scope rule, and Q10's list. Regenerate the README (`~/.bun/bin/bun run src/__tests__/readmeCounts.ts`), then run `npx vitest run src/__tests__/readme-sync.test.ts` from the repo root. Expected: PASS.
- [ ] **Step 6: Commit** the listed files, `docs/mcp-server.md` and `README.md`: `feat(mcp-server): agent mode, scoped reads and proposals for one run`.

### Task 7: Where the key comes from

**Files:**
- Create: `src-tauri/src/agent/mod.rs`, `src-tauri/src/agent/key.rs`
- Modify: `src-tauri/src/lib.rs` (`pub mod agent;`)
- Test: `src-tauri/tests/agent_key_tests.rs` (new); `README.md` `tests` figure.

**Interfaces:**
- Produces:
  - `#[derive(Serialize)] #[serde(rename_all = "snake_case")] pub enum KeySource { Shell, None }`. It is the only key fact that crosses IPC.
  - `pub async fn key_from_shell(shell: &Path, timeout: Duration) -> Option<String>`. It works the way `resolve::path_from_shell` does: `-l -i -c`, markers `__HANGER_KEY_START__`/`__HANGER_KEY_END__`, and the value between the last start marker and the end marker that follows. Empty means `None`. **Never cached**: there is no `OnceCell`.
  - `pub struct SpawnAuth` with private fields, no `Debug`, `Serialize` or `Display`. It holds the key, passed as the `ANTHROPIC_API_KEY` env.
  - `pub async fn spawn_auth(shell: &Path, timeout: Duration) -> (KeySource, Option<SpawnAuth>)`.

- [ ] **Step 1: Write the failing tests.** Each uses a fake shell script in a temp folder, as `engine_status_tests.rs` does.
  - `a_key_set_in_zshrc_behind_a_banner_is_read`: the fake prints `Welcome\n__HANGER_KEY_START__sk-ant-test-0000__HANGER_KEY_END__`, and the result is `Some("sk-ant-test-0000")`.
  - `the_key_shell_is_asked_as_login_and_interactive`: the fake logs its argv, and the argv starts `["-l","-i","-c"]`.
  - `a_hanging_shell_gives_no_key_within_the_timeout`: the fake sleeps 30 s and the timeout is 1 s, so the result is `None` within 3 s.
  - `the_key_is_never_cached`: two calls run the fake twice.
  - `an_empty_key_is_none`.
  - `no_key_is_none`: an empty shell result gives `(KeySource::None, None)`.
  - `settings_are_never_read_for_a_key`: with a settings file in the fixture's Claude folder holding `apiKeyHelper` and an `ANTHROPIC_API_KEY` in its `env`, `spawn_auth` still gives `(KeySource::None, None)`.
  - `spawn_auth_cannot_be_printed`: a `compile_fail` doc test on `SpawnAuth` (`format!("{:?}", auth)`), run by `cargo test --doc` and so by the `cargo test` gate.
- [ ] **Step 2: Run** `cargo test --test agent_key_tests`. Expected: compile error ``unresolved module `tauri_app_lib::agent` ``.
- [ ] **Step 3: Implement** with `run::run_capture`. Error paths carry no value.
- [ ] **Step 4: Run** the file, then `cargo test`. Expected: PASS.
- [ ] **Step 5:** Regenerate the README and run `readme-sync` as in Task 6.
- [ ] **Step 6: Commit** the listed files: `feat(agent): read the Anthropic key from the login shell at spawn, never stored`.

### Task 8: The streaming runner

**Files:**
- Create: `src-tauri/src/engine_status/stream.rs`
- Modify: `src-tauri/src/engine_status/mod.rs` (`pub mod stream;` and a doc line)
- Test: `src-tauri/tests/engine_stream_tests.rs` (new); `README.md` `tests` figure.

**Interfaces:**
- Consumes: nothing new. `run_capture` is untouched.
- Produces:
  - `pub struct Streaming { pub pid: u32, … }`;
  - `pub async fn run_streaming(program: &Path, args: &[String], stdin: Option<&[u8]>, envs: &[(String, String)], cwd: &Path, timeout: Duration, cancel: CancelToken, on_line: impl FnMut(&str)) -> Ended`;
  - `pub enum Ended { Exited { code: Option<i32> }, TimedOut, Cancelled, NotStarted }`;
  - `pub struct CancelToken`, a `tokio::sync::watch` sender and receiver pair, with `cancel()`.

  Behaviour:
  - There is no shell, `kill_on_drop(true)`, and stderr is discarded.
  - The environment is cleared (`env_clear()`); the child gets only the `envs` passed (Decision 9).
  - Stdout is read line by line, and each complete line goes to `on_line`.
  - On cancel or timeout, it sends SIGINT (`libc::kill`), waits `GRACE = 3 s`, then kills and reaps.
  - A relative `program` is `NotStarted`.
  - It logs nothing.

- [ ] **Step 1: Write the failing tests** with fake scripts.
  - `lines_arrive_in_order_before_exit`: the fake prints `a`, sleeps 0.2 s, prints `b`, so `on_line` sees `["a","b"]` and the run is `Exited{code: Some(0)}`.
  - `stdin_is_written_and_closed`: the fake echoes stdin as one line.
  - `the_child_runs_in_cwd`: the fake prints `$PWD`.
  - `cancel_sends_sigint_then_kills_a_child_that_ignores_it`: the fake traps INT and logs `int` to a file, then sleeps. After cancel, `Ended::Cancelled` arrives within 5 s, the log holds `int`, and the pid is gone (the `is_alive` helper from `engine_status_tests.rs`).
  - `a_timeout_ends_as_timed_out`.
  - `a_relative_program_is_not_started`.
  - `a_partial_last_line_is_delivered`: the fake prints `x` with no newline, and `on_line` sees `["x"]`.
  - `the_child_gets_only_the_envs_passed`: with `FOO=1` in the test's own environment and `envs = [("BAR","2")]`, the fake's `env` output holds `BAR=2` and no `FOO`.
  - `dropping_the_run_kills_the_child`: drop the `run_streaming` future mid-run (as an app exit does); the pid is gone within 2 s (`is_alive`).
- [ ] **Step 2: Run** `cargo test --test engine_stream_tests`. Expected: compile error ``unresolved import `tauri_app_lib::engine_status::stream` ``.
- [ ] **Step 3: Implement** following `run_capture`'s ownership pattern: the child is owned outside the timed future.
- [ ] **Step 4: Run** the file, then `cargo test`. Expected: PASS.
- [ ] **Step 5:** Regenerate the README and run `readme-sync`.
- [ ] **Step 6: Commit**: `feat(engine-status): run a program and hand back each line as it prints`.

### Task 9: Claude's argv and stream parser

**Files:**
- Create: `src-tauri/src/agent/claude.rs`, `src-tauri/tests/fixtures/agent/` (Task 1's sanitised streams)
- Test: `src-tauri/tests/agent_claude_tests.rs` (new); `README.md` `tests` figure.

**Interfaces:**
- Consumes: Task 7's `SpawnAuth`; Task 6's `AGENT_TOOLS`.
- Produces:
  - `pub fn write_mcp_config(run_dir: &Path, app_exe: &Path, run_id: &str, real_home: &Path) -> std::io::Result<PathBuf>`. It writes the agent-mode server's config to `<run_dir>/mcp-config.json` as a 0600 file, through a temp file and a rename, and gives the server `"env": {"HOME": <real_home>}`, because the Claude child itself runs with `HOME` set to the run folder (Decision 9). It refuses a relative `run_dir`;
  - `pub fn claude_argv(mcp_config: &Path, auth: &SpawnAuth) -> Vec<String>`. It passes `--mcp-config <that path>`, so no home path, and no JSON, is on the command line;
  - `pub enum AgentEvent` (`Serialize`, tagged `kind`, snake_case), with variants:
    - `Started { run_id: String }`
    - `ToolCalled { tool: String }`, only names in `AGENT_TOOLS` with the `mcp__hanger__` prefix stripped; any other name ends the run as `Finished { outcome: Failed { code: "unexpected_tool" } }`, and Task 10 cancels the child on it
    - `ProposalFiled { proposal_id: String }`, emitted by Task 10 from `<run>/filed`, not parsed from the stream
    - `Finished { outcome: Outcome, turns: Option<u32>, cost_usd_estimate: Option<f64> }`
  - `pub enum Outcome { Answered, BudgetReached, TurnsReached, Cancelled, TimedOut, Failed { code: String } }`;
  - `pub fn parse_line(line: &str, state: &mut ParseState) -> Option<AgentEvent>` and `ParseState::finish(self) -> AgentEvent`, which returns the `Finished` a `result` line gave or `Failed{code:"unreadable_stream"}`.

  The parser never puts model text into an `AgentEvent`. The answer is added in Task 13, after T23.

- [ ] **Step 1: Write the failing tests.**
  - `claude_argv_is_exactly_this`: with the key auth, the argv equals
    `["--bare","-p","--tools","","--strict-mcp-config","--mcp-config","<run>/mcp-config.json","--allowedTools","mcp__hanger__*","--append-system-prompt","<Task 3's prompt>","--output-format","stream-json","--verbose","--no-session-persistence","--max-turns","12","--max-budget-usd","0.50"]`,
    with Task 1's corrections applied if it found any. The prompt goes on stdin, not in argv.
  - `the_mcp_config_is_a_0600_file_and_no_home_is_in_argv`: `write_mcp_config` into a temp run folder gives a file of mode `0o600` whose JSON is `{"mcpServers":{"hanger":{"command":"<exe>","args":["mcp","--agent","<id>"],"env":{"HOME":"<real home>"}}}}`; a relative `run_dir` is `Err`; and `claude_argv`'s output contains neither the real home nor `{`.
  - `the_key_never_rides_in_argv`: key auth's argv contains no `sk-ant`. The argv has no `--settings` and no `apiKeyHelper`.
  - `init_then_tool_then_result_parse_to_events`: on fixture `ping.jsonl`, the sequence is `ToolCalled{tool:"ping"}`, then `Finished{outcome: Answered, turns: Some(n), cost_usd_estimate: Some(x)}` with n and x from the fixture.
  - `a_tool_outside_agent_tools_is_refused`: `mcp__other__x` maps to `Finished{outcome: Failed{code:"unexpected_tool"}}`.
  - `budget_and_turn_caps_are_outcomes`: the `result` subtypes `error_max_budget_usd` and `error_max_turns` map to `BudgetReached` and `TurnsReached`.
  - `unknown_events_and_noise_are_skipped`: `{"type":"stream_event"}`, `not json`, and an empty line each give `None`.
  - `a_stream_without_result_is_unreadable`: `ParseState::finish()` on a stream with no `result` gives `Failed{code:"unreadable_stream"}`.
  - `no_event_carries_model_text`: fixture assistant text `"<text>"` replaced by `"MODEL-SAYS-SECRET"`; none of the serialised events contain it.
- [ ] **Step 2: Run** `cargo test --test agent_claude_tests`. Expected: compile error ``unresolved import `tauri_app_lib::agent::claude` ``.
- [ ] **Step 3: Implement** with `serde_json::Value` lookups on `type`, `subtype`, `num_turns` and `total_cost_usd`, and the tool-use name in `assistant` content.
- [ ] **Step 4: Run** the file, then `cargo test`. Expected: PASS.
- [ ] **Step 5:** Regenerate the README and run `readme-sync`.
- [ ] **Step 6: Commit**: `feat(agent): Claude's headless argv and a stream parser that keeps model text out`.

### Task 10: Runs: folder, scope, record, readiness, and the Channel

**Files:**
- Create: `src-tauri/src/agent/run.rs`
- Modify:
  - `src-tauri/src/lib.rs`: commands `get_agent_readiness`, `start_agent_run` and `cancel_agent_run`, in `generate_handler!`;
  - `docs/ipc.md`: three sections;
  - `src/__tests__/brand-coverage.test.ts`: an `agent/run.rs AGENT_ENGINES` source, floor 1, in the same commit, per design §5;
  - `README.md`: the `ipc` and `tests` figures.
- Test: `src-tauri/tests/agent_run_tests.rs` (new), `src-tauri/tests/ipc_boundary_tests.rs`.

**Interfaces:**
- Consumes: Tasks 6 to 9; P7's `cli_for("claude-code")`, `parse_version`, `is_newer`, and `parse_auth(AuthProbe::ClaudeJson, …)` on `claude auth status` (run through `run_capture`); `resolve::search_path` and `resolve_in`; `scanner::get_engine_key`; `annotations::asset_annotations_on`.
- Produces:
  - `pub const AGENT_ENGINES: &[&str] = &["claude-code"]`;
  - the preference key `agent_engine`, unset by default (ruling 1), set through the existing `set_preference`;
  - `pub enum Subject { Machine, Engine { engine_id: String }, Asset { asset_id: String } }` (`Deserialize`, tagged `kind`);
  - `pub fn scope_for(subject: &Subject, places: &ServerPlaces) -> Result<Scope, String>`;
  - `#[derive(Serialize)] pub struct AgentReadiness { engine_id: Option<String>, installed: bool, version: Option<String>, version_ok: bool, key: KeySource, signed_in_with_subscription: bool, busy: bool }`;
  - `#[derive(Serialize, Deserialize)] pub struct RunRecord { run_id, engine_id, engine_version, subject, question_sha256: String, started_ms: i64, ended_ms: Option<i64>, outcome: Option<Outcome>, tools_called: Vec<String>, proposal_ids: Vec<String>, turns: Option<u32>, cost_usd_estimate: Option<f64>, key_source: KeySource }`. It holds no question or answer text, no key or helper, and no config value. The record is written at start and rewritten at end, by temp file and rename.
  - IPC:
    - `get_agent_readiness() -> AgentReadiness`;
    - `start_agent_run(subject: Subject, question: String, on_event: tauri::ipc::Channel<AgentEvent>) -> Result<String, String>`, where `Err` is a code: `no_engine`, `not_installed`, `needs_update`, `no_key`, `busy`, `empty_question` or `question_too_long`;
    - `cancel_agent_run(run_id: String) -> Result<(), String>`.

  `start_agent_run` does the following, in order:
  1. Validate.
  2. Create `<runs>/<uuid>/` at 0700, with `cwd/` empty inside.
  3. Write `scope.json` and the start record.
  4. `spawn_auth`.
  5. Spawn through `run_streaming` with `claude_argv(std::env::current_exe(), run_id, real_home, …)`, cwd `<run>/cwd`, stdin the question, and envs exactly `PATH` (from `search_path`), `HOME` = `<run>` and, when there is one, `ANTHROPIC_API_KEY` (Decision 9; `run_streaming` clears the rest).
  6. Watch `<run>/filed` every 1 s, sending `ProposalFiled`.
  7. Send each parsed event, then `Finished`, and rewrite the record.

- [ ] **Step 1: Write the failing tests.** They use a fake `claude` script that replays fixture `ping.jsonl`, with injected places, so no Tauri runtime is needed. The orchestration takes a `FnMut(AgentEvent)` sink, which the command wraps around the `Channel`.
  - `readiness_reports_missing_old_and_ready`, three cases:
    - no `agent_engine` preference: `engine_id: None`;
    - the fake prints a version below `MIN_CLAUDE`: `version_ok: false`;
    - otherwise `version_ok: true`.
  - `there_is_no_default_engine`: with the preference unset, start returns `Err("no_engine")`.
  - `a_run_starts_in_an_empty_cwd_under_the_data_dir`: the fake prints `$PWD` into a fixture event, and it equals `<runs>/<id>/cwd`, which held no file at spawn.
  - `the_child_gets_the_key_in_env_and_nowhere_else`: the fake exits 3 unless `$ANTHROPIC_API_KEY == sk-ant-test-0000`. The outcome is `Answered`. `sk-ant-test-0000` appears in no event, in `record.json`, in `scope.json`, in `filed`, or in the argv the fake logs.
  - `the_child_gets_the_login_shell_path`.
  - `the_child_runs_with_the_run_folder_as_home`: the fake prints `$HOME`, and it equals `<runs>/<id>`; after the run, no file under the fixture's real home has changed, and the mcp-config file in the run folder (mode 0600) gives the server the real home, while the fake's logged argv holds the path and no home.
  - `a_stale_key_in_hangers_own_environment_never_reaches_the_child`: with `ANTHROPIC_API_KEY=sk-ant-stale` in the test process and `KeySource::None`, the fake's `env` has no `ANTHROPIC_API_KEY`.
  - `scope_for_an_engine_holds_its_items_and_reaching_assets`, on a fixture store.
  - `the_record_holds_hashes_not_text`: `question_sha256` is the hex SHA-256 of the question, and the record JSON does not contain the question.
  - `filed_proposals_reach_the_sink_and_the_record`.
  - `a_second_run_while_one_is_live_is_busy`.
  - `a_cancelled_run_records_cancelled_and_leaves_no_process`.
  - `a_question_over_2000_characters_is_refused`.
  - `run_files_are_0600_in_0700_folders`.
  - `the_agent_code_never_reaches_telemetry`: the files under `src-tauri/src/agent/` and `src-tauri/src/mcp_server/agent.rs` contain no match for `crate::telemetry` or `telemetry::` (a doc comment saying "never imports telemetry" stays green). Plant `use crate::telemetry;`, see it fail, and revert by inverse edit.
  - In `ipc_boundary_tests.rs`, `agent_readiness_and_events_never_carry_a_key_or_helper`.
- [ ] **Step 2: Run** `cargo test --test agent_run_tests` and `cargo test --test ipc_boundary_tests`. Expected: compile error ``unresolved import `tauri_app_lib::agent::run` ``.
- [ ] **Step 3: Implement.** `agent::run` calls `write_mcp_config` into the run folder before it spawns, and passes the returned path to `claude_argv`. The commands are thin wrappers over `agent::run`, built from `get_db_path`, `app_data_dir` and `server_places`. Add the three `docs/ipc.md` sections. Add the brand-coverage source and floor. Regenerate the README.
- [ ] **Step 3b: Regenerate the README figures.** This task adds a test file, so the `tests` figure moves. Run `~/.bun/bin/bun run src/__tests__/readmeCounts.ts`, then `npx vitest run src/__tests__/readme-sync.test.ts` from the repo root. Expected: PASS. Add `README.md` to the commit.
- [ ] **Step 4: Run** all four gates. Expected: PASS. Plant `"not-an-engine"` in `AGENT_ENGINES` and run `npx vitest run src/__tests__/brand-coverage.test.ts`: expected FAIL. Revert by inverse edit.
- [ ] **Step 5: Commit** the listed files: `feat(agent): one headless Claude run per question, streamed over a Channel, recorded by hash`.

### Task 11: T23, asked again in Plannotator (first UI task; human gate, stop for Karthik)

- [ ] **Step 1:** Write `docs/plans/2026-11-28-phaseB-t23-question.md`. The question is whether model output on screen should use (a) an A2UI catalogue of Hanger's specimened components, or (b) Hanger's own typed format. It gives the research's facts only, with no pick:
  - `@a2ui/react` 0.16.1 (published 2026-11-23, Apache-2.0) declares peers `react ^17 || ^18 || ^19`, and **nothing has been rendered with it here**.
  - It needs seven packages Hanger doesn't have: `@a2ui/web_core`, `lit`, `@preact/signals-core`, `zod ^3.25`, `zod-to-json-schema`, `markdown-it` and `validate-color`.
  - The package is still 0.x, while the spec it renders is at 1.0. It accepts custom catalogues.
  - A format of Hanger's own would be a Rust enum validated at the boundary, rendered by existing specimened components, with no new dependencies.

  Also record what the answer will carry in phase B: a short answer, plus references to assets, engines and proposals by id.
- [ ] **Step 2:** Put it to Karthik through the `plannotator` skill (annotate, gated), in the background, and keep to non-UI work meanwhile.
- [ ] **Step 3:** Record in the same file whether Anthropic has answered on the subscription route. With no answer, nothing in this plan or after it builds a subscription route; `--bare` with the user's key is the only path.
- [ ] **Step 4: Stop** until his answer is in the file. Task 13 follows the branch he picks. Commit the file: `docs(plans): T23 asked again for phase B, with his answer`.

### Task 12: Layout options for the agent surface (human gate, stop for Karthik)

- [ ] **Step 1:** Render two or three options at true width, in real tokens, in both themes, using the design skill. Put the canvas files in `docs/design-ref-prototypes/`. Each option shows these states:
  - engine not picked (the picker, with Claude Code and no default);
  - not installed;
  - needs an update;
  - no key, including "signed in with a subscription; needs an API key";
  - ready;
  - running, with tool calls by Hanger's names;
  - a proposal waiting (P1's band, read and write variants);
  - answered (in T23's format);
  - budget or turns reached;
  - cancelled;
  - failed.

  The research's pick to include is a tab in the selected engine's or asset's inspector, started from ⌘K. Also include a Global (machine) entry point.
- [ ] **Step 2:** Run every string through `/humanizer`, checked against Task 3's signed-off names. Any string new since Task 3 gets a naming brief entry.
- [ ] **Step 3: Stop.** Karthik picks, often a hybrid, and signs off the strings. Record his choice in `docs/plans/2026-11-28-phaseB-surface-layout.md` and commit it, along with the moved prototypes.

### Task 13: The answer, in the format T23 chose

**Files:**
- Modify: `src-tauri/src/agent/claude.rs` (argv adds `--json-schema <Hanger's schema>` and the parser reads `structured_output`), `src-tauri/src/agent/run.rs`
- Create: `src-tauri/src/agent/answer.rs`
- Test: `src-tauri/tests/agent_claude_tests.rs`
- Branch (a), A2UI only: also `package.json` and `bun.lock` (`@a2ui/react` pinned exactly at `0.16.1`).

**Interfaces:**
- Produces `AgentEvent::Answered { answer: Answer }`, sent before `Finished`.
  - **Branch (b), Hanger's own:** `Answer { blocks: Vec<Block> }`, where `Block` is one of `Text { text: String }`, `Asset { asset_id: String }`, `Engine { engine_id: String }` or `Proposal { proposal_id: String }`.
  - **Branch (a), A2UI:** `Answer { a2ui: serde_json::Value }`, holding only components named in Hanger's catalogue (`A2UI_CATALOGUE: &[&str]`, specimened components only).

  In both branches, validation is in Rust:
  - Text is stripped of control characters except `\n`, and capped at 4,000 characters in total.
  - Ids are kept only if they are in the run's `Scope` (assets, engines) or `filed` (proposals). Others are dropped.
  - Names are resolved by Hanger, never taken from the model.
  - Text is shown, never parsed into an action (rule 1).

- [ ] **Step 1: Write the failing tests.**
  - `an_answer_is_validated_before_it_is_sent`: a fixture `structured_output` with one out-of-scope asset id and one in-scope id gives exactly one `Asset` block.
  - `control_characters_are_stripped_and_text_is_capped`: 5,000 characters in gives 4,000 out.
  - `an_answer_that_fails_the_schema_is_failed_not_shown`: the outcome is `Failed{code:"unreadable_answer"}` and there is no `Answered`.
  - Branch (a) only, first: `src/__tests__/a2uiRenders.test.tsx` mounts `@a2ui/react` under React 19 with one catalogue component. If it cannot pass, stop and report to Karthik; T23 reopens.
- [ ] **Step 2: Run** `cargo test --test agent_claude_tests`. Expected: compile error ``no variant named `Answered` ``.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the four gates. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(agent): the run's answer, validated in Rust before it reaches the webview`.

### Task 14: The agent surface

**Files:** decided at Task 12. Expect:
- a component under `src/components/` with its test;
- a Design system specimen (`design-system-coverage.test.ts`) and its `DESIGN.md` paragraph;
- a typed client for the three commands, with `AgentEvent` narrowed at the boundary (`verification.md`: no wide hand-written mirror);
- a hunk-staged change in `src/App.tsx` if the entry point lives there.

**Interfaces:** Consumes Task 10's IPC and Task 13's `Answer`; P1's approval band for waiting proposals and `src/types/mcpProposals.ts`. This task adds the read arm to both: `PreviewTarget` gains `{ kind: "read"; tool: "engine_context" | "reach"; engine_id: string | null }` in `mcpProposals.ts` (mirroring Task 5 exactly, no optional field standing in for a variant), and the band renders Task 3's read line for it. Tell P1 on `SendMessage` before editing its files.

- [ ] **Step 1: Write the failing Vitest tests.**
  - With `agent_engine` unset, the picker shows, no engine is preselected, and Ask is disabled.
  - Each readiness state renders its signed-off string.
  - Submitting calls `start_agent_run` with the subject the surface was opened on and a `Channel`.
  - `ToolCalled` renders Hanger's name for the tool, never the raw id.
  - `ProposalFiled` renders P1's band for that id.
  - A read preview (`target.kind === "read"`, `change.type === "nothing"`) renders Task 3's read line in P1's band; a write preview filed by the agent renders P1's own asked-by line.
  - `Answered` renders through Task 13's renderer, with names from the backend.
  - Cancel calls `cancel_agent_run`.
  - No figure is computed from `.length` (`no-frontend-counting.test.ts` stays green).
  - No `window.confirm` (`no-blocking-dialogs.test.ts`).
  - Tokens and type roles only (`no-off-token-styles.test.ts`, `type-roles.test.ts`).
- [ ] **Step 2: Run** `npx vitest run <file>` from the repo root. Expected: red, with the module not found.
- [ ] **Step 3: Implement** per Task 12.
- [ ] **Step 3b: Regenerate the README figures.** This task adds a test file, so the `tests` figure moves. Run `~/.bun/bin/bun run src/__tests__/readmeCounts.ts`, then `npx vitest run src/__tests__/readme-sync.test.ts` from the repo root. Expected: PASS. Add `README.md` to the commit.
- [ ] **Step 4: Run** the four gates. Expected: PASS.
- [ ] **Step 5: Screenshots** from the running dev app, per `verifying-ui.md`: filter by the dev pid, read the theme from the store, and name it. Capture each Task 12 state that can be reached without a key (picker, not installed or no key, ready), saved under `docs/evidence/phaseB/`. The keyed states are Task 15's.
- [ ] **Step 6: Commit** the component files, the specimen, `DESIGN.md`, `src/types/mcpProposals.ts` and the band's file: `feat(agent): ask Hanger's agent from the inspector`. From this track's own worktree, by explicit path. From the shared main checkout with `src/App.tsx` touched: the Global Constraints' exact-blob recipe and a bare `git commit`, then build the commit in a detached worktree and run `npx vitest run` there.

### Task 15: Live run with Karthik's key (human gate, stop for Karthik)

- [ ] **Step 1:** Re-capture the per-kind counts (Task 4's command) to `docs/evidence/phaseB/counts-live-before.txt`. Note the target server's config file and copy its bytes aside.
- [ ] **Step 2: Karthik, in the dev app,** with his key in his login shell, picks Claude Code. On one engine he asks the agent to switch one named MCP server off. Hanger shows the proposal, and he approves it. He then asks for the Undo, and approves that.
- [ ] **Step 3: Artefacts,** each saved under `docs/evidence/phaseB/`:
  - the config file's `diff` after the approval (one switch) and after the Undo (identical to the copy);
  - both proposal files, showing `Applied` with their receipt ids;
  - the run's `record.json`, showing `outcome: answered` and holding no question text: `grep -c` of a word from his question prints 0, and `grep -c sk-ant` prints 0;
  - screenshots of the waiting band, the applied state and the answer, by dev pid and with the theme named.
- [ ] **Step 4:** Per-kind counts after this plan's last commit and the live run, to `counts-after.txt`. Every category must equal `counts-live-before.txt`, because the switch was undone; compare with `counts-before.txt` too and report any move a peer's scan explains. A difference is a blocker to report.
- [ ] **Step 5:** A fresh reviewer runs `stage-gate --dev` on phase B's own commits (bounded to this plan's SHAs, per `shared-checkout.md`). Karthik alone closes the iteration.

## Human gates

| Gate | Where | Verified by |
|---|---|---|
| Go-ahead and key for spike A's keyed runs | Task 1, Step 3 | his written yes; the results file |
| Go-ahead and key for spike B's live run (only if the dry dump can't answer) | Task 2, Step 3 | the results file |
| Naming brief for phase B's model-facing strings and the surface's name, with `/humanizer` | Task 3 | his sign-off in the brief file |
| T23 asked again in Plannotator, and Anthropic's answer recorded before any subscription route | Task 11 (the first UI task) | his answer in `2026-11-28-phaseB-t23-question.md` |
| Layout options at true width, with `/humanizer` on every surface string | Task 12 | `2026-11-28-phaseB-surface-layout.md` |
| Live run with his key, ending in an approved switch and its Undo | Task 15 | config diffs, proposal receipts, run record, store counts, screenshots |

## Known limits

- **An agent-filed write reads "Claude Code asks…"** in P1's band, because `asked_by` comes from `clientInfo` and `Proposal` gains no origin field (Decision 8). Only reads say "Hanger's agent asks".
- **Which `authMethod` value means "subscription"** is unmeasured (P7's note), so the "signed in with a subscription" copy keys on a value Task 1 or a live sign-in must confirm.
- **T23's timing:** design §4.8 says T23 is ruled "before its first build task", while §7 and the plan brief say before the first UI task. This plan follows §7 (Task 11).
- **The real home is in the mcp-config file**, a 0600 file in the run folder (the mcp-config's `env`). It is not on Claude's command line, so `ps` does not show it. The run folder holds it until the run's record is written.
- **Under round 44 Q3's "no"**, Tasks 5 to 10 change as each task states; the provisional default is what is planned in full.
