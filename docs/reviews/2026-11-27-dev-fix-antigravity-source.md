# --dev review: fix/antigravity-source at 6fb9bb1

Artifact: branch fix/antigravity-source, diff 37d76b4...6fb9bb1. Reviewer: independent subagent (Opus), combined with the whole-branch review; given T22, the plan and its answers, CLAUDE.md Verification and the diff-review lenses only.

---

# Review 1: whole-branch code review

**Pinned:** `fix/antigravity-source` at `6fb9bb18305337f37916b6a10f9387a2ae2aab2d`, base `37d76b4`. Seven commits: three docs/plan commits, then `77134a5`, `e6a3cc2`, `60472a8` and `6fb9bb1`. I read all 23 files hunk by hunk at the pinned SHA, in passes (Rust src, Rust tests, frontend, docs), with `docs/reviews/` left out. The branch's working tree is unchanged: HEAD is the same and the only untracked path is `.superpowers/`.

**Gates.** I ran them myself at 6fb9bb1 in a detached temporary worktree (since removed), each in its own call from that tree's root, cargo from `src-tauri/`:
- `cargo test`: EXIT=0, 955 passed, 0 failed, 10 ignored, 52 result lines.
- `npx vitest run`: EXIT=0, 184 files, 1751/1751. Run alone, with nothing in parallel, so it says nothing either way about the flake the implementer reported.
- `bunx tsc --noEmit`: EXIT=0.
- `gitleaks detect --source .`: EXIT=0. `gitleaks detect --source . --no-git -c .gitleaks.toml`: EXIT=0.

### Plan alignment
All eight answers in "Answers (Karthik, 2026-11-27)" are implemented as ruled:
- **Q1 (labels):** "Gemini CLI" and "Antigravity CLI" in `AGENT_CONFIGS`, `HOSTS`, `HOST_NAMES`, `NAMES` and README.
- **Q2:** `reads_agents_dir: true`, with a comment saying it is unmeasured.
- **Q3:** an `#[ignore]` test scans a copy of the store.
- **Q4:** recorded as T24.
- **Q5:** a Global `SWITCHES` row.
- **Q6:** `reading` returns `disabled` alone, and `change` keys on `kind == DisabledKey`.
- **Q7:** `antigravity-color.svg`.
- **Q8:** recorded in `docs/roadmap.md`.

The Interfaces block matches the code field for field. Task 5 (screenshots, Karthik's live `agy` check, recounts) has not been done. That is correct for this stage, but the branch cannot merge without it (see the verdict).

### Architecture: shared asset machinery, per kind
- **Skills.** The Antigravity walk is `g_path_buf.join("skills")`, so it reaches only `~/.gemini/config/skills`. Gemini's walk reaches only `~/.gemini/skills`. With `follow_links` off, the symlinked store skills are not descended; this is pinned and proven by a plant.
- **Rules.** Direct children of each root. `GEMINI.md` stays Gemini's (fixture-asserted).
- **Subagents.** The `.gemini/config/agents` and `plugins/*/agents` walks moved to an `antigravity` block that now uses `g_path_buf`, which honours `engine_base`, instead of `get_home_dir()`. The two stored rows re-parent; a test pins the engine, a single row, and the new root.
- **MCP.** `is_swept_mcp_config` matches exact names, so the `.cua-backup-*` sibling is not swept. Without `agent_id_static("antigravity")` the sweep would leave host `""`; the sweep-host test pins it. `seen_registrations` dedupes the sweep row against the `SOURCES` row.
- **Reach.** `reads_agents_dir` and the Q8 limit are as ruled.
- **Counts.** Root equality, and the floors are exact: I counted HOSTS = 17, AGENT_CONFIGS = 12, get_engine_key = 14.
- **Deploy.** The refusal is the existing `lib.rs:1243` string. An empty `project_roots` already has a precedent (`agents.rs:218`).

### Security
The new config writer is the existing EnabledKey/DisabledKey path in `ops.rs`:
- `only_the_flag_differs` runs before the write.
- `apply::safe_replace` takes the backup and writes atomically.
- Undo is limited to `written_for`, which now includes `~/.gemini/config/mcp_config.json` because it collects every DisabledKey registration.
- No new IPC. Receipts carry ids only.
- The DisabledKey doc in `registry.rs` now says that every future DisabledKey host is bound by the new rule and that a host honouring both spellings gets its own kind.

### Production readiness
No store migration is needed, confirmed:
- No change to `preferences.rs` or the migration tests.
- `upsert_engine_on` updates `display_name` on conflict (`preferences.rs:1317-1320`), so the rename lands on the next scan.
- The `gemini` key is kept.
- `brands.ts` keeps `geminiantigravity → gemini` for an unrescanned store.

### Testing
The red-first logs exist and match the report:
- t1: 1, 1 and 3 failed, EXIT=101.
- t2: 3 failed, then 1, then the predicted 2 forced reds in a 172/2 whole-file run.

The two tests that passed red-first were each proven by a plant. The floors moved to the real counts, so a dropped row goes red. The store-copy harness is a hand-run measurement that asserts nothing, as the plan specified.

### The implementer's two rulings
- **(a) A non-boolean `enabled` still refuses the switch under DisabledKey: endorsed.** The existing test `a_flag_that_is_not_true_or_false_reads_as_absent_and_is_never_overwritten` runs both kinds over a TOML body with `enabled = "marker"` and requires `Unparseable`. Writing `disabled` anyway would have turned that test red, and editing it needs Karthik's call. So (a) is the only reading of Q6 that leaves a standing safety test untouched. It was also disclosed in the commit body.
  - Correction to how it is described: such an entry is not "read-only". `context.rs` → `flag` reads `Ok(None)` as On with no reason attached, so the UI offers a switch that then fails with FLAG_IS_NOT_A_BOOLEAN. That is the existing behaviour for any non-boolean flag, not new.
- **(b) Renaming `an_entry_that_already_says_enabled_keeps_that_key`: endorsed.** Its name stated the rule Q6 removed. The new assertions are exact strings, as strong as the old ones. Nothing else in the tree cites the old name (grep returned nothing).

### Findings
Critical: none. Important: none.

Minor:
1. **`skill_switch/links.rs` → `EXTRA_LINK_PLACES` doc is now false.** It says it lists folders "that no `AGENT_CONFIGS` row names a skills folder for", but `.gemini/config/skills` is now named by the antigravity row. It behaves correctly (`link_places` dedupes), but the comment should say so or the entry should go.
2. **The store-copy count can only show additions and moves, not losses.** The copy keeps main's rows and reaping is off, so a Gemini-side walk that stopped finding things would still read "identical". Fixtures cover `GEMINI.md` and `settings.json`, but nothing new covers `~/.gemini/agents` or `~/.gemini/skills` staying Gemini's. A cheap upgrade: scan into an empty store from base and from head and compare.
3. **A newly reachable mismatch is unrecorded.** `agy` drops an entry whose `disabled` is a non-boolean; Hanger lists it as on, with a switch that fails. The plan's Evidence records this, but the roadmap list in `6fb9bb1` does not.
4. **`agents.rs` → `subagent_owner_for_path` doc** has a re-wrapped line ending "configs' needles can both" that breaks the paragraph's flow. Cosmetic.
5. **No test pins Q2's effect** (Antigravity reaching a store skill without a link). The arm is covered generically; this would only catch the table value being flipped.
6. **Mention only, not this diff's defect:** `.claude/DESIGN.md:2988` "for ten of the eleven brands" was already stale and is now one further off.

### Declined to judge
- **Whether a running `agy` session skips a `disabled` server.** That is Karthik's live check (Task 5), and the real configs are off limits.
- **The colour mark at 12px and on dark, and `svgSymbol.ts` prefixing its `<mask>`/`<filter>` ids.** Only a screenshot of a running build can settle this.
- **Whether `reads_agents_dir: true` is true.** It is unmeasured by design (Q2).
- **The vendor-doc facts 4 and 6–8.** I did not re-fetch them, and probing `agy` is out of scope.
- **The implementer's vitest flake under load.** My run was isolated and green, which neither proves nor rules it out.
- **Whether everything `global_pass` calls is free of filesystem writes.** I checked only `scanner.rs`'s write calls.

**Verdict: Ready to merge** as code; no Critical or Important findings. Merging itself waits on Task 5. Under `verification.md` → Human-gated steps, the Task 5 screenshots and Karthik's `agy` check must be in the conversation, or he must accept the gap in writing, before this merges. T22 reads CLOSED and also states that check is still owed.

---

# Review 2: stage-gate --dev

**Diff:** `git diff 37d76b4...6fb9bb1 -- . ':!docs/reviews'`, pinned at `6fb9bb18305337f37916b6a10f9387a2ae2aab2d`. All hunks read. The branch has no uncommitted work; the only untracked path is `.superpowers/`, which is gitignored scratch.

**Canonical checks** (CLAUDE.md → Verification), run by me at the pinned SHA in an isolated worktree: `npx vitest run` EXIT=0 (184 files, 1751 tests); `cargo test` EXIT=0 (955/0/10); `bunx tsc --noEmit` EXIT=0; both gitleaks invocations EXIT=0. None skipped.

**Success criteria from the plan:** Tasks 0–4 are met with evidence (red logs, plants, floors, README regenerated, store-copy counts matching the prediction line by line). Task 5 (screenshots, Karthik's check, recount) is outstanding and human-gated.

```
File: src-tauri/src/skill_switch/links.rs:24-34 (unchanged by the diff; made false by agents.rs:152-162)
Lens: Surgical
Guideline: a change that makes adjacent prose false fixes it in the same change
Why: EXTRA_LINK_PLACES says no AGENT_CONFIGS row names these skills folders; the new antigravity row names `.gemini/config/skills`.
Suggested action: drop the `.gemini/config/skills` entry (step 1 now yields it), or amend the doc line.
```

```
File: src-tauri/src/agents.rs:420-423
Lens: Surgical
Guideline: new code matches the file's idiom
Why: the re-wrap leaves a short "/// configs' needles can both" line mid-paragraph.
Suggested action: re-flow the paragraph.
```

```
File: src-tauri/tests/antigravity_engine_tests.rs:225-288 (real_machine_counts_on_a_store_copy)
Lens: Verification
Guideline: a control must be able to fail on the thing it checks
Why: a copy of a store with reaping off keeps every row main saw, so a lost Gemini-side asset reads as "identical"; it detects additions and moves only.
Suggested action: say so in its doc comment; optionally compare branch and base scans into empty stores.
```

```
File: docs/roadmap.md:295-305
Lens: Verification
Guideline: what the cut leaves divergent is recorded
Why: the plan measured that agy drops an entry with a non-boolean `disabled`, which Hanger lists as on with a failing switch; the roadmap list omits it.
Suggested action: add one bullet.
```

**Simplicity:** no findings. The production change is small: about 95 lines across `agents.rs`, `registry.rs`, `edit.rs` and `scanner.rs`, and the `edit.rs` conditional got simpler. Nothing is speculative.

**Surgical, otherwise clean:** every hunk traces to T22 or to an Answer. The `scanner.rs` `let home` removal tidies the diff's own leftovers. The two `brands.ts` comment edits and the `subagent_owner_for_path` paragraph were made false by the change. The test rename is justified (ruling b). No orphans; no pre-existing code deleted.

| # | Finding | Lens | Blocks push? |
|---|---|---|---|
| 1 | `EXTRA_LINK_PLACES` doc made false by the new row | Surgical | No |
| 2 | Re-wrapped doc line in `subagent_owner_for_path` | Surgical | No |
| 3 | Store-copy count cannot show losses; undocumented limit | Verification | No |
| 4 | Non-boolean `disabled` divergence not in the roadmap | Verification | No |

**Verdict: Ship.** No blocking findings. Per the plan (Task 5 Step 3) and `verification.md`, the push still waits on Task 5's human-gated items.

---

I did not run `agy`, `gemini` or the dev app, did not re-fetch vendor docs, and did not render the new mark. The one live risk is behavioural: that a running `agy` session honours `disabled`, which only Karthik's check can settle.