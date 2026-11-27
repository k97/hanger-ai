# --plan review: slice 2, per-project overrides (P2)

- **Artifact:** `docs/plans/2026-11-28-slice2-per-project-plan.md`, as committed in `8042433` (unchanged since; tree at `cf4c2f1` when reviewed)
- **Spec:** `docs/plans/2026-11-28-harness-design.md` §4.2, §5, §7, and "Answers (Karthik, 2026-11-28, round 43)" (binding): Q1, Q2, Q5
- **Also read:** `docs/plans/research/2026-11-28-slice2-per-project-overrides.md`, `docs/plans/research/2026-11-28-plan-brief.md`; siblings P1 `2026-11-28-mcp-phase2-plan.md`, P3 `2026-11-28-slice3-add-remove-plan.md`, P6 `2026-11-28-slice6-spike-applies-plan.md`, and P4 `2026-11-28-slice4-recent-profiles-plan.md` (committed `70ed205` after the dispatch called it unwritten; its names are treated as provisional)
- **Reviewer:** independent (fresh reviewer, read-only on the plan)

## Per-step table

| Step | Traceable to request? | Verifiable? | Notes |
|---|---|---|---|
| T1 Read Claude's per-project lists; project context; `KnownProject`; empty `PROJECT_SWITCHES` | Yes: §4.2 "reading them is a correctness fix", §5 `context` | Yes: seven named tests, compile-error red, `cargo test` | Reads `disabledMcpServers` for user scope only; see F3 |
| T1 S1 Live check of `/mcp disable` | Yes: §7 "before any build" | Yes: `jq` + `mcp list` artefact | Checks a user-scope server only |
| T2 `ops::Target`, `set_enabled_at`, `undo_at`, `project` on four commands | Yes: §5 `ops` owner row | Mostly. `the_machine_entry_points_are_the_machine_target` isn't runnable as worded (F7) | Undo path lacks Q2's git check (F1) |
| T3 Three pure editors in `edit/` | Yes: §5 `edit` (flags) | Yes: byte-level assertions | — |
| T4 Claude switch, key-level receipt (waits on P4) | Yes: Q1, Q5 | Yes, but the race and Undo-routing tests depend on P4's shape (F4) | Live check verified by `jq` artefact |
| T5 Codex stub fix, trust, git check, switch | Yes: §4.2, Q2, Q5 | Yes: `left: 2, right: 1` and named tests | `refused_files` is what P3 needs (F5) |
| T6 Gemini switch | Yes: §4.2, Q5 | Yes | Untrusted-folder state contradicts research (F6) |
| T7 Naming brief, `/humanizer`, sign-off | Yes: `ui-copy.md`, §7 batched round | Yes: ruled strings recorded verbatim | — |
| T8 Webview types, copy, `project` in `useMcpSwitch` | Yes | Yes: named vitest files, exhaustive `Record` fails `tsc` | — |
| T9 "Off in this repo" on the repo view (waits on layout round) | Yes: §4.2 "the picker is the repository view" | Yes: vitest plus a screenshot gate | Measure path not covered (F9) |
| T10 Close: counts, string sweep, `--dev` gate over own SHAs | Yes: `shared-asset-machinery.md`, `ui-copy.md` | Yes | — |

## Spot-checks against `main` (all hold unless noted)

- `ReadOnlyReason` has seven variants with `FileUnparseable` last; `standing_reason` gives `PerProjectComesNext` for a host with a `SWITCHES` row at another tier. `grep disabledMcp src-tauri/src` is empty.
- `SWITCHES` has four rows (codex `EnabledKey` Global+Project, claude-code `ClaudeCli` User, gemini `GeminiEnablementFile` Global, antigravity `DisabledKey` Global). `switch_rows_are_unique_per_host_and_tier`, `read_only_with_its_reason_per_project_comes_next`, `states_and_reasons_are_spelled_in_snake_case`, `no_engine_says_when_a_change_applies_yet` and the "Nothing rides along" key lists all exist in `mcp_switch_tests.rs`.
- `ops`: `SwitchPlaces { home, system, backups, stash }`, `Seams { before_write }`, `set_enabled_for`/`set_enabled_with`/`undo_for` as cited; `written_for` documents "`.claude.json` is never one of them". `context_for`/`contexts_for` are **sync** `pub fn` today, and `get_engine_context`/`get_engine_contexts` are sync commands. The plan's `context_in` is async, so those two commands become async. That's fine, but the plan doesn't say so.
- `context::engine_context(host_id, discovered, stashed, gemini_state, read_file, probe_of)` matches the cited bounds. `applies: None` is built in one place.
- `dialect::servers_from_toml_table` pushes every table, `command` defaulting to `""`, which confirms the phantom-stub finding. `parse_swept`, `read_one_for_test` and `strip_jsonc` exist.
- `edit.rs` private `parse_json`/`parse_toml`/`toml_text` exist; `EditError::NotFound` exists; `toml_edit = "0.25"` and `jsonc-parser 0.34` with `cst` are present. `apply::safe_replace(path, expected_before: Option<&str>, …)` refuses a missing folder (module doc), `Format::{Jsonc, StrictJson, Toml}`, `KEPT_PER_FILE = 20`.
- `engine_status::resolve::{search_path (async), resolve_in}` and `run::run_capture(program, args, stdin, envs, timeout)` match.
- `preferences::get_linked_directories` returns `roots.abs_path WHERE kind='project'`. `RepoPane.tsx` passes `engines={[]}`. README tests region reads 53 Rust integration files (`ls src-tauri/tests/*.rs | wc -l` = 53). `docs/ipc.md` §15/16/17/20 are the four commands. `engineContext.ts` still says "No component uses these yet".
- SOURCES: antigravity Global is `.gemini/config/mcp_config.json`, cursor Global is `.cursor/mcp.json`, so Task 1's fixtures land where the plan says.

## Findings

### Blocking

**F1. Undo of a project file skips Q2's git check.** Q2 is binding: "Repository files are written only when git does not track them." The plan applies the check to switches through the context's `read_only`. But `undo_at` only widens `written_for` with the project's files. An Undo is a write: if the user commits Hanger's `.codex/config.toml` stub after the switch, `apply::undo`'s hash check still matches, and Undo deletes a tracked file. The same goes for switching back "on" through a path that bypasses the context, if any does. `undo_at` must re-run `refused_files` on the receipt's path and refuse (`ReadOnly`, or `NotUndoable` with the reason). That needs a test (`a_project_undo_of_a_file_git_now_tracks_is_refused`).

**F2. The shared constructor would put an unobserved `applies` on project contexts.** The plan promises P6 that `engine_context` and `engine_context_in` "build their `EngineContext` through one private constructor". P6 Task 8 will then set `applies: applies_for(host_id)` there. P6 runs only the four machine `SWITCHES` mechanisms (P6 "Which engines run"). The per-project mechanisms (Claude's `disabledMcpServers` list, the Codex stub, Gemini `mcp.excluded`) are different writes and nobody times them. A project context would then carry a timing that no run observed for that write, which breaks ruling 19 ("no line until observed") and `ui-copy.md` ("literally true"). The plan should state that a project context's `applies` is `None` until a per-project run observes it (the constructor takes `applies` as a parameter), and tell P6.

**F3. Which Claude per-project state is read is a silent choice.** §4.2 says "Hanger doesn't read Claude's per-project lists" (plural). The research measured a second list, `disabledMcpjsonServers` (with `enabledMcpjsonServers`), for `.mcp.json` servers, which `get` printed as "Rejected". The plan reads only `disabledMcpServers`, and only for the `User` tier:
- A repo's own `.mcp.json` / `.claude/settings.json` server shows `On` with `PerProjectComesNext` in the project context even when Claude has rejected or never approved it. That is the same "switched off with `/mcp` shows as on" defect §4.2 calls a correctness fix.
- This repo's own local-scope servers (`projects[<real>].mcpServers`, `ScopeTier::Local`) are left out of the project context ("local scope excluded, as today"). The repo view's `on_count`/`on_tokens_measured` then undercount what Claude loads in exactly this repo.
The plan should name both readings and say which it takes. If either is deferred, it needs a known-limits line in `context.rs` and copy that doesn't claim otherwise.

**F4 (provisional, P4). Key-level Undo routing conflicts with the committed P4.** The spelling differences are not blocking (P2's `safe_replace_keyed`/`undo_keyed`/`KeyEdit{pointer,item,added}` against P4's `set_member`/`undo_key`/`KeyEdit{key_path,member,present}`). The routing is a semantic conflict:
- P2 issues `key:` ids, makes `apply::undo` refuse key receipts, and pins `undo_at(None, key-id)` as `NotUndoable` (`a_claude_key_receipt_is_not_a_whole_file_undo`).
- P4 issues `file:` ids, has `apply::undo` dispatch to `undo_key`, and expects P2 to add `~/.claude.json` to `written_for` for `claude-code`, so that a machine `undo_for` (no project) reaches it. P4's Recent changes depends on that route.
Pick one route. Recent changes has no project in hand, so if Undo needs `project`, P4's route breaks. P4's `set_member` also reads the file itself and takes no `before`. So P2's `a_claude_write_raced_by_claude_writes_nothing` must thread `Seams.before_write` into `set_member_with`; the ops-level hook fires before apply's read and would not race anything. And `only_the_list_differs(before, after, …)` has no `after` to compare.

**F5. The interfaces P3 assumes aren't named as produced.** P3 assumes `ops::git_tracks(path: &Path) -> bool`, a tracked-file `ReadOnlyReason`, and `repo_key: String` (P3's interfaces table and Task 17). P2 produces `project::refused_files(real: &Path, files: &[PathBuf]) -> Vec<PathBuf>` (async, in `project`, fail-closed on "couldn't check"), `RepoFileTracked`, and `project: Option<String>` resolved by `KnownProject::among` over `get_linked_directories` (not "the project pass"). P3 accepts renames. But P2's "Cross-plan interfaces" lists only `Target` for P3, and doesn't say that `refused_files` lands in Task 5, which runs only after Claude's live check is accepted. P3 Task 17's wait is therefore behind a human gate. Add these three to "Produced for P3", with module, async-ness, the fail-closed meaning, and the task that lands each.

### Non-blocking (fix in the plan or before the named task)

- **F6. Gemini in an untrusted folder.** The research (§3, "run") says Gemini shows *every* server "Disabled" in an untrusted folder, user-level ones included. The plan gives such items `NeedsTrust` with the machine's state, so they read `On`. Settle it in Task 6's live check and make the fold match. Also note that trust enforcement depends on Gemini's own folder-trust setting being on.
- **F7. A criterion that can't run as worded.** `the_machine_entry_points_are_the_machine_target` compares `set_enabled_for` and `set_enabled_at` "for every case in the fixture". Both write, so the second call sees the first's result, and receipt ids are UUIDs. Specify a fresh fixture per call and compare everything except the id.
- **F8. Codex machine-off plus a user-written project `enabled = true`.** The fold says the project value wins, so the state is `On`, while the reason order puts `OffEverywhere` first. That gives an `On` item reading "off everywhere". Define the order for this case.
- **F9. Measure in the repo view.** `measure_engine_context` takes no project and returns a machine context. If the repo view's card can measure, its reply overwrites project state. Say whether Task 9 refetches the project context after a measure, or keeps measure off the repo view.
- **F10. Ancestors under a different spelling.** `discover_repo_ancestors(real, home)` returns nothing unless `real.starts_with(home)`. With a canonical repo path and a non-canonical home (the Task 1 fixture's tempdir home; a symlinked `~/Work` outside home), ancestor `.mcp.json` servers silently drop, and no test notices. Pass a canonical home, or test an ancestor.
- **F11. Receipt `what` for project writes.** P4 pins `"<engine_id> · <name> · on|off"` with extra segments allowed. State that project writes keep that prefix (and whether the project is a segment).
- **F12 (P4/Karthik).** A key-level write still copies the whole `~/.claude.json` into backups (P4: "same path as `safe_replace` (backup…)"), up to 20 copies. That file holds user-scope servers' `env` values and account data. Q9 says it "can be undone by key but not restored from an old copy", so the copies serve no restore. Worth one line in the plan, or a question to P4: keep the copies, or skip them for a key-level write?
- **F13. Ambiguous wording.** In `codex_project_declared_items_switch_in_their_project`, "through the existing `EnabledKey` path" conflicts with Task 2's dispatch on `project_switch_for` (`CodexProjectFile`). Name the arm.
- **F14.** P3 says P2 adds "its Claude per-project reads" in `dialect.rs`. P2 actually reads them in `context.rs`, and touches `dialect.rs` only in Task 5. No conflict, but P3's merge-order reason is stale.

### Checked and fine

- Q1 is honoured: one key, Undo by key, owned by 4a, and the plan waits on it (Task 4 Step 0).
- Q2 is honoured for writes; Undo is the exception (F1). Q5 is stricter than asked (Codex waits on Claude, Gemini on Codex). The trust rule (never written) is kept.
- P1's assumptions (`context_for`, `set_enabled_for`, `undo_for`, `cached_measure`, `cached_measure_on`, `uses_claude_cli`, `switch_for`, `dialect_of`) are all on `main` and untouched. The new reasons appear only in project contexts, which P1's previews never build.
- P6's `applies: Option<String>` field and wire shape are preserved (but see F2).
- The `PROJECT_SWITCHES` sibling table is justified by `switch_rows_are_unique_per_host_and_tier`. No guard counts `SWITCHES` rows (grep of `src/__tests__` is empty), so no floor moves.
- The human gates are explicit tasks, each verified by an artefact.

## Verdict

**Needs answers**

1. F1: does Undo of a project-file receipt re-run the git check and refuse once git tracks the file (Q2)?
2. F3: does the project context read Claude's `.mcp.json` approval lists and this repo's local-scope servers, or are both named as known limits?
3. F4: does a Claude key receipt undo through `file:` plus `written_for` (P4's route, which Recent changes needs), or through `key:` with a `project` (P2's)? Reconcile with P4 before Task 4.
4. F2: is a project context's `applies` `None` until a per-project run observes it, with the constructor taking `applies` as a parameter?
5. F5: add `refused_files`, `RepoFileTracked` and the `project` argument to "Produced for P3", with the task (5) that lands each.
