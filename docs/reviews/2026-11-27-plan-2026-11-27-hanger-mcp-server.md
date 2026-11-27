# --plan review: docs/plans/2026-11-27-hanger-mcp-server.md

Artifact: docs/plans/2026-11-27-hanger-mcp-server.md (untracked, as written 2026-11-27), tree at 37d76b4. Reviewer: independent subagent, given the request, the plan, CLAUDE.md Verification and the plan-gate checklist only.

---

1. **Per-step table** (gated: `/Users/karthik/Work/Labs/hanger-ai/docs/plans/2026-11-27-hanger-mcp-server.md` at 37d76b4)

| Step | Traceable to request? | Verifiable? | Notes |
|---|---|---|---|
| G0 Karthik rules on Q1–Q8 | Yes (the plan's own open questions) | Yes, rulings recorded in file | Blocks everything. It does not ask about T22 sequencing (see below). |
| T1 Read-only store access, `_on` variants | Yes. A second process needs it | Mostly. The tests are named and the red run is stated | Wiring `STORE_VERSION` into the v8 migration step is a latent hazard. It covers only the server waiting on the app, not the app waiting on the server. |
| T2 One spelling of the data folders | Partly. The server needs `data_dir_for`, the `lib.rs` refactor is extra | Yes | Simpler path not considered: a server-only `data_dir_for` plus the identifier test, leaving `lib.rs` alone. Step 5 leaves out the README regeneration, but the new `mcp_server_tests.rs` moves the `tests` figure. |
| G1 Naming brief | Yes (`ui-copy.md`) | Human-gated sign-off | The "Antigravity is not read (T22)" copy goes false if T22 lands at the same time, as the request says it will. |
| T3 Five read tools as functions | Yes (option A: list/reach/findings, plus engine status) | Weak in places | The in-process tests cannot exercise `sanitise_path` or `get_global_agents` against the temp home (see false claims). |
| T4 Boundary test plus planted mutations | Yes (research rule 6) | Yes: the plant/revert proof is in the step | Sound. |
| T5 stdio server, `mcp` subcommand | Yes | Yes. The protocol tests are concrete | The `server/discover` result shape (`supportedVersions`, the `_meta` key) is taken from a summary, not quoted. |
| T6 `docs/mcp-server.md` | Yes (Q6 recommendation) | The links are verifiable. The install lines are marked as unverified until run | OK. |
| G2/T7 Live proof | Yes | Mostly | Step 4 "compare each reply with what Hanger's window shows" names no artefact. Ask for a screenshot per item next to the reply. |
| T8 Proposal files | Yes (option A `switch_server` proposal), gated on Q8 | Mostly | No test covers an `Undo` proposal with a foreign or unknown `receipt_id`. Step 5 leaves out the README regeneration for the new `mcp_proposal_tests.rs`. |
| T9 App applies the approved proposal | Yes | Yes | The Claude Code preview is empty, while research rule 5 demands "the literal change … or the untruncated `add-json` argv". The plan does not say how it resolves this. |
| G3 Approval surface design | Yes | Human-gated | OK. |
| T10 Approval surface | Yes | Yes (Vitest plus screenshots in both themes) | OK. |
| G4/T11 Live write proof | Yes | Human-gated, with config diffs pasted | OK. Karthik drives every write. |

2. **Findings**

**Unstated assumptions**
- **The reverse lock direction.** Under a rollback journal, a server read holds SHARED, and the app's writer cannot get EXCLUSIVE to commit while it does. Most app connections go through `PreferencesStore::connect` with rusqlite's 5 s default timeout. Long reads by the server (annotations over every asset, FTS) could make scan or index writes return BUSY, and `search.rs:79` calls a dropped index write "silent". Review Focus 2 only looks at the server waiting on the app.
- **`sanitise_path` reads `std::env::var("HOME")`** (`preferences.rs:22-35`), not `ServerPlaces.home`. In the in-process Task 3 tests HOME is the real home, so temp-home paths become `<sanitised>/SKILL.md`. As a result:
  - `engine_context_keys_carry_no_raw_home` passes without testing anything.
  - `reach_answers_for_a_global_skill_by_its_sanitised_path` matches on a basename that many skills share.
  - Task 8's `a_sanitised_key_is_matched_back_exactly` (the `~/…` form) cannot pass in-process.
- **`scanner::get_global_agents()` takes no home.** It calls `get_home_dir()` from the environment (`scanner.rs:483-496`), so `list_engines.detected` in tests reflects the real machine.
- **`SwitchPlaces::under` fixes `system` to `/`.** In-process tests therefore read the real `/Library/...` managed config, and `engine_base` reads the developer's real `CODEX_HOME`/`CLAUDE_CONFIG_DIR` if they are set. That is read-only, but the tests are not deterministic.
- **`as_of_ms = MAX(last_seen)`** treats a scanned machine with zero assets as `NotScannedYet`, which reports a finding as pending (`ui-copy.md`). The store has no persisted scan timestamp (grep for `scanned_at` or `last_scan` in `src-tauri/src` finds only the in-memory `McpLaunches`).
- **Findings mix scopes.** `broken` and `drifted` come from annotations, which cover global roots only, while `unparsed` is queried from every scope. The plan does not state this.
- **T22 runs alongside this work.** It changes `registry.rs` HOSTS/SOURCES, and per research ruling 4 also the engine split. That alters `list_engines`, the G1 copy and the `brand-coverage` floors. The plan does not say whether the server waits for T22 or ships with "Antigravity not read".

**Silent interpretation picks**
- Option A in the research reads "First ship: deterministic findings (hash change, plaintext secret slot, unpinned `npx`/`uvx`, `curl | sh`) … Then a stdio MCP server." The plan takes ruling 3 as replacing that first ship, and shrinks findings to broken/drift/parse without naming the choice.
- Decision 6 cites rule 6 ("names, transport, command basename and env and header key names") and then drops transport, basename and env key names. That is stricter, which is fine, but it is presented as following the rule.
- Phase 2: the model chooses which item to switch, and Hanger shows it. The plan rules T23 "not triggered". That is defensible, but Q7 should state the nuance so Karthik rules on it knowingly.

**Speculative scope**
- `init_db`'s final migration "sets `PRAGMA user_version` from the constant" (`preferences.rs:697` is the v8 step). When v9 is added and `STORE_VERSION` is bumped, the v8 step would write 9 and skip migration 9. Keep the literal. The test `store_version_is_the_version_a_fresh_store_reaches` already ties the constant to the real version.
- The T2 refactor of the app's `switch_places`/`skill_places` is not needed by the server.

**Weak criteria**
- T7 Step 4: the comparison has no artefact.
- T3's sanitisation tests pass trivially in-process (above).
- T8 has no foreign-receipt Undo test.
- T2 and T8 do not regenerate the README in their own steps. The global constraint covers it, but the step text contradicts it.

**False claims** (with the check that disproves each)
- **"None sets a busy timeout… fails at once with `SQLITE_BUSY`."** rusqlite 0.31 sets 5 s on every open: `grep -n busy_timeout ~/.cargo/registry/src/*/rusqlite-0.31.0/src/inner_connection.rs` returns `121: sqlite3_busy_timeout(db, 5000)`. `invariants.md` says the same.
- **"The backend holds broken and drift as `AssetAnnotation::mechanism` (global roots only)."** This is incomplete. The scanner sets `LinkState::Drifted` per asset in every scope (`grep -n "LinkState::" src-tauri/src/scanner.rs` gives lines 1375, 1478, 2087, 2475), and that feeds `reviewIssues.ts:192-197`.
- **Q4: "Names, paths and Hanger's own facts carry no injected prose."** Asset names are frontmatter text: `grep -n "name: fm.name" src-tauri/src/scanner.rs` gives lines 1497, 1637, 2096, 2218. They are untrusted and uncapped.
- **"Write config files as `switch_bench` does" alongside "Never `set_var`."** `switch_bench` calls `std::env::remove_var("CODEX_HOME")` and `remove_var("CLAUDE_CONFIG_DIR")` (`ipc_boundary_tests.rs:143-144`) and uses `system: root.join("system")`, which `server_places` cannot express.
- **Citation `probe.rs:384`** is inside `probe_http`. The stdio `initialize` is at `:605` (`grep -n '"initialize"' src-tauri/src/mcp/probe.rs`).

**Claims checked and true:**
- No `journal_mode` pragma exists.
- `PreferencesStore::new` is called at `scanner.rs:24`, `search.rs:273` and `preferences.rs:1845`.
- `annotations.rs:113` uses `Connection::open`.
- `user_version = 8` is at `:697`.
- The 30 s timeouts are at `search.rs:81` and `skill_switch/ops.rs:217`.
- Both lock quotes are accurate.
- The `IssueKind` set is as stated.
- `CLIENT_PROTOCOL_VERSION` is at `:69`.
- The bridge is `cfg(debug_assertions)` at `lib.rs:2205-2209`.
- The `tauri.conf` identifier and `mainBinaryName` are as stated.
- There are 48 `.rs` test files.
- `readmeCounts.ts:88` says "three events".
- `Cargo.lock` has schemars 1.2.3 and tokio 1.54.1, and no rmcp.
- rmcp 3.12.0 is Apache-2.0 with rust-version 1.88 (`cargo info`).

**Model output on screen:** none in phase 1. Phase 2 carries no free text, only the borderline item choice noted above.

**Engine config writes without a human gate:** none. Every real write (T7 Step 3, T11) is Karthik's. Tests write fixtures only, though they read the real `/` and the real env.

3. **Verdict: Needs answers**

In the order they block:
1. Karthik rules on Q1–Q8 (G0).
2. T22 runs at the same time: does this server wait for it, or ship with "Antigravity is not read", and who raises the `brand-coverage` floors?
3. Drop "`init_db`'s final migration sets `user_version` from the constant" (a plan fix, before Task 1).
4. How Task 1 stops the server's reads from starving the app's writers. That needs a stated bound and a test that the app's writer is not BUSY while the server reads.
5. How the Task 3 tests isolate home, system and env, given `sanitise_path` and `get_global_agents` read the process environment. Either add a seam, or move them to child-process tests as Task 5 does.
6. Should a scanned-but-empty store answer empty rather than `NotScannedYet`, and where does "scanned" come from?
7. Q4 should cover names too: cap or validate frontmatter and server names before they leave the process?
8. Q5 framing: global-only broken/drift versus the per-asset drift the scanner already stores for every scope.
9. Phase 2 only: what the Claude Code approval preview shows, given research rule 5 asks for the literal argv and Decision 6 forbids config values.

Not checked: the MCP spec pages and the rmcp README/CHANGELOG quotes (no web fetch), and whether `transport-io` exists in 3.12, because `cargo info` hides deactivated features. Running `cargo info rmcp` downloaded rmcp into `~/.cargo/registry`. Nothing in the repo changed.