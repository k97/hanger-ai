# Context Control, Slice 1: Finish — Implementation Plan

> **For the executing model:** use superpowers:subagent-driven-development. Dispatch ONE fresh subagent per task, in the order below, with the task's text copied into its brief together with the "Read first" list and the "Global constraints". After each task, review its diff yourself and rerun the four gates yourself before dispatching the next. Do not stop between tasks to report; stop only at the human gates (H1–H4) or on a blocker that a rule in this plan says to stop for. Steps use checkbox (`- [ ]`) syntax.

**Status:** written 2026-11-25 after the backend checkpoint. Waiting for Karthik's approval in Plannotator. Nothing in it is built.

**Goal:** finish slice 1 of context control end to end. Karthik can see each engine's MCP servers, switch them off and on, undo, and measure their cost, from three places: a new **Engines** rail section, the MCP server inspector, and ⌘K. Servers switched off for Claude Code stay visible beside the MCP servers list. Then make the scan fast enough that the rescan after a switch is not a wait. Then prove it in the running app.

**Where things stand:** HEAD is `4fa9216` on `main`, not pushed (ruling 27: no push until Karthik has seen it in the dev app). The backend is complete and gated:

| Commit | What |
|---|---|
| `ea7e877` | `registry::SWITCHES`: Codex (`EnabledKey`, Global+Project), Claude Code (`ClaudeCli`, User), Gemini CLI (`GeminiEnablementFile`, Global) |
| `753b8c2` | `mcp::switch::edit`: one-flag editor, Gemini state-file editor |
| `3ee5e68` | `mcp::switch::apply`: backup, atomic replace, verify, receipts, Undo |
| `49ee1a7` | `engine_status::{resolve, run}`: login-shell PATH, `run_capture` |
| `f43dc67`, `3297134` | `mcp::switch::vendor`: Claude Code off/on through `claude mcp`, with a round-trip pre-flight |
| `dbd5e34` | `mcp::switch::context`: per-engine state, read-only reason, cost, budget |
| `2b674b4` | `mcp::switch::ops` + IPC: `get_engine_context`, `set_mcp_server_enabled`, `undo_mcp_switch`, `measure_engine_context` |
| `bf25664` | `get_kept_off_servers` |
| `e0deacd`, `4fa9216` | VS Code reads `~/.copilot/mcp-config.json` (honouring `COPILOT_HOME`) and a workspace-root `.mcp.json` |

Gates on `4fa9216` (run 2026-11-25): vitest 143 files / 1309 tests; `cargo test` 893 passed, 0 failed, 7 ignored; `tsc` 0; both gitleaks clean.

**Spec documents (read, do not re-decide):**
- `docs/plans/2026-11-24-context-control.md` — decisions 1–9 and rulings 10–27. This plan replaces its Tasks 9–13; everything else in it stands.
- `docs/plans/2026-11-24-context-control-naming-brief.md` — every user-facing string. Karthik answered its three choices (Engines; On/Off; the budget line). Every string this plan uses comes from it verbatim unless listed under "New strings" below.
- `docs/plans/2026-11-24-context-control-engine-matrix.md` — what each engine does, measured.
- `docs/ipc.md` entries 15–19 — the five commands the UI calls.
- `src/types/engineContext.ts` — the TypeScript mirror (narrowed). No component uses it yet.

## Decisions this plan makes (Karthik approves or annotates them in Plannotator)

- **P1. No separate layout-options round (gate G2 is folded into H1).** Karthik asked on 2026-11-25 to stop working task by task and finish the run. The layout below is specified in enough detail to build; he reviews it in the running app at H1 instead of on a mock. The naming brief's string tables are treated as signed off with this plan's approval.
- **P2. The Engines screen uses the shell's source-list column for the engine list** (like Discovery and Needs review do), the main pane for the selected engine's Context, and **no inspector**. That is "list on the left, detail on the right" in the app's own grammar.
- **P3. One switch pattern for all three places.** A button with `aria-pressed`, labelled with the server's name, containing the existing `LayerSwitch` track (today a private function in `LinkMapPane.tsx`). DESIGN.md §7 says toggles use `aria-pressed`; the codebase has no `role="switch"`, so none is introduced. `LayerSwitch` is extracted to its own file because it gains two real callers.
- **P4. One switch state, owned by `App.tsx`.** A hook, `useMcpSwitch`, holds the last notice (success or failure, with its receipt) and is the only code that calls `set_mcp_server_enabled` and `undo_mcp_switch`. A single `SwitchNotice` at the bottom of the main column shows "{server} is off for {engine}." with **Undo**, or the failure line. The inspector, the Engines pane and ⌘K all call the hook. After every successful switch or Undo the hook triggers a rescan, exactly as unlink and deploy do today (`onRefresh={triggerScan}`), so the MCP servers list and its header count stay true.
- **P5. All switch strings live in one module, `src/utils/switchCopy.ts`**, typed as exhaustive `Record`s over `SwitchFailure` and `ReadOnlyReason`, so a new backend code fails `tsc` until it has a line.
- **P6. The scan speed work (Phase B) comes after the UI (Phase A), in its own worktree**, and is measured before and after with the ledger's method. Only the low-risk fixes are built: run the global pass once per scan, one connection per scan with cached statements, and a `get_mcp_processes` that does not write. Batching writes into transactions and WAL are recorded in the roadmap, not built. Phase B runs in a detached worktree on branch `perf/scan` so its Rust edits and `cargo test` runs never rebuild or relaunch the dev app Karthik is reviewing at H1; it is rebased onto `main` and fast-forwarded in after H1 (Task B6).
- **P7. The Engines source list shows no figure.** The summary's `server_count` counts distinct names and leaves out kept servers, while the pane lists one row per registration plus kept servers; printing it beside the rows would be a header that contradicts its rows (`invariants.md`). The pane's own budget carries the figures.
- **P8. The Engines list holds every engine that declares an MCP server (the summary's rows) plus any engine that has a server Hanger is keeping off** (`keptOff.servers[].engine_id`), so an engine whose servers are all switched off is still reachable.
- **P9. A read-only server shows its state.** Where the switch would be it shows `On` or `Off` (`stateLabel`), with the reason line under the row (ruling 18: "shows its state and no switch").
- **P10. One additive backend field: `EngineContext.switches_by_name: bool`** (Task A0), true when the engine's `SWITCHES` row is `GeminiEnablementFile`. The view then needs no engine-id literal to decide when to show the "covers every server named {server}" line. This is the only Rust change in Phase A, and the only exception to "the switch modules do not change behaviour"; it adds a field and changes no existing one. The "kept by Hanger" line needs no field: it is exactly `item.key.startsWith("stash:")` (`docs/ipc.md` entry 15).
- **P11. Phase B's target.** Karthik's ask is that the rescan after a switch is not a wait. No number has been set. Every Phase B ledger row records the wall time of a rescan of the real store (from Rescan to `scan://complete`, debug and release), and C2 reports the before and after; Karthik sets a target at H1 if he wants one.

### New strings (not in the naming brief; each through `/humanizer`, approved with this plan)

| Where | String |
|---|---|
| Kept-off group heading in the MCP servers list | Switched off · {count} |
| Engines source list, empty (after the first reply) | No engine declares an MCP server. |
| Engines source list heading | Engines |
| ⌘K action group heading | Switch |
| A failure code the webview does not recognise (cannot happen with today's backend; the type makes it unreachable, this is the defensive fallback) | Hanger couldn't make that change. Nothing was changed. |
| ⌘K action label (its own template; the brief's wording, lower-case state mid-sentence) | Switch {server} off for {engine} / Switch {server} on for {engine} |
| **Deviation from the brief:** the inspector switch's accessible name. The brief says `{server}`, but in the inspector the server is the panel's title and one engine can declare it in two files (Claude Code's `~/.mcp.json` and `~/.claude.json`), which would give two buttons with one name. | {engine}, {file} |

## Run order

1. H0 (this plan approved).
2. A0 → A1 → A2 → A3 → A4 → A5+A6 (one task) → A7 → A8 → A9, each a fresh subagent, reviewed and gated before the next.
3. At A9: start Phase B in its worktree (B1 → B2 → B3 → B4 → B5), and in parallel stop on `main` for H1.
4. After H1: A10 on `main`, then B6 (rebase, fast-forward, gates).
5. C1 (each real write gated by H2), then C2: report and wait for H4 (push).

## Human gates in this run

- **H0 — this plan.** Karthik approves in Plannotator. Nothing starts before.
- **H1 — the UI in the running app** (end of Phase A, Task A9). The executor starts `bun run tauri dev`, asks Karthik before any click, takes screenshots per `.claude/rules/verifying-ui.md`, and stops for him to look. Phase B starts at the same time **in its own worktree** (P6), so it never touches the checkout the dev app runs from. H1's feedback, if any, is applied on `main` as its own task (A10) before Phase B is merged in.
- **H2 — writes to Karthik's real config** (Task C1). Each real switch needs his go-ahead in the conversation at that moment: Codex, Claude Code, Gemini CLI, and the OpenCode check (ruling 15).
- **H3 — the four app checks** (Cursor, Claude Desktop, Zed, VS Code), from the sheets in the engine matrix. Karthik runs them when he chooses. Not on this run's critical path.
- **H4 — push.** Only on Karthik's word, after H1 (ruling 27).

Automation never marks H1–H4 as passed. Their outcome must be Karthik's words in the conversation.

## Read first (every subagent, before its task)

1. `CLAUDE.md`
2. `.claude/rules/`: `coding-guardrails.md`, `verification.md`, `invariants.md`, `shared-checkout.md`, `ui-copy.md`, `verifying-ui.md` (UI tasks), `shared-asset-machinery.md` (scanner tasks), `readme.md`, `known-debt.md`
3. `.claude/DESIGN.md` (UI tasks)
4. This plan, whole. Then the spec documents its task names.

## Global constraints

**Process**
- Red first: every behaviour change starts with a failing test, run and seen failing. A compile error counts as red only for a new module; behaviour tests need a behavioural red or a planted mutation.
- Every task names the mutations to plant. Plant, run, see red, restore **by inverse edit** (never `git checkout --`, which discards uncommitted work), confirm the file's sha256 matches.
- The four pinned gates, each in its own shell call with an explicit `cd`, each command prefixed with `export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:/opt/homebrew/bin:$PATH";`:
  - `cd /Users/karthik/Work/Labs/hanger-ai && npx vitest run`
  - `cd /Users/karthik/Work/Labs/hanger-ai/src-tauri && cargo test`
  - `cd /Users/karthik/Work/Labs/hanger-ai && bunx tsc --noEmit` (it type-checks test files too: `tsconfig.json` includes `src`)
  - `cd /Users/karthik/Work/Labs/hanger-ai && gitleaks detect --source .` and `cd /Users/karthik/Work/Labs/hanger-ai && gitleaks detect --source . --no-git -c .gitleaks.toml`
- An existing test or guard that fails because of a change: stop and report, unless this plan names that exact edit as forced. A forced edit is named in the commit body with its cause. Never weaken a guard to reach green.
- A new `*.test.ts(x)` under `src/`, a new `.rs` file under `src-tauri/tests/`, or a new Tauri command changes a generated README figure: run `~/.bun/bin/bun run src/__tests__/readmeCounts.ts`, confirm with `git diff README.md` that only generated figures moved, and include `README.md` in that commit.
- Commits: explicit paths, `git add` new files first, `git diff --cached --name-only` checked before each commit. No `git commit -a`, `stash`, `reset`, `checkout --`, or any destructive git. Never push (H4). Leave untracked files under `docs/` alone; they are not this plan's.
- `cargo test` rebuilds and relaunches a running dev app (`verifying-ui.md`). Do not run it during a screenshot sequence.

**UI**
- Counts come from the backend. Render `on_count`, `off_count`, `measured_on_count`, `on_tokens_measured`, `KeptOff.count`, `McpEngineSummaryRow.server_count` as given. No `.length` assigned to a count, no `.reduce`, no sums (`no-frontend-counting.test.ts`). A boolean like `items.length > 0` is fine.
- Engine names come from the backend (`engine_name` fields). No engine name literal in `src/components/**` (`no-hardcoded-engine-copy.test.ts`); code comments count.
- Tokens only (`no-off-token-styles.test.ts`), type roles from `src/components/typeRoles.ts` (`type-roles.test.ts`; no `uppercase`, no default sizes, no arbitrary leading), icons via `sized()` exports in `icons.tsx` with `size` 16 (shell), 14 (rows) or 12–13 (inline), never a literal `strokeWidth` (`icon_weight.test.ts`).
- No blocking dialogs. No `focus:outline-none` (inert here). Repeated class variants are module-level `const` strings chosen by ternary; no `clsx`/`cva`.
- Pane roots never paint `bg-page` (`window_chrome_sheet.test.tsx`). Panes open at `pt-[18px]`, list plane `mx-[18px]`.
- Empty is a finding; pending is not: no pane asserts an absence before its first reply lands.
- Every new `src/components/*.tsx` is either imported by `DesignSystemPane.tsx` as a `<Specimen>` with fixtures in `src/data/designSystemFixtures.ts` (and its name added to `INVENTORY` in `src/__tests__/design_system_pane.test.tsx`), or added to the `ALLOWLIST` in `src/__tests__/design-system-coverage.test.ts` with a reason, following the panes' existing entries. Sample controls never reuse a real control's accessible name.
- A component whose shape changes moves its `DESIGN.md` paragraph in the same commit.
- Mock `invoke` per test file with `vi.mock("@tauri-apps/api/core", …)` as `FlyoutMcpProbe.test.tsx` does; there is no shared helper. Fixtures for IPC replies are copied from a real reply shape (`docs/ipc.md` examples or the Rust tests' serialised output), never widened beyond the narrowed types.

**Rust**
- Behaviour of `mcp::switch::{edit, apply, vendor, context, ops}` does not change in Phase A.
- No value from a config file crosses IPC, is logged, or lands in SQLite (`ipc_boundary_tests.rs` pins it).

---

## Phase A — the switches on screen

### Task A0: `EngineContext.switches_by_name`

**Files:** `src-tauri/src/mcp/switch/context.rs`, `src-tauri/tests/mcp_switch_tests.rs`, `src/types/engineContext.ts`, `docs/ipc.md` (entry 15's response).
- Add `pub switches_by_name: bool` to `EngineContext`: true exactly when `SWITCHES` has a row for this host whose kind is `GeminiEnablementFile`. Do not test the host id; test the kind, as `context.rs` already chooses mechanisms by kind.
- Mirror it in TypeScript; document it in `docs/ipc.md` entry 15.
- Tests: `gemini`'s context says true; `codex`, `claude-code`, `cursor` and an unknown id say false; the serialised field name is `switches_by_name`. Mutation: negate the result and show red.
**Commit:** `feat(mcp): an engine's context says when its switch covers every server of a name`.

### Task A1: `switchCopy` — every switch string, keyed by code

**Files:** Create `src/utils/switchCopy.ts`, `src/utils/switchCopy.test.ts`.

**Interfaces:**
```ts
import type { SwitchFailure, ReadOnlyReason, ItemState } from "../types/engineContext";
type Names = { engine: string; server: string; file?: string };
export function stateLabel(s: ItemState): string;                       // "On" | "Off"
export function readOnlyLine(r: ReadOnlyReason, n: Names): string;     // 7 lines, naming brief "Why a server has no switch"
export function failureLine(code: string, n: Names): string;           // 13 lines + the fallback for an unknown code
export function isSwitchFailure(x: unknown): x is SwitchFailure;
export function switchedLine(kind: "off" | "on" | "undo_on" | "undo_off", n: Names): string;
export function mechanismLine(kind: "claude_kept" | "gemini_by_name", n: Names): string;
export function paletteActionLabel(turnOn: boolean, n: Names): string; // "Switch {server} on for {engine}" / "… off …"
export function budgetHeadline(tokens: number): string;                 // "≈ 12,400 tokens of tool descriptions" (en-US grouping, as McpServerDetail does)
export function budgetCaption(measured: number, on: number, off: number): string; // "12 of 15 servers measured", + " · 3 off" when off > 0
export function costLabel(tokens: number | null): string;              // "≈ 120 tokens" | "Not measured"
```
- The strings are the naming brief's, verbatim, with `{engine}`, `{server}`, `{file}` substituted. Where a line needs `{file}` and none is known (a kept server), use the line's wording without the path; list each such case in the report.
- Internally the 13 and 7 lines are `Record<SwitchFailure, …>` and `Record<ReadOnlyReason, …>`, so a new union member fails `tsc`.
- `src/utils/` is not scanned by the engine-copy guard; still, no engine name appears as a literal here either.

**Tests:** one per failure code and per reason (exact string), the fallback for `"something_new"`, `isSwitchFailure` positive and negative, `budgetCaption` with and without off servers, `costLabel(null)`.
**Mutations:** drop one `Record` entry (tsc must fail: show it); change the fallback to echo the code (test red).
**Commit:** `feat(engines): every switch string in one place, keyed by the backend's codes`.

### Task A2: `LayerSwitch` becomes a shared component

**Files:** Create `src/components/LayerSwitch.tsx`; modify `src/components/LinkMapPane.tsx` (import it; remove the private function, body unchanged), `src/components/DesignSystemPane.tsx` (a specimen in the Controls section), `src/data/designSystemFixtures.ts` if a fixture is needed, `src/__tests__/design_system_pane.test.tsx` (`INVENTORY` gains the specimen's name — an addition, not a forced edit), `.claude/DESIGN.md` (§4 or §7: the switch pattern: a `<button aria-pressed>` labelled by its subject, holding a decorative `LayerSwitch`).
- Byte-for-byte the same SVG and classes. Link map's tests must stay green untouched.
- Specimen: a sample button showing both states, labelled "Sample switch" (never a real control's name).
**Commit:** `refactor(ui): the link map's switch track becomes a shared component`.

### Task A3: `useMcpSwitch` and `SwitchNotice`

**Files:** Create `src/hooks/useMcpSwitch.ts`, `src/hooks/useMcpSwitch.test.ts`, `src/components/SwitchNotice.tsx`, `src/components/SwitchNotice.test.tsx`; modify `DesignSystemPane.tsx` (specimen), `design_system_pane.test.tsx` (`INVENTORY` addition), `.claude/DESIGN.md`.

**Interfaces:**
```ts
export type SwitchNoticeState =
  | { kind: "done"; line: string; receiptEngineId: string; receiptId: string | null; undoable: boolean; pending: boolean }
  | { kind: "failed"; line: string };
export function useMcpSwitch(opts: { onChanged: () => void }): {
  notice: SwitchNoticeState | null;
  busyKeys: ReadonlySet<string>;                      // keys with a request in flight (drops double clicks)
  switchServer(a: { engineId: string; engineName: string; key: string; serverName: string; file?: string; enabled: boolean }): Promise<EngineContext | null>;
  undo(): Promise<EngineContext | null>;
  dismiss(): void;
};
```
- `switchServer` calls `invoke<SwitchReply>("set_mcp_server_enabled", { engineId, key, enabled })`. On success: notice `done` with `switchedLine("off"|"on")`, the reply's receipt, then `onChanged()`; returns `reply.context`. A reply with `receipt_id: null` (already as asked) sets no notice and does not call `onChanged`. On rejection: `failureLine(err, …)` as `failed`; returns `null`.
- `undo` calls `invoke<SwitchReply>("undo_mcp_switch", { engineId: receiptEngineId, receiptId })`; success replaces the notice with `switchedLine("undo_on"|"undo_off")` and the new receipt (an Undo can be undone), then `onChanged()`.
- A second call for a key in `busyKeys` is ignored. Keys are `${engineId}\u0000${key}`: one `.mcp.json` registration key can belong to two hosts.
- The hook keeps `{ engineName, serverName, file, lastEnabled }` of the last switch internally, so the Undo line and an Undo failure can name the server and say the right direction.
- `SwitchNotice` props: `{ notice: SwitchNoticeState | null; onUndo: () => void; onDismiss: () => void }`. It renders `role="status"` always (empty when `null`, so screen readers hear changes), the line, an **Undo** text button (`text-on-fill font-medium`, underlined on hover; not `miniBtnClass`, which is a white button that would sit inside the black pill) only when `undoable`, and a dismiss button (`XMarkIcon` 14, `aria-label="Dismiss"`). The pill follows `DiscoveryPane`'s toast (`bg-fill text-on-fill rounded-pill`, `animate-rise`) and stays until dismissed or replaced; it does not time out, because it carries Undo. Its wrapper is `pointer-events-none` like Discovery's, and the pill itself is `pointer-events-auto`, or Undo cannot be clicked.

**Tests:** success sets the line and calls `onChanged` once; already-as-asked sets nothing; each rejection code maps through `failureLine`; Undo uses the receipt's engine and id; Undo of an Undo works; a double click sends one invoke; `SwitchNotice` shows Undo only when undoable, and the status region exists while empty.
**Mutations:** call `onChanged` on failure (red); show Undo when `undoable` is false (red); drop the busy check (red).
**Commit:** `feat(engines): one place that switches a server, says what happened, and undoes it`.

### Task A4: App wiring — state, refreshes, the notice

**Files:** modify `src/App.tsx`; create `src/__tests__/mcp_switch_wiring.test.tsx`.
- Add `keptOff: KeptOff | null` state and `refreshKeptOff()` (`invoke<KeptOff>("get_kept_off_servers")`, `null` on failure), called in the `scan://complete` listener after `refreshMcpEngineSummary()`.
- Call `useMcpSwitch({ onChanged: () => triggerScan() })`, and declare every new `useState`/`useRef`/hook call **after** `triggerScan`'s `const` declaration and **before** App's early returns for onboarding (around the `if (onboardingComplete …) return` blocks), or React's hook order breaks when onboarding flips and `triggerScan` is read before it exists.
- Render `<SwitchNotice>` once, `fixed` at the bottom centre of the window, as a direct child of App's root element, **not** inside `<main>`: `<main>` is `hidden` while the inspector is expanded (so a switch from an expanded inspector would show nothing), and an always-present `role="status"` node inside the pane container would satisfy `window_chrome_sheet.test.tsx`'s "pane rendered" query on every screen and quietly disarm it.
- Test (whole `<App />`, mocks as `icon_rail.test.tsx`): `get_kept_off_servers` is called after `scan://complete`, and the empty `role="status"` notice region is in the document. Switching itself is driven from the UI in A6 and A7's tests; do not add a test-only seam to App for it (`no-test-only-props.test.ts`).
**Commit:** `feat(engines): the app keeps the switched-off servers and the switch notice`.

### Task A5: The Engines screen — rail entry, routing, telemetry

**Files:** modify `src/components/IconRail.tsx`, `src/App.tsx`, `src/utils/screenName.ts`, `src/utils/screenName.test.ts`, `src-tauri/src/telemetry.rs`, `src-tauri/tests/telemetry_session_tests.rs`, `src-tauri/src/lib.rs` (`track_screen_view` doc comment), `docs/telemetry.md`, and the tests named as forced edits below.
- **Rail:** `active` union gains `"engines"`; new required prop `onSelectEngines: () => void`; entry after Discovery, before the rule above Needs review: `aria-label="Engines"`, tooltip "Engines", `CpuChipIcon size={16}` (optical 1, so its `<svg width>` is 16). Forced edits (tsc fails without them, ordering exception in `verification.md`): `src/__tests__/icon_weight.test.ts` (pass the prop; `expected` gains `Engines: 16`), `src/__tests__/shell_first_gap.test.tsx`, `src/components/HangerMark.test.tsx` (pass the prop).
- **App** (`selectedSidebarItem === "engines"`), every place the rail-and-routing map in this plan's research lists:
  1. `IconRail active=` maps `"engines"`; `onSelectEngines` does `handleSelectSidebarItem("engines")` + `set_preference selected_sidebar_item`.
  2. `inspectorRenders` excludes `"engines"`; the content-cap "Toggle inspector" button is hidden on it.
  3. `crumbSegments`: `["Engines"]`, or `["Engines", <engine_name>]` when one is selected.
  4. Second column: `<EnginesSidebar …/>` (Task A6).
  5. Main pane: `{selectedSidebarItem === "engines" && <EnginesPane …/>}` (Task A6).
  6. `mainLeads` and the left-column width are unchanged (Engines has a source list).
- **Telemetry:** `screenName.ts` maps `engines → "engines"` and its header says seven names; `telemetry.rs` `SCREENS: [&str; 7]` gains `"engines"`, doc comments say seven; `telemetry_session_tests.rs` adds `"engines"` to its list and renames the "six" test (forced, named); `lib.rs` doc comment; `docs/telemetry.md` lists seven names.
- **Tests:** `icon_rail.test.tsx` gains: clicking Engines persists `selected_sidebar_item: "engines"`, sets `aria-current`, renders `engines-sidebar`, and renders no `<aside>`. `window_chrome_sheet.test.tsx` adds `"engines"` to both screen loops (forced; `screen_ready` waits for the "Toggle sidebar" button as for other screens with a source list). `screenName.test.ts` maps `engines`.
- **A5 and A6 are dispatched as one task and land as one commit:** A5's own tests need A6's sidebar and pane (`engines-sidebar`, and `window_chrome_sheet`'s `screen_ready` waits for a real pane root).
- Also update the App.tsx comment that says "six-name allowlist", and both Rust tests that say six: `the_six_screens_map_to_a_title_and_a_hanger_url` and `anything_that_is_not_one_of_the_six_names_is_dropped` (renamed for seven; forced, named in the body).
- `RAIL_MARKS` in `DesignSystemPane.tsx` (the rail's marks in order) gains Engines in its rail position.
**Commit (A5 + A6 together):** `feat(engines): a rail section that shows what each engine loads and what it costs` (body names every forced test edit and why).

### Task A6: The Engines source list and Context pane

**Files:** create `src/components/EnginesSidebar.tsx`, `src/components/EnginesPane.tsx`, their tests; modify `src/App.tsx`, `src/__tests__/design-system-coverage.test.ts` (two `ALLOWLIST` entries: "reads engine context over IPC" for the pane; the sidebar as other sidebars), `.claude/DESIGN.md` (§5 Panes entries in the existing format, with their final empty strings and the tests that pin them).

**EnginesSidebar** — props `{ engines: { engine_id: string; engine_name: string }[] | null; scannedAt: Date | null; selected: string | null; onSelect: (engineId: string) => void; width; setWidth; collapsed; setCollapsed }`, same shell as `DiscoverySidebar`/`ReviewSidebar` (read one and match it), `data-testid="engines-sidebar"`.
- App builds `engines` (P8): the `mcpEngineSummary.rows` in their order, then any `keptOff.servers[].engine_id` not among them, with its `engine_name`. A pure helper in `src/utils/` with its own test; it builds a list, it counts nothing.
- Heading "Engines". One row per engine: `<EngineLabel engineKey={e.engine_id} engineName={e.engine_name}>{e.engine_name}</EngineLabel>`. **No figure** (P7). Selected row uses the source list's existing selected style and `aria-current="true"`.
- Before the first scan: nothing claimed (the pending treatment other sidebars use). After it, no rows: "No engine declares an MCP server."
- App: `selectedEngine` state, persisted as preference `selected_engine`; restored in `initializeApp`; defaults to the first row when unset or when the stored id is not among the rows.

**EnginesPane** — props `{ engineId: string | null; scannedAt: Date | null; switcher: ReturnType<typeof useMcpSwitch>; refreshNonce: number }`.
- Fetches `get_engine_context({ engineId })` on mount, on `engineId` change, and on `refreshNonce` change (App bumps it on `scan://complete`). Cancellation flag as Link map's effect does.
- Layout, top to bottom, inside the standard pane frame (`pt-[18px]`, list plane `mx-[18px]`):
  1. **Header**: `<h2>` engine name (`text-lg-app` ink-1).
  2. **Budget** (`ListCard`, one row): `budgetHeadline(on_tokens_measured)` as `rowValueClass`, `budgetCaption(measured_on_count, on_count, off_count)` as `captionClass`; trailing **Measure all** (`miniBtnClass`), "Measuring…" and disabled while pending; under the card, the brief's caption "Starts each server that's on and has no recent answer, and reads its tool list." (`captionClass`). Measure calls `measure_engine_context` and replaces the context with the reply.
  3. **Servers** (`sectionHeadClass` "Context" heading, then one `ListCard`): one row per item, in the order given.
     - Left: name (`rowValueClass`), under it `{tier} · {config_path}` (`monoLabelClass`, truncated); for a kept server just the tier.
     - Right: `costLabel(estimated_tokens)` (`rowMonoClass`, or `captionClass` for "Not measured"), then the switch: `<button aria-pressed={state === "on"} aria-label={name} disabled={busy}>` holding `<LayerSwitch on={state === "on"} />` when `read_only === null`; otherwise `stateLabel(state)` (`captionClass`) where the switch would be (P9), and `readOnlyLine(reason, …)` as a `captionClass` line under the row.
     - Under an item whose `key` starts with `stash:`: `mechanismLine("claude_kept")`. Under every item when `context.switches_by_name` is true: `mechanismLine("gemini_by_name")`. No engine id is compared in the view (P10).
     - Clicking a switch calls `switcher.switchServer({ engineId, engineName, key: item.key, serverName: item.name, file: item.config_path, enabled: state !== "on" })`; a non-null result replaces the pane's context immediately (the rescan follows from the hook).
  4. **Empty** (after the first reply, `items.length === 0`): "{engine} declares no MCP servers."
  5. `applies` is `null` for every engine (ruling 19): render nothing for it.
- **Tests** (`EnginesPane.test.tsx`, fixtures shaped from `docs/ipc.md` entry 15/16 examples):
  - pending renders no empty line and no budget; the reply renders the budget figures exactly as the fields give them, using a fixture the backend really produces: two On items that share one launch, each `estimated_tokens: 100`, and `on_tokens_measured: 100` (the backend counts a launch once per engine). The headline must read 100, not 200. Counting from `items` is otherwise caught by `no-frontend-counting.test.ts`;
  - a switchable item has a button named by the server with `aria-pressed` true/false by state; a read-only item has no button, shows `On` or `Off`, and its reason line;
  - clicking calls `set_mcp_server_enabled` with `{ engineId, key, enabled: false }` and the row flips from the reply's context;
  - a rejection shows the failure line in the notice (through App or the hook) and the row does not flip;
  - Measure all disables itself, calls `measure_engine_context`, and replaces the figures;
  - the kept line appears only on `stash:` items, and the by-name line on every item only when `switches_by_name` is true;
  - "Not measured" for a null cost.
  - `EnginesSidebar.test.tsx`: rows from fixtures, count shown as given, selection persists `selected_engine`, empty line only after `scannedAt`.
- **Mutations:** sum `estimated_tokens` in the pane instead of rendering `on_tokens_measured` (red); render the switch for a read-only item (red); drop the state label on a read-only item (red); show the empty line while pending (red).
  - `EnginesSidebar` / the engines helper: an engine present only in `keptOff` is listed; mutation: build from summary rows only (red).
**Commit:** `feat(engines): what each engine loads, what it costs, and a switch for each server`.

### Task A7: The switch in the MCP server inspector

**Files:** modify `src/utils/mcpServerView.ts` (and its test), `src/components/McpServerDetail.tsx`, `src/components/McpServerDetail.test.tsx`, `src/components/Flyout.tsx`, `src/components/FlyoutMcpProbe.test.tsx` or a new `src/components/FlyoutMcpSwitch.test.tsx`, `src/App.tsx` (pass the switcher and a refresh nonce to Flyout), `.claude/DESIGN.md` (the inspector's "Registered in" row paragraph).
- **Engine id on a registration:** add `engineId: string | null` to `Registration` in `buildMcpServerView`, derived as `tierOf(scope) === "global" ? scopeAgent(scope) || null : null`. Not from `owning_agent`: the project sweep sets it to a display name (`config.name`) and the agent-root sweep to `agent_id_static(...)`, which is `""` for most agents; the scope's agent is the id. A row with `engineId === null` gets no switch. Verify the derivation against `scanner.rs` and state what you found.
- **Flyout:** when an MCP server view opens, fetch `get_engine_context` once per distinct non-null `engineId` among its registrations (cancellation flag; refetch on the App's refresh nonce). Build `Record<registrationKey, { engineId: string; engineName: string; item: ContextItem }>` by matching `reg.key === item.key` (both are built by `RegistrationKey` / `registrationKey`; match on key, never on tier). Pass it and the switcher to `McpServerDetail`.
- **McpServerDetail "Registered in" row** (Details tab): on line 1, after the tier, when the row has a context item: the same switch button as the Engines pane (`aria-label` `{engine}, {file}`, the listed deviation; `aria-pressed` by state), or, for a read-only item, `stateLabel(state)` in that place and `readOnlyLine` as a `captionClass` line under the row. Rows with no item (local tier, project rows, no engine id) show nothing new. Nothing claims a state before that engine's first reply lands.
- A successful switch replaces that engine's context in Flyout from the reply, as the pane does.
- **Tests** (in a new `src/components/FlyoutMcpSwitch.test.tsx` for Flyout, README regenerated; `McpServerDetail.test.tsx` for the row): no switch or state before the first reply; a row with a switchable item shows a pressed button named `{engine}, {file}`; clicking calls `set_mcp_server_enabled` with that row's engine id and key; a read-only item shows its line and no button; a local-tier row shows neither; Flyout fetches each engine's context once even when it has two registrations.
- **Mutations:** match by tier instead of key (red: a fixture where tiers differ, `"user"` vs `"global"`); fetch per registration instead of per engine (red on the call count).
**Commit:** `feat(engines): switch a server off for one engine from its inspector`.

### Task A8: Kept-off servers beside the list, and ⌘K actions

**Part 1 — the kept-off group** (`src/components/ProfilePane.tsx` and its test, `src/App.tsx`):
- Prop `keptOff: KeptOff | null`. When the Tools category shows and `keptOff.count > 0`: after the Tools rows and before the Rules group, a group heading `Switched off · {keptOff.count}` (`groupLabelClass`, the other groups' `h3` shape) and one row per kept server: the name, the transport chip as `AssetRow` card draws it, second line "Off for {engine_name}", no reach tiles, no tool count. Row click goes to the Engines screen with that engine selected.
- The zero-servers and whole-store empty states must not win when only kept servers exist. Every predicate that decides the plane accounts for `keptOff.count > 0` (a boolean, not a count): `hasToolsContent`, `isCategoryEmpty`, `nothingToShow` / `pendingState`, `isAllEmpty`, and `storeEmpty` / `emptyState`. Read each before editing; list in the report which changed.
- New prop `onOpenKeptOff(engineId: string)`; App selects `"engines"` and that engine. The name/search filter applies to the kept group; a link-state filter (linked/drifted/broken) hides it, because kept servers have no link state.
- The group's figure is `keptOff.count`; the MCP servers header figure is unchanged (`get_asset_counts`), which is the point of keeping them beside the list.
- Tests: the group renders with the backend count; the header figure is untouched by it; a machine with only kept servers shows the group, not the zero-servers state; clicking a row selects `"engines"` and the engine.

**Part 2 — ⌘K actions** (`src/components/SearchPalette.tsx` and its test, `src/App.tsx`):
- `SearchPalette` gains an optional `actionsFor?: (query: string) => PaletteAction[]`, with `PaletteAction = { id: string; label: string; detail?: string; onRun: () => void }`. `SearchPalette` owns the query, so it calls `actionsFor(query.trim())` on each change and passes the result to `SearchPalettePanel` as a new optional `actions?: PaletteAction[]`. The panel renders them as one more `Command.Group` (heading "Switch", same heading div and row class) after the asset groups. `shouldFilter={false}` stays.
- Copy states: when `actions.length > 0`, neither "Type to search names and what's inside." nor "Nothing matches “{q}”." shows. Before the first scan (`!hasScanned`) no actions show: the engine list they come from is built by the scan.
- App's `actionsFor`: on palette open, fetch `get_engine_context` for every engine in the Engines list (P8; once per open, cached in a ref until close). For a non-empty query, actions are items with `read_only === null` whose name contains it (case-insensitive), at most 8; label `paletteActionLabel(state !== "on", …)`, `detail` the engine name. `onRun` closes the palette and calls `switcher.switchServer(...)` with exactly the arguments the Engines pane would pass.
- Tests: actions render under "Switch" and run `set_mcp_server_enabled` with the same arguments the Engines pane sends for that item; no actions for an empty query; "Nothing matches" hides when an action matches; read-only items never become actions. The Design-system specimen of the palette keeps working (pass no actions).
- Mutation: drop the `read_only === null` filter (red).
**Commits:** `feat(mcp): servers switched off for Claude Code stay in the list, as their own group` and `feat(search): switch a server from the palette`.

### Task A9: Phase A proof, in the running app

- Run all four gates on the final tree.
- Before starting, check for a running dev app (`pgrep -f target/debug/tauri-app`; port 8397 is `strictPort`). If one runs, reuse it after confirming its binary is current (touch `src-tauri/tauri.conf.json` to relaunch on the current build, per `verifying-ui.md`); otherwise start `bun run tauri dev` in the background.
- Follow `verifying-ui.md` exactly: pid by `pgrep -f target/debug/tauri-app`, process start younger than the binary, window by CGWindowList filtered on pid with width ≥ 900, title `Hanger AI (dev)`, theme read from the store and named.
- **Ask Karthik in the conversation before the first click or keystroke**: bringing the window frontmost takes focus from whatever he is doing. Read `selected_sidebar_item`, `selected_engine` and `theme` from the store first and put them back afterwards.
- **Do not press Measure all** (it starts real servers). Opening a server's inspector auto-probes it under the app's existing rules; ask before opening one, and pick a server whose cached answer is fresh if possible.
- Screenshots: the Engines screen for Codex and Claude Code (budget, rows, switches, a read-only row with its reason); the inspector's "Registered in" with a switch; the palette with a "Switch" group for a typed name. **No switch is clicked on real config here** (that is H2).
- Write the evidence to `docs/evidence/2026-11-25-engines-ui/` (gitignored, local) and report the paths.
- Start Phase B in its worktree (see Phase B), then **stop on `main` for H1**. Phase B carries on in the worktree meanwhile; nothing on `main` changes until H1 is answered.

### Task A10: Karthik's H1 feedback

On `main`, after H1. Each change is its own commit with its own test, strings through `/humanizer`. If H1 brings no feedback, this task is empty and says so.

---

## Phase B — scan speed

Context: `docs/perf-ledger.md` records the Rust process at ~70% CPU and 3 min of CPU in the first 8 minutes after launch, hot in `Connection::prepare` and SQLite's busy handler. Code-derived (2026-11-25, real store: 914 global assets, 243 project assets, 10 linked directories): `start_scan` calls `scan_with_progress` once for `""` and once per linked directory, and **every call re-runs the whole global pass**, about 11 × 914 ≈ 10,000 `upsert_asset` calls per scan, each opening its own connection, compiling four statements uncached, and committing on its own. `get_mcp_processes` runs a second full writing scan (`run_scan`) when a server panel opens.

Rule for every Phase B task (`perf-ledger.md`): a change is kept only if its effect is outside its own run-to-run noise; otherwise it is reverted and the attempt is still recorded as a ledger row. Every row also records the wall time of a rescan of the real store, debug and release (P11), taken only while Karthik is not using the app.

**Where Phase B runs (P6):** `git worktree add -b perf/scan /Users/karthik/Work/Labs/hanger-ai-perf <the commit A9 ended on>`, then `ln -s /Users/karthik/Work/Labs/hanger-ai/node_modules /Users/karthik/Work/Labs/hanger-ai-perf/node_modules`. All Phase B edits, tests and gates run there (its `src-tauri/target` is its own, so the first build is a full one). The four gates run from the worktree's root, the same commands with the worktree path. Commit on `perf/scan`. Do not touch the main checkout until B6.

### Task B1: A scan benchmark, and the baseline

**Files:** create `src-tauri/tests/scan_bench_tests.rs` (README figure moves; regenerate); modify `src-tauri/src/lib.rs` and `src-tauri/src/scanner.rs` for the extraction below.
- **First, extract the loop** so the bench measures the real code and B2 changes one place: `pub fn scan_targets(scanner: &DirectoryScanner, targets: &[PathBuf], on_progress: …) -> Result<Inventory, ScanError>` holding what `start_scan` does today across its targets (each `scan_with_progress`, then `dedupe_combined`). `start_scan` and `run_scan` call it. Behaviour unchanged: a test that a fixture's inventory and per-kind counts are identical through `scan_targets` and through the old per-target calls, red first against a stub. Its own commit: `refactor(scan): one function scans a list of targets`.
- Then one `#[ignore]` test, `scan_bench`, that builds a temp home with `N_SKILLS` skills, `N_SUBAGENTS` subagents, two MCP configs, and `K` linked project directories (defaults 300 / 100 / 2 / 6, overridable by env vars `HANGER_BENCH_*`), sets `HANGER_TEST_HOME`, links the projects on a fresh database through `PreferencesStore::link_directory`, and calls `scan_targets` with `""` plus each project, then `search::index_inventory`. `HANGER_TEST_HOME` is process-global: the bench lives in its own test binary and runs with `--test-threads=1`. It prints, for a cold scan and then a warm rescan, 5 runs each: wall time (`Instant`), process CPU (`libc::getrusage(RUSAGE_SELF)`, user + system), and the min / median / max.
- Run it with `cargo test --test scan_bench_tests -- --ignored --nocapture --test-threads=1`, in debug and with `--release`.
- Also take the real-machine figure the ledger's way: dev app, Tools view and server panels closed, `ps -o cputime= -p <pid>` before Rescan and after `scan://complete`, 3 runs, with an idle control of equal length first. If Karthik is in the app, skip this and say so.
- Record both as a "baseline" ledger row in `docs/perf-ledger.md`.
**Commit:** `test(perf): a scan benchmark and its baseline`.

### Task B2: Run the global pass once per scan

**Files:** `src-tauri/src/scanner.rs`, `src-tauri/src/lib.rs` (`start_scan`, `run_scan`), `src-tauri/tests/scanner_tests.rs` (new tests only).
- Split `DirectoryScanner::scan_with_progress` into a global part and a project part. `Scanner::scan(root)` / `scan_with_progress(root, …)` keep their contract — many tests call `scan(project)` and expect global assets in the inventory and the database — by composing both. `start_scan` and `run_scan` call the global part once, then the project part per directory, and merge as `dedupe_combined` does today.
- Keep `acquire_scan_lock` semantics; keep cancellation behaviour (`test_pass_2_cancellation_preserves_pass_1_rows`); keep reap off by default; keep the early return for the `""` target.
- **The global part's output is everything the project part reads from it today**, cloned into each project part: `seen_registrations` (without it, a machine-level registration the project sweep reaches again is upserted with scope `"project"` and re-parented, which changes per-kind counts), `agent_root_ids` (ancestor `.mcp.json` registrations attach to it), `engine_db_ids`, `checksums`, `origin_resolver`, and the global `parse_warnings` (today they reach every `ProjectScan.parse_warnings`). Read `scan_with_progress` and list anything else you find in the report.
- New tests: a `scan_targets` run over two projects performs the global pass once (assets have `first_seen`/`last_seen`, no `updated_at`; choose the least invasive measurable signal, such as a pass counter on the scanner visible to tests, and say which); the inventory, every `project_scans[*].parse_warnings`, and per-kind counts (`count_assets`) are identical to the pre-change composition on a fixture with global, project, shared-root, ancestor-`.mcp.json` and linked assets.
- Measure with B1's bench (same profile as the baseline). Ledger row.
**Commit:** `perf(scan): the global pass runs once per scan, not once per linked directory`.

### Task B3: One connection per scan, statements compiled once

**Files:** `src-tauri/src/preferences.rs`, `src-tauri/src/scanner.rs`.
- Add `&Connection`-taking variants of the scan-path writers (`upsert_asset_on`, `upsert_root_on`, `upsert_engine_on`, `record_walk_symlink_on`, `upsert_link_on`, `update_link_state_on`, `get_hydrated_links_on`, `get_all_deploy_checksums_on`), using `prepare_cached`. The existing `&self` methods become thin wrappers that open a connection and call them, so every other caller is unchanged.
- `scan_with_progress` opens one connection (through `connect()`, so `foreign_keys = ON` holds) and passes it down; remove the second `PreferencesStore::new` it does today.
- In `upsert_asset`, run the `roots WHERE kind = 'project'` query only for project scope (global upserts never use its result).
- rusqlite's statement cache holds 16 by default; count the distinct statements the `_on` writers use and call `set_prepared_statement_cache_capacity` above that number.
- Do **not** cache `init_db` per path (the migration replay tests call `new` again in one process and expect the migration to rerun). Do **not** add transactions or WAL.
- Tests: `test_foreign_keys_enforced` and all scanner, link, migration and search contention tests stay green untouched. New: a scan opens a bounded number of connections (instrument `connect()` with a test-visible counter only if no cleaner signal exists; say which).
- Measure. Ledger row.
**Commit:** `perf(store): a scan writes through one connection with cached statements`.

### Task B4: Opening a server panel stops rescanning

**Files:** `src-tauri/src/lib.rs` (`get_mcp_processes`), tests.
- `get_mcp_processes` needs each tool's `(registration_key, command, args)` to match running processes. The scanner has no reusable function for project MCP discovery (it happens inside `scan_with_progress`'s walk, with gitignore, exclusions and depth caps), so do not rebuild it. Instead: after every completed scan, `start_scan` stores that triple for every tool of the final inventory in a Tauri-managed `Mutex<Vec<…>>`; `get_mcp_processes` reads it and writes nothing. Its keys are `Tool::registration_key` by construction.
- Before any scan has completed, it falls back to today's `run_scan` path (rare: the app scans at launch).
- Record in the report an existing defect this removes: `run_scan` loops only over linked directories, so with none linked `get_mcp_processes` saw no tools at all.
- `run_scan` stays: `get_inventory` and `generate_handler!` still use it.
- Tests: after a scan, the stored triples equal the inventory's tools' keys, commands and args; `get_mcp_processes`' core writes nothing to the store (row counts and the store file's mtime unchanged).
- Measure the "panel opened during a scan" scenario before and after (B1's bench with a concurrent call, or the ledger method). Ledger row.
**Commit:** `perf(mcp): opening a server panel no longer rescans and rewrites the store`.

### Task B5: Record what was not done

- `docs/roadmap.md`: one entry for batching scan writes into short `IMMEDIATE` transactions and one for WAL, each with the risks the research found (rollback-on-drop at early returns; other writers' 5 s busy timeout; `import_store`'s file copy under WAL; the invariant's wording), and the measured figures after B2–B4 that decide whether either is still needed.
**Commit:** `docs(perf): what the scan still costs, and the two changes left on the shelf`.

### Task B6: Bring Phase B into `main` (after H1 and A10)

- In the worktree: `git rebase main` (the main checkout's `main`), rerun all four gates there.
- From the main checkout: `git -C /Users/karthik/Work/Labs/hanger-ai merge --ff-only perf/scan`, then `git log -1 main` to confirm it moved. If a peer or Karthik holds uncommitted edits in a file the merge must update, stop and ask (`shared-checkout.md`).
- Rerun all four gates in the main checkout. Then `git worktree remove /Users/karthik/Work/Labs/hanger-ai-perf` and delete the `perf/scan` branch only after confirming `main` contains it (`git branch --merged main`), and say so in the report.

---

## Phase C — the real machine

### Task C1: Prove the switches on Karthik's config (H2, human-gated per write)

For each engine, ask Karthik in the conversation before the write, then:
1. Codex: `codex mcp list` → switch one server off in Hanger (Engines screen) → `codex mcp list` shows `disabled` → diff the backup against the file (one line) → Undo → `codex mcp list` and `shasum` match the original.
2. Claude Code: the same with `claude mcp list`; confirm the server appears in "Switched off" in the MCP servers list while off; switch back on.
3. Gemini CLI: the same with `gemini mcp list` (in a trusted folder).
4. OpenCode (ruling 15), **only at a moment when losing this session's MCP servers would not matter** (the executor may itself run in OpenCode, and `opencode reload` reloads its servers): copy `~/.config/opencode/opencode.json`, set `"enabled": false` on one server by hand, `opencode reload`, `opencode mcp list`, restore the bytes, confirm the hash. If it reads as off, add OpenCode's `SWITCHES` row (`EnabledKey`, `[Global]`, with the version and date) in its own commit with a test; if ambiguous, report and leave it read-only.
5. When a change applies (ruling 19): for each switchable engine, in a real signed-in session, switch a server off and note whether the running session still lists it. Set `applies` only for what was seen (a Rust change in `context.rs`, its own commit with a test).
6. Build the release app (`bun run tauri build`), open it from Finder, switch one Claude Code server off and on (proves the CLI is found without a terminal's PATH).
- Screenshots and per-kind counts before and after (`shared-asset-machinery.md`).

### Task C2: Report and stop

One report to Karthik: what was built (commits), evidence per task (red/green, mutation reds, gates verbatim), ledger rows, screenshots, everything left (H3 app checks, slice 2 onwards), and anything that contradicted this plan. Then wait for H4.

---

## Review focus (for the executor's own reviews)

1. **A switch on a stale screen.** Karthik switches a server off in the Engines pane while a rescan is running. Expected: the reply's context drives the row immediately; the rescan's completion refetches and agrees.
2. **Double click.** Expected: one `set_mcp_server_enabled` call (`busyKeys`).
3. **Undo after the file moved on.** Expected: `not_undoable` line, nothing written (backend already pins it; the UI must show the line, not swallow it).
4. **A kept server whose name is also declared elsewhere.** Expected: it appears both as a normal row (the other engine) and in "Switched off"; the header count counts only the normal row.
5. **A switched-off Claude Code server's inspector.** Expected: until the rescan completes, the inspector still shows it from the old inventory with its row now Off; after the rescan it is reachable from "Switched off" and the Engines screen.
6. **Phase B keeps the scan's contract.** Expected: identical inventory and per-kind counts before and after on the same fixture; every existing scanner, migration, link and contention test green untouched.

## Out of scope

Slice 2 (per-project switching, project picker), add/remove/Registry (slice 3), profiles and the backup screen (slice 4), skills (slice 5), the gateway (slice 6), engine status (`docs/plans/2026-11-24-tool-manager-phase-a.md`), transactions and WAL in the store, a `role="switch"` component, and any change to the four app hosts before H3.
