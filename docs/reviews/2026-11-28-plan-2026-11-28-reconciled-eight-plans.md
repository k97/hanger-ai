# Plan gate (--plan), scoped re-review: the eight reconciled plans, wave 1 first

- **Artifacts gated:** `docs/plans/2026-11-28-{mcp-phase2,slice2-per-project,slice3-add-remove,slice4-recent-profiles,slice5-skills-plugins,slice6-spike-applies,t19-engine-status,phaseB-agent}-plan.md`, read from disk at `4807a23` (no commit touches `docs/plans` after it). Inputs: `docs/plans/research/2026-11-28-reconciliation-rulings.md` (binding), `docs/plans/2026-11-28-decisions-round-44.md` with its Answers, `docs/plans/research/2026-11-28-cross-plan-interfaces.md`, the eight first-round reports, design §5 and §7, and `git diff c45a702 4807a23 -- docs/plans`.
- **Pinned ref:** `4807a23`.
- **Reviewer:** independent (fresh reviewer, not the author or the reconciler).

## 1. First-round blocking questions: all answered

| Report | Blocking item | Answered by | In the plan |
|---|---|---|---|
| P1 | F1 ambiguity fixture | rulings, P1 fixes | Task 2: `"a".repeat(127) + "xy"` / `+ "yz"`, asserts equal `public_name`s first |
| P1 | F2 withheld rule | rulings, P1 fixes | Task 4: character allowlist; `the_withheld_rule_is_an_allowlist` covers digits, punctuation, non-ASCII |
| P2 | F1 Undo re-runs git check | rulings, P2 fixes | Decisions "The git check … and before every Undo of one"; `undo_at` row in the interfaces table |
| P2 | F3 `.mcp.json` lists, local scope | rulings ("My call") | Task 1 tests `a_rejected_mcp_json_server_reads_off_in_its_project`, `this_repos_local_scope_servers_are_in_its_project_context`; counts after, Step 6b |
| P2 | F4 key receipt route | R1 | `file:` ids, `apply::undo` → `undo_key`, `~/.claude.json` in `written_for` |
| P2 | F2 project `applies` | R4 | `None`, one constructor taking `applies` |
| P2 | F5 produced for P3 | R4 | "Produced for P3" lists `Target`, `KnownProject`, `RepoFileTracked`, `refused_files` (Task 5), `project` arg |
| P3 | Q6 receipt owner/shape | R2 | P4 Task 3b `CommandReceipt`; P3 Task 11 writes it |
| P3 | Q3 non-secret literals | round 44 Q8 | `literals_of`, `copy_for_carries_a_non_secret_literal_file_to_file` |
| P4 | key-level Undo shape | R1 | Task 1 `KeyEdit { key_path, member, present }`, `set_member`, `undo_key` |
| P4 | vendor receipt owner | R2 | Task 3b |
| P5 | receipt owner | R2 | consumes P4's Task 3b |
| P5 | `gh skill install` Undo | round 44 Q5 | `SkillSwitch` reverse, `["skill:<name>"]` |
| P5 | plugin update Undo | round 44 Q6 | empty `reverse_args`, confirmation says so |
| P5 | Skills figure | round 44 Q7 | Task 10 Step 3b overflow probe, Task 12 cap and `over_cap` |
| P6 | scan during a run | round 44 Q1 | Hanger quit per run; Task 1b harness |
| P6 | Claude Code modes | round 44 Q2 | default mode decides |
| P6 | `Applies` type | R4 | `Option<String>`, no new type |
| P7 | F1 `App.tsx` commits | rulings, P7 fixes | Global Constraints: exact blob, bare commit; Tasks 9, 10 |
| P7 | F2 Cellar/Caskroom first | rulings | Task 2, with the `libexec/lib/node_modules` fixture |
| P7 | F3 plant | rulings | Task 1 Step 7 plants `"cursor"` |
| P7 | Departure 2 telemetry | rulings | Task 8 commits `docs/telemetry.md` |
| P8 | F1 restate P1 names | R3 | Cross-plan interfaces, Tasks 5–6 |
| P8 | F3 `Ask::Read` | round 44 Q3 | Task 5 |
| P8 | F2 per-run cap | rulings ("My call") | `MAX_WAITING_PER_RUN = 2`, `slow_down` |
| P8 | F4 `apiKeyHelper` | round 44 Q4 | no fallback; `KeySource { Shell, None }` |
| P8 | F5 throwaway `HOME` | rulings ("My call") | Decision 9, child `HOME` = run folder |

Nothing is left unanswered.

## 2. Shared interfaces: spelled identically

Grepped across all eight plans. Every retired name in the table's first section is absent, except inside "Reconciled" notes (two `key:` hits in P4 are the `KeyReceipt.key` field, not an id format; the `apiKeyHelper` hits in P8 are the ruled-out branches). Checked owner against every consumer, character for character: `CommandReceipt { id, at_ms, what, program, reverse_args, reverse_stdin_stash }` and `ReverseProgram { Gh, Claude, SkillSwitch }` (P4, P3, P5); `record_command`/`load_command`/`command_receipts_dir`; `undo_vendor_change(receipt_id: String) -> UndoReply` (P5, P4); `claude_add`/`claude_remove`/`claude_reverse` (P3, P5); `KeyEdit`, `set_member`, `set_member_with`, `undo_key`, `member_text` (P4, P2); `Target<'a>`, `KnownProject::among`, `refused_files`, `RepoFileTracked` (P2, P3); `Preview { …, to: Option<ItemState>, target, change }`, `PreviewTarget`, `Change`, `Status::Applied { receipt_id, stopped_at }` (P1, P3, P4, P8); the filing-function shape `(p, …, asked_by, now_ms) -> Result<Fresh<Filed>, Refusal>` (P1, P3, P4, P8); `propose_server_switch`/`propose_skill_switch` (P1, P8); `cli_for`, `parse_auth`/`AuthState` (P7, P4, P5, P8). All match.

Every "on `main`" claim was checked against `HEAD`: `ops.rs:319,334,389,421,460`, `skill_switch/ops.rs:662,685,704,737`, `apply.rs:135,200,297,340`, `tools.rs:100,110,122` (private today, as stated), `run.rs:45`, `resolve.rs:45,126`, `context.rs:166`, `vendor.rs:400`. All true.

Non-blocking inaccuracies in the table itself (consumer lists, not spellings):
- `ops::context_in` lists P3 and P7 as consumers; neither plan names it.
- `get_engine_status` lists P6 and P8; neither names it (P8 consumes `cli_for`, `parse_version`, `parse_auth` directly).
- P7 line 64 says `get_engine_contexts` is "unchanged"; P2 Task 2 makes it `async` with a `project` argument. Source-compatible for P7's caller, but the sentence goes false when P2 merges.

## 3. The six provisional calls

| Call | Sound? | Needs Karthik? |
|---|---|---|
| P6 Task 1b, hand-run `#[ignore]` harness against the real home | Yes. Same code path as the app, backups and stash under `$SPIKE_DIR`, each run behind his per-run go-ahead, and it follows from Q1. Two gaps: step 2 checks the app process but not a running `bun run tauri dev`, and `cargo test` relaunches the dev app (`verifying-ui.md`), which would scan while `spike` is registered, the exact leftover Q1 exists to prevent. Add `pgrep -f "tauri dev"` to step 2 and build the harness with `--no-run` before step 3. | No |
| P1 `Preview.to: Option<ItemState>`, `Status::Applied.stopped_at` | Yes. Extend-only, `stopped_at` skipped when `None`, so P1's wire is unchanged; pinned by the wire-shape test. | No |
| P1 `Status::Undone`, `undo_approved`, `undo_mcp_proposal` | Yes. It is the smallest way to make the ruling true ("after the in-app Undo, the proposal reads as undone"). The new state word is already in Gate N. Limit worth stating: an Undo from the inspector or from P4's Recent changes leaves the proposal `Applied`. A later `propose_undo` is still safe, because approval re-runs `apply::undo`'s checks. Also, P3 Task 18 and P4 Task 10 don't name their arm in `undo_approved` (P4 names only the `Undo { of }` route). Both are in wave 3. | No |
| P4 `reverse_stdin_stash`, run by P3's `claude_reverse` | Yes. It mirrors `main`'s own `add-json <name> - --scope user` with the entry on stdin (`vendor.rs:541-544`), and the entry stays in the stash, one of the anti-goal's named places. `removed/` sits below the top level that `claude_stashed` reads, so it is never listed as kept off. | No |
| P5 `CONTEXT_WINDOW_TOKENS`, one constant for the 1% cap | Doubtful. Claude Code models run at different context windows, so one constant taken from this machine's probe makes the card's "descriptions are being dropped" note false on any machine whose model has another window. That breaks `ui-copy.md` ("copy must be literally true") and the any-machine rule. Q7's answer was "what Claude actually loads". | **Yes**, before P5 Task 12 (not before wave 1). Options: read the model and map its window; word the note as "at a 200k window"; or show the uncapped sum with `over_cap` only. |
| P8 real home in the mcp-config `env` on Claude's argv | Acceptable. A home path is not a secret, and the plan lists it under Known limits. A cheaper option removes the exposure: write the mcp-config to a 0600 file in the run folder and pass `--mcp-config <path>`. | No (P8 is wave 2) |

## 4. Wave 1: first tasks

| Track | First task | Depends on | Verdict |
|---|---|---|---|
| Q, P1 | Task 1, the proposal record | `main` only (code) | **Blocked by its own gate table.** Gate N sits "before Task 1", and Gate N is "P1's part of the batched round". Task 1 lands no strings: the table's own parenthetical says Task 2 is the first that does. |
| W, P2 | Task 1, project context | `main`, plus Karthik's live `/mcp disable` check (own Step 1) | Buildable. Task 4 waits on P4 Task 1, also wave 1. |
| S, P7 | Task 1, `ENGINE_CLIS` | `main` | Buildable. Its commit leaves out the README regeneration (see findings). |
| K, P5a | Task 1, `install_slot` | `main` | Buildable |
| K, P5b | Task 10, H1 (a human gate), then Task 11 (pure) | `main` | Buildable |
| R, P4a | Task 1, key-level `apply` | `main` | Buildable |
| R, P4b | Task 6, profile files | `main` (`ops::contexts_for` as is) | Buildable. Design §7 still places 4b in wave 3, "after P3's `ops` change". Round 44 Q9 puts it in wave 1, and 4b writes nothing into `ops`, so Q9 stands. §7's table is stale. |
| F, P3 Part A | Task 1, `NewServer` | `main` | Buildable. Tasks 1–7 stay inside P3 or `main`. Task 3's one line in P2's `edit.rs` is a merge, not a wait. |

Step table, by plan (wave 1 scope):

| Step | Traceable to request? | Verifiable? | Notes |
|---|---|---|---|
| P1 T1–T5 | Yes (§4.1, Q10) | Yes, red-first per task | Gate N placement, above |
| P2 T1–T3 | Yes (§4.2) | Yes; T1 has a live check | |
| P3 T1–T7 | Yes (§4.3, Q3–Q5) | Yes | T4 uses `url::Url`, but `url` is only a transitive dependency (in `Cargo.lock` 2.5.9, not in `Cargo.toml`). Use `reqwest::Url` or add `url = "2"` |
| P4 T1–T4, T6–T7 | Yes (§4.4, Q8, Q9) | Yes | |
| P5 T1–T5, T10–T12 | Yes (§4.5, Q6, Q7) | Yes | T2 adds `gh_skill_tests.rs` with no README regeneration or readme-sync run; T12 constant, above |
| P7 T1–T2, T5–T8 | Yes (T19) | Yes | T1 adds `engine_cli_tests.rs` and T7 `engine_latest_tests.rs`. Neither regenerates the README `tests` region, so readme-sync's "every committed block matches a fresh generation" goes red at T1 Step 9 |

## Findings

Non-blocking (mechanical; fix in place):
1. P7 Tasks 1 and 7, and P5 Task 2, add a Rust integration test file without regenerating the README `tests` region. P2, P3 and P4 each have that step.
2. P3 Task 4: `url::Url` is not a direct dependency.
3. P6 Task 1b: guard against `tauri dev` relaunching during a run, and pre-build the harness.
4. Wave-1 tracks all append to `lib.rs`, `docs/ipc.md` and the README regions in separate worktrees. "The next free number at commit time" collides across worktrees. Say "renumber and regenerate on rebase" in the merge step.
5. Dead conditionals: P8 still carries "only if round 44 Q4 keeps the fallback" branches, and P5's headings still say "Waits on round 44 Q5/Q6". Every answer took the recommended option, so they can go.
6. The interfaces table's consumer lists (section 2).

## Verdict

**Needs answers.** Blocking:

1. P1 Task 1 can't start: its Gate N sits "before Task 1" as "P1's part of the batched round", and no plan says who opens that round's file, at what path, or whether it runs before wave 1 (design §7, P1) or as each track reaches its naming task (P2, P3, P5, P6, P7 "join it if open"). The orchestrator can answer this without Karthik. Move P1's Gate N to before Task 2, and name the round's file and owner. Every other wave-1 first task is buildable now.

Needs Karthik, though it does not block wave 1: P5's single `CONTEXT_WINDOW_TOKENS` constant, before P5 Task 12.
