# --plan review: docs/plans/2026-11-27-antigravity-engine.md

Artifact: docs/plans/2026-11-27-antigravity-engine.md on fix/antigravity-source (untracked, as written 2026-11-27), base 37d76b4. Reviewer: independent subagent, given the request, the plan, CLAUDE.md Verification and the plan-gate checklist only.

---

1. Per-step table

Artifact gated: `/Users/karthik/.config/superpowers/worktrees/hanger-ai/antigravity-source/docs/plans/2026-11-27-antigravity-engine.md`, worktree `fix/antigravity-source`, base 37d76b4. Commit 37d76b4 says "fix T22 at the same time, with subagents". That means parallel execution, and this worktree fits it. The plan also moves the subagent kind, so it satisfies the other reading of "with subagents" as well, though it never states which reading it took.

| Step | Traceable to request? | Verifiable? | Notes |
|---|---|---|---|
| T0.1–2 Naming brief + `/humanizer` | Yes (ui-copy.md: a new label needs a brief) | Yes (file exists) | — |
| T0.3 Karthik signs off in Plannotator | Yes | Human-gated | It gates only Q1. Q2–Q6 also gate later tasks, and only Q3 has a "stop and re-plan" clause. |
| T0.4 Re-capture baseline | Yes (shared-asset-machinery.md) | Yes (SQL given) | Baseline matches the store today: 3/19/563/218/302/4/65/2, `user_version` 8. |
| T0.5 `stage-gate --plan` | Yes (CLAUDE.md Gates) | Yes | This report. |
| T1.1–2 Failing tests, red first | Yes (split engines, read where `agy` reads) | Mostly | The plant named for the two tests that may pass red-first ("point the new row's root at `.gemini`") reddens `a_gemini_only_home…`. It does not touch `symlinked_store_skills…`, which only goes red if `follow_links` is turned on. That test also asserts `engine_id IS NULL` on a row it never asserts exists. |
| T1.3 Implement rows, key, `agent_id_static`, subagent block move | Yes | Via T1.1 tests | Code matches the plan. `agent_id_static` returns `""` for unknown ids (scanner.rs:706–713). The gemini block at scanner.rs:1547 pushes `.gemini/config/agents` and `plugins/*/agents`. The generic `g_path_buf.join("agents")` push (1545) covers the new root. `reads_agents_dir: true` is inferred (see findings). |
| T1.4 Move guard floors | Yes (verification.md: a stale floor stops guarding) | Yes (grep -c) | The list is incomplete, and the floors could go in their own commit (findings). |
| T1.5 Regenerate README | Yes (readme-sync) | Yes | The expectation is false: "no other region changes" (findings). |
| T1.6 Allowlist entry for DesignSystemPane:1226 | Forced by the rename | Yes | Verified: the line exists, and adding the entry first would fail as stale, so the ordering exception applies. |
| T1.7 Four gates | Yes | Yes | — |
| T1.8 Commit with explicit paths | Yes | Yes | The Files header omits `src/data/brands.ts`, which Steps 3 and 8 edit. |
| T1.9 Real-scan per-kind diff | Yes (shared-asset-machinery.md) | Partly | Doesn't say which build runs the scan, or the effects on the real store (findings). The prediction of +11 skills and +4 tools matches disk: 11 `SKILL.md` under `~/.gemini/config/skills` and 4 server names in `mcp_config.json`. |
| T2.1–3 SWITCHES row + Q3 edit.rs change | Yes ("separate switches") | Yes | `SwitchKind::DisabledKey` exists (registry.rs:324), no SWITCHES row uses it (rows at 366/370/374), and ops.rs:729 already routes it. |
| T2.4 Forced test edits | Forced by Q3 | Yes | One of the three named tests won't fail (findings). |
| T2.5–6 Gates, commit | Yes | Yes | — |
| T3 Mark | Partly. Karthik didn't ask for a mark, but two tiles with one mark misidentify an engine | Yes | `ALIASES.antigravity: "gemini"` confirmed (brands.ts:111). The lobe 1.94.0 svgs exist. |
| T4 Records (matrix, T22, roadmap) | Yes (T22 "done when … documented") | Weak ("vitest green" only) | The Q4 TODO isn't placed in any task. |
| T5.1 Screenshots | Yes (verification.md) | Yes, if the right build is running | Same build/store gap as T1.9. |
| T5.2 Karthik's live check | Yes | Human-gated | The expected diff is wrong (findings). It is the only real-config write, and Karthik does it. |
| T5.3 Counts + `--dev` gate | Yes | Yes | — |

2. Findings

**False claims, each disproved by a read:**
- **T2.4: `when_both_keys_disagree_the_one_the_engine_is_switched_by_is_read` will not fail under "disabled only".** Its fixture holds `{"enabled": true, "disabled": true}` and expects `Some(false)` under DisabledKey (mcp_switch_tests.rs:438–440). Today's `disabled.or(enabled)` (edit.rs:265) and disabled-alone both give `Some(false)`. Only `read_flag_reads_both_spellings` (the `enabled_off`/`enabled_on` cases) and `an_entry_that_already_says_enabled_keeps_that_key` actually change. Have the worker list the reds from a run, not from this prediction.
- **T1.5: "no other region changes" is wrong.** `readmeCounts.ts:73` counts `src-tauri/tests/*.rs`, and README.md:162 reads "48 Rust integration test files". Creating `antigravity_engine_tests.rs` makes it 49, so the `tests` region moves too.
- **T1.4 misses one floor.** `no-hardcoded-engine-copy.test.ts:124` has `knownEngineNames().length >= 16` (the union of names). It becomes 17 and the plan names only the split floors at lines 134–135.
- **T5.2: "only the flag line moving" is wrong.** Hanger's DisabledKey "on" writes `"disabled": false` rather than removing the key (`a_server_switched_off_and_on_again_ends_with_its_flag_saying_on`, mcp_switch_tests.rs:617–628). So the diff against the pre-copy shows an added line. Also, `agy`'s reading of `"disabled": false` was never measured: the transcript covers an absent key and `true` only. Add that case to the throwaway-home run.

**Unstated assumptions:**
- **`reads_agents_dir: true` is the plan's own pick, marked "inferred".** It changes the Reach column for every shared-store asset (hundreds of rows) on a basis the plan itself says is undocumented for `~/.agents`. CLAUDE.md requires reading harness.md before touching reach. Either measure it, for example with `agy`'s skill listing on a throwaway home, or raise it as a question.
- **That Gemini CLI never creates `~/.gemini/config`.** This wasn't measured; fact 9 covers `agy` only. If Gemini CLI does create it, every Gemini-only machine gets a phantom Antigravity tile, and the fixture test in Review Focus 3 can't detect that. Run `HOME=<empty> gemini mcp list` and list what appears.
- **Which build T1.9 and T5 run, and against which store.** The main checkout's dev app runs main's code, and a second `tauri dev` from this worktree collides on strictPort 8397. A branch scan writes an `antigravity` engine row, a root row and about 15 new asset rows into Karthik's real store. Reaping is off by default, so if the branch is abandoned or delayed, main and peers keep those rows under an engine main doesn't know. The plan should say so, or scan a copy of the store.
- **The plant for `symlinked_store_skills…` doesn't exercise it** (table above). verification.md requires a plant that reddens the specific test.

**Rule conflict:**
- **T1.4 puts the floor raises in the feature commit.** Floors are `>=`, so the old values still pass with 17/12/14. An ordering where both commits are green exists: tables first, floors second. verification.md's exception covers only edits that cannot be ordered, like the allowlist and README regen here. Either split the floors into their own commit or justify keeping them together in the body.

**Silent or under-surfaced picks:**
- **Q3 "disabled only" changes the generic `DisabledKey`, not an Antigravity-specific rule.** It would also govern future Cursor, VS Code and Claude Desktop rows, which the mcpick rule was ported for. Q3 frames this as "matches the one engine measured". That's honest, but it should also say the change reaches every future DisabledKey host.
- **The Antigravity IDE/App may still read `~/.gemini/antigravity/mcp_config.json`.** That was not measured, and it bears on Q1's second option ("Antigravity covers the IDE").

**Scope:**
- **Q4's recommended answer opens a TODO, but no task writes it.** Task 4 lists only the "Not touched" items and Q5.
- **Small corrections.** The `agents.rs` module doc line 13 is a historical statement ("filed under 'Gemini / Antigravity'") and doesn't need rewriting. `~/.gemini/config` also holds `node_modules/` and `sidecars/`, which the evidence listing omits. This is harmless, since nothing walks them.

**Checked against the code and confirmed:**
- Floor targets: HOSTS 16→17, AGENT_CONFIGS 11→12, `get_engine_key` arms 13→14, and the scope-agent floor 13→14 (11 configs + 2 RULE_FILE_OWNERS).
- Gemini keeps its id, so no migration is needed. There is one `engines` row (`3|gemini|Gemini / Antigravity`), the only `.gemini` assets are the 1 rule, 2 subagents and 5 tools named in the plan, and the move would update `root_id` and `engine_id` (preferences.rs:1576–1600).
- `engine_for_path` takes the longest match (agents.rs:368–383).
- The subagent needle `.gemini/config/agents` collides with no other, so first-match-wins stays safe.
- `resolve_target_path` refuses an engine with no project root (lib.rs:1243).
- No env-relocation entry exists for `.gemini` (`CONFIG_DIR_ENVS`).
- The frontend id tables are only `mcpServerView.ts`, `assetProvenance.ts` and `brands.ts`.
- No agent step writes a real engine config. Every probe uses a throwaway HOME, and the one real switch is Karthik's, in T5.2.

3. Verdict

**Needs answers.** The blocking questions, in the order they block:
1. Q1: what are the two labels? This gates Task 1.
2. Should Antigravity get `reads_agents_dir: true` (Reach on every store asset) before `agy`'s reading of `~/.agents/skills` is measured, or measure first? This gates Task 1.
3. Does T1.9/T5 scan the real store from a branch build? If so, are leftover `antigravity` rows acceptable when the branch isn't merged (reaping off), and how does the worktree's dev app avoid port 8397? This gates T1.9.
4. Q4: accept the phantom Gemini tile on an Antigravity-only machine, and in which file does the TODO land? This gates Task 1's scope and Task 4.
5. Q2: ship the switch now, or keep Antigravity read-only? This gates Task 2.
6. Q3: should `DisabledKey` read and write `disabled` only, knowing that also binds every future DisabledKey host? This gates Task 2.
7. Q6: which mark? This gates Task 3.
8. Q5: record the reach gap as a known limit, or add the edge? This gates Task 4.

Before building, the plan should also fix: the T2.4 test list, the T1.5 README expectation, the missing union floor, the plant for the symlink test, the floor-commit split, and the T5.2 diff expectation.

Not checked: I did not re-run the `agy` and `gemini` throwaway-home transcripts, because that would create files and this was a read-only review. I didn't open the vendor docs. I took the claim that the sweep runs before the registry pass from code comments, not by tracing it.