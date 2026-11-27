# Slice 2: per-project overrides of machine-wide MCP servers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Reconciled 2026-11-28** after the `--plan` review (`docs/reviews/2026-11-28-plan-2026-11-28-slice2-per-project-plan.md`), applying `docs/plans/research/2026-11-28-reconciliation-rulings.md` R1 (P4's key-level Undo wins: this plan calls `apply::set_member` and reaches `undo_key` through `apply::undo`, issues `file:` receipt ids, and adds `~/.claude.json` to `ops::written_for`; it keeps no list editor of its own), R4 (this plan owns `ops`, `context` and `SWITCHES`, lists what P3 consumes under "Produced for P3", keeps `applies: Option<String>` with project contexts at `None`, and makes `get_engine_context`/`get_engine_contexts` async commands) and the P2 fixes: Undo of a project file re-runs the git check (Q2); Gemini servers in an untrusted folder read "needs trust", not on; Claude's `.mcp.json` approval lists and the repo's local-scope servers are read, read-only, with per-kind counts captured around it. Shared names: `docs/plans/research/2026-11-28-cross-plan-interfaces.md`.

**Goal:** Read and write "off in this repo" for a machine-wide MCP server, for Claude Code, then Codex, then Gemini CLI, and give every other engine an honest reason, reached from the repository view.

**Architecture:** `mcp::switch` gains a project context: an engine's items as one scanned root sees them, folded by `context::engine_context_in` from the machine pass, the repo pass and each engine's own per-project store. `ops` gains a `Target` (a machine item, or an item in a `KnownProject`) that later slices extend; the old entry points become thin calls into it. Each engine's writer is a pure editor in `edit/` plus one branch in `ops`, behind one row of a new `registry::PROJECT_SWITCHES` table and its own live check.

**Tech Stack:** Rust (`serde_json`, `toml`, `toml_edit` 0.25, `jsonc-parser` 0.34 `cst`, tokio), Tauri 2 commands, React 19 + TypeScript, Vitest.

**Spec:** `docs/plans/2026-11-28-harness-design.md` §4.2, §5 (rows `mcp::switch::ops`, `edit`, `apply`, `context`, `SWITCHES`, overview card), §7 (track W, the human gates) and the binding Answers 1, 2 and 5. Research: `docs/plans/research/2026-11-28-slice2-per-project-overrides.md` §3 (the measured keys), §4 (option A).

## Global Constraints

- **Q1:** "Hanger may write `projects[<realpath>].disabledMcpServers` in `~/.claude.json`. Its Undo reverses that one key by re-reading the file and taking the project back out of the list. That is a new key-level Undo in `apply`, owned by 4a." This is the only key of `~/.claude.json` this plan writes.
- **Q2:** "Repository files are written only when git does not track them; otherwise Hanger says why it can't switch there."
- **Q5:** "Claude Code first in slice 2 … Each other engine follows its own live check." Codex starts after Claude's live check is accepted, Gemini after Codex's.
- **Rule 4:** trust is never written. Codex's `[projects."<path>"] trust_level` and Gemini's `trustedFolders.json` are read only, and an untrusted project shows a reason.
- **"A key is not a path" is kept**, and extended: a project is not a path either. The webview's project string is accepted only when it is byte for byte one of the store's project roots (`preferences::get_linked_directories`), and only its real path is ever used.
- Existing signatures stay source-compatible: `ops::context_for`, `contexts_for`, `set_enabled_for`, `set_enabled_with`, `undo_for`, `context::engine_context`, `SwitchPlaces`' four fields, `EngineContext` and `ContextItem` field sets (pinned by `mcp_switch_tests.rs`' "Nothing rides along" key lists).
- No new Tauri command: the four switch commands take an optional `project`, so the README `ipc` figure doesn't move. `get_engine_context` and `get_engine_contexts` become `async fn` commands, because `context_in` awaits the git check; both are `#[tauri::command(async)]` sync functions on `main` today.
- The store schema doesn't move. `STORE_VERSION` stays 8.
- Never secrets. No reply, log or receipt `what` carries a value from a config file. Evidence commands print one key with `jq`, never a whole `~/.claude.json`, and never read credential files.
- Red first for every change under `src-tauri/src/` (`verification.md`): name, assertions, command, failing output.
- New strings: a naming brief, Karthik's sign-off and a `/humanizer` pass (`ui-copy.md`). Tokens only, no blocking dialogs, counts from the backend (`invariants.md`).
- Commits: explicit paths, each in its own Bash call, with no `-n` anywhere in it. New files `git add`ed first, then `git diff --cached --name-only` must list only this task's files. A peer holds uncommitted edits in `src/App.tsx` and test files: this plan doesn't edit `src/App.tsx`; if a task finds it must, stage it as an exact blob per `shared-checkout.md`.
- Gates (`CLAUDE.md` → Verification), each in its own call: `npx vitest run` (repo root); `cargo test` (from `src-tauri/`); `bunx tsc --noEmit`; `gitleaks detect --source .` and `gitleaks detect --source . --no-git -c .gitleaks.toml` (repo root).
- Per-kind counts, read-only, before the first commit and after the last:
  `sqlite3 -readonly -cmd ".timeout 30000" "$HOME/Library/Application Support/com.rkarthik.hanger/hanger.db" "select category, scope, count(*) from assets group by category, scope order by category, scope;"`
  Skills, rules and subagents must come back identical; tools too, unless a Codex stub existed before Task 5 (then say which row moved and why).

## Where the code disagrees with the design (the code is the fact)

- **"A server switched off in a project with `/mcp` shows as on."** No screen shows a per-project Claude Code state today: the repository view's overview card is built with `engines={[]}` (`RepoPane.tsx`), and the machine context's `On` for such a server is true machine-wide. What is missing is any per-project reading, so Task 1 builds it as the project context, and Task 9 puts it on screen.
- **`PerProjectComesNext` stays.** It is what a Claude Code server in `~/.mcp.json`, `~/.claude/mcp.json` or `~/.claude/settings.json` gets (host has a `SWITCHES` row, not at `Global`), pinned by `read_only_with_its_reason_per_project_comes_next`. Antigravity, OpenCode, Cursor and Zed never get it today (a switch, or `EngineNotConfirmed`). The design's "instead of" applies to the new project context, which never emits it for a machine item of those engines.
- **"`SWITCHES` project-tier rows" become a sibling table, `PROJECT_SWITCHES`.** In `SWITCHES` a `Project` tier already means "declared in a project's own file" (Codex's row), and `switch_rows_are_unique_per_host_and_tier` forbids a second row for one host and tier, so an override row can't live there.
- **A Codex override stub would be read as a server.** `dialect.rs` → `servers_from_toml_table` turns every table under `mcp_servers` into a server, so the stub `[mcp_servers.beta] enabled = false` that Codex merges (research §3) would become a phantom project server with an empty command, with a tool row and a count. Task 5 fixes that first.
- **`edit.rs` stays where it is.** Its new pure functions go in `src-tauri/src/mcp/switch/edit/` as submodules declared from `edit.rs`, so slice 3's entry editors (its own files) and these never share a diff hunk.

## Decisions this plan makes (design §9 leaves them to the builder)

- **Names.** `KnownProject`, `Target`, `ProjectSeen`, `PROJECT_SWITCHES`, `ProjectSwitchKind`, `refused_files`, and the five reasons below. The UI copy for each comes from Task 7.
- **New `ReadOnlyReason` variants** (snake_case on the wire), used only by the project context:
  - `NoPerProjectSwitch`: the engine has no `PROJECT_SWITCHES` row (Antigravity, OpenCode, Cursor, Zed, and every other host).
  - `OffEverywhere`: the server is off for the whole machine (a Codex `enabled = false`, Gemini's state file, Antigravity's `disabled`, a server Hanger keeps for Claude Code). "On in this repo only" is not offered.
  - `NotOpenedHereYet`: Claude Code has no `projects[<realpath>]` entry, so it has never run in this folder. Hanger writes into an existing entry only; whether Claude honours an entry Hanger creates is unmeasured.
  - `NeedsTrust`: Codex or Gemini CLI doesn't trust this folder, so it ignores the project file. For Gemini CLI every item, user-level ones included, reads `Off` with this reason, because Gemini shows every server "Disabled" in an untrusted folder (research §3). Task 6's live check confirms it.
  - `RepoFileTracked`: git tracks the file the switch would write, or Hanger couldn't ask git (no `git`, or it failed). The brief's copy must be true of both.
- **Reason order in a project context** (first that holds): the machine's rules 1–3 (`RunsOnVendorServers`, `ManagedByPlugin`, `ManagedByPolicy`); `OffEverywhere`; no `PROJECT_SWITCHES` row → `NoPerProjectSwitch`; the item's tier not covered by the row → the machine's own reason (so `~/.mcp.json` keeps `PerProjectComesNext`); the row's own checks (Claude `NotOpenedHereYet`; Codex and Gemini `NeedsTrust`, then `RepoFileTracked`); then `FileUnparseable` where a file couldn't be read.
- **Which items a project context holds:** the machine pass's items of that engine and kept servers, then that engine's registrations from `discover_repo(real)` and `discover_repo_ancestors(real, canonical home)`, in discovery order. For Claude Code it also holds this repo's own local-scope servers (`projects[<real>].mcpServers` in `~/.claude.json`, `ScopeTier::Local`), read-only: the Claude row covers `User` only, so they keep the machine's reason. Keys are discovery's `RegistrationKey`s, as in the machine context.
- **Claude's other per-project lists, read only.** A repo's `.mcp.json` server is `Off` in the project context when `projects[<real>].disabledMcpjsonServers` holds its name, and `On` otherwise (`enabledMcpjsonServers` and `enableAllProjectMcpServers` don't change an `On`). Hanger never writes either list. A server Claude hasn't been asked about yet (in neither list) reads `On`; that state is unmeasured and is a known limit.
- **A per-project switch only takes a server off in this repo, and back on by removing Hanger's override.** It never writes "on here" over a machine-wide off.
- **Receipt ids:** `file:<uuid>` for every write, P4's format (R1). A Claude key-level receipt is a `file:` id whose receipt carries `key`; `apply::undo` routes it to `apply::undo_key`. Its `key_path` holds the project's real path, so `undo_for` with no project undoes it, which is what P4's Recent changes needs. Undo of a Codex or Gemini project file needs the same `project` the write had, so `written_for` includes that file.
- **Receipt `what`:** every project write keeps `ops`' `"<engine_id> · <name> · on|off"` prefix and adds a fourth segment, `in project`, which P4's parser allows. The project's path is never a segment (P4 reads it from the key receipt's `key_path[1]`).
- **The git check** (`project::refused_files`, landed in Task 5) runs before every project-file write **and before every Undo of one** (Q2: a file the user committed after Hanger's write is never deleted or rewritten by Hanger). It runs only when `.git` (file or folder) exists at the project root or an ancestor. Then `run_capture(git, ["-C", <real>, "ls-files", "--", <relative path>], None, [("PATH", <search_path>)], 5 s)`: `ok` with empty stdout is untracked; `ok` with output is tracked; `None` or `!ok` is "couldn't check". With no `.git`, the file is untracked and git never runs. `git` is found with `engine_status::resolve::resolve_in("git", &search_path().await)`.
- **Trust reads.** Codex: `engine_base(home, ".codex")/config.toml` has `[projects."<p>"] trust_level = "trusted"` where `<p>` is the real path or the root's own spelling. Gemini: `engine_base(home, ".gemini")/trustedFolders.json` maps a path to `"TRUST_FOLDER"` (that folder and below), `"TRUST_PARENT"` (its parent and below) or `"DO_NOT_TRUST"`; the longest matching prefix wins. A missing file is untrusted. Both carry a `shortcut:` comment naming what the live check confirmed.
- **Folder creation.** A Codex or Gemini write in a project with no `.codex/` or `.gemini/` folder makes that one folder (`fs::create_dir`, not recursive) before `apply::safe_replace`, which refuses a missing folder. Undo removes the file and leaves the folder (`shortcut:` comment).

## Review Focus

1. **Claude Code rewrites `~/.claude.json` between Hanger's read and write, or a running session writes back a stale copy afterwards.** The expected outcome is `changed_since_read` with nothing written, or a context that re-reads the file and shows what is really there, never a silent "off". Test: Task 4, `a_claude_write_raced_by_claude_writes_nothing`; the stale-session case is part of the Claude live check.
2. **A linked root whose path is not its real path** (macOS temp folders sit under `/var` → `/private/var`; a symlinked `~/Work`). Claude only honours the real path. Test: Task 1, the fixture's root lives in a temp folder, and `a_list_keyed_by_a_path_that_is_not_real_is_not_claudes`.
3. **Server names that need quoting**: `a.b` in a TOML table header, `x "y"` in a JSON array, non-ASCII. Expected: written quoted, read back equal, nothing else changed. Test: Task 3, `names_that_need_quoting_round_trip` in each editor.
4. **A project file git tracks, a project that isn't a git repository, a machine with no git.** Expected: refused with `RepoFileTracked` and nothing written; allowed; refused. Test: Task 5, `a_tracked_project_file_is_never_written`.
5. **Undo after the engine changed other things in the same file.** Expected: the key-level Undo takes Hanger's name out and keeps every other change; a whole-file `file:` Undo of a project file refuses (`not_undoable`) once the file moved. Tests: Task 4, `claude_undo_survives_claudes_own_rewrites`; Task 5, `a_codex_project_undo_refuses_a_file_that_moved`.

---

## Cross-plan interfaces

Every name here matches its owner's plan; the full table is `docs/plans/research/2026-11-28-cross-plan-interfaces.md`.

- **P4 (slice 4a) owns `mcp::switch::apply`. Task 4 waits on P4 Task 1** (ruling R1). The signatures this plan calls, exactly as P4 lands them:
  - `pub struct KeyEdit { pub key_path: Vec<String>, pub member: String, pub present: bool }`. For Claude: `key_path = ["projects", <realpath>, "disabledMcpServers"]`, `member` = the server name, `present = !enabled` (true for off).
  - `pub fn set_member(path: &Path, edit: &KeyEdit, backups: &Path, what: &str) -> Result<Option<KeyReceipt>, ApplyError>`. It reads the file fresh, edits the list with `apply::member_text` through the `jsonc_parser` CST, and writes through `safe_replace`'s path. `Ok(None)` is "already so". A project with no entry is refused (`ApplyError::Write(NO_PARENT)`), which is this plan's `NotOpenedHereYet` rule.
  - `#[doc(hidden)] pub fn set_member_with(…, before_write: &dyn Fn())`: the race seam. `ops`' `Seams.before_write` is threaded into it, so the hook fires after apply's read, not before.
  - `pub fn undo_key(receipt_id: &str, backups: &Path) -> Result<KeyReceipt, ApplyError>`, reached through `apply::undo`, which routes any receipt carrying `key` to it. This plan calls `apply::undo` through `undo_for` and never calls `undo_key` directly.
  - `restore_backup` refuses a key receipt (Q9). Key-level writes keep their whole-file copy for Undo safety (P4's choice); Recent changes never offers a restore for `~/.claude.json`.
- **P7 (T19) owns `engine_status`.** Consumed unchanged, all on `main` today: `engine_status::resolve::search_path() -> String` (async), `resolve_in(bin: &str, path: &str) -> Option<PathBuf>`, `engine_status::run::run_capture(program, args, stdin, envs, timeout) -> Option<Captured>` (signature frozen by P7).
- **P7 owns the overview card and the combined layout round.** Task 9 waits for the round (`docs/plans/2026-11-28-card-layout-round.md`) to place "Off in this repo".
- **P6 fills `EngineContext.applies`** (ruling R4). It stays `Option<String>`, holding one of `next_turn`, `after_reload` or `next_session`. `engine_context` and `engine_context_in` build their `EngineContext` through one private constructor in `context.rs` that takes `applies: Option<String>` as a parameter. `engine_context` passes P6's value; `engine_context_in` passes `None` until a run observes per-project timing ("no line until observed"). Tell P6 over `SendMessage` when Task 1 lands, with the SHA.
- **Produced for P3 (slice 3)** (ruling R4). P3 uses these names and no others:
  - `ops::Target<'a> { Machine { key: &'a str }, InProject { project: &'a KnownProject, key: &'a str } }`, landed in **Task 2**. P3 adds its `NewEntry` variant after Task 2 merges; it adds no field to the existing variants.
  - `project::KnownProject` (`among(candidate, roots)`, `real_path()`), landed in **Task 1**, and the `project: Option<String>` argument on the four switch commands, resolved by `KnownProject::among` over `preferences::get_linked_directories`, landed in **Task 2**.
  - `ReadOnlyReason::RepoFileTracked`, landed in **Task 1** (raised from Task 5 on). It also covers "couldn't ask git".
  - `pub async fn project::refused_files(real: &Path, files: &[PathBuf]) -> Vec<PathBuf>`, landed in **Task 5**, which starts only after Claude Code's live check (Task 4 Step 6) is accepted. Fail-closed: a file Hanger couldn't ask git about is in the result. **P3's Task 17 waits on this task**, and so behind a human gate.
  - The `edit/` folder and its `pub mod` lines (Task 3). P3 adds `pub mod entries;` itself, after telling this plan's session. P3's parse-boundary detector shares `dialect.rs` with Task 5's one-function change in `servers_from_toml_table`; whichever merges second rebases.
- **Produced for P1 (MCP phase 2) and P4b:** `set_enabled_for`, `undo_for`, `context_for`, `contexts_for` unchanged in signature and behaviour.
- **Unowned shared file:** `src/hooks/useMcpSwitch.ts`. P1 (`decideProposal`), this plan (`project`, Task 8) and P4 (`loadProfile`) modify it, in that merge order.
- **The batched naming round (design §7):** Task 7's strings join it if it is open, otherwise they get their own brief.

---

### Task 1: Read Claude Code's per-project lists (the project context)

**Files:**
- Create: `src-tauri/src/mcp/switch/project.rs`
- Modify: `src-tauri/src/mcp/switch/mod.rs` (declare `project`; module doc's list of parts and "A project registration is not in the machine pass" sentence)
- Modify: `src-tauri/src/mcp/switch/context.rs`
- Modify: `src-tauri/src/mcp/switch/ops.rs`
- Modify: `src-tauri/src/mcp/registry.rs` (empty `PROJECT_SWITCHES` table and its types)
- Create: `src-tauri/tests/mcp_project_switch_tests.rs`
- Modify: `README.md` (the `tests` region only, regenerated)

**Interfaces:**
- Produces, in `mcp::switch::project`:
  - `pub struct KnownProject { /* private */ }` with `pub fn among(candidate: &str, roots: &[String]) -> Option<KnownProject>` (`Some` only when `candidate` is byte-equal to a root and `fs::canonicalize` succeeds) and `pub fn real_path(&self) -> &Path`.
- Produces, in `mcp::registry`:
  - `pub enum ProjectSwitchKind { ClaudeProjectList, CodexProjectFile, GeminiProjectExcluded }`
  - `pub struct ProjectSwitchRow { pub host_id: &'static str, pub kind: ProjectSwitchKind, pub tiers: &'static [ScopeTier], pub confirmed: &'static str }` (`tiers`: the item tiers the override reaches)
  - `pub const PROJECT_SWITCHES: &[ProjectSwitchRow] = &[];` with a doc saying rows land with their writers (Tasks 4–6), and `pub fn project_switch_for(host_id: &str, tier: ScopeTier) -> Option<&'static ProjectSwitchRow>`.
- Produces, in `mcp::switch::context`:
  - `ReadOnlyReason::{NoPerProjectSwitch, OffEverywhere, NotOpenedHereYet, NeedsTrust, RepoFileTracked}`, appended after `FileUnparseable`.
  - `pub struct ProjectSeen<'a> { pub real_path: &'a str, pub discovered: &'a DiscoveryResult, pub trusted_by: &'a [&'static str], pub refused_files: &'a [PathBuf] }`
  - `pub fn engine_context_in<R, P>(host_id: &str, machine: &DiscoveryResult, project: &ProjectSeen, stashed: &[StashedServer], gemini_state: Option<&str>, read_file: R, probe_of: P) -> EngineContext` (same bounds as `engine_context`).
- Produces, in `mcp::switch::ops`:
  - `pub async fn context_in<P>(places: &SwitchPlaces, engine_id: &str, project: &KnownProject, probe_of: P) -> EngineContext`
  - `pub async fn contexts_in<P>(places: &SwitchPlaces, project: &KnownProject, probe_of: P) -> Vec<EngineContext>` (the engines with an item in the project context, in discovery order, as `contexts_for` orders them)

- [ ] **Step 1: Live check of `/mcp disable` (stops for Karthik).** Ask in Plannotator, and wait. Karthik picks a scratch folder he has opened in Claude Code and a user-scope server, and runs `/mcp` → disable there. Before and after, run (never printing the whole file):
  `jq --arg p "$(cd <folder> && pwd -P)" '.projects[$p] | {disabledMcpServers, enabledMcpServers}' ~/.claude.json`
  and `cd <folder> && claude mcp list | grep '<name>'`. Save both to `docs/evidence/2026-11-28-slice2/g1-mcp-disable.txt`. **Pass:** the name appears in `disabledMcpServers` under the real path and `mcp list` says "Disabled for this project". Anything else (another key, `.claude/settings.local.json`, `enabledMcpServers` only) stops the plan for Karthik. Then he re-enables it with `/mcp`.
- [ ] **Step 2: Capture the per-kind baseline** with the Global Constraints command into `docs/evidence/2026-11-28-slice2/counts.txt` under `baseline <timestamp>`.
- [ ] **Step 3: Write the failing tests** in `mcp_project_switch_tests.rs`. The fixture: a `tempfile` root holding `home/`, `system/` and `repo/`; `real = fs::canonicalize(root/repo)` (under `/private/var` on macOS, so it differs from the spelling); `places = SwitchPlaces { home, system, backups, stash }`; `roots = vec![repo spelled as created]`; `home/.claude.json = {"mcpServers": {"alpha": {"command": "echo"}, "beta": {"command": "echo"}}, "projects": {<real>: {"disabledMcpServers": ["beta"]}}}`.
  - `claude_reads_a_server_off_in_one_project`: `project = KnownProject::among(&roots[0], &roots).unwrap()`. In `context_in(&places, "claude-code", &project, |_| None).await`, `beta` is `ItemState::Off` and `alpha` is `ItemState::On`. In `context_for(&places, "claude-code", |_| None)`, `beta` is `On`. Each item's `key` equals the machine item's key for that name.
  - `another_project_is_untouched`: a second root `repo2` with no `projects` entry: `beta` is `On`.
  - `a_list_keyed_by_a_path_that_is_not_real_is_not_claudes`: the same file with `projects` keyed by the unresolved spelling: `beta` is `On`.
  - `a_project_is_only_a_known_root`: `among(&format!("{}/", roots[0]), &roots)`, `among("/nowhere", &roots)` and `among(&real_str, &roots)` (when it differs from the spelling) are all `None`.
  - `engines_with_no_project_switch_say_so`: with `home/.cursor/mcp.json = {"mcpServers": {"c": {"command": "echo"}}}` and `home/.gemini/config/mcp_config.json = {"mcpServers": {"g": {"command": "echo"}}}`, the `cursor` item `c` and the `antigravity` item `g` have `read_only == Some(ReadOnlyReason::NoPerProjectSwitch)` in the project context; and `claude-code`'s `alpha` has the same reason (no `PROJECT_SWITCHES` row yet).
  - `a_server_off_for_the_machine_is_off_everywhere`: `home/.codex/config.toml` with `[mcp_servers.k]\ncommand = "echo"\nenabled = false\n`: in `context_in(…, "codex", …)`, `k` is `(Off, Some(OffEverywhere))`.
  - `the_new_reasons_are_spelled_in_snake_case`: `no_per_project_switch`, `off_everywhere`, `not_opened_here_yet`, `needs_trust`, `repo_file_tracked`.
  - `a_rejected_mcp_json_server_reads_off_in_its_project`: `repo/.mcp.json` declares `m1` and `m2`; `projects[<real>].disabledMcpjsonServers = ["m2"]`, `enabledMcpjsonServers = ["m1"]`. In the project context `m1` is `On`, `m2` is `Off`, both read-only with `PerProjectComesNext`.
  - `this_repos_local_scope_servers_are_in_its_project_context`: `projects[<real>].mcpServers = {"loc": {"command": "echo"}}`. The project context holds `loc` (`Local` tier, read-only); the machine context and `repo2`'s project context don't.
  - `an_ancestor_server_survives_a_canonical_repo_path`: `home/.mcp.json` declares `anc` and `home` is spelled through a symlink. `anc` is in the project context, because `discover_repo_ancestors` gets the canonical home.
  - `a_project_context_says_nothing_about_when_a_change_applies`: every project context's `applies` is `None`.
- [ ] **Step 4: Run them and watch them fail.** From `src-tauri/`: `cargo test --test mcp_project_switch_tests`. Expected: build failure, `error[E0432]: unresolved import` (for `mcp::switch::project`) and `error[E0425]: cannot find function \`context_in\``.
- [ ] **Step 5: Implement.** `context_in` canonicalises nothing in the project (`KnownProject` already holds the real path) and canonicalises `home` once; it runs `discover_machine_at`, `discover_repo(real)` and `discover_repo_ancestors(real, canonical home)`, reads the stash and Gemini's state file as `look` does, and calls `engine_context_in` with `trusted_by: &[]` and `refused_files: &[]`. `engine_context_in` applies the reason order above; for a Claude Code `User`-tier item, it reads the item's own `config_path` through `read_file`, parses it with `serde_json` after `strip_jsonc`, and the item is `Off` when `projects[real_path].disabledMcpServers` holds its name exactly (a missing entry or list is `On`; an unparseable file is `On` with `FileUnparseable`). From the same parse it takes `disabledMcpjsonServers` for the repo's `.mcp.json` items and `mcpServers` for this repo's local-scope items (both read-only, per "Decisions"). `engine_context` and `engine_context_in` share one private constructor of `EngineContext` that takes `applies: Option<String>` as a parameter (P6's interface, ruling R4); `engine_context_in` passes `None`. Update the `context.rs` module doc ("Why an item has no switch" gains the project order) and the `ops` doc ("A key is not a path" gains "A project is not a path either").
- [ ] **Step 6: Run them and watch them pass**, then `cargo test` (from `src-tauri/`) in full: `mcp_switch_tests` must be unchanged and green, including `states_and_reasons_are_spelled_in_snake_case` and the "Nothing rides along" key lists.
- [ ] **Step 6b: Per-kind counts after**, read-only, with the Global Constraints command, appended to `docs/evidence/2026-11-28-slice2/counts.txt` under `after-task-1 <timestamp>`. The rulings expect counts to move once these lists are read (a peer's scan, or a project's servers counted differently), so compare every row with the baseline and report each move with its cause; never reconcile one away.
- [ ] **Step 7: Regenerate the README figures:** `~/.bun/bin/bun run src/__tests__/readmeCounts.ts`. Only the `tests` region moves (53 → 54 Rust integration test files). Then `npx vitest run src/__tests__/readme-sync.test.ts` passes.
- [ ] **Step 8: Commit** by explicit path: `src-tauri/src/mcp/switch/project.rs src-tauri/src/mcp/switch/mod.rs src-tauri/src/mcp/switch/context.rs src-tauri/src/mcp/switch/ops.rs src-tauri/src/mcp/registry.rs src-tauri/tests/mcp_project_switch_tests.rs README.md` (`docs/evidence/` is local-only per `documentation.md`, so the evidence files stay out of every commit; the checkpoint report quotes them). Message: `feat(mcp): read Claude Code's per-project server lists into a project context`.

### Task 2: The `ops` target, and the project on the four switch commands

**Files:**
- Modify: `src-tauri/src/mcp/switch/ops.rs`
- Modify: `src-tauri/src/lib.rs` (`get_engine_context`, `get_engine_contexts`, `set_mcp_server_enabled`, `undo_mcp_switch`; the first two become `async fn` commands)
- Modify: `docs/ipc.md` §15, §16, §17, §20
- Test: `src-tauri/tests/mcp_project_switch_tests.rs`

**Interfaces:**
- Consumes: Task 1's `KnownProject`, `context_in`, `contexts_in`.
- Produces, in `mcp::switch::ops`:
  - `pub enum Target<'a> { Machine { key: &'a str }, InProject { project: &'a KnownProject, key: &'a str } }`
  - `pub async fn set_enabled_at<P>(places: &SwitchPlaces, cli: &ClaudeCli, engine_id: &str, target: Target<'_>, enabled: bool, probe_of: P) -> Result<SwitchReply, SwitchFailure>`; its `SwitchReply.context` is `context_in` for an `InProject` target.
  - `pub async fn undo_at<P>(places: &SwitchPlaces, cli: &ClaudeCli, engine_id: &str, project: Option<&KnownProject>, receipt_id: &str, probe_of: P) -> Result<SwitchReply, SwitchFailure>`
  - `#[doc(hidden)] pub async fn set_enabled_at_with<P>(…same…, seams: Seams<'_>)`, the seam form Task 4's race test uses.
  - `set_enabled_for` = `set_enabled_at(Target::Machine { key })`; `set_enabled_with` = `set_enabled_at_with(Target::Machine { key }, …)`; `undo_for` = `undo_at(None, …)`. Signatures unchanged.
- Produces, over IPC: each of the four commands takes `project: Option<String>`. `None` behaves exactly as today. `Some(p)` resolves through `KnownProject::among(&p, &store.get_linked_directories()?)`; no match is `Err("not_found")`.

- [ ] **Step 1: Write the failing tests:**
  - `an_in_project_key_must_be_an_item_of_that_project_context`: `set_enabled_at(…, "claude-code", Target::InProject { project, key: "/nowhere/.claude.json:beta" }, false, …)` is `Err(SwitchFailure::NotFound)`; the `cursor` item's key under `"claude-code"` is `Err(WrongEngine)`.
  - `an_item_with_a_project_reason_is_refused_and_nothing_changes`: `beta` (reason `NoPerProjectSwitch` at this commit) asked off is `Err(SwitchFailure::ReadOnly)`, and `home/.claude.json`'s bytes and the backups folder are unchanged.
  - `the_machine_entry_points_are_the_machine_target`: for every case in the fixture, `set_enabled_for(key)` and `set_enabled_at(Target::Machine { key })` each run on a **fresh copy** of the fixture, and their replies are equal in everything but `receipt_id`, which is a new UUID each time (both are `Some` or both `None`). The written files are byte-equal.
  - `an_unknown_project_receipt_is_not_undoable`: `undo_at(…, Some(&project), "file:nope", …)` is `Err(NotUndoable)`.
- [ ] **Step 2: Run and watch them fail.** `cargo test --test mcp_project_switch_tests`. Expected: `error[E0433]: failed to resolve: use of undeclared type \`Target\``.
- [ ] **Step 3: Implement.** `switch` takes a `Target`; for `InProject` it builds the project context, applies today's trust boundary to its items (empty → `WrongEngine`/`NotFound` as today; `read_only` → `ReadOnly`; a `stash:` key → `ReadOnly`), then dispatches on `project_switch_for(host, tier)`'s kind. No kind has a row yet, so every in-project item is refused before dispatch; each writer adds its arm. `undo_at` widens `written_for` with the project's files when `project` is `Some`; Task 5 adds the git re-check before an Undo writes one. In `lib.rs`, resolve the project before calling `ops`, and keep each command's doc comment true. `docs/ipc.md`: the `project` argument, the five reasons, and that a project context's items have the same shape.
- [ ] **Step 4: Run and watch them pass**, then the full `cargo test`, `npx vitest run` (no TS changed: the webview sends no `project` yet) and `bunx tsc --noEmit`.
- [ ] **Step 5: Commit** by explicit path `src-tauri/src/mcp/switch/ops.rs src-tauri/src/lib.rs docs/ipc.md src-tauri/tests/mcp_project_switch_tests.rs`: `feat(mcp): a switch target for an item in one project`. Then tell P3's session over `SendMessage` that `Target` is on `main`, with the SHA (`git cat-file -t` first).

### Task 3: The two pure editors

Claude's list is edited by P4's `apply::member_text` (ruling R1), so this plan writes no Claude editor.

**Files:**
- Modify: `src-tauri/src/mcp/switch/edit.rs` (two `pub mod` lines and a doc line; nothing else)
- Create: `src-tauri/src/mcp/switch/edit/codex_project.rs`, `edit/gemini_project.rs`
- Test: `src-tauri/tests/mcp_project_switch_tests.rs`

**Interfaces:**
- Produces (all `Result<_, EditError>`, no I/O):
  - `codex_project::override_of(body: Option<&str>, name: &str) -> Result<Option<bool>, EditError>`: the `enabled` of `[mcp_servers.<name>]` in a project file.
  - `codex_project::set_override(body: Option<&str>, name: &str, off: bool) -> Result<String, EditError>`: off sets `enabled = false` in an existing table, or appends `[mcp_servers.<name>]\nenabled = false\n`; on removes the table when `enabled` is its only key, else removes `enabled`.
  - `gemini_project::is_excluded(body: Option<&str>, name: &str) -> Result<bool, EditError>` and `set_excluded(body: Option<&str>, name: &str, excluded: bool) -> Result<String, EditError>` over `mcp.excluded`, creating `{"mcp": {"excluded": [name]}}` when `body` is `None`.

- [ ] **Step 1: Write the failing tests**, each over literal text:
  - `codex_stub_off_then_on_gives_the_bytes_back`: `set_override(Some("# mine\n"), "beta", true)` is `"# mine\n\n[mcp_servers.beta]\nenabled = false\n"`; `set_override(Some(that), "beta", false)` is `"# mine\n"`. With `body = None`, off then on gives `""`.
  - `codex_override_on_a_declared_table_sets_its_flag`: a full `[mcp_servers.beta]` with `command` keeps `command` and gets `enabled = false`.
  - `gemini_excluded_keeps_other_settings`: `{"ui": {"theme": "x"}, // c\n "mcp": {"allowed": ["a"]}}` gets `"excluded": ["beta"]` inside `mcp`, the comment and `ui` unchanged; removing gives the input bytes back.
  - `names_that_need_quoting_round_trip` (Review Focus 3): `a.b`, `x "y"` and `café` through each editor: written, read back by the editor's own reader and by `serde_json`/`toml`, and removed to the original bytes. (Claude's list is P4's: its `member_text` tests cover quoting there.)
- [ ] **Step 2: Run and watch them fail:** `cargo test --test mcp_project_switch_tests`. Expected: `error[E0433]: failed to resolve: could not find \`codex_project\` in \`edit\``.
- [ ] **Step 3: Implement** with `jsonc_parser::cst` and `toml_edit::DocumentMut`, reusing `edit.rs`'s private helpers (`parse_json`, `parse_toml`, `toml_text` and the rest), which its submodules can already see, so `edit.rs` changes by the two `pub mod` lines only.
- [ ] **Step 4: Run and watch them pass**, then the full `cargo test`.
- [ ] **Step 5: Commit** by explicit path (the two new files after `git add`, `edit.rs`, the test file): `feat(mcp): pure editors for Codex and Gemini project overrides`.

### Task 4: Claude Code's per-project switch (waits on P4; Q5 first)

**Files:**
- Modify: `src-tauri/src/mcp/registry.rs` (the Claude row)
- Modify: `src-tauri/src/mcp/switch/context.rs`, `ops.rs`
- Test: `src-tauri/tests/mcp_project_switch_tests.rs`

**Interfaces:**
- Consumes: P4's `apply::KeyEdit`, `set_member`, `set_member_with` and `apply::undo` (which routes a key receipt to `undo_key`), exactly as P4 Task 1 lands them (ruling R1).
- Produces: `ProjectSwitchRow { host_id: "claude-code", kind: ClaudeProjectList, tiers: &[User], confirmed: "claude 2.1.332, 2026-11-28, throwaway HOME; /mcp disable checked <G1 date>" }`; `written_for(…, "claude-code")` now includes `engine_base(home, ".claude.json")`, so `undo_for`'s `file:` route reaches the key Undo with no project in hand (P4's Recent changes needs that). Receipt ids are `file:<uuid>`.

- [ ] **Step 0:** Confirm P4's entry points are on `main`: `grep -n "pub fn set_member\|pub fn undo_key\|pub struct KeyEdit" src-tauri/src/mcp/switch/apply.rs` prints three lines. If not, stop: this task waits.
- [ ] **Step 1: Write the failing tests:**
  - `claude_off_in_this_repo_writes_one_list`: in the project context `beta` now has `read_only == None`; `set_enabled_at(InProject { beta }, false)` returns a reply whose `receipt_id` starts `file:`, whose context has `beta` `Off`; the file parses to the input plus `"beta"` in P's list, every other key unchanged, and `context_for`'s `beta` is still `On`. The receipt's `what` is `"claude-code · beta · off · in project"`.
  - `claude_never_opened_here_is_refused`: for `repo2`, `beta` is `NotOpenedHereYet`, and switching it is `Err(ReadOnly)` with the file's bytes unchanged.
  - `claude_undo_survives_claudes_own_rewrites` (Review Focus 5): after the off, set `"numStartups"` to 8 and add a project; `undo_at(Some(&project), receipt)` succeeds, `beta` leaves the list, and `numStartups == 8` and the new project remain. Then undoing that Undo puts `beta` back.
  - `a_claude_write_raced_by_claude_writes_nothing` (Review Focus 1): through `set_enabled_at_with`'s seam (Task 2), whose `before_write` is handed to `apply::set_member_with` so it fires after apply's read, the hook rewrites `numStartups`; the answer is `Err(ChangedSinceRead)`, the file holds the racer's bytes, and no receipt exists.
  - `a_claude_key_receipt_undoes_with_no_project`: `undo_for(places, cli, "claude-code", <that file: id>, …)` (no project) succeeds and takes `beta` out of P's list. This is the route P4's Recent changes uses.
- [ ] **Step 2: Run and watch them fail.** Expected: `claude_off_in_this_repo_writes_one_list` fails with `left: Some(NoPerProjectSwitch)`, `right: None`.
- [ ] **Step 3: Implement.** Add the row. The `ClaudeProjectList` arm builds `KeyEdit { key_path: ["projects", <real>, "disabledMcpServers"], member: <name>, present: !enabled }` and calls `apply::set_member` (or `set_member_with` from the seam form) on the item's own `config_path`, `engine_base(home, ".claude.json")`. `set_member` reads, edits through `member_text` and writes; this plan computes no text and keeps no second editor. `Ok(None)` is "already so", with no receipt. Add `.claude.json` to `written_for` for `claude-code`, and correct the doc comment on `written_for` that says "`.claude.json` is never one of them". Undo needs no code here: `undo_for`/`undo_at` reach `apply::undo`, which routes the key receipt.
- [ ] **Step 4: Run and watch them pass**, then the full `cargo test`.
- [ ] **Step 5: Commit** by explicit path: `feat(mcp): switch a Claude Code server off in one project`.
- [ ] **Step 6: Live check, Claude Code (stops for Karthik).** Ask in Plannotator, and wait for his go-ahead. On the dev build, from a scratch project he names, run the switch through `set_mcp_server_enabled` with `project` (Task 9's UI if it exists, else the MCP bridge's `execute_js` invoking the command). Artefacts in `docs/evidence/2026-11-28-slice2/g4-claude.txt`: the Step 1 `jq` line and `claude mcp list | grep <name>` before, after the switch, and after Undo; the receipt file's name in `<data>/switch/backups`; per-kind counts. Then, with a Claude session open in that folder, switch again, send one prompt in the session, quit it, and run the `jq` line: record whether the key survived. **Pass:** "Disabled for this project" after, gone after Undo, counts unchanged. If the session erased the key, stop for Karthik before Codex starts.

### Task 5: Codex's per-project switch (after Task 4's live check)

**Files:**
- Modify: `src-tauri/src/mcp/dialect.rs` (`servers_from_toml_table` only)
- Modify: `src-tauri/src/mcp/registry.rs`, `src-tauri/src/mcp/switch/project.rs`, `context.rs`, `ops.rs`
- Test: `src-tauri/tests/mcp_discovery_tests.rs`, `src-tauri/tests/mcp_project_switch_tests.rs`

**Interfaces:**
- Produces: `ProjectSwitchRow { host_id: "codex", kind: CodexProjectFile, tiers: &[Global, Project], confirmed: "codex-cli 0.172.0, 2026-11-28, throwaway HOME" }`; in `project`, `pub async fn refused_files(real: &Path, files: &[PathBuf]) -> Vec<PathBuf>` (the git check, fail-closed; P3's Task 17 consumes it) and `pub fn codex_trusts(config: Option<&str>, real: &Path, spelled: &str) -> bool`; `undo_at` runs `refused_files` on a project file before it undoes a write to it. When this task merges, tell P3's session over `SendMessage`, with the SHA.

- [ ] **Step 1: The stub is not a server (its own red/green and commit).** Test in `mcp_discovery_tests.rs`: `a_codex_table_with_neither_command_nor_url_is_an_override`: `parse_swept`/`read_one_for_test` over `[mcp_servers.alpha]\ncommand = "echo"\n\n[mcp_servers.beta]\nenabled = false\n` yields one registration, `alpha`. Run `cargo test --test mcp_discovery_tests a_codex_table_with_neither_command_nor_url_is_an_override`; expected `left: 2, right: 1`. Skip such tables in `servers_from_toml_table` with a one-line why. Full `cargo test`; per-kind counts from the real store after a dev-app rescan, compared with the baseline. Commit `src-tauri/src/mcp/dialect.rs src-tauri/tests/mcp_discovery_tests.rs`: `fix(mcp): a Codex table with no launch is an override, not a server`.
- [ ] **Step 2: Write the failing tests** (fixture: `home/.codex/config.toml` declares `alpha` and `beta`, and `[projects."<real>"] trust_level = "trusted"`):
  - `codex_off_in_this_repo_writes_a_stub`: `beta` switchable; off writes `<real>/.codex/config.toml` (folder made) holding exactly the stub; project context `beta` `Off`, machine `On`; Undo (`file:`) removes the file.
  - `codex_untrusted_needs_trust`: without the `projects` table, `beta` is `NeedsTrust` and switching is `Err(ReadOnly)`.
  - `a_tracked_project_file_is_never_written` (Review Focus 4): `git init` the repo, write and `git add` a `.codex/config.toml`: `beta` is `RepoFileTracked`; switching is `Err(ReadOnly)` with bytes unchanged. The same repo with the file untracked is switchable. A repo folder with no `.git` is switchable. The test resolves `git` the way production does and is skipped with a printed reason only if none is found.
  - `codex_project_declared_items_switch_in_their_project`: a project-declared `gamma` (Project tier) is dispatched to the `CodexProjectFile` arm, which sets `enabled = false` in `gamma`'s own table in the project file (`set_override` on a declared table).
  - `a_project_undo_of_a_file_git_now_tracks_is_refused` (Q2): after the off, `git init` and `git add` the new `.codex/config.toml`; `undo_at(Some(&project), receipt)` is `Err(ReadOnly)` and the file's bytes are unchanged.
  - `a_project_value_wins_over_a_machine_off`: the machine table has `enabled = false` for `beta`, and the project file says `[mcp_servers.beta]\nenabled = true`. The project context shows `beta` `On` with `read_only == None` (trusted, untracked): an item is `OffEverywhere` only when the folded state is `Off` because of the machine flag, so here the row's own checks decide, and it can be switched off in this repo.
  - `a_codex_project_undo_refuses_a_file_that_moved` (Review Focus 5): edit the project file after the off; Undo is `Err(NotUndoable)`.
- [ ] **Step 3: Run and watch them fail.** Expected: `left: Some(NoPerProjectSwitch), right: None` for the first.
- [ ] **Step 4: Implement.** `context_in` fills `trusted_by` and `refused_files` (both for every row's files, before the fold); the fold reads the project file's override with `codex_project::override_of` (its value wins over the machine flag, as Codex merges), and the reason order is applied to the folded state, so `OffEverywhere` holds only when the folded state is `Off` because of the machine flag. `undo_at` calls `refused_files(real, &[receipt.path])` before `apply::undo` and refuses with `ReadOnly` when the file is in the result. The `CodexProjectFile` arm: `set_override`, an `only_the_stub_differs` check, `safe_replace` with `Format::Toml`, `file:` receipt.
- [ ] **Step 5: Run and watch them pass**, then the full `cargo test`.
- [ ] **Step 6: Commit** by explicit path: `feat(mcp): switch a Codex server off in one trusted project`.
- [ ] **Step 7: Live check, Codex (stops for Karthik)**, as Task 4 Step 6, in a trusted, untracked scratch project: `cat <repo>/.codex/config.toml`, `cd <repo> && codex mcp list --json | jq '.[] | select(.name == "<name>") | .enabled'`, `git status --porcelain`, receipt name and counts, before, after and after Undo. Save to `g5-codex.txt`. **Pass:** `false` after, the file gone after Undo.

### Task 6: Gemini CLI's per-project switch (after Task 5's live check)

**Files:**
- Modify: `src-tauri/src/mcp/registry.rs`, `project.rs`, `context.rs`, `ops.rs`
- Test: `src-tauri/tests/mcp_project_switch_tests.rs`

**Interfaces:**
- Produces: `ProjectSwitchRow { host_id: "gemini", kind: GeminiProjectExcluded, tiers: &[Global, Project], confirmed: "gemini 0.56.0, 2026-11-28, throwaway HOME" }`; `project::gemini_trusts(folders: Option<&str>, real: &Path) -> bool`.

- [ ] **Step 1: Write the failing tests** (fixture: `home/.gemini/settings.json` declares `beta`; `trustedFolders.json` = `{<real>: "TRUST_FOLDER"}`):
  - `gemini_off_in_this_repo_excludes_the_name`: `<real>/.gemini/settings.json` becomes `{"mcp": {"excluded": ["beta"]}}`; project `beta` `Off`, machine `On`; the state file is untouched; Undo removes the created file.
  - `gemini_trust_follows_its_prefix_rules`: `TRUST_PARENT` on `<real>/sub` trusts `<real>`; `DO_NOT_TRUST` on `<real>` under a trusted parent does not; no file does not.
  - `gemini_in_an_untrusted_folder_reads_needs_trust_not_on`: with no `trustedFolders.json` entry for `<real>`, every Gemini item in the project context, the user-level `beta` included, is `(Off, Some(NeedsTrust))`; the machine context's `beta` is still `On`.
  - `gemini_off_by_state_file_is_off_everywhere`: state file `{"beta": {"enabled": false}}` → `(Off, Some(OffEverywhere))`.
  - `gemini_tracked_settings_are_never_written`: as Task 5's git case.
- [ ] **Step 2: Run and watch them fail.** Expected: `left: Some(NoPerProjectSwitch), right: None`.
- [ ] **Step 3: Implement** as Task 5, with `gemini_project` and `Format::Jsonc`.
- [ ] **Step 4: Run and watch them pass**, then the full `cargo test`.
- [ ] **Step 5: Commit** by explicit path: `feat(mcp): switch a Gemini CLI server off in one trusted project`.
- [ ] **Step 6: Live check, Gemini CLI (stops for Karthik)**, as before: the project settings file, `cd <repo> && gemini mcp list | grep <name>` ("Blocked" after), `git status --porcelain`, receipt and counts. Also run `gemini mcp list` once in an untrusted scratch folder and record what a user-level server reads there; if it isn't "Disabled", the fold in `gemini_in_an_untrusted_folder_reads_needs_trust_not_on` is wrong and Karthik rules before this task closes. Record whether Gemini's own folder-trust setting is on, since enforcement depends on it. Save to `g6-gemini.txt`.

### Task 7: Naming brief for "Off in this repo" and the five reasons (stops for Karthik)

**Files:**
- Create: `docs/plans/2026-11-28-slice2-naming-brief.md`, or a section in the batched round's brief if it is open.

- [ ] **Step 1:** Write the brief: the action label ("Off in this repo"), its undo/on form, and one line each for `no_per_project_switch`, `off_everywhere`, `not_opened_here_yet`, `needs_trust`, `repo_file_tracked`, each true of the code (Task 1's decisions; `repo_file_tracked` must also cover "couldn't check"). Research each against `switchCopy.ts`' existing lines, the engines' own words (`claude mcp list`'s "Disabled for this project", Gemini's "Blocked"), and the app's nouns (`ui-copy.md`).
- [ ] **Step 2:** `/humanizer` pass on every string.
- [ ] **Step 3:** Ask Karthik in Plannotator and wait. Record his ruled strings verbatim in the brief. Nothing in Tasks 8–9 is written before this.
- [ ] **Step 4: Commit** the brief by explicit path.

### Task 8: The webview's types and copy

**Files:**
- Modify: `src/types/engineContext.ts`, `src/utils/switchCopy.ts`, `src/utils/switchCopy.test.ts`, `src/hooks/useMcpSwitch.ts`, `src/hooks/useMcpSwitch.test.ts`

**Interfaces:**
- Produces: `ReadOnlyReason` gains the five codes; `READ_ONLY_LINES` gains five ruled lines (exhaustive `Record`, so `tsc` fails until each has one); `useMcpSwitch`'s switch and Undo calls take an optional `project: string`, sent as `project` only when given.

- [ ] **Step 1: Write the failing tests:** `readOnlyLine` for each new code returns Task 7's string verbatim with names substituted; `useMcpSwitch` with `project: "/r"` invokes `set_mcp_server_enabled` with `{ engineId, key, enabled, project: "/r" }`, its Undo `undo_mcp_switch` with `project: "/r"`, and without `project` sends no `project` key.
- [ ] **Step 2: Run and watch them fail:** `npx vitest run src/utils/switchCopy.test.ts src/hooks/useMcpSwitch.test.ts`. Expected: the five lines `undefined`, and the invoke payload lacking `project`.
- [ ] **Step 3: Implement.** Update the type's header comment ("No component uses these yet" is false; say which do).
- [ ] **Step 4:** `npx vitest run`, `bunx tsc --noEmit`.
- [ ] **Step 5: Commit** by explicit path: `feat(switch): the webview knows the per-project reasons and sends a project`.

### Task 9: "Off in this repo" on the repository view (waits on the combined layout round)

**Files:**
- Modify: `src/components/RepoPane.tsx` and the component the round places the action in
- Create: `src/hooks/useProjectContexts.ts` and its test
- Test: `src/components/RepoPaneList.test.tsx` or a new `RepoPaneProjectSwitch.test.tsx`

**Interfaces:**
- Consumes: `get_engine_contexts` with `project: repoPath`; Task 8's `useMcpSwitch` `project`; the round's placement.
- Produces: `useProjectContexts(repoPath: string): EngineContext[] | null`, refetched after each switch reply (its `context` replaces that engine's entry). `src/App.tsx` is not touched. Measuring stays off the repository view: `measure_engine_context` takes no project and replies with a machine context, so the repo view offers no measure control, and a measure made elsewhere triggers a refetch of the project contexts rather than replacing an entry with its reply.

- [ ] **Step 0:** Confirm the combined card layout round (owned by P7) has ruled where "Off in this repo" sits, at true width in real tokens. If not, stop: this task waits.
- [ ] **Step 1: Write the failing tests:** on a repo pane whose project contexts hold `beta` `On` and switchable for Claude Code, the row shows the ruled action; clicking it invokes `set_mcp_server_enabled` with `project: repoPath`; a reply with `beta` `Off` shows the ruled off state and an Undo; an item with `read_only: "needs_trust"` shows Task 7's line and no action. No figure is derived in the frontend (`no-frontend-counting.test.ts` stays green without an allowlist entry).
- [ ] **Step 2: Run and watch them fail**, with the exact `npx vitest run <file>` command. Expected: the action not found.
- [ ] **Step 3: Implement** per the round.
- [ ] **Step 4:** All four gates.
- [ ] **Step 5: Commit** by explicit path: `feat(repo): switch a server off in this repo`.
- [ ] **Step 6: Screenshot (stops for Karthik).** On the dev build (`verifying-ui.md`: dev pid, window ≥ 900×600, title `Hanger AI (dev)`, theme read from the store), capture the repo row before, after "Off in this repo", and after Undo, each corroborated by the `jq` line of Task 1 Step 1. Karthik accepts or rejects.

### Task 10: Close

- [ ] **Step 1:** Final per-kind counts, appended to the counts file under `final <timestamp>`. Every row equals the baseline, or the moved row is named with its cause (Task 5 Step 1, or a peer's scan with timestamps).
- [ ] **Step 2:** Grep the merged tree's strings, model-facing ones included (`mcp_server/strings.rs`, `docs/mcp-server.md`), for claims this slice makes false, such as "never writes `~/.claude.json`" (`mod.rs`, `vendor.rs`, `docs/release-notes/0.7.0.md` is history and stays). Fix the live ones in a `docs:` commit of their own, or a `fix:` one where a source string moves.
- [ ] **Step 3:** `stage-gate --dev` over this plan's own commits, listed by SHA (each checked with `git cat-file -t`), not over a computed range.

---

## Human gates, and where they sit

| Gate | Where |
|---|---|
| Live check of `/mcp disable`: the key Claude's own UI writes, read with `jq` | Task 1 Step 1, before any code |
| Live check, Claude Code: write, `mcp list`, Undo, and a running session's rewrite | Task 4 Step 6 |
| Live check, Codex, in a trusted untracked project | Task 5 Step 7 (starts only after Task 4's is accepted) |
| Live check, Gemini CLI, in a trusted untracked project | Task 6 Step 6 (after Task 5's) |
| Naming brief for "Off in this repo" and the five new reasons, `/humanizer`, Karthik's sign-off | Task 7 Steps 1–3 |
| The repository-view row action in the combined card layout round (owned by P7) | Task 9 Step 0 |
| Screenshot of the row action, accepted by Karthik | Task 9 Step 6 |
| `stage-gate --dev` before push | Task 10 Step 3 |

Every live check is verified by its artefact (the `jq` line, `mcp list` output, the project file, `git status`, the receipt name, per-kind counts), never by an answer. T23 doesn't apply: nothing here renders model output.

## Known limits

- **A `.mcp.json` server Claude hasn't been asked about** (in neither approval list) reads `On`. Whether Claude loads it before approval is unmeasured.
- **Per-project timing is not observed.** A project context's `applies` stays `None` until a run times the three per-project writes (P6 runs only the machine mechanisms).
- **A key-level write keeps a whole copy of `~/.claude.json`** in the backups folder (P4's choice, for Undo safety). That file holds user-scope servers' `env` values and account data; the copies are never restored (Q9) and age out under P4's 30-day floor.
- **Codex and Gemini trust are read, never written** (rule 4), and Gemini's enforcement depends on its own folder-trust setting being on.
