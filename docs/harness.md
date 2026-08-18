# The harness

Why this app exists, and the model it uses to describe what it finds. Written
2026-08-18. Every claim about Hanger's behaviour cites the code that makes it
true; claims about the wider ecosystem cite a dated external source.

The same argument, written for a reader rather than for this repo, is at
https://www.rkarthik.co/work/hanger. Where this file and the code disagree,
this file is wrong and the code is right — it is documentation of the model,
not a specification of it.

## The layer

Models improve every few months. What you can get one to *do* is decided
somewhere else: the skills, rules, subagents and MCP servers you have written
or installed. That layer is the harness, and it is ordinary files in ordinary
directories — `~/.claude/skills/`, `.agents/skills/`, `AGENTS.md`, a
`mcp_config.json` — read by whichever agent happens to be running.

Hanger models four kinds and no more: skills, rules, subagents and MCP
servers (`src-tauri/src/domain.rs:323-326`). Anything an engine calls by
another name maps onto one of those or is not modelled.

## What the harness standardised

- **`AGENTS.md`** — released August 2025, now stewarded by the Agentic AI
  Foundation under the Linux Foundation; agents.md lists twenty-two tools that
  read it (checked 2026-08-18). Hanger treats it as a rule file with no owner:
  it is in `RULE_FILENAMES` (`src-tauri/src/scanner.rs:235`) and deliberately
  absent from `RULE_FILE_OWNERS` (`src-tauri/src/agents.rs:367`), which holds
  only the two vendor-namespaced ones, `.cursorrules` and
  `copilot-instructions.md`.
- **`.agents/skills/`** — described by Cody Lindley's AI Harness Engineering
  Compatibility Matrix (updated June 2026) as "the broadest shared skill path
  today": Codex's primary path, read natively by Copilot, Cursor, Amp and
  Gemini CLI, as a fallback by OpenCode, and discovered by Devin Desktop.
  Hanger names it once, as `SHARED_AGENTS_DIR`
  (`src-tauri/src/agents.rs:18`), and gives it no owner.

## What it did not standardise

An interface. The harness has a format, a growing compatibility surface, and
no place to look at it. A typical setup is a dozen directories in a home
folder, managed with a text editor and a symlink.

The consequence is quiet rather than loud. Edit one skill in a shared store
and you have changed every engine and every project that reads it — with no
diff, no review and no record, because the half of your setup that lives in
your home directory never had any of those. Nothing on disk says which
engines were affected. That absence is what Hanger is for.

## The model

### Ownership is exclusive. Reach is not.

Exactly one engine owns a path, or none does. `AGENT_CONFIGS`
(`src-tauri/src/agents.rs:69`) holds eleven engines with directories of their
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
  resolves under a store root (`src-tauri/src/annotations.rs:173-205`). This
  is what the Link map draws as an edge.
- **Reached in place, no link needed.** The asset is in the shared store and
  the engine reads the shared convention (`annotations.rs:502`). Zed owns no
  directory to link *from* — it replaced its own rules library with the
  vendor-neutral convention — so demanding a symlink would tell the user
  their agent cannot read what it plainly reads.
- **Root not linked** (`annotations.rs:518`). The engine is installed and
  there is no path from it to this asset.

The second verdict is the one worth keeping in mind when reading the Link
map: an engine drawn with no edge has not necessarily been cut off.

### Beyond the store

Deployments in the wild are directory mounts, not per-file links —
`<repo>/.claude/skills` → `~/.agents/skills` — so there is no per-asset link
row to record and none is needed. Each project's conventional engine
directories are read for top-level symlinks resolving under a store root
(`PROJECT_MOUNT_DIRS`, `annotations.rs:240`), and an asset beneath such a
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
