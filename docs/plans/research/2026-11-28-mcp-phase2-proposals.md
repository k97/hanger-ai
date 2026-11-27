# Research: MCP phase 2, proposals approved in Hanger (2026-11-28)

Piece 1 of 8 for the harness design (T20). Research, not a plan. Nothing in the repo was changed.

## 1. What it is and why

Karthik asks his own engine to "switch the github server off for Codex". The engine calls Hanger's MCP server. The server files a proposal and changes nothing. Hanger's window shows Hanger's own statement of the change, Karthik approves it, and the app makes the change with the switch code it already has, so every write gets a receipt and an Undo. This is the first write a model can ask for. Phase B's in-app agent would reuse the same path (2026-11-26 positioning: "proposing changes Karthik approves").

## 2. What exists today

- **Phase 1 shipped (v0.8.0).** `mcp_server/mod.rs` → `TOOLS` (5 tools), `RateLimit` (30 calls per 10 s), and `tools.rs` → `scanned()`. Every read goes through `scanned()`, which opens the store read-only and refuses with `NotScannedYet` until the preference `preferences::LAST_SCAN_KEY` (`last_scan_completed_ms`) exists. Outgoing ids go through `public_key`, which sanitises the path and passes the name through `public_name`.
- **The writes it would call:** `mcp::switch::ops::set_enabled_for` and `undo_for` (receipt prefixes `file:`, `kept:`, `restored:`), and `skill_switch::ops::set_enabled_for` and `undo_for` (`skill:`, `kept-skill:`, `kept:`, `restored:`). `ops::switch` already checks the key against the engine's context and refuses `WrongEngine`/`ReadOnly`. `registry.rs` → `SWITCHES` has 4 rows (grep): codex `EnabledKey`, claude-code `ClaudeCli`, gemini `GeminiEnablementFile`, antigravity `DisabledKey`.
- **Surfaces:** `SwitchNotice.tsx` is the black pill with Undo that follows every switch (`useMcpSwitch`). `SearchPalette.tsx` already has a "Switch" action group. `ReviewInspector`/`NeedsReviewPane` hold the findings derived in the frontend. `OverviewCard.tsx` is on Global and on repositories.
- **A watcher dependency with no live watcher:** `notify = "6.0"` is in `Cargo.toml`. `watcher.rs` → `TrackedCopyWatcher` is compiled and tested (`scanner_tests.rs`), but nothing under `src/` constructs it.
- **Binding rulings** (`docs/plans/2026-11-27-hanger-mcp-server.md` → Answers): Q3, approve in Hanger's window, the app applies; Q7, no free text, and the model's choice of item is not model output; Q8, writes come after phase 1's live proof. G2 has passed (`…-g2.md`). So phase 2 is **not** blocked on Q8. The memory note saying it is predates the Answers section. T23 (ask about A2UI before any model output reaches the screen) still stands.

### Stale assumptions in Tasks 8 to 11, against the tree today

1. **"`a_sanitised_key_is_matched_back_exactly`" cannot hold.** `public_key` caps the name at 128 characters, and the code admits a collision (`tools.rs`, the `shortcut:` comment from `d4e0969`: two names that share their first 127 characters share one id). A path outside home sanitises to its basename (the comment in `reach`). A public id can therefore match zero, one or several real keys. Fix: when the proposal is filed, resolve the id against the live context, require exactly one match, and write the **real** key into the 0600 proposal file. The engine only ever sees the public form.
2. **`Ask::Skill { key: "skill:<name>" }`:** no tool gives a model a `skill:` key. `find_assets` returns asset ids, and `reach` now takes `asset_id` (round 39). The skill ask should take `asset_id`, expand `~/` and resolve it through `switch_info_for`. `kept-skill:` keys are not visible to the model at all.
3. **`Ask::Undo { receipt_id }`:** the model sees a receipt id only in `get_proposal`'s reply for its own proposal. `propose_undo(proposal_id)` is simpler and cannot name someone else's receipt.
4. **The preview assumes `edit::set_enabled` on the config.** Gemini writes `~/.gemini/mcp-server-enablement.json` through `edit::gemini_set_enabled`, not its config. Antigravity CLI, added since the plan was written, is a fourth switchable engine (`DisabledKey`). Task 9's tests cover only Codex and Claude Code.
5. **Task 9's wrappers leave out `skill_switch_projects(&app)`,** which `set_skill_enabled` needs.
6. **The scan gate is unstated for the new tools.** Run them through `scanned()` too: skill ids come from the store, and the app has to be open to approve anyway.
7. **The copy goes false.** `strings::INSTRUCTIONS` says "Nothing here changes a file", `docs/mcp-server.md` says the server "never changes a file" and "Five tools". Once the server writes proposal files, all of that has to move through the naming brief.
8. The `vendor.rs:330` and `:544` argv citations still resolve (checked). Cite the symbols instead.

## 3. Outside facts (read 2026-11-28)

- **MCP 2026-07-28 elicitation** ([spec](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation.md)): carried in an `InputRequiredResult` (MRTR), so it is not a request from the server. Form and URL modes. Clients "MUST… make it clear which server is requesting information". Servers "MUST NOT use form mode… [for] sensitive information".
- **Claude Code 2.1.332, measured.** A logging fake server on a throwaway `HOME`, run through `claude mcp list`, received `server/discover` with `clientCapabilities: {"roots":{"listChanged":true},"elicitation":{"form":{},"url":{}}}`. It then fell back to `initialize` with protocol `2025-11-25` and the same capabilities, and `clientInfo.name: "claude-code"`.
- **Gemini CLI 0.56.0, code read.** The bundle's `connectToMcpServer` registers only `roots: {listChanged: true}` (no elicitation) and handles `ToolListChangedNotificationSchema`. `gemini mcp list` on a throwaway home showed the server as "Disabled" and did not connect.
- **Codex 0.172.0:** `codex mcp list` does not connect, so the capability was not measured. The binary contains elicitation-handling strings (`ElicitationAbandoned…`). The [Codex MCP page](https://learn.chatgpt.com/docs/extend/mcp) does not mention elicitation. It documents `default_tools_approval_mode` (`prompt`, `writes`).
- **agy 1.5.18 and OpenCode 2.4.2:** only SDK strings found (`elicitation/create`, `tools/list_changed`). Gemini's bundle also carries SDK schemas while declaring nothing, so strings are not evidence of support. Not measured.
- **mcpick's MCP server** (`src/mcp/tools-mutations.ts`) writes directly with no approval: `mcpick_enable`/`disable`/`remove`/`add`/`add_json`, with secret warnings and `from_env` so secret values stay out of tool arguments.

So elicitation would reach Claude Code alone today. Q3 stands.

## 4. Options

**Where a proposal appears and how it is approved**

- **A. Notice pill plus an inspector band** (pick). When a proposal arrives, a pill in the `SwitchNotice` band (in every view) reads "Claude Code asks to switch *github* off for Codex · Review". Review opens that item's own inspector, MCP server or skill, with a band at the top. The band shows the preview (`changed_lines`, or the literal `claude mcp …` argv) and Approve / Decline. Approving goes down the existing switch path, so the same pill then carries Undo. ⌘K adds a "Review waiting change" action. Cost: one new band component and a variant of the pill. The person decides with the item's per-engine switches and costs in view.
- **B. A Needs review kind.** Cheap to find, but a proposal is a request, not a finding. Needs review counts are derived in the frontend, and Karthik has kept non-findings (such as "Update available") out of it.
- **C. A line on the overview card.** Visible on Global and repositories only, so it misses the other views. Better as a later echo of A than as the surface itself.

**How the app learns of a proposal**

- **Poll** `list_mcp_proposals` every 3 s while the document is visible and on focus (pick, and the plan's choice). It lists at most 5 small files, adds no event, and the README's "three events" stays true.
- **A `notify` watcher** on `<data>/mcp/proposals`. The crate is already installed, but no watcher runs today. It adds a fourth event (`readmeCounts.ts` hard-codes "three events") and a lifecycle to own. Worth it only if proposals should reach a hidden window, which they don't need to.
- **The scan:** too slow (launch or Rescan). Ruled out.

**Elicitation, as an addition only:** later, Claude Code could wait on an `InputRequiredResult` and retry once Hanger has applied the proposal, so the model doesn't poll `get_proposal`. It works for one engine only and is not needed. Deferred.

## 5. Shared machinery and collisions

- `mcp::switch::ops` (`set_enabled_for`, `undo_for`, receipts): **slice 2** (per-project overrides change the key space), **slice 3** (add/remove add ops and receipts), **slice 4** (profiles apply sets of switches), **slice 6** (the gateway changes where a switch lands).
- `skill_switch::ops`: **slice 5**.
- `mcp_server` (new tools, `strings`, the rate limit): **phase B** (its in-app agent needs the same proposal queue and approval surface, and that is the biggest overlap) and **T19** (any status tool).
- `SWITCHES`/`HOSTS`: proposals take an `engine_id` only from `SWITCHES`, so a slice that adds a row widens what can be proposed. It needs a test per kind.
- Store schema: none. Proposals are files under `<data>/mcp/proposals`, because the server's store connection is read-only by design (Decision 12). No `user_version` bump. The README `ipc` figure gains 2 commands and the `tests` figure 1 file.
- Overview card: untouched under pick A.

## 6. Depends on / unblocks

**Depends on:** nothing unbuilt for on/off/undo. Phase 1 and G2 are done, and Q8 is answered. Make `Ask` an enum that slices 3 and 4 extend rather than replace. **Unblocks:** phase B (its write path is this queue) and model-driven use of slices 3 and 4.

### Verbs beyond on/off and undo

Every verb takes **identifiers Hanger resolves, never values**. That keeps Q7's ruling true and T23 untriggered.

- Slice 3: `remove(engine_id, id)` (with an Undo receipt); `copy(id → engine_id)`, where the values come from the source file and never pass through the model; `add_from_registry(engine_id, registry_name, version)`, where Hanger fetches the entry. Required secrets are typed into the approval band in Hanger, never by the model.
- Slice 4: `apply_profile(profile_id, engine_id)` as one proposal holding several asks. They apply in order and stop at the first failure, each with its own receipt, plus "Undo all".
- Never: a free-form add (mcpick's `add_json`, or a model-written command, args or env). That is model output, and it carries secrets. Never a proposal that writes an engine's approval settings (research rule 4).

## 7. Questions only Karthik can answer

1. **Where does a waiting proposal show?** (a) The notice pill plus an inspector band, with ⌘K. (b) A Needs review kind. (c) The overview card. **Pick: (a).**
2. **Who does the approval line say is asking?** (a) The engine's name, mapped from MCP `clientInfo.name` through a fixed table ("claude-code" → Claude Code), with "An engine" when there is no match. The name is client-supplied and never shown raw. (b) Always "An engine". **Pick: (a).** The spec asks clients for the mirror of this.
3. **When Hanger isn't running:** (a) The tool reply says "Open Hanger to approve this", and the proposal expires after 10 minutes. (b) The server opens Hanger in the background (`open -g -b com.rkarthik.hanger`), which means starting a process, and Decision 3 rules that out. **Pick: (a).**
4. **Which verbs go in phase 2, and which wait for slices 3 and 4?** (a) Phase 2 ships on/off/undo, and each slice adds its identifier-only verbs. (b) Hold phase 2 until slices 3 and 4 exist and ship them together. (c) Also allow a free-form add, which triggers T23 and lets secrets pass through the model. **Pick: (a).**

## 8. Size

Six tasks: proposal filing with id resolution and the 0600 files; approval and preview for 4 engines plus skills; the copy update (`INSTRUCTIONS`, `docs/mcp-server.md`, tool strings); the band, the pill variant and the ⌘K action; polling and the count from the backend; the live proof. Human gates: **G3** (layout options at true width, plus a naming brief for every new string: the band, its buttons, the pill line, "open Hanger to approve", the three tool names) and **G4** (a live write and its Undo in one engine, per kind, with per-kind counts before and after). Slices 3 and 4 add one verb task each in their own plans.

Not checked: whether rmcp 3.12 exposes the client's `clientInfo` to `call_tool` (Q2 depends on it). Codex, agy and OpenCode's elicitation capability was not measured.
