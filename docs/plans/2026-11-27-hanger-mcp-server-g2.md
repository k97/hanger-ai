# Gate G2: the MCP server's live proof, 2026-11-27

Run by the agent on Karthik's word in
[round 38](2026-11-27-decisions-round-38.md). Raw streams, screenshots and
counts are in `docs/evidence/2026-11-27-hanger-mcp-server/`, which is
local-only.

## Steps

1. **Baseline (21:22).** `rule global 3, project 19; skill global 574,
   project 218; subagent global 302, project 4; tool global 69, project 2`.
2. **Build.** `cargo build --release` in the worktree at `82aaf26`. A smoke
   test sent only `initialize` and `tools/list`. It answered as
   `hanger 0.7.1` with the five tools, exited 0, wrote nothing to stderr and
   opened no window. `data_dir_for($HOME)` is
   `~/Library/Application Support/com.rkarthik.hanger`, the folder that holds
   the live `hanger.db`. Step 4 confirms it, because the replies carry this
   store's figures.
3. **Add.** The setup page's Claude Code line, with the worktree binary in
   place of `/Applications`, exited 0. `claude mcp get hanger` showed
   `✔ Connected`. This is the first time the line has been run, and it works
   as written. Claude Code 2.1.332.
4. **Five asks**, each in its own `claude -p` session with only
   `mcp__hanger` allowed:
   - **Run 1: every call was refused**, correctly, with "Hanger hasn't
     finished a scan on this Mac yet." The store had no
     `last_scan_completed_ms`. Only this branch's `finish_scan` writes it,
     and no build of this branch had scanned the real store. **Finding:**
     after an update, the server refuses until the new app has finished one
     scan. The refusal text says what to do. Saved under
     `run1-not-scanned/`.
   - This branch's dev app was started. Its scan wrote the key within 15
     seconds, which closes implementer concern 4.
   - **Run 2:** all five were answered. They were compared with the same
     dev app's window, through the dev bridge:

| Ask | Tool calls | Server's reply | Hanger's window | Agree? |
|---|---|---|---|---|
| Engines | `list_engines` | per-engine tokens: Claude Code 9013, Cursor 7673, OpenCode, VS Code and Zed 7294, Codex 2955, Gemini / Antigravity 2712, Claude Desktop 1946, Claude.ai 0 of 12 measured | Overview card: ≈ 9.0k, 7.7k, 7.3k, 3.0k, 2.7k, 1.9k, "Not measured" (`s1-…png`) | Agree |
| Claude Code's servers | `list_engines`, `engine_context(claude-code)` | 15 on, 4 off, 12 measured, 9013 tokens; per-server tools and tokens (for example tauri 19 / 2333, repowise 10 / 1946) | Same card. Per-server figures match the MCP servers tab rows. | Agree |
| zoom-out | `find_assets("zoom-out")` | `~/.agents/skills/zoom-out` and 3 more matches on body text | Skill row at that path (`s2-…png`) | Agree |
| Reach | `reach(~/.agents/skills/zoom-out)` | symlink: Claude Code via `~/.claude/agents`, Codex, Gemini; Zed reached, `via_root` null; 5 not linked | Reach card: "Through a symlink" Claude Code, Codex, Gemini; "Read directly" Zed; "Not linked" 5; Claude Code `~/.claude/agents` (`s2-…png`) | Agree |
| Findings | `findings` | 0 broken, 0 drifted, 28 unparsed | Needs review: "28 won't parse", no broken or drifted (`s3-…png`); its 79 duplicates are left out by design | Agree |

   The model flagged two oddities: Claude Code reaching a skill through
   `~/.claude/agents`, and Zed with no folder. Both come from the scan, and
   the app shows them the same way. They're questions about reach, not
   defects in the server.
5. **Rescan, row, measure.** After the rescan (scan stamp 1795777703188 →
   1795777949352), `hanger` is an ordinary row among 37 MCP servers. Its
   detail reads Tools 5, with descriptions at about 357 tokens, in the
   signed-off wording (`s4-…png`).
6. **Counts after.** Identical to the baseline, except `tool global 69 → 70`:
   the server just added. That is the plan's expected move.
7. **`stage-gate --dev`** went to a fresh reviewer.

The server was removed afterwards (`claude mcp remove --scope user hanger`).
Claude Code's user scope is back to its 6 servers.

## Still open

- Before or at merge: `main` now has Antigravity CLI as its own engine
  (`fb189ac`). The "Antigravity's MCP servers are not read" sentence in
  `LIST_ENGINES`, `INSTRUCTIONS` and `docs/mcp-server.md` becomes false, and
  "Gemini / Antigravity" becomes two engines. `strings.rs` already notes the
  removal.
- Implementer concerns 5 and 6 (the per-call thread, and the 5-second
  timestamp wait), plus parked M2 and M3.
