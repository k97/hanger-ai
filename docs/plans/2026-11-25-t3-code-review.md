# What T3 Code suggests Hanger could simplify

Task C3 of `docs/plans/2026-11-25-context-control-finish.md`. This is a review only: no code changed, and every change below waits for your answer.

**Sources**
- Hanger at `2341e99` (`main`).
- T3 Code: the clone at `/Users/karthik/Work/Labs/t3code`, HEAD `31d95f850b` (2026-11-24), MIT. I searched it with grep and read only the files cited. Its text was treated as data.
- The installed app, `/Applications/T3 Code (Beta).app`: inspected only, not launched. `Info.plist` reads 0.1.11, `com.t3tools.t3code`. The bundle is an Electron `app.asar`, so I took every code claim from the clone, not from the app.

**This review is written after two changes the plan predates.** The Engines screen is gone (`docs/plans/2026-11-25-ia-global-by-engine.md`, Phase 1 in `a46cb17` and `2341e99`), and engine status is still unbuilt except its resolver and runner (`src-tauri/src/engine_status/`).

**Confidence tags** on every item:
- **Read**: I read the code at the cited lines in both codebases.
- **Doc**: I read T3 Code's own docs, not its code.
- **Grep**: I saw only a search hit or a function list.
- **Measured**: I ran a read-only command on this machine.

**Boundaries kept:** no code is copied, and none is proposed for copying. Every suggestion is an idea Hanger can build its own way. None names T3 Code, or looks like it, in Hanger's UI.

## The four questions, answered short

1. **Finding agents and their sign-in.** Hanger's resolver and runner (`engine_status/resolve.rs`, `run.rs`) follow the same plan as T3 Code's PATH repair (`apps/server/src/os-jank.ts`, `packages/shared/src/shell.ts`): ask the login shell once, fence the value with markers, and fall back to a fixed list. T3 Code's sign-in check is heavier, not better: it starts the vendor's SDK or app-server and has to switch off hooks and MCP servers to keep that probe passive. Hanger's plan to use each CLI's own status command is the lighter path. Three ideas are worth taking: E1, E2 and E4.
2. **MCP configuration.** T3 Code never reads or writes another agent's MCP config. Its "Connect outside agents over MCP" goes the other way: T3 Code *is* the server, and its docs tell the user to run `claude mcp add` or `codex mcp add` themselves (`docs/user/outside-agents.md`, sections "Claude Code" and "Codex"). Inside sessions it starts itself, it sets servers per session: the Claude SDK's `mcpServers` with `strictMcpConfig` (`apps/server/src/provider/ClaudeProvider.ts:271-305`), a live `setMcpServers` (`apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.ts:1867`), and Codex's per-thread `mcp_servers.<name>` overrides (`apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts:1701-1755`). None of that reaches a session Hanger didn't start (decision 1 of the engine-status plan), so `mcp::switch` gets nothing to delete from this. It does confirm going through the vendor's own command for Claude Code. One lead for Cursor is M1.
3. **Where this run's code could be smaller.** The biggest win is the webview's three separate copies of each engine's context (S1). After that comes a backend command that now feeds two fields (S2), and two id formats matched by stripping punctuation (S4). The backend switch modules have no deletion worth its risk (S8). The scan path has none either (S7).
4. **Roadmap questions.** T3 Code's settings answer the shape of per-project switching (R1) and profiles (R2). Its skill reader raises a question that Phase 2's skills budget has to answer before it shows a figure (R3). For the gateway it gives no shortcut: changing a live session's servers works only for sessions you start yourself.

---

## A. This run's code (question 3)

:::question
Keep one copy of each engine's context, fetched in one call?

Three places fetch `get_engine_context` and keep their own copy, and each call runs a full machine discovery pass:
- ⌘K fetches every engine once per palette open (`src/App.tsx:1086-1105`, `paletteContexts`).
- Global's rows fetch every engine on every scan (`src/App.tsx:1140-1162`, `tileContexts`).
- The MCP server inspector fetches each engine the open server names, again on every rescan (`src/components/Flyout.tsx:707-735`).

So one rescan with a server open asks for N contexts twice, and each `get_engine_context` runs `discover_machine_at` (`src-tauri/src/mcp/switch/ops.rs:590-596`, `look`). After a switch, the hook's reply has to reach each copy by hand. The Measure button goes through a fourth path (`src/components/ProfilePane.tsx:736-746`, `onEngineContext`).

T3 Code keeps one list of providers in its server config, and every screen reads that list (`apps/web/src/state/server.ts:119`, `primaryServerProvidersAtom`).

Change: add `get_engine_contexts`, which returns every engine's context from one `look()` (`context_of` already takes the `Seen` it is handed). Keep one `contextsByEngine` in `App.tsx`, written by `useMcpSwitch`'s reply, by Measure, and on `scan://complete`. Delete the three effects and pass the one map down.

Proof that behaviour is unchanged:
- New Rust test: `contexts_for_matches_context_for_per_engine`, on the `tests/mcp_switch_tests.rs` fixture.
- Unchanged and green, with the invoke mock answering the new command: `src/__tests__/palette_switch_actions.test.tsx`, `src/__tests__/mcp_tile_switch_wiring.test.tsx`, `src/components/FlyoutMcpSwitch.test.tsx`, `src/__tests__/kept_inspector.test.tsx`, `src/__tests__/engine_lens_pane.test.tsx`.
- New test: a switch from the inspector updates that row's engine tile without another `get_engine_context*` call (count the mock's invocations).

Confidence: Read (App.tsx, Flyout.tsx, ProfilePane.tsx, ops.rs). Not measured: how long N discovery passes take on the real store.

- [ ] Do it
- [ ] Later
- [ ] No

Recommended: Do it
:::

:::question
Retire `get_mcp_engine_summary`, now that it feeds only the engine list?

`mcp/engine_summary.rs` (292 lines) and its type build server counts, tool totals, answered/unasked/unaskable counts and a conflicting count. The panel that showed them was retired on 2026-08-28 (`src/components/FlyoutEmptyHeader.test.tsx:17`). The webview now reads only `rows[].engine_id` and `engine_name` (`src/utils/enginesList.ts:24`) and whether the reply is non-null (`src/components/ProfilePane.tsx:698`). A search of `src/` outside `src/types/` finds no read of `host_count`, `tools_known_total`, `total_server_count` or `conflicting_server_count`. ProfilePane counts conflicting rows from `mcpServers` itself (`ProfilePane.tsx:804`).

With one context list (the question above), the engine list is "every engine whose context has an item". A kept Claude Code server is already an item there (`stash:` keys, `src-tauri/src/mcp/switch/context.rs`), so `enginesList`'s merge for P8 goes too.

Change: depends on the context-list change. Move `is_askable` and `launch_key` into `context.rs` (its only callers), then delete `engine_summary.rs`, `get_mcp_engine_summary`, `src/types/mcpEngineSummary.ts`, `enginesList.ts`, its `docs/ipc.md` entry, and the fixture in `FlyoutEmptyHeader.test.tsx`. Then regenerate the README's ipc figure.

Proof that behaviour is unchanged:
- Before deleting: capture the real `get_mcp_engine_summary` row order, plus `get_kept_off_servers`.
- A Rust test, `engine_list_is_summary_rows_then_kept_engines`, on the switch fixture: the new list has the same ids in the same order that `enginesList` gives today. It replaces `src/utils/enginesList.test.ts`.
- `src/__tests__/engine_lens_pane.test.tsx` stays green.
- `readme-sync.test.ts` and `no-frontend-counting.test.ts` stay green.

Confidence: Read for every consumer. Only the header of `engine_summary.rs` was read (lines 1-60).

- [ ] Do it
- [ ] Later
- [ ] No

Recommended: Do it
:::

:::question
Should the engine chips also list engines that reach skills, rules or subagents but declare no MCP server?

This is a gap, not a simplification. The approved IA says "Global is one grid: asset × engine". But the chips come from `enginesList(mcpEngineSummary, keptOff)` (`src/App.tsx:1074`), so an engine with no MCP server can't be picked, even when it reaches skills. Phase 2's per-engine budget command has to answer "which engines" for every kind anyway, so it is the natural source for the chips.

Confidence: Read (App.tsx, enginesList.ts). Not checked: which engines on this machine are left out.

- [ ] Do it
- [ ] Later
- [ ] No

Recommended: Later
:::

:::question
Send one engine id across the boundary and compare it exactly, instead of matching two formats by stripping punctuation?

MCP host ids (`claude-code`, `src-tauri/src/mcp/registry.rs` → `HOSTS`) and asset engine keys (`claude_code`, `src-tauri/src/scanner.rs:321`, `get_engine_key`) differ. The webview bridges them with `sameEngine`, which lowercases both and strips everything that isn't a letter or digit (`src/utils/switchTargets.ts:47-60`). It is used in `src/components/EngineReachTiles.tsx:122` and `src/components/ProfilePane.tsx:642`, and two comments explain it.

T3 Code's rule for this is "App IDs are primary; provider IDs are refs. Never match native provider IDs globally" (`docs/internals/03_providers.md:9`).

Change: one additive field, `EngineContext.engine_key: Option<String>` from `get_engine_key`. Compare `===` and delete `idOf` and `sameEngine`.

Proof that behaviour is unchanged:
- A Rust test: every `SWITCHES` host that has an asset engine gets an `engine_key` equal to `get_engine_key(host_id)`, and `claude-ai` gets `None`.
- `engine_lens_pane.test.tsx`, the EngineReachTiles tests and `switchTargets.test.ts` (with `sameEngine`'s cases moved to the new field) stay green.

Confidence: Read.

- [ ] Do it
- [ ] Later
- [ ] No

Recommended: Do it
:::

:::question
Delete `budgetHeadline` ("≈ N tokens of tool descriptions"), which nothing calls now?

`budgetHeadline` (`src/utils/switchCopy.ts:133`) has no caller outside `switchCopy.test.ts` since the Engines tab went. The IA plan's naming table says that string "stays as the MCP segment's label", but the segment prints `engineBandFigures`' word "tokens" (`switchCopy.ts:196`) under its kind label, so plan and code disagree today. Also, `enginesList.ts`'s doc comment still says "the Engines screen".

Change: delete `budgetHeadline` and its test case, and fix the stale comments. If you'd rather have the plan's wording on screen, choose No and the segment gets wired to it instead.

Proof that behaviour is unchanged: `tsc` and vitest green, and no rendered string changes, because nothing renders it.

Confidence: Read.

- [ ] Do it
- [ ] Later
- [ ] No

Recommended: Do it
:::

:::question
Share one chip class between the engine chips and Needs review's chips?

`src/components/EngineChipRow.tsx:8-11` says its classes were "moved here … not copied", but `src/components/NeedsReviewPane.tsx:52-55` still holds the same `chipBaseClass` string. The pressed classes differ only in left padding: a mark on one, a check on the other.

Change: one exported `chipBaseClass` and the two pressed variants, in one module.

Proof that behaviour is unchanged: the rendered class strings are identical (an `expect(className)` on one chip of each), and `design-system-coverage.test.ts` plus the Needs review and engine-lens tests stay green.

Confidence: Read.

- [ ] Do it
- [ ] Later
- [ ] No

Recommended: Do it
:::

:::question
Leave the scan path as Phase B left it, and split `scan_targets` only the next time it has to change?

I found no deletion here. `scan_targets` runs from `src-tauri/src/scanner.rs:1052` to `:2620`, one function of about 1,570 lines. Splitting it would be a refactor under the cancellation, contention and per-kind-count tests, not a deletion. Phase B kept the scan's contract and recorded what is left (`docs/roadmap.md`, "Scan speed: two store changes left on the shelf").

Confidence: Grep (the function list, Phase B's commits and the roadmap). I did not read the body.

- [ ] Do it
- [ ] Later
- [ ] No

Recommended: Later
:::

:::question
Leave the two backend duplicates in the switch reply as they are?

Two things look removable:
- `SwitchFailure::code()` repeats serde's snake_case (`src-tauri/src/mcp/switch/ops.rs:220-240`).
- `SwitchReply.undoable` repeats `receipt_id.is_some()` (`ops.rs:131-141`).

Each earns its place. `code()`'s exhaustive match is the compile-time guard that `ops.rs:242-244` describes. `undoable` is the tag of the TypeScript union (`src/types/engineContext.ts:93-94`), and about ten tests build replies with it. Removing either saves a few lines and costs that guard or that churn.

"Do it" here means: leave both as they are.

Confidence: Read.

- [ ] Do it
- [ ] Later
- [ ] No

Recommended: Do it
:::

## B. Finding agents and their sign-in (question 1)

:::question
Stop caching a failed shell answer, so a slow first launch doesn't hide `claude` until Hanger restarts?

`search_path` caches whatever its first run returns, including the widened fallback when the shell times out: "a shell that was slow once is not asked again until Hanger restarts" (`src-tauri/src/engine_status/resolve.rs:30-67`). A Claude Code switch made during a slow boot then reads `cli_not_found` until Hanger restarts.

T3 Code waits once more, with a 20 s limit, when the shell times out at start-up, and can read the shell again later (`apps/server/src/os-jank.ts:73-104` and `:198`). On macOS it also falls back to `launchctl getenv PATH` (`packages/shared/src/shell.ts:187`).

Change, the smallest version: keep only a successful shell answer (tokio's `OnceCell::get_or_try_init`). When the shell fails, return the fallback for that call and ask again next time. Nothing else changes.

Test: `a_shell_that_fails_once_is_asked_again`. A fake shell script fails on its first run and prints the markers on its second, behind a cache the test can build fresh.

Confidence: Read (both). Not measured how slow Karthik's login shell is at boot.

- [ ] Do it
- [ ] Later
- [ ] No

Recommended: Do it
:::

:::question
In the engine-status plan, give a native Claude Code install no "update available" badge, rather than comparing it with npm?

The plan's Task 5 checks npm's latest version for all four CLIs (`docs/plans/2026-11-24-tool-manager-phase-a.md`, Task 5), and Karthik's `claude` is the native install (the plan's facts table). T3 Code doesn't use npm for a native install. It reads the install's `autoUpdatesChannel` (`latest` or `stable`) from Claude Code's settings and asks Claude Code's own release endpoint for that channel (`apps/server/src/provider/Drivers/ClaudeMaintenance.ts:21`, `:47-100`). npm's latest can be ahead of `stable`, so a native install on `stable` would be told about an update that `claude update` won't install.

The simpler fix for Hanger: the native build updates itself, so `InstallMethod::Native` gets no latest-version check and no badge. That agrees with T3 Code's rule that updates run only "through a provably owning installer (or a self-updater that checks its own install)" (`docs/internals/03_providers.md:67`). It also keeps the plan's one-network-host rule intact.

Test: `native_install_has_no_update_badge` in `tests/engine_status_tests.rs`.

Confidence: Read (ClaudeMaintenance.ts and the plan). Not measured: which channel Karthik's install is on.

- [ ] Do it
- [ ] Later
- [ ] No

Recommended: Do it
:::

:::question
Keep the engine-status plan's light path: five install layouts, and each CLI's own status command for sign-in?

T3 Code shows what the heavier path costs:
- **Install ownership.** Its resolver is 1,578 lines (`packages/provider-core/src/server/maintenanceResolver.ts`) covering mise, pnpm, volta, yarn, Nix, Chocolatey and WinGet, and it still leaves unclear installs manual. Hanger's plan maps five path shapes, with Unknown meaning no command (Task 2).
- **Sign-in.** T3 Code starts the Claude SDK and Codex's app-server to learn sign-in state (`apps/server/src/provider/ClaudeProvider.ts:214-228`; `CodexProvider.ts:759`, `:999-1005`). To keep that probe passive it must pass empty `mcpServers`, `strictMcpConfig`, `disableAllHooks` and `ENABLE_CLAUDEAI_MCP_SERVERS=false` (`ClaudeProvider.ts:271-305`). Hanger's `claude auth status` and `codex login status` start nothing.

One idea worth carrying over, which the plan already follows: a probe that finishes proves only that the CLI started, and only clear negative evidence means "signed out" (`ClaudeProvider.ts:213`). Hanger's plan defaults to Not reported.

"Do it" here means: keep the plan as written. No code.

Confidence: Read (ClaudeProvider.ts), Grep (maintenanceResolver.ts's function list).

- [ ] Do it
- [ ] Later
- [ ] No

Recommended: Do it
:::

:::question
Read the three config-folder variables from the same login-shell run that already reads PATH?

Today `agents::engine_base` reads only Hanger's own environment. Launched from Finder, it never sees a `CLAUDE_CONFIG_DIR`, `CODEX_HOME` or `COPILOT_HOME` exported in `~/.zshrc` (`src-tauri/src/agents.rs:290`, "KNOWN CEILING"; `docs/roadmap.md:167`, "unfixed by design", because "reading shell init files … is guesswork"). But Hanger already runs the login shell, with markers, for PATH (`engine_status/resolve.rs`). T3 Code reads a named list of variables in one login-shell run, with a marker pair per name (`apps/server/src/os-jank.ts:35`; `packages/shared/src/shell.ts:384-405`). That asks the shell, so no init file is read or guessed at.

It would also have to hand the same values to `claude` in `mcp/switch/vendor.rs`, so that Hanger and the CLI name one file.

Measured 2026-11-25: none of the three is set in Karthik's login shell, so this changes nothing on this machine today.

Test: `a_config_dir_exported_in_the_shell_relocates_engine_base`, with a fake shell.

Confidence: Read (both); Measured (the variables).

- [ ] Do it
- [ ] Later
- [ ] No

Recommended: Later
:::

:::question
Check whether `zsh -l -i` can get stuck under `tauri dev`, and run it in its own process group if it does?

T3 Code detaches its shell probe so that "job control on an inherited controlling TTY" can't stop it while the parent waits (`packages/shared/src/shell.ts:396-399`, `detached: true`). Hanger's `run_capture` starts the interactive shell in Hanger's own process group (`src-tauri/src/engine_status/run.rs:56-64`). Only `tauri dev` started from a terminal has a controlling TTY, and a Finder launch has none, so a stuck shell would only show while you test in the dev app. A stuck shell times out after 5 s, and the fallback is then cached (see the caching question above).

Change, only if it is seen: add tokio's `process_group(0)` to that one spawn.

Confidence: Read (both). Not measured: I did not run `tauri dev`.

- [ ] Do it
- [ ] Later
- [ ] No

Recommended: Later
:::

## C. MCP configuration (question 2)

:::question
Add one step to the H3 Cursor sheet: after you switch a server off in Cursor, look for `~/.cursor/projects/<slug>/mcp-disabled.json`?

T3 Code finds the servers Cursor has switched off in a per-project list. That list lives at `$CURSOR_DATA_DIR` (or `~/.cursor`), under `projects/<slug>/mcp-disabled.json`, where the slug is the project root with every non-alphanumeric run turned into `-` (`packages/provider-cursor/src/server/workspaceMcpServers.ts:75-127`). Hanger keeps Cursor read-only until H3, because Cursor documents a toggle and no key in the file (`docs/plans/2026-11-24-context-control-engine-matrix.md:15`, `:194`, `:207`).

If the sheet confirms the file, Cursor switches per project. That puts it in slice 2, not this slice's machine-wide switch.

Measured: `~/.cursor/projects` holds three folders here, and none has that file yet.

Confidence: Read (about 60 lines). That code serves Cursor's agent SDK, so the IDE may behave differently, which is why this needs your check.

- [ ] Do it
- [ ] Later
- [ ] No

Recommended: Do it
:::

## D. Roadmap questions (question 4)

:::question
For slice 2 (per-project switching): show on each server row where its on/off comes from, with a Reset that removes the project's override?

T3 Code's settings use a pattern that fits Hanger's slice 2:
- A sentence at the top names the scope a change applies to.
- An icon beside each setting opens its chain: default, then machine, then project override.
- When targets disagree, the control shows a mixed state.
- An override can be reset to inherit.
- With a project chosen, a provider's switch applies to that project only, in either direction.

Source: `docs/user/project-settings.md`, first section.

For Hanger, that means a project's server row says whether its state comes from the global file or from the project's own list (Claude Code's per-project lists, Codex's project file), and Reset removes the project entry. This is a general pattern: nothing would be named after T3 Code or drawn like it.

Confidence: Doc. I did not read `SettingInheritance.tsx` or `SettingsScopeSentence.tsx`.

- [ ] Do it
- [ ] Later
- [ ] No

Recommended: Later
:::

:::question
For slice 4: make profiles named sets of on/off states, applied through the switch Hanger already has, not separate config folders?

T3 Code's answer to "several setups for one engine" is a separate `CLAUDE_CONFIG_DIR` per instance. Its docs state the costs: sign-in and conversation state are separate per folder, and "existing threads can switch only between Claude instances with the same config directory" (`docs/user/providers-claude.md`, "Separate accounts or configurations"). A profile built from Hanger's switch reuses its receipts and Undo (`src-tauri/src/mcp/switch/apply.rs`) and touches nothing but on/off.

"Do it" means recording this as slice 4's direction in `docs/roadmap.md`. No code.

Confidence: Doc.

- [ ] Do it
- [ ] Later
- [ ] No

Recommended: Do it
:::

:::question
Before Phase 2 shows any skills figure for Claude Code, measure whether `disable-model-invocation` and the `skillOverrides` setting keep a skill out of the startup list?

This is the most consequential finding here. T3 Code models two Claude Code controls over skills:
- **Frontmatter:** `disable-model-invocation: true` marks a skill as user-invoked only (`apps/server/src/provider/Drivers/ClaudeSkills.ts:100`).
- **Settings:** `skillOverrides` in Claude Code's settings files, with the values `on`, `name-only`, `user-invocable-only` and `off`, alongside `enabledPlugins` (`ClaudeSkills.ts:228-330`).

Its docs say skills disabled in Claude's settings don't appear (`docs/user/providers-claude.md`, "Skills"). Hanger's "Always on" figure counts name plus description for every skill document, whatever those say (`src-tauri/src/lib.rs:1802-1820`).

Measured 2026-11-25: 24 skill files under `~/.claude/skills` and `~/.agents/skills` set `disable-model-invocation: true`. Some may be the same skill reached through a link.

If Claude Code leaves those skills out of its startup list, today's "Always on" line and Phase 2's per-engine total both over-count. The finding also bears on slice 5's "skills off and on": Claude Code may have its own off switch in settings, the way Codex has `enabled = false`.

Change: add both controls to the measurement pass that opens Phase 2 (`docs/plans/2026-11-25-ia-global-by-engine.md`, "Unknown, and Phase 2 depends on it"), engine by engine, the way the MCP matrix was built.

Confidence: Read (T3 Code's code); Measured (the count). Claude Code's own behaviour is not verified in this review.

- [ ] Do it
- [ ] Later
- [ ] No

Recommended: Do it
:::

:::question
Anchor the skill frontmatter fence at line starts, so a `---` inside a description doesn't cut it short?

`parse_skill_frontmatter` splits the whole document on every `---` and takes the second piece (`src-tauri/src/scanner.rs:627-638`), so a description containing `---` is truncated, and its YAML can fail to parse. T3 Code matches the fence only at the start of a line (`apps/server/src/provider/Drivers/ClaudeSkills.ts:25`). This is a small fix outside this run's scope.

Test: `frontmatter_with_a_triple_dash_in_the_description_parses`. The existing scanner tests stay green, and per-kind counts are unchanged on the bench fixture (`shared-asset-machinery.md`).

Confidence: Read.

- [ ] Do it
- [ ] Later
- [ ] No

Recommended: Later
:::

---

## What I read deeply, and what I only skimmed

**Hanger, read in full or at the cited lines:**
- `engine_status/{mod,resolve,run}.rs`
- `mcp/switch/mod.rs` and `ops.rs`
- `lib.rs:700-840` and `:1775-1822`
- `useMcpSwitch.ts`, `switchTargets.ts`, `switchCopy.ts`, `EngineChipRow.tsx`, `NotLoadedGroup.tsx`, `enginesList.ts`
- `ProfilePane.tsx:600-779`, `App.tsx:1060-1180`, `Flyout.tsx:700-760`
- `agents.rs:255-320`, `scanner.rs:321-338` and `:627-638`
- the IA plan and the engine-status plan, in full

**Hanger, skimmed:**
- `context.rs`, `vendor.rs`, `apply.rs`, `edit.rs`: module docs and grep only
- `SummaryStrip.tsx`: its props
- `engine_summary.rs`: lines 1-60
- `scanner.rs`'s function list and `scan_targets`' first 25 lines
- `scan/status.rs`: lines 1-60
- `docs/roadmap.md`'s config-folder and scan-speed sections

**T3 Code, read:**
- `docs/internals/03_providers.md`, `docs/user/outside-agents.md`, and the top of `docs/user/providers-claude.md` and `docs/user/project-settings.md`
- `packages/provider-core/src/server/{snapshotProbe,auth,maintenance,ProviderLatestVersions,snapshot}.ts`
- `apps/server/src/os-jank.ts`
- `packages/shared/src/shell.ts:155-245`, `:330-470` and `:900-960`
- `apps/server/src/provider/ClaudeProvider.ts:140-330` and `:455-560`
- `Drivers/ClaudeMaintenance.ts`, `Drivers/ClaudeSkills.ts:1-60` and `:225-330`
- `packages/provider-cursor/src/server/workspaceMcpServers.ts:1-135`
- `CodexAdapterV2.ts:1700-1760`
- `apps/web/src/state/server.ts:95-215`

**T3 Code, grep or function list only:**
- `maintenanceResolver.ts`, `CodexProvider.ts`, `ClaudeAdapterV2.ts`, `ClaudeHome.ts`
- the settings components named in the per-project question
- `agentContextBudget.json`

**Set aside:** T3 Code's `MISE_OFFLINE=1` for background probes (`snapshotProbe.ts`, `providerProbeEnvironment`). mise isn't installed here.
