# Decisions, round 2: after Phase 1 of "Global, seen by engine"

Phase 1 is on local `main` (`a46cb17`, `2341e99`), not pushed. On `main`: 1,497 tests pass, type check clean, no leaks. Screenshots are in `docs/evidence/2026-11-25-engines-ui/` (files 40–44).

**What I'm doing while you answer:**
- **The three design fixes (Q1–Q3)**, on a separate branch. They reach `main` only if you say yes.
- **Dev reload fix.** The dev app ignores docs and test files, so it stops reloading and getting stuck. This changes development only.
- **The T3 Code review (C3)**, which reads code and changes none. You said to do it after an approximate measure, so it's ready when you want it.

## The engine view today

![Engine mode, MCP servers tab](../evidence/2026-11-25-engines-ui/41-engine-mode-mcp.png)

:::question
Make the engine summary shorter?

With an engine picked, the summary fills the top half of the pane, so the list starts below the middle. Three of the four boxes say only "Not measured", and the Measure all note takes two lines.

Where: the summary at the top of Global, with an engine picked

Before: four boxes in a 2×2 grid (MCP servers ≈ 13,598 · Skills, Rules and Subagents each "Not measured"), then Measure all with its two-line note beside it

After: one box for MCP servers, then one quiet line, "Skills · Rules · Subagents: Not measured". Measure all's note moves into its tooltip.

- [ ] Yes, make it shorter
- [ ] No, keep the four boxes — each kind stays visible until Phase 2 fills it

Recommended: Yes, make it shorter
:::

:::question
Put the engine chips first?

The chips decide what every number on the page means, but they sit below those numbers. You read the total before you can see which engine it belongs to.

Where: Global, the row of engine chips

Before: tabs, then the total and the boxes, then the engine chips at the bottom of the summary

After: tabs, then the engine chips, then the total and the boxes

- [ ] Yes, chips straight under the tabs
- [ ] No, keep them at the bottom of the summary

Recommended: Yes, chips straight under the tabs
:::

:::question
Make an engine's icon on a server row show off, another engine, and can't-switch differently?

Today all three just look faded, so you can't tell a server that's off for Codex from a Codex icon dimmed because you picked Claude Code.

Where: the engine icons on each MCP server row

Before: off = faded with a ring · another engine (engine picked) = faded · Hanger can't switch it = faded

After: off = outline only, no fill · another engine = faded · can't switch = faded, with the reason on hover

- [ ] Yes, three different looks
- [ ] No, leave them

Recommended: Yes, three different looks
:::

## Wording

:::question-multi
Which of these labels do you approve?

They're built from labels you've already approved, but none has been approved as written. Anything you leave unticked stays off the screen.

- [ ] "Not measured · {engine}" — the headline when nothing for that engine has been measured
- [ ] "≈ {n} tokens every session · {engine}" — the engine name after the approved headline
- [ ] "Switched off 4 min ago" — when the server was switched off, in its details
- [ ] "A config file still declares a server named {server}." then a "Show it" link — in a switched-off server's details
- [ ] "Runs on Anthropic's servers. Hanger can't measure it from this machine." — for Claude.ai, where "0 of 12 servers measured" now implies something that can't happen

Recommended: "Not measured · {engine}", "≈ {n} tokens every session · {engine}", "Switched off 4 min ago", "A config file still declares a server named {server}." then a "Show it" link and "Runs on Anthropic's servers. Hanger can't measure it from this machine."
:::

:::question
When a message names a config file whose path Hanger doesn't know, it says "the file". Keep that?

For example, "Hanger changed the file." This only happens when the backend returns no path.

- [ ] Keep "the file"
- [ ] Say the engine instead: "Hanger changed Codex's config"

Recommended: Say the engine instead: "Hanger changed Codex's config"
:::

:::question
⌘K shows the "MCP servers" heading twice when you type an exact name that other servers also match ("cua" also finds "cua-driver"). Fix it?

Once above the exact match at the top, once lower down for the rest.

- [ ] Leave it
- [ ] Label the top one "Exact match"

Recommended: Leave it
:::

## Your real machine

:::question-multi
Which real config changes may I make for the final check (C1)?

Each one switches one server off in Hanger, checks the engine's own list shows it off, then switches it back with Undo and checks the file is byte-for-byte the same. I'll write down each server before I touch it.

- [ ] Codex — one server, off and back on
- [ ] Claude Code — one server, off and back on (it shows in "Switched off" while off)
- [ ] Gemini — one server, off and back on
- [ ] Release build — build the app, open it from Finder, switch one Claude Code server off and on
- [ ] OpenCode — a hand edit to test whether it can be switched. This session runs in OpenCode and can lose its own servers, so only at a moment you pick.

Recommended: Codex — one server, off and back on, Claude Code — one server, off and back on (it shows in "Switched off" while off), Gemini — one server, off and back on and Release build — build the app, open it from Finder, switch one Claude Code server off and on
:::

:::question
May I click around in the dev app whenever I need to, as long as I don't flip a switch or press Measure?

Taking screenshots and timing a real rescan means clicking, and when you're using the mouse at the same time my clicks go astray. Twice today one opened the wrong screen.

- [ ] Yes, any time
- [ ] Only when I say I've stepped away

Recommended: Only when I say I've stepped away
:::

## Left over from before

:::question
The `~/.cursor` bug: linking it as a folder overwrites the record that says it's Cursor's global config. Fix it now?

The scan work found it. Hanger then sees Cursor's own settings as a plain linked folder.

- [ ] Fix it next, as its own small task with a test
- [ ] Log it as known debt for later

Recommended: Fix it next, as its own small task with a test
:::

:::question
Two design-system tests sometimes fail when the machine is busy, then pass when run again. What should I do?

- [ ] Find the cause next, as its own small task
- [ ] Log them as known debt

Recommended: Find the cause next, as its own small task
:::

:::question
One test hands the switched-off list a count of 7 that the backend never sends. Change it?

It's harmless, but it gives a misleading picture of what the backend returns.

- [ ] Use a count the backend could really send
- [ ] Leave it

Recommended: Use a count the backend could really send
:::

:::question
Do you want a speed target for the scan?

On the test data a scan went from about 2,015 ms to 312 ms, and opening a server panel from 290–590 ms to about 50 ms. I haven't timed your real machine yet.

- [ ] No target for now
- [ ] Under 1 second on my machine
- [ ] Under 500 ms on my machine

Recommended: No target for now
:::
