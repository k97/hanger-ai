# Slice 5: `gh skill`, an honest skill budget, Claude plugins — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install, update, search and preview skills through `gh skill` into the one folder Hanger can switch (5a), give the overview card a skill figure that leaves out what Claude Code leaves out (5b), and run Claude Code's plugin and marketplace life cycle through `claude plugin`, with hooks and cache read-only (5c).

**Architecture:** One new Rust module, `vendor_cli`, drives two vendor programs by argv through the existing `engine_status::run::run_capture` and parses their `--json`. Every write it makes records a receipt through P4's command-receipt interface, and its Undo runs the receipt's reverse. A second new module, `skill_budget`, reads three keys around `scanner::parse_skill_frontmatter` and sums Claude Code's listing for the skills that reach it. `skill_switch` (this plan owns it) gains one function, `install_slot`, which says where an install may land; its three consumed signatures stay unchanged.

**Tech Stack:** Rust (tokio, serde, serde_json, serde_yaml, rusqlite), Tauri 2 commands, React 19 + TypeScript, Vitest.

**Spec:** `docs/plans/2026-11-28-harness-design.md` (§4.5, §5, §7, and the round 43 Answers at its end, which are binding). Research: `docs/plans/research/2026-11-28-slice5-skills-plugins.md`.

## Global Constraints

- Q7: `gh skill install` always runs with `--agent universal --scope user`, so the skill lands in `~/.agents/skills`. No other `--agent` value is ever passed. So no `gh --agent` → engine map is built, and design §5's `brand-coverage.test.ts` floor for "slice 5's `gh --agent` map" doesn't apply.
- Q6: every vendor-CLI write records a receipt holding its reverse, Recent changes shows it, and Undo runs the reverse. "Never runs an update" covers the engine CLIs only, so skills and plugins update when a person clicks.
- Q10: a model may not ask to install or update a skill or plugin. Nothing under `src-tauri/src/mcp_server/` may reach `vendor_cli`. Task 5 adds a guard for this.
- Q2: writes go to user scope. Hanger passes `--scope user` on every `claude plugin` write and every `marketplace` write. It never writes project or local scope.
- No secret crosses IPC. Hanger never passes `--config` or calls `claude plugin configure`. A plugin that needs configuration is flagged by `hasUserConfig` alone. Hanger never reads a credential file: `gh` reads its own token. Replies are typed structs, so a field the CLI adds later is dropped at parse.
- Hanger never accepts a marketplace-declared command: no `-y`, no `--accept-command`. An install that needs one fails with `cli_refused`, and the copy points the person to Claude Code.
- Uninstall always passes `--keep-data` and never `--prune`, so the Undo (reinstall) gets the plugin's data back.
- Every free value that reaches argv (repo, skill, query, plugin id, marketplace source or name) is validated before anything is spawned. None may start with `-`.
- Failures cross IPC as codes only. `run_capture` discards stderr, and stdout is parsed, never forwarded, except for `gh skill preview`, whose stdout is the skill's public text.
- The store schema doesn't move (`STORE_VERSION = 8`). No piece of this plan needs a migration. If one turns out to, stop and ask.
- Counts come from the backend: every list reply carries its own `count`. Styling is tokens only, type comes from `typeRoles.ts`, and nothing uses blocking dialogs (`invariants.md`).
- Every new label goes through the batched naming brief (Task 6), and every string gets a `/humanizer` pass.
- Commit steps use explicit paths, run in their own Bash call, and contain no `-n` anywhere. New files are `git add`ed first. Don't touch a peer's uncommitted `src/App.tsx` hunks. Stage those by hunk (`shared-checkout.md`).
- Each new Tauri command gets a `docs/ipc.md` entry, numbered from 25, and the README figures are regenerated with `~/.bun/bin/bun run src/__tests__/readmeCounts.ts` in the same commit.

## Review Focus

1. **`gh` missing, too old for `skill`, or signed out.** A person opening the skill surface should see which of the three it is, never a blank list or a raw failure. Pinned in Task 2 (`gh_status_*` tests).
2. **A name already in the store or in Hanger's keep.** Install must refuse before `gh` runs. Otherwise a later switch-on fails with `already_there`, or `gh` overwrites a switched-off skill's place. Pinned in Task 1 (`install_slot_*`) and Task 3 (`install_refuses_a_taken_name_without_spawning`).
3. **A typed value that starts with `-` or carries odd characters** (search box, repo, plugin id, marketplace source). It must be refused with `refused_value`, and the fake program must record that it never ran. Pinned in Tasks 2, 3 and 15.
4. **`disable-model-invocation` written as a string, a list or a number.** The skill must still parse (same `parse_status`, same counts). Only a YAML `true` takes it out of the figure. Pinned in Task 11.
5. **One skill reached through two paths** (`~/.claude/skills` linked to `~/.agents/skills`). The budget must count it once. Pinned in Task 12.

---

## File Structure

| File | Responsibility |
|---|---|
| `src-tauri/src/skill_switch/ops.rs` (modify) | `install_slot`: may an install land at `<store>/<name>`? |
| `src-tauri/src/vendor_cli/mod.rs` (create) | `Cli`, `VendorFailure`, `run`, `safe_arg`, `undo` (reverse dispatch) |
| `src-tauri/src/vendor_cli/gh_skill.rs` (create) | `gh skill` status, list, search, preview, install, update; JSON parsers |
| `src-tauri/src/vendor_cli/claude_plugin.rs` (create) | `claude plugin` list, marketplaces, hooks and cache paths, writes |
| `src-tauri/src/skill_budget.rs` (create) | Claude Code listing bytes per skill; the per-engine sum |
| `src-tauri/src/scanner.rs` (modify) | Two lenient fields on `SkillFrontmatter` |
| `src-tauri/src/lib.rs` (modify) | `pub mod`s and 11 thin commands |
| `src-tauri/tests/{skill_switch,gh_skill,claude_plugin,skill_budget,vendor_cli_boundary}_tests.rs` | Tests. Every program is a `#!/bin/sh` fake, as in `engine_status_tests.rs` |
| `src-tauri/tests/fixtures/vendor_cli/` (create) | Producer output captured from the real CLIs |
| `src/types/vendorCli.ts`, `src/hooks/useGhSkills.ts`, `src/hooks/useClaudePlugins.ts`, components chosen by the layout rounds (create) | Webview side |
| `docs/ipc.md`, `README.md` (modify) | Entries 25 to 35, and regenerated figures |

## Cross-plan interfaces

| Assumed | Type or name | Owner | Used in |
|---|---|---|---|
| Command receipt type | `CommandReceipt { id: String, at_ms: i64, what: String, program: ReverseProgram, reverse_args: Vec<String> }`, where `ReverseProgram` is `Gh \| Claude \| SkillSwitch` and `reverse_args` is empty when there's no reverse | **P4 (4a)**, `mcp::switch::apply` | Tasks 4, 15 |
| Record one | `apply::record_command(dir: &Path, receipt: &CommandReceipt) -> Result<(), ApplyError>`, 0600, written before the reply | **P4** | Tasks 4, 15 |
| Load one | `apply::load_command(dir: &Path, id: &str) -> Option<CommandReceipt>` | **P4** | Task 4 (`undo`) |
| Where they live | `apply::command_receipts_dir(data_dir: &Path) -> PathBuf` | **P4** | Tasks 5, 15 |
| Recent changes rows and their Undo | Recent changes lists command receipts. Its Undo for one calls this plan's `undo_vendor_change` command (Task 5). | **P4** | Task 5 |
| Finding `claude` | An `ENGINE_CLIS` entry for engine id `"claude-code"` that names its binary. Hanger resolves it with the existing `engine_status::resolve::{search_path, resolve_in}`. | **P7 (T19)** | Task 14 |
| `run_capture` | `engine_status::run::run_capture(program, args, stdin, envs, timeout) -> Option<Captured>`, frozen as on `main` | **P7** | Tasks 2–4, 14–15 |
| Overview card Skills row | The card's `Skills` kind row, which reads `"Not measured"` today, after the combined layout round | **T19** | Task 13 |
| `EngineContext` | Not widened. The budget is a sibling reply, `get_skill_budgets`. | **P2** | Task 12 |
| `Ask` | Gets no install, update or plugin variant (Q10) | **P1** | Task 5 guard |

If P4 or P7 lands a different name or shape, map to it in the waiting task and tell the owner on `SendMessage`. Don't define the type here.

Provided by this plan: `skill_switch::ops::install_slot` (Task 1); `set_enabled_for`, `undo_for` and `switch_info_for`, unchanged and pinned (Task 1); and `vendor_cli::undo(receipt: &CommandReceipt, ctx: &UndoContext) -> Result<UndoReply, VendorFailure>`, which P4's Recent changes reaches through `undo_vendor_change`.

**Two contradictions with Q6, put to Karthik in Task 6:**

- `gh skill` (2.102.0) has no uninstall subcommand. Its subcommands are `install`, `list`, `preview`, `publish`, `search` and `update`. This plan makes the reverse of an install a skill switch-off into Hanger's keep (`ReverseProgram::SkillSwitch`, args `["skill:<name>"]`). That switch-off is itself undoable.
- `claude plugin update` (2.1.332) has no documented way back to the previous version. This plan records the receipt with empty `reverse_args`, so Undo isn't offered, unless Karthik rules that update ships only with an Undo, in which case Task 15 leaves update out.

---

### Task 1: The `skill_switch` interface (owner, lands first)

**Files:**
- Modify: `src-tauri/src/skill_switch/ops.rs`
- Test: `src-tauri/tests/skill_switch_tests.rs`

**Interfaces:**
- Produces: `pub fn install_slot(places: &SkillPlaces, name: &str) -> Result<PathBuf, SkillSwitchFailure>`, which returns `<places.store>/<name>`. Errors: `NameRefused` when `is_store_name` fails or the name starts with `-`; `AlreadyThere` when anything exists at `<store>/<name>` (`symlink_metadata`), or when `keep::list(&places.keep)` holds a receipt with that name. Reads only.
- Pinned unchanged: `set_enabled_for(&SkillPlaces, &[PathBuf], &str, bool) -> Result<SkillSwitchReply, SkillSwitchFailure>`, `undo_for(&SkillPlaces, &[PathBuf], &str) -> Result<SkillSwitchReply, SkillSwitchFailure>`, `switch_info_for(&SkillPlaces, &Path) -> Option<SkillSwitchInfo>`.

- [ ] **Step 1: Capture the per-kind baseline from the real store, read-only**

Run: `sqlite3 -readonly "$HOME/Library/Application Support/com.rkarthik.hanger/hanger.db" "select category, scope, count(*) from assets group by category, scope order by category, scope;"` and save the output, with the time it ran, to `docs/evidence/2026-11-28-slice5/counts-before.txt`. That folder is gitignored, so quote the output in the task report too. Re-capture it immediately before this task's commit if a peer's scan has run since.

- [ ] **Step 2: Write the failing tests**

Add these to `skill_switch_tests.rs`, using its temp-folder `SkillPlaces`:
- `install_slot_answers_the_store_path_for_a_free_name`: empty store, `install_slot(&p, "pdf")` gives `Ok(p.store.join("pdf"))`.
- `install_slot_refuses_a_name_in_the_store`: create `<store>/pdf/`, expect `Err(SkillSwitchFailure::AlreadyThere)`.
- `install_slot_refuses_a_name_hanger_is_keeping`: switch `pdf` off with `set_enabled_for(.., "skill:pdf", false)`, expect `Err(AlreadyThere)` although `<store>/pdf` is gone.
- `install_slot_refuses_bad_names`: for each of `""`, `"a/b"`, `".hidden"`, `".."`, `"-x"`, expect `Err(NameRefused)`.
- `the_three_consumed_signatures_are_pinned`: `let _: fn(&SkillPlaces, &[PathBuf], &str, bool) -> Result<SkillSwitchReply, SkillSwitchFailure> = set_enabled_for;` and the same for `undo_for` and `switch_info_for`.

- [ ] **Step 3: Run them to verify they fail**

Run: `cd src-tauri && cargo test --test skill_switch_tests install_slot`
Expected: compile error `cannot find function \`install_slot\``.

- [ ] **Step 4: Implement `install_slot` in `ops.rs`**

Its doc comment says, as intent: "Nothing calls this yet; `vendor_cli::gh_skill::install` lands in this plan's Task 3."

- [ ] **Step 5: Run them to verify they pass, then prove the pin**

Run: `cd src-tauri && cargo test --test skill_switch_tests`. Expected: all pass.

Then, in a detached worktree (`git worktree add --detach /tmp/verify-pin HEAD`), add a parameter to `undo_for` and run the same command. Expected: a compile error in `the_three_consumed_signatures_are_pinned`. Remove the worktree afterwards.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(skill-switch): install_slot says where an install may land" -- src-tauri/src/skill_switch/ops.rs src-tauri/tests/skill_switch_tests.rs
```

---

### Task 2: `vendor_cli` core and the `gh skill` read side

**Files:**
- Create: `src-tauri/src/vendor_cli/mod.rs`, `src-tauri/src/vendor_cli/gh_skill.rs`, `src-tauri/tests/gh_skill_tests.rs`, `src-tauri/tests/fixtures/vendor_cli/gh/*`
- Modify: `src-tauri/src/lib.rs` (`pub mod vendor_cli;`)

**Interfaces:**
- Produces (`mod.rs`):
  - `pub struct Cli { pub program: Option<PathBuf>, pub path_env: String }`
  - `#[serde(rename_all = "snake_case")] pub enum VendorFailure { NotInstalled, RefusedValue, NotRun, CliRefused, Unparseable, AlreadyThere, NotUndoable, NotUserScope, MarketplaceInUse }`, with `code() -> &'static str`
  - `pub fn safe_arg(value: &str) -> bool`: non-empty, at most 200 chars, no leading `-`, no control characters
  - `pub(crate) async fn run(cli: &Cli, args: &[&str], timeout: Duration) -> Result<String, VendorFailure>`. It calls `run_capture` with envs `PATH=<path_env>`, `GH_PROMPT_DISABLED=1`, `NO_COLOR=1`. `None` maps to `NotRun`, `ok: false` to `CliRefused`, and no program to `NotInstalled`. One `tokio::sync::Mutex` serialises writes; reads don't take it.
- Produces (`gh_skill.rs`):
  - `#[serde(rename_all = "snake_case")] pub enum GhStatus { Ready, NotInstalled, NoSkillCommand, NotSignedIn }`
  - `pub async fn status(gh: &Cli) -> GhStatus`. No program gives `NotInstalled`. `gh skill --help` with `ok: false` gives `NoSkillCommand`. `gh auth status` with `ok: false` gives `NotSignedIn`; only its exit status is read, never its output.
  - `pub struct GhSkill { name, path, source_url: Option<String>, version: Option<String>, pinned: bool, switch: Option<SkillSwitchInfo> }` and `pub struct GhSkills { status: GhStatus, skills: Vec<GhSkill>, count: usize }`
  - `pub async fn list(gh: &Cli, places: &SkillPlaces) -> GhSkills`, from `gh skill list --json skillName,sourceURL,scope,version,pinned,path,agentHosts`. Only `scope == "user"` rows are kept. `switch` is `switch_info_for(places, path)`.
  - `pub struct GhSearchHit { name, repo, description, stars: u64 }` and `pub struct GhSearch { hits, count }`; `pub async fn search(gh: &Cli, query: &str) -> Result<GhSearch, VendorFailure>`, from `gh skill search --json skillName,repo,description,stars <query>`
  - `pub async fn preview(gh: &Cli, repo: &str, skill: &str) -> Result<String, VendorFailure>`, the stdout of `gh skill preview <repo> <skill>`, unparsed
  - `pub fn valid_repo(s: &str) -> bool`: `owner/name` with each part in `[A-Za-z0-9_.-]`, at most 100 chars each, no leading `-`
  - Timeouts: 30 s for status, list, search and preview.

- [ ] **Step 1: Capture producer fixtures with a throwaway HOME**

Run with `T=$(mktemp -d)` and `env -i HOME=$T PATH=/opt/homebrew/bin:/usr/bin:/bin`:
- `gh skill --help`
- `gh skill install --from-local <a temp skill dir> --agent universal --scope user`
- `gh skill list --json skillName,sourceURL,scope,version,pinned,path,agentHosts`

Save each one's stdout to `fixtures/vendor_cli/gh/`, then `rm -rf $T`. Search needs a signed-in `gh`: unauthenticated it answers `HTTP 401: Requires authentication` (seen 2026-11-28).

- [ ] **Step 2: STOP for Karthik. He captures the search fixture.**

He runs `gh skill search --json skillName,repo,description,stars pdf > src-tauri/tests/fixtures/vendor_cli/gh/search.json` in his own terminal. This session never runs `gh` against his real HOME. **The artefact is the file**, not his reply: check it exists and parses as a JSON array before continuing. If a field name differs from the ones above, use the fixture's.

- [ ] **Step 3: Write the failing tests**

In `gh_skill_tests.rs`, using `#!/bin/sh` fakes that `cat` the fixtures and append their argv to an `args.log`:
- `gh_status_is_not_installed_without_a_program`
- `gh_status_is_no_skill_command_when_help_refuses` (fake exits 1 on `skill --help`)
- `gh_status_is_not_signed_in_when_auth_status_refuses`
- `gh_status_is_ready`
- `list_parses_the_captured_fixture`: `count` equals the fixture's user-scope row count, and the first row's `name`, `path` and `pinned` match the fixture
- `list_drops_project_scope_rows`
- `search_parses_the_captured_fixture` (`count == hits.len()`, first `repo` as in the fixture)
- `search_refuses_a_leading_dash_without_spawning`: `search(&gh, "-x")` gives `Err(RefusedValue)`, and `args.log` doesn't exist
- `valid_repo_cases`: `owner/repo` true; `owner`, `a/b/c`, `-o/r`, `o/r;x` and `""` false
- `a_program_that_hangs_is_not_run`: a fake `sleep 60` with a 1 s test timeout gives `NotRun`. The timeout is a parameter of a `#[doc(hidden)] _with` variant, as `skill_switch` does with its seams.

- [ ] **Step 4: Run them to verify they fail**

Run: `cd src-tauri && cargo test --test gh_skill_tests`
Expected: compile error `unresolved import \`tauri_app_lib::vendor_cli\``.

- [ ] **Step 5: Implement `mod.rs` and the read side of `gh_skill.rs`**

Each module doc names the rule: argv only, codes only, and no logging of arguments or output.

- [ ] **Step 6: Run them to verify they pass**

Run: `cd src-tauri && cargo test --test gh_skill_tests`. Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/vendor_cli src-tauri/tests/gh_skill_tests.rs src-tauri/tests/fixtures/vendor_cli/gh
git commit -m "feat(vendor-cli): read gh skill status, list, search and preview by argv" -- src-tauri/src/vendor_cli src-tauri/src/lib.rs src-tauri/tests/gh_skill_tests.rs src-tauri/tests/fixtures/vendor_cli/gh
```

---

### Task 3: `gh skill` install and update (no receipts yet)

**Files:**
- Modify: `src-tauri/src/vendor_cli/gh_skill.rs`, the `skill_switch/ops.rs` module doc (now present tense: `install_slot`'s caller is `gh_skill::install`)
- Test: `src-tauri/tests/gh_skill_tests.rs`

**Interfaces:**
- Consumes: `install_slot` (Task 1), `switch_info_for`, `skill_switch::tree::fingerprint`.
- Produces:
  - `pub struct GhInstalled { name, path, read_only: Option<SkillReadOnly>, receipt_id: Option<String> }`
  - `pub async fn install(gh: &Cli, places: &SkillPlaces, repo: &str, skill: &str) -> Result<GhInstalled, VendorFailure>`. It checks `valid_repo`, `safe_arg(skill)` and `install_slot(places, skill)` (a failure maps to `AlreadyThere` or `RefusedValue`), then runs `["skill","install",repo,skill,"--agent","universal","--scope","user"]` with a 180 s timeout. Afterwards `<store>/<skill>` must exist, or the answer is `Unparseable`. `read_only` comes from `switch_info_for`, so an install that lands read-only says so.
  - `pub struct GhUpdated { name, changed: bool, previous_version: Option<String>, receipt_id: Option<String> }`
  - `pub async fn update(gh: &Cli, places: &SkillPlaces, name: &str) -> Result<GhUpdated, VendorFailure>`. It reads `list` first: a name not listed, or `pinned`, or without `source_url`, gives `NotUndoable`. It takes `fingerprint` of the folder before and after `["skill","update",name]` (180 s), and `changed` is whether they differ.

- [ ] **Step 1: Write the failing tests**

The fakes create the folder the real `gh` would and write a `metadata` frontmatter.
- `install_runs_the_exact_argv`: `args.log` equals `skill install owner/repo pdf --agent universal --scope user`
- `install_lands_switchable`: `read_only == None` and `path == store/pdf`
- `install_refuses_a_taken_name_without_spawning`: with `<store>/pdf` present, `Err(AlreadyThere)` and no `args.log`
- `install_refuses_a_dash_skill_without_spawning`: `skill = "--all"` gives `Err(RefusedValue)`
- `install_that_writes_nothing_is_unparseable`: the fake exits 0 and creates nothing
- `update_reports_changed_when_the_tree_moves` / `update_reports_unchanged_when_it_does_not`
- `update_refuses_a_pinned_skill` (fixture row with `pinned: true`)

- [ ] **Step 2: Run them to verify they fail**

Run: `cd src-tauri && cargo test --test gh_skill_tests install_ update_`
Expected: compile errors, `cannot find function \`install\`` and `cannot find function \`update\``.

- [ ] **Step 3: Implement `install` and `update`**

Both take the module's write mutex.

- [ ] **Step 4: Run them to verify they pass**

Run: `cd src-tauri && cargo test --test gh_skill_tests`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(vendor-cli): install and update a skill through gh into the global store" -- src-tauri/src/vendor_cli/gh_skill.rs src-tauri/src/skill_switch/ops.rs src-tauri/tests/gh_skill_tests.rs
```

---

### Task 4: Receipts and Undo for `gh skill` writes. **Waits on P4's `CommandReceipt` landing.**

**Files:**
- Modify: `src-tauri/src/vendor_cli/mod.rs`, `src-tauri/src/vendor_cli/gh_skill.rs`
- Test: `src-tauri/tests/gh_skill_tests.rs`

**Interfaces:**
- Consumes: P4's `CommandReceipt`, `record_command` and `load_command` (Cross-plan interfaces).
- Produces:
  - `install` and `update` gain a `receipts: &Path` parameter. After a successful write, each records a receipt before it replies and puts its id in `receipt_id`.
    - Install: `what = "gh skill · install · <name>"`, `program = SkillSwitch`, `reverse_args = ["skill:<name>"]`, but only when `read_only == None`. Otherwise `reverse_args` is empty.
    - Update with `changed`: `what = "gh skill · update · <name>"`, `program = Gh`, `reverse_args = ["skill","install",<repo from source_url>,"<name>@<previous_version>","--agent","universal","--scope","user","--force"]`. With no `previous_version`, `reverse_args` is empty. An update that changed nothing records no receipt.
  - `pub struct UndoContext { gh: Cli, claude: Cli, places: SkillPlaces, projects: Vec<PathBuf>, receipts: PathBuf }`, `pub struct UndoReply { receipt_id: Option<String> }`, and `pub async fn undo(receipt: &CommandReceipt, ctx: &UndoContext) -> Result<UndoReply, VendorFailure>`. Empty `reverse_args` gives `NotUndoable`. `SkillSwitch` calls `skill_switch::ops::set_enabled_for(.., key, false)`, and the skill keep's own receipt is the Undo's receipt. `Gh` and `Claude` run `reverse_args` (each arg re-checked with `safe_arg`, apart from the `--` flags Hanger itself wrote) and record a receipt for the reverse whose own reverse is the original write.

- [ ] **Step 1: Write the failing tests**
- `install_records_a_skill_switch_receipt`: `load_command(dir, id)` has `program == SkillSwitch` and `reverse_args == ["skill:pdf"]`
- `undo_of_an_install_keeps_the_skill`: after `undo`, `<store>/pdf` is gone and `kept_for(&p).count == 1`
- `update_records_the_reinstall_at_the_previous_version`: `reverse_args[3] == "pdf@<fixture version>"`
- `an_unchanged_update_records_nothing`: `receipt_id == None`
- `undo_with_no_reverse_is_not_undoable`

- [ ] **Step 2: Run them to verify they fail**

Run: `cd src-tauri && cargo test --test gh_skill_tests receipt undo`
Expected: compile error for the missing `receipts` parameter and the missing `undo`.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run them to verify they pass**

Run: `cd src-tauri && cargo test --test gh_skill_tests`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(vendor-cli): every gh skill write keeps a receipt with its reverse" -- src-tauri/src/vendor_cli/mod.rs src-tauri/src/vendor_cli/gh_skill.rs src-tauri/tests/gh_skill_tests.rs
```

---

### Task 5: The 5a commands, and the Q10 boundary guard

**Files:**
- Modify: `src-tauri/src/lib.rs`, `docs/ipc.md`, `README.md`
- Create: `src-tauri/tests/vendor_cli_boundary_tests.rs`

**Interfaces:**
- Produces these Tauri commands, each `(async)` and a thin wrapper. `Err` is a `VendorFailure::code()`.
  - `get_gh_skills() -> GhSkills`
  - `search_gh_skills(query: String) -> GhSearch`
  - `preview_gh_skill(repo: String, skill: String) -> String`
  - `install_gh_skill(repo: String, skill: String) -> GhInstalled`
  - `update_gh_skill(name: String) -> GhUpdated`
  - `undo_vendor_change(receipt_id: String) -> UndoReply`

  `gh` is found by `engine_status::resolve::resolve_in("gh", &search_path().await)`. Places come from the existing `skill_places` and `skill_switch_projects`.

- [ ] **Step 1: Write the failing guard test**

`no_mcp_server_file_reaches_vendor_cli` reads every `.rs` under `src-tauri/src/mcp_server/` and asserts that none contains `vendor_cli`. It also asserts the set it read is non-empty, so the loop can't pass over nothing. A second test, `the_guard_reads_real_files`, asserts that `src-tauri/src/mcp_server/tools.rs` is among the files read.

- [ ] **Step 2: Prove the guard fires**

In a detached worktree, add `use crate::vendor_cli;` to `mcp_server/tools.rs` and run `cd src-tauri && cargo test --test vendor_cli_boundary_tests`. Expected: FAIL naming `tools.rs`. Remove the worktree. Committing the test before the commands is the red half; this planted failure is what makes it a control.

- [ ] **Step 3: Add the six commands to `lib.rs` and `generate_handler!`, add `docs/ipc.md` entries 25–30, and regenerate the README figures**

- [ ] **Step 4: Verify**

Run: `cd src-tauri && cargo test --test vendor_cli_boundary_tests` (expected: pass), then `npx vitest run src/__tests__/readme-sync.test.ts` from the repo root (expected: pass).

- [ ] **Step 5: Commit the guard first, in its own call, then the commands in a second call**

```bash
git add src-tauri/tests/vendor_cli_boundary_tests.rs
git commit -m "test(vendor-cli): no MCP server file reaches vendor_cli (Q10)" -- src-tauri/tests/vendor_cli_boundary_tests.rs
```
```bash
git commit -m "feat(skills): commands to list, search, preview, install, update and undo gh skills" -- src-tauri/src/lib.rs docs/ipc.md README.md
```

---

### Task 6: STOP for Karthik. The naming brief (one batched round with every track).

- [ ] **Step 1: Write the brief.** For each label, it gives the research (what `gh`, Claude Code's `/plugin` UI, VS Code's Extensions view and Raycast call it), two or three candidates and a recommendation. Labels covered:
  - Plugins, and Marketplaces
  - Install, Update, Uninstall
  - Turn on and off for a plugin, against Enable and Disable
  - Add and Remove a marketplace
  - The skill search field and its empty and pending states
  - Preview
  - The four `GhStatus` states
  - Every `VendorFailure` code's line
  - "Needs setup in Claude Code" for `hasUserConfig`
  - The Skills row's figure on the card, and the "Not measured" line for the other engines
  - The read-only note for an install that landed read-only
- [ ] **Step 2: Put both Q6 contradictions in the same round** (Cross-plan interfaces): install's reverse being a switch-off, and plugin update having no Undo.
- [ ] **Step 3: Send it through Plannotator** (`annotate --gate`) and stop. **The artefact is his annotated answer file.** Record the rulings in this plan's Task 6 before Task 8 starts. Every final string then gets a `/humanizer` pass.

### Task 7: STOP for Karthik. Layout options for the skill surface.

- [ ] **Step 1:** Render two or three options at true width in real tokens: where search, results, preview and Install sit (a Global tab, a palette mode, or a panel), and where Update and the install Undo sit on a store skill's inspector. Put them in `docs/design-ref-prototypes/`.
- [ ] **Step 2:** Stop. His pick, recorded in the plan, is the artefact. Expect a hybrid.

### Task 8: The 5a webview

**Files:**
- Create: `src/types/vendorCli.ts` (mirrors Task 2–4 replies, narrowed to what the producer emits), `src/hooks/useGhSkills.ts`, and the components Task 7 chose
- Modify: `src/components/DesignSystemPane.tsx` (a specimen for each new component), the copy map Task 6 ruled
- Test: `src/hooks/useGhSkills.test.ts`, and one `.test.tsx` per component

**Interfaces:**
- Consumes: Task 5's commands and `start_scan`.
- Produces: `useGhSkills()` returning `{ status, skills, count, search(q), preview(repo, skill), install(repo, skill), update(name), undo(receiptId) }`. After every successful write it calls `start_scan` once.

- [ ] **Step 1: Write the failing tests** (Vitest, `invoke` mocked from fixtures copied out of Task 2's producer output):
  - Each `GhStatus` renders its own ruled line.
  - Search renders `count` from the reply, never `.length`.
  - Install calls `install_gh_skill` and then `start_scan`.
  - A reply with `read_only` set renders the read-only note.
  - Undo calls `undo_vendor_change` with the reply's `receipt_id`.
  - A pinned skill shows no Update.
  - A failure renders the code's ruled line and no raw text.
- [ ] **Step 2:** Run `npx vitest run src/hooks/useGhSkills.test.ts src/components/<new>.test.tsx`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement. Tokens only, type roles, no `window.confirm`.
- [ ] **Step 4:** Run the same command (expected: pass), then `npx vitest run src/__tests__/design-system-coverage.test.ts src/__tests__/no-frontend-counting.test.ts src/__tests__/no-off-token-styles.test.ts src/__tests__/type-roles.test.ts` (expected: pass), then `bunx tsc --noEmit` (expected: exit 0).
- [ ] **Step 5: Screenshot.** Per `verifying-ui.md`: filter by the dev pid, take the window that is at least 900×600, assert the title `Hanger AI (dev)`, name the theme read from the store, and save frames of every status state to `docs/evidence/2026-11-28-slice5/`. Fake states come from a throwaway-`HOME` dev run, never a mocked web build.
- [ ] **Step 6: Commit** the new files and the changed paths. `App.tsx`, if it's touched at all, is staged by hunk.

### Task 9: STOP for Karthik. One real `gh skill install`, verified by artefact.

- [ ] **Step 1:** Re-capture the per-kind counts, then run the branch's dev app through one scan. Read `last_scan_completed_ms` from the store before starting, since a live proof reads what older builds wrote.
- [ ] **Step 2:** With his go-ahead, he searches, previews and installs one public skill in the dev app. **Artefacts:**
  - `ls -la ~/.agents/skills/<name>`
  - `head -30 ~/.agents/skills/<name>/SKILL.md`, showing `gh`'s source and tree SHA metadata
  - P4's receipt file
  - `sqlite3 -readonly … "select category, scope, count(*) …"` showing `skill|global` up by 1
  - A screenshot of the inspector
- [ ] **Step 3:** He clicks Undo. **Artefacts:** `<data>/kept/skills/<id>/<name>` exists, `~/.agents/skills/<name>` is gone, and `skill|global` is back to the baseline.
- [ ] **Step 4:** If that skill's repo has a newer tree, he runs Update and then its Undo. The artefacts are the frontmatter SHA before, after and after-Undo, and `pinned` unchanged. If there's nothing to update, record that the update's Undo is proven at fixture level only, and report the gap. An answer of "done" without these files isn't the result.

### Task 10: STOP for Karthik. H1, the live session check.

The budget's rules come from the docs (code.claude.com/docs/en/skills, read 2026-11-28). This check runs before any 5b code.

- [ ] **Step 1:** In a throwaway folder `H=$(mktemp -d)`, write `$H/.claude/skills/<n>/SKILL.md` for six skills:
  - `h1-alpha`: description `H1PROBE-ALPHA`
  - `h1-bravo`: `disable-model-invocation: true`, description `H1PROBE-BRAVO`
  - `h1-charlie`: description `H1PROBE-CHARLIE`
  - `h1-delta`: description `H1PROBE-DELTA`
  - `h1-echo`: description `H1PROBE-ECHO-START` + 2,000 × `x` + `H1PROBE-ECHO-END`, and `when_to_use: H1PROBE-ECHO-WHEN`
  - `h1-foxtrot`: `disable-model-invocation: "true"` (a string), description `H1PROBE-FOXTROT`

  Also write `$H/.claude/settings.json` holding `{"skillOverrides": {"h1-charlie": "name-only", "h1-delta": "off"}}`.
- [ ] **Step 2:** With his go-ahead, he runs `claude -p "Reply with the word ok."` in `$H`.
- [ ] **Step 3: The artefact is the session transcript.** Run `grep -o 'H1PROBE-[A-Z-]*\|h1-[a-z]*' <newest ~/.claude/projects/<mangled $H>/*.jsonl> | sort | uniq -c`, plus the character length of the listed `h1-echo` text. Expected per the docs:
  - ALPHA present
  - BRAVO absent
  - `h1-charlie` present, CHARLIE absent
  - DELTA and `h1-delta` absent
  - ECHO-START present, ECHO-END absent, and the listed text at most 1,536 characters
  - ECHO-WHEN present or absent, which settles whether `when_to_use` is joined and capped with the description
  - FOXTROT present or absent, which settles whether a string `"true"` counts

  Also record whether `skillOverrides` is keyed by the frontmatter `name` or the folder name. Make the folder of one skill differ from its `name` to tell them apart.
- [ ] **Step 4:** If the transcript doesn't carry the listing, repeat with `--debug` and read its log. If neither carries it, stop and report: no model answer substitutes. Record the results in this task. **Any result that differs from the docs changes Task 11's expected values before Task 11 starts.**
- Limit, stated: H1 tests project-level settings, while Hanger reads `~/.claude/settings.json`. The key's shape is assumed to be the same at both levels.

### Task 11: The listing rules, as a pure function

**Files:**
- Modify: `src-tauri/src/scanner.rs` (`SkillFrontmatter`)
- Create: `src-tauri/src/skill_budget.rs`, `src-tauri/tests/skill_budget_tests.rs`
- Modify: `src-tauri/src/lib.rs` (`pub mod skill_budget;`)

**Interfaces:**
- `SkillFrontmatter` gains `#[serde(alias = "disable-model-invocation")] disable_model_invocation: Option<serde_yaml::Value>` and `when_to_use: Option<serde_yaml::Value>`. Both are `Value` for the reason the struct's own comments give: a strict type would turn a parseable skill into a failure.
- `#[derive(Deserialize)] #[serde(rename_all = "kebab-case")] pub enum SkillOverride { On, NameOnly, UserInvocableOnly, Off }`
- `pub fn parse_skill_overrides(settings_json: &str) -> Result<HashMap<String, SkillOverride>, ()>`. The `skillOverrides` object; an unknown value is left out, meaning `On`. Unparseable JSON is `Err`.
- `pub fn listing_bytes(skill_md: &str, overrides: &HashMap<String, SkillOverride>) -> Option<u64>`. `None` when the frontmatter doesn't parse. `0` for a YAML `true` `disable-model-invocation`, and for `UserInvocableOnly` or `Off`. `name.len()` for `NameOnly`. Otherwise `name.len()` plus the UTF-8 bytes of the first 1,536 **characters** of the description (joined with `when_to_use` as H1 found).

- [ ] **Step 1: Write the failing tests** (values per the docs; amend them first to whatever H1 recorded):
  - `plain_skill_is_name_plus_description`: name `a`, description `bcd` gives `Some(4)`
  - `description_is_capped_at_1536_chars`: name `a`, 2,000 × `x` gives `Some(1537)`
  - `the_cap_counts_characters_not_bytes`: name `a`, 1,600 × `é` gives `Some(1 + 3072)`
  - `disable_model_invocation_true_is_zero`
  - `disable_model_invocation_as_a_string_still_parses_and_counts`: `"true"` gives `Some(4)` (or `Some(0)` if H1 found a string honoured)
  - `name_only_override_is_the_name`, `off_and_user_invocable_only_are_zero`
  - `bad_settings_json_is_err`
  - `a_list_valued_flag_does_not_fail_the_scan`: run `scanner_tests.rs`'s existing scan helper over a store holding one skill with `disable-model-invocation: [1]`, and assert its `parse_status` is `"ok"`
- [ ] **Step 2:** Run `cd src-tauri && cargo test --test skill_budget_tests`. Expected: `unresolved import \`tauri_app_lib::skill_budget\``.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `cd src-tauri && cargo test --test skill_budget_tests` (expected: pass), then `cd src-tauri && cargo test --test scanner_tests` (expected: pass).
- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/skill_budget.rs src-tauri/tests/skill_budget_tests.rs
git commit -m "feat(budget): Claude Code's listing rules for one skill" -- src-tauri/src/skill_budget.rs src-tauri/src/scanner.rs src-tauri/src/lib.rs src-tauri/tests/skill_budget_tests.rs
```

### Task 12: The per-engine skill budget command

**Files:** Modify `src-tauri/src/skill_budget.rs`, `src-tauri/src/lib.rs`, `docs/ipc.md`, `README.md`. Test `src-tauri/tests/skill_budget_tests.rs`.

**Interfaces:**
- `pub struct SkillBudget { engine_id: String, skills_counted: usize, estimated_tokens: Option<u64> }`
- `pub fn claude_budget(conn: &Connection, settings_path: &Path) -> SkillBudget`. The skills are the `annotations::asset_annotations_on(conn)` rows of category `skill` whose `reach` has `engine_key == "claude_code"` and `reached`. They're deduplicated by the canonical path of their `SKILL.md` and summed with `listing_bytes`; `estimated_tokens = bytes / 4`. A settings file that exists but doesn't parse gives `estimated_tokens: None`, so the row reads "Not measured" rather than an over-count.
- Settings come from `agents::engine_base(home, ".claude").join("settings.json")`. `// shortcut: user settings only; project, local and managed settings also set skillOverrides; upgrade when the card gains a per-project view.` Plugin skills aren't skill rows, and the docs say `skillOverrides` doesn't touch them, so they're outside this figure. 5c shows plugins separately.
- Command `get_skill_budgets() -> Vec<SkillBudget>` (`(async)`), holding one entry, `"claude-code"`. Other engines' listing rules weren't researched, so they keep "Not measured". `docs/ipc.md` entry 31.

- [ ] **Step 1: Write the failing tests.** Build the store as `asset_annotations_tests.rs` does.
  - `budget_sums_reached_skills`: two skills, 4 and 1,537 bytes, give `skills_counted == 2` and `estimated_tokens == Some(385)`
  - `a_skill_reached_through_two_roots_counts_once`
  - `an_unreached_skill_is_left_out`
  - `unparseable_settings_give_no_figure`
- [ ] **Step 2:** Run `cd src-tauri && cargo test --test skill_budget_tests budget`. Expected: `cannot find function \`claude_budget\``.
- [ ] **Step 3:** Implement, add the command and the IPC entry, and regenerate the README.
- [ ] **Step 4:** Run `cd src-tauri && cargo test --test skill_budget_tests` and `npx vitest run src/__tests__/readme-sync.test.ts`. Expected: both pass.
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(budget): get_skill_budgets sums Claude Code's skill listing" -- src-tauri/src/skill_budget.rs src-tauri/src/lib.rs src-tauri/tests/skill_budget_tests.rs docs/ipc.md README.md
```

### Task 13: The Skills figure on the overview card. **Waits on T19's card merging, the combined layout round (T19 runs it; this plan supplies the Skills row) and Task 10.**

- [ ] **Step 1:** Write a failing `OverviewCard.test.tsx` case: with `get_skill_budgets` answering `[{engine_id: "claude-code", skills_counted: 2, estimated_tokens: 385}]`, Claude Code's Skills row shows the ruled figure for 385. Another engine's Skills row still shows `"Not measured"`, as does `estimated_tokens: null`.
- [ ] **Step 2:** Run `npx vitest run src/components/OverviewCard.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement in the shape the layout round chose. If it puts skills into the engine's total, **stop**: the sum must come from Rust (`invariants.md`). Ask T19 and P2 for the summed field rather than adding in the webview.
- [ ] **Step 4:** Run the card tests, `no-frontend-counting.test.ts` and `bunx tsc --noEmit`. Expected: all pass and exit 0. Take a screenshot per `verifying-ui.md` with Claude Code picked.
- [ ] **Step 5:** Commit the paths, staging shared files by hunk.

### Task 14: `claude plugin` read side, hooks and cache. **Waits on P7's `ENGINE_CLIS`.**

**Files:** Create `src-tauri/src/vendor_cli/claude_plugin.rs`, `src-tauri/tests/claude_plugin_tests.rs` and `src-tauri/tests/fixtures/vendor_cli/claude/*`. Modify `lib.rs`, `docs/ipc.md` and `README.md`.

**Interfaces:**
- `pub struct Plugin { id: String, version: String, enabled: bool, needs_setup: bool, hooks_file: Option<String> }`
- `pub struct Marketplace { name: String, source: String }` (field names per the fixture)
- `pub struct Plugins { installed: bool, plugins: Vec<Plugin>, count: usize, marketplaces: Vec<Marketplace>, marketplace_count: usize, cache_dir: Option<String> }`
- `pub async fn plugins(claude: &Cli, home: &Path) -> Plugins`. It runs `["plugin","list","--json"]` and `["plugin","marketplace","list","--json"]` (30 s each) and keeps `scope == "user"` rows. `hooks_file` is `<installPath>/hooks/hooks.json` when that file exists, with `installPath` read from `<engine_base(home, ".claude")>/plugins/installed_plugins.json`. `cache_dir` is `<…>/plugins/cache` when it exists. Hanger never writes these files. The webview opens them through the existing `open_in_editor`.
- Note for the copy: `claude plugin list` itself rewrites `~/.claude.json` (seen in a throwaway HOME, research §3). So the pane reads it only when opened, never on scan.
- Command `get_claude_plugins() -> Plugins`, with `claude` found through P7's `ENGINE_CLIS` entry and `resolve_in`. `docs/ipc.md` entry 32.

- [ ] **Step 1: Capture the fixtures.** In a throwaway HOME, run `claude plugin marketplace add anthropics/claude-plugins-official --json`, then install one plugin from it with `--json`. Then capture `plugin list --json`, `plugin marketplace list --json`, `installed_plugins.json`, and the `--json` result lines of install, uninstall `--keep-data`, enable, disable and marketplace remove `--scope user`. Then `rm -rf` the HOME. The `marketplace list --json` in an empty HOME printed `[]` on 2026-11-28, so the fixture has to come from one with a marketplace added.
- [ ] **Step 2: Write the failing tests:**
  - `plugins_parse_the_captured_fixture` (`count` and the first `id`)
  - `project_scope_rows_are_dropped`
  - `needs_setup_follows_has_user_config`
  - `hooks_file_is_set_only_when_it_exists`
  - `marketplaces_parse_the_captured_fixture`
  - `no_program_is_not_installed`
  - `an_unknown_field_does_not_cross`: a fixture row with an added `"secret": "x"` serialises without `secret`
- [ ] **Step 3:** Run `cd src-tauri && cargo test --test claude_plugin_tests`. Expected: unresolved `claude_plugin`.
- [ ] **Step 4:** Implement, add the command, the IPC entry and the README regen, then re-run the tests. Expected: pass.
- [ ] **Step 5:** Commit with explicit paths, `git add` for the new files first.

### Task 15: Plugin and marketplace writes, with receipts. **Waits on P4 (as Task 4) and Task 6's rulings.**

**Interfaces:**
- `#[serde(rename_all = "snake_case")] pub enum PluginVerb { Install, Uninstall, Update, Enable, Disable }`
- `pub struct PluginChange { receipt_id: Option<String>, undoable: bool, plugins: Plugins }`
- `pub async fn change_plugin(claude: &Cli, home: &Path, receipts: &Path, verb: PluginVerb, id: &str) -> Result<PluginChange, VendorFailure>`. `id` must match `^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+$`. A plugin listed at a non-user scope gives `NotUserScope`. Argv, all with `--scope user --json`, and 180 s for install and update, 30 s otherwise:
  - install `[plugin,install,id]`, with reverse uninstall `[plugin,uninstall,id,--scope,user,--keep-data,--json]`
  - uninstall `[plugin,uninstall,id,--keep-data]`, with reverse install
  - enable and disable, each the other's reverse
  - update `[plugin,update,id]`, with an empty reverse (or left out entirely, per Task 6)
- `pub async fn add_marketplace(claude, home, receipts, source: &str)`. `source` is `owner/repo` (`valid_repo`) or an `https://` URL that passes `safe_arg`; anything else gives `RefusedValue`. The new name is the one in `marketplace list` after the add but not before, and the reverse is `[plugin,marketplace,remove,<name>,--scope,user,--json]`.
- `pub async fn remove_marketplace(claude, home, receipts, name: &str)`. Any installed plugin whose id ends `@<name>` gives `MarketplaceInUse`. The reverse is `add <source as listed before the remove> --scope user --json`.
- `vendor_cli::undo` gains the `Claude` arm.
- Commands, all `(async)`: `change_claude_plugin(id, verb)`, `add_plugin_marketplace(source)`, `remove_plugin_marketplace(name)`. `docs/ipc.md` entries 33–35.

- [ ] **Step 1: Write the failing tests:**
  - `install_runs_the_exact_argv_and_never_yes` (`args.log` has no `-y` and no `--accept-command`)
  - `uninstall_keeps_data`
  - `each_verb_records_its_reverse`
  - `update_records_no_reverse`
  - `a_project_scope_plugin_is_refused`
  - `a_dash_id_is_refused_without_spawning`
  - `remove_refuses_a_marketplace_in_use`
  - `add_finds_the_new_marketplace_by_list_difference`
  - `undo_of_an_install_uninstalls`
  - `a_refused_install_is_cli_refused` (fake exits 1 with a `shownCommand` line on stdout, and the reply carries no text)
- [ ] **Step 2:** Run `cd src-tauri && cargo test --test claude_plugin_tests`. Expected: missing `change_plugin` and its siblings.
- [ ] **Step 3:** Implement, add the commands, IPC entries and README regen, and re-run the tests plus `vendor_cli_boundary_tests`. Expected: pass.
- [ ] **Step 4:** Commit with explicit paths.

### Task 16: STOP for Karthik. Layout options for the Plugins pane.

- [ ] **Step 1:** Render two or three options at true width in real tokens. Each covers:
  - where Plugins lives: a rail item, or a Global tab such as `global:Plugins`
  - the plugin row, with its turn on and off control, Update, Uninstall and "Needs setup in Claude Code"
  - marketplaces, with Add and Remove
  - hooks and cache as Open in editor rows
  - the Undo after each write

  Every option keeps the sheet corners (memory: every screen carries the sheet corner). Put them in `docs/design-ref-prototypes/`.
- [ ] **Step 2:** Stop. His pick is recorded here. If it's a rail item, Task 17 also adds `plugins` to `telemetry::SCREENS` and to `screenNameFor`, red first in `telemetry_session_tests.rs` and `screenName`'s tests. Otherwise it reports as `my_machine`, as `global:<tab>` already does.

### Task 17: The Plugins pane

- [ ] **Step 1: Write failing Vitest cases** for `useClaudePlugins` and the pane:
  - not installed renders the ruled line
  - counts come from `count` and `marketplace_count`
  - each verb calls `change_claude_plugin` and then `start_scan` (plugins bring subagents and MCP servers the scanner reads)
  - Uninstall confirms inline, with no blocking dialog
  - `undoable: false` shows no Undo
  - `MarketplaceInUse` renders its line
  - hooks and cache rows call `open_in_editor`
- [ ] **Step 2:** Run `npx vitest run <those files>`. Expected: FAIL.
- [ ] **Step 3:** Implement with specimens in `DesignSystemPane.tsx`.
- [ ] **Step 4:** Run the files, the four guard tests from Task 8 and `bunx tsc --noEmit`. Expected: all pass, exit 0. Take screenshots per `verifying-ui.md`.
- [ ] **Step 5:** Commit, with `App.tsx` by hunk only.

### Task 18: Close

- [ ] **Step 1:** Capture the per-kind counts again (same command as Task 1 Step 1) to `counts-after.txt`. Every category must match the baseline, net of anything live-installed and not undone. Plugin installs move `subagent` and `tool` rows legitimately; Task 9's and any plugin check's Undo should leave the net at zero. A difference nothing explains is a blocker to report.
- [ ] **Step 2:** Run the four pinned gates from the repo root, each in its own call: `npx vitest run`, then `cd src-tauri && cargo test`, then `bunx tsc --noEmit`, then `gitleaks detect --source .` and `gitleaks detect --source . --no-git -c .gitleaks.toml`. Paste each command, its output and its exit code. If the tree moved meanwhile, rerun.
- [ ] **Step 3:** Run `stage-gate --dev` with a fresh reviewer before any push.

---

## Human gates

| Gate | Where | Verified by |
|---|---|---|
| Search fixture captured in his own terminal | Task 2 Step 2 | The fixture file, parsed |
| Naming brief: Plugins, Marketplaces, install, update and plugin verbs, every status and failure line, the Skills figure; plus the two Q6 contradictions | Task 6 (the batched round with all tracks) | His annotated Plannotator file |
| Layout options at true width, skill surface | Task 7 | His recorded pick |
| One real `gh skill install`, its Undo, and Update if possible | Task 9 | Folder, frontmatter, receipt, store counts, screenshot |
| H1, the live Claude Code session | Task 10, before any 5b code | Session transcript grep |
| Combined overview-card layout round | Before Task 13 (T19 runs it) | His recorded pick |
| Layout options at true width, Plugins pane | Task 16 | His recorded pick |
| `stage-gate --dev` before push | Task 18 | Reviewer report |

Left out on purpose:
- The "update available" badge (`gh skill update --dry-run` answers in prose, not JSON).
- Accepting marketplace-declared commands.
- Plugin token cost from `claude plugin details`.
- Per-hook disabling (the vendor-CLI ruling).
- The inspector's per-skill "always on" line, which keeps today's figure.
- A budget for engines other than Claude Code.
