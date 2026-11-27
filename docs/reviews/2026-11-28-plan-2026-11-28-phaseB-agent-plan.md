# `stage-gate --plan`: Phase B, the in-app agent

- **Artifact:** `docs/plans/2026-11-28-phaseB-agent-plan.md`, last changed in `310017f`; read from the working tree with `main` at `361b459` (the only commit since, `fix(window)`, doesn't touch the plan or any file it cites).
- **Spec:** `docs/plans/2026-11-28-harness-design.md`, whose "Answers (round 43)" are binding, Q10 and Q11 above all. Also read: `docs/plans/research/2026-11-28-phaseB-in-app-agent.md`, `docs/plans/2026-11-27-harness-model-layer-research.md` (its §5 rules and its rulings), `docs/plans/research/2026-11-28-plan-brief.md`, `docs/plans/2026-11-28-decisions-round-43.md` (Q10's wording) and P1's committed `docs/plans/2026-11-28-mcp-phase2-plan.md`.
- **Reviewer:** independent. A fresh reviewer, not the plan's author.

## Per-step table

| Step | Traceable to request? | Verifiable? | Notes |
|---|---|---|---|
| T1 Spike A, Claude `--bare` | Yes (§4.8, §7 "phase B's two throwaway-`HOME` spikes") | Partly | Step 4(c) can't prove what it claims to (F7). There's no decision rule for files Claude writes under the real `HOME` (F5). |
| T2 Spike B, Codex strip | Yes (§4.8, rule 3) | Yes | It ends in a one-line verdict with the evidence above it. |
| T3 Naming brief | Yes (§7, `ui-copy.md`) | Yes (sign-off in the file) | `slow_down`'s reply text is missing from the list (F2). |
| T4 Wait gate and baseline | Yes | Yes (greps) | The greps match P1's names. The sqlite command lacks `-readonly`, which P1's has. |
| T5 `Ask::Read` | Yes (§5: "phase B adds … read proposals") | **No, as written** | Its tests assert fields P1 doesn't define, and a wire shape that contradicts P1's tagging (F1). Q10 doesn't list a read (F3). |
| T6 Agent mode | Yes (§4.8, §5) | Mostly | `AGENT_TOOLS` names tools P1 doesn't define and omits P1's skill tool (F1). `slow_down` collides with P1's global queue (F2). The scope test inherits `public_key` collisions (F8). The findings join key is unstated (F9). The telemetry guard trips on comments (F12). |
| T7 Key source | Yes (Q11) | Yes | The helper ends up in argv (F4). |
| T8 Streaming runner | Yes (§5: "phase B's streaming sibling of `run_capture`") | Yes | The child's inherited environment is unspecified (F10). |
| T9 argv and parser | Yes | Yes | The argv test is concrete and the fixtures come from T1. |
| T10 Runs, IPC, Channel | Yes | Yes | It consumes P7 names that no committed plan defines yet (noted). Window close has no test (F11). |
| T11 T23 in Plannotator | Yes (T23, §7) | Yes (answer in file) | — |
| T12 Layout options | Yes (§7) | Yes (record file) | — |
| T13 Answer format | Yes (T23, rule 1) | Yes | It has a stop condition for branch (a). |
| T14 Surface | Yes | Yes (Vitest, screenshots) | No task updates P1's TS types or band for the read variant (F6). The commit recipe defeats the `App.tsx` hunk staging (F13). |
| T15 Live run | Yes (§7, P8 live check) | Yes (artefacts) | Good: diffs, receipts, `grep -c`, counts. |

## Findings

**F1. Phase B's P1 names don't match P1's committed plan (blocking).** P1 is committed, so these are known now, not things to reconcile at merge:
- `proposals::{propose, get, list_waiting}` don't exist. P1 defines `save`, `load`, `waiting` and `sweep`, plus one filing function per verb (`propose_server`, `propose_skill`, `propose_undo`, `get_proposal`). P1's extension rule is that each later plan adds "its own variant, its own filing function, its own preview arm and its own decide arm". Phase B names no filing function for reads; Task 5 says "its validation in `propose`".
- `Preview { id, engine_name, name, from, to, config_path, changed_lines }` isn't P1's `Preview`. P1's is `{ id, at_ms, expires_at_ms, asked_by, undo, name, to, target: PreviewTarget, change: Change }`. So `a_read_preview_has_no_changed_lines_and_hangers_own_name` asserts `changed_lines == []` and `from == to` on fields that don't exist. P1's `Change::Nothing` is the natural fit. A read also needs a `PreviewTarget` arm that the plan doesn't name, since P1's are `Server` and `Skill`.
- `a_read_proposal_names_a_tool_and_an_id_only` expects `{"read": {"tool", "id"}}` "in P1's tagging". P1's `Ask` is `#[serde(tag = "verb")]`, so the shape is `{"verb":"read","tool":…,"id":…}`. The test as written can't pass against P1.
- Tool names: the plan has `propose_switch`; P1's working names are `propose_server_switch` and `propose_skill_switch`. `AGENT_TOOLS` lists only "`propose_switch` and `propose_undo`", yet `agent_tools_hold_only_what_q10_allows` expects the `Skill` variant. As written, the agent can't switch a skill, although Q10 allows "on and off".
- P1's `Spec.run` is a plain `fn(&ServerPlaces, &JsonObject, Option<&'static str>)` with no access to server state. Agent mode's scope and granted set ("`HangerServer` gains an optional agent state") need either a second dispatch path or a change to P1's signature. The plan names neither.

Fix: restate "Cross-plan interfaces" and Tasks 5 and 6 against P1's text. Keep Task 4's reconcile step for whatever P1's Gate N renames.

**F2. `slow_down` conflicts with P1's global `MAX_WAITING` (blocking).** P1 caps waiting proposals at 5 across every client, with refusal `queue_full`. Phase B wants "the sixth waiting proposal reads `slow_down`" per run. Under P1, a flood of reads from one agent run fills the shared queue, and the user's own engines then get `queue_full` until the proposals expire after 10 minutes. With two proposals already waiting from an engine, the agent hits the limit at its fourth read, not its sixth. There's no `Refusal::SlowDown` in P1, and Task 3 doesn't name its string. Decide whether the limit is per run and separate from P1's, whether read proposals count toward `MAX_WAITING`, and which refusal code applies.

**F3. Q10 doesn't list a read proposal (blocking: `Ask` is extend-only).** Q10's options in `decisions-round-43.md` read: "Which actions may a model ask for at all? Each one becomes a proposal you approve … The list can grow later but not shrink." The answer lists on and off, Undo, add and remove, and loading a profile. Design §4.8 and the §5 owner row do provide read proposals, and the plan treats `Read` as allowed (its Q10 test admits `Read`) without saying it has read Q10 that way. Because the variant is permanent, the plan should state the reading and get one line of confirmation.

**F4. The `apiKeyHelper` string goes into Claude's argv (blocking).** Decision 4 passes `--settings '{"apiKeyHelper": <value>}'`. The plan's own constraint says the helper string "can embed a literal key". Argv is readable by any process the user runs (`ps`), and Hanger's own `mcp::observe` reads command lines from the process table. The test `the_helper_rides_in_settings_and_the_key_never_in_argv` pins that exposure as the intended design. Options:
- pass the path of the user's own `settings.json` to `--settings`;
- accept argv exposure and say so;
- something else.

Writing the helper into the run folder would put it at rest, which is the anti-goal.

**F5. Claude may write into the real `HOME`.** Task 1 records `find "$HOME" -type f` under a throwaway `HOME` but sets no rule for a non-empty result. Live runs (Task 10 onward) use the real `HOME`. If `--bare -p` still adds a `projects[<cwd>]` entry to `~/.claude.json`, every run adds a `<data>/agent/runs/<id>/cwd` entry to a file Hanger scans (`mcp/dialect.rs` reads `projects`) and that Q1 now lets Hanger write. Add a stop condition in Task 1 Step 5. The alternative to weigh is running the child with a throwaway `HOME` and passing the real one to the server through the mcp-config's `env`. Also have T1 record the environment the fake server receives: Claude passes its own environment, the key included, to the agent-mode server process.

**F6. No task updates P1's frontend for the read variant.** P1's `src/types/mcpProposals.ts` mirrors `Ask`, `PreviewTarget` and `Change` exactly, and its band renders a line per kind. Task 14 "consumes P1's approval band … unchanged, plus its read variant from Task 5", but Task 5 is backend only. Name the task, files and test that add the read arm to `mcpProposals.ts` and the band. Copy: `asked_by` comes from `clientInfo`, so an agent-filed *write* will read "Claude Code asks…". Decision 8 adds no origin field, so only reads can say "Hanger's agent asks". The naming brief should get copy that is true for both.

**F7. Spike step 4(c) can't show what it claims.** "With the variable exported only to the helper's environment, not as `ANTHROPIC_API_KEY` to Claude": Claude runs the helper as its own child, so the helper's environment is Claude's. And if `ANTHROPIC_API_KEY` is in Claude's environment, Claude authenticates through it and the helper is never exercised. Put the key in a differently named variable (for example `HANGER_SPIKE_KEY`), have the helper print that, and leave `ANTHROPIC_API_KEY` unset.

**F8. The scope test inherits `public_key`'s collisions.** "The scope check is a membership test on the public id." `tools.rs` → `public_key` admits that two names sharing 127 characters share an id, and `reach` notes that a path outside the home sanitises to its basename, "which many share". So an out-of-scope asset whose public id equals an in-scope one would be answered without a proposal. Use P1's rule: resolve against the live data, answer only when exactly one item matches, and file a proposal (or refuse) otherwise. Add a test.

**F9. Filtering findings is underspecified.** `tools::Finding` has only `{category, name, path}` (sanitised), with no id. `Findings` carries three lists and three `*_count` fields. `FoundAssets` carries `total`. State the join key (for example `public_key(abs_path)` against `asset_ids`), whether the `*_count` and `total` fields are recomputed after filtering, and whether `outside_scope_count` is one figure or one per list. "The same shape for `findings`" leaves all three open.

**F10. The child's inherited environment is unspecified.** `run_streaming` takes `envs` and doesn't say whether the environment is cleared. A stale `ANTHROPIC_API_KEY` in Hanger's own environment (a terminal-launched dev app) would override the helper route and contradict `KeySource::None`. Say whether the environment is cleared, or at least whether `ANTHROPIC_API_KEY` is removed when the source is `Helper` or `None`.

**F11. Window close has no test.** Review focus 4 names "cancel or window close" and lists only the cancel tests. Either add an app-exit test (the run's future dropped, so `kill_on_drop`, with the pid gone) or narrow the claim.

**F12. Two guards are weaker than they read.**
- `the_agent_code_never_reaches_telemetry` matches the substring `telemetry`, so a doc comment saying "never imports telemetry" turns it red. Match `crate::telemetry` or `telemetry::`.
- `agent_tools_hold_only_what_q10_allows` screens names for `restore`, `install` and `update`, which a differently named tool slips past. Its second half ("files only `Ask` variants among …") doesn't say how a test learns which variant a tool files. Name the mechanism, for example a `const` map from tool to variant that the test walks and the server dispatch uses.

**F13. Task 14's commit recipe undoes the hunk staging.** The global commit steps say `git commit -m "…" -- <paths>`, while `src/App.tsx` is "staged by hunk". Per `shared-checkout.md`, a path-scoped commit re-adds the whole working-tree file and drops the split. Task 14 should say: if it commits from the shared checkout, stage `App.tsx` by blob or hunk, then run a bare `git commit` and verify the tree in isolation. If it commits from its own worktree, use explicit paths.

**Noted, not blocking:**
- P7's names (`ENGINE_CLIS`, `parse_version`, the sign-in reading) can't be checked: P7's plan isn't committed. Task 4's grep gate handles it.
- §4.8 says T23 is ruled "before its first build task"; §7 and the brief say before the first UI task. The plan follows §7 without saying it chose.
- The rest of the spot-check matched `main`:
  - `resolve::path_from_shell` (`-l -i -c`, markers, `OnceCell`);
  - `run_capture`'s signature and its child-outside-the-timed-future pattern;
  - `public_key` private and `public_name` public;
  - the `FoundAssets.assets` field;
  - `run_from_args` and `main.rs`;
  - `ServerPlaces` (no data-dir field);
  - `get_engine_key`, `asset_annotations_on`, `STORE_VERSION = 8`;
  - `libc`, `sha2`, `uuid` and `tokio` "full" in `Cargo.toml`;
  - `is_alive` in `engine_status_tests.rs`;
  - `the_server_module_never_prints`;
  - brand-coverage sources and floors;
  - `claude-code` in `AGENT_CONFIGS`;
  - no `Channel` in use.

## Verdict

**Needs answers.** The blocking questions, in the order they block:

1. F1: will the plan restate its P1 interfaces (filing function, `Preview` fields, `Ask` tagging, tool names including the skill tool, `Spec.run` dispatch) against the committed P1 plan before Task 5?
2. F3: does Q10 permit `Ask::Read`? Q10 lists no read, and the variant is permanent.
3. F2: is the agent's proposal limit per run and separate from P1's global `MAX_WAITING = 5`, and is its refusal `slow_down` or P1's `queue_full`?
4. F4: may the `apiKeyHelper` string ride in Claude's argv, or should Hanger pass the user's own settings file path instead?
5. F5: if spike A shows `--bare -p` writing under `HOME`, does the child run with a throwaway `HOME`, with the real one passed only to the agent-mode server?
