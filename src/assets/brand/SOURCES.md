# Brand marks — sources

Marks identify third-party products the user has installed (nominative use);
geometry and colour are unmodified. Only ids are rewritten when the files are
joined into the sprite (`src/utils/svgSymbol.ts`). Design record (local-only,
not tracked in this repo): `docs/superpowers/specs/2026-08-15-brand-icons-design.md` §3, §14.

## From `@lobehub/icons-static-svg@1.94.0` (MIT, imported from node_modules)

| Brand | File |
|---|---|
| Claude Code | `icons/claudecode-color.svg` |
| Codex | `icons/codex-color.svg` |
| Codex — dark-mode mark, used in place of the row above on `--page` dark | `icons/codex.svg` |
| Gemini (CLI / Antigravity) | `icons/gemini-color.svg` |
| Claude Desktop, Claude.ai | `icons/claude-color.svg` |
| Cursor | `icons/cursor.svg` |
| Windsurf | `icons/windsurf.svg` |
| GitHub Copilot | `icons/githubcopilot.svg` |
| OpenCode | `icons/opencode.svg` |

## Vendored here (lobe has no file for these)

| File | Origin | Taken from |
|---|---|---|
| `vscode.svg` | Microsoft VS Code mark, via devicons (MIT) | `docs/v3/app-icons/svg/vscode.svg`, 2026-08-15 |
| `zed.svg` | Zed Industries mark, via SVGL | `docs/v3/app-icons/svg/zed.svg`, 2026-08-15 |

## In-house

| File | What |
|---|---|
| `generic.svg` | Fallback for any engine or host with no mark: a `>_` prompt in a rounded ring, `currentColor`. Not a brand. |
