# Slice 4: profiles, and the backup and restore UI

Research, 2026-11-28. Read-only; no code changed.

## 1. What it is and why

A profile is a named set of on/off states you save from one engine and load
into another ("coding", "writing", "everything off"). The backup and restore
UI is a list of what Hanger changed, with a way back, over the receipts the
switch already keeps. Both serve the context-cost goal: change the whole
harness's load in one step, and trust that it can be undone.

## 2. What exists today

**Rulings that bind it.**
- `docs/roadmap.md` → "Profiles (slice 4)", Karthik 2026-11-25 (Q16 of
  `docs/plans/2026-11-25-t3-code-review.md`): a profile is a named set of
  on/off states, applied through the switch Hanger already has, touching
  nothing but on/off. Not a config folder per profile.
- `memory/hanger-tool-manager-direction.md`: every write atomic, timestamped
  pre-write copy, one Undo per write. "Full backup/restore UI comes later with
  profiles."
- `docs/plans/2026-11-24-context-control.md` → Slice 1 decision 21 and the
  `shortcut:` note: the 20-per-file count cap is provisional; "the backup and
  restore UI in slice 4 owns the real policy."
- "No value from a config file crosses IPC, reaches SQLite, or is logged."

**MCP receipts.** `mcp::switch::apply` → `safe_replace`, `undo`,
`latest_receipts`, `Receipt` (id, real path, `backup_file`, before/after
sha256, `at_ms`, `what`). Files live in `<app data>/switch/backups`
(`SwitchPlaces::under`), mode 0600/0700, newest 20 per file (`KEPT_PER_FILE`,
a count cap, no age cap). Receipt ids are `file:<uuid>`, `kept:<uuid>`,
`restored:<name>` (`ops::undo_for`).
- `undo` works only while the file still hashes to `after_sha256`. So only the
  newest write per file is undoable; older receipts return `NotUndoable`.
- `latest_receipts` has no IPC command. Its only non-test caller is `ops`
  `undo_file`. The 30 files in this machine's backups folder are invisible to
  the UI. Undo lives only in an in-memory `SwitchNotice` (reply
  `SwitchReply.receipt_id`), so it is gone after dismiss or restart.
- Claude Code has no flag. Off removes the entry through `claude mcp remove`
  after stashing it (`mcp::switch::vendor`, `<data>/switch/stash/claude-code/<uuid>.json`);
  `get_kept_off_servers` lists them. It does not go through `apply`.
- `.hanger/backups` (`transactional::write_transactional`) is a separate,
  cwd-relative path used only by deploys; `known-debt.md`. Out of scope here,
  but a restore UI must not pretend it covers deploys.

**Skill receipts.** `skill_switch::keep` (`SkillReceipt`, one folder per kept
skill under `<data>/kept/skills/<uuid>/`); `get_kept_skills`;
`undo_skill_switch`. A skill switch is store-wide (`~/.agents/skills` entry
plus its links), not per engine.

**Precedents to copy.** `FlyoutAllEnginesSwitch` already fans one action
across engines and undoes "last first" from the webview; its test
`one Undo puts every engine back, last first` is the shape a profile load
needs. ⌘K "carries command-style actions" (ruled).

**What is switchable.** `registry::SWITCHES` has 4 rows (grep: codex,
claude-code, gemini, antigravity) of 17 `HOSTS`. Codex also has a project tier;
Gemini switches by name alone (`switches_by_name`).

**Store.** Version 8 (`invariants.md`; the migration tests are the source of
truth). `preferences` is a key/value table.

## 3. mcpick, and what ports

Read at `/Users/karthik/Work/Labs/mcpick` (MIT).
- `src/core/profile.ts`: `save_profile_for_client`, `apply_profile_to_client`,
  `list_profiles`, `load_portable_profile`. A profile is `{version: 2, servers:
  PortableMcpServer[], plugins?}` stored as `~/.mcpick/profiles/<name>.json`.
  Load calls `replace_client_servers`: **replace the client's whole server
  list** with the profile's. Tests: `profile.test.ts`, 4 `it()` cases (Claude
  apply, Claude save, portable save/apply to non-Claude, OpenCode schema).
- `src/cli/commands/{backup,restore,rollback}.ts`, `src/utils/safe-apply.ts`
  (`list_config_backups`, `restore_config_backup`, 11 `it()` cases in
  `safe-apply.test.ts`). `backup` snapshots `mcpServers` + `enabledPlugins`
  (10 kept); `rollback` restores a safe-write copy.

**Ports:** the safe-apply/rollback half, already ported into `apply.rs`
(module doc says `latest_receipts`/`undo` stand where `list_config_backups`
did). The "list, pick, restore" interaction, and the profile *name → file*
convention.

**Does not port:** the profile body. mcpick profiles carry full server
definitions (command, args, env, headers) and load by replacing the list.
That contradicts the ruling (on/off only), the secrets rule (env values never
stored), and Hanger's dialect layer (writing a Codex TOML server from a Gemini
JSON one is slice 3's add/remove). mcpick's `backup` snapshot also assumes
Hanger owns the whole file; it only owns one line of it. Plugins in profiles
belong to slice 5.

## 4. Outside facts

Codex has its own `--profile <name>` flag (`codex --help`, read 2026-11-28),
so "profile" already means a config overlay in one of Hanger's engines. Not
checked: whether Claude Code or Gemini use the word. This is a naming risk
(section 7).

## 5. Profile semantics

A profile entry is `{kind: mcp|skill, name, state}` plus the engine it was
saved from (for display only). Identity is the **server name**, not the
config path: the same name is the cross-engine key already (`Registration`
doc: "same server name may appear in many registrations").

Load into engine E, per entry:
- **E declares that name and it is switchable:** set to the saved state
  (existing `set_enabled_for`).
- **E does not declare it:** skipped and listed ("not declared in E"). Never
  added: adding is slice 3 and needs a definition the profile does not hold.
- **E declares it but offers no switch** (read-only reason, or a project-tier
  server on an engine switched only at Global): skipped and listed with the
  reason `context` already gives.
- **E declares servers the profile does not mention:** left alone by default.
  Offer one explicit option, "turn everything else off", because that is what
  makes a profile cut cost. Default-off for the unmentioned is a surprise.
- **Same name declared twice in E** (global and project): apply to each
  switchable one; Gemini's name-wide file is one write.
- **Skills** are store-wide, so a skill entry ignores the target engine. Say so
  in the preview.
- A profile saved from E covers every item E's context lists, including its
  off ones, so a saved "off" is real data.
- Preview before apply: counts of will change / already as wanted / skipped,
  per kind, all from the backend (`invariants.md`: no frontend counting).

**Writes.** A load of N changes is N writes and N receipts, across files,
some through the `claude` CLI. It is not atomic as a set. Contract: apply in a
fixed order, stop at the first failure, report which landed, and return the
receipt list so one Undo walks them last-first (as `FlyoutAllEnginesSwitch`
does). A Claude Code load needs the CLI found, else those entries are skipped
with the existing `CliNotFound` code.

## 6. Options

**A. Profiles as files, history as a read-only list over existing receipts.**
Profiles are `<data>/profiles/<name>.json` (names and states only, no secrets).
New IPC: `list_profiles`, `save_profile(engine)`, `preview_profile(name,
engine)`, `apply_profile(name, engine)` returning receipt ids,
`delete_profile`; plus `list_changes` over `latest_receipts` + keep + stash,
paths through `sanitise_path`. Undo reuses `undo_for`. Cost: no migration,
smallest. Trade-off: no history beyond the newest write per file is undoable.

**B. A, plus real restore of an older copy.** Add `restore_backup(receipt_id)`:
read the backup, `safe_replace` it over the current bytes with the expected
hash of what is on disk now, warning that later edits are overwritten. It is
itself a receipt, so it can be undone. Cost: one more `apply` entry point and
a confirm. Also fixes the real gap: the count cap (20) and "newest only" undo
make "go back to last week" impossible today.

**C. Profiles in SQLite** (`user_version` 9: `profiles`, `profile_entries`).
Gains sorting, rename, and the Hanger MCP server reading them for free. Costs
a migration that collides with whatever other pieces add, and puts
user-authored data in a store the app treats as rebuildable.

**Pick: A first, B as a second task, profiles as files (not C).** A profile is
user data, and receipts, keeps and stashes are all files already (plan
decision: "No schema migration. Receipts are files beside their backups").
Files also export and share by copy. Take C only if the MCP server must filter
profiles by engine; the server can read a directory as easily.

**Retention policy** (slice 4 owns it): keep the count cap but add an age floor
(never evict a backup under N days old), and show eviction in the list. Stash
and skill keep hold live data, not history: never evict. I did not find a cap
on either; not verified by test.

## 7. Where it sits in the UI

No new rail section. Three surfaces, each already ruled in kind:
1. **Overview card** (per engine, Global and repos): a profile control next to
   the header switch: "Save as…" / "Load…". Load opens the preview with the
   skipped list, then applies; the existing `SwitchNotice` carries the one
   Undo for the batch.
2. **⌘K:** "Load profile X into E" as command actions.
3. **Recent changes:** a list of writes (when, engine, what, Undo/Restore
   state: undoable, moved on, backup gone). Home: a popover from the overview
   card, or an Engines detail section. Needs a layout round (options rendered
   at true width, per `design-options-before-building`).

The word "Profile" needs a naming brief and sign-off (`ui-copy.md`): the roadmap
uses it, but the old pane was renamed "Global" *away* from "Profile", the
file is still `ProfilePane.tsx`, and Codex's `--profile` means something else.
Alternatives to brief: Preset, Setup, Loadout.

## 8. Shared machinery and collisions

- `mcp::switch::{ops,apply,context}` and `skill_switch::ops`: read and call
  only; `apply` gains `restore_backup` (B). Collides with **MCP phase 2** and
  **Slice 2** if either changes `ops` switch signatures; with **Slice 3**
  (add/remove) on receipt `what` strings and on a profile entry whose server
  Slice 3 removes later (a stale name is skipped, which is already the rule).
- **Overview card** (`ProfilePane.tsx`/`RepoPane.tsx`/flyout): collides with
  Slice 2 (per-project overrides need a project picker on the same card) and
  Slice 5/6 UI.
- **`mcp_server`:** a read-only `profiles` tool is cheap; a *load* tool is a
  write and belongs to MCP phase 2's proposals, not here.
- **`SWITCHES`/`HOSTS`/`AGENT_CONFIGS`:** read only. A profile's reach grows as
  `SWITCHES` rows are confirmed; `brand-coverage` floors are unaffected.
- **Store:** none under A/B.
- **Slice 6 (gateway):** would make a profile load apply mid-session; the
  profile format needs no change.

## 9. Depends on / unblocks

Needs nothing first. Slice 3 is not required (profiles never add). It is more
useful after Slice 2 (a profile at project scope). Unblocks: Phase B's agent
("apply the coding profile" is a safe verb) and the gateway's per-session
sets. The restore list is independent and can ship before profiles.

## 10. Questions for Karthik

1. **Load semantics:** (a) apply only what the profile names, leave the rest;
   (b) also turn everything else off. Pick (a) by default with (b) as a
   checkbox in the preview.
2. **Name:** "Profile", or a first-time label (Preset, Setup)? Pick: brief
   first; do not ship "Profile" unbriefed.
3. **Older restore:** does "restore" mean only the last write (today's Undo)
   or any kept backup, overwriting later edits? Pick: any kept backup (B),
   behind a warning, itself undoable.
4. **Retention:** how long to keep copies: 20 per file as now, or also by age
   (say 30 days minimum)? Pick: keep 20 and never evict under 30 days.

## 11. Size

About 9 tasks: profile file format + save (2), preview + apply with receipts
list (2), `list_changes` + restore-from-backup (2), retention (1), overview
card and ⌘K UI (1), tests and the DESIGN.md/docs updates (1). Human gates:
the naming brief, a layout round for the changes list, a live check that a
Claude Code load goes through the real `claude` CLI, and the Rust gate with
per-kind counts per `shared-asset-machinery.md`.

Not checked: Claude Code's and Gemini's use of "profile"; stash and keep
retention by test; how long an N-server Claude Code load takes. Risk: a
profile load is N non-atomic writes, so a mid-way failure leaves a partial
state that the batch Undo must be proven to reverse.
