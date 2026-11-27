# stage-gate --plan: slice 4, Recent changes (4a) and profiles (4b)

- **Artifact:** `docs/plans/2026-11-28-slice4-recent-profiles-plan.md`, as committed in `70ed205` (unchanged at `77399cf`, the tip when this was written; nothing under `docs/plans/` or `src-tauri/` moved between them)
- **Spec:** `docs/plans/2026-11-28-harness-design.md`, with the round 43 Answers binding (Q1, Q6, Q8, Q9 and Q10 in particular)
- **Also read:** `docs/plans/research/2026-11-28-slice4-profiles-backup.md`, `docs/plans/research/2026-11-28-plan-brief.md`, and the seven sibling plans' cross-plan sections (`docs/plans/2026-11-28-{mcp-phase2,slice2-per-project,slice3-add-remove,slice5-skills-plugins,slice6-spike-applies,t19-engine-status,phaseB-agent}-plan.md`)
- **Reviewer:** independent (a fresh reviewer dispatched for this gate; not the plan's author)

## Code claims spot-checked against `main`

Held:

- `apply.rs`: `Receipt { id, path, backup_file, before_sha256, after_sha256, at_ms, what }`; `ApplyError { ChangedSinceRead, Backup, Write, Verify, NotUndoable }` (five variants; the plan adds none); `Seams { at_ms, verify }`; `KEPT_PER_FILE = 20` (private const); private `keep`, `listed`, `evict`, `write_atomic`, `note`; consts `UNREADABLE`, `DOES_NOT_PARSE`, `NO_SUCH_RECEIPT`, `MOVED_ON`, `BACKUP_GONE`, `BACKUP_ALTERED`. `undo` picks `Format::Toml` by extension and `Jsonc` otherwise, as Task 3 says `restore_backup` will copy.
- `evict` counts only receipts that kept a backup (`held += usize::from(receipt.backup_file.is_some())`). The plan's 30-day rule is stated against "its file's newest `KEPT_PER_FILE`" without saying whether a created-file receipt counts; Task 2's fixtures only exercise receipts with backups, so either reading passes. Minor.
- `jsonc-parser = { version = "0.34", features = ["cst"] }`; `CstObject::object_value`, `array_value`, `append`, and `remove` on each node exist in 0.34.0. `uuid` 1 with `v4` is a dependency.
- `ops`: `contexts_for(&SwitchPlaces, probe_of)`, `set_enabled_for(places, cli, engine_id, key, enabled, probe_of)`, `undo_for(places, cli, engine_id, receipt_id, probe_of)`, `kept_off_for`, `cached_measure`, `SwitchFailure::code()`, `impl From<ApplyError> for SwitchFailure` (`Write`/`Backup` → `write_failed`, which Task 7's partial-load test expects). The `what` an `ops` switch writes is `format!("{engine_id} · {name} · {on|off}")`, as the plan's cross-plan table says.
- `ContextItem { key, name, tier, config_path, state, read_only, … }`; `ReadOnlyReason::EngineNotConfirmed` exists; `SWITCHES` order is codex, claude-code, gemini, antigravity, with no OpenCode row, so Task 7's `omega` skip reason holds.
- `KeptOffServer` carries `key: "stash:<id>"`, `engine_id`, `engine_name`, `at_ms`, so Recent changes can sort kept servers by time. `KeptSkill { key: "kept-skill:<uuid>", name, at_ms, links_count, interrupted, back_in_store }`, and `undo_skill_switch` takes `"kept:<uuid>"`.
- `discover::engine_display_name` is `pub(crate)`; `registry::host_by_id`, `preferences::sanitise_path`; `lib.rs` has `switch_places`, `skill_places`, `claude_cli_for`, `undo_mcp_switch`, `undo_skill_switch`.
- README `ipc` region reads 52 commands, so 55, 58 and 61 after Tasks 4, 6 and 7 are right on today's tree. `docs/ipc.md` ends at §24, so §25 is next.
- `ipc_boundary_tests.rs` has `SwitchBench::fake_claude` and `SWITCH_MARKERS`; `mcp_switch_tests.rs` has `bench`, `names_in`, `sha`, `replace`, `the_twenty_first_backup_evicts_the_oldest` and `eviction_removes_the_receipt_with_its_backup_and_leaves_other_files_alone`. Both eviction tests write through `replace` at today's clock, so Task 2's forced edit is real and correctly ordered.
- Antigravity's source is `.gemini/config/mcp_config.json`, so in Task 7's `a_load_stops_at_the_first_failure` a `0o500` `.gemini` blocks Gemini's state file and not Antigravity's. The test holds because the load stops before Antigravity.

Not quite:

- `src-tauri/src/mcp/switch/mod.rs`'s doc line reads "are called only by the fifth, `ops`, and `ops` only by five commands in …", not "the first four are called only by `ops`". The plan's edit is to the right line, but its second half (`ops` called only by five commands) also goes stale once `profiles` calls `ops`. Task 4/7 should correct both halves.

## Per-step table

| Step | Traceable to request? | Verifiable? | Notes |
|---|---|---|---|
| T1 key-level write and Undo in `apply` | Yes: Q1, design §5 (4a owns `apply`) | Yes: eight named tests, exact compile failure | **Interface contradicts P2's** (Finding 1) |
| T2 retention 20 + 30-day floor | Yes: Q9 | Yes: forced test edit committed alone first, two new tests, exact red | Sound |
| T3 `restore_backup`, `history` | Yes: Q9, §4.4 | Yes: five tests, exact red | Refusal set matches Q9 (key receipts refused) |
| T4 Recent changes backend and IPC | Yes: §4.4, Q9 | Yes: seven tests; pins `ops`' `what` format | Kept-skill/kept-server routes correct against `main`. Omits P3's Claude add/remove records (Finding 2) |
| Gate N naming brief | Yes: §7, `ui-copy.md` | Yes: Karthik's written sign-off | Sound |
| Gate L1 layout | Yes: §7 | Yes: Karthik's pick recorded in the plan | Sound |
| T5 Recent changes UI | Yes | Yes: five Vitest cases, exact red | Host component left to L1, as it should be |
| Gate V1 live check | Yes: §7 | Yes: by artefact (`ls`, `diff`, screenshot, bridge read, `claude mcp get`) | Sound |
| T6 profile files | Yes: Q8, §4.4 | Yes: four tests, modes and markers asserted | Sound |
| T7 preview, load, Undo of load | Yes: Q8 | Yes: six tests with exact values | "by `(engine_id, name, enabled)`" in the first test contradicts the stated `SWITCHES`-index order; the expected list follows the index order, so only the phrase is wrong |
| Gate L2 card round | Yes: §5, §7 | Yes: Karthik's pick | Waits on P7 |
| T8 profile UI | Yes | Yes: five Vitest cases | Sound |
| Gate V2 live check | Yes | Yes: by artefact | Sound |
| T9 vendor-CLI rows | Yes: Q6 | Yes, once a shape exists | **No plan owns the shape** (Finding 2) |
| T10 `Ask::ApplyProfile` | Yes: Q10, §5 | Yes: three tests | Two gaps against P1's `decide` (Finding 3) |
| T11 close | Yes | Yes: counts, four gates, isolated build, `--dev` | Sound |

## Findings

### 1. The key-level Undo this plan produces is not the one P2 consumes (blocking)

P2 (`2026-11-28-slice2-per-project-plan.md` → Cross-plan interfaces, Task 4) assumes:

- `KeyEdit { pointer: Vec<String>, item: String, added: bool }`. This plan lands `KeyEdit { key_path, member, present }`. Field names differ. `added: true` for off maps to `present: true`, so the meaning agrees.
- `safe_replace_keyed(path, before, after, &KeyEdit, format, backups, what) -> Result<Receipt, ApplyError>`. The caller computes the new text with its own editor (`set_disabled`) and checks `only_the_list_differs`. This plan lands `set_member(path, &KeyEdit, backups, what) -> Result<Option<KeyReceipt>, ApplyError>`, which reads the file itself and computes the text with its own `member_text`. So the same edit would have two editors, P2's `edit/claude_project` and `apply::member_text`, and only one can be the one that writes.
- `undo_keyed(receipt_id, backups, reverse: &dyn Fn(&str, &KeyEdit) -> Option<String>)`. This plan lands `undo_key(receipt_id, backups)` with no callback.
- **The behaviour conflicts as well as the names.** P2 says "`apply::undo` and P4's `restore_backup` refuse a key-level receipt", and its test `a_claude_key_receipt_is_not_a_whole_file_undo` expects `NotUndoable` for a whole-file Undo of a `key:` id. This plan makes `apply::undo` *route* a key receipt to `undo_key`. Its cross-plan table also says P2 "adds `~/.claude.json` to `ops::written_for` … so `undo_for`'s `file:` route reaches `apply::undo`". P2 instead issues receipt ids `key:<id>` and undoes through `undo_at(Some(&project), …)`. Recent changes (Task 4) lists Key rows as `file:<uuid>`, which disagrees with P2's `key:` prefix.
- The race seam differs too. P2 relies on `expected_before` through `safe_replace_keyed`'s `before`, and this plan relies on `set_member_with`'s `before_write`. Both work, but only one should exist.

P2 says "If P4 lands other names, Task 4 uses them". That covers names, not the routing contradiction or the duplicate editor. One shape has to be ruled on before Task 1 lands.

### 2. Nobody owns the vendor-CLI receipt, and Q6 is binding (blocking)

- This plan (Cross-plan interfaces, Task 9) assumes a `VendorReceipt` owned by "P3 or P5, whichever lands first".
- P5 (`2026-11-28-slice5-skills-plugins-plan.md` → Cross-plan interfaces) assumes **P4** owns `CommandReceipt { id, at_ms, what, program: ReverseProgram, reverse_args }`, `apply::record_command`, `apply::load_command` and `apply::command_receipts_dir`, and its Task 4 "Waits on P4's `CommandReceipt` landing". This plan's Task 9 waits on P5. That is a deadlock: each plan waits on the other to define the type.
- P3 (`2026-11-28-slice3-add-remove-plan.md` → `vendor.rs`) lands a third shape, `ClaudeChange { id, name, action, at_ms }` with `claude_changes(stash)`, ids `added:<uuid>`/`removed:<uuid>` and its own `claude_undo_change`. It says "4a's Recent changes reads `vendor::claude_changes`", and this plan never mentions it. So Claude Code adds and removes, which are vendor-CLI writes under Q6, would be missing from Recent changes.

Q6 says "A vendor-CLI write records a receipt holding the reverse command, shows in Recent changes, and Undo runs that command". As written, no plan builds the receipt type, and one producer's records are never read.

### 3. Task 10 against P1's `decide` (non-blocking; Task 10 waits on P1 anyway)

- P1's `decide_mcp_proposal` builds the CLI as `claude_cli_for(engine_of(..).unwrap_or_default())`. On `main`, `claude_cli_for` returns `program: None` for any engine id that `uses_claude_cli` rejects, `""` included. An `ApplyProfile` proposal has no single engine, so a model-approved load that turns a kept Claude Code server back on fails with `cli_not_found`. Task 10 must make `engine_of` answer `"claude-code"` for a profile, or resolve the CLI itself, as this plan's Task 7 does for loads from the UI.
- P1's `decide` saves `Applied { receipt_id }` on `Ok` and `Failed { code }` on `Err`. A partial load is `Ok(ProfileLoad { failed: Some(_), load_id: Some(_) })` here. The plan doesn't say which status it records. If `Failed`, P1's `propose_undo` (which needs `Applied { receipt_id: Some(_) }`) refuses, and the model cannot undo the switches that did land. Decide it in Task 10.
- P1's `Preview` has required fields `name`, `to: ItemState` and `change: Change` beside `target`. The plan adds only a `PreviewTarget::Profile` arm and doesn't say what fills the other three for a profile.

### 4. A key write copies `~/.claude.json` whole into the backups folder (non-blocking, worth a line)

Task 1 says `set_member` "writes through the same path as `safe_replace` (backup, receipt, …)". So every per-project switch keeps a full copy of `~/.claude.json`, a large file that holds every project's MCP entries and their env values. Under Task 2's floor the copies stay at least 30 days. Q9 already rules that this file is never restored from a copy, so the copies serve nothing but `history`'s `restorable: false`. Keeping them is consistent with how Codex files are kept today, so nothing here breaks a rule. But the plan should say on purpose whether a key receipt keeps a copy. If it keeps none, it has to say how `backup_file: None` is told apart from "the write created the file", which `undo` currently treats as "remove the file".

### 5. Smaller

- `docs/ipc.md` §25 onward and the README's command total are also claimed by P5 ("Entries 25 to 35") and by P1, P2 and P3. Whichever merges second renumbers. The plan's fixed "55/58/61 commands" expectations hold only if this track merges first. Say "regenerate, and expect +3 over the tip".
- Task 7's first test says the changes sort "by `(engine_id, name, enabled)`". The list it expects follows the `SWITCHES`-index order (codex before gemini before antigravity), not alphabetical. Fix the phrase.
- Interpretation of Q8's "global tier": the plan reads it as "every non-project tier", which takes in Claude Code's switchable `User` tier. That's the right reading, and the plan states it in Task 6's `save` decision. No action.

## Verdict

**Needs answers**

1. Key-level Undo: which shape wins, this plan's `KeyEdit { key_path, member, present }` + `set_member` / `undo_key` with `apply::undo` routing key receipts and `file:` ids, or P2's `KeyEdit { pointer, item, added }` + `safe_replace_keyed` / `undo_keyed(reverse)` with `apply::undo` refusing them and `key:` ids? And whose editor writes the list, `apply::member_text` or P2's `set_disabled`?
2. Vendor-CLI receipts (Q6): who owns the type, P4 in `apply` (as P5 assumes) or P3/P5 (as this plan assumes)? Which shape (`CommandReceipt` or `VendorReceipt`)? And does Recent changes also read P3's `ClaudeChange` records, or do they move onto that one type?
