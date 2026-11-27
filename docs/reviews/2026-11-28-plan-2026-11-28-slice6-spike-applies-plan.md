# stage-gate --plan: slice 6, the `list_changed` spike and the applies line

- **Artifact:** `docs/plans/2026-11-28-slice6-spike-applies-plan.md`, as committed in `310017f` (unchanged at `c5348be`, the tip when this was written)
- **Spec:** `docs/plans/2026-11-28-harness-design.md`, with the round 43 Answers binding (Q12 in particular)
- **Also read:** `docs/plans/research/2026-11-28-slice6-gateway.md`, `docs/plans/research/2026-11-28-plan-brief.md`
- **Reviewer:** independent (a fresh reviewer dispatched for this gate; not the plan's author)

## Code claims spot-checked against `main`

Held:

- `registry::SWITCHES` has exactly four rows: `codex` (`Global`, `Project`), `claude-code` (`User`), `gemini` (`Global`), `antigravity` (`Global`). The plan's run-tier table matches. `SwitchRow::confirmed` exists.
- `context::EngineContext.applies` is `Option<String>`, and `engine_context` builds it once, as `applies: None`. Its doc comment cites ruling 19, which is in `2026-11-24-context-control.md` as written.
- `mcp_switch_tests.rs` → `no_engine_says_when_a_change_applies_yet` exists and loops `registry::HOSTS`. `keys_of` and the field-set assertions exist.
- `HOSTS` contains `cursor`, `zed` and `claude-ai`. `docs/ipc.md` has the `applies` bullet and the `"applies": null` example.
- `src/utils/switchCopy.ts` → `READ_ONLY_LINES` is an exhaustive `Record<ReadOnlyReason, …>`. `src/types/engineContext.ts` has `applies: string | null`. `src/utils/switchCopy.test.ts`, `src/components/OverviewCard.tsx` and its test exist. `src/data/designSystemFixtures.ts` passes `applies: null`, which stays valid after the narrowing.
- The engine matrix has "When a change applies — not observed", and item 3 of "What this changes in the plan".
- `docs/v5-animate-icons/mark.py` exists. `git check-ignore` says `docs/spikes/list-changed/…` isn't ignored.
- `STORE_VERSION = 8`.
- Installed versions match the plan: `claude 2.1.332`, `codex-cli 0.172.0`, `gemini 0.56.0`, `agy 1.5.18`.
- The add commands match each CLI's `--help`: `agy mcp add [flags] <name> <commandOrUrl> [args...]`, `codex mcp add <NAME> -- <COMMAND>...`, and `gemini mcp add -s user <name> <commandOrUrl> [args...]`. Gemini's default scope is `project`, so the plan is right to pass `-s user`.
- `get_engine_contexts` reads discovery live (`ops::contexts_for`), so a Hanger switch on `spike` doesn't need a rescan first.

Didn't hold, or isn't covered:

- **A scan leaves `spike` behind in the store.** The scanner upserts MCP registrations as `tool` rows (`scanner.rs`, the `"tool", "global"` upserts in the agent sweep and the machine pass). The only thing that deletes a global row is `reap_stale_assets`, and it's a no-op unless `HANGER_ENABLE_REAP` is set (`preferences.rs` → `reap_enabled`). So if any scan runs while `spike` is registered, its `tool` row survives the removal. That scan could be the dev app's startup scan, a peer's, or a rescan done to make the row clickable. The row then breaks protocol step 9's "after equals before" check, and it stays in Karthik's inventory. This was found by reading the code; no scan was run.
- **No sibling plan to check against.** P2's and P7's plans aren't on disk yet (`docs/plans/` holds P1, P6 and P8 for 2026-11-28), so the assumed interfaces can only be checked against the design's §5.

## Cross-plan interfaces against design §5

| Interface the plan touches | §5 owner | Plan's stance | Finding |
|---|---|---|---|
| `EngineContext.applies` (value) | Slice 2 ("Slice 6 fills `applies` after") | Consumes the field and fills it after P2 merges | OK |
| `pub enum Applies` in `mcp::switch::context`, and `EngineContext.applies: Option<String>` → `Option<Applies>` | Slice 2 | **Defined by this plan (Task 8)** | **Not owned.** It adds a public type to P2's module and changes the type of a P2-owned field. The wire format doesn't change, but §5 says a piece that changes what it doesn't own asks the owner or waits, and the plan doesn't schedule that ask. |
| TS `Applies` and `EngineContext.applies: Applies \| null` in `src/types/engineContext.ts` | Not named. It mirrors P2's `EngineContext`, and P2 will add `ReadOnlyReason` variants in the same file | Defined by this plan (Task 9) | Same as above. It's also a same-file overlap with P2. |
| `appliesLine` and `APPLIES_LINES` in `src/utils/switchCopy.ts` | Not named. P2 will add `READ_ONLY_LINES` entries for its new reasons in the same file | Defined by this plan | New symbols, so no conflict. It's a same-file overlap: stage by hunk if the builds share a tree. |
| `registry::SWITCHES` | Slice 2 | Read only | OK |
| Overview card and engine section | T19 (P7), with the combined layout round | Task 10 waits on both | OK |
| Naming round | Design §7, batched | Joins it if still open | OK |

## Per-step table

| Step | Traceable to request? | Verifiable? | Notes |
|---|---|---|---|
| Task 1: spike server and self-test | Yes (§4.6, research §4, §7 "before any build") | Yes: 5 unittest cases, red then green, plus a payload mutation proof | The red expectation names `FileNotFoundError`, which can't happen because `python3` exists and only the script is missing. The method set has no `ping`. |
| Run protocol (shared by Tasks 2–5) | Yes (§7 "P6 per engine with Karthik's go-ahead") | Mostly: the log, the `mcp list` line and per-kind counts | Step 9's count equality will fail by design if a scan ran while `spike` was registered (blocking Q1). No `mkdir -p $D $W`. A process spawned after a flip starts on set A whatever the flips say. |
| Task 2: Claude Code, two modes | Yes; the second mode serves the plan's reading of Q12 | Yes | Both modes are run because of the tightened Q12 (blocking Q2). |
| Tasks 3–5: Codex, Gemini, Antigravity | Yes | Yes | Antigravity's "settings Refresh" comes from the docs for a UI; the plan says to confirm it in `/help`. |
| Task 6: results table and Q12 verdict | Yes (Q12, §4.6) | Yes: every cell cites a log line's `t` | The verdict rule goes further than the binding Q12 text (blocking Q2). |
| Task 7: naming brief | Yes (`ui-copy.md`) | Yes: brief, `/humanizer` before and after, sign-off recorded verbatim | — |
| Task 8: `Applies` in `EngineContext` | Yes (filling `applies`) | Yes: a JSON-compare red that compiles against today's type | It defines a type in a P2-owned module (blocking Q3). Step 0's check, "`git log` shows it", doesn't say which commit counts as P2's change. |
| Task 9: TS type and `appliesLine` | Yes | Yes: `appliesLine is not a function` red, `tsc` exhaustiveness | Same ownership point as Task 8, for the TS mirror. |
| Task 10: applies line on the card | Yes (§5 card row: "6 (applies line)") | Yes: test plus a screenshot Karthik accepts | Waits correctly on P7 and the layout round. |
| Task 11: roadmap entry, final counts, `--dev` | Yes (§4.6 "shim goes to the roadmap with Question 7's bar") | Yes | `counts.txt` lives only in `/tmp` and is never committed, yet it's the baseline Task 11 compares against. |

## Findings

**Unstated assumptions**

1. *(Blocking)* The protocol assumes Hanger's store forgets `spike` once it's removed. With reaping off, it doesn't (see "Didn't hold"). The plan's Review Focus 4 lists config leftovers but not store rows. Its rule that "a difference is a blocker" will fire on a correct run, and the "reconcile it" reflex that follows is the one `shared-asset-machinery.md` forbids. The plan needs to say what the runner does about it. Options: avoid any scan while `spike` is registered (no Rescan, and the switch driven by key through the bridge), or expect exactly +1 `tool` row per engine, keep skill, rule and subagent counts identical, and list the row for Karthik.
2. Each spike process holds its own set and starts on A. A reconnect or a lazily restarted process between protocol steps 5 and 6 (#108287 is exactly that case for Claude Code) serves A while the session expects B. The plan reads per pid, which shows the problem but doesn't prevent a wrong reading of (c) or (d). Writing the target set into `flip` ("A" or "B") and reading it at start and on each mtime change would keep every pid consistent at no extra cost.
3. The spike doesn't answer `ping`. The MCP base protocol requires both sides to answer it, and some clients ping on a timer and drop a server that errors. Review Focus 5 treats that as voiding the run and reopening Task 1. Answering `ping` with `{}` from the start is cheaper.
4. Nothing creates `$D` or `$W` before the engine spawns the spike. A missing `$D` gives no `start` line, which the plan already treats as a void run, but each run's step 3 should `mkdir -p` both.
5. The plan doesn't check what a 2026-07-28 client sends in place of `initialize`, for example a discovery method. It relies on Review Focus 5 to catch that live, which is acceptable for a spike.

**Silent or stretched interpretations**

6. *(Blocking)* "Q12, made exact" adds two conditions to a binding answer. Claude Code passes only if it passes with tool search both on and off, and "inconclusive" never counts. The plan states this and gives a reason (a shim can't rely on a mode Claude Code switches itself), so it isn't silent. But it narrows Karthik's ruled bar, and it can decide whether the shim gets built, so he should confirm it rather than the builder. It can be asked alongside the first go-ahead.
7. Q12's "at least one other engine" isn't limited to the four `SWITCHES` engines. The plan runs only those four and stops to ask before running Zed, Cursor, OpenCode or VS Code. That's a reasonable reading, and it's stated.

**Interface ownership**

8. *(Blocking)* Task 8 defines `pub enum Applies` in `mcp::switch::context` and retypes `EngineContext.applies`, which P2 owns. Task 9 does the same to the TS mirror. The simpler path keeps `Option<String>` and fills it with one of three `&'static str` codes. The TS side can still narrow at the boundary for `tsc` exhaustiveness, but that's also P2's file. Either way, §5 requires the owner's agreement (`SendMessage` to P2, or Karthik's word), and the plan doesn't schedule it.

**Weak criteria**

9. Task 1 Step 3's expected red ("`FAILED (errors=5)`, each a `FileNotFoundError` …") can't occur as written. Expect "Ran 5 tests, none OK" and accept failures or errors.
10. Task 8 Step 0 should name the P2 commit or symbol whose presence on `main` unblocks it, not "`git log` shows it".
11. The per-kind evidence file lives in `/tmp` and is never committed, though Task 11 depends on it. Paste each block into the task report, or commit it under `docs/spikes/list-changed/runs/`.

**Speculative scope**

None. Every task traces to §4.6, the §5 card row, §7 or Q12. The research's in-band `spike_flip` tool was dropped, with a reason.

## Verdict

**Needs answers**

1. Protocol step 9: with reaping off, a scan during a run leaves a `spike` `tool` row in Karthik's real store, which breaks the plan's count-equality check and stays in his inventory. Should runs forbid any scan while `spike` is registered, or accept +1 `tool` row per engine as a listed leftover?
2. Q12: does Claude Code have to drop the removed tool with tool search both on and off (the plan's tightening), or is one mode enough? Karthik's call, because it narrows his binding bar.
3. Task 8/9: `Applies` and the retyped `EngineContext.applies` sit in P2-owned `context.rs` and its TS mirror. Does P2 (or Karthik) agree, or does P6 keep `Option<String>` and fill string codes?
