# Context control, slice 1: report (C2)

Local `main` at `b0fe85b`: 91 commits ahead of `origin/main`, **not pushed**. Screenshots: `docs/evidence/2026-11-25-engines-ui/` (33 files, git-ignored).

## Checks on the final tree
| Check | Result |
|---|---|
| `npx vitest run` | 161 files, 1,552 tests passed (`b0fe85b`) |
| `bunx tsc --noEmit` | exit 0 |
| `cargo test` | 887 passed, 0 failed (after the engine-id cleanup; no Rust changed since) |
| `gitleaks` (both) | no leaks found |

## What was built
- **Switching an MCP server per engine:** off and on, with Undo, for Codex, Claude Code and Gemini, with safety checks before every write.
- **Global seen by engine:** the separate Engines screen became engine chips on every Global tab.
  - With an engine picked, the summary shows that engine's cost: "≈ N tokens every session", with skills, rules and subagents marked "Not measured". The list shows only what that engine can see, with a folded "Not loaded by {engine}" group after it.
- **Switches on each MCP server row:** the engine icons switch it. Three icon looks: off, another engine, and can't switch.
- **One switch in the server panel's header** for every engine: "On" / "Off" / "On in some", with one Undo for the whole change.
- **Switched-off servers** open in the server panel with "Switched off {time}", the "still declared" line with "Show it", and a switch to turn them back on.
- **⌘K:** typing a server's exact name opens it on Enter; its Switch actions sit one ↓ below.
- **Scan speed (Phase B):** on the test data, a scan went from 2,015 ms to 312 ms on the debug build, and opening a server panel from 290–590 ms to about 50 ms.
- **Cleanup from the T3 Code review:** one store for each engine's context, exact engine ids, and the old engine summary removed. About 1,000 lines gone.
- **Fixes:**
  - the `~/.cursor` engine-root overwrite
  - a slow first launch hiding `claude`
  - the dev app reloading on doc and test edits
  - two tests that failed when the machine was busy
  - the impossible count-of-7 fixture
  - a counting rule for headings

## Real machine
| Check | Result |
|---|---|
| Codex | `tauri` switched off (one line, `enabled = false`), then Undo: the file is byte-for-byte the original |
| Claude Code | `tauri` refused safely, nothing written. `cua-driver` switched off, shown under "Switched off", then Undo: entry identical |
| Gemini | Off through `~/.gemini/mcp-server-enablement.json`; Undo deleted it, and `settings.json` is unchanged. Confirmed in a trusted copy, because your Gemini disables every server in untrusted folders |
| Release build, opened as Finder opens it | Found `claude`; `cua-driver` switched off, then Undo: entry identical |
| OpenCode | **Left read-only.** 2.4.1 reads `opencode.json` and converts the old `enabled` key to the new `disabled`, but `opencode mcp list` says "No MCP servers configured" (it asks the running server, which hosts this session). Ambiguous, so no write was made and nothing was reloaded |
| Rescan, debug dev app | median 2.3 s (2.1–2.5 s) on a quiet machine |

## Found and logged, not fixed (`.claude/rules/known-debt.md`)
- **Claude.ai connectors** have no reach entry for Claude.ai, so its icon can't lead their rows. Fixing this needs a ruling on what "reaches" means for servers that run on the vendor's side.
- **The release build's first launch** stayed on "Scanning" for over 8 minutes with every thread idle. The second launch scanned normally.
- **The server panel measures automatically when it opens,** and that tried to start `computer-use`, which is switched off in Codex. It's existing behaviour, but worth a ruling: should a switched-off server ever be started?
- **Hygiene from the information-architecture review:** the unreachable Agents tab, RepoPane's Unlink dialog that can't be reached, and similar. All of it is in the debt file.

## Later (your T3 Code review answers)
- Phase 2: per-engine totals for skills, rules and subagents. It starts by measuring whether `disable-model-invocation` and `skillOverrides` keep a skill out of Claude Code's startup list.
- Engine chips for engines with no MCP server.
- Splitting `scan_targets`.
- Per-project switching (slice 2).
- Profiles as named on/off sets (slice 4, direction recorded).

## Two wordings that need your word
:::question
When a server is off in every engine, a click on the header switch turns it back on, but its tooltip reads "Switch {server} off in every engine". What should the tooltip say?

- [ ] "Switch {server} on in every engine" when it's off, and the approved line otherwise
- [ ] Keep one line for both states

Recommended: "Switch {server} on in every engine" when it's off, and the approved line otherwise
:::

:::question
Undoing a header switch that turned a server back on reads "{server} is off for Codex, Claude Code and Gemini again." It's built from approved pieces, but nobody approved it as written. Keep it?

- [ ] Keep it
- [ ] Use "{server} is off for Codex, Claude Code and Gemini." (no "again")

Recommended: Use "{server} is off for Codex, Claude Code and Gemini." (no "again")
:::

## Push
:::question
Push `main` (91 commits) to GitHub?

This publishes the work. No tag is made, so no release build starts.

- [ ] Push now
- [ ] Not yet

Recommended: Push now
:::
