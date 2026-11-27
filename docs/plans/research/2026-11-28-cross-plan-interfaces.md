# Cross-plan interfaces for the eight plans (reconciled 2026-11-28)

One row per interface that more than one of the eight plans names. The owner
plan's spelling is the one every consumer uses. "On `main`" was checked by
`grep` against `main` at `c45a702` on 2026-11-28; "new" means the owner plan
lands it and nothing on `main` has it yet.

Plans: P1 `2026-11-28-mcp-phase2-plan.md`, P2 `…-slice2-per-project-plan.md`,
P3 `…-slice3-add-remove-plan.md`, P4 `…-slice4-recent-profiles-plan.md`, P5
`…-slice5-skills-plugins-plan.md`, P6 `…-slice6-spike-applies-plan.md`, P7
`…-t19-engine-status-plan.md`, P8 `…-phaseB-agent-plan.md`. Rulings R1 to R5
are `2026-11-28-reconciliation-rulings.md`.

## Names retired by the rulings

None of these may appear in the eight plans except in a "Reconciled" note
that names what was dropped.

| Retired | Ruling | Replaced by |
|---|---|---|
| `KeyEdit { pointer, item, added }` | R1 | P4's `KeyEdit { key_path, member, present }` |
| `safe_replace_keyed`, `undo_keyed` | R1 | `apply::set_member`, `apply::undo_key` (reached through `apply::undo`) |
| P2's `claude_project::set_disabled` / `is_disabled` | R1 | `apply::set_member` / `apply::member_text`; the project context parses the list itself |
| `key:<id>` receipt ids | R1 | `file:<uuid>` (P4's receipt id format) |
| `ClaudeChange`, `claude_changes`, `claude_undo_change`, `added:`/`removed:` ids | R2 | `apply::CommandReceipt` with `cmd:<uuid>` ids; `vendor::claude_reverse` |
| `VendorReceipt`, `vendor_receipts`, `reverse_argv` | R2 | `apply::CommandReceipt`, `apply::command_receipts`, `reverse_args` |
| `proposals::propose`, `get`, `list_waiting`; `changed_lines`; `propose_switch` | R3 | one filing function per verb; `Preview.change`; `propose_server_switch`, `propose_skill_switch` |
| `ops::git_tracks`, `repo_key` | R4 | `project::refused_files`, `ReadOnlyReason::RepoFileTracked`, `project: Option<String>` → `KnownProject` |
| `pub enum Applies`, `EngineContext.applies: Option<Applies>` | R4 | `EngineContext.applies: Option<String>` filled with `next_turn`, `after_reload`, `next_session` |

## Interfaces

| Name | Owner | Signature | Consumers | On `main` |
|---|---|---|---|---|
| `ops::context_for` | P2 | `pub fn context_for<P>(places: &SwitchPlaces, engine_id: &str, probe_of: P) -> EngineContext` (sync, unchanged) | P1, P4 | yes, `ops.rs:319` |
| `ops::contexts_for` | P2 | `pub fn contexts_for<P>(places: &SwitchPlaces, probe_of: P) -> Vec<EngineContext>` (sync, unchanged) | P4, P7 (via `get_engine_contexts`) | yes, `ops.rs:334` |
| `ops::set_enabled_for` | P2 | `pub async fn set_enabled_for<P>(places: &SwitchPlaces, cli: &ClaudeCli, engine_id: &str, key: &str, enabled: bool, probe_of: P) -> Result<SwitchReply, SwitchFailure>`; becomes `set_enabled_at(Target::Machine { key })`, signature unchanged | P1, P4 | yes, `ops.rs:421` |
| `ops::undo_for` | P2 | `pub async fn undo_for<P>(places, cli, engine_id: &str, receipt_id: &str, probe_of: P) -> Result<SwitchReply, SwitchFailure>`; becomes `undo_at(None, …)`. Accepts `file:` (incl. key receipts, R1), `kept:`/`restored:`, and after P3 Task 12 `cmd:` for `claude-code` | P1, P4 | yes, `ops.rs:460` |
| `ops::kept_off_for`, `cached_measure`, `cached_measure_on`, `uses_claude_cli`, `SwitchFailure::code`, `SwitchPlaces`, `ClaudeCli` | P2 | unchanged | P1, P4 | yes |
| `ops::Target<'a>` | P2 (Task 2) | `pub enum Target<'a> { Machine { key: &'a str }, InProject { project: &'a KnownProject, key: &'a str } }`; P3 adds `NewEntry { host_id, tier, path }`, no field on the others | P3 | new |
| `ops::set_enabled_at` / `undo_at` | P2 (Task 2) | `set_enabled_at<P>(places, cli, engine_id, target: Target<'_>, enabled, probe_of)`; `undo_at<P>(places, cli, engine_id, project: Option<&KnownProject>, receipt_id, probe_of)`; `undo_at` re-runs `refused_files` on a project file before undoing it (Q2) | P3 | new |
| `ops::context_in` / `contexts_in` | P2 (Task 1) | `pub async fn context_in<P>(places, engine_id, project: &KnownProject, probe_of: P) -> EngineContext`; `contexts_in` likewise. `get_engine_context` and `get_engine_contexts` become `async fn` commands | P2 only (no other plan names it) | new |
| `project::KnownProject` | P2 (Task 1) | `KnownProject::among(candidate: &str, roots: &[String]) -> Option<KnownProject>`; `real_path(&self) -> &Path`. Roots are `preferences::get_linked_directories` | P3 | new |
| `project` IPC argument | P2 (Task 2) | `project: Option<String>` on `get_engine_context`, `get_engine_contexts`, `set_mcp_server_enabled`, `undo_mcp_switch`; no match is `Err("not_found")` | P3 (Task 17) | new |
| `project::refused_files` | P2 (Task 5, after Claude's live check in Task 4) | `pub async fn refused_files(real: &Path, files: &[PathBuf]) -> Vec<PathBuf>`; fail-closed: "couldn't ask git" is refused | P3 (Task 17) | new |
| `ReadOnlyReason::{NoPerProjectSwitch, OffEverywhere, NotOpenedHereYet, NeedsTrust, RepoFileTracked}` | P2 (Task 1) | appended after `FileUnparseable`, snake_case | P3, P6 (copy only) | new |
| `EngineContext.applies` | P2 owns the field; P6 fills it | `Option<String>`; codes `next_turn`, `after_reload`, `next_session`; one private constructor in `context.rs` takes `applies` as a parameter; project contexts pass `None` | P6, P7 (card) | field yes, `context.rs:166` |
| `apply::KeyEdit` | P4 (Task 1) | `pub struct KeyEdit { pub key_path: Vec<String>, pub member: String, pub present: bool }` (Serialize, Deserialize) | P2 (Task 4) | new |
| `apply::KeyReceipt` | P4 (Task 1) | `pub struct KeyReceipt { #[serde(flatten)] pub receipt: Receipt, pub key: KeyEdit }` | P2, P4 `recent` | new |
| `apply::set_member` / `set_member_with` | P4 (Task 1) | `pub fn set_member(path: &Path, edit: &KeyEdit, backups: &Path, what: &str) -> Result<Option<KeyReceipt>, ApplyError>`; `set_member_with(…, before_write: &dyn Fn())` (`#[doc(hidden)]`) | P2 (Task 4) | new |
| `apply::undo_key` | P4 (Task 1) | `pub fn undo_key(receipt_id: &str, backups: &Path) -> Result<KeyReceipt, ApplyError>`; `apply::undo` routes a receipt carrying `key` to it | P2 (through `undo_for`), P4 `recent` | new |
| `apply::member_text` | P4 (Task 1) | `pub fn member_text(text: &str, key_path: &[String], member: &str, present: bool) -> Result<Option<String>, ApplyError>` (pure) | P2 (context read is its own parse; no caller needed) | new |
| `apply::undo`, `safe_replace`, `latest_receipts`, `Receipt` | P4 | unchanged signatures; `Receipt { id, path, backup_file, before_sha256, after_sha256, at_ms, what }` | P1, P2, P3, P4 | yes, `apply.rs:135,200,297,340` |
| `apply::restore_backup`, `history`, `HistoryEntry` | P4 (Task 3) | `restore_backup(receipt_id, backups) -> Result<Receipt, ApplyError>`; refuses a key receipt (Q9) | P4 only (IPC `restore_backup`) | new |
| `apply::CommandReceipt` | P4 (Task 3b) | `pub struct CommandReceipt { pub id: String /* "cmd:<uuid>" */, pub at_ms: i64, pub what: String, pub program: ReverseProgram, pub reverse_args: Vec<String>, pub reverse_stdin_stash: Option<String> }`; `pub enum ReverseProgram { Gh, Claude, SkillSwitch }`. `reverse_args` empty = no Undo. `reverse_stdin_stash` names a stash record whose kept entry goes on the reverse's stdin; the entry itself is never in the receipt | P3 (Task 11), P5 (Tasks 4, 15) | new |
| `apply::record_command` / `load_command` / `command_receipts` / `command_receipts_dir` | P4 (Task 3b) | `record_command(dir: &Path, r: &CommandReceipt) -> Result<(), ApplyError>` (0600 in 0700, temp+rename, before the reply); `load_command(dir, id) -> Option<CommandReceipt>` (uuid parsed before any filesystem call); `command_receipts(dir) -> Vec<CommandReceipt>` newest first; `command_receipts_dir(data_dir) -> PathBuf` = `<data>/commands` | P3, P5 (write, load); P4 `recent` (list) | new |
| `undo_vendor_change` (IPC) | P5 (Task 5) | `undo_vendor_change(receipt_id: String) -> UndoReply`; runs any `CommandReceipt`'s reverse through `vendor_cli::undo`; a `Claude` receipt whose `reverse_args[0] == "mcp"` is handed to P3's `vendor::claude_reverse` | P4 (Recent changes, Task 9) | new |
| `vendor_cli::undo` | P5 (Task 4) | `pub async fn undo(receipt: &CommandReceipt, ctx: &UndoContext) -> Result<UndoReply, VendorFailure>` | P4 (through the IPC) | new |
| `vendor::claude_add` / `claude_remove` / `claude_reverse` | P3 (Task 11) | `claude_add(config, name, entry_json, stash, receipts, cli, path_env) -> Result<CommandReceipt, SwitchError>`; `claude_remove(config, name, stash, receipts, cli, path_env)`; `claude_reverse(config, receipt: &CommandReceipt, stash, receipts, cli, path_env) -> Result<CommandReceipt, SwitchError>` | P3 `ops`, P5 `vendor_cli::undo` | new |
| `vendor::claude_stashed` | P3 | `pub fn claude_stashed(stash: &Path) -> Vec<StashedServer>` (unchanged; reads top-level files only) | P1 | yes, `vendor.rs:400` |
| `skill_switch::ops::set_enabled_for` / `undo_for` / `switch_info_for` / `kept_for` | P5 | `set_enabled_for(&SkillPlaces, &[PathBuf], key, enabled)`: `skill:<name>` off, `kept-skill:<uuid>` on; `undo_for(&SkillPlaces, &[PathBuf], receipt_id)`; `switch_info_for(&SkillPlaces, &Path) -> Option<SkillSwitchInfo>`; `kept_for(&SkillPlaces) -> KeptSkills` (unchanged, pinned by P5 Task 1) | P1, P4, P5 | yes, `skill_switch/ops.rs:662,685,704,737` |
| `skill_switch::ops::install_slot` | P5 (Task 1) | `pub fn install_slot(places: &SkillPlaces, name: &str) -> Result<PathBuf, SkillSwitchFailure>` | P5 only | new |
| `proposals::{Proposal, Ask, Status}` | P1 (Task 1) | `Proposal { id, at_ms, asked_by: Option<String>, ask: Ask, status: Status }`; `#[serde(tag = "verb", rename_all = "snake_case")] enum Ask { Server { engine_id, key, enabled }, Skill { key, enabled }, Undo { of } }`, extended only; `#[serde(tag = "state")] enum Status { Waiting, Applied { receipt_id: Option<String>, stopped_at: Option<String> /* skipped when None */ }, Undone { receipt_id: Option<String> }, Declined, Expired, Failed { code } }` | P3, P4, P8 | new |
| `Ask` variants added by others | P3, P4, P8 | P3 `Add { engine_id, from_key }`, `Remove { engine_id, key }`, `AddFromRegistry { engine_id, registry_name, version }`; P4 `ApplyProfile { profile, everything_else_off }`; P8 `Read { tool: ReadTool, id }` | P1 (wire-shape test extended by each) | new |
| `proposals::{save, load, waiting, sweep}`, `EXPIRES_AFTER_MS`, `MAX_WAITING`, `FORGET_AFTER_MS`, `Filed`, `ProposalState` | P1 (Tasks 1–2) | as P1 Task 1–2 | P4, P8 | new |
| Filing functions (one per verb) | P1 (Task 2) and each extender | `propose_server`, `propose_skill`, `propose_undo`, `get_proposal` (P1); `propose_add`, `propose_remove`, `propose_registry_add` (P3); `propose_profile` (P4); `propose_read` (P8). Each `(p: &ServerPlaces, …, asked_by: Option<&'static str>, now_ms: i64) -> Result<Fresh<Filed>, Refusal>` | P3, P4, P8 | new |
| MCP tool names | P1 (Gate N) and each extender | `propose_server_switch(engine_id, key, state)`, `propose_skill_switch(asset_id, state)`, `propose_undo(proposal_id)`, `get_proposal(proposal_id)`; P3 `propose_server_add`, `propose_server_remove`, `propose_registry_add`; P4 `propose_profile_load`. All working names until Gate N; `TOOLS` lives in `mcp_server/mod.rs` | P3, P4, P8 (`AGENT_TOOLS`) | new |
| `approve::Preview` | P1 (Task 4) | `Preview { id, at_ms, expires_at_ms, asked_by: Option<String>, undo: bool, name: String, to: Option<ItemState>, target: PreviewTarget, change: Change }`; `to` is `None` for a verb that is not on or off | P3, P4, P8 | new |
| `approve::PreviewTarget` | P1 (Task 4), extended | `#[serde(tag = "kind")] { Server { engine_id, engine_name, config_path }, Skill }`; P4 adds `Profile { profile, change_count, skipped_count }`; P8 adds `Read { tool: ReadTool, engine_id: Option<String> }` | P4, P8 | new |
| `approve::Change` | P1 (Task 4) | `#[serde(tag = "type")] { Lines { lines }, Withheld, Command { argv }, MoveSkill, Nothing, Unavailable { code } }` | P3 (add: `Lines`/`Command`; remove: `Withheld`/`Command`), P4 (`Lines`), P8 (`Nothing`) | new |
| `approve::{pending, decide, engine_of, undo_approved}`; IPC `list_mcp_proposals`, `decide_mcp_proposal`, `undo_mcp_proposal` | P1 (Task 5) | `decide(p, cli, projects, id, approve, now_ms) -> Result<Proposal, String>`; `undo_approved(p, cli, projects, id, now_ms) -> Result<Proposal, String>` saves `Undone` | P3, P4, P8 | new |
| `tools::scanned`, `tools::measure`, `tools::public_key` | P1 (Task 2) | made `pub(crate)` | P8 (agent mode) | private today, `tools.rs:100,110,122` |
| `engine_status::clis::{ENGINE_CLIS, EngineCli, cli_for, LatestSource, AuthProbe}` | P7 (Task 1) | `pub fn cli_for(engine_id: &str) -> Option<&'static EngineCli>`; `EngineCli.bin` | P4 (profile load via queue), P5 (Task 14), P8 | new |
| `engine_status::version::{parse_version, is_newer, COMMAND_TIMEOUT}` | P7 (Task 1) | `parse_version(stdout: &str) -> Option<String>`; `is_newer(latest, installed) -> Option<bool>` | P8 | new |
| `engine_status::auth::{parse_auth, AuthState}` | P7 (Task 5) | `parse_auth(probe: AuthProbe, stdout: Option<&str>) -> AuthState`; `AuthState { SignedIn { method: Option<String> }, SignedOut, NotReported }` | P8 | new |
| `engine_status::run::run_capture` | P7 (frozen) | `run_capture(program, args, stdin, envs, timeout) -> Option<Captured>` | P2, P3, P5, P8 | yes, `run.rs:45` |
| `engine_status::resolve::{search_path, resolve_in}` | P7 | `search_path() -> String` (async); `resolve_in(bin, path) -> Option<PathBuf>` | P2, P5, P8 | yes, `resolve.rs:45,126` |
| `engine_status::stream::run_streaming` | P8 (Task 8) | sibling of `run_capture`, which stays untouched | P8 only | new |
| `get_engine_status` (IPC), `EngineStatus` | P7 (Task 8) | `get_engine_status(force_check: bool) -> EngineStatusReply` | P7 only (P8 calls `cli_for`, `parse_version` and `parse_auth` directly; P6 does not name it) | new |
| Overview card and the combined layout round | P7 (Task 4) | ruling file `docs/plans/2026-11-28-card-layout-round.md` | P2 (Task 9), P4 (Gate L2), P5 (Task 13), P6 (Task 10) | new |
| `src/utils/reviewIssues.ts` | shared: P7 first, then P3 | P7 Task 10 adds `signed_out`, `settings_unreadable`; P3 Task 10 rebases onto it and adds `secret`, `unpinned` | P3, P7 | yes (file) |
| `src/hooks/useMcpSwitch.ts` | unowned; merge order P1 → P2 → P4 | P1 `decideProposal`; P2 `project`; P4 `loadProfile` | P1, P2, P4 | yes (file) |
| `docs/ipc.md` numbering, README `ipc` figure | unowned | each plan takes the next free number at commit time and regenerates the figure; no plan pins an absolute total | all | — |
