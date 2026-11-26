# The harness

The model Hanger is built on, and the code that makes each part of it true.
Written 2026-08-18. Claims about Hanger cite the code; claims about the wider
ecosystem cite a dated external source. Where this file and the code
disagree, the file is wrong. The argument, written for a reader rather than
for this repo, is at https://www.rkarthik.co/work/hanger.

## What it is

The harness is the skills, rules, subagents and MCP servers an engine reads —
ordinary files in ordinary directories (`~/.claude/skills/`,
`.agents/skills/`, `AGENTS.md`, a `mcp_config.json`). Hanger models four kinds
and no more; anything an engine calls by
another name maps onto one of those or is not modelled.

It has conventions and no interface, which is the premise the app rests on:
edit one file in a shared store and every engine and project reading it
changes, with nothing on disk recording which.

## The conventions the code encodes

- **`AGENTS.md`** — released August 2025, now stewarded by the Agentic AI
  Foundation under the Linux Foundation; agents.md lists twenty-two tools that
  read it (checked 2026-08-18). Hanger treats it as a rule file with no owner:
  it is in `RULE_FILENAMES` (`src-tauri/src/scanner.rs`) and deliberately
  absent from `RULE_FILE_OWNERS` (`src-tauri/src/agents.rs`), which holds
  only the two vendor-namespaced ones, `.cursorrules` and
  `copilot-instructions.md`.
- **`.agents/skills/`** — described by Cody Lindley's AI Harness Engineering
  Compatibility Matrix (updated June 2026) as "the broadest shared skill path
  today": Codex's primary path, read natively by Copilot, Cursor, Amp and
  Gemini CLI, as a fallback by OpenCode, and discovered by Devin Desktop.
  Hanger names it once, as `SHARED_AGENTS_DIR`
  (`agents.rs` → `SHARED_AGENTS_DIR`), and gives it no owner.
- **Only `SKILL.md` is read into context.** A skill folder's other entries —
  reference documents, scripts, lockfiles — do not load with it. They reach
  the model only if `SKILL.md` sends the engine to them. Roughly half of a
  populated machine's skills have such entries (68 of 133, measured
  2026-08-27), so it is the difference between a skill's size on disk and
  its cost in context, which is why the Context ledger splits "Always on"
  from "When it opens" (`AssetDetail.tsx`). Stated here rather than in the
  panel: it is a fact about the harness, true of every skill, and the
  inspector was repeating it on every asset the user opened.

## The model

### Ownership is exclusive. Reach is not.

Exactly one engine owns a path, or none does. `AGENT_CONFIGS`
(`src-tauri/src/agents.rs`) holds eleven engines with directories of their
own, each declaring the roots it owns and the subpath it keeps each category
under. `engine_for_path` resolves ownership by longest matching root, so
`.claude/skills/` is Claude Code's and `.kilocode/rules/` is Kilo Code's.

Reach is the separate question of who can *read* a path, and several answers
can be true at once. It is carried by one flag, `reads_agents_dir`, and
`.agents/` is owned by nobody precisely because so many engines read it.
Confusing the two is the defect the module was written to replace: `.agents/`
was once modelled as Gemini's directory, which filed every Zed and Amp asset
under Gemini.

### Reach has three verdicts, not two

Read at request time from the filesystem, in `annotations.rs`:

- **Reached through a link.** A top-level symlink in the engine's root
  resolves under a store root (`annotations.rs` → `asset_annotations`). This
  is what the Link map draws as an edge.
- **Reached in place, no link needed.** The asset is in the shared store and
  the engine reads the shared convention (`annotations.rs` → `reads_shared_dir`). Zed owns no
  directory to link *from* — it replaced its own rules library with the
  vendor-neutral convention — so demanding a symlink would tell the user
  their agent cannot read what it plainly reads.
- **Root not linked** (`annotations.rs` → `engine_reach`, reason `root_not_linked`). The engine is installed and
  there is no path from it to this asset.

The second verdict is the one worth keeping in mind when reading the Link
map: an engine drawn with no edge has not necessarily been cut off.

### Beyond the store

Deployments in the wild are directory mounts, not per-file links —
`<repo>/.claude/skills` → `~/.agents/skills` — so there is no per-asset link
row to record and none is needed. Each project's conventional engine
directories are read for top-level symlinks resolving under a store root
(`PROJECT_MOUNT_DIRS`, `annotations.rs`), and an asset beneath such a
target is in that project. That is the "In N projects" column.

### Nothing about reach is cached

There is no `state` column on `links`; whether a link is linked, drifted or
dangling is recomputed on every read (see `.claude/rules/invariants.md`). A
harness changes underneath you — a repo is cloned, a symlink is replaced by a
copy, an engine is installed — and a stored verdict would be wrong more often
than right.

## Hanger writes engine configuration

Until 2026-11-24 Hanger read each engine's MCP configuration and never wrote
it. It now switches an MCP server off and on for one engine, and that is the
whole of what it writes there. Everything that does it is in one module,
`src-tauri/src/mcp/switch/`, behind five commands in `src-tauri/src/lib.rs`
(`get_engine_context`, `get_engine_contexts`, `set_mcp_server_enabled`,
`undo_mcp_switch`, `measure_engine_context`). No screen calls them yet. Which engines can be
switched, and how, is `mcp/registry.rs` → `SWITCHES`; an engine with no row
there is shown and never written. The run that confirmed each row is in
`docs/plans/2026-11-24-context-control-engine-matrix.md`.

**What it writes.**

- *One flag in a Codex config file.* `enabled = false` or `enabled = true` in
  the server's own `[mcp_servers.<name>]` table in Codex's global
  `config.toml` (`mcp::switch::edit` → `set_enabled`); a `disabled` key left
  on that entry is removed with it. The file is edited in place and not
  re-serialised, and a second check
  (`mcp::switch::ops` → `only_the_flag_differs`) refuses the write unless the
  file, parsed as data, differs in that one server's `enabled` and `disabled`
  keys and nothing else.
- *Gemini CLI's state file,* `~/.gemini/mcp-server-enablement.json`
  (`mcp::switch::edit` → `gemini_set_enabled`): an entry is added for a server
  switched off and removed for one switched on, and the file is created if it
  is not there. It is Gemini's own file, keyed by server name alone, so one
  entry switches every Gemini server of that name.
- *Hanger's own files,* in two folders under the app's data directory:
  `switch/backups` (a copy of each file before it is replaced, with a receipt)
  and `switch/stash` (below). Folders are made 0700 and files 0600.

**Through which path.** Both config writes go through one function,
`mcp::switch::apply` → `safe_replace`: the new text has to parse; the file is
read again and the write refused if it is not byte for byte what Hanger read
(`ChangedSinceRead`); the current bytes are copied to the backups folder with
a receipt; the new text goes to a temp file and is renamed over the real file,
with a symlink resolved first so the link survives; and the result is read
back, with the original restored if it does not hold. `apply` → `undo` puts a
receipt's copy back, and only while the file still holds exactly what that
write left. The newest twenty backups of a file are kept.

**What it asks a vendor's command to do.** Claude Code ignores a flag in its
file, so for a user-scope server Hanger runs Claude Code's own command
(`mcp::switch::vendor`): `claude mcp remove <name> --scope user` to switch it
off, and `claude mcp add-json <name> - --scope user`, with the entry on stdin,
to switch it back on. While the server is off its entry exists only in
Hanger's stash, any credential in its `env` included. Two things guard that
copy. The entry is written to the stash and synced before the remove runs.
And before either, a pre-flight hands the entry to `add-json` in a scratch
config folder and goes on only if the same entry comes back: Claude Code
drops keys it does not know, and a server it would not give back unchanged is
not removed.

**What it never writes.**

- `~/.claude.json`. `mcp::switch::vendor` reads it, to find an entry and to
  see what the command did; only `claude` changes it.
- A key an engine was not shown to honour. Gemini CLI rejects a `disabled` key
  in a server's entry and Claude Code ignores one, so neither file gets one.
  A host with no row in `SWITCHES` is read-only.
- A file the machine pass did not produce. The webview sends a key, never a
  path, and `mcp::switch::ops` accepts it only if it is the key of a server
  `mcp::discover` → `discover_machine_at` has just found for that engine, with
  no reason against switching it (a plugin's server, a managed file, a
  Claude.ai connector), or of a server Hanger is keeping. The one engine file
  written that discovery did not list is Gemini CLI's state file, whose path
  Hanger builds itself. A project's own config file is not in the machine
  pass, so a project-scope server is not switched yet.

No value from a config file crosses to the webview on the way: a reply is the
engine's servers by name with their state, and a refusal is one code
(`mcp::switch::ops` → `SwitchFailure`).

## Hanger moves skill folders

Since 2026-11-26 Hanger can switch a skill in the global store,
`~/.agents/skills`, off for every engine and back on. Everything that does it
is in one module, `src-tauri/src/skill_switch/`, behind four commands in
`src-tauri/src/lib.rs` (`get_skill_switch`, `set_skill_enabled`,
`undo_skill_switch`, `get_kept_skills`). No screen calls them yet. The plan is
`docs/plans/2026-11-26-skill-switch.md`.

**What moves, and where.**

- *The skill's store entry,* `~/.agents/skills/<name>`, only when it is a
  direct child of the store. Off renames it into Hanger's keep,
  `<app data dir>/kept/skills/<uuid>/<name>`, and On renames it back to the
  same path (`skill_switch::tree` → `rename_no_replace`, which is
  `renamex_np` with `RENAME_EXCL`). It is never copied, so the folder keeps
  its inode. An entry that is itself a link moves as the link; its target is
  not touched. A store on another volume from the keep is refused.
- *Its one-by-one links.* A link to that one skill
  (`~/.cursor/skills/figma -> ~/.agents/skills/figma`) would dangle, so Off
  records its path and exact `readlink` text, then removes it, and On
  recreates it from that text. A recreated link is a new file: it has a new
  inode and times, and loses any extended attributes. Hanger looks for these
  links one level deep in a fixed list of folders
  (`skill_switch::links` → `link_places`: each engine's skills folder, five
  more measured on Karthik's machine, each linked project's skills folders,
  and every top-level folder of the store) and at every link its `links`
  table records. A link anywhere else is not found, and dangles while the
  skill is off.
- *Hanger's own records.* A receipt, `receipt.json` (0600), in each keep
  entry (0700), written and synced before anything is removed
  (`skill_switch::keep`). And in Hanger's store, Off deletes the `assets`
  rows of the folder it has just moved and their `links` rows
  (`preferences::forget_moved_folder`), so the skill is neither counted nor
  shown with a broken link while reaping is off. The next scan after On adds
  them back.

**What it never touches.**

- A folder that holds the whole store. `~/.claude/skills ->
  ~/.agents/skills` and a project's `.agents/skills` link are containers, not
  links to one skill, and are never searched or removed.
- A link whose text changed between Hanger finding it and removing it: the
  switch puts back what it removed and moves nothing.
- Anything at the place it would write. On refuses while a skill of that
  name is back in the store, while something else is where a link was, and
  while the kept folder is not what was kept. It never makes a missing
  folder for a link: it names that link instead.
- A skill inside another skill's folder, and a skill Hanger has copied into
  a project and tracks. Those are shown with no switch.
- `~/.agents/skills-disabled/`, or any folder a user switched skills off in
  by hand.

No path and nothing from a skill's files crosses to the webview: a reply is
the skill's name, counts and booleans, a link that was not put back is shown
with the home as `~`, and a refusal is one code
(`skill_switch::ops` → `SkillSwitchFailure`).

## What the model does not cover yet

- **`~/.config/agents/skills/`** — Amp's user-level skills path. Amp's other
  four locations are covered; this one is not.
- **Devin Desktop / Windsurf skills.** Its MCP config
  (`~/.codeium/windsurf/mcp_config.json`) and its rules file
  (`.windsurfrules`) are read; `.windsurf/skills/` and
  `~/.codeium/windsurf/skills/` are not, and Devin has no `AGENT_CONFIGS`
  row of its own.
- **Nested symlinks into a store.** Only *top-level* entries in an engine
  root are examined. An engine that links individual skills into a real
  directory — `~/.config/opencode/skills/<name>` → `~/.agents/skills/<name>`
  — reads as unlinked.
- **Fetching.** Discovery catalogues thirty-four places the ecosystem
  publishes assets (`src/data/directories.ts`) and installs from none of
  them. You open one, run its install command yourself, and rescan.

## Sources

- AGENTS.md — https://agents.md/ (tool list checked 2026-08-18)
- AI Harness Engineering Compatibility Matrix, Cody Lindley, updated June
  2026 — https://codylindley.github.io/ai-harness-engineering-compatibility-matrix/
- Per-engine paths were researched for the agent-detection work in August
  2026. That research file lives under `docs/superpowers/`, which `.gitignore`
  keeps local, so the tables above are restated from the code rather than
  cited to it.
