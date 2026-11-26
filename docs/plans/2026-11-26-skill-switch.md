# Skill Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** draft for Karthik's review, 2026-11-26. Nothing is built. Tasks 1–6 need his approval of this plan and answers to the questions at the end. Tasks 7–10 also need his sign-off on the strings table (G1). Task 11 needs his go-ahead for each real write (H2).

**Goal:** A skill in the global store gets one On/Off switch in its inspector header. Off moves its folder into Hanger's keep and removes the one-by-one links to it. On puts the folder and every link back exactly where they were. Undo works as it does for MCP servers.

**Architecture:** A new Rust module, `skill_switch`, sits beside `mcp::switch` and copies that module's discipline: keep before you remove, a receipt written first, a fixed set of refusal codes, and nothing overwritten. It does not reuse its code, because `apply::safe_replace` writes UTF-8 text files and a skill is a folder. A switch-off is one same-volume `rename` of the folder. It never copies and deletes. Each link is recorded by its exact `readlink` text before it is removed, and recreated from that text. The receipt lives beside the kept folder. Four IPC commands expose it. The webview reuses the MCP switch's notice, Undo and "Switched off" group shapes.

**Tech Stack:** Rust (`std::fs`, `libc::renamex_np` with `RENAME_EXCL`, `sha2`, `uuid`, `rusqlite`), React 19 + TypeScript, Vitest, `cargo test` integration tests under `src-tauri/tests/`.

**Spec:** [`docs/plans/2026-11-26-decisions-round-10.md`](2026-11-26-decisions-round-10.md). Karthik answered all four questions as recommended. His note on Q1 is the governing rule: "when I turn on, it should be back where it was before". The MCP switch rulings it inherits are 5, 10, 21 and 23–27 of [`2026-11-24-context-control.md`](2026-11-24-context-control.md).

## Global Constraints

- **Scope (round 10, Q2):** only a skill whose folder is a direct child of the global store, `~/.agents/skills`. A repo's own skills come later.
- **Back exactly where it was (round 10, Q1 note):** the same absolute path, the same name, and every recorded link with the same `readlink` text. The folder keeps its inode, because it is renamed and never copied. A recreated link has a new inode, ctime and mtime, and loses its extended attributes (`ls -l@` shows them on most of Karthik's links). The real-machine check in Task 11 states this. It is not hidden.
- **Refuse rather than guess (round 10, "Safety"; MCP rulings 5 and 10):** a receipt is written and fsynced before anything moves. Nothing is overwritten: the folder rename is `renamex_np(…, RENAME_EXCL)`, and `symlink(2)` fails on an existing path. A link whose text changed between finding and removing it is not removed. A different volume is refused, never copied.
- **The keep** is `<app data dir>/kept/skills/` (round 10, "The switch"), which is `~/Library/Application Support/com.rkarthik.hanger/kept/skills/` (`invariants.md`, bundle id). It is resolved as `lib.rs:713-725` resolves `switch_places`. A keep path that is not absolute is refused before anything is written, as `apply.rs:226-231` and `vendor.rs:548-551` refuse theirs. Folders are 0700 and receipts are 0600, as in `apply.rs:165-166`.
- **A key is not a path** (`mcp/switch/ops.rs:16-38`): write commands take a key. `skill:<name>` must still be a direct child of the store when it is used, and `kept-skill:<uuid>` must be a receipt that names itself (`vendor.rs:627-636`). The one command that takes a path, `get_skill_switch`, only reads metadata.
- **No file content crosses IPC or reaches a log.** Paths in replies go through `preferences::sanitise_path`. Errors are codes with no payload (`mcp/switch/ops.rs:181-241`).
- **Counts come from the backend** (`invariants.md`). The "Switched off" figure is `KeptSkills.count`. No `.length` stands in for it (`no-frontend-counting.test.ts`).
- **Reaping stays off** (`invariants.md`). The switch deletes only the DB rows for the folder it has just moved itself: its `assets` rows and their `links` rows. Q6 asks Karthik to confirm this.
- **Shared asset machinery** (`shared-asset-machinery.md`): the per-kind count query runs before Task 1 and after Task 10. Rules, subagents and tools must come back identical. Skills must differ only by the skills switched off during testing, and those must be switched back on before the second capture.
- **No schema migration.** Receipts are files.
- **Styling:** semantic tokens, type roles, `strokeFor(box)`, no blocking dialogs (`invariants.md`).
- **Copy:** every string in "Proposed strings" needs Karthik's sign-off and a `/humanizer` pass before it lands (`ui-copy.md`).
- **Gates, from the repo root unless stated, each in its own call:** `npx vitest run`; `cargo test` from `src-tauri/`; `bunx tsc --noEmit` (report the exit code); `gitleaks detect --source .` and `gitleaks detect --source . --no-git -c .gitleaks.toml`.
- **Commits:** explicit paths only (`shared-checkout.md`). Production source never goes in a `test()` or `docs()` commit (`verification.md`).
- **Never push without Karthik's word.**

## Review Focus

1. **A store skill that is itself a symlink** (for example `~/.agents/skills/foo -> ~/dotfiles/foo`). Expected: Off moves the link entry, never its target. The target folder is untouched, and On puts back a link with the same text. Pinned in Task 4 by `a_skill_that_is_a_link_moves_as_a_link`.
2. **The skill is modified between Off and On.** Either a new folder of that name appears in the store (a reinstall), or the kept folder is edited. Expected: On refuses with `already_there` or `changed_since_kept`, and moves nothing. Pinned in Task 4 by `on_refuses_when_the_name_is_back_in_the_store` and `on_refuses_when_the_kept_folder_changed`.
3. **A name clash in the keep:** `foo` is switched off, reinstalled, then switched off again. Expected: two kept entries, neither overwritten. Turning one on while the other's name is back in the store refuses. Pinned in Task 3 by `two_skills_of_one_name_are_kept_apart` and in Task 4 by `a_second_off_of_one_name_keeps_both`.
4. **One-by-one links in a linked project,** relative (`../../.agents/skills/x`, the shape of Karthik's 55 links in `~/.gemini/config/skills`) or absolute. Expected: each is found, removed, recorded and recreated byte-identical. Its `links` row goes, so Needs review shows nothing broken while the skill is off. Pinned in Task 2 by `a_relative_link_is_found_and_recorded_by_its_own_text` and in Task 5 by `a_switched_off_skill_raises_no_review_issue`.
5. **Undo after a rescan.** Expected: the Undo still puts the skill back, because the receipt is on disk and the backend holds no session state. Pinned in Task 6 by `undo_after_a_rescan_puts_it_back` and in Task 7 by `undo_survives_the_rescan_a_switch_triggers`.
6. **An engine's skills folder that is the store itself,** such as `~/.claude/skills -> ~/.agents/skills` on this machine. Seen through it, every skill looks like an entry of that folder. Expected: such a place is never searched for links, so the skill itself is never taken for a link. Pinned in Task 2 by `a_place_that_resolves_to_the_store_is_skipped`.
7. **Hanger stops mid-switch.** Expected: the receipt exists before the first removal, the entry is listed as interrupted, and On finishes it. Pinned in Task 4 by `an_interrupted_off_is_listed_and_on_completes_it`.

---

## Research

### How the MCP switch keeps and restores (read in depth)

| Piece | Where | Skill switch |
|---|---|---|
| Safe replace: parse first, canonicalize, compare with what was read (`ChangedSinceRead`), backup and receipt, temp file, rename, read back, keep the newest 20 | `apply.rs:10-34`, `200-290` | **Not reusable.** It writes UTF-8 text with a format check, and a skill is a folder. The pattern is copied: compare before acting, record before changing, verify after. |
| Receipts: named for their contents, listed only when the name matches, never pointed at another file | `apply.rs:40-54`, `450-495` | Pattern copied: a receipt is loaded only from `<keep>/<uuid>/receipt.json`, and its `id` must equal the folder's uuid. |
| Undo: allowed only while the file holds what the write left; the Undo is itself receipted | `apply.rs:56-71`, `297-334` | Same rule. An Undo of an Off is an On, which refuses unless the kept folder still matches its fingerprint. An Undo of an On is an Off by name. |
| Absolute-folder rule: refuse a backups or stash path that is not absolute; `switch_places` falls back to `.` and relies on that refusal | `apply.rs:226-231`, `vendor.rs:548-551`, `lib.rs:705-725` | Reused as a rule: `skill_places` copies `switch_places`, and every keep function refuses a relative keep. |
| Stash: keep before remove, sync, `create_new`, uuid-checked load, a file listed only when it holds its own id | `vendor.rs:24-41`, `102-116`, `607-636` | Pattern copied exactly. The receipt is written and synced before the first link is removed. |
| `KeptOffServer` / `KeptOff` with `count` and `also_declared`; `get_kept_off_servers` | `ops.rs:144-179`, `359-398`, `lib.rs:833-845` | Same shape: `KeptSkill` / `KeptSkills` with `count` and `back_in_store`. |
| `stash:` keys; receipt ids `file:` / `kept:` / `restored:`; `undo_for` dispatch | `ops.rs:54-67`, `294-296`, `443-495` | `kept:` and `restored:` are reused with the same meaning. `file:` has no counterpart. Keys are `skill:<name>` and `kept-skill:<uuid>`. |
| `SwitchFailure`: codes only, matched in full | `ops.rs:181-283` | A new `SkillSwitchFailure`. Spellings shared with MCP where the meaning is the same: `not_found`, `read_only`, `name_refused`, `changed_since_read`, `already_there`, `write_failed`, `not_verified`, `not_undoable`. |
| `edit.rs`, `context.rs`, `vendor.rs` (CLI and pre-flight), `registry::SWITCHES`, probes and budget | | MCP-specific. Not touched. |

`transactional.rs:41-108` (`write_transactional`, used by `execute_deploy`, `lib.rs:1281-1392`) keeps its backups in a folder relative to the working directory (`transactional.rs:51`, recorded in `known-debt.md`). It is not used here.

### How Hanger models skills and links (read in depth)

- **Reach** (`annotations.rs:190-226`, `564-663`): an engine reaches a store skill through a top-level symlink in its root that resolves into the store (`via_root`, `via_store`). Engines that read `.agents/` directly need no link (`reads_shared_dir`, `annotations.rs:104-108`). Per-skill links inside `~/.cursor/skills` and the like are not top-level entries of an engine root, so reach never looks at them.
- **The walk** (`scanner.rs:2032-2037`, `441-472`): `follow_links` is off. A symlinked skill folder in a linked project is offered to `record_walk_symlink` (`preferences.rs:805-860`), which writes a `links` row (`upsert_link`, `preferences.rs:1655`) when the target is a known asset. Hanger scans no global per-skill link folder on this machine: Cursor has no `AGENT_CONFIGS` row, and OpenCode has `skills: None` (`agents.rs:170-180`).
- **Link state** is derived at read time (`invariants.md`). `domain::resolve_state` (`domain.rs:304-312`) returns `Broken` when the destination is missing. Needs review turns `broken` into a danger issue, "Target missing" (`reviewIssues.ts:190-205`, `409-414`).
- **Counts** (`scanner.rs:23-41`) count every `assets` row. With reaping off (`invariants.md`), a skill folder that has disappeared would still be counted, and the "Skills · N" head (`ProfilePane.tsx:1472`) would disagree with its rows, which come from the scan's fresh inventory (`lib.rs:1520-1640`, `scan://complete`). `per_kind_asset_counts_are_unchanged_by_a_kept_server` (`mcp_switch_tests.rs:4932`) scans a new DB each time, so the MCP switch never met this.

**What a scan would show after a skill folder leaves the store, if nothing else changed:**

1. Its `assets` row stays, so the count is one too high.
2. A `links` row for a project link to it reads `Broken`, and Needs review shows "Target missing".
3. A dangling link in an unscanned engine folder shows nothing in Hanger, but the engine fails to load it.

Task 5 removes cause 1, and causes 2 and 3 with it, because the switch removes those links. Tracked copies (`Mechanism::TrackedCopy`) read `Pending`, not broken, when their source is gone (`domain.rs:339-347`). Q4 covers them.

### Frontend pieces (read in depth unless marked)

| Piece | Decision |
|---|---|
| `useMcpSwitch.ts` (single and group receipts, one notice, `busyKeys`, `onChanged` rescan) | **Extend, do not fork.** Its doc says every switch on screen goes through it (`useMcpSwitch.ts:6-13`). Add `switchSkill` and a `kind` on `LastSwitch` so `undo` calls the right command. Keep the name: renaming touches every caller and test, for no behaviour. |
| `SwitchNotice.tsx` | **As is.** It draws any `SwitchNoticeState`. |
| `switchCopy.ts` | **Add** a skill block (`SKILL_FAILURE_LINES` and the rest), an exhaustive `Record` over the new codes. MCP lines unchanged. |
| `AllEnginesSwitch.tsx` | **Generalise:** extract its button and state word into `HeaderSwitch.tsx`, and make `AllEnginesSwitch` a wrapper. The skill header uses `HeaderSwitch` with On/Off only. |
| "Switched off" group (`ProfilePane.tsx:1564-1598`), `groupRowClass` (`NotLoadedGroup.tsx:11-12`) | **Reuse the shape.** Add a second group under Skills that reads `KeptSkills`. The MCP block is unchanged. `NotLoadedGroup` itself is skimmed only and not touched. |
| `KeptServerDetail` (`Flyout.tsx:125-237`) | **Leave it alone.** Add a sibling, `KeptSkillDetail`, with the same row shape. |
| Inspector header (`Flyout.tsx:861-910`) | Add one branch: a store skill shows `HeaderSwitch`, and a kept skill shows its name and the switch. |

### Copy

The naming brief (`2026-11-24-context-control-naming-brief.md`) gives On/Off (Q2), "Switched off · {n}", "Switched off {timeAgo}", and the Undo pattern. Every new string is in "Proposed strings" below for sign-off. None is final.

## Real-machine facts (read-only, 2026-11-26)

| Question | Command | Fact |
|---|---|---|
| Is `~/.agents/skills` a real folder? | `ls -lad`, `stat -f %HT` | Yes, a directory with 503 entries. That includes `.DS_Store`, `.system/` (mode 0700) and `synced/`, which holds 19.6 MB of skills nested two levels down. No entry is a symlink (0 found). |
| Which engine folders link to the store as a whole? | `readlink` | `~/.claude/skills`, `~/.codex/skills` and `~/.gemini/skills` all point to `/Users/karthik/.agents/skills` (absolute). |
| Engine folders with one-by-one links | `find ~ -maxdepth 4 -type l -lname '*.agents/skills*'` (1 s) | `~/.cursor/skills`: 3 absolute links (`figma`, `nextjs-best-practices`, `animation-motion-design`). `~/.config/opencode/skills`: 2 absolute. `~/.opencode/skills`: 1. `~/.copilot/skills`: 1. `~/.gemini/config/skills`: **55 relative** links (`../../../.agents/skills/<name>`) beside 5 real folders. None is broken. |
| Is any of those folders scanned by Hanger? | DB, read-only | No. 0 asset rows under any of them. |
| Links inside the store | `find ~/.agents/skills -mindepth 2 -type l` | 64, all in `web-design-guidelines/`, absolute, each pointing at a sibling skill. 57 resolve and 7 are already dangling. Switching off `figma`, for example, would leave `web-design-guidelines/figma` dangling (Q1). |
| Projects that link the store as a whole | `find ~/Work -maxdepth 7` | `bun-commands/.claude/skills`, `rkarthik/skills/.claude/skills`, `wa-links/.agents`, `hanger-ai/.agents/skills` and the `search-palette` worktree's `.agents/skills` all point to `/Users/karthik/.agents/skills`. `t3code` and `lobe-icons` point their `.claude/skills` at their own repo-local `.agents/skills`. |
| Projects with one-by-one links to the global store | same | None. Docktile's two `i18n-localization` links point at a repo-local `.agents/skills`, not the global store. |
| What this repo's `.agents/skills` symlink means | `readlink` | It points at the whole store, so this repo's "own" skills are the global ones. A switch-off removes the skill here too, and the repo's link must never be removed: it is a container, not a one-by-one link (Review Focus 6). |
| Same volume? | `stat -f %d` | The store and the app data folder are both on device 16777230, so `rename` works. |
| Hand-made off-switch | `ls ~/.agents` | `~/.agents/skills-disabled/` holds 9 folders. Hanger never reads it (no match in `src`, `src-tauri/src` or `docs`). See Q5. |
| Hanger's DB (read-only) | `sqlite3 -readonly` | `links`: 0 rows. `linked_directories`: 0 rows. 554 skill rows under the `.agents` root, 55 of them nested deeper than one level (`claudeception/examples/*`, `font-tools/skills/*`, `synced/<id>/*`). |

---

## File map

- Create `src-tauri/src/skill_switch/mod.rs`: the module doc (what moves, where, and the rules above).
- Create `src-tauri/src/skill_switch/tree.rs`: `fingerprint` and `rename_no_replace`.
- Create `src-tauri/src/skill_switch/links.rs`: where to look, and which links point at a skill.
- Create `src-tauri/src/skill_switch/keep.rs`: the receipt type, writing it, loading it, listing it.
- Create `src-tauri/src/skill_switch/ops.rs`: Off, On, Undo, the listing, the DB rows, and the codes.
- Modify `src-tauri/src/lib.rs` (`pub mod skill_switch;`, `skill_places`, four commands), `src-tauri/src/preferences.rs` (two queries).
- Test `src-tauri/tests/skill_switch_tests.rs`, `src-tauri/tests/ipc_boundary_tests.rs`.
- Create `src/types/skillSwitch.ts`, `src/components/HeaderSwitch.tsx`. Modify `useMcpSwitch.ts`, `switchCopy.ts`, `AllEnginesSwitch.tsx`, `Flyout.tsx`, `ProfilePane.tsx`, `App.tsx`, `DesignSystemPane.tsx`, `.claude/DESIGN.md`, `docs/ipc.md`, `README.md` (the generated `ipc` region), `docs/harness.md`.

---

### Task 1: Fingerprint a folder, and rename without replacing

**Files:**
- Create: `src-tauri/src/skill_switch/mod.rs`, `src-tauri/src/skill_switch/tree.rs`
- Modify: `src-tauri/src/lib.rs` (`pub mod skill_switch;`)
- Test: `src-tauri/tests/skill_switch_tests.rs`

**Interfaces:**
- Produces:
  ```rust
  /// Hex SHA-256 over every entry under `root`, sorted by relative path bytes,
  /// never following a link: for each, the relative path, its type (d/f/l),
  /// mode & 0o7777, and for a file its bytes' SHA-256, for a link its text.
  /// `root` itself may be a link: then the fingerprint is of its text alone.
  /// Entries named exactly `.DS_Store` are skipped (Finder writes them on open).
  pub fn fingerprint(root: &Path) -> io::Result<String>;
  /// `renamex_np(from, to, RENAME_EXCL)`. Never replaces anything at `to`.
  pub fn rename_no_replace(from: &Path, to: &Path) -> Result<(), MoveError>;
  pub enum MoveError { Exists, OtherVolume, Io(io::ErrorKind) }
  ```

- [ ] **Step 1: Write the failing tests:**
  - `fingerprint_changes_with_a_byte`
  - `fingerprint_changes_with_a_mode`
  - `fingerprint_changes_with_a_link_text`
  - `fingerprint_ignores_ds_store`
  - `fingerprint_never_follows_a_link`: a link to a big folder outside changes nothing when that folder changes
  - `fingerprint_of_a_link_root_is_its_text`
  - `rename_refuses_an_existing_empty_folder`: `to` is an empty dir, giving `Err(Exists)` with both sides intact. Plain `rename(2)` would replace it.
  - `rename_keeps_the_inode`: `ino` before equals after
- [ ] **Step 2: Run** `cargo test --test skill_switch_tests` from `src-tauri/`. Expect FAIL (unresolved).
- [ ] **Step 3: Implement.** Confirm `libc::renamex_np` and `RENAME_EXCL` on docs.rs for the locked `libc` 0.2 version, and cite it in `tree.rs`. `EXDEV` maps to `OtherVolume` and `EEXIST` to `Exists`.
- [ ] **Step 4: Run.** Expect PASS. Then all four gates.
- [ ] **Step 5: Commit** `feat(skills): fingerprint a skill folder and move it without replacing anything`.

### Task 2: Find the one-by-one links to a skill

**Files:**
- Create: `src-tauri/src/skill_switch/links.rs`
- Test: `src-tauri/tests/skill_switch_tests.rs`

**Interfaces:**
- Consumes: `agents::{AGENT_CONFIGS, engine_base}`.
- Produces:
  ```rust
  /// Folders searched one level deep, in this order (Q2):
  /// 1. each AGENT_CONFIGS global root's `skills` folder, through engine_base;
  /// 2. EXTRA_LINK_PLACES under home (measured 2026-11-26, this plan's facts table):
  ///    ".cursor/skills", ".copilot/skills", ".config/opencode/skills",
  ///    ".opencode/skills", ".gemini/config/skills";
  /// 3. for each linked project, the same relative folders and each config's project_roots/skills;
  /// 4. every top-level folder of the store (links inside another skill, Q1).
  /// A place whose canonical path is the store, or lies inside the skill being moved, is dropped.
  pub fn link_places(home: &Path, store: &Path, projects: &[PathBuf]) -> Vec<PathBuf>;
  pub const EXTRA_LINK_PLACES: &[&str];
  /// Raw bytes of the link text, never converted.
  pub struct FoundLink { pub path: PathBuf, pub text: OsString }
  /// Every symlink directly inside `places`, plus each path in `recorded`
  /// (the links table's dest_paths for this skill), whose text, resolved
  /// lexically against the link's folder, names `skill` as spelled under the
  /// home or its canonical path (they differ where ~/.agents is itself a link).
  /// Already-dangling links to other skills are not returned.
  pub fn find_links(skill: &Path, places: &[PathBuf], recorded: &[PathBuf]) -> Vec<FoundLink>;
  ```

- [ ] **Step 1: Write the failing tests:**
  - `an_absolute_link_is_found`
  - `a_relative_link_is_found_and_recorded_by_its_own_text` (Review Focus 4): `../../../.agents/skills/x` returns `text == "../../../.agents/skills/x"` and is not rewritten absolute
  - `a_place_that_resolves_to_the_store_is_skipped` (Review Focus 6): `home/.claude/skills -> store` is not in `link_places`, and `find_links` returns no entry under it
  - `a_link_inside_another_skill_is_found` (the `web-design-guidelines` shape)
  - `a_link_to_another_skill_is_not_found`
  - `a_link_into_a_subfolder_of_the_skill_is_not_found`: `-> store/x/references` is not a link to `x`
  - `a_linked_projects_link_is_found`
  - `a_recorded_link_outside_every_place_is_found`
  - `a_container_link_to_the_whole_store_is_never_returned`: `proj/.agents/skills -> store`, the shape of this repo
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement.** Use `symlink_metadata` and `read_link` only. A link is matched by lexical normalisation of `folder.join(text)`, so a link that is about to dangle is still matched before the move.
- [ ] **Step 4: Run.** Expect PASS. Then all four gates.
- [ ] **Step 5: Commit** `feat(skills): find every one-by-one link to a skill in the places engines and projects keep them`.

### Task 3: The keep and its receipts

**Files:**
- Create: `src-tauri/src/skill_switch/keep.rs`
- Test: `src-tauri/tests/skill_switch_tests.rs`

**Interfaces:**
- Produces:
  ```rust
  #[derive(Serialize, Deserialize)] #[serde(rename_all = "snake_case")]
  pub enum Stage { Moving, Kept, Restoring }
  #[derive(Serialize, Deserialize)] #[serde(rename_all = "snake_case")]
  pub enum EntryKind { Folder, Link }
  /// The receipt. Never crosses IPC: it holds absolute paths and link texts.
  #[derive(Serialize, Deserialize)]
  pub struct SkillReceipt {
      pub id: String,                // uuid; equals its folder's name
      pub name: String,
      pub original: String,          // absolute: <store>/<name>, as found
      pub kind: EntryKind,
      pub fingerprint: Option<String>, // set when Stage::Kept
      pub links: Vec<LinkRecord>,
      pub stage: Stage,
      pub at_ms: i64,
  }
  #[derive(Serialize, Deserialize)]
  pub struct LinkRecord { pub path: String, pub text: String }
  /// <keep>/<id>/ made 0700 with create_dir (fails if present); receipt.json 0600, synced.
  pub fn create_entry(keep: &Path, receipt: &SkillReceipt) -> Result<PathBuf, KeepError>;
  /// Replace receipt.json through a temp file and rename in the entry folder.
  pub fn update(keep: &Path, receipt: &SkillReceipt) -> Result<(), KeepError>;
  /// Only a uuid in Hanger's own spelling, whose receipt holds that id.
  pub fn load(keep: &Path, id: &str) -> Option<SkillReceipt>;
  /// Newest first; skips anything that does not load.
  pub fn list(keep: &Path) -> Vec<SkillReceipt>;
  pub fn remove_entry(keep: &Path, id: &str) -> Result<(), KeepError>;
  pub enum KeepError { NotAbsolute, NotUtf8, Io(io::ErrorKind) }
  ```
- A path or link text that is not UTF-8 is `NotUtf8`, and the switch refuses it (`name_refused`) rather than store a lossy copy.

- [ ] **Step 1: Write the failing tests:**
  - `a_relative_keep_is_refused_and_nothing_is_made`
  - `entry_and_receipt_are_private`: 0700 and 0600
  - `two_skills_of_one_name_are_kept_apart` (Review Focus 3): two receipts named `foo` give two entries, and `list` returns both
  - `create_entry_never_reuses_a_folder`
  - `a_receipt_not_named_for_its_id_is_not_listed`
  - `load_refuses_a_non_uuid_id`: `"../x"` and an uppercase uuid both give `None`
  - `update_leaves_no_temp_file`
  - `a_non_utf8_link_text_is_refused`
- [ ] **Step 2: Run.** Expect FAIL. **Step 3: Implement.** **Step 4: Run.** Expect PASS. Then all four gates.
- [ ] **Step 5: Commit** `feat(skills): a private keep for switched-off skills, with a receipt per entry`.

### Task 4: Off and On

**Files:**
- Create: `src-tauri/src/skill_switch/ops.rs`
- Test: `src-tauri/tests/skill_switch_tests.rs`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  ```rust
  pub struct SkillPlaces { pub home: PathBuf, pub store: PathBuf, pub keep: PathBuf, pub db_path: PathBuf }
  #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)] #[serde(rename_all = "snake_case")]
  pub enum SkillSwitchFailure {
      NotFound, ReadOnly, NameRefused, ChangedSinceRead, AlreadyThere,
      LinkPlaceTaken, ChangedSinceKept, OtherVolume, WriteFailed, NotVerified, NotUndoable,
  }
  pub struct Switched { pub id: String, pub name: String, pub links: usize, pub links_not_restored: Vec<String> }
  /// For tests: an error returned at a named step stands in for Hanger stopping there.
  #[doc(hidden)] pub struct Seams<'a> { pub stop_at: Option<Step>, pub before_move: &'a (dyn Fn() + Sync) }
  #[doc(hidden)] pub enum Step { AfterReceipt, AfterLinks, AfterMove, AfterRestoreMove }
  pub fn switch_off(places: &SkillPlaces, projects: &[PathBuf], name: &str) -> Result<Switched, SkillSwitchFailure>;
  pub fn switch_on(places: &SkillPlaces, id: &str) -> Result<Switched, SkillSwitchFailure>;
  ```
- **Off, in this order:**
  1. Check the name: not empty, no `/`, not `.` or `..`, no leading `.`. Then `lstat(<store>/<name>)` must be a dir or a link, or the answer is `not_found`.
  2. The store and the keep must be on the same device (`MetadataExt::dev`), else `other_volume`. Task 5 adds the DB-based read-only checks here.
  3. `find_links`.
  4. `create_entry` with `Stage::Moving` and the links.
  5. Unlink each link, after re-reading its text. Any difference puts back the links removed so far, removes the entry, and answers `changed_since_read`.
  6. `rename_no_replace` the entry into `<keep>/<id>/<name>`.
  7. `fingerprint` in the keep, then `update` to `Stage::Kept`.
- **On:**
  1. `load`.
  2. With `Stage::Kept`, the kept fingerprint must equal the receipt's, else `changed_since_kept`.
  3. `lstat(original)` must be `NotFound`, else `already_there`.
  4. Each recorded link path must be free, or already a link with the same text. Otherwise `link_place_taken`.
  5. `update` to `Stage::Restoring`.
  6. `rename_no_replace` back.
  7. `symlink(text, path)` for each link whose folder exists. The rest go in `links_not_restored`, sanitised (Q3).
  8. The fingerprint at `original` must match, else `not_verified`, and the entry stays.
  9. `remove_entry`.
- One process-wide `std::sync::Mutex` serialises every Off and On.

- [ ] **Step 1: Write the failing tests** (temp home, store and keep):
  - `off_moves_the_folder_and_removes_its_links_and_on_puts_back_every_byte`: path, name, inode, fingerprint and each link's `read_link` are equal after On
  - `a_skill_that_is_a_link_moves_as_a_link` (Review Focus 1): the target folder's fingerprint is unchanged throughout, and after On `read_link(original)` equals the text before
  - `on_refuses_when_the_name_is_back_in_the_store` (Review Focus 2): `already_there`, with both folders' fingerprints unchanged
  - `on_refuses_when_the_kept_folder_changed` (Review Focus 2): one byte edited in the keep gives `changed_since_kept`, and nothing moves
  - `a_second_off_of_one_name_keeps_both` (Review Focus 3)
  - `on_refuses_when_a_link_place_is_taken`: a plain file at the link's path gives `link_place_taken`, and the file is untouched
  - `a_link_that_changed_before_removal_is_left_and_nothing_moves`: `before_move` re-points one link, giving `changed_since_read`, with the store and every other link as before
  - `another_volume_is_refused_before_anything_changes`: simulated through a seam
  - `an_interrupted_off_is_listed_and_on_completes_it` (Review Focus 7): one case per `Step`. Each ends with the skill and its links back and the entry gone.
  - `a_link_whose_folder_is_gone_is_reported_not_made`: the folder is not created, and the link is named in `links_not_restored`
  - `names_that_could_escape_the_store_are_refused`: `..`, `a/b` and `.system` give `name_refused` or `not_found`, and nothing outside the store is touched
- [ ] **Step 2: Run.** Expect FAIL. **Step 3: Implement.** **Step 4: Run.** Expect PASS. Then all four gates.
- [ ] **Step 5: Commit** `feat(skills): switch a store skill off into Hanger's keep and back, links and all`.

### Task 5: What a scan and Needs review show while a skill is off

**Files:**
- Modify: `src-tauri/src/preferences.rs`, `src-tauri/src/skill_switch/ops.rs`
- Test: `src-tauri/tests/skill_switch_tests.rs`

**Interfaces:**
- Produces, in `preferences.rs`:
  ```rust
  /// Deletes the links rows of every asset at `folder` or under it, then those
  /// assets, in one BEGIN IMMEDIATE transaction. Matches by
  /// `abs_path = ?1 OR substr(abs_path, 1, length(?1) + 1) = ?1 || '/'` (no LIKE:
  /// skill names hold `_`). Returns the asset rows removed.
  pub fn forget_moved_folder(conn: &Connection, folder: &str) -> Result<usize, SanitisedError>;
  /// Any copy or tracked_copy link, or deploy_checksums row, sourced at or under `folder`.
  pub fn has_tracked_copies(conn: &Connection, folder: &str) -> Result<bool, SanitisedError>;
  /// The links table's dest_paths for assets at or under `folder` (Task 2's `recorded`).
  pub fn link_dests_under(conn: &Connection, folder: &str) -> Result<Vec<String>, SanitisedError>;
  ```
- Produces, in `ops.rs`:
  ```rust
  #[derive(Serialize)] #[serde(rename_all = "snake_case")]
  pub enum SkillReadOnly { InsideAnotherFolder, OtherVolume, HasTrackedCopies }
  pub fn read_only_reason(places: &SkillPlaces, skill: &Path) -> Option<SkillReadOnly>;
  ```
- `switch_off` calls `forget_moved_folder` after step 7. A DB failure there is logged by kind only. It does not undo the move: a stale row is the state before this task, not a loss.

- [ ] **Step 1: Write the failing tests.** Each scans a temp home into a **persisted** DB with `DirectoryScanner`, as `mcp_switch_tests.rs:4914-4928` does, but reusing one DB.
  - `a_switched_off_skill_leaves_the_skill_count_by_one`. Plant first: without the `forget_moved_folder` call this test must fail, because reaping is off.
  - `other_kinds_are_unchanged_by_a_switch` (`shared-asset-machinery.md`)
  - `a_switched_off_skill_raises_no_review_issue` (Review Focus 4): a linked project holds a one-by-one link, scanned so a `links` row exists. After Off, `get_hydrated_links` holds no row for it and no inventory item has `link_state` `broken`.
  - `on_and_a_rescan_bring_the_row_and_the_link_row_back`
  - `the_keep_is_never_scanned`: the keep at the production path under the temp home, scanned, gives no kept skill
  - `nested_skills_have_no_switch`: `claudeception/examples/x` gives `InsideAnotherFolder`
  - `a_skill_with_a_tracked_copy_is_read_only` (Q4)
  - `nested_assets_go_with_their_folder`: a skill holding a nested skill loses both rows on Off
- [ ] **Step 2: Run.** Expect FAIL. **Step 3: Implement.** **Step 4: Run.** Expect PASS. Then all four gates. Record the per-kind counts from the real store before and after, read-only.
- [ ] **Step 5: Commit** `feat(skills): a skill switched off leaves the counts and raises no broken link`.

### Task 6: Undo, the kept list, and IPC

**Files:**
- Modify: `src-tauri/src/skill_switch/ops.rs`, `src-tauri/src/lib.rs`, `docs/ipc.md`, `README.md` (regenerate with `~/.bun/bin/bun run src/__tests__/readmeCounts.ts`), `docs/harness.md` (a section "Hanger moves skill folders": what moves, where, and what it never touches)
- Test: `src-tauri/tests/skill_switch_tests.rs`, `src-tauri/tests/ipc_boundary_tests.rs`

**Interfaces:**
- Produces:
  ```rust
  #[derive(Serialize)] pub struct SkillSwitchInfo { pub key: String /* "skill:<name>" */, pub read_only: Option<SkillReadOnly> }
  #[derive(Serialize)] pub struct KeptSkill {
      pub key: String,          // "kept-skill:<uuid>"
      pub name: String, pub at_ms: i64,
      pub links_count: usize,
      pub interrupted: bool,    // stage != Kept
      pub back_in_store: bool,  // <store>/<name> exists again
  }
  #[derive(Serialize)] pub struct KeptSkills { pub skills: Vec<KeptSkill>, pub count: usize }
  #[derive(Serialize)] pub struct SkillSwitchReply {
      pub name: String,
      pub receipt_id: Option<String>,   // "kept:<uuid>" after Off, "restored:<name>" after On
      pub undoable: bool,
      pub links_count: usize,
      pub links_not_restored: Vec<String>, // sanitised
      pub kept: KeptSkills,
  }
  pub fn switch_info_for(places: &SkillPlaces, skill_path: &Path) -> Option<SkillSwitchInfo>;
  pub fn kept_for(places: &SkillPlaces) -> KeptSkills;
  pub fn set_enabled_for(places: &SkillPlaces, projects: &[PathBuf], key: &str, enabled: bool) -> Result<SkillSwitchReply, SkillSwitchFailure>;
  pub fn undo_for(places: &SkillPlaces, projects: &[PathBuf], receipt_id: &str) -> Result<SkillSwitchReply, SkillSwitchFailure>;
  ```
- In `lib.rs`, all `#[tauri::command(async)]`, with `Err` a `SkillSwitchFailure` code string:
  ```rust
  fn get_skill_switch(app: AppHandle, skill_path: String) -> Result<Option<SkillSwitchInfo>, String>;
  fn set_skill_enabled(app: AppHandle, key: String, enabled: bool) -> Result<SkillSwitchReply, String>;
  fn undo_skill_switch(app: AppHandle, receipt_id: String) -> Result<SkillSwitchReply, String>;
  fn get_kept_skills(app: AppHandle) -> Result<KeptSkills, String>;
  fn skill_places(app: &AppHandle) -> SkillPlaces; // store = get_home_dir().join(".agents/skills") as spelled (links are matched against it and its canonical form, scanner.rs:975-978); keep = <app data>/kept/skills
  ```
- `set_enabled_for`: a `skill:` key with `enabled: false` runs Off. A `kept-skill:` key with `true` runs On. A `skill:` key with `true`, or a `kept-skill:` key with `false`, changes nothing and returns `receipt_id: None`. Undo of `kept:<id>` is On. Undo of `restored:<name>` is Off. Anything else is `not_undoable`.

- [ ] **Step 1: Write the failing tests:**
  - `off_then_undo_round_trips`
  - `undo_of_an_undo_switches_off_again`
  - `undo_after_a_rescan_puts_it_back` (Review Focus 5): Off, scan, Undo. The skill and its links are back, and a scan restores the count.
  - `a_path_outside_the_store_has_no_switch`: `None`
  - `a_key_that_is_a_path_is_refused`: `skill:../x` gives `name_refused`
  - `kept_count_agrees_with_rows`
  - `back_in_store_is_reported`
  - In `ipc_boundary_tests.rs`, `skill_switch_replies_carry_no_content_and_no_raw_home`: a skill whose `SKILL.md` holds a marker string is switched off, undone, and listed. No serialised reply or error contains the marker or the literal home path. Plant the marker in a reply first, watch it fail, then remove it.
- [ ] **Step 2: Run.** Expect FAIL. **Step 3: Implement,** update the three documents, and regenerate the README region. **Step 4: Run.** Expect PASS. Then all four gates (`readme-sync.test.ts` covers the region).
- [ ] **Step 5: Commit** `feat(skills): switch a skill off, on and back from the webview`.
- [ ] **Step 6: Checkpoint.** Report the backend with test output and the per-kind counts. Stop. Push only on Karthik's word.

### Task 7: The webview's types, copy and switch state (after G1)

**Files:**
- Create: `src/types/skillSwitch.ts` (a hand mirror of Task 6's types, narrowed as `engineContext.ts` is)
- Modify: `src/hooks/useMcpSwitch.ts`, `src/utils/switchCopy.ts`
- Test: `src/hooks/useMcpSwitch.skill.test.ts`, `src/utils/switchCopy.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type SkillSwitchFailure = "not_found" | "read_only" | "name_refused" | "changed_since_read" | "already_there" | "link_place_taken" | "changed_since_kept" | "other_volume" | "write_failed" | "not_verified" | "not_undoable";
  export type SkillReadOnly = "inside_another_folder" | "other_volume" | "has_tracked_copies";
  export interface SkillSwitchRequest { key: string; skillName: string; enabled: boolean }
  // McpSwitch gains:
  switchSkill(a: SkillSwitchRequest): Promise<SkillSwitchReply | null>;
  // switchCopy.ts gains:
  export function skillSwitchedLine(kind: "off" | "back_on", skill: string, linksCount: number): string;
  export function skillFailureLine(code: string, skill: string): string;
  export function skillReadOnlyLine(r: SkillReadOnly): string;
  export function skillSwitchLabel(skill: string, on: boolean): string;
  ```
- `LastSwitch` gains `kind: "mcp" | "skill"`. `undo` calls `undo_skill_switch` for `"skill"`. Busy keys for skills are `busyKeyOf("skills", key)`.

- [ ] **Step 1: Write the failing tests:**
  - `switchSkill_sends_key_and_enabled_and_shows_the_off_line`
  - `a_no_change_reply_shows_nothing_and_does_not_rescan`
  - `undo_of_a_skill_calls_undo_skill_switch_with_the_receipt`
  - `undo_survives_the_rescan_a_switch_triggers` (Review Focus 5): `onChanged` fires, the notice still has Undo, and Undo invokes with the same receipt id
  - `an_unknown_code_gets_the_fallback_line`
  - `every_skill_failure_code_has_a_line`, checked against `Record` exhaustiveness and run under `tsc`
  - `links_not_restored_adds_its_line`
- [ ] **Step 2: Run** `npx vitest run src/hooks/useMcpSwitch.skill.test.ts`. Expect FAIL. **Step 3: Implement** with G1's strings. **Step 4: Run.** Expect PASS. Then all four gates.
- [ ] **Step 5: Commit** `feat(skills): one notice and one Undo for skill switches too`.

### Task 8: The header switch on a store skill (after G1)

**Files:**
- Create: `src/components/HeaderSwitch.tsx`
- Modify: `src/components/AllEnginesSwitch.tsx` (it becomes a wrapper with unchanged output), `src/components/Flyout.tsx` (the header branch near `:884`, plus a `get_skill_switch` read when the target asset is a skill)
- Test: `src/components/FlyoutSkillSwitch.test.tsx`. `FlyoutAllEnginesSwitch.test.tsx` must pass unchanged.

**Interfaces:**
- Produces:
  ```ts
  export default function HeaderSwitch(p: { label: string; pressed: boolean | "mixed"; on: boolean; stateWord: string; pending: boolean; onToggle: () => void; testId: string }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing tests,** with fixtures from a real `get_skill_switch` reply:
  - a store skill shows the switch pressed, with "On" and `aria-label` set to `skillSwitchLabel(name, true)`
  - a click calls `switchSkill` with `skill:<name>` and `enabled: false`, and is disabled while busy
  - a skill outside the store shows no switch and no line
  - a read-only skill shows `skillReadOnlyLine` and no switch
  - nothing is drawn before the reply lands
  - `AllEnginesSwitch`'s DOM is byte-equal to before, comparing `outerHTML` against a snapshot taken before the refactor
- [ ] **Step 2: Run.** Expect FAIL. **Step 3: Implement.** **Step 4: Run.** Expect PASS. Then all four gates.
- [ ] **Step 5: Commit** `feat(skills): an On/Off switch in a store skill's inspector header`.

### Task 9: "Switched off" under Skills, and the kept skill's panel (after G1)

**Files:**
- Modify: `src/App.tsx` (`keptSkills` state, read with `get_kept_skills` after each scan and in the switch's `onChanged`), `src/components/ProfilePane.tsx` (a group after the Skills group, shaped like `:1564-1598`), `src/components/Flyout.tsx` (`KeptSkillDetail` beside `KeptServerDetail`)
- Test: `src/components/ProfilePaneKeptSkills.test.tsx`, `src/components/FlyoutKeptSkill.test.tsx`

**Interfaces:**
- Consumes: `KeptSkills` (Task 6), `switchSkill` (Task 7), `groupRowClass`, `switchedOffLine`, `timeAgo`.
- Produces: `ProfilePane` props `keptSkills?: KeptSkills | null`, `onOpenKeptSkill?: (key: string) => void` and `selectedKeptSkillKey?: string | null`. `Flyout` prop `keptSkill?: KeptSkill | null`.

- [ ] **Step 1: Write the failing tests:**
  - the group head reads `Switched off · {count}` from `KeptSkills.count` on Skills and All, with no figure when an engine is picked, matching the MCP group
  - each row shows the name and G1's second line, and opens the panel
  - the panel's switch calls `switchSkill` with the `kept-skill:` key and `enabled: true`
  - `back_in_store` shows its line and the switch still sends: the backend refuses with `already_there`, and the notice says so
  - `interrupted` shows its line
  - the group is hidden under a link-state filter, as the MCP group is (`ProfilePane.tsx:646-652`)
  - no `.length` becomes a figure (`no-frontend-counting.test.ts` stays green)
- [ ] **Step 2: Run.** Expect FAIL. **Step 3: Implement.** **Step 4: Run.** Expect PASS. Then all four gates.
- [ ] **Step 5: Commit** `feat(skills): a Switched off group for skills, each opening a panel that turns it back on`.

### Task 10: Design system samples and DESIGN.md

**Files:**
- Modify: `src/components/DesignSystemPane.tsx` (a `HeaderSwitch` specimen on a skill showing On, Off and pending; a kept-skill row; `KeptSkillDetail` with sample data), `.claude/DESIGN.md` (the header switch, the Skills "Switched off" group and the kept-skill panel, each cited to file:line)
- Test: the existing design-system specimen tests, and any guard that lists specimens

- [ ] **Step 1:** Add the specimens with sample names that are not real skills. Their switches do nothing.
- [ ] **Step 2: Run** all four gates. **Step 3:** Screenshot the Design system page and the inspector in the dev app, per `verifying-ui.md`.
- [ ] **Step 4: Commit** `docs(design): the skill switch, its group and its panel` (DESIGN.md), and separately `feat(design-system): specimens for the skill switch` (the `.tsx` change).

### Task 11: Prove it on Karthik's machine (H2: one go-ahead per write)

Nothing in this task runs without Karthik's go-ahead in the conversation at that moment. Each Off and each On is a separate write and needs its own go-ahead.

- [ ] **Step 1: Pick the skill.** The proposal is `animation-motion-design` (64 KB). It has three one-by-one links: `~/.cursor/skills/`, `~/.opencode/skills/` and `~/.copilot/skills/`. No skill links to it, and it is reached through the three whole-store links.
- [ ] **Step 2: Capture before** (read-only), to `docs/plans/2026-11-26-skill-switch-proof.md`:
  - `stat -f '%i %p %m %N'` of the folder
  - `find <folder> -type f -exec shasum -a 256 {} + | sort` and the Task 1 `fingerprint`
  - `stat -f '%p %N'` and `readlink` of each of the three links
  - the per-kind count query
- [ ] **Step 3: Off** in the dev app, with go-ahead. Check that the folder is absent from `~/.agents/skills` and that `ls ~/.claude/skills ~/.codex/skills ~/.gemini/skills` does not list it. Check that the three links are gone (none dangling) and that `find ~ -maxdepth 4 -type l ! -exec test -e {} \; -lname '*animation-motion-design*'` prints nothing. Check that Needs review shows no new issue, that the Skills head is one lower, and that "Switched off · 1" is shown. Take screenshots.
- [ ] **Step 4: On** from the "Switched off" row, with go-ahead. Repeat every Step 2 capture and diff:
  - the folder's inode, mode, mtime, file hashes and fingerprint: **identical**
  - each link's `readlink` text and mode: **identical**
  - each link's inode, ctime, mtime and xattrs: listed as new, as the constraints say
  - per-kind counts: identical to before
- [ ] **Step 5: Undo,** with go-ahead for each: Off, then Undo, which brings it back, then a rescan, then confirm. Report everything to Karthik, who closes the feature.

---

## Proposed strings (G1, for sign-off; none is final)

`{skill}` is the folder's name, as the backend sends it. Figures come from the backend.

| Where | Proposed | Notes |
|---|---|---|
| State word beside the header switch | On / Off | Already approved for servers (brief, Q2) |
| Switch's accessible name and tooltip | Switch {skill} off for every engine / Switch {skill} on for every engine | The MCP header's form. Alternative: "Switch {skill} off everywhere" |
| Notice after Off | {skill} is off for every engine. | |
| Added when links were removed | Hanger removed {links} links to it and will put them back. | Only when `links_count > 0`. Singular: "1 link" |
| Notice after On, or Undo of an Off | {skill} is back on for every engine. | |
| Notice after Undo of an On | {skill} is off for every engine. | The MCP rule: no "again" |
| Added when some links weren't put back (Q3) | Some links weren't put back because their folders are gone: {places}. | `links_not_restored`, sanitised |
| The Skills group head | Switched off · {count} | The MCP group's form |
| A row's second line, and the panel's row | Off for every engine | |
| Panel: when | Switched off {timeAgo} | Approved for servers |
| Panel: mechanism | Moved out of the global store. Hanger keeps it and puts it back, with its links, when you switch it on. | |
| Panel: `back_in_store` | There's a skill named {skill} in the global store again. | Alternative: add "Switching this one on is blocked until it's gone." |
| Panel: `interrupted` | Hanger stopped partway through switching this off. Switch it on to put it back. | |
| Read-only: `inside_another_folder` | This skill is inside another folder in the global store. Hanger only switches the ones at the top. | |
| Read-only: `other_volume` | The global store is on another disk from Hanger's keep, so Hanger can't move this skill without copying it. | |
| Read-only: `has_tracked_copies` (Q4) | Hanger copied this skill into a project and tracks that copy. Switching it off would lose track of it. | |
| Failure: `not_found` | Hanger can't find {skill} in the global store any more. | |
| Failure: `changed_since_read` | A link to {skill} changed while Hanger was working. Nothing was moved. Try again. | |
| Failure: `already_there` | There's a skill named {skill} in the global store again. Hanger changed nothing and kept its copy. | |
| Failure: `link_place_taken` | Something else is where a link to {skill} used to be. Hanger changed nothing and kept its copy. | |
| Failure: `changed_since_kept` | {skill} changed while Hanger kept it, so Hanger left it in its keep. | Q5 may change this |
| Failure: `other_volume` | Same as the read-only line | |
| Failure: `write_failed` | Hanger couldn't move {skill}. The list shows where things stand now. | |
| Failure: `not_verified` | Hanger couldn't confirm {skill} came back unchanged, so it kept its record. | |
| Failure: `not_undoable` | This can't be undone now. The skill has moved since. | |
| Failure: `read_only` | Hanger can't switch this skill. | |
| Failure: `name_refused` | Hanger won't move a skill with this name. | |

## Questions for Karthik

:::question
Some skills link to other skills from inside their own folder. On this machine `web-design-guidelines` holds 64 links to its siblings: 57 work and 7 are already broken. Switching off a skill one of these points at, such as `figma`, would break that link. What should Hanger do?

- [ ] Treat it like any other one-by-one link: remove it, record it, and put it back on On. This edits `web-design-guidelines`' folder while the skill is off.
- [ ] Refuse to switch off a skill that another skill links to, and say which skill links to it. 57 skills would have no switch today.
- [ ] Leave it, so it dangles while the skill is off.

Recommended: Treat it like any other one-by-one link: remove it, record it, and put it back on On.
:::

:::question
Where should Hanger look for one-by-one links? It can't search the whole disk on every switch. A link outside these places would be left dangling.

- [ ] A fixed list: each engine's skills folder that Hanger knows, the five folders measured on this machine (`~/.cursor/skills`, `~/.copilot/skills`, `~/.config/opencode/skills`, `~/.opencode/skills`, `~/.gemini/config/skills`), each linked project's skills folders, the store's own skill folders, and every link Hanger has recorded. The kept panel names this limit.
- [ ] The fixed list, plus a search of the home folder four levels deep before each Off (about 1 second here).

Recommended: A fixed list.
:::

:::question
When a skill is switched back on, a folder that held one of its links may be gone, for example a deleted project. What should On do?

- [ ] Put the skill back, recreate the links whose folders still exist, and name the rest in the notice. It never creates a folder.
- [ ] Refuse, and keep the skill in the keep until every link's folder is back.

Recommended: Put the skill back, recreate the links whose folders still exist, and name the rest in the notice.
:::

:::question
A skill Hanger has copied into a project, rather than linked, is tracked by its source path. Switching the source off and on would drop that tracking: the copy stays, but Hanger forgets where it came from. No skill on this machine has such a copy today.

- [ ] No switch for such a skill, with a line saying why. Revisit when copies are common.
- [ ] Switch it anyway and accept the lost tracking.

Recommended: No switch for such a skill, with a line saying why.
:::

:::question
`~/.agents/skills-disabled/` holds 9 skills you moved there by hand. Hanger doesn't read that folder today. Should the new group show them?

- [ ] Leave them alone. The group shows only what Hanger switched off.
- [ ] Show them in "Switched off" with no switch, as moved by hand.
- [ ] Offer to adopt them into Hanger's keep, so they get a switch.

Recommended: Leave them alone.
:::

:::question
Reaping is off, so a skill folder that leaves the store stays in Hanger's database. The Skills figure would then count a skill the list no longer shows. Is the switch allowed to delete that skill's own rows, and only those, when it moves the folder?

- [ ] Yes: the rows of the folder Hanger just moved, and the link rows that point at it. Nothing else. The next scan after On adds them back.
- [ ] No: keep the rows, and teach the counts and Needs review to skip kept skills instead. This touches the counting code all four kinds share.

Recommended: Yes: the rows of the folder Hanger just moved, and the link rows that point at it.
:::

## Self-review

- **Spec coverage:**
  - The switch: Tasks 6 and 8.
  - Off moves into the keep: Task 4.
  - Links removed and recorded: Tasks 2 and 4.
  - On restores exactly: Tasks 4 and 11.
  - Undo as for servers: Tasks 6 and 7.
  - "Switched off" group with rows opening the panel: Task 9.
  - Safety (nothing changed underneath, receipt, no overwrite, refusal): Tasks 1, 3 and 4.
  - Store skills only: Tasks 5 and 6 (`switch_info_for` returns `None` outside the store).
  - Never reported broken or missing: Task 5.
- **Step scan:** each test step names its tests and what they assert. Each code step gives a signature and pins the values: the paths, the `EXTRA_LINK_PLACES` list, the receipt-id grammar, and the order of Off and On. No body is written out.
- **Type consistency:**
  - `SkillPlaces`, `SkillSwitchFailure` (11 codes, identical in Rust and TS), `SkillReadOnly` (3), `KeptSkills`, `SkillSwitchReply` and `Switched` are used with one spelling.
  - Keys are `skill:` and `kept-skill:`. Receipt ids are `kept:` and `restored:`.
  - The commands `get_skill_switch`, `set_skill_enabled`, `undo_skill_switch` and `get_kept_skills` match from Task 6 through Task 9.
- **Review Focus:** seven items, each pinned to a named test in its owning task.
- **Proportion:** signatures, orders and test names only. The longest code block is Task 3's receipt type, which fixes the on-disk format later tasks depend on.
