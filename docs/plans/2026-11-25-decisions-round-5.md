# Decisions, round 5: a switch for every engine at once, in the server panel's header

**Answered by Karthik, 2026-11-25:** Q1–Q3 as recommended. Q4 approved only "On" / "Off" / "On in some"; the other wording goes to round 6.

Your Agentation note on the server panel's header: "ideally the mcp switch should be there for global turning off". The switches in Details › Registered in stay as they are, one per engine ("this is good").

Today, turning a server off everywhere means one click per engine in Registered in. The proposal is one switch beside the server's name.

Where: the server panel's header, beside the name and its transport chip

Before: `cua` [stdio]

After: `cua` [stdio] ········· [switch] On

Three behaviours to settle:

:::question
What should the header switch do when some engines can't be switched (Cursor, VS Code, Zed, Claude Desktop today)?

`cua` is registered in Codex, Claude Code and Gemini, which Hanger can switch, and in engines it can't switch yet.

- [ ] Switch every engine Hanger can, and say which ones it left on — "Still on in Cursor and VS Code. Hanger can't switch those yet."
- [ ] Show the header switch only when Hanger can switch every engine

Recommended: Switch every engine Hanger can, and say which ones it left on — "Still on in Cursor and VS Code. Hanger can't switch those yet."
:::

:::question
What should it show when the server is on in some engines and off in others, and what does a click do?

Counting "on in 2 of 3" would be the app counting by itself, which the app's rules forbid without a backend figure. So the label is a word, not a number.

- [ ] Shows "On in some"; a click turns every one off; when all are off, a click turns every one back on
- [ ] Shows "On in some"; a click turns every one on

Recommended: Shows "On in some"; a click turns every one off; when all are off, a click turns every one back on
:::

:::question
How should Undo work after a header switch?

Each engine's switch is written separately and has its own Undo today. One header click can switch three engines.

- [ ] One Undo puts back every engine that click changed
- [ ] Undo only the last engine; the rest stay switched

Recommended: One Undo puts back every engine that click changed
:::

:::question-multi
Which labels do you approve?

- [ ] "On" / "Off" / "On in some" — beside the header switch
- [ ] "Switch {server} off everywhere Hanger can" — the switch's accessible name and tooltip
- [ ] "{server} is off in Codex, Claude Code and Gemini." — the notice, with Undo
- [ ] "Still on in {engines}. Hanger can't switch those yet." — added to the notice when some engines were left on
- [ ] "{engine} refused, so Hanger left it on there." — added when one engine's safety check refused (Claude Code's `tauri` today)

Recommended: "On" / "Off" / "On in some" — beside the header switch, "Switch {server} off everywhere Hanger can" — the switch's accessible name and tooltip, "{server} is off in Codex, Claude Code and Gemini." — the notice, with Undo, "Still on in {engines}. Hanger can't switch those yet." — added to the notice when some engines were left on and "{engine} refused, so Hanger left it on there." — added when one engine's safety check refused (Claude Code's `tauri` today)
:::

I'll build it after the engine-id cleanup now running is merged, because both change the server panel.
