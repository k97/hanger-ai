# Slice 5: the rest of skills, then Claude plugins (research, 2026-11-28)

## 1. What it is and why

Skills already switch off and on. Slice 5 adds the other half of the skill life cycle (install a skill from GitHub, update it) and then Claude Code's plugin system (plugins, marketplaces, hooks, cache). Skill descriptions also join the per-engine "always on" budget, so the overview card tells the truth about skills, not just MCP servers.

## 2. What exists today

- `skill_switch` (`mod.rs`, `ops.rs`, `keep.rs`, `links.rs`, `tree.rs`): `switch_off`, `switch_on`, `read_only_reason`, `kept_for`, `undo_for`. It moves a folder that is a **direct child of `~/.agents/skills`** into `<app data>/kept/skills/` by `tree::rename_no_replace`, with a receipt (`keep::SkillReceipt`). Anything else is read-only (`SkillReadOnly::InsideAnotherFolder`, `OtherVolume`, `HasTrackedCopies`). Rulings: `docs/plans/2026-11-26-skill-switch.md`, `2026-11-26-decisions-round-10.md`.
- Skill cost: `lib.rs` carries `always_on_bytes` / `always_on_estimated_tokens` per skill (frontmatter name + description bytes, divided by 4), parsed by `scanner::parse_skill_frontmatter`. The overview card shows a per-engine figure for MCP only; skills, rules and subagents read "Not measured" (`2026-11-26-context-control-report.md`, "Phase 2").
- Plugins: Hanger has no plugin model. `grep` of `src-tauri/src` for `installed_plugins`, `enabledPlugins`, `claude plugin` finds none. `agents.rs` mentions `.claude/plugins/` only in a subagent-path comment.
- Bound by: "vendor-owned mechanisms go through the vendor CLI: `claude plugin`, `claude mcp`, `gh skill`" (memory, 2026-11-24); "consume mcpick and build on it"; every write is atomic with a pre-write copy and one Undo.

## 3. Outside facts

**`gh skill`** (read `gh skill --help` on gh 2.102.0, 2026-09-30 build, on 2026-11-28). Still labelled "preview ... subject to change without notice". Subcommands: `install` (alias `add`), `list` (`--json`), `preview`, `publish`, `search` (`--json`), `update`.
- `install <owner/repo> [skill[@version]] --agent <host> --scope user|project`. Default scope is `project`; default agent is `github-copilot`. `--pin`, `--all`, `--force`, `--dir`, `--from-local`. ~45 `--agent` values including claude-code, codex, gemini-cli, antigravity, antigravity-cli, opencode, cursor.
- **Where it writes, measured with a throwaway HOME (2026-11-28, `--from-local`, user scope):** `claude-code` writes `~/.claude/skills/<name>/`; `gemini-cli` writes `~/.gemini/skills/`; `opencode` writes `~/.config/opencode/skills/`; `codex` and `universal` write `~/.agents/skills/`. It also writes `~/.local/state/gh/device-id`. It injects frontmatter metadata into `SKILL.md` (local installs add `metadata.local-path`; the help says remote installs add GitHub source and tree SHA, which I could not confirm offline).
- `update [skill...] --all --dry-run --force --unpin`: compares the local tree SHA in frontmatter to the remote. Skills with no GitHub metadata are skipped with a notice. `--dry-run` printed "All skills are up to date" and wrote nothing.
- `list --json skillName,sourceURL,scope,version,pinned,path,agentHosts` is a stable read surface. `search --json description,namespace,path,repo,skillName,stars`.
- Needs `gh` installed and, for remote repos, authenticated. Not tested: remote install and update (no network write in a research run).

**`claude plugin`** (Claude Code 2.1.332, `--help`, 2026-11-28). Subcommands: `list [--json] [--available]`, `details <name>` (component inventory and **projected token cost**), `install|i` (`--scope user|project|local`, `--json`, `-y`), `uninstall`, `update`, `enable`, `disable`, `configure`, `prune`, `validate`, `tag`, `eval`, `init`, `test`, `restore-set-aside`, and `marketplace add|list|remove|update`.
- Throwaway HOME: `claude plugin list --json` returns `{id, version, scope, enabled, hasUserConfig}` and wrote `~/.claude.json` plus a backup; `marketplace list` showed only the built-in directory; `details cc-plugin-agents-md@builtin` printed Skills/Agents/Hooks/MCP/LSP counts and "Always-on: ~0 tok".
- **There is no `hooks` or `cache` subcommand.** Hooks live in a plugin's `hooks/hooks.json` or `plugin.json` and in settings `hooks`; the CLI has no per-hook disable. The plugin cache is `~/.claude/plugins/cache`, with `installed_plugins.json`, `known_marketplaces.json`, `marketplaces/`, `data/` on this machine (ls, 2026-11-28).
- Plugin doc (code.claude.com/docs/en/plugins-reference, read 2026-11-28): `enabledPlugins` in settings holds on/off; `${CLAUDE_PLUGIN_DATA}` is `~/.claude/plugins/data/<id>/`; plugin skills are namespaced.

**Skill budget** (code.claude.com/docs/en/skills, read 2026-11-28, first 100k of 121k characters; the "descriptions are cut short" section was truncated):
- `disable-model-invocation: true`: "Description not in context, full skill loads when invoked". **Measured by doc, not by running a session.**
- `skillOverrides` setting: `on` (name and description), `name-only`, `user-invocable-only` (hidden from Claude), `off` (hidden everywhere). "Plugin skills are not affected by `skillOverrides`."
- description plus `when_to_use` is truncated at **1,536 characters** in the listing.
- So Hanger's current figure (full name plus description, bytes/4) over-counts skills with `disable-model-invocation: true` (T3 review counted 24 on this machine, 2026-11-25) and any over 1,536 characters. Other engines' rules are not measured here (Codex, Gemini, OpenCode): that is the "measure per engine" pass.

**mcpick** (`/Users/karthik/Work/Labs/mcpick/src`, MIT): `utils/skills-cli.ts` (1,315 lines: arg builders, `parse_gh_skill_list_json`, `install_skills`, `update_skills`, `check_skill_drift`, its own provenance file); `utils/claude-cli.ts` (788: `execFile` wrappers for plugin install/uninstall/update/marketplace); `core/plugin-cache.ts` (669: staleness, link local plugins into the cache by rewriting `installed_plugins.json`); `core/hook-state.ts` + `core/settings.ts` (disable a plugin hook by **editing the plugin's `hooks.json` and keeping a `disabled-hooks` file**). Cache and hook disabling edit vendor files directly; install/update/marketplace go through the CLI.

## 4. Options

**A. Thin CLI driver, skills first (pick for step one).** Rust module `skills_cli` runs `gh skill list/search/preview/install/update` (argv, no shell; `engine_status`'s `run_capture` pattern) and reads `--json`. Install defaults to `--agent universal --scope user`, which lands in `~/.agents/skills`, the one place `skill_switch` can switch. Update runs `gh skill update --dry-run` to show "update available", then `--all`/named on a click. Cost: about 5 tasks, no new store tables. Trade-off: preview CLI may change; skills installed by `--agent claude-code` land in `~/.claude/skills`, which `skill_switch` calls read-only.

**B. Hanger fetches GitHub itself.** Own downloader and tree-SHA compare. Full control, no preview risk, but re-implements `gh`, breaks the ruling, and needs a token story. Reject.

**C. Plugins: CLI for lifecycle, read-only for the rest.** Drive `claude plugin list --json`, `details`, `enable|disable`, `install|update|uninstall`, `marketplace add|remove|update` via the CLI. Read hooks and cache as files, show them, link to Open in editor. No per-hook toggle and no cache linking. Cost: about 6 tasks. mcpick's hook disabling (rewriting plugin `hooks.json`) is the one thing not ported: it edits a vendor-owned file inside a cache the next `plugin update` replaces. Revisit only if Karthik wants it.

**Pick: A then C, as two plans.** Budget (D) is separate: read `disable-model-invocation` and the `skillOverrides` setting in `parse_skill_frontmatter`'s caller, apply the 1,536 cap, then sum per engine. Plugins add `claude plugin details`'s own "projected token cost", so the plugin cost need not be estimated. Before D ships its Claude figure, run one live session check (H1).

## 5. Shared machinery

- `skill_switch`: install writes into the store it guards. After an install the scanner must re-run and `read_only_reason` stays the arbiter. A skill installed for `claude-code` is read-only to the switch; say so in the UI.
- Scanner and `count_assets`: new skills and plugin skills (`~/.claude/plugins/cache/...`) add rows. Plugin skills would need a new scope or a plugin attribute; counts per category must be captured before and after (`shared-asset-machinery.md`).
- Overview card and `get_engine_contexts`: skill figures join MCP tokens. Collides with whatever piece changes that card.
- `AGENT_CONFIGS`: `gh --agent` names map to engines (claude-code, codex, gemini-cli, antigravity-cli, opencode). That map is new data keyed to `AGENT_CONFIGS`; the guard floors in `brand-coverage.test.ts` do not count it.
- `mcp_server`: `find_assets` and `reach` should see plugin-provided skills and servers. Plugins also carry their own MCP servers (`.mcp.json`), which `mcp::switch` must not toggle through the host file.
- Store schema: A needs none (state is the `gh` metadata in `SKILL.md`). C may want a cache of `plugin list` for offline display, which would move `user_version`.
- Collides with: **Slice 3** (add/remove MCP: plugins declare servers), **Slice 4** (profiles must say how a plugin-set or skill-set is captured), **T19 engine status** (CLI detection and `run_capture` for `gh` and `claude`), **MCP phase 2** (budget card), **Phase B** (installing is a write the agent would request).

## 6. Depends on / unblocks

Depends on T19's CLI detection (is `gh` or `claude` present, version) and on the budget measurement. Does not need the gateway. Unblocks Slice 4 profiles (a profile that includes skills and plugins) and Phase B (agent proposes "install this skill").

## 7. Questions only Karthik can answer

1. **Install target for skills.** (a) `universal`, `~/.agents/skills`, switchable (pick); (b) the engine's own folder, which `skill_switch` cannot switch; (c) ask every time.
2. **Hooks.** (a) Read-only list with Open in editor (pick); (b) port mcpick's disable by rewriting plugin `hooks.json`, lost on the next update; (c) skip hooks.
3. **Preview risk.** `gh skill` is "preview ... subject to change". (a) Build on it and gate on `gh skill --help` parsing (pick); (b) wait for GA.
4. **Plugin-provided skills in the count.** (a) Show them as a plugin's contents under the plugin, not as store skills (pick); (b) count them as skills with a plugin badge.

## 8. Size

About 12 tasks: skills CLI driver and UI (5), budget with `disable-model-invocation`, `skillOverrides` and the cap (3), plugins and marketplaces (4), hooks and cache read-only (1, with C). Human gates: H1, a live Claude Code session proving `disable-model-invocation` and `skillOverrides` keep a description out of the listing (document says so, I did not run it); one live remote `gh skill install` and `update` against a real repo; a naming brief for "Plugins" and "Marketplaces" in the rail; layout options for the Plugins pane.
