# Slice 4: Recent changes and profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Reconciled 2026-11-28** after the `--plan` review (`docs/reviews/2026-11-28-plan-2026-11-28-slice4-recent-profiles-plan.md`), applying `docs/plans/research/2026-11-28-reconciliation-rulings.md` R1 (this plan's key-level Undo, `KeyEdit { key_path, member, present }`, `set_member`, `undo_key` and `file:` ids, is the one P2 calls), R2 (this plan owns the one vendor-CLI receipt, `apply::CommandReceipt` with `record_command`, `load_command`, `command_receipts` and `command_receipts_dir`, landed in the new Task 3b, which replaces the receipt shape this plan had assumed; Undo goes through P5's `undo_vendor_change`), R3 (Task 10 uses P1's committed names) and the P4 fixes: a profile load approved through P1's queue resolves `claude` through P7's `ENGINE_CLIS`; a partial load records `Applied` with the receipts that landed plus `stopped_at`; key-level writes keep their pre-write copy for Undo safety, and Recent changes never offers a restore for `~/.claude.json` (Q9). Shared names: `docs/plans/research/2026-11-28-cross-plan-interfaces.md`.

**Goal:** Give every write Hanger makes a lasting, machine-wide history with Undo and restore (4a), and let a person save and load named sets of MCP server states across the whole machine with one Undo (4b).

**Architecture:** 4a owns `mcp::switch::apply`. It lands three things there first: a key-level write and Undo for one name in a JSON list (consumed by P2 for `~/.claude.json`), an age floor on retention, and `restore_backup`. A new `recent` module then lists apply receipts, the Claude Code stash and the skill keep, and reaches Undo and restore without going through `ops`. 4b is a new `profiles` module. Profiles are files under `<data>/profiles/`. A load plans against `ops::contexts_for`, calls `ops::set_enabled_for` at the machine tiers in a fixed order, stops at the first failure, and records its receipts in a load record so one Undo walks them last-first.

**Tech Stack:** Rust (Tauri 2 commands, serde, `jsonc-parser` 0.34 `cst`), React 19 + TypeScript, Vitest.

**Spec:** `docs/plans/2026-11-28-harness-design.md` (§4.4, §5, §7, and the binding round 43 Answers). Research: `docs/plans/research/2026-11-28-slice4-profiles-backup.md`.

## Global Constraints

- `Receipt` (`apply.rs`) keeps every field, name and type. Callers of `safe_replace`, `safe_replace_with`, `undo` and `latest_receipts` compile unchanged.
- No new `ApplyError` variant. `ops`' `From<ApplyError>` matches it in full, and `ops` is P2's.
- Retention: "20 copies per file, none deleted before 30 days" (Q9). `KEPT_PER_FILE = 20`.
- "A file the engine keeps rewriting (`~/.claude.json`) can be undone by key but not restored from an old copy" (Q9). A key-level write still keeps its pre-write copy, on purpose: it is what Undo-safety checks compare against, and `backup_file: Some` keeps a key receipt apart from "the write created the file". `restore_backup` refuses every key receipt, so Recent changes never offers a restore for `~/.claude.json`.
- "A profile covers the whole machine and holds servers only. Servers it doesn't name are left alone, and 'turn everything else off' is a checkbox in the preview" (Q8). Profiles never add a server.
- "Profiles are files under `<data>/profiles/`, with no migration." The store schema never moves.
- No value from a config file crosses IPC, reaches SQLite, or is logged. Paths cross IPC only through `preferences::sanitise_path`.
- Counts come from the backend (`invariants.md`). Every figure a new surface shows is a field the backend computed.
- No `window.confirm`/`alert`/`prompt` (`no-blocking-dialogs.test.ts`). Tokens only, type roles from `typeRoles.ts`.
- A model may ask to load a profile. It may not ask to restore an old copy (Q10).
- Recent changes does not cover deploy backups (`transactional::write_transactional`'s `.hanger/backups`, `known-debt.md`), and its copy must not say it does.
- Commit steps use explicit paths, in their own call, with no `-n` anywhere. This track works in its own worktree. `src/App.tsx` is staged by hunk if a task touches it (`shared-checkout.md`).

## Review Focus

1. **Claude Code rewrites `~/.claude.json` between Hanger's read and its write.** The key write and the key Undo refuse with `ChangedSinceRead` and lose nothing. Pinned in Task 1 (`a_key_write_refuses_a_file_that_changed_after_it_was_read`).
2. **A profile load fails halfway.** Undo walks back exactly the switches that landed, last first, and no others. Pinned in Task 7 (`a_load_stops_at_the_first_failure`) and Task 8 (`undoing_a_partial_load_takes_back_only_what_landed`).
3. **A profile name that is a path, empty, too long, or a case-variant of an existing one.** Refused before any file is touched. Pinned in Task 6 (`profile_names_are_checked`, `a_name_that_differs_only_in_case_is_already_there`).
4. **A restore after the file was deleted, or after its copy was evicted or altered.** A deleted file comes back. A missing or altered copy is refused, and nothing is written. Pinned in Task 3.
5. **A profile that names a server since removed or since made read-only.** It is skipped and listed with its reason, never added. Pinned in Task 7 (`a_preview_sorts_changes_and_skips_by_reason`).

---

## What this plan owns

`mcp::switch::apply` (design §5). The interfaces land in Tasks 1 to 3b, before anything else in this plan, and are stated exactly in Tasks 1 and 3b's Interfaces blocks. Everyone else calls `apply` unchanged. Two of them are consumed by other plans:

- the key-level write and Undo (Task 1): P2 calls `set_member`/`set_member_with`, and reaches `undo_key` through `apply::undo` (ruling R1);
- the command receipt (Task 3b): P3 and P5 write it, and Recent changes lists it (ruling R2).

New modules owned here: `src-tauri/src/recent.rs`, `src-tauri/src/profiles.rs`.

## Cross-plan interfaces

Every name here matches its owner's plan; the full table is `docs/plans/research/2026-11-28-cross-plan-interfaces.md`.

| Name and type | Owner | Status |
|---|---|---|
| `ops::contexts_for(&SwitchPlaces, probe_of) -> Vec<EngineContext>`, `ops::set_enabled_for(&SwitchPlaces, &ClaudeCli, engine_id, key, enabled, probe_of) -> Result<SwitchReply, SwitchFailure>`, `ops::undo_for(...)`, `ops::kept_off_for(&SwitchPlaces) -> KeptOff`, `SwitchFailure::code()`, `impl From<ApplyError> for SwitchFailure`, `ContextItem { key, name, tier, state, read_only }` | P2 (slice 2) | On `main` now. P2 keeps the signatures source-compatible (design §5). After P2, contexts may hold `tier == "project"` items; 4b filters them out |
| The `what` an `ops` switch writes into a receipt: `"<engine_id> · <name> · on"` or `"… · off"`, extra ` · `-separated segments allowed after the third. P2's project writes add `in project` as a fourth | P2 | On `main` now (`ops::switch`). Task 4's first test pins it against a real `ops` switch, so a change reddens there |
| P2 writes Claude Code's per-project key through this plan's `apply::set_member` with `key_path = ["projects", <realpath>, "disabledMcpServers"]`, `member = <server name>`, `present = !enabled`, threads its race seam into `set_member_with`, and adds `~/.claude.json` to `ops::written_for` for `claude-code`, so `undo_for`'s `file:` route reaches `apply::undo` and so `undo_key` | P2 consumes from this plan (R1) | Waiting on P2's Task 4. Recent changes reaches the key Undo without it (Task 4) |
| `skill_switch::ops::kept_for(&SkillPlaces) -> KeptSkills` (`KeptSkill { key: "kept-skill:<uuid>", name, at_ms, interrupted, back_in_store }`), `undo_skill_switch` taking `"kept:<uuid>"` | P5 (owns `skill_switch`) | On `main` now; called unchanged |
| `apply::CommandReceipt`, `ReverseProgram`, `record_command`, `load_command`, `command_receipts`, `command_receipts_dir` (Task 3b) | **This plan** (R2) | P3's Claude Code `add-json` and `remove` (P3 Task 11) and P5's `gh skill` and `claude plugin` writes (P5 Tasks 4, 15) record them. Tell both on `SendMessage` when Task 3b lands |
| IPC `undo_vendor_change(receipt_id: String) -> UndoReply`, which runs any `CommandReceipt`'s reverse | P5 (Task 5) | Task 9's Undo route. Waiting on P5's Task 5 |
| `Ask` (`#[serde(tag = "verb")]`), `Proposal`, `Status::Applied { receipt_id: Option<String>, stopped_at: Option<String> }`, `Filed`, `Refusal`, `Fresh<_>`, `ServerPlaces`, `Preview { …, name, to: Option<ItemState>, target: PreviewTarget, change: Change }`, `Change::Lines`, `approve::decide`, `approve::engine_of`, `proposals::waiting`/`save`, `MAX_WAITING`, and the tool table `TOOLS` in `mcp_server/mod.rs`. P1's plan: "P4b adds `ApplyProfile`" with its own variant, filing function, preview arm and decide arm | P1 (MCP phase 2) | Waiting on P1. Task 10 |
| `engine_status::clis::cli_for("claude-code")` and `resolve::resolve_in`, to find `claude` for a load approved through the queue | P7 (T19) | Waiting on P7's Task 1. Task 10 |
| The overview card's engine section and its slot for the profile control (`OverviewCard`, `OverviewHost`) | P7 (T19) | Waiting on P7's card landing and the combined card layout round. Task 8 |
| `src/hooks/useMcpSwitch.ts` | Unowned; merge order P1 → P2 → P4 | Task 8 rebases onto P1's and P2's changes |

## File structure

- Modify `src-tauri/src/mcp/switch/apply.rs`: key-level write and Undo, retention age floor, `restore_backup`, `history`, and the command receipt. Module doc updated: `ops` is no longer its only caller.
- Modify `src-tauri/src/mcp/switch/mod.rs`: one doc line, "are called only by the fifth, `ops`, and `ops` only by five commands in …". Both halves go stale: `apply` is also called by `crate::recent`, and `ops` also by `crate::profiles`. Task 4 corrects the first half and Task 7 the second. Doc-only; tell P2 on `SendMessage` before each edit, since P2 owns the module's code.
- Create `src-tauri/src/recent.rs`: the Recent changes list, its Undo and its restore.
- Create `src-tauri/src/profiles.rs`: profile files, plan, load, load records, Undo of a load.
- Modify `src-tauri/src/lib.rs`: `pub mod recent; pub mod profiles;`, nine commands, `generate_handler!`.
- Create `src-tauri/tests/apply_history_tests.rs`, `src-tauri/tests/command_receipt_tests.rs`, `src-tauri/tests/recent_changes_tests.rs`, `src-tauri/tests/profiles_tests.rs`. New files, so P2 and P3's edits to `mcp_switch_tests.rs` don't meet these.
- Modify `src-tauri/tests/mcp_switch_tests.rs`: two eviction tests only (Task 2's forced edit).
- Modify `docs/ipc.md` (nine sections, each numbered from the next free number at commit time), `README.md` (generated `ipc` and `tests` regions).
- Create, after the layout rounds: `src/components/RecentChanges.tsx`, `src/hooks/useRecentChanges.ts`, `src/components/ProfileControl.tsx`, `src/components/ProfilePreview.tsx`, and their tests. Modify `src/hooks/useMcpSwitch.ts`, `src/components/DesignSystemPane.tsx`, `src/data/designSystemFixtures.ts`, `.claude/DESIGN.md`.

---

### Task 1: `apply` writes and undoes one name in a JSON list (the key-level Undo)

**Files:**
- Modify: `src-tauri/src/mcp/switch/apply.rs`
- Test: `src-tauri/tests/apply_history_tests.rs` (new; its own `bench()`, `names_in()`, `sha()` helpers, copied from `mcp_switch_tests.rs` → `bench`)

**Interfaces:**
- Consumes: `apply::safe_replace`'s internals (`keep`, `write_atomic`, `listed`), unchanged in behaviour.
- Produces, in `src-tauri/src/mcp/switch/apply.rs`. **This is the signature P2 consumes.**

```rust
/// One string in a JSON list, at a path of object keys from the root.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct KeyEdit {
    /// e.g. ["projects", "/Users/k/Work/app", "disabledMcpServers"]. The last
    /// key names the list; every key before it names an object.
    pub key_path: Vec<String>,
    /// The string the write puts in or takes out.
    pub member: String,
    /// true: the write leaves `member` in the list. false: it leaves it out.
    pub present: bool,
}

/// A receipt for a key-level write: `Receipt`, unchanged, plus the key. On
/// disk it is the same `<backup>.receipt.json` with one more field, `key`,
/// so `latest_receipts` lists it as a plain `Receipt`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct KeyReceipt {
    #[serde(flatten)]
    pub receipt: Receipt,
    pub key: KeyEdit,
}

/// Put `edit.member` in, or take it out of, the list at `edit.key_path` in
/// the file at `path`, read fresh. `Ok(None)`: already so, nothing written.
pub fn set_member(path: &Path, edit: &KeyEdit, backups: &Path, what: &str)
    -> Result<Option<KeyReceipt>, ApplyError>;

/// `set_member`, with a hook run after the read and before the write.
#[doc(hidden)]
pub fn set_member_with(path: &Path, edit: &KeyEdit, backups: &Path, what: &str,
    before_write: &dyn Fn()) -> Result<Option<KeyReceipt>, ApplyError>;

/// Take back one key write: re-read the file, require the list to hold what
/// the write left (`key.present`), and write the opposite. The reply is the
/// Undo's own `KeyReceipt` (`what` = "undo · <what>"), undoable in turn.
pub fn undo_key(receipt_id: &str, backups: &Path) -> Result<KeyReceipt, ApplyError>;

/// Pure: `text` with `member` in or out of the list at `key_path`.
/// `Ok(None)` when it already is.
pub fn member_text(text: &str, key_path: &[String], member: &str, present: bool)
    -> Result<Option<String>, ApplyError>;
```

- `undo(receipt_id, backups) -> Result<Receipt, ApplyError>` keeps its signature. For a receipt whose file carries `key`, it returns `undo_key(receipt_id, backups)?.receipt`, so `ops::undo_for`'s existing `file:` route reaches the key Undo unchanged.
- Rules for `member_text`, decided here:
  - The text is edited through `jsonc_parser::cst::CstRootNode` (`CstObject::object_value`, `CstArray::elements`/`append`, `CstNode::remove`), never re-serialised.
  - Adding appends at the end of the list. Removing takes out every element equal to `member`. An emptied list stays `[]`.
  - The last key missing: adding creates `"<key>": ["<member>"]` in its parent object, and removing is `Ok(None)`.
  - An object on the path missing: adding is `Err(ApplyError::Write(NO_PARENT))`, with `NO_PARENT = "the object the list belongs in is not in the file"`, and removing is `Ok(None)`. **P2:** a project with no entry in `~/.claude.json` is refused, not created. Ask the owner if that has to change.
  - The key holds something other than a list of strings: `Err(ApplyError::Write(NOT_A_LIST))`, with `NOT_A_LIST = "the key does not hold a list of names"`. Text that doesn't parse: `Err(ApplyError::Verify(DOES_NOT_PARSE))`.
- `set_member` reads the file; one that isn't there is `Err(ApplyError::Write(note(UNREADABLE, NotFound)))`. It writes through the same path as `safe_replace` (backup, receipt, temp file, rename, read-back), with `Format::Jsonc` and `expected_before` = the text it read. The receipt file gains the `key` field.
- `undo_key`: no receipt with that id, or one without `key`, is `NotUndoable(NO_SUCH_RECEIPT)`. `member_text(current, path, member, key.present)` not `Ok(None)` (the list no longer holds what the write left) is `NotUndoable(MOVED_ON)`. Otherwise `set_member` with `present` flipped.

- [ ] **Step 0: Per-kind baseline, read-only.** Run `sqlite3 -readonly "$HOME/Library/Application Support/com.rkarthik.hanger/hanger.db" "select category, scope, count(*) from assets group by category, scope order by category, scope;"`. Save the output with the command and the time to `docs/evidence/2026-11-28-slice4/counts-before.txt`, and paste it into the task report.

- [ ] **Step 1: Write the failing tests** in `apply_history_tests.rs`. The fixture `CLAUDE_JSON` is:

```json
{
  "numStartups": 3,
  "projects": {
    "/work/app": {
      "allowedTools": [],
      "disabledMcpServers": []
    }
  }
}
```

`LIST = ["projects", "/work/app", "disabledMcpServers"]`, `WHAT = "claude-code · github · off"`. `parsed(path)` is `serde_json::Value`. `without_list(v)` removes `projects./work/app.disabledMcpServers`.

  - `a_key_write_puts_one_name_in_the_list_and_changes_nothing_else`: `set_member(path, &KeyEdit{key_path: LIST, member: "github", present: true}, backups, WHAT)` is `Ok(Some(r))`. The list is `["github"]`. `without_list(after) == without_list(before)`. `r.key.member == "github"`. `r.receipt.what == WHAT`. `apply::latest_receipts(backups) == vec![r.receipt.clone()]`.
  - `a_key_write_that_changes_nothing_writes_nothing`: `present: false` on the empty list is `Ok(None)`, and `names_in(backups)` is empty.
  - `a_missing_list_is_made_and_a_missing_project_is_refused`: with `disabledMcpServers` deleted from the fixture, adding gives the list `["github"]`. With `key_path` `["projects", "/work/other", "disabledMcpServers"]`, adding is `Err(ApplyError::Write(_))`, and the file's bytes equal the fixture's.
  - `a_non_list_at_the_key_is_refused`: `"disabledMcpServers": "github"` and `"disabledMcpServers": [1]` each give `Err(ApplyError::Write(_))`, with bytes unchanged.
  - `member_text_removes_every_copy_of_the_name`: `member_text(r#"{"l": ["a", "github", "github"]}"#, &["l"], "github", false)` parses to `{"l": ["a"]}`.
  - `a_key_undo_survives_the_engine_rewriting_the_file`: after adding `github`, overwrite the file with the keys reordered, `numStartups: 4`, a new top-level `"tipsHistory": {}`, and the list `["other", "github"]`. `apply::undo(&r.receipt.id, backups)` is `Ok`. The list is `["other"]`, `numStartups` is `4`, and `tipsHistory` is still there. Then `undo_key(<that undo's id>)` gives the list `["other", "github"]`, and its `what` is `"undo · undo · claude-code · github · off"`.
  - `a_key_undo_refuses_when_the_name_is_already_out`: after adding `github`, overwrite the list with `[]`. `undo_key` is `Err(ApplyError::NotUndoable(_))`, with bytes unchanged.
  - `a_key_write_refuses_a_file_that_changed_after_it_was_read`: `set_member_with(..., &|| fs::write(&path, OTHER).unwrap())` is `Err(ApplyError::ChangedSinceRead)`. The file holds `OTHER`, and `latest_receipts` is empty.

- [ ] **Step 2: Run** `cd src-tauri && cargo test --test apply_history_tests`. Expected: FAIL to compile, with `cannot find function \`set_member\` in module \`apply\`` (E0425) and `cannot find type \`KeyEdit\``.
- [ ] **Step 3: Implement** the Interfaces above in `apply.rs`. The receipt is written by `keep` taking an `Option<&KeyEdit>`; `listed` gains a sibling that parses `KeyReceipt` with `key: Option<KeyEdit>` (serde `default`). Update the module doc: a "Key-level writes" section, and "`ops` is its only caller" corrected.
- [ ] **Step 4: Run** the file, then the full `cargo test` from `src-tauri/`. Expected: PASS. `mcp_switch_tests` and `ipc_boundary_tests` are unchanged and green.
- [ ] **Step 5: Commit.** `git add src-tauri/src/mcp/switch/apply.rs src-tauri/tests/apply_history_tests.rs` in one call, then in its own call `git commit -m "feat(apply): write and undo one name in a JSON list, surviving the engine's own rewrites" -- src-tauri/src/mcp/switch/apply.rs src-tauri/tests/apply_history_tests.rs`.
- [ ] **Step 6: Tell P2** on `SendMessage` that the interface has landed, with the commit SHA (resolved with `git cat-file -t`) and the Interfaces block above.

### Task 2: Retention: 20 copies per file, none deleted before 30 days

**Files:**
- Modify: `src-tauri/tests/mcp_switch_tests.rs` (two tests, forced edit, own commit first)
- Modify: `src-tauri/src/mcp/switch/apply.rs` (`evict`, one new const)
- Test: `src-tauri/tests/apply_history_tests.rs`

**Interfaces:**
- Produces: `const KEPT_AT_LEAST_MS: i64 = 30 * 24 * 60 * 60 * 1000;`. `evict` deletes a backup and its receipt exactly when it is outside its file's newest `KEPT_PER_FILE` and `now_ms() - receipt.at_ms > KEPT_AT_LEAST_MS`, with the real clock. A future-dated receipt is never deleted. As today, only receipts that kept a backup count toward a file's newest `KEPT_PER_FILE` (`evict`'s `held` counter); a created-file receipt (`backup_file: None`) neither counts nor is evicted by count.

- [ ] **Step 1: The forced edit, committed alone.** `the_twenty_first_backup_evicts_the_oldest` and `eviction_removes_the_receipt_with_its_backup_and_leaves_other_files_alone` write with today's clock and expect eviction. Under the new rule nothing that young is evicted, so both would go red. Change their writes from `replace(...)` to `apply::safe_replace_with(..., Seams { at_ms: 1_000 + n, verify: &accept })`, keeping each test's order of stamps (in the second test the quiet file's first write takes the lowest stamp). Assertions unchanged. Run `cd src-tauri && cargo test --test mcp_switch_tests evict`. Expected: PASS on the old code. Commit alone: `git add src-tauri/tests/mcp_switch_tests.rs`, then in its own call `git commit -m "test(apply): date the eviction tests' writes in 1970, ahead of the 30-day floor" -- src-tauri/tests/mcp_switch_tests.rs`. The body names the cause: the Q9 age floor in the next commit.
- [ ] **Step 2: Write the failing tests** in `apply_history_tests.rs`:
  - `twenty_five_writes_this_month_keep_twenty_five_copies`: 25 `safe_replace` writes of one file give 25 backups and 25 listed receipts.
  - `copies_past_twenty_go_only_once_they_are_thirty_days_old`: with `day = 86_400_000` and `now` the real clock, writes 1 to 3 at `now - 31*day + n`, and writes 4 to 24 at `now - day + n`, through `safe_replace_with`. The listed ids equal writes 24 down to 4 (21 receipts): 1 to 3 are gone, and 4 is kept although it is 21st, because it is young.
- [ ] **Step 3: Run** `cd src-tauri && cargo test --test apply_history_tests copies_ twenty_five`. Expected: FAIL. `twenty_five_writes…` gives `assertion \`left == right\` failed  left: 20  right: 25`.
- [ ] **Step 4: Implement** the rule in `evict`. Update the module doc's step 7 and the `KEPT_PER_FILE` doc ("Q9, round 43").
- [ ] **Step 5: Run** both test files, then the full `cargo test`. Expected: PASS.
- [ ] **Step 6: Commit** `apply.rs` and `apply_history_tests.rs`: `feat(apply): keep every copy younger than 30 days, beyond the newest 20`.

### Task 3: `restore_backup` and `history`

**Files:**
- Modify: `src-tauri/src/mcp/switch/apply.rs`
- Test: `src-tauri/tests/apply_history_tests.rs`

**Interfaces:**
- Produces:

```rust
/// Put back the copy a receipt kept: the file as it was before that write.
/// Itself a write, with a receipt (`what` = "restore · <what>"), so `undo`
/// takes it back. A file that is gone since is made again.
pub fn restore_backup(receipt_id: &str, backups: &Path) -> Result<Receipt, ApplyError>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HistoryEntry {
    pub receipt: Receipt,
    pub key: Option<KeyEdit>,
    /// `undo` would not refuse with `NotUndoable` before writing.
    pub undoable: bool,
    /// `restore_backup` would not refuse with `NotUndoable` before writing.
    pub restorable: bool,
}

/// Every receipt, newest first, with what each can still do.
pub fn history(backups: &Path) -> Vec<HistoryEntry>;
```

- `restore_backup` refuses with `NotUndoable` and writes nothing when: the id names no receipt (`NO_SUCH_RECEIPT`); the receipt carries `key` (`BY_KEY_ONLY = "a file written by key is undone by key, not restored from a copy"`, Q9); it has no `backup_file` (`NO_COPY = "that write kept no copy"`); the copy is gone (`BACKUP_GONE`) or no longer hashes to `before_sha256` (`BACKUP_ALTERED`); or the file already holds the copy's bytes (`SAME_AS_NOW = "the file already holds that copy"`). Otherwise it runs `safe_replace(path, <current text or None>, <copy>, <format from the copy's extension, as undo picks it>, backups, "restore · <what>")`.
- `undoable` and `restorable` come from the same checks `undo` and `restore_backup` make, shared as private functions, not re-implemented.

- [ ] **Step 1: Write the failing tests.** Fixture: `numbered(n)` writes n0 to n1 (`r1`), n1 to n2 (`r2`), n2 to n3 (`r3`).
  - `restore_puts_back_an_older_copy_and_is_itself_undoable`: `restore_backup(&r1.id)` leaves the file holding `numbered(0)`, with `what == "restore · " + WHAT`. `undo(&restored.id)` leaves it holding `numbered(3)`.
  - `restore_brings_back_a_file_deleted_since`: after `r1`, delete the file. `restore_backup(&r1.id)` makes it again, holding `numbered(0)`.
  - `restore_refuses_a_key_receipt_and_a_created_file`: a `set_member` receipt, and a `safe_replace(path, None, …)` receipt, each give `Err(NotUndoable(_))`, with bytes unchanged.
  - `restore_refuses_a_missing_or_altered_copy`: deleting `r1`'s backup, and in a second run overwriting it with `"x"`, each give `Err(NotUndoable(_))`. The file holds `numbered(3)`.
  - `history_says_what_each_receipt_can_do`: after `r1` to `r3`, `history` gives ids `[r3, r2, r1]`, `undoable [true, false, false]`, `restorable [true, true, true]`. Then a key write and an overwrite of its list with `[]` give that entry `key: Some(_)`, `undoable: false`, `restorable: false`.
- [ ] **Step 2: Run** `cd src-tauri && cargo test --test apply_history_tests restore history`. Expected: FAIL to compile, with `cannot find function \`restore_backup\``.
- [ ] **Step 3: Implement.** The module doc gains a "# Restore" section.
- [ ] **Step 4: Run** the file and the full `cargo test`. Expected: PASS.
- [ ] **Step 5: Commit** `apply.rs` and `apply_history_tests.rs`: `feat(apply): restore any kept copy, as a write of its own`.

### Task 3b: The command receipt, one type for every vendor-CLI write (Q6, ruling R2)

Lands before P3's Task 11 and P5's Task 4, which both wait on it. This plan defines the type and its store; it runs no command. P5's `vendor_cli::undo` runs the reverse.

**Files:**
- Modify: `src-tauri/src/mcp/switch/apply.rs`
- Test: `src-tauri/tests/command_receipt_tests.rs` (new)

**Interfaces:**
- Produces, in `src-tauri/src/mcp/switch/apply.rs`. **This is the shape P3 and P5 write.**

```rust
/// Which program runs a receipt's reverse.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReverseProgram { Gh, Claude, SkillSwitch }

/// A write made through a vendor's own CLI (Q6): what was done, and the
/// command that takes it back. Ids and argv only, never a config value.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommandReceipt {
    /// "cmd:<uuid>".
    pub id: String,
    pub at_ms: i64,
    /// "<engine_id or tool> · <verb> · <name>", ids only, e.g.
    /// "claude-code · remove · github", "gh skill · install · pdf".
    pub what: String,
    pub program: ReverseProgram,
    /// argv after the program. Empty: this write has no Undo.
    pub reverse_args: Vec<String>,
    /// A stash record whose kept entry goes on the reverse's stdin (a Claude
    /// Code remove's `add-json`). The entry itself stays in the stash, one of
    /// the anti-goal's two named places, and is never in a receipt.
    pub reverse_stdin_stash: Option<String>,
}

/// `<data>/commands`.
pub fn command_receipts_dir(data_dir: &Path) -> PathBuf;
/// Writes `<dir>/<uuid>.json`, 0600 in a 0700 folder, temp file and rename.
/// Callers record before they reply. A relative `dir` is refused.
pub fn record_command(dir: &Path, receipt: &CommandReceipt) -> Result<(), ApplyError>;
/// `None` unless `id` is `cmd:<uuid>` with a uuid that parses, checked
/// before any filesystem call.
pub fn load_command(dir: &Path, id: &str) -> Option<CommandReceipt>;
/// Every receipt, newest first. Skips files that don't parse and names that
/// aren't `<uuid>.json`.
pub fn command_receipts(dir: &Path) -> Vec<CommandReceipt>;
```

- Retention: none in this task. `shortcut: command receipts are never swept; add KEPT_AT_LEAST_MS's rule when <data>/commands grows past a few hundred files.`

- [ ] **Step 1: Write the failing tests** in `command_receipt_tests.rs`:
  - `a_command_receipt_round_trips_and_is_0600_in_a_0700_folder`: `record_command` into a missing `dir`, then `load_command(dir, &r.id) == Some(r)`; modes `0o700` and `0o600`.
  - `the_wire_shape_is_pinned`: `serde_json::to_value` of a receipt with `program: SkillSwitch`, `reverse_args: ["skill:pdf"]`, `reverse_stdin_stash: None` equals a literal with exactly the keys `id`, `at_ms`, `what`, `program`, `reverse_args`, `reverse_stdin_stash`, and `program == "skill_switch"`.
  - `an_id_that_is_not_one_touches_no_file`: plant `secret.json` beside the folder; `load_command(dir, "cmd:../secret")`, `load_command(dir, "file:<uuid>")` and `load_command(dir, "x")` are `None`.
  - `receipts_list_newest_first_and_skip_junk`: three receipts at 30, 10, 20 and a `junk.json`; ids come back 30, 20, 10.
  - `a_relative_folder_is_refused`.
- [ ] **Step 2: Run** `cd src-tauri && cargo test --test command_receipt_tests`. Expected: FAIL to compile, with `cannot find type \`CommandReceipt\` in module \`apply\``.
- [ ] **Step 3: Implement.** The module doc gains a "# Command receipts" section: Q6, ids and argv only, the stash rule.
- [ ] **Step 4: Run** the file, then the full `cargo test`. Expected: PASS. Regenerate the README `tests` figure with `~/.bun/bin/bun run src/__tests__/readmeCounts.ts`, then `npx vitest run src/__tests__/readme-sync.test.ts` from the repo root.
- [ ] **Step 5: Commit** `apply.rs`, `command_receipt_tests.rs` and `README.md`: `feat(apply): one receipt for a write made through a vendor's own CLI, holding its reverse`.
- [ ] **Step 6: Tell P3 and P5** on `SendMessage` that the type has landed, with the SHA (`git cat-file -t` first) and this Interfaces block.

### Task 4: The Recent changes list, its Undo and restore (backend and IPC)

**Files:**
- Create: `src-tauri/src/recent.rs`
- Modify: `src-tauri/src/lib.rs`, `src-tauri/src/mcp/switch/mod.rs` (one doc line, after telling P2), `docs/ipc.md`, `README.md` (generated)
- Test: `src-tauri/tests/recent_changes_tests.rs` (new). The Claude Code stand-in comes from `ipc_boundary_tests.rs` → `SwitchBench::fake_claude`, copied.

**Interfaces:**
- Consumes: Task 3's `history`, `undo`, `restore_backup`; `ops::kept_off_for`; `skill_switch::ops::kept_for`; `discover::engine_display_name` (`pub(crate)`).
- Produces, in `src-tauri/src/recent.rs`:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ChangeSource { File, Key, KeptServer, KeptSkill }  // Task 9 adds VendorCli

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Direction { On, Off, Unknown }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Via { Switch, Undo, Restore }

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RecentChange {
    /// File and Key: "file:<uuid>". KeptServer: "kept:<stash id>" (for
    /// undo_mcp_switch). KeptSkill: "kept:<uuid>" (for undo_skill_switch).
    pub id: String,
    pub source: ChangeSource,
    pub at_ms: i64,
    pub engine_id: Option<String>,
    pub engine_name: Option<String>,
    /// The server's or skill's name.
    pub name: Option<String>,
    pub direction: Direction,
    pub via: Via,
    /// sanitise_path of the real file; "" for kept entries.
    pub path: String,
    /// Key receipts under "projects": sanitise_path(key_path[1]).
    pub project: Option<String>,
    pub undoable: bool,
    pub restorable: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RecentChanges { pub changes: Vec<RecentChange>, pub count: usize }

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RecentReply { pub receipt_id: String, pub changes: RecentChanges }

pub fn list(switch: &SwitchPlaces, skills: &SkillPlaces) -> RecentChanges;
pub fn undo(switch: &SwitchPlaces, skills: &SkillPlaces, id: &str) -> Result<RecentReply, SwitchFailure>;
pub fn restore(switch: &SwitchPlaces, skills: &SkillPlaces, id: &str) -> Result<RecentReply, SwitchFailure>;
```

- Decisions:
  - `list` merges the sources newest first by `at_ms`. `count` is `changes.len()`, computed here.
  - Engine, name and direction come from parsing `what`. Strip leading `"undo · "` (k times) and `"restore · "`, then split on `" · "`. The first segment counts as an engine only if `registry::host_by_id` knows it. `on`/`off` is the third segment, flipped when k is odd. A restore is `Unknown`, and an unparsed shape is `Unknown` with `name: None`. `what` itself never crosses IPC.
  - Kept servers are `undoable: true` and `restorable: false`. Kept skills are `undoable: !interrupted && !back_in_store` and `restorable: false`.
  - `undo` and `restore` accept only `file:<uuid>` and call `apply::undo` / `apply::restore_backup` directly, not through `ops`. The trust boundary is that the receipt must be listed in Hanger's own backups folder and named for its contents (`apply::listed`). Any other id is `SwitchFailure::NotUndoable`. Kept entries are undone through the existing `undo_mcp_switch(engine_id, id)` and `undo_skill_switch(id)`.
  - IPC, each returning `Err(code)` with `SwitchFailure::code()`: `#[tauri::command(async)] get_recent_changes(app) -> RecentChanges`, `#[tauri::command(async)] undo_recent_change(app, receipt_id: String) -> RecentReply`, `#[tauri::command(async)] restore_backup(app, receipt_id: String) -> RecentReply`. Places come from `switch_places(&app)` and `skill_places(&app)`.

- [ ] **Step 1: Write the failing tests.** The bench is a temp home with `.codex/config.toml` declaring `alpha` and `beta`, plus `SWITCH_MARKERS` values in `alpha`'s env as in `ipc_boundary_tests.rs`, and `SkillPlaces::under(home, data)`.
  - `a_codex_switch_is_a_change_with_its_engine_and_server`: `ops::set_enabled_for(places, no_cli, "codex", beta_key, false, |_| None)`, then `recent::list`. `count == 1`, and `changes[0]` has `source: File`, `engine_id: Some("codex")`, `engine_name: Some("Codex")`, `name: Some("beta")`, `direction: Off`, `via: Switch`, `undoable: true`, `restorable: true`, `path: "<sanitised>/config.toml"`, and an `id` starting with `"file:"`. This pins `ops`' `what` format.
  - `undo_from_recent_changes_takes_the_switch_back`: `recent::undo(.., &changes[0].id)` leaves the config's bytes equal to the original. The new list has `count == 2`, and the newest entry has `via: Undo`, `direction: On`, `undoable: true`.
  - `restore_from_recent_changes_puts_back_an_older_copy`: off, then on (two receipts). `recent::restore` of the older id leaves the file in its pre-off bytes, and the newest entry has `via: Restore`, `direction: Unknown`.
  - `a_key_write_shows_its_project`: `apply::set_member` on a temp `.claude.json` with `what = "claude-code · github · off"` lists `source: Key`, `name: Some("github")`, `project: Some("<sanitised>/app")` (the key path holds the temp project path), and `restorable: false`.
  - `kept_skills_and_kept_servers_are_listed`: `skill_switch::ops::set_enabled_for(skill_places, &[], "skill:demo", false)` on `<home>/.agents/skills/demo/SKILL.md`, and a Claude Code off through `fake_claude`. They list `source: KeptSkill, name: Some("demo"), id: "kept:<uuid>", undoable: true` and `source: KeptServer, engine_id: Some("claude-code"), id: "kept:<stash id>"`.
  - `only_receipt_ids_are_undone_or_restored_here`: `recent::undo(.., "kept:x")`, `recent::restore(.., "file:nope")` and `recent::undo(.., "../../etc")` each give `Err(SwitchFailure::NotUndoable)`, and no file under the home changes.
  - `nothing_from_a_config_file_reaches_recent_changes`: `serde_json::to_string(&recent::list(..))` holds none of `SWITCH_MARKERS`.
- [ ] **Step 2: Run** `cd src-tauri && cargo test --test recent_changes_tests`. Expected: FAIL to compile, with `unresolved import \`tauri_app_lib::recent\``.
- [ ] **Step 3: Implement** `recent.rs` and the three commands. Send P2 a `SendMessage` naming the `mod.rs` doc line, then correct its first half (`apply` is also called by `crate::recent`).
- [ ] **Step 4: Docs.** Add three `docs/ipc.md` sections (`get_recent_changes`, `undo_recent_change`, `restore_backup`), numbered from the next free number at commit time, in the file's format, with codes. Regenerate the figures: `~/.bun/bin/bun run src/__tests__/readmeCounts.ts`.
- [ ] **Step 5: Run** the file, the full `cargo test` from `src-tauri/`, then from the repo root `npx vitest run src/__tests__/readme-sync.test.ts`. Expected: PASS, with the README's `ipc` figure 3 above the tip this merges onto (P1, P2, P3 and P5 also add commands; no absolute total is pinned here).
- [ ] **Step 6: Commit** `recent.rs`, `lib.rs`, `mod.rs`, `recent_changes_tests.rs`, `docs/ipc.md` and `README.md`: `feat(recent): every write Hanger made, newest first, with Undo and restore`.

### Gate N: naming brief (stop for Karthik)

- [ ] Contribute this plan's entries to the batched naming round (design §7: "one batched naming brief"). Research each label, with precedents from the engines, mcpick and macOS:
  - The **profile noun**. Not "Profile": the pane was renamed "Global" away from it, the file is still `ProfilePane.tsx`, and Codex's `--profile <name>` is a config overlay. The research's candidates: Preset, Setup, Loadout. Check whether Claude Code or Gemini CLI use any candidate (the research did not check).
  - **"Recent changes"**, and the verbs Undo and Restore with the restore warning ("later edits to this file are overwritten"). The warning says what is overwritten, and that the restore can be undone.
  - Every other string Tasks 5 and 8 render: row lines per `source`/`via`/`direction`, the not-undoable reasons, the key row's project, the preview's three groups and the "turn everything else off" checkbox, the save field, the notice line after a load and after its Undo, and each `SwitchFailure` and profile error code shown.
  - The surface says what it does not cover: deploys (`.hanger/backups`), and a Claude Code server switched back on, which leaves no entry.
- [ ] Every string through `/humanizer`.
- [ ] **STOP.** Karthik signs off in writing. Tasks 5 and 8 render nothing before this.

### Gate L1: Recent changes layout options at true width (stop for Karthik)

- [ ] Render two or three options for where Recent changes lives (an overview-card popover, a section in the engine detail, or a rail-less sheet from ⌘K) and how a row shows Undo and Restore with its warning. Use real tokens, at true width, in both themes, with this machine's `get_recent_changes` output shape (shape, not proportions: `design-for-any-machine`). Place the canvas in `docs/design-ref-prototypes/`.
- [ ] **STOP.** Karthik picks, and usually picks a hybrid. Record the pick and its date in this plan's Task 5 before Task 5 starts.

### Task 5: Recent changes UI (the option picked at Gate L1)

**Files:**
- Create: `src/hooks/useRecentChanges.ts`, `src/components/RecentChanges.tsx`, `src/components/RecentChanges.test.tsx`
- Modify: the host component Gate L1 names (stage `src/App.tsx` by hunk if touched), `src/components/DesignSystemPane.tsx`, `src/data/designSystemFixtures.ts`, `.claude/DESIGN.md`

**Interfaces:**
- Consumes: Task 4's IPC and types, mirrored by hand in TypeScript. The mirror is narrowed: `id` is a template string per `source`.
- Produces: `useRecentChanges(): { changes: RecentChanges | null; undo(c: RecentChange): Promise<void>; restore(c: RecentChange): Promise<void>; refresh(): Promise<void> }`. After any write it calls the same "changed" callback `useMcpSwitch` uses, so contexts and the scan refresh.
- Routes, decided here: `File`/`Key` Undo calls `undo_recent_change({ receiptId: c.id })`. `KeptServer` calls `undo_mcp_switch({ engineId: c.engine_id, receiptId: c.id })`. `KeptSkill` calls `undo_skill_switch({ receiptId: c.id })`. Restore calls `restore_backup({ receiptId: c.id })`, but only from the second, confirming control of an inline warning, never a dialog.

- [ ] **Step 1: Write the failing tests** (Vitest, `invoke` mocked as the existing hook tests do; fixtures built from Task 4's Rust test outputs, not from the type):
  - `each_source_undoes_through_its_own_command`: one row per source. Clicking Undo calls exactly the command and arguments above.
  - `restore_waits_for_the_warning_to_be_confirmed`: the first click shows the warning and calls nothing. The confirm calls `restore_backup` once, with the id.
  - `a_row_that_cannot_be_undone_offers_no_undo`: `undoable: false` renders no enabled Undo, and `restorable: false` no Restore.
  - `the_heading_figure_is_the_backends_count`: with `count: 7` and two rows, the heading shows 7. `no-frontend-counting.test.ts` stays green.
  - `nothing_is_said_before_the_list_arrives`: with `changes === null`, no empty-state line renders ("empty is a finding; pending is not").
- [ ] **Step 2: Run** `npx vitest run src/components/RecentChanges.test.tsx` from the repo root. Expected: FAIL, because `RecentChanges` cannot be resolved.
- [ ] **Step 3: Implement**, with the Gate N strings. Add a specimen to `DesignSystemPane.tsx` with a fixture in `designSystemFixtures.ts`, and a `.claude/DESIGN.md` paragraph citing the component by symbol.
- [ ] **Step 4: Run** `npx vitest run`, then `bunx tsc --noEmit` (report the exit code). Expected: PASS, exit 0, `design-system-coverage` and `no-off-token-styles` green.
- [ ] **Step 5: Commit** the files above by explicit path, with `src/App.tsx` by hunk if touched: `feat(recent): the Recent changes list, with Undo and a confirmed restore`.

### Gate V1: live check of Recent changes, by artefact (stop for Karthik)

- [ ] Run this branch's dev app through one scan first (`verification.md`: a live proof reads what older builds wrote).
- [ ] With Karthik's go-ahead, in the dev app (window by dev pid, `verifying-ui.md`): switch one Codex server off and on, open Recent changes, Undo the newest, restore the older copy through its warning, then Undo the restore.
- [ ] Artefacts, saved under `docs/evidence/2026-11-28-slice4/`: `ls -l` of `<data>/switch/backups` before and after; `diff` of `~/.codex/config.toml` against its pre-check copy (identical at the end); a screenshot of the list with the theme named; the `history` entries read back through `get_recent_changes` via the MCP bridge. Never read `~/.claude.json`'s values; show its key-level row only from `get_recent_changes`.
- [ ] After P2 merges, repeat for one Claude Code per-project switch: let Claude Code rewrite `~/.claude.json` (start and quit a session in that folder), then Undo from Recent changes. The artefact is `claude mcp get <name>` run in that folder before and after (no longer "Disabled for this project").
- [ ] **STOP.** Karthik's "done" is not the result. Read each artefact. A missing one is reported, not assumed.

### Task 6: Profile files: save, list, delete

**Files:**
- Create: `src-tauri/src/profiles.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/tests/profiles_tests.rs` (new)

**Interfaces:**
- Consumes: `ops::contexts_for`, `ContextItem`, `registry::SWITCHES` (order).
- Produces, in `src-tauri/src/profiles.rs`:

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProfileServer { pub engine_id: String, pub name: String, pub on: bool }

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Profile { pub version: u32 /* 1 */, pub name: String, pub saved_at_ms: i64, pub servers: Vec<ProfileServer> }

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ProfileSummary { pub name: String, pub saved_at_ms: i64, pub server_count: usize }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProfileError { NameRefused, AlreadyThere, NotFound, Unreadable, WriteFailed }
impl ProfileError { pub fn code(self) -> &'static str; }

/// `<data>/profiles`.
pub fn profiles_dir(data_dir: &Path) -> PathBuf;
pub fn save(places: &SwitchPlaces, dir: &Path, name: &str, replace: bool, now_ms: i64) -> Result<ProfileSummary, ProfileError>;
pub fn list(dir: &Path) -> Vec<ProfileSummary>;
pub fn read(dir: &Path, name: &str) -> Result<Profile, ProfileError>;
pub fn delete(dir: &Path, name: &str) -> Result<(), ProfileError>;
```

- Decisions:
  - A name matches `^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$`, else `NameRefused`, checked before any filesystem call. The file is `<dir>/<name>.json`.
  - An existing name, compared case-insensitively against `list` (not left to the volume), is `AlreadyThere` unless `replace`.
  - Writes go 0600 through a temp file in `dir` and a rename; `dir` is made 0700. A relative `dir` is `WriteFailed`.
  - `save` holds every item of `contexts_for` whose `tier` is not `"project"` and whose `read_only` is `None` (kept servers included, as off), one per `(engine_id, name)`, the first in context order.
  - The order is fixed: engines by their index in `SWITCHES` (codex, claude-code, gemini, antigravity), others after by id, then names by byte order.
  - `list` skips files that do not parse and names that are not `<valid name>.json`, sorted by name. `server_count` is computed here.
- IPC: `list_profiles(app) -> Vec<ProfileSummary>`, `save_profile(app, name: String, replace: bool) -> ProfileSummary`, `delete_profile(app, name: String) -> ()`. `Err` is `ProfileError::code()`. `dir` is `profiles_dir(app_data_dir)`.

- [ ] **Step 1: Write the failing tests.** The bench home has `.codex/config.toml` (`alpha` on, `beta` with `enabled = false`), `.gemini/settings.json` (`gamma`), `.gemini/mcp-server-enablement.json` with `gamma` off, and `.gemini/config/mcp_config.json` (`delta`). Fixture values carry `SWITCH_MARKERS`.
  - `a_saved_profile_holds_every_switchable_server_and_its_state`: `save(.., "Coding", false, 5)` writes `Coding.json`, which reads back as `version: 1`, `name: "Coding"`, `saved_at_ms: 5`, and `servers` `[{codex,alpha,true},{codex,beta,false},{gemini,gamma,false},{antigravity,delta,true}]`. The file is mode `0o600` and the folder `0o700`. The file's text holds none of `SWITCH_MARKERS`.
  - `profile_names_are_checked`: `""`, `".hidden"`, `"../x"`, `"a/b"` and 65 `a`s each give `Err(NameRefused)`, and `dir` does not exist afterwards. `"Work 2"` is `Ok`.
  - `a_name_that_differs_only_in_case_is_already_there`: after `"Coding"`, saving `"coding"` gives `Err(AlreadyThere)`. With `replace: true` it is `Ok`, and `list` has one entry.
  - `list_and_delete`: `list` is `[ProfileSummary { name: "Coding", saved_at_ms: 5, server_count: 4 }]`. A `junk.json` holding `{` is skipped. `delete("Coding")` empties the list, and `delete("Nope")` gives `Err(NotFound)`.
- [ ] **Step 2: Run** `cd src-tauri && cargo test --test profiles_tests`. Expected: FAIL to compile, with `unresolved import \`tauri_app_lib::profiles\``.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Docs.** Add three `docs/ipc.md` sections at the next free numbers, then `~/.bun/bin/bun run src/__tests__/readmeCounts.ts`.
- [ ] **Step 5: Run** the file, the full `cargo test`, and `npx vitest run src/__tests__/readme-sync.test.ts` from the repo root. Expected: PASS, with the `ipc` figure 3 above the tip.
- [ ] **Step 6: Commit** `profiles.rs`, `lib.rs`, `profiles_tests.rs`, `docs/ipc.md` and `README.md`: `feat(profiles): save the machine's server states as a named file`.

### Task 7: Preview, load, and Undo of a load

**Files:**
- Modify: `src-tauri/src/profiles.rs`, `src-tauri/src/lib.rs`, `docs/ipc.md`, `README.md`
- Test: `src-tauri/tests/profiles_tests.rs`

**Interfaces:**
- Consumes: Task 6; `ops::set_enabled_for`, `ops::undo_for`, `ops::contexts_for`, `ops::cached_measure`, `ReadOnlyReason`.
- Produces:

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PlannedSwitch { pub engine_id: String, pub engine_name: String, pub key: String, pub name: String, pub enabled: bool }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SkipReason { NotDeclared, ReadOnly { reason: ReadOnlyReason } }

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Skipped { pub engine_id: String, pub engine_name: String, pub name: String, pub reason: SkipReason }

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ProfilePlan { pub changes: Vec<PlannedSwitch>, pub skipped: Vec<Skipped>,
    pub change_count: usize, pub already_count: usize, pub skipped_count: usize }

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Landed { pub engine_id: String, pub engine_name: String, pub name: String, pub receipt_id: String }

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LoadFailure { pub engine_id: String, pub engine_name: String, pub name: String, pub code: String }

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ProfileLoad {
    /// "profile-load:<uuid>", or None when nothing landed.
    pub load_id: Option<String>,
    pub landed: Vec<Landed>,
    pub failed: Option<LoadFailure>,
    pub not_attempted_count: usize,
    pub skipped: Vec<Skipped>,
    pub contexts: Vec<EngineContext>,
}

/// Pure.
pub fn plan(profile: &Profile, contexts: &[EngineContext], everything_else_off: bool) -> ProfilePlan;
pub fn preview(places: &SwitchPlaces, dir: &Path, name: &str, everything_else_off: bool) -> Result<ProfilePlan, ProfileError>;
pub async fn load<P: FnMut(&str) -> Option<Measured>>(places: &SwitchPlaces, cli: &ClaudeCli, dir: &Path, loads: &Path,
    name: &str, everything_else_off: bool, probe_of: P) -> Result<ProfileLoad, ProfileError>;
pub async fn undo_load<P: FnMut(&str) -> Option<Measured>>(places: &SwitchPlaces, cli: &ClaudeCli, loads: &Path,
    load_id: &str, probe_of: P) -> Result<ProfileLoad, ProfileError>;
/// `<data>/profile-loads`.
pub fn loads_dir(data_dir: &Path) -> PathBuf;
```

- Decisions:
  - **`plan`.** Items with `tier == "project"` are ignored. For each profile entry, every item of that engine with that name: `read_only` Some is skipped with its reason; already in the state is counted in `already_count`; otherwise a `PlannedSwitch`. No item of that name for that engine is `NotDeclared`. With `everything_else_off`, every remaining switchable, `On` item not named by the profile becomes an `enabled: false` change. Changes and skips follow Task 6's fixed order, then by `key`. Counts are computed here.
  - **`load`.** Re-plans at load time; the preview is not trusted. It runs the changes one at a time through `ops::set_enabled_for` and stops at the first `Err`. A reply with `receipt_id: None` (already so) lands nothing. Only then does it write a load record, `<loads>/<uuid>.json`, 0600 in a 0700 folder: `{ id, at_ms, profile, landed }`. `contexts` is `ops::contexts_for` with `probe_of`. `ProfileError::NotFound` for a missing profile; a failed switch is `failed`, not `Err`.
  - **`undo_load`.** Accepts only `profile-load:<uuid>` whose record loads (`uuid::Uuid::parse_str` before any filesystem call, else `NotFound`). It walks `landed` last-first through `ops::undo_for` and stops at the first failure. The Undo's own receipts, in the order made, form a new load record, so the Undo can itself be undone.
  - `shortcut: load records are never swept; add a 30-day sweep if <data>/profile-loads grows past a few hundred files.`
  - Kept servers come through `contexts_for`'s `stash:` items, so a saved `on` brings a kept Claude Code server back through the CLI. With no `claude` on the path, that change fails with `cli_not_found` and the load stops there. `lib.rs` resolves the CLI with `claude_cli_for("claude-code")` for every load and every Undo of one.
- IPC: `preview_profile(app, name, everything_else_off: bool) -> ProfilePlan`, `load_profile(app, name, everything_else_off: bool) -> ProfileLoad`, `undo_profile_load(app, load_id: String) -> ProfileLoad`. `Err` is `ProfileError::code()`.

- [ ] **Step 1: Write the failing tests** on Task 6's bench, with no `claude` (`ClaudeCli { program: None, .. }`):
  - `a_preview_sorts_changes_and_skips_by_reason`: profile `[{antigravity,delta,false},{codex,alpha,false},{gemini,gamma,true},{codex,ghost,false},{codex,beta,false}]`, plus an OpenCode server `omega` declared in the bench and named `{opencode,omega,false}`. `changes` are `[codex alpha off, gemini gamma on, antigravity delta off]`, in Task 6's fixed order (engines by their `SWITCHES` index, then names by byte order). `skipped` is `[{codex, ghost, NotDeclared}, {opencode, omega, ReadOnly{EngineNotConfirmed}}]`. `change_count: 3`, `already_count: 1`, `skipped_count: 2`.
  - `everything_else_off_adds_the_unnamed_on_servers`: a profile `[{gemini,gamma,true}]` with the flag set plans `[codex alpha off, gemini gamma on, antigravity delta off]`, and without it plans `[gemini gamma on]`.
  - `a_load_applies_in_order_and_one_undo_puts_every_file_back`: the profile from the first test. `landed` engine ids are `["codex", "gemini", "antigravity"]`, every `receipt_id` starts with `"file:"`, `failed: None`, and the three files show the profile's states. `undo_load(load_id)` makes the Codex and Antigravity files byte-identical to before and puts Gemini's state file back as it was. Its own `load_id` is `Some`, and a second `undo_load` of that id reapplies the profile.
  - `a_load_stops_at_the_first_failure`: make `.gemini` mode `0o500`, so the state file's temp file cannot be made beside it (restore the mode in the test's teardown). `landed` is `[codex alpha]`, `failed` is `{engine_id: "gemini", name: "gamma", code: "write_failed"}`, `not_attempted_count: 1`, and the Antigravity file's bytes are unchanged. `undo_load` restores the Codex bytes.
  - `a_load_with_nothing_to_change_writes_nothing`: a second identical load gives `load_id: None` and empty `landed`; the backups folder's file count is unchanged and `loads` holds one record.
  - `a_load_id_that_is_not_one_touches_no_file`: `undo_load(.., "profile-load:../x")` and `undo_load(.., "file:abc")` give `Err(NotFound)`.
- [ ] **Step 2: Run** `cd src-tauri && cargo test --test profiles_tests`. Expected: FAIL to compile, with `cannot find function \`plan\` in module \`profiles\``.
- [ ] **Step 3: Implement**, then the three commands.
- [ ] **Step 4: Docs.** Add three `docs/ipc.md` sections at the next free numbers, then `~/.bun/bin/bun run src/__tests__/readmeCounts.ts`. Send P2 a `SendMessage`, then correct the second half of the `mod.rs` doc line (`ops` is also called by `crate::profiles`).
- [ ] **Step 5: Run** the file, the full `cargo test`, and `npx vitest run src/__tests__/readme-sync.test.ts`. Expected: PASS, with the `ipc` figure 3 above the tip.
- [ ] **Step 6: Commit** `profiles.rs`, `lib.rs`, `src-tauri/src/mcp/switch/mod.rs` (doc line), `profiles_tests.rs`, `docs/ipc.md` and `README.md`: `feat(profiles): preview and load a profile in a fixed order, with one Undo`.

### Gate L2: the profile control in the combined card layout round (stop for Karthik)

- [ ] Waiting on P7: the overview card's engine section has landed, and the combined card round (design §7: S, W, K, P6, P4b) is scheduled. Supply this plan's part: a save control, a load control that opens a preview (changes, already-so, skipped with reasons, the "turn everything else off" checkbox), and the notice after a load. Use the Gate N strings, real tokens, at true width.
- [ ] **STOP.** Karthik picks. Record the pick and its date in Task 8 before it starts.

### Task 8: Profile UI (the option picked at Gate L2)

**Files:**
- Create: `src/components/ProfileControl.tsx`, `src/components/ProfilePreview.tsx`, their `.test.tsx`
- Modify: `src/hooks/useMcpSwitch.ts`, `src/hooks/useMcpSwitch.test.ts`, the card host Gate L2 names, `src/components/DesignSystemPane.tsx`, `src/data/designSystemFixtures.ts`, `.claude/DESIGN.md`

**Interfaces:**
- Consumes: Tasks 6 and 7's IPC.
- Produces: `McpSwitch` gains `loadProfile(a: { name: string; everythingElseOff: boolean; profileLabel: string }): Promise<void>`. It holds the busy keys of the preview's planned changes, invokes `load_profile`, hands each returned context to `onContext`, and shows one notice whose `receiptId` is the `load_id`. `LastSwitch` gains `{ kind: "profile"; profileLabel: string }`, and `undo()` routes that kind to `undo_profile_load({ loadId })`. The Undo's `load_id` replaces the notice's receipt, so Undo of the Undo works as for a group.

- [ ] **Step 1: Write the failing tests:**
  - `loading_a_profile_sets_one_notice_whose_undo_walks_it_back` (`useMcpSwitch.test.ts`): a mocked `load_profile` reply with three `landed` and `load_id: "profile-load:u1"`. `undo()` calls `undo_profile_load` once with `{ loadId: "profile-load:u1" }`, and never `undo_mcp_switch`.
  - `undoing_a_partial_load_takes_back_only_what_landed`: a reply with `landed` of one and a `failed`. The notice line names the failure (Gate N string), and Undo is offered for the one.
  - `the_preview_shows_the_backends_figures`: `ProfilePreview` with `change_count: 3, already_count: 1, skipped_count: 2` renders those figures and one line per skipped entry with its reason. Toggling the checkbox calls `preview_profile` again with `everythingElseOff: true`.
  - `a_load_with_nothing_landed_offers_no_undo`: `load_id: null` gives no Undo.
  - `save_shows_the_name_error_without_a_dialog`: `save_profile` rejecting with `"already_there"` shows the Gate N line inline, with a replace option, and `window.confirm` is never called.
- [ ] **Step 2: Run** `npx vitest run src/hooks/useMcpSwitch.test.ts src/components/ProfilePreview.test.tsx src/components/ProfileControl.test.tsx`. Expected: FAIL (`loadProfile is not a function`; components not found).
- [ ] **Step 3: Implement**, with a Design system specimen and a `DESIGN.md` paragraph.
- [ ] **Step 4: Run** `npx vitest run` and `bunx tsc --noEmit`. Expected: PASS, exit 0.
- [ ] **Step 5: Commit** by explicit path, with `src/App.tsx` by hunk if touched: `feat(profiles): save and load a profile from the card, with a preview and one Undo`.

### Gate V2: live check of a profile load, by artefact (stop for Karthik)

- [ ] With Karthik's go-ahead, in this branch's dev app after one scan: save a profile, change two servers by hand (one Codex, one Claude Code user-scope), load the profile with the Claude Code entry going through the real `claude` CLI, then Undo.
- [ ] Artefacts in `docs/evidence/2026-11-28-slice4/`: the profile file (`cat`, which holds names and booleans only); `claude mcp list` before, after the load, and after the Undo; `diff` of `~/.codex/config.toml` against its pre-check copy (identical after the Undo); the load record; `ls` of `<data>/switch/stash`; a screenshot of the preview and of the notice, with the theme named; how long the load took.
- [ ] **STOP.** Read every artefact before accepting "done".

### Task 9: Command receipts in Recent changes (rows after Task 3b; Undo waits on P5's Task 5)

**Files:** Modify `src-tauri/src/recent.rs`, `src/hooks/useRecentChanges.ts`, `src/components/RecentChanges.tsx`, their tests, `docs/ipc.md`.

**Interfaces:** Consumes this plan's own `apply::command_receipts` and `command_receipts_dir` (Task 3b), and P5's IPC `undo_vendor_change(receipt_id: String) -> UndoReply` (P5 Task 5, ruling R2). Rows appear as soon as P3 (Claude Code `add-json` and `remove`) or P5 (`gh skill`, `claude plugin`) record receipts.

- [ ] **Step 0:** Confirm P5's command is on `main` (`grep -n "fn undo_vendor_change" src-tauri/src/lib.rs`). If it is absent, land the listing (Steps 1 to 3 without the Undo route, rows `undoable: false`) and stop before the Undo route.
- [ ] **Step 1: Failing tests.** `recent_changes_tests.rs` → `a_command_receipt_is_listed_with_its_reverse_as_undo`: a `CommandReceipt` recorded with `record_command` (`what: "claude-code · remove · github"`, `program: Claude`, `reverse_args: ["mcp","add-json","github","-","--scope","user"]`, `reverse_stdin_stash: Some(<id>)`) lists `source: VendorCli`, `id: "cmd:<uuid>"`, `engine_id: Some("claude-code")`, `name: Some("github")`, `undoable: true`, `restorable: false`, and no element of `reverse_args` and no stash id appears in the serialised list. `a_command_receipt_with_no_reverse_is_not_undoable`: empty `reverse_args` lists `undoable: false`. `RecentChanges.test.tsx` → `a_vendor_row_undoes_through_undo_vendor_change`.
- [ ] **Step 2: Run** both. Expected: FAIL (no `VendorCli` variant).
- [ ] **Step 3: Implement**: `ChangeSource::VendorCli`, listed from `command_receipts(command_receipts_dir(data_dir))`, merged newest first. Engine and name come from `what` as for file receipts; a first segment that isn't a `host_by_id` id (`gh skill`) gives `engine_id: None`. `undoable` is `!reverse_args.is_empty()`. Undo routes to `undo_vendor_change({ receiptId })`. Restore is never offered (Q6, Q10: there is no copy to restore). `recent::undo` still accepts only `file:` ids; `cmd:` ids go to P5's command.
- [ ] **Step 4: Run** `cargo test` and `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(recent): list vendor-CLI writes with their reverse command as Undo`.

### Task 10: `Ask::ApplyProfile` (waiting on P1 and P7)

**Files:** Modify P1's `src-tauri/src/mcp_server/proposals.rs`, `approve.rs`, the tool table `TOOLS` in `mcp_server/mod.rs` and `strings.rs`, `src-tauri/src/lib.rs` (`decide_mcp_proposal`'s CLI), P1's `src/types/mcpProposals.ts` and its band (the `Profile` target), and P1's `mcp_proposal_tests.rs` (wire-shape literals).

**Interfaces** (P1's committed names, ruling R3):
- Consumes P1's `Ask`, `Proposal`, `Status::Applied { receipt_id, stopped_at }`, `Filed`, `Fresh`, `Refusal`, `ServerPlaces`, `Preview`, `PreviewTarget`, `Change::Lines`, `approve::decide`, `approve::engine_of`, `proposals::waiting`/`save` and `MAX_WAITING`; P7's `engine_status::clis::cli_for` and `resolve::resolve_in`.
- Produces:
  - `Ask::ApplyProfile { profile: String, everything_else_off: bool }`, wire `{"verb":"apply_profile","profile":"Coding","everything_else_off":false}`.
  - `pub fn propose_profile(p: &ServerPlaces, profile: &str, everything_else_off: bool, asked_by: Option<&'static str>, now_ms: i64) -> Result<Fresh<Filed>, Refusal>`. It runs `scanned(p)?` first. `profile` must equal a `profiles::list` name byte for byte, else `NotFound`. A plan with `change_count == 0` is `AlreadySo`. Then the queue check.
  - The tool `propose_profile_load(profile, everything_else_off)` in `TOOLS` (working name until P1's Gate N).
  - A preview arm: `name` = the profile's name, `to: None`, `target: PreviewTarget::Profile { profile, change_count, skipped_count }`, and `change: Change::Lines { lines }` with one line per planned switch, `"<engine name> · <server> · on|off"`, names through `public_name`, all from `profiles::preview`.
  - A decide arm calling `profiles::load`. It builds its own `ClaudeCli` from P7's `cli_for("claude-code")` and `resolve_in(cli.bin, &search_path().await)`, so a kept Claude Code server can come back on; `engine_of` answers `"claude-code"` for an `ApplyProfile` proposal, so `decide_mcp_proposal` builds the same CLI. A load where anything landed records `Status::Applied { receipt_id: load_id, stopped_at }`, with `stopped_at` the failed switch's code (`None` when nothing failed), so the model's `propose_undo` can take back what landed. A load where nothing landed and one failed records `Failed { code }`. P1's `Undo { of }` of it calls `profiles::undo_load`.
  - Restore stays out of `Ask`, per Q10.

- [ ] **Step 0:** Confirm P1 and P7 have merged (`grep -n "pub enum Ask" src-tauri/src/mcp_server/proposals.rs` and `grep -n "pub fn cli_for" src-tauri/src/engine_status/clis.rs`). If not, stop: this task waits. Tell P1 on `SendMessage` before editing its files.
- [ ] **Step 1: Failing tests** in `mcp_proposal_tests.rs`: `the_ask_wire_shape_is_pinned` extended with the literal above; `a_profile_proposal_names_an_existing_profile` (`"Nope"` is `Err(NotFound)`, with no file written); `approving_a_profile_proposal_loads_it_and_its_undo_walks_it_back` (fixture as in Task 7's first load test); `a_partial_load_is_applied_with_stopped_at` (fixture as `a_load_stops_at_the_first_failure`: status `Applied { receipt_id: Some("profile-load:…"), stopped_at: Some("write_failed") }`, then `propose_undo` files and its approval restores the Codex bytes); `a_profile_load_finds_claude_through_engine_clis` (a fake `claude` on the path brings a kept Claude Code server back on).
- [ ] **Step 2: Run** `cd src-tauri && cargo test --test mcp_proposal_tests`. Expected: FAIL (no variant `ApplyProfile`).
- [ ] **Step 3: Implement.** P1's Gate N strings carry this tool's description. Add the `Profile` arm to `src/types/mcpProposals.ts` and the band, with a Vitest case.
- [ ] **Step 4: Run** the full `cargo test` and `npx vitest run`, plus P8's `agent_tools_hold_only_what_q10_allows` if it is on `main`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(mcp-server): a model may ask to load a profile, approved in Hanger's window`.

### Task 11: Close the track

- [ ] **Step 1:** Per-kind counts after the last commit, read-only, with the Step 0 command, after both live checks' Undos. Save them to `docs/evidence/2026-11-28-slice4/counts-after.txt`. Every category must equal `counts-before.txt`. This plan claims no change to any category. Any move is a blocker to report, not reconcile; re-check whether a peer's scan moved it first.
- [ ] **Step 2:** The four pinned gates, each in its own call from the stated directory, with exit codes pasted: `npx vitest run` (root), `cd src-tauri && cargo test`, `bunx tsc --noEmit` (root), and both `gitleaks` commands (root).
- [ ] **Step 3:** Build the branch tip in isolation (`git worktree add --detach /tmp/verify-<sha> <sha>` with `node_modules` symlinked, `npx vitest run` there).
- [ ] **Step 4:** `stage-gate --dev`, with a fresh reviewer, before any push. After merge, `stage-gate --release`.

---

## Human gates, and where each sits

| Gate | What stops | Sits |
|---|---|---|
| Plan gate | `stage-gate --plan` on this file, by a fresh reviewer | Before Task 1 |
| N: naming brief | The profile noun (not "Profile"), "Recent changes", Undo/Restore and the restore warning, every rendered string, each through `/humanizer`; Karthik signs off | Batched round, after Task 4, before Tasks 5 and 8 |
| L1: Recent changes layout | Options at true width; Karthik picks | After Gate N, before Task 5 |
| L2: profile control, combined card round | This plan's part of the card round (with S, W, K, P6), after P7's card lands | Before Task 8 |
| V1: live check, Recent changes | Codex switch, Undo, restore and its Undo, by file diff, backups listing and screenshot; Claude Code key Undo after P2 merges, by `claude mcp get` | After Task 5 |
| V2: live check, profile load | Load through the real `claude` CLI and Undo, by `claude mcp list`, file diff, load record and screenshot | After Task 8 |
| T23 | Not triggered: nothing here renders model output. Task 10 files a proposal from a model and renders Hanger's own preview of it, not the model's text | — |
| `stage-gate --dev` / `--release` | Before push / after merge | Task 11 |

Tasks 1 to 4, 6 and 7 are backend-only. No screenshot is evidence for them; their tests are.

## Known limits

- **Command receipts are never swept.** Task 3b leaves retention for later (`shortcut:` comment).
- **Recent changes doesn't cover deploys** (`transactional::write_transactional`'s `.hanger/backups`) or a Claude Code server switched back on, which leaves no entry. Gate N's copy says so.
- **Each plan adds IPC commands**, so the README `ipc` total depends on merge order. Every docs step here regenerates and expects +3 over the tip, never an absolute figure.
- **A key-level write keeps a whole copy of `~/.claude.json`** for at least 30 days (Task 2's floor). It is never restored (Q9); it exists for Undo safety and `history`.
