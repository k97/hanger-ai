# Round 44: the eight plans, reviewed

All eight plans from the [harness design](2026-11-28-harness-design.md) are
written. Each was reviewed by a fresh reviewer, and every one of them came
back "Needs answers". Most of what they found falls under the design's owner
rule, or is a plain fix. Those are settled in
[the reconciliation rulings](research/2026-11-28-reconciliation-rulings.md),
and one agent is applying them to all eight plans now. Three of them are my
calls, marked "My call" in that file:

- an agent run may have at most 2 proposals waiting at once, so your own
  engines always keep 3 slots;
- the agent's Claude runs with a throwaway home folder;
- Hanger also reads Claude's other per-project lists.

These eight questions change what gets built, so they're yours.

| Plan | Tasks |
|---|---|
| P1 MCP phase 2 | 6 |
| P2 per-project | 10 |
| P3 add, remove, Registry | 19 |
| P4 Recent changes, profiles | 11 |
| P5 skills, plugins | 18 |
| P6 spike, applies line | 11 |
| P7 engine status | 11 |
| P8 phase B | 15 |

:::question
Q1. The `list_changed` spike registers a test server called `spike` in your real engines. If Hanger scans while it's registered, its row stays in your inventory for good, because reaping is off. How should the runs go?

- [ ] Quit Hanger, the release app and the dev app, for each run. The spike never gets scanned, so the counts stay unchanged.
- [ ] Keep Hanger running, and accept one leftover `tool` row per engine, listed in the run report

Recommended: Quit Hanger for each run
:::

:::question
Q2. Your Q12 bar is "Claude Code and one other engine drop a removed tool". Claude Code has a tool-search mode that changes how it loads tools. Does Claude Code have to pass in both modes, or is one enough?

- [ ] Claude Code's default mode is enough. The other mode is recorded but doesn't decide.
- [ ] Both modes, as the plan reads it now

Recommended: The default mode is enough
:::

:::question
Q3. Phase B's agent needs "read proposals", for when it asks to read outside its scope. Your Q10 list doesn't include them, and the action list can only grow, never shrink. Add `Read`?

- [ ] Yes. A read outside the scope becomes a proposal you approve, as the design says.
- [ ] No. Phase B's agent never reads outside its scope.

Recommended: Yes
:::

:::question
Q4. Phase B's fallback for the Anthropic key is your `apiKeyHelper` (Q11). Passing it means putting that setting on Claude's command line, where `ps` can see it, and it can hold a literal key. What should happen?

- [ ] Drop the fallback. Phase B needs `ANTHROPIC_API_KEY` in your shell, and says so when it's missing.
- [ ] Keep it, passing only the path to your own settings file, never its contents
- [ ] Keep it as planned

Recommended: Drop the fallback
:::

:::question
Q5. `gh skill` has no uninstall command. Your Q6 says Undo runs the reverse command. What should Undo do after `gh skill install`?

- [ ] Switch the skill off into Hanger's keep, like any skill switch, so it can be switched back on
- [ ] Delete the installed folder
- [ ] No Undo for a skill install

Recommended: Switch the skill off into Hanger's keep
:::

:::question
Q6. `claude plugin update` has no reverse either. Should plugin updates ship without an Undo?

- [ ] Ship it, and say in the confirmation that an update can't be undone
- [ ] Hold plugin updates until there's a way to undo one

Recommended: Ship it, and say it can't be undone
:::

:::question
Q7. Claude Code caps its whole skill listing at 1% of the context window, and past that it drops the descriptions of the skills used least. So adding up every description overstates what loads. What should the Skills figure on the card show?

- [ ] What Claude actually loads: the sum, capped the way Claude caps it, with a note when descriptions are being dropped. A live session check confirms it.
- [ ] The plain sum, labelled "at most"

Recommended: What Claude actually loads
:::

:::question
Q8. Your Q3 answer means the add form never takes a secret, only a variable name. The plan goes further and drops every literal value, so copying an entry like `LOG_LEVEL=debug` from one engine to another loses that setting. What should copying do?

- [ ] Copy values the secret detector finds nothing in, file to file inside the app. The value never reaches the window or a model, and the preview shows only the key name.
- [ ] Drop every literal value, as planned

Recommended: Copy values the detector finds nothing in
:::

:::question
Q9. When the plans are reconciled and pass their re-review, may wave 1 start building? Wave 1 is six worktrees at once:

- MCP phase 2
- per-project overrides (which starts the shared switch-code chain)
- engine status
- `gh skill` and the skill budget
- Recent changes and profiles
- P3's Registry client and detectors

Each track runs task by task, with a fresh review after every task. Each one stops at your gates: naming briefs, layout rounds and live checks.

- [ ] Yes. Wave 1 starts after the re-review.
- [ ] Wait. Show me the reconciled plans first.

Recommended: Yes
:::

## Answers (Karthik, 2026-11-28)

All nine took the recommendation: (1) quit Hanger for each spike run; (2) Claude Code's default mode is enough; (3) add `Read`; (4) drop the `apiKeyHelper` fallback, so phase B needs `ANTHROPIC_API_KEY` and says so when it's missing; (5) Undo of a `gh skill install` switches the skill off into the keep; (6) plugin updates ship without an Undo and say so; (7) the Skills figure is what Claude actually loads, capped, with a note, confirmed live; (8) copying keeps literal values the detector finds no secret in, file to file, never shown; (9) wave 1 starts after the re-review.
