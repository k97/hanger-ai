# Slice 6: the `list_changed` spike, then the "applies" line — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Reconciled 2026-11-28** after the `--plan` review (`docs/reviews/2026-11-28-plan-2026-11-28-slice6-spike-applies-plan.md`), applying `docs/plans/research/2026-11-28-reconciliation-rulings.md` R4 (P2 owns `context`: `EngineContext.applies` stays `Option<String>`, filled with the fixed codes `next_turn`, `after_reload` and `next_session`; this plan adds no type to `context` or to P2's `engineContext.ts`, and a project context's `applies` stays `None`) and the P6 fixes: spike runs happen with Hanger quit (**ruled in round 44 Q1 (the recommended option)**); which Claude Code mode decides the pass **ruled in round 44 Q2 (the recommended option)**. Each is built to the recommended option as the provisional default. The review's mechanical findings are fixed in place. Shared names: `docs/plans/research/2026-11-28-cross-plan-interfaces.md`.

**Goal:** Measure, per switchable engine, whether a running session follows a changed tool list (added and removed) and a Hanger config write. Then fill `EngineContext.applies` from what was seen, and record whether Q12's bar for a gateway shim was met.

**Architecture:** A one-file, stdlib-only Python MCP server (no SDK, so no SDK behaviour colours the result) flips its tool list when a file is touched and logs every message's method, never its payload, to JSON lines. A human-gated live run per engine produces a log. The results go into the engine matrix, a fixed string code in `EngineContext.applies` (P2's field, `Option<String>`), one copy line per code in `switchCopy.ts`, and one line on the overview card once the combined layout round has placed it.

**Tech Stack:** Python 3 stdlib (`json`, `select`, `os`, `sys`, `datetime`, `unittest`); Rust (`serde`); TypeScript, Vitest.

**Spec:** `docs/plans/2026-11-28-harness-design.md` §4.6, §5 (owner table, `mcp::switch::context` and the overview card rows), §7 (P6, wave 2, the human gates) and Answer 12. Research: `docs/plans/research/2026-11-28-slice6-gateway.md` §3, §4 (option C and the spike design), §7.

## Global Constraints

- The gateway is not built in this plan. Answer 12: "The shim is built only if Claude Code and at least one other engine drop a removed tool mid-session." This plan only records whether that bar was met, on `docs/roadmap.md`.
- Live runs use Karthik's real, signed-in engines. A throwaway `HOME` can't sign in, so the brief's throwaway-`HOME` rule can't hold for these runs. Design §7 makes each run a live check: "P6 per engine with Karthik's go-ahead". Nothing reads a credential file. Evidence comes from the spike's own log and from each engine's `mcp list`, filtered to the `spike` line.
- **Hanger is quit for every run (ruled in round 44 Q1 (the recommended option); provisional default, the recommended option).** With reaping off, any scan while `spike` is registered leaves a `tool` row in Karthik's store for good (`reap_enabled` is off unless `HANGER_ENABLE_REAP` is set). So the release app and the dev app are both quit before protocol step 3 and stay quit until step 9 has removed `spike`, and the protocol never rescans. Hanger's mid-session write (protocol step 8) is made by Task 1b's harness, which calls the switch code with no app and no scan. If Karthik picks "keep Hanger running" instead, step 9 expects exactly +1 `tool` row per engine, lists it for him, and requires skill, rule and subagent counts identical.
- Never secrets: the spike logs methods, ids, tool names, the negotiated protocol and `clientInfo`, and never `params` or `arguments`. No value crosses IPC. `applies` is a fixed code.
- The store schema doesn't move. `STORE_VERSION` stays at 8, and nothing here needs a migration.
- Red first for every change under `src-tauri/src/` (`verification.md`).
- New strings: a naming brief, Karthik's sign-off and a `/humanizer` pass (`ui-copy.md`). Copy must be literally true of the runs.
- Counts come from the backend. `appliesLine` maps a code to a string and counts nothing.
- Commits name explicit paths, each in its own Bash call, with no `-n` anywhere in that call. New files are `git add`ed first, and then `git diff --cached --name-only` must list only this task's files.
- Gates (`CLAUDE.md` → Verification), from the repo root unless stated: `npx vitest run`; `cargo test` (from `src-tauri/`); `bunx tsc --noEmit`; `gitleaks detect --source .` and `gitleaks detect --source . --no-git -c .gitleaks.toml`.
- Per-kind counts, read-only, before the first commit, around every live run and after the last commit:
  `sqlite3 -readonly -cmd ".timeout 30000" "$HOME/Library/Application Support/com.rkarthik.hanger/hanger.db" "select category, scope, count(*) from assets group by category, scope order by category, scope;"`

## Decisions this plan makes

Design §9 leaves these to the builder. They are fixed here.

- **Which engines run:** the four `registry::SWITCHES` hosts, `claude-code`, `codex`, `gemini` and `antigravity`, at the tier each row covers. The research's table lists eight engines. `applies` only describes a Hanger switch, though, and only these four have one. Claude Code runs twice, with tool search on and with it off (#66084 is about the deferred-tool index); which run decides is round 44 Q2's (below). Versions installed on 2026-11-28: `claude 2.1.332`, `codex-cli 0.172.0`, `gemini 0.56.0`, `agy 1.5.18`. Each run records its own version.
- **One trigger, out-of-band:** a change in the mtime of `<spike_dir>/flip` (including the file appearing) toggles the set. That is the gateway's real case. The research's in-band `spike_flip` tool is dropped, because it tests nothing that Q12 depends on.
- **Sets:** A = `[spike_alpha]` and B = `[spike_alpha, spike_beta]`. The runner writes the target set, `A` or `B`, into `<spike_dir>/flip`, and every spike process reads that file at start and on each mtime change, so a process spawned or reconnected mid-run (#108287) serves the same set as the others. With no `flip` file a process starts on A, so the first flip adds a tool and the second removes it.
- **Notification routing**, from the 2026-07-28 spec (fetched 2026-11-28: `/specification/2026-07-28/server/tools` → "List Changed Notification", and `/basic/patterns/subscriptions`):
  - A client that sent `subscriptions/listen` with `notifications.toolsListChanged: true` first gets `notifications/subscriptions/acknowledged`, whose `params._meta["io.modelcontextprotocol/subscriptionId"]` is the listen request's JSON-RPC id and whose `params.notifications` is `{"toolsListChanged": true}`. After that it gets `notifications/tools/list_changed` with the same `_meta` id. A `notifications/cancelled` naming that id ends the stream.
  - A client that sent `initialize` and opened no stream gets an unprompted `notifications/tools/list_changed` with no `_meta`, which is the legacy behaviour.
  - Any other client gets nothing.
- **Replies:** `ping` gets `{}` (the base protocol requires both sides to answer it, and some clients drop a server that errors). `initialize` echoes the client's `protocolVersion` and declares `capabilities.tools.listChanged: true`. A reply to a request whose `params._meta` carries `io.modelcontextprotocol/protocolVersion` includes `"resultType": "complete"`. A call to a tool that isn't in the current set returns a result with `isError: true` and the text `spike_beta is not offered now`, so the model sees it and the log records it. An unknown method with an id gets JSON-RPC error `-32601`.
- **Log format.** `<spike_dir>/log.jsonl` holds one object per line, appended and flushed per line. Every line carries `t` (UTC, RFC 3339, milliseconds), `pid` and `ev`:

  | `ev` | Extra fields |
  |---|---|
  | `start` | `set` (written before stdin is read) |
  | `recv` | `method`, `id` (`null` for a notification); `protocol` from `initialize` params or from `_meta`; `client` (`"<name> <version>"`) when given; `tools_list_changed` (bool) on `subscriptions/listen`; `tool` and `offered` (bool) on `tools/call` |
  | `reply` | `id`; `tools` (names) on a `tools/list` reply |
  | `send` | `method`; `sub` (the subscription id, or `null`) |
  | `flip` | `to` (`"A"` or `"B"`) |
  | `eof` | none |

- **Where things live:** the spike and its test go in `docs/spikes/list-changed/` (tracked; `docs/v5-animate-icons/mark.py` is precedent for a script under `docs/`). Committed logs go in `docs/spikes/list-changed/runs/`. During a run, the log lives in `/tmp/hanger-spike/<run>/`. Results go in `docs/plans/2026-11-24-context-control-engine-matrix.md` → "When a change applies", the section that `SWITCHES`' evidence already cites, replacing "— not observed".
- **The `applies` vocabulary is closed:** the strings `next_turn`, `after_reload` or `next_session`, written into P2's `EngineContext.applies: Option<String>` (ruling R4). No new Rust type is added. An engine's code is the slower of its off and on directions. A result outside these three stops Task 6 for Karthik. An engine with no conclusive run keeps `None` (ruling 19 of `2026-11-24-context-control.md`: no line until observed).
- **Q12's bar for Claude Code ruled in round 44 Q2 (the recommended option).** Provisional default (the recommended option): Claude Code's **default** mode decides whether it passes (d); the other mode is run and recorded but doesn't decide. If Karthik picks "both modes", Claude Code passes only if it passes in both. "Inconclusive" never counts as a pass. If Claude Code passes and none of the other three does, stop and ask Karthik whether to run Zed, Cursor, OpenCode or VS Code before recording "not met".
- **No version gating.** `applies` records the version it was observed on in a code comment, the way `SwitchRow::confirmed` does. Gating on T19's `ENGINE_CLIS` versions is out of scope.

## Cross-plan interfaces

Every name here matches its owner's plan; the full table is `docs/plans/research/2026-11-28-cross-plan-interfaces.md`.

- **P2 (slice 2) owns `mcp::switch::context` and the field** (ruling R4). `EngineContext.applies` stays `Option<String>`, serialised as `"applies"`. P2's Task 1 builds every `EngineContext` through one private constructor in `context.rs` that takes `applies: Option<String>` as a parameter: `engine_context` (machine contexts) passes this plan's code, and `engine_context_in` (project contexts) passes `None` until a run observes per-project timing ("no line until observed"). This plan only fills the machine value. **Task 8 waits for P2's Task 1 to merge into `main`** (the constructor and `engine_context_in`).
- **P2 owns `src/types/engineContext.ts`.** This plan doesn't change `EngineContext.applies: string | null` there; the code union lives in this plan's `switchCopy.ts` (Task 9).
- **P2 owns `registry::SWITCHES`** (read only here): the run set is its host ids at run time. If P2 has added `PROJECT_SWITCHES` rows by then, runs still use the tiers listed under "Run protocol".
- **P2 owns `ops::set_enabled_for` and `undo_for`**, called unchanged by Task 1b's harness.
- **P7 (T19) owns the overview card** (`OverviewCard`, `OverviewHost`, the engine section's Status rows), and the **combined layout round** (`docs/plans/2026-11-28-card-layout-round.md`) decides where the applies line sits. **Task 10 waits for both.** P7's `EngineStatus.version` is available to version-gate the line; this plan doesn't use it (no version gating).
- **The batched naming round (design §7):** Task 7's strings join it if it is still open. Otherwise they get their own brief.

## Review Focus

1. **One engine spawns the spike more than once.** `claude mcp list` health-checks, reconnects and parallel sessions all append to one log. Every line carries `pid`, and each finding is read per pid of the session's process. Task 1's test asserts `pid` on every line.
2. **The model's words disagree with the log.** A model can say "NO SUCH TOOL" while the log shows a `tools/call`, or it can refuse to call at all. The log wins. A disagreement makes the result *inconclusive*, never a pass (Run protocol step 7).
3. **The engine stops the spike writing its log** (a sandbox, the working directory). A missing `start` line voids the run; it doesn't mean "the engine never called". Task 1's test asserts that line 1 is `start` and is written before any input.
4. **A run leaves something in Karthik's config or store:** a Claude Code stash entry, a `spike` key in Gemini's enablement file, an Antigravity `disabled` flag, or a `spike` `tool` row in the store (a scan while `spike` was registered; reaping is off, so it never goes). Each run ends with the engine's `mcp list` showing no `spike`, identical per-kind counts (Hanger stayed quit, so no scan ran), and any leftover listed for Karthik to rule on, never hand-edited.
5. **A 2026-07-28 client sends no `initialize`, or sends a method the spike doesn't know.** It gets `-32601`, which is logged (Task 1's `test_unknown_method_is_logged_and_refused`). If the engine then fails to load the spike, the run is void, and Task 1 reopens to answer that method.

---

### Task 1: The spike server and its self-test

**Files:**
- Create: `docs/spikes/list-changed/spike.py`
- Create: `docs/spikes/list-changed/test_spike.py`

**Interfaces:**
- Produces: `python3 docs/spikes/list-changed/spike.py <spike_dir>`, a stdio MCP server, newline-delimited JSON-RPC. It reads the target set (`A` or `B`) from `<spike_dir>/flip` at start and on each mtime change, and writes `<spike_dir>/log.jsonl` in the format given under "Decisions". It is single-threaded: `select.select([stdin], [], [], 0.5)` both waits for input and paces the 500 ms mtime poll.

- [ ] **Step 1: Capture the per-kind baseline** with the Global Constraints command. Save the output as the first block of the evidence file, `/tmp/hanger-spike/counts.txt`, and paste it into the task report too: `/tmp` is not kept, and Task 11 compares against it.

- [ ] **Step 2: Write the failing tests** in `test_spike.py` (`unittest`). Each test starts `spike.py` with `subprocess.Popen` and a fresh `tempfile.TemporaryDirectory()`, and reads stdout line by line with a 2 s deadline per expected line.
  - `test_legacy_client_sees_add_then_remove`:
    - `initialize` with `protocolVersion: "2025-06-18"` and `clientInfo {name: "t", version: "1"}` → the result's `protocolVersion == "2025-06-18"` and `capabilities.tools.listChanged is True`.
    - `tools/list` → names `["spike_alpha"]`.
    - write `B` to `flip` → a line `{"jsonrpc":"2.0","method":"notifications/tools/list_changed"}` with no `params._meta`, then `tools/list` → `["spike_alpha","spike_beta"]`.
    - write `A` to `flip` → one more notification, then `tools/list` → `["spike_alpha"]`.
    - `tools/call spike_beta` → `result.isError is True`, and the text is `spike_beta is not offered now`.
    - The log's `flip.to` values are `["B","A"]`. Its `recv` for `tools/call` has `tool == "spike_beta"` and `offered is False`. Its `recv initialize` has `protocol == "2025-06-18"` and `client == "t 1"`.
  - `test_listen_stream_gets_acknowledged_then_notified`:
    - A request with `params._meta["io.modelcontextprotocol/protocolVersion"] == "2026-07-28"`, `subscriptions/listen` with id `7` and `notifications.toolsListChanged: true` → `notifications/subscriptions/acknowledged` with `_meta` subscriptionId `7` and `notifications == {"toolsListChanged": True}`.
    - write `B` to `flip` → exactly one `notifications/tools/list_changed`, carrying subscriptionId `7`, within 2 s.
    - A `tools/list` with that `_meta` → its reply has `resultType == "complete"`.
  - `test_new_revision_client_without_listen_gets_no_notification`: requests carry the 2026-07-28 `_meta`, with no `initialize` and no listen. Write `B` to `flip`, then nothing arrives on stdout for 1.5 s.
  - `test_a_process_started_after_a_flip_serves_the_flipped_set`: write `B` to `flip`, then start the spike: line 1 is `start` with `set == "B"`, and `tools/list` → `["spike_alpha","spike_beta"]`.
  - `test_ping_is_answered`: `{"id": 3, "method": "ping"}` → `result == {}`.
  - `test_log_holds_no_payload`: `tools/call spike_alpha` with `arguments {"note": "hunter2-sentinel"}` → the reply text is `alpha ok`. The log file contains no `hunter2-sentinel`. Line 1 is `ev == "start"` with `set == "A"`, and every line has an `int` `pid`.
  - `test_unknown_method_is_logged_and_refused`: `{"id": 9, "method": "foo/bar"}` → `error.code == -32601`, and the log has `recv` with `method == "foo/bar"`. Closing stdin → the last line is `ev == "eof"`, and the process exits 0.

- [ ] **Step 3: Run the tests and watch them fail.**
  Run: `cd /Users/karthik/Work/Labs/hanger-ai && python3 -I -m unittest discover -s docs/spikes/list-changed -v`
  Expected: `Ran 7 tests`, none `OK`: each fails or errors (an empty-stdout timeout, or `python3` exiting non-zero on the missing script), because `spike.py` doesn't exist.

- [ ] **Step 4: Implement `spike.py`** to the decisions above, stdlib only. The module docstring holds the log table and the routing rules, citing the two spec pages. Tool replies are `alpha ok` and `beta ok`. Each tool's `inputSchema` is `{"type": "object", "additionalProperties": false}`.

- [ ] **Step 5: Run the tests and watch them pass.** Same command. Expected: `Ran 7 tests` … `OK`.

- [ ] **Step 6: Prove the payload test can fail.** Add `params` to every `recv` line, rerun, and expect `test_log_holds_no_payload` to FAIL on `hunter2-sentinel`. Then revert by inverse edit (never `git checkout --`), rerun, and expect `OK`. Paste both outputs into the task report.

- [ ] **Step 7: Gitleaks**, both pinned commands, from the repo root. Expected: `no leaks found` from each.

- [ ] **Step 8: Commit** (its own call).
  ```bash
  git add docs/spikes/list-changed/spike.py docs/spikes/list-changed/test_spike.py
  git commit -m "feat(spike): a stdio server that flips its tool list and logs only methods" -- docs/spikes/list-changed/spike.py docs/spikes/list-changed/test_spike.py
  ```

### Task 1b: The switch harness, Hanger's write with Hanger quit (round 44 Q1's provisional default)

Protocol step 8 needs Hanger's own switch mid-session, and round 44 Q1's recommended option keeps every Hanger app quit during a run. The harness makes the same write through the same code, `ops::set_enabled_for` and `undo_for`, with no app and so no scan. If Karthik picks "keep Hanger running" in Q1, the harness is skipped and step 8 uses the dev app as first written.

**Files:**
- Create: `src-tauri/tests/spike_switch_live.rs`, every test `#[ignore]`, run only by hand.
- Modify: `README.md` (the `tests` region, regenerated).

**Interfaces:**
- Consumes: P2's `ops::set_enabled_for`, `undo_for`, `context_for`, `SwitchPlaces`, and `lib.rs`'s CLI lookup pattern for `claude`, all unchanged.
- Produces: `cargo test --test spike_switch_live switch_spike -- --ignored`, reading `SPIKE_ENGINE` (`claude-code`, `codex`, `gemini` or `antigravity`), `SPIKE_ENABLED` (`true`/`false`) and `SPIKE_DIR` from the environment. `SwitchPlaces` has the real `HOME` and `system: "/"`, and `backups` and `stash` under `$SPIKE_DIR/hanger`, so Hanger's own folders are untouched. It finds the `spike` item in `context_for(engine)` by name, switches it, and prints the receipt id. `undo_spike` takes `SPIKE_RECEIPT` and undoes it. It never prints a config value.

- [ ] **Step 1: Write it** and run it once against a throwaway `HOME` with a Codex `config.toml` declaring `spike` (`HOME=<tmp> SPIKE_ENGINE=codex SPIKE_ENABLED=false …`): the file gains `enabled = false`, `undo_spike` restores its bytes. Paste both outputs.
- [ ] **Step 2: Regenerate the README** (`~/.bun/bin/bun run src/__tests__/readmeCounts.ts`) and run `npx vitest run src/__tests__/readme-sync.test.ts` from the repo root.
- [ ] **Step 3: Commit** (its own call): `git add src-tauri/tests/spike_switch_live.rs`, then `git commit -m "test(spike): switch the spike server with Hanger's own code and no app" -- src-tauri/tests/spike_switch_live.rs README.md`.

### Run protocol (Tasks 2 to 5 follow it; written once here)

Per engine (and per mode for Claude Code), with `RUN=<engine>-<version>[-<mode>]`, `D=/tmp/hanger-spike/$RUN`, `PY=$(command -v python3)` as an absolute path, `S=/Users/karthik/Work/Labs/hanger-ai/docs/spikes/list-changed/spike.py`, and an empty session folder `W=/tmp/hanger-spike/session-$RUN`:

| Engine | Add (the tier its `SWITCHES` row covers) | Remove | Reload command to try (confirm in the engine's own `/help` first; record what was used) |
|---|---|---|---|
| Claude Code | `claude mcp add -s user spike -- $PY $S $D` | `claude mcp remove -s user spike` | `/mcp`, then reconnect `spike` |
| Codex | `codex mcp add spike -- $PY $S $D` | `codex mcp remove spike` | none documented: record "none" |
| Gemini CLI | `gemini mcp add -s user spike $PY $S $D` | `gemini mcp remove -s user spike` | `/mcp refresh` |
| Antigravity CLI | `agy mcp add spike $PY $S $D` | `agy mcp remove spike` | the settings "Refresh" the research names |

1. **Go-ahead (stops for Karthik).** Ask in Plannotator: "Run the `list_changed` spike on <engine> <version> now? It adds a `spike` server at <tier>, switches it with Hanger's switch code, and removes it. Hanger (release and dev) must stay quit until it's removed." Record his answer verbatim in the run notes. With no yes, nothing below happens.
2. Confirm no Hanger is running: `pgrep -f "target/debug/tauri-app"` and `pgrep -x "Hanger AI"` print nothing (round 44 Q1). Take the per-kind counts and append them to `/tmp/hanger-spike/counts.txt` under `$RUN before`, and paste them into the run notes.
3. `mkdir -p $D $W` and write `A` to `$D/flip`. Add the server. `<cli> mcp list | grep -E '^spike'` shows it, and that line is the artefact.
4. Start an interactive session in `$W`. Prompt: "List the spike server's tools by exact name, then call spike_alpha." The log needs a `start`, a `tools/list` reply and `tools/call` `spike_alpha` from the session's pid. Note **(a)** from the `protocol` field.
5. **Added:** write `B` to `$D/flip`, wait 5 s. **(b)** Did a `recv tools/list` follow the `send` within 5 s? Prompt: "Call spike_beta now. If you have no tool by that name, reply exactly NO SUCH TOOL." **(c)** passes if the log shows `tools/call` `spike_beta` with `offered: true`.
6. **Removed:** write `A` to `$D/flip`, wait 5 s, and send the same prompt. **(d)** passes if the log shows no `tools/call spike_beta` after this `flip` *and* the reply is NO SUCH TOOL. It fails if the log shows the call with `offered: false`.
7. Any disagreement between the reply and the log, or a refusal, means sending the prompt once more. If it still disagrees, the result is **inconclusive**.
8. **(e) A Hanger write, mid-session:**
   - Switch `spike` off with Task 1b's harness (`SPIKE_ENGINE=<engine> SPIKE_ENABLED=false SPIKE_DIR=$D cargo test --test spike_switch_live switch_spike -- --ignored`), keeping the receipt id it prints. `<cli> mcp list | grep -E '^spike'` must show it off or gone. Prompt: "Call spike_alpha now. If you have no tool by that name, reply exactly NO SUCH TOOL."
   - Still called → run the engine's reload command and ask again.
   - Still called → quit, start a new session in `$W`, and ask again.
   - Record *off* as `next_turn`, `after_reload` or `next_session`.
   - Then switch it back on (`undo_spike` with that receipt) and run the same three steps from that session. Record *on*.
9. Quit, switch `spike` on if it is off, and remove it. `<cli> mcp list | grep -cE '^spike'` prints `0`. Hanger stays quit: no Rescan. Append the counts under `$RUN after` and paste them into the run notes. They must equal `$RUN before` for every row. A difference is a blocker to report.
10. List any leftover that names `spike` (a Claude stash record under `$D/hanger/stash`, the key in Gemini's `mcp-server-enablement.json`, the Antigravity entry), found with `grep -c spike` on each file, never by printing the file. Copy `$D/log.jsonl` to `docs/spikes/list-changed/runs/$RUN.jsonl`. Fill one row of the run table in the task report: (a), (b), (c), (d), *off*, *on*, leftovers.

### Task 2: Live run, Claude Code (two modes)

**Files:** Create `docs/spikes/list-changed/runs/claude-code-<version>-search-on.jsonl` and `docs/spikes/list-changed/runs/claude-code-<version>-search-off.jsonl`.

**Interfaces:** Consumes Task 1's `spike.py`.

- [ ] **Step 1: Find the tool-search switch.** Read Claude Code's own docs (`https://code.claude.com/docs/en/mcp`, "tool search") for the setting that turns tool search on and off, and which mode is the default, and cite both in the run notes. If no such setting exists, run once and record "tool search: not switchable". Under round 44 Q2's provisional default only the default mode's run decides Q12; the other is recorded.
- [ ] **Step 2: Run the protocol with tool search on.** STOP for Karthik's go-ahead at protocol step 1.
- [ ] **Step 3: Run the protocol with tool search off.** STOP for Karthik's go-ahead at protocol step 1.
- [ ] **Step 4: Gitleaks**, both commands. Expected: `no leaks found`.
- [ ] **Step 5: Commit the two logs** with `git add`, then `git commit -m "docs(spike): Claude Code list_changed runs" -- <the two paths>`, in its own call.

### Task 3: Live run, Codex

**Files:** Create `docs/spikes/list-changed/runs/codex-<version>.jsonl`.

- [ ] **Step 1: Run the protocol.** STOP for Karthik's go-ahead at protocol step 1. #37417 suggests `refresh_mcp_if_dirty` might make (e) `next_turn`; the run decides.
- [ ] **Step 2: Gitleaks**, then commit the log by explicit path, as in Task 2.

### Task 4: Live run, Gemini CLI

**Files:** Create `docs/spikes/list-changed/runs/gemini-<version>.jsonl`.

- [ ] **Step 1: Run the protocol.** STOP for Karthik's go-ahead at protocol step 1. Hanger's switch here writes `~/.gemini/mcp-server-enablement.json`, not `settings.json`.
- [ ] **Step 2: Gitleaks**, then commit the log by explicit path.

### Task 5: Live run, Antigravity CLI

**Files:** Create `docs/spikes/list-changed/runs/antigravity-<version>.jsonl`.

- [ ] **Step 1: Run the protocol.** STOP for Karthik's go-ahead at protocol step 1.
- [ ] **Step 2: Gitleaks**, then commit the log by explicit path.

### Task 6: Record the results and the Q12 verdict

**Files:**
- Modify: `docs/plans/2026-11-24-context-control-engine-matrix.md`. Its section "When a change applies — not observed" becomes "When a change applies — observed <date>", and its "What this changes in the plan" item 3 is updated to match.

**Interfaces:**
- Produces: the results table, one row per run, with columns *engine, version, mode, protocol (a), notify→list (b), added (c), removed (d), off, on, applies, log file*. It also produces the per-engine `applies` code, which is the slower of *off* and *on*, or `None` when inconclusive. Tasks 8 and 9 copy these values verbatim.

- [ ] **Step 1: Fill the table** from the four tasks' run rows. Every cell cites its log file and the `t` of the line that decides it.
- [ ] **Step 2: Write the Q12 verdict** under the table, by the rule in "Decisions" (Claude Code's default mode decides, unless round 44 Q2 was answered "both modes"): **met** or **not met**, naming the engines that passed (d), and which round 44 Q2 answer the verdict used.
  - If Claude Code passed and no other engine did, STOP. Ask Karthik in Plannotator whether to run Zed, Cursor, OpenCode or VS Code first. Each extra run follows the protocol as its own task, appended to this plan.
  - A code outside the closed vocabulary also STOPS here, for Karthik.
- [ ] **Step 3: Commit** the matrix file by explicit path: `docs(matrix): when a change applies, observed per engine`.

### Task 7: Naming brief for the applies lines (stops for Karthik)

**Files:**
- Create: `docs/plans/2026-11-28-slice6-applies-naming-brief.md`, or a section in the batched round's brief if that round is still open.

- [ ] **Step 1: Write the brief.** It needs one line per observed code, for the overview card's engine row, with `{engine}` from the backend. Research how Cursor, VS Code, Zed and Claude Code word "takes effect" or "restart to apply" in their own UI, and cite each source. Each line must be literally true of Task 6's table: if Codex is `next_session`, its line can't say "now". Skip a code no engine observed.
- [ ] **Step 2: `/humanizer` pass** on every line, with before and after shown in the brief.
- [ ] **Step 3: STOP for Karthik's sign-off.** Record his ruled strings verbatim in the brief. His wording is direction, not the string (`ui-copy.md`), so the final line goes back to him if it changed.
- [ ] **Step 4: Commit** the brief by explicit path.

### Task 8: The applies code in `EngineContext` (waits on P2's Task 1)

**Files:**
- Modify: `src-tauri/src/mcp/switch/context.rs` (one private function and the value `engine_context` passes to P2's constructor; tell P2 on `SendMessage` before editing, since P2 owns the module)
- Modify: `src-tauri/tests/mcp_switch_tests.rs`, where `no_engine_says_when_a_change_applies_yet` is replaced
- Modify: `docs/ipc.md`, the `applies` bullet and the example's `"applies"` value

**Interfaces** (ruling R4):
- Consumes: P2's merged `context.rs`, with `EngineContext.applies: Option<String>` and the private constructor that takes `applies` as a parameter (see Cross-plan interfaces).
- Produces, in `crate::mcp::switch::context`, a private `fn applies_for(host_id: &str) -> Option<String>`: a `match` over the engines with a conclusive code, each arm returning one of `"next_turn"`, `"after_reload"` or `"next_session"` and carrying a comment with "`<cli> <version>`, `<date>`, engine matrix → When a change applies". `_ => None`. `engine_context` passes `applies_for(host_id)`; `engine_context_in` keeps passing `None`. No new type, and the field's type doesn't change.

**Skip rule:** if Task 6 gave every engine `None`, skip Tasks 8 to 10 and say so in Task 11.

- [ ] **Step 0:** Confirm P2's Task 1 is on `main`: `grep -n "pub fn engine_context_in" src-tauri/src/mcp/switch/context.rs` prints a line and the constructor takes `applies`. If not, stop: this task waits.
- [ ] **Step 1: Write the failing test.** Replace `no_engine_says_when_a_change_applies_yet` with `each_engine_says_when_a_change_applies_as_observed`, on the same fixture machine. Build `expected: &[(&str, serde_json::Value)]` from Task 6's table, for example `("claude-code", json!("<code>"))`, one per run engine. For every `host` in `registry::HOSTS`, assert `serde_json::to_value(&context.applies).unwrap()` equals the expected value, or `Value::Null` for a host not in the table. Assert every non-null value is one of the three codes. Then assert three hosts that are never run, `"cursor"`, `"zed"` and `"claude-ai"`, serialise `applies` as `Null`, and that a project context (`ops::context_in`) for a run engine serialises `Null` too.
- [ ] **Step 2: Run it and watch it fail.** From `src-tauri/`: `cargo test --test mcp_switch_tests each_engine_says_when_a_change_applies_as_observed`. Expected: `assertion \`left == right\` failed: claude-code`, with `left: Null` and `right: String("<code>")` (or the first run engine's code).
- [ ] **Step 3: Implement** `applies_for` and pass it to the constructor from `engine_context`. Replace the field's doc comment ("`None` for every engine") with one citing the matrix section and saying project contexts stay `None`. Update `docs/ipc.md` in the same commit.
- [ ] **Step 4: Run it and watch it pass.** Same command. Then run the full `cargo test` and confirm the field-set test, which asserts the `keys_of` list, is unchanged and green.
- [ ] **Step 5: Gates:** `cargo test`, `npx vitest run`, `bunx tsc --noEmit` and both gitleaks commands, each in its own call with an explicit `cd`.
- [ ] **Step 6: Commit** `src-tauri/src/mcp/switch/context.rs`, `src-tauri/tests/mcp_switch_tests.rs` and `docs/ipc.md` by explicit path: `feat(context): each engine says when a switch applies, as observed`. The body names the replaced test and why: it pinned ruling 19's "until observed", and Task 6 is that observation.

### Task 9: The copy

**Files:**
- Modify: `src/utils/switchCopy.ts`
- Test: `src/utils/switchCopy.test.ts`

`src/types/engineContext.ts` is P2's and is not touched: `EngineContext.applies` stays `string | null` there (ruling R4).

**Interfaces:**
- Consumes: Task 8's codes and Task 7's ruled strings.
- Produces, in `switchCopy.ts`:
  - `export type AppliesCode = <the observed codes, as a union of string literals>`.
  - `export function appliesLine(code: string | null, engine: string): string | null`, backed by `const APPLIES_LINES: Record<AppliesCode, (engine: string) => string>`. It is exhaustive over `AppliesCode`, like `READ_ONLY_LINES`. It narrows at the boundary: `null`, or a string that isn't an `AppliesCode`, gives `null`, so a code Rust adds before the copy has a line shows nothing rather than a wrong line.

- [ ] **Step 1: Write the failing test.** `appliesLine(null, "Codex")` → `null`. `appliesLine("someday", "Codex")` → `null`. For each code, `appliesLine("<code>", "Codex")` equals Task 7's ruled string with `Codex` substituted, verbatim.
- [ ] **Step 2: Run it and watch it fail.** `npx vitest run src/utils/switchCopy.test.ts`. Expected: `TypeError: appliesLine is not a function`. Run the full gate after.
- [ ] **Step 3: Implement** the union, the map and the function. Existing fixtures that pass `applies: null` stay valid.
- [ ] **Step 4: Run it and watch it pass.** Then the gates: `npx vitest run`, `bunx tsc --noEmit` (exit 0) and both gitleaks commands.
- [ ] **Step 5: Commit** the two files by explicit path.

### Task 10: The applies line on the overview card (waits on P7 and the layout round)

**Files:**
- Modify: whichever card component the combined layout round names, expected to be `src/components/OverviewCard.tsx`, and its test `src/components/OverviewCard.test.tsx`.
- Modify: `.claude/DESIGN.md`, the `OverviewCard` paragraph, if the card's shape changes (`coding-guardrails.md` §3).

**Interfaces:** Consumes `appliesLine` (Task 9) and P7's engine section.

- [ ] **Step 0: STOP for the combined layout round** (design §7: S, W, K, P6, P4b at true width, in real tokens). This task starts only from Karthik's ruled option, recorded with its date.
- [ ] **Step 1: Write the failing test.** Given a context with `applies: "<code>"`, the engine row shows `appliesLine("<code>", engine_name)` exactly. With `applies: null`, no applies text renders (`queryByText` on each ruled string is null).
- [ ] **Step 2: Run it and watch it fail.** `npx vitest run src/components/OverviewCard.test.tsx` fails on the missing text.
- [ ] **Step 3: Implement** at the ruled position, using `typeRoles` and tokens only. Add no figure.
- [ ] **Step 4: Run it and watch it pass,** then run all four gates.
- [ ] **Step 5: Screenshot (stops for Karthik).** Capture the dev app per `verifying-ui.md`: the dev pid, the window at least 900×600, `ps` start newer than the binary, and the theme read from the store and named. Capture one engine with a line and one without. Karthik accepts the frame. Automation doesn't close it.
- [ ] **Step 6: Commit** by explicit path. Stage `src/App.tsx` by hunk if it was touched (`shared-checkout.md`).

### Task 11: The roadmap entry (last)

**Files:**
- Modify: `docs/roadmap.md`, a new section "The gateway shim (slice 6)".

- [ ] **Step 1: Write the entry** by Answer 12.
  - **Bar met:** the shim goes on the roadmap with the result. Name the engines that passed (d), link the matrix table and logs, and carry over the research's open questions 2 to 4 (shape, opt-in, remote servers) and its nine-task size.
  - **Bar not met:** record the bar verbatim, the per-engine (d) results with their logs, and what evidence would reopen it (for example, the Claude Code issue #66084 closing).
  - Either way, say which of Tasks 8 to 10 shipped or were skipped, and why.
- [ ] **Step 2: Final per-kind counts.** Append them to `/tmp/hanger-spike/counts.txt` under `final` and paste them into the task report. Every row must equal the Task 1 baseline pasted in Task 1's report, unless a peer's scan moved it, in which case say so with the timestamps.
- [ ] **Step 3: `stage-gate --dev`** over this plan's own commits, listed by SHA (`git cat-file -t` on each), not over a computed range (`shared-checkout.md`).
- [ ] **Step 4: Commit** `docs/roadmap.md` by explicit path.

## Human gates, and where they sit

| Gate | Where |
|---|---|
| Round 44 Q1 (Hanger quit for each run) and Q2 (which Claude Code mode decides) | Before Task 2; the provisional defaults are built until he answers |
| Karthik's go-ahead per engine run, asked in Plannotator and recorded verbatim | Run protocol step 1, in Tasks 2 (twice), 3, 4 and 5 |
| Each run verified by its artefact: the spike log, the `mcp list` line and per-kind counts, never by an answer | Run protocol steps 3 to 10 |
| Whether to run more engines when only Claude Code passed (d), or when a code falls outside the vocabulary | Task 6 Step 2 |
| Naming brief, `/humanizer` and sign-off for the applies lines | Task 7 Steps 1 to 3 |
| The combined card layout round (owned by P7) | Task 10 Step 0 |
| The screenshot of the applies line, accepted by Karthik | Task 10 Step 5 |

T23 doesn't apply: nothing here renders model output.

## Known limits

- **Per-project timing is not observed.** The runs time the four machine `SWITCHES` mechanisms only; P2's per-project writes (Claude's `disabledMcpServers`, the Codex stub, Gemini `mcp.excluded`) are different writes, so project contexts keep `applies: None`.
- **Task 1b's harness is a second caller of the switch code**, outside the app. It writes the same files with the same code, but backups and stash go under `$D/hanger`, not Hanger's data folder, so Recent changes never lists a spike switch.
- **A 2026-07-28 client may send a method the spike doesn't know**; it gets `-32601` and the run may void (Review Focus 5). The spike answers `ping`, `initialize`, `subscriptions/listen`, `tools/list` and `tools/call` only.
