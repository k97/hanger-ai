# Decisions, round 4: real-config checks and two leftovers

## Checks on your real config (C1)

All done through the dev app's remote-control link, which never moves your mouse:

- **Codex:** `tauri` switched off; `codex mcp list` showed it disabled; the file had gained one line, `enabled = false`. After Undo the file was byte-for-byte the original.
- **Claude Code:**
  - On `tauri` Hanger refused and wrote nothing: "Claude Code wouldn't give this server back unchanged, so Hanger left it on." Its entry holds the whole command in one string with no arguments, and Claude Code's own add command would split it. That's the safety check working.
  - On `cua-driver` it worked: Claude Code reported no such server, Hanger showed it under "Switched off" with "1 off", and after Undo the entry matched the original exactly.
- **Gemini:** Hanger created `~/.gemini/mcp-server-enablement.json`, Gemini's own on/off file. In a trusted copy of your config, Gemini then read `tauri` as Disabled, and without the file as on. On your real config, Undo deleted the file and `settings.json` stayed byte-for-byte the same.
  - Your real Gemini lists every server as off in untrusted folders, and none of your folders are trusted, so I ran that check in a copy.
- **Rescan on your machine:** about 2.3 s on the debug build when the machine is quiet (2.1–2.5 s over three runs). Two earlier runs of 57 s and 103 s were taken while other agents were loading the CPU, so I discarded them.

## Still to do

:::question
The release-build check needs about 2 minutes of your mouse. How should we do it?

It builds the real app, opens it from Finder and switches one Claude Code server off and back on. It's the only way to prove the app finds `claude` without a terminal's PATH. The release app has no remote-control link, so the clicks have to be real. I'll build it once the engine-id cleanup that's still running is merged.

- [ ] Tell me when it's built and I'll step away for 2 minutes
- [ ] I'll click it myself, from a three-step checklist
- [ ] Skip it for now

Recommended: Tell me when it's built and I'll step away for 2 minutes
:::

:::question
A test fix took away the only check that catches a heading counting rows itself. Add a rule that catches it?

The "Switched off · N" heading must print the count the backend sends. The old test caught a heading that counted the rows on screen instead, but only by feeding a count the backend can never send (your Q11 answer replaced it). The app's existing no-frontend-counting rule could flag `.length` in a heading. That changes a guard, so it needs your word.

- [ ] Extend the no-frontend-counting rule to catch `.length` in a heading
- [ ] Leave it

Recommended: Extend the no-frontend-counting rule to catch `.length` in a heading
:::

**Noticed, no decision needed:** with Claude.ai picked, Claude.ai's own icon doesn't lead the server rows as it should, which suggests its reach isn't matched. The engine-id cleanup now running changes exactly that, so I'll check it again once it lands.
