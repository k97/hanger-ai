# Round 35: the `cua` check didn't reach the file

Round 33 came back "All as described", but nothing on disk shows the switch
happened:

- `~/.gemini/config/mcp_config.json` is byte-identical to the copy taken at
  20:34. It was last written on Nov 26 at 16:14, and `cua` has no `disabled`
  key.
- Hanger's switch backups and receipts are from 08:19 this morning or
  earlier. Every switch writes one first, so none was made tonight.
- At 20:41 the dev window (`Hanger AI (dev)`, pid 49439) showed Global with
  nothing selected and "Scanned 4 min ago". `cua`'s detail wasn't open.

One possible cause: the installed **Hanger AI** app is also running, and it
predates this branch. It has no Antigravity CLI row, so a switch made there
can't reach `agy`'s file. The window to use is titled **Hanger AI (dev)**.

:::question
What happened with the `cua` check?

- [ ] I haven't run it yet — I'll run it in `Hanger AI (dev)` now, then answer here
- [ ] I ran it in the installed Hanger AI app — I'll run it again in the dev app
- [ ] I ran it in the dev app and `agy` showed `cua` disabled — say what you saw in a note

Recommended: I haven't run it yet
:::

## Answer (Karthik, 2026-11-27)

**I haven't run it yet.** In round 38 (on the MCP server branch) he then had
the agent run the check. Results, 22:01 to 22:02:

- `Hanger AI (dev)` (pid 49439, driven through the dev bridge), `cua` › Details
  › Registered in: the Antigravity CLI toggle went from pressed to not
  pressed, and `mcp_config.json` gained `"disabled": true` in `cua`'s entry.
- `agy mcp list`: `cua  stdio  disabled`. `gemini mcp list`: `cua` Disabled.
  It was already off for Gemini CLI from 08:19 this morning, and
  `~/.gemini/mcp-server-enablement.json` didn't change. So the Antigravity
  switch left Gemini CLI's state alone.
- Switched back on: `agy mcp list` shows `cua  stdio  enabled`. Against the
  20:34 copy, 1 of the 4 entries changed. `cua` gained `"disabled": false` and
  every other key is equal. This is the plan's expected one-line diff.
- Not proven: `/mcp` inside a live `agy` session. It has no headless form.
- Per-kind counts after the check equal the 21:22 baseline in every row.
- Screenshots: `docs/evidence/2026-11-27-antigravity-engine/06*` (off) and
  `07*` (on). An earlier off frame showed the toggle drawn on while the DOM
  read off. It was taken without focus, so it was discarded and retaken.
