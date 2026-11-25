# Decisions, round 6: wording for the switch that covers every engine

**Answered by Karthik, 2026-11-25:** all three as recommended — "Switch {server} off in every engine"; "{server} is off for Codex, Claude Code and Gemini."; "Still on for Cursor and VS Code. Hanger can't switch those yet." (a refusal shows today's refusal line instead).

You approved how the header switch works, and the labels beside it: "On", "Off", "On in some". It still needs three more pieces of wording, which you left unticked last round. Here are alternatives, with the version from last round as the first choice where it applies.

:::question
The switch's accessible name and tooltip (what VoiceOver reads, and what shows on hover)

- [ ] "Switch {server} off everywhere Hanger can"
- [ ] "Switch {server} off in every engine"
- [ ] "{server} in every engine"

Recommended: "Switch {server} off in every engine"
:::

:::question
The notice after the switch, with its Undo. Today one engine's notice reads "cua is off for Codex."

- [ ] "{server} is off in Codex, Claude Code and Gemini."
- [ ] "{server} is off for Codex, Claude Code and Gemini." — the word "for", as today's notice uses
- [ ] "{server} is off for 3 engines." — shorter, but the 3 is the app's own count

Recommended: "{server} is off for Codex, Claude Code and Gemini." — the word "for", as today's notice uses
:::

:::question
What the notice adds when some engines were left on

When Hanger can't switch an engine yet, or an engine's safety check refused, as with Claude Code's `tauri` today:

- [ ] "Still on for Cursor and VS Code." — short, no reason
- [ ] "Still on for Cursor and VS Code. Hanger can't switch those yet." — the reason for engines Hanger doesn't support yet; for a refusal, today's refusal line is shown instead
- [ ] Nothing — the per-engine rows in Details show which are still on

Recommended: "Still on for Cursor and VS Code. Hanger can't switch those yet." — the reason for engines Hanger doesn't support yet; for a refusal, today's refusal line is shown instead
:::
