# Reconciliation rulings for the eight plans (2026-11-28)

All eight `stage-gate --plan` reviews came back **Needs answers**. Their
reports are `docs/reviews/2026-11-28-plan-2026-11-28-*-plan.md`. This file
settles what the design's owner table (§5) and the round 43 answers already
decide. The questions only Karthik can answer are in
`docs/plans/2026-11-28-decisions-round-44.md`. Where a plan depends on one of
those, it says "waits on round 44 Q<n>" and builds the recommended option
as the provisional default.

## Owner rulings (the owner's names and behaviour win)

- **R1. Key-level Undo: P4's design wins** (P4 owns `apply`).
  - Its interface is `KeyEdit { key_path, member, present }`,
    `apply::set_member` and `apply::undo_key`, and `apply::undo` routes a key
    receipt to `undo_key`. Use P4's receipt id format.
  - P2 drops `KeyEdit { pointer, item, added }`, `safe_replace_keyed`,
    `undo_keyed`, its own `set_disabled` list editor, and its test expecting
    `apply::undo` to refuse a key receipt. It calls P4's interface instead.
  - P2 adds `~/.claude.json` to `ops::written_for` as P4 expects. A key
    receipt carries its project path, so Recent changes can undo it with no
    project in hand.
- **R2. The vendor-CLI receipt is owned by P4.** There is one type in
  `mcp::switch::apply`: `CommandReceipt`, plus `record_command`,
  `load_command` and `command_receipts_dir`. It holds the reverse program
  and argv (Q6).
  - P5 writes it for `gh skill` and `claude plugin`.
  - P3's Claude Code `add-json` and `remove` write it too, with the reverse
    command. `ClaudeChange` and `claude_changes` are dropped.
  - P4's Recent changes reads it and drops `VendorReceipt`. Undo goes
    through P5's `undo_vendor_change(receipt_id)`, which runs any receipt's
    reverse; rename it if that reads better, and say so.
- **R3. P1 owns `Ask`, proposals, `Preview`, the tools and Gate N.** P3, P4
  and P8 are re-pointed at P1's committed names:
  - one filing function per verb;
  - `Preview { target, change: Change::{…} }`;
  - `Ask` tagged by `verb`;
  - the tools `propose_server_switch` and `propose_skill_switch`.

  There are no `propose`, `get`, `list_waiting`, `changed_lines` or
  `propose_switch` names. Phase B's `AGENT_TOOLS` includes the skill tool.
- **R4. P2 owns `ops`, `context` and `SWITCHES`.**
  - P3 is re-pointed at P2's `Target<'a> { Machine, InProject { project:
    &KnownProject, key } }`, `ReadOnlyReason::RepoFileTracked`,
    `refused_files` and the `project` argument. There is no `git_tracks` and
    no `repo_key`. P2 lists these under "Produced for P3".
  - P3's Task 17 waits on P2's Task 5, which comes after Claude's live
    check, and says so.
  - P6 keeps `EngineContext.applies: Option<String>`, filled with fixed codes
    (`next_turn`, `after_reload`, `next_session`). It adds no `Applies` type
    to `context`.
  - A project context's `applies` is `None` until a run observes per-project
    timing ("no line until observed").
  - P2 says that `get_engine_context` and `get_engine_contexts` become async
    commands.
- **R5. P7 owns `engine_status` and the card.** P7 also lists
  `engine_status::auth::{parse_auth, AuthState}` as produced for P8.
  `src/utils/reviewIssues.ts` is edited by both P3 and P7: P7 goes first and
  P3 rebases, and both plans name each other.

## Fixes, no question needed

- **P1:**
  - The ambiguity test uses names of 129 or more characters.
  - The value-hiding rule becomes an allowlist: after removing the name and
    the six allowed words, only whitespace and `{}[]":,=.` may remain. Add
    tests with digits-only, punctuation and non-ASCII values.
  - Make `scanned` and `measure` crate-visible, and say so.
  - Regenerate the README test count in Task 6.
  - After the in-app Undo, the proposal reads as undone.
  - Skills switch **on and off** directly, as Q10 grants, not on-through-Undo
    only.
- **P2:**
  - Undo of a project file re-runs the git check, and refuses when git now
    tracks the file (Q2).
  - Gemini servers in an untrusted folder show as "needs trust", not on
    (review F6).
  - **My call:** read Claude's other per-project state read-only as well: the
    `.mcp.json` approval lists (`enabledMcpjsonServers` and
    `disabledMcpjsonServers`) and the repo's local-scope servers. Capture
    per-kind counts before and after, because counts move.
- **P3:**
  - Fix Task 9's derive and lifetime so it compiles.
  - `from_entry` passes URLs to the secret check (query and `user:pass`).
- **P4:**
  - A profile load approved through P1's queue resolves `claude` through
    P7's `ENGINE_CLIS`.
  - A partial load records `Applied` with the receipts that landed plus
    `stopped_at`, so the model can undo what landed.
  - Key-level writes keep their pre-write copy for Undo safety, but Recent
    changes never offers a restore for `~/.claude.json` (Q9).
- **P6:** spike runs happen with Hanger quit, pending round 44 Q1. The
  Claude Code pass reading waits on round 44 Q2.
- **P7:**
  - Tasks 9 and 10 stage `App.tsx` as an exact blob, then a bare
    `git commit` (`shared-checkout.md`).
  - The install check tests `Cellar` and `Caskroom` before `node_modules`,
    with a real Homebrew layout fixture.
  - Task 1's plant is `"cursor"`.
  - Add a paragraph to `docs/telemetry.md` naming the daily npm request and
    its off switch, as well as `docs/ipc.md`.
- **P8:**
  - Restate against P1's names (R3).
  - **My call:** an agent run may have at most 2 proposals waiting at once,
    counted inside P1's queue cap of 5, so the user's own engines always
    keep 3 slots. Over the cap, the run gets `slow_down`.
  - **My call:** the Claude child runs with `HOME` set to its run folder.
    Only the agent-mode server sees the real home.
  - The `apiKeyHelper` wording waits on round 44 Q4.
- **Every plan:** fix the non-blocking findings in its review report where
  the fix is mechanical. List the rest under "Known limits".
