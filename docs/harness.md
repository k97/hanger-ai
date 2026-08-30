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
