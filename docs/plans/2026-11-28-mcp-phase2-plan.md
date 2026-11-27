# MCP phase 2: proposals approved in Hanger. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Reconciled 2026-11-28** after the `--plan` review (`docs/reviews/2026-11-28-plan-2026-11-28-mcp-phase2-plan.md`), applying `docs/plans/research/2026-11-28-reconciliation-rulings.md` R3 (this plan owns `Ask`, the filing functions, `Preview`, the tools and Gate N) and the P1 fixes: the ambiguity test uses names of 129+ characters; the withheld rule is a character allowlist; `scanned` and `measure` become `pub(crate)`; Task 6 regenerates the README; an in-app Undo leaves the proposal reading `undone`; skills switch on and off directly (Q10). To serve P3, P4 and P8 without a later rename, `Preview.to` is `Option<ItemState>` and `Status::Applied` carries an optional `stopped_at`. Every shared name is in `docs/plans/research/2026-11-28-cross-plan-interfaces.md`.

**Goal:** A user's engine asks Hanger's MCP server to switch one server or skill on or off, or to undo an earlier proposal. The server files a proposal and changes nothing. Hanger's window shows Hanger's own statement of the change, a person approves or declines it, and the app applies it through the existing switch code, with a receipt and an Undo.

**Architecture:** The server (`src-tauri/src/mcp_server/`) resolves the model's public ids against the live context and writes one 0600 JSON file per proposal under `<data>/mcp/proposals`. That folder is the only thing it writes. The app polls `list_mcp_proposals`. `approve.rs` builds each preview from Hanger's own reading of the files and, on approval, calls `mcp::switch::ops` or `skill_switch::ops` unchanged, in the app's own process. `Ask` is the closed, extend-only enum of what a model may request.

**Tech Stack:** Rust crate `tauri-app` (lib `tauri_app_lib`), `rmcp` 3.12, `uuid` 1 (v4), `similar` 2.5 (already in `Cargo.toml`, unused under `src/` today), `tokio` 1; React 19 + TypeScript + Vitest.

**Spec:** `docs/plans/2026-11-28-harness-design.md`: §4.1, §5 (owner row "`mcp_server` and the proposal queue"), §7, and the binding "Answers (round 43)", Q10 above all. Research: `docs/plans/research/2026-11-28-mcp-phase2-proposals.md`. This plan replaces Tasks 8 to 11 and Gates G3 and G4 of `docs/plans/2026-11-27-hanger-mcp-server.md`. Its Decisions 3 to 6, its Global Constraints and its Answers still bind.

## Global Constraints

- Verbs: **on, off, undo** (design §4.1). `Ask` is extended by later plans and never replaced. Q10 allows "on and off, Undo, add and remove (by Registry id or an existing entry), and loading a profile", and forbids "restore an old copy or install or update skills and plugins".
- "No free text in a proposal" (server plan Answer 7). Every verb takes identifiers Hanger resolves, never values (design §4.1).
- The server "never starts a process" (Decision 3) and never writes an engine's config. It writes only under `<data>/mcp/proposals`: the folder is 0700, each file 0600, written to a temp file and renamed, at an absolute path.
- Every new tool runs through `tools.rs` → `scanned()` (research §2, correction 6).
- Secrets never cross IPC or reach a model. A preview line that holds anything other than the flag is withheld (Task 4). No credential file is read.
- No store migration. `STORE_VERSION` stays 8. Proposals are files (design §5, last row).
- The app polls every 3 s while the document is visible, and on window focus. No new event, so the README's "three events" stays true (`readmeCounts.ts`).
- Expiry 10 minutes (`EXPIRES_AFTER_MS = 600_000`), at most 5 waiting (`MAX_WAITING = 5`). Both are Hanger's choices (design §9).
- Every new string gets a naming brief, a `/humanizer` pass and Karthik's sign-off before it lands (`ui-copy.md`). Counts come from the backend (`invariants.md`).
- Red first for every change under `src-tauri/src/`. Each such change gets its own diff (`verification.md`).
- Tests that call `discover`, `get_home_dir`, `sanitise_path` or `engine_base` run in a child process with `env_clear()` and `HOME`/`HANGER_TEST_HOME` set to one canonicalised fixture home. Copy the pattern of `mcp_server_boundary_tests.rs` → `child_call`. No test calls `set_var` or `remove_var` (server plan, Global Constraints).
- Nothing in `src-tauri/src/mcp_server/` prints (`mcp_server_tests.rs` → `the_server_module_never_prints`). That includes `approve.rs`, which takes places as parameters and touches nothing Tauri.
- Gates: the four in `CLAUDE.md` → Verification, each in its own call from its stated directory. `cargo test` relaunches the dev app, so never run it during a capture.
- Commits: track Q builds in its own worktree, so commit with explicit paths, in a Bash call of its own, with no `-n` anywhere in it. If `src/App.tsx` is ever committed from the shared main checkout, stage it by hunk (`shared-checkout.md`).

## Review Focus

1. **A one-line config entry.** In a JSON config that keeps a server on one line (`"github": {"command": "x", "env": {"TOKEN": "…"}}`), the line that changes also holds the env value. The person expects to see the change without the secret. Pinned in Task 4 (`a_line_holding_more_than_the_flag_is_withheld`) and Task 5 (`proposal_previews_never_carry_a_config_value`).
2. **A proposal id from the model is a path attack.** `get_proposal("../../hanger.db")` and `propose_undo("x/../y")` must touch no file outside the folder. An id that does not parse as a UUID is `not_found`, and nothing is read. Pinned in Task 1 (`an_id_that_is_not_a_uuid_touches_no_file`).
3. **The file changes between filing and approval.** The person edits the config, or switches the server by hand, after the model asked. Approval runs `ops`'s own checks again. It writes nothing and records `Failed { code }` with `ops`'s code, or `Applied { receipt_id: None }` when the item is already as asked. Pinned in Task 5 (`a_proposal_whose_server_changed_since_is_failed_not_applied`, `a_proposal_already_satisfied_applies_with_no_receipt`).
4. **Two approvals at once.** A double click, or a poll racing a click, calls `decide` twice. One write happens. The second call gets `not_waiting`. Pinned in Task 5 (`a_second_decide_is_not_waiting_and_writes_nothing`).
5. **Hanger is closed when the model asks.** The reply tells the model to open Hanger. After 10 minutes the proposal reads `expired` and cannot be approved. Pinned in Task 1 (`a_waiting_proposal_older_than_ten_minutes_reads_expired`) and Task 5 (`an_expired_proposal_cannot_be_approved`).

## How the eight corrections in research §2 are folded in

| # | Correction | Where |
|---|---|---|
| 1 | `public_key` collides: two names over 128 characters sharing their first 127, and a path outside home sanitising to its basename | Task 2: resolve against the live context, exactly one match or `ambiguous`; the real key is stored |
| 2 | No tool gives a `skill:` key | Task 2: the skill tool takes `asset_id` as `find_assets` returns it (`~/.agents/skills/<name>`). Off resolves through `switch_info_for`; on resolves the same name among `kept_for`'s kept skills |
| 3 | `Undo { receipt_id }` lets a model name any receipt | Task 2: `propose_undo(proposal_id)`; the receipt is read from that proposal's own file |
| 4 | Preview assumed `edit::set_enabled` on the config | Task 4: all four `SWITCHES` rows (Codex, Claude Code, Gemini CLI's state file, Antigravity CLI) and skills |
| 5 | Wrappers left out `skill_switch_projects(&app)` | Task 5: `decide_mcp_proposal` passes it |
| 6 | Scan gate unstated | Tasks 2 and 3: every new tool goes through `scanned()` |
| 7 | Copy goes false (`INSTRUCTIONS`, `docs/mcp-server.md`) | Gate N, then Task 3 |
| 8 | `vendor.rs:330`/`:544` citations | Cited by symbol: `vendor::claude_off`'s `mcp remove` argv and `vendor::add_json` |

## Cross-plan interfaces

Every consumed name below exists on `main` today (checked at `c45a702`). This plan calls each one unchanged and defines none of them. The full table, with every consumer, is `docs/plans/research/2026-11-28-cross-plan-interfaces.md`.

- **P2 (slice 2) owns `mcp::switch::ops`, `context`, `edit` (flags) and `SWITCHES`.** This plan uses:
  - `ops::context_for(&SwitchPlaces, &str, P) -> EngineContext`;
  - `ops::set_enabled_for(&SwitchPlaces, &ClaudeCli, engine_id: &str, key: &str, enabled: bool, P) -> Result<SwitchReply, SwitchFailure>`;
  - `ops::undo_for(&SwitchPlaces, &ClaudeCli, engine_id: &str, receipt_id: &str, P) -> Result<SwitchReply, SwitchFailure>`;
  - `ops::cached_measure`, `ops::cached_measure_on`, `ops::uses_claude_cli`;
  - `SwitchPlaces`, `ClaudeCli`, `SwitchFailure::code`;
  - `context::ItemState`, `ContextItem`, `context::dialect_of` (`pub(crate)`), `context::STASH_KEY`;
  - `edit::set_enabled`, `edit::gemini_set_enabled`;
  - `registry::switch_for`.
  - P2 keeps these source-compatible (design §5): `set_enabled_for` becomes `set_enabled_at(Target::Machine { key })` and `undo_for` becomes `undo_at(None, …)`, with signatures unchanged. Project items (`Target::InProject`) appear only in P2's `context_in`, which this plan never builds, so a model cannot name one: an unknown key is `NotFound`. Moving `approve::preview` onto P2's resolver is a follow-up once P2 merges.
- **P4a owns `mcp::switch::apply`.** This plan uses `apply::latest_receipts(&Path) -> Vec<Receipt>` and `Receipt { id, path, backup_file, .. }`, unchanged. After P4 Task 1, `apply::undo` routes a key receipt to `apply::undo_key` (R1); only P2's per-project Claude switch makes one, and a model can't propose that, so this plan's previews never meet one.
- **P3 owns `mcp::switch::vendor`.** This plan uses `vendor::claude_stashed(&Path) -> Vec<StashedServer>` (for `id` and `name`), unchanged.
- **P5 owns `skill_switch`.** This plan uses, unchanged (P5 Task 1 pins them):
  - `skill_switch::ops::switch_info_for(&SkillPlaces, &Path) -> Option<SkillSwitchInfo>`;
  - `set_enabled_for(&SkillPlaces, &[PathBuf], key: &str, enabled: bool) -> Result<SkillSwitchReply, SkillSwitchFailure>`: `skill:<name>` off, `kept-skill:<uuid>` on;
  - `undo_for(&SkillPlaces, &[PathBuf], receipt_id: &str)`;
  - `kept_for(&SkillPlaces) -> KeptSkills`.
- **P7 (T19) owns `engine_status`.** This plan uses `lib.rs` → `claude_cli_for(engine_id)`, which calls `engine_status::resolve::search_path` and `resolve_in`, as it does today.
- **Unowned, used as is:** `discover::discover_machine_at`, `discover::engine_display_name` (`pub(crate)`), `agents::engine_base`, `domain::RegistrationKey`, `preferences::sanitise_path`.
- **Unowned shared file:** `src/hooks/useMcpSwitch.ts`. P1 (`decideProposal`), P2 (`project`) and P4 (`loadProfile`) all modify it. Merge order follows the waves, P1 → P2 → P4; whichever lands second rebases onto the first.

**What this plan owns and others extend** (design §5, ruling R3). The names below are the ones every sibling plan uses:

- `mcp_server`, the proposal queue, and `proposals::{Proposal, Ask, Status, save, load, waiting, sweep, Filed, ProposalState, EXPIRES_AFTER_MS, MAX_WAITING, FORGET_AFTER_MS}`.
- `Ask`, tagged by `verb`. P1's variants are `Server`, `Skill` and `Undo`. **P3** adds `Add { engine_id, from_key }`, `Remove { engine_id, key }` and `AddFromRegistry { engine_id, registry_name, version }`. **P4b** adds `ApplyProfile { profile, everything_else_off }`. **P8** adds `Read { tool, id }`.
- One filing function per verb, each `(p: &ServerPlaces, …, asked_by: Option<&'static str>, now_ms: i64) -> Result<Fresh<Filed>, Refusal>`: P1's `propose_server`, `propose_skill`, `propose_undo` and `get_proposal`; P3's `propose_add`, `propose_remove`, `propose_registry_add`; P4b's `propose_profile`; P8's `propose_read`.
- The tools in `TOOLS` (`mcp_server/mod.rs`): `propose_server_switch`, `propose_skill_switch`, `propose_undo`, `get_proposal`; working names until Gate N.
- `approve::{Preview, PreviewTarget, Change, PendingProposals, pending, decide, engine_of, undo_approved}`, `list_mcp_proposals`, `decide_mcp_proposal`, `undo_mcp_proposal`, and the approval surface. `Preview { …, to: Option<ItemState>, target: PreviewTarget, change: Change }`: `to` is `None` for a verb that is not on or off (P3's add and remove, P4b's profile, P8's read). P4b adds `PreviewTarget::Profile`, P8 adds `PreviewTarget::Read`. `Change` is not extended: P3 uses `Lines`, `Command` and `Withheld`, P4b `Lines`, P8 `Nothing`.
- `Status::Applied { receipt_id, stopped_at }`: `stopped_at` is `None` for every P1 verb and is left out of the wire when `None`. P4b sets it to the failure code where a partial profile load stopped.

Each later plan adds its own variant, its own filing function, its own preview arm and its own decide arm. None of them renames or removes a variant or a field. Task 1's wire-shape test enforces that.

## File structure

- `src-tauri/src/mcp_server/places.rs`: modify. Adds `proposals_dir`, `ServerPlaces.proposals` and `server_places_in`.
- `src-tauri/src/mcp_server/proposals.rs`: create. Holds `Proposal`, `Ask`, `Status`, the file store and filing. The server process calls it.
- `src-tauri/src/mcp_server/approve.rs`: create. Holds previews and `decide`. Only the app process calls it.
- `src-tauri/src/mcp_server/tools.rs`: modify. Adds the `Refusal` variants and makes `public_key` `pub(crate)`.
- `src-tauri/src/mcp_server/mod.rs`: modify. Four tools, `Spec.choices`, `run` gains `asked_by`, and the module doc.
- `src-tauri/src/mcp_server/strings.rs`: modify. Gate N's strings.
- `src-tauri/src/lib.rs`: modify. Three commands, `generate_handler!` and a `server_places(app)` helper.
- `src-tauri/tests/mcp_proposal_tests.rs`: create. `mcp_server_protocol_tests.rs` and `ipc_boundary_tests.rs` are modified.
- `docs/mcp-server.md`, `docs/ipc.md`, `README.md` (generated figures) and `.claude/DESIGN.md` (the new surface's paragraph).
- Frontend:
  - `src/types/mcpProposals.ts` (create);
  - `src/hooks/useMcpProposals.ts` (create);
  - `src/hooks/useMcpSwitch.ts` (modify);
  - the surface's component files, named at Gate G3;
  - `src/components/SearchPalette.tsx`, `src/App.tsx`, and the Design system page's specimen.

---

## Gate P: `stage-gate --plan` (fresh reviewer, not the author)

- [ ] A fresh reviewer runs `stage-gate --plan` on this file. Its findings are fixed before Gate N.

## Gate N: naming brief, P1's part of the batched round (STOP for Karthik)

- [ ] Write P1's entries in the batched naming brief (design §7, "one batched naming brief"). Research each first-time label against the app's nouns (`ui-copy.md`, `src/utils/prose.ts`). Entries:
  - **The four tool names, titles, descriptions and argument lines.** The working names are `propose_server_switch(engine_id, key, state)`, `propose_skill_switch(asset_id, state)`, `propose_undo(proposal_id)` and `get_proposal(proposal_id)`, with `state` one of `on` and `off`.
  - **The filing note** each `propose_*` reply carries: waiting in Hanger's window, open Hanger if it is closed, expires in 10 minutes.
  - **The refusal texts:** `ambiguous`, `read_only`, `already_so`, `queue_full`, `not_undoable`, plus `not_found` reworded for proposal ids.
  - **The rewritten `strings::INSTRUCTIONS`.** "Nothing here changes a file" goes false.
  - **The rewritten `docs/mcp-server.md`.** "Five tools" and "never changes a file" go false.
  - **The band:** its name, Approve and Decline, and the line for each `Change` kind (lines, withheld, command, skill move, nothing, unavailable).
  - **The state words** a model reads back through `get_proposal`, `undone` included.
  - **The pill's waiting line**, which names the item and the engine. The asked-by wording is "Claude Code asks…" when `asked_by` maps and "An engine asks…" when it does not.
  - **The ⌘K action.**
  - **The decide failure codes** `not_waiting` and `expired`, as words.
- [ ] `/humanizer` on every string. Karthik signs off. Record his answers under "Answers (Gate N)" at the end of this file. `strings.rs` takes them verbatim.

---

### Task 1: The proposal record and its folder

Lands the owned interfaces first, before any tool or command uses them.

**Files:**
- Modify: `src-tauri/src/mcp_server/places.rs`, `src-tauri/src/mcp_server/mod.rs` (`pub mod proposals;`)
- Create: `src-tauri/src/mcp_server/proposals.rs`
- Test: `src-tauri/tests/mcp_proposal_tests.rs` (new)

**Interfaces:**
- Produces, in `places.rs`:
  - `pub fn proposals_dir(data_dir: &Path) -> PathBuf`, which is `data_dir/mcp/proposals`;
  - `ServerPlaces { …, pub proposals: PathBuf }`;
  - `pub fn server_places_in(home: &Path, system: &Path, data_dir: &Path) -> ServerPlaces`. `server_places_at` becomes `server_places_in(home, system, &data_dir_for(home))`.
- Produces, in `proposals.rs`:
  - `pub const EXPIRES_AFTER_MS: i64 = 600_000; pub const MAX_WAITING: usize = 5; pub const FORGET_AFTER_MS: i64 = 86_400_000;`
  - `#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)] pub struct Proposal { pub id: String, pub at_ms: i64, pub asked_by: Option<String>, pub ask: Ask, pub status: Status }`. `id` is a UUID v4. `asked_by` is an engine id from Task 3's fixed table, never client text.
  - `#[serde(tag = "verb", rename_all = "snake_case")] pub enum Ask { Server { engine_id: String, key: String, enabled: bool }, Skill { key: String, enabled: bool }, Undo { of: String } }`. `key` is the real resolved key: `skill:<name>` for a skill going off, `kept-skill:<uuid>` for one coming back on. `of` is a proposal id.
  - `#[serde(tag = "state", rename_all = "snake_case")] pub enum Status { Waiting, Applied { receipt_id: Option<String>, #[serde(default, skip_serializing_if = "Option::is_none")] stopped_at: Option<String> }, Undone { receipt_id: Option<String> }, Declined, Expired, Failed { code: String } }`. `Expired` is derived on read and never written. `Undone` is written when the change a proposal applied is taken back, by the in-app Undo (`undo_approved`, Task 5) or by an approved `Undo` proposal; its `receipt_id` is the Undo's own. `stopped_at` is always `None` here; P4b sets it for a partial profile load.
  - `pub fn save(dir: &Path, p: &Proposal) -> std::io::Result<()>` refuses a relative `dir`. It makes `dir` 0700 if missing and writes `<id>.json` as 0600 through a temp file in `dir` and a rename.
  - `pub fn load(dir: &Path, id: &str, now_ms: i64) -> Option<Proposal>` returns `None` unless `uuid::Uuid::parse_str(id)` succeeds, before any filesystem call. A `Waiting` older than `EXPIRES_AFTER_MS` reads `Expired`.
  - `pub fn waiting(dir: &Path, now_ms: i64) -> Vec<Proposal>` lists unexpired `Waiting` proposals, oldest first. It skips files that don't parse and names that aren't `<uuid>.json`.
  - `pub fn sweep(dir: &Path, now_ms: i64)` removes `<uuid>.json` files whose `at_ms` is older than `FORGET_AFTER_MS`, whatever their status.

- [ ] **Step 0: Per-kind baseline**, read-only. Run `sqlite3 -readonly "$HOME/Library/Application Support/com.rkarthik.hanger/hanger.db" "select category, scope, count(*) from assets group by category, scope order by category, scope;"`. Paste the output into the task report.
- [ ] **Step 1: Write the failing tests** in `mcp_proposal_tests.rs`, each on a `tempfile` folder:
  - `the_ask_wire_shape_is_pinned`: `serde_json::to_value` of each `Ask` and `Status` variant equals a literal. For example `Ask::Server{engine_id:"codex",key:"/h/.codex/config.toml:github",enabled:false}` is `{"verb":"server","engine_id":"codex","key":"/h/.codex/config.toml:github","enabled":false}`, and `Status::Applied{receipt_id:Some("file:1"),stopped_at:None}` is `{"state":"applied","receipt_id":"file:1"}` (no `stopped_at` key). `Status::Applied{receipt_id:Some("profile-load:u"),stopped_at:Some("write_failed")}` is `{"state":"applied","receipt_id":"profile-load:u","stopped_at":"write_failed"}`, and `Status::Undone{receipt_id:Some("file:2")}` is `{"state":"undone","receipt_id":"file:2"}`. Deserialising each literal gives the variant back.
  - `a_proposal_carries_no_free_text`: the serialised `Proposal` has exactly the keys `id`, `at_ms`, `asked_by`, `ask` and `status`.
  - `proposal_files_are_0600_in_a_0700_folder`: after `save` into a missing `dir`, the mode of `dir` is `0o700` and the file's is `0o600`.
  - `a_relative_folder_is_refused`: `save(Path::new("rel/p"), …)` is `Err`, and `rel` is not created.
  - `an_id_that_is_not_a_uuid_touches_no_file`: plant `secret.json` beside the folder. `load(dir, "../secret", now)` and `load(dir, "x/../y", now)` are `None`.
  - `a_waiting_proposal_older_than_ten_minutes_reads_expired`: `at_ms = 0`. `load(dir, id, 600_000)` is `Waiting`. `load(dir, id, 600_001)` is `Expired`, and `waiting(dir, 600_001)` is empty.
  - `waiting_is_oldest_first_and_skips_junk`: three proposals at 30, 10 and 20, plus `junk.json` and a `<uuid>.json` holding `{`. The ids come back in the order 10, 20, 30.
  - `sweep_forgets_after_a_day`: files at `at_ms` 0 and 50_000_000. `sweep(dir, 86_400_001)` leaves only the second.
- [ ] **Step 2: Run** `cd src-tauri && cargo test --test mcp_proposal_tests`. Expected: FAIL to compile, with `unresolved import tauri_app_lib::mcp_server::proposals`.
- [ ] **Step 3: Implement** the interfaces above. `places.rs`'s existing tests stay as they are.
- [ ] **Step 4: Run** the file, then the full `cargo test` from `src-tauri/`. Expected: PASS. `mcp_server_tests` is unchanged and green.
- [ ] **Step 5: Regenerate the README.** Run `~/.bun/bin/bun run src/__tests__/readmeCounts.ts` (a new file under `src-tauri/tests/`), then `npx vitest run src/__tests__/readme-sync.test.ts` from the repo root. Expected: PASS.
- [ ] **Step 6: Commit** `src-tauri/src/mcp_server/places.rs`, `proposals.rs`, `mod.rs`, `src-tauri/tests/mcp_proposal_tests.rs` and `README.md` with the message `feat(mcp-server): the proposal record, its 0600 file and its folder`.

### Task 2: Filing a proposal: public ids resolved to real keys

**Files:**
- Modify: `src-tauri/src/mcp_server/proposals.rs`, `src-tauri/src/mcp_server/tools.rs`, `src-tauri/src/mcp_server/strings.rs` (refusal texts from Gate N)
- Test: `src-tauri/tests/mcp_proposal_tests.rs` (child-process helper `child_propose`, modelled on `mcp_server_boundary_tests.rs` → `child_call`)

**Interfaces:**
- Consumes: Task 1, `ops::context_for`, `skill_switch::ops::switch_info_for`, and `tools::scanned` and `measure`.
- Produces:
  - `tools::Refusal` gains `Ambiguous`, `ReadOnly`, `AlreadySo`, `QueueFull` and `NotUndoable`, with codes `ambiguous`, `read_only`, `already_so`, `queue_full` and `not_undoable`. `strings::refusal` gets one arm each, from Gate N.
  - `tools::public_key`, `tools::scanned` and `tools::measure` become `pub(crate)`, so `proposals.rs` can call them. All three are private `fn`s on `main` today. P8's agent mode calls the same three.
  - `pub struct Filed { pub id: String, pub expires_at_ms: i64 }`, `Serialize`.
  - `pub struct ProposalState { pub id: String, pub state: String, pub failure_code: Option<String>, pub undoable: bool }`, `Serialize`. `state` is `Status`'s tag. `undoable` is `Applied` with `Some` receipt on a non-`Undo` ask; an `Undone` proposal is not undoable.
  - `pub fn propose_server(p: &ServerPlaces, engine_id: &str, key: &str, enabled: bool, asked_by: Option<&'static str>, now_ms: i64) -> Result<Fresh<Filed>, Refusal>`
  - `pub fn propose_skill(p: &ServerPlaces, asset_id: &str, enabled: bool, asked_by: Option<&'static str>, now_ms: i64) -> Result<Fresh<Filed>, Refusal>`
  - `pub fn propose_undo(p: &ServerPlaces, proposal_id: &str, asked_by: Option<&'static str>, now_ms: i64) -> Result<Fresh<Filed>, Refusal>`
  - `pub fn get_proposal(p: &ServerPlaces, proposal_id: &str, now_ms: i64) -> Result<Fresh<ProposalState>, Refusal>`
- Rules, applied in this order. Each one runs `scanned(p)?` first and writes nothing on any `Err`:
  - **`propose_server`:**
    1. Take the items of `context_for(&p.switch, engine_id, measure(&conn))` whose `public_key(&item.key) == key`.
    2. No match is `NotFound`. More than one is `Ambiguous`.
    3. `read_only.is_some()` is `ReadOnly`.
    4. `(state == On) == enabled` is `AlreadySo`.
    5. `waiting(...).len() >= MAX_WAITING` is `QueueFull`.
    6. Otherwise save `Ask::Server { engine_id, key: item.key (the real one), enabled }`.
  - **`propose_skill`** (Q10 grants on and off, so both are filed directly):
    1. `asset_id` must start with `~/` and have no `..` component, or it is `NotFound`.
    2. **Off:** `p.home.join(rest)` goes to `switch_info_for`. `None` is `NotFound`. `read_only` is `ReadOnly`. Then the queue check, and `Ask::Skill { key: info.key, enabled: false }`.
    3. **On:** if `switch_info_for` finds the skill in the store, it is `AlreadySo`. Otherwise `rest` must be `.agents/skills/<name>` (the store's own spelling, the id `find_assets` gave before the skill went off), and `<name>` is looked up among `kept_for(&p.skills)`'s skills that are neither `interrupted` nor `back_in_store`. No match is `NotFound`; more than one is `Ambiguous`. Then the queue check, and `Ask::Skill { key: <that kept skill's "kept-skill:<uuid>">, enabled: true }`.
  - **`propose_undo`:**
    1. `load` gives `None`, which is `NotFound`.
    2. An `Undo` ask, or a status other than `Applied { receipt_id: Some(_), .. }`, is `NotUndoable`. An `Undone` proposal is `NotUndoable`.
    3. Then the queue check, and `Ask::Undo { of }`.
  - **`get_proposal`:** `load`. `None` is `NotFound`.

- [ ] **Step 1: Write the failing tests.** Server cases use a fixture home with a Codex `config.toml` and an Antigravity `.gemini/config/mcp_config.json`, run in the child with the store marked scanned. Copy `mcp_server_boundary_tests.rs` → `marked()`.
  - `a_server_key_is_resolved_to_the_real_key_and_stored`: `propose_server(p, "codex", "~/.codex/config.toml:github", false, None, 1)` writes one file. Its `ask.key` equals `<canonical home>/.codex/config.toml:github`, and starts with `/`, not `~`.
  - `a_key_differing_by_one_byte_is_not_found`: `"~/.codex/config.toml:githuB"` gives `Err(NotFound)`, and the folder holds no file.
  - `two_long_names_sharing_127_characters_are_ambiguous`: two servers named `"a".repeat(127) + "xy"` and `"a".repeat(127) + "yz"` (129 characters each; `public_name` cuts only names longer than `NAME_CAP = 128`). First assert that both `public_name`s are equal, then ask by that shared public id: `Err(Ambiguous)`, and no file.
  - `another_engines_key_is_not_found`: the Codex key asked under `"antigravity"` gives `Err(NotFound)`.
  - `a_server_already_off_is_already_so`: a fixture with `enabled = false` gives `Err(AlreadySo)`.
  - `a_read_only_item_is_refused`: a server declared for an engine with no `SWITCHES` row gives `Err(ReadOnly)`.
  - `a_skill_asset_id_resolves_through_the_store`: `~/.agents/skills/demo` (a folder) asked off gives `ask == Skill{key:"skill:demo",enabled:false}`. Asked on, it gives `Err(AlreadySo)`. `~/.agents/skills/../x` and `/etc/x` give `Err(NotFound)`.
  - `a_kept_skill_is_asked_back_on_by_its_store_id`: switch `demo` off with `skill_switch::ops::set_enabled_for(.., "skill:demo", false)`. `propose_skill(p, "~/.agents/skills/demo", true, …)` files `Skill{key:"kept-skill:<that uuid>",enabled:true}`. Asked off now, it gives `Err(NotFound)`. A second kept `demo` makes the on ask `Err(Ambiguous)`.
  - `an_undo_needs_an_applied_proposal_with_a_receipt`: hand-saved proposals with `Waiting`, `Applied{None}`, `Undone{Some("file:2")}`, `Declined` and an `Undo` ask each give `Err(NotUndoable)`. `Applied{Some("file:1")}` gives `Ok`, and its file's ask is `Undo{of}`. An unknown uuid gives `Err(NotFound)`.
  - `a_sixth_waiting_proposal_is_queue_full`: five saved `Waiting` give `Err(QueueFull)` on the sixth.
  - `every_proposal_tool_refuses_before_the_first_scan`: with no `last_scan_completed_ms`, all four functions give `Err(NotScannedYet)` and no folder is made.
- [ ] **Step 2: Run** `cargo test --test mcp_proposal_tests`. Expected: FAIL to compile, with `cannot find function propose_server`.
- [ ] **Step 3: Implement** to the rules above.
- [ ] **Step 4: Run** the file, then the full `cargo test`. Expected: PASS.
- [ ] **Step 5: Commit** `proposals.rs`, `tools.rs`, `strings.rs` and `mcp_proposal_tests.rs` with the message `feat(mcp-server): file a proposal against the live context, real key stored`.

### Task 3: The four tools, who is asking, and the copy

**Files:**
- Modify: `src-tauri/src/mcp_server/mod.rs`, `strings.rs`, `proposals.rs` (`engine_of_client`), `docs/mcp-server.md`
- Test: `src-tauri/tests/mcp_server_protocol_tests.rs` (forced edit, below), `src-tauri/tests/mcp_proposal_tests.rs`

**Interfaces:**
- Consumes: Task 2's four functions.
- Produces:
  - `Spec` gains `choices: &'static [(&'static str, &'static [&'static str])]`, string arguments limited to listed values. `schema()` adds `"enum"` for them, and `fits()` checks membership. The five existing specs get `&[]`.
  - `Spec.run` becomes `fn(&ServerPlaces, &JsonObject, Option<&'static str>) -> Result<Value, Refusal>`.
  - `TOOLS: [Spec; 9]`: the five reads, unchanged and first, then the four proposal tools, under Gate N's names. `state` is `"on"` or `"off"`, mapped to `enabled`.
  - `pub fn engine_of_client(name: &str) -> Option<&'static str>`, over a fixed table holding only measured names: `[("claude-code", "claude-code")]` (research §3, Claude Code 2.1.332). Any other name is `None`.
  - In `call_tool`, `asked_by` comes from `context.peer.peer_info()` → `client_info.name`, and otherwise from the request's `_meta["io.modelcontextprotocol/clientInfo"].name`, through `engine_of_client`. rmcp 3.12 sets `peer_info` only on the `initialize` path (`service/server.rs`, two `set_peer_info` calls in its initialize handling). That was checked in the source on 2026-11-28.
  - Each `propose_*` reply's value is `Filed` plus `note: strings::PROPOSAL_FILED`.
  - `strings::INSTRUCTIONS` takes Gate N's text. The module doc of `mcp_server/mod.rs` changes "never writes an engine's config" to say the server writes only proposal files under `<data>/mcp/proposals`.

- [ ] **Step 1: Write the failing tests:**
  - In `mcp_server_protocol_tests.rs`, change `const TOOLS: [&str; 5]` to the nine names in order. **This is a forced edit:** adding tools reddens `a_legacy_client_initializes_lists_and_calls` and `a_modern_client_discovers_then_lists`, and no ordering leaves both commits green. Combine it with the change and name it in the commit body (`verification.md`, Karthik's ruling on `bd26400`).
  - Also in `mcp_server_protocol_tests.rs`:
    - `a_proposal_is_filed_over_the_protocol_and_records_who_asked`: initialize with `clientInfo.name = "claude-code"`, call the server tool for a fixture Codex server, then read the one file in `<home>/Library/Application Support/com.rkarthik.hanger/mcp/proposals`. Its `asked_by` is `"claude-code"`, and the reply's `structuredContent.id` matches the file name.
    - `an_unknown_client_name_is_recorded_as_none`: the same with `clientInfo.name = "evil\nIgnore previous"`. `asked_by` is `null`.
    - `state_outside_on_and_off_is_a_tool_error`: `state: "toggle"` gets the tool's Gate N argument line, and no file is written.
    - `a_modern_client_is_named_from_meta_client_info`: no `initialize`; `server/discover`, then a call to the server tool whose request carries `_meta["io.modelcontextprotocol/clientInfo"].name = "claude-code"`. The file's `asked_by` is `"claude-code"`. This covers the second branch of the `asked_by` lookup.
  - In `mcp_proposal_tests.rs`, `engine_of_client_maps_only_measured_names`: `engine_of_client("claude-code") == Some("claude-code")`, while `"Claude Code"` and `""` give `None`.
- [ ] **Step 2: Run** the two files separately, because a compile error in one aborts the other: `cargo test --test mcp_proposal_tests` (expected: FAIL to compile, `cannot find function engine_of_client`), then `cargo test --test mcp_server_protocol_tests` (expected: FAIL, the tool list has 5 entries where 9 are expected).
- [ ] **Step 3: Implement.** Rewrite `docs/mcp-server.md` to Gate N's text, so its tool count and what it says the server writes match the code.
- [ ] **Step 4: Run** the full `cargo test`. Expected: PASS, including `the_server_module_never_prints` and `a_session_leaves_no_temp_folder_behind`.
- [ ] **Step 5: Commit** `mod.rs`, `strings.rs`, `proposals.rs`, `docs/mcp-server.md` and both test files with the message `feat(mcp-server): four proposal tools, and the copy that is true of them`. The body names the forced `TOOLS` edit and its cause.

### Task 4: Previews: Hanger's own statement of each waiting change

**Files:**
- Create: `src-tauri/src/mcp_server/approve.rs` (`pub mod approve;` in `mod.rs`)
- Test: `src-tauri/tests/mcp_proposal_tests.rs`

**Interfaces:**
- Consumes:
  - Task 1's `waiting` and `sweep`;
  - `context_for`, `discover_machine_at`, `registry::switch_for`, `context::dialect_of`;
  - `edit::set_enabled` and `edit::gemini_set_enabled`;
  - `apply::latest_receipts`, `vendor::claude_stashed`, `skill_switch::ops::kept_for`;
  - `engine_display_name`, `tools::public_name`, `sanitise_path`.
- Produces:
  - `#[derive(Serialize)] pub struct Preview { pub id: String, pub at_ms: i64, pub expires_at_ms: i64, pub asked_by: Option<String>, pub undo: bool, pub name: String, pub to: Option<ItemState>, pub target: PreviewTarget, pub change: Change }`. `asked_by` is the engine display name. `name` goes through `public_name`. `to` is `Some` for every P1 verb, and `None` for a verb that is not on or off (P3's add and remove, P4b's profile, P8's read).
  - `#[serde(tag = "kind", rename_all = "snake_case")] pub enum PreviewTarget { Server { engine_id: String, engine_name: String, config_path: String }, Skill }`. `config_path` is sanitised. P4b adds `Profile`, P8 adds `Read`.
  - `#[serde(tag = "type", rename_all = "snake_case")] pub enum Change { Lines { lines: Vec<String> }, Withheld, Command { argv: Vec<String> }, MoveSkill, Nothing, Unavailable { code: String } }`
  - `#[derive(Serialize)] pub struct PendingProposals { pub proposals: Vec<Preview>, pub count: usize }`
  - `pub fn pending(p: &ServerPlaces, now_ms: i64) -> PendingProposals`: runs `sweep`, then previews every `waiting` proposal, oldest first. `count` is `proposals.len()`, computed here.
- How each `change` is worked out. Previews are built fresh on each call and never stored.
  - **A flag file (Codex `EnabledKey`, Antigravity `DisabledKey`):**
    1. Find the registration whose `RegistrationKey::new(config_path, name)` equals the stored key, among `discover_machine_at(&home, &system)` registrations for that host with `tier != Local`. That is `ops`'s own lookup.
    2. Run `edit::set_enabled` on the file's text, and diff with `similar::TextDiff::from_lines`.
    3. Keep only the changed lines, prefixed `- ` or `+ `.
  - **Gemini CLI:** the same, on `engine_base(home, ".gemini")/mcp-server-enablement.json` through `edit::gemini_set_enabled`. Mark the spelling with `// shortcut: ops::gemini_state_file is private and P2 owns ops; this spelling is pinned by approving_previews_match_the_write, switch to ops's when it is exposed`.
  - **Claude Code `ClaudeCli`:**
    - Off gives `Command { argv: ["claude","mcp","remove",<name>,"--scope","user"] }`.
    - On, for a `stash:` key, gives `["claude","mcp","add-json",<name>,"-","--scope","user"]`. The kept entry goes on stdin and none of it is shown.
    - Untruncated (research rule 5).
  - **A skill:** `MoveSkill`.
  - **An Undo:**
    - `file:<id>`: the diff from the current file to the backup named by `latest_receipts`. A created file's Undo lists every line as `- `.
    - `kept:<id>` (Claude): the `add-json` argv, with the name from `claude_stashed`.
    - `restored:<name>`: the `remove` argv.
    - A skill's `kept:` or `restored:`: `MoveSkill`.
    - `to` is `Some` of the opposite of the undone ask's `enabled`.
  - **The withheld rule** (an allowlist, the security-critical algorithm here). For each changed line, before its `- `/`+ ` prefix is added: delete every occurrence of the server's name and of its lowercase form, then delete every occurrence of the six allowed words `enabled`, `disabled`, `true`, `false`, `mcp_servers` and `mcpServers`. What remains may hold only whitespace and the characters `{`, `}`, `[`, `]`, `"`, `:`, `,`, `=` and `.`. Any other character, a digit, any other punctuation or any non-ASCII character, fails the line. If any line fails, the whole change is `Withheld`.
  - **Nothing to write** is `Nothing`. An item that no longer resolves is `Unavailable { code }`, with `ops`'s or the skill switch's code.

- [ ] **Step 1: Write the failing tests** (child process, fixture home):
  - `a_codex_off_previews_one_added_flag_line`: `change == Lines{lines:["+ enabled = false"]}`, `to == Some(Off)`, and `target.config_path` starts with `~/`.
  - `an_antigravity_off_previews_its_disabled_key`: `Lines` with one `+` line containing `"disabled": true`.
  - `a_gemini_off_previews_its_state_file`: with no state file, `Lines`, and every line passes the withheld rule.
  - `a_claude_code_preview_is_the_literal_argv_and_no_entry`: off gives `Command{argv:["claude","mcp","remove","github","--scope","user"]}`. On for a `stash:` key gives the `add-json` argv, and none of the kept entry's four markers appear anywhere in the serialised `PendingProposals`.
  - `a_line_holding_more_than_the_flag_is_withheld`: a JSON one-line entry with `"env":{"T":"MARKER_ONE_LINE"}` gives `change == Withheld`, and `MARKER_ONE_LINE` is absent from the serialised value.
  - `the_withheld_rule_is_an_allowlist`: the rule, called on single lines, withholds `"t": "0123-4567"` (digits and a hyphen), `"t": "$%^&"` (punctuation), `"ключ": "x"` (non-ASCII) and `"t": 12345`, and passes `enabled = false`, `"disabled": true,` and `[mcp_servers.github]` for a server named `github`.
  - `an_undo_previews_the_reverse`: a `file:` receipt made by a real `ops::set_enabled_for` in the fixture gives `Lines{["- enabled = false"]}` with `to == Some(On)`.
  - `pending_counts_in_the_backend_and_drops_expired`: three saved, one older than 10 minutes. `count == 2`.
- [ ] **Step 2: Run** `cargo test --test mcp_proposal_tests`. Expected: FAIL to compile, with `unresolved import tauri_app_lib::mcp_server::approve`.
- [ ] **Step 3: Implement** as above.
- [ ] **Step 4: Run** the full `cargo test`. Expected: PASS.
- [ ] **Step 5: Commit** `approve.rs`, `mod.rs` and `mcp_proposal_tests.rs` with the message `feat(mcp-server): preview each waiting proposal in Hanger's own words`.

### Task 5: Decide, Undo, and the three commands

**Files:**
- Modify: `src-tauri/src/mcp_server/approve.rs`, `src-tauri/src/lib.rs`, `docs/ipc.md` (three sections appended after the last numbered one), `README.md` (`ipc` figure)
- Test: `src-tauri/tests/mcp_proposal_tests.rs`, `src-tauri/tests/ipc_boundary_tests.rs`

**Interfaces:**
- Consumes: Tasks 1 and 4, `ops::set_enabled_for` and `undo_for`, and `skill_switch::ops::set_enabled_for` and `undo_for`.
- Produces:
  - `pub fn engine_of(p: &ServerPlaces, id: &str, now_ms: i64) -> Option<String>`: the proposal's engine id, following one `Undo { of }`. Lets `lib.rs` pick the `ClaudeCli`.
  - `pub async fn decide(p: &ServerPlaces, cli: &ClaudeCli, projects: &[PathBuf], id: &str, approve: bool, now_ms: i64) -> Result<Proposal, String>`:
    - It runs under one `static DECIDING: tokio::sync::Mutex<()>`. Under the lock it `load`s.
    - `None` is `Err("not_found")`, `Expired` is `Err("expired")`, and any other non-`Waiting` status is `Err("not_waiting")`.
    - A decline saves `Declined`.
    - An approval dispatches `Server` to `ops::set_enabled_for` and `Skill` to `skill_switch::ops::set_enabled_for`. `Undo` goes to the matching `undo_for` with the receipt from `of`'s `Applied`.
    - `Ok(reply)` saves `Applied { receipt_id: reply.receipt_id, stopped_at: None }`. A failure saves `Failed { code }` and returns `Err(code)`, with the switch's own code.
    - An approved `Undo { of }` that succeeds also saves `of`'s proposal as `Undone { receipt_id }`, under the same lock.
  - `pub async fn undo_approved(p: &ServerPlaces, cli: &ClaudeCli, projects: &[PathBuf], id: &str, now_ms: i64) -> Result<Proposal, String>`: the in-app Undo of an approved proposal. Under `DECIDING`, it `load`s; anything but `Applied { receipt_id: Some(r), .. }` on a non-`Undo` ask is `Err("not_undoable")`. It calls the matching `undo_for` with `r`, then saves `Undone { receipt_id: <the Undo's receipt> }` and returns it. A failure returns the switch's code and leaves the proposal `Applied`. This is how a proposal reads as undone after the person's own Undo, so a model's later `propose_undo` is refused rather than previewing a state that no longer exists.
  - `lib.rs`:
    - `fn server_places(app: &AppHandle) -> ServerPlaces`, which is `server_places_in(&scanner::get_home_dir(), Path::new("/"), &app_data_dir)` with `switch_places`'s `"."` fallback;
    - `#[tauri::command(async)] fn list_mcp_proposals(app) -> Result<PendingProposals, String>`. It runs `sweep`, so this read also deletes proposal files older than a day. Its doc comment and its `docs/ipc.md` section say so;
    - `#[tauri::command] async fn decide_mcp_proposal(app, id: String, approve: bool) -> Result<Proposal, String>`, which builds `cli` from `claude_cli_for(engine_of(..).unwrap_or_default())` and `projects` from `skill_switch_projects(&app)`;
    - `#[tauri::command] async fn undo_mcp_proposal(app, id: String) -> Result<Proposal, String>`, built the same way, calling `undo_approved`.

- [ ] **Step 1: Write the failing tests** (child process, fixture home):
  - `approving_a_codex_proposal_switches_it_and_records_the_receipt`: the status becomes `Applied{receipt_id:Some(r)}` with `r` starting `file:`. The config gains exactly the line `enabled = false`.
  - `approving_previews_match_the_write`: for Codex, Antigravity and Gemini, the preview's `Lines` equal the `- `/`+ ` diff between `apply`'s backup and the file after approval.
  - `declining_writes_nothing`: the config's bytes are unchanged, and the status is `Declined`.
  - `an_expired_proposal_cannot_be_approved`: `Err("expired")`, and the bytes are unchanged.
  - `a_proposal_whose_server_changed_since_is_failed_not_applied`: remove the server from the file between filing and approval. The result is `Err("not_found")`, and the file reads `Failed{code:"not_found"}`.
  - `a_proposal_already_satisfied_applies_with_no_receipt`: set the flag by hand first. The result is `Applied{receipt_id:None}`.
  - `a_second_decide_is_not_waiting_and_writes_nothing`: two `decide` calls joined at once. Exactly one `Ok`, and the other `Err("not_waiting")`. `apply::latest_receipts` grows by 1.
  - `an_undo_proposal_takes_back_the_receipt`: approve an off, `propose_undo`, approve it. The config's bytes equal the original, and the first proposal reads `Undone`.
  - `the_in_app_undo_leaves_the_proposal_undone`: approve an off, then `undo_approved`. The config's bytes equal the original, the proposal reads `Undone{receipt_id:Some(_)}`, `get_proposal` gives `undoable: false`, and `propose_undo` on it gives `Err(NotUndoable)`. A second `undo_approved` gives `Err("not_undoable")`.
  - `a_skill_proposal_moves_it_to_the_keep_and_undo_brings_it_back`, with `projects = []`.
  - `a_skill_asked_back_on_comes_out_of_the_keep`: switch `demo` off by hand, approve `propose_skill(.., true)`. `~/.agents/skills/demo` exists again and the proposal reads `Applied{Some(_)}`.
  - `a_claude_code_approval_runs_the_previewed_argv`: with a fake `claude` built as `mcp_switch_tests.rs`'s bench builds it (argv logged one per line), `"claude"` followed by the logged argv equals the preview's `argv`.
  - In `ipc_boundary_tests.rs`, `proposal_previews_never_carry_a_config_value`: fixture configs carry the four switch markers on lines next to the flag, plus one JSON one-line entry with a fifth marker. The serialised `PendingProposals` and every `Proposal` returned by `decide` hold none of the five markers and no raw home path.
- [ ] **Step 2: Run** `cargo test --test mcp_proposal_tests --test ipc_boundary_tests`. Expected: FAIL to compile, with `cannot find function decide`.
- [ ] **Step 3: Implement.** Add the three `docs/ipc.md` sections, numbered from the next free number at commit time, in the file's existing shape, with the schemas, the failure codes `not_found`, `expired`, `not_waiting`, `not_undoable` and every `SwitchFailure`/`SkillSwitchFailure` code, and one example each. Run `~/.bun/bin/bun run src/__tests__/readmeCounts.ts`. The `ipc` figure rises by 3 over the tip it merges onto, and "three events" is unchanged.
- [ ] **Step 4: Run** the four gates. Expected: `cargo test` passes, `npx vitest run` passes (including `readme-sync.test.ts`), `bunx tsc --noEmit` exits 0, and both `gitleaks` commands report no leaks.
- [ ] **Step 5: Commit** `approve.rs`, `lib.rs`, both test files, `docs/ipc.md` and `README.md` with the message `feat(mcp-server): the app applies an approved proposal through the existing switch`.

## Gate G3: layout options for the approval surface (STOP for Karthik)

- [ ] Render two or three options at true width in real tokens, in both themes (memory: design options before building):
  - Research option A: a pill variant in the `SwitchNotice` band, an inspector band on the item's own inspector, and a ⌘K "Review" action in `SearchPalette`'s Switch group.
  - A variant with the band beside the pill.
  - One more he asks for.
  - No blocking dialog (`invariants.md`).
- [ ] Each option shows every `Change` kind with Gate N's strings, and a five-waiting queue.
- [ ] Report the reconciliation from the server plan to him: the Claude Code preview shows the literal argv and never the kept entry.
- [ ] Karthik picks. Record the pick, and the component file names it implies, under "Answers (Gate G3)". If the pick shows any text a model wrote, stop and put T23 to him in Plannotator first. Nothing in `Preview` is model-written: names come from config and frontmatter through `public_name`, and `asked_by` comes from a fixed table.

### Task 6: The approval surface

**Files:**
- Create:
  - `src/types/mcpProposals.ts`;
  - `src/hooks/useMcpProposals.ts` and its test;
  - the component file(s) named at Gate G3, each with a test and a Design system specimen (`design-system-coverage.test.ts`).
- Modify:
  - `src/hooks/useMcpSwitch.ts`;
  - `src/components/SearchPalette.tsx`;
  - `src/App.tsx`;
  - `.claude/DESIGN.md` (the new component's paragraph, and the `SwitchNotice` paragraph if the pill changes).

**Interfaces:**
- Consumes: `list_mcp_proposals`, `decide_mcp_proposal` and `undo_mcp_proposal` (Task 5).
- Produces:
  - `src/types/mcpProposals.ts`: `Preview`, `PreviewTarget` and `Change` as discriminated unions on `kind` and `type`, mirroring Task 4 exactly, with `to: ItemState | null`. No optional fields stand in for a variant (`verification.md`, a fixture built from the type). Also `PendingProposals`, `Proposal`, and `Status` as a union on `state`, `undone` included.
  - `useMcpProposals(): { pending: PendingProposals | null }`, with `POLL_MS = 3000`. It polls only while `document.visibilityState === "visible"`, once more on window `focus`, and stops on unmount.
  - `useMcpSwitch` gains `decideProposal(p: Preview, approve: boolean): Promise<void>`. An approval reuses the existing notice: a `done` notice with the receipt, its engine (`target.engine_id` for a server), and `onChanged()`. The notice's Undo calls `undo_mcp_proposal({ id })`, not `undo_mcp_switch`/`undo_skill_switch`, so the proposal reads `undone` afterwards. A rejection shows `failureLine`/`skillFailureLine` for the code. The hook's doc comment lists `decide_mcp_proposal` and `undo_mcp_proposal` among the commands only it calls.

- [ ] **Step 1: Write the failing Vitest tests:**
  - `useMcpProposals` with fake timers calls `invoke("list_mcp_proposals")` at 0, 3000 and 6000 ms while visible, not at all while hidden, and once on `focus`.
  - The surface renders nothing when `count` is 0.
  - It renders each `Lines` line verbatim, the `Command` argv joined by spaces, and Gate N's line for `Withheld`, `MoveSkill`, `Nothing` and `Unavailable`.
  - The figure shown is `pending.count`, not `.length`. `no-frontend-counting.test.ts` stays green.
  - Approve and Decline call `decide_mcp_proposal` with `{ id, approve: true }` and `{ id, approve: false }`.
  - After an approved server proposal, the notice carries Undo, and Undo calls `undo_mcp_proposal` with the proposal's id, never `undo_mcp_switch`.
  - The ⌘K action appears only when `count > 0`.
- [ ] **Step 2: Run** `npx vitest run src/hooks/useMcpProposals.test.ts <G3 component tests>` from the repo root. Expected: FAIL, with the modules not found.
- [ ] **Step 3: Implement** per Gate G3. Use tokens and type roles only (`no-off-token-styles`, `type-roles`). If `src/App.tsx` is committed from the shared main checkout, stage it by hunk.
- [ ] **Step 4: Regenerate the README.** This task adds frontend test files, so the `tests` figure moves: run `~/.bun/bin/bun run src/__tests__/readmeCounts.ts`, then `npx vitest run src/__tests__/readme-sync.test.ts` from the repo root. Expected: PASS. Then run the four gates. Expected: all pass.
- [ ] **Step 5: Screenshots** from the running dev app, per `verifying-ui.md`: filter by the dev pid, read the theme from the store first and name it, and drive the app through the MCP bridge. Produce the proposal by calling the server tool through the dev binary's `mcp` subcommand, with a JSON-RPC client like the `Session` in `mcp_server_protocol_tests.rs`. That reads the configs and writes only the proposal file. Never hand-write a proposal file. Pick a server Karthik names, and Decline or Undo before the capture ends. Capture a waiting proposal, after Approve with the Undo pill showing, and after Decline, in both themes. Save them under `docs/evidence/2026-11-28-mcp-phase2/`.
- [ ] **Step 6: Commit** the listed files and `README.md` with the message `feat(approval): waiting proposals, approved in Hanger's window`.

## Gate G4 / Task 7: Live proof of a write and its Undo, per kind (STOP for Karthik)

Every step is verified by its artefact, never by an answer (design §7, "round 38").

- [ ] **Step 1:** Per-kind counts, read-only, with Task 1's command. This is the before figure for the live check.
- [ ] **Step 2: Server.** In his own engine, Karthik asks it to switch one server off for one `SWITCHES` engine he names. The engine calls the server tool, Karthik approves in Hanger, and the engine's `get_proposal` reads `applied`. Then he asks for the Undo through `propose_undo` and approves it. Artefacts:
  - the proposal files;
  - the config file's `git diff --no-index` against a copy taken before each step (for Claude Code, `claude mcp list` before and after);
  - the engine transcript;
  - screenshots per `verifying-ui.md`.
- [ ] **Step 3: Skill.** The same for one store skill. Artefacts: `ls -la ~/.agents/skills/<name>` and the keep folder before, after the off, and after the Undo.
- [ ] **Step 4:** Per-kind counts after. Only the switched items may differ in between, and after the Undos every category must match Step 1. Any other move is a blocker.
- [ ] **Step 5:** A fresh reviewer runs `stage-gate --dev` on the branch, bounded to this track's own commits (`shared-checkout.md`, computed ranges). Push only when Karthik says so. After the merge, `stage-gate --release`.

---

## Human gates, and where they sit

| Gate | Who | Sits | Verified by |
|---|---|---|---|
| P: `stage-gate --plan` | fresh reviewer | before Gate N | the review's findings, fixed |
| N: naming brief, P1's part of the batched round, plus `/humanizer` | **Karthik** | before Task 1 (Task 2 lands refusal texts, Task 3 the tool copy) | his answers recorded in this file |
| G3: layout options at true width for the band, pill and ⌘K | **Karthik** | after Task 5, before Task 6 | his pick recorded in this file |
| T23 in Plannotator | **Karthik** | only if G3's pick would show model-written text | his ruling |
| G4: a live write and its Undo, server and skill | **Karthik** drives his engine | after Task 6 | proposal files, config diffs, `ls` of the keep, transcript, screenshots, per-kind counts |
| `stage-gate --dev` / `--release` | fresh reviewer | before push, after merge | the review |

## Known limits, stated rather than built

- **A model names a kept skill by the id it had in the store.** No tool lists kept skills, so a model that never saw the skill in `find_assets` can't find its id. A listing tool would be a new read tool and needs its own brief.
- **No undo of an undo through the model.** Filing the original switch again does the same thing.
- **Elicitation is deferred.** It was measured only in Claude Code (research §3).
- **Proposal files are deleted a day after filing.** A model's Undo of an older proposal reads `not_found`. P4a's Recent changes is the long-lived Undo.
- **A key-level receipt never reaches a preview.** After P4 Task 1, `apply::undo` routes a key receipt to `undo_key`. Only P2's per-project Claude switch writes one, and no P1 tool can propose a project item, so no `Undo` preview diffs one. If a later plan lets a model propose a project switch, its Undo preview needs a key-level arm.
- **`useMcpSwitch.ts` has no owner in design §5.** P1, P2 and P4 all modify it; merge order follows the waves (P1 → P2 → P4).
- **The proposals folder is not a trust boundary.** Anything that can write under the user's data directory can plant a file there. It still needs a person's approval, and every field is checked again by the switch code at approval.
