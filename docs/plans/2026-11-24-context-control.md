# Context Control, Slice 1: MCP Servers On and Off — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Karthik answered the three open questions on 2026-11-24; they are recorded as decisions 10–12. He approved the plan in Plannotator the same day. Task 1 is done: see [the engine matrix](2026-11-24-context-control-engine-matrix.md), whose last sections list three results that differ from this plan and wait on his ruling.

**Goal:** From Hanger, switch an MCP server off or on for one engine, in the file where it is declared. Every write is safe and can be undone. Each engine shows what its switched-on servers cost in context.

**Architecture:** A new Rust module, `mcp::switch`, sits beside the read-only `mcp::discover`. It edits config files in place with format-preserving editors, so comments, key order and unrelated settings stay byte-identical. Each write goes through one safe-replace function: backup, temp file, rename, re-parse, restore on failure. Claude Code and Gemini CLI are switched through their own CLIs, because neither accepts a flag in the file. Four IPC commands expose it. The webview gets a per-engine switch in the MCP server inspector first, then the Engines rail section.

**Tech stack:** Rust (`jsonc-parser` 0.34 `cst`, `toml_edit` 0.25 — both new direct dependencies; tokio `Command`; `sha2`), React 19 + TypeScript, Vitest, `cargo test` integration tests under `src-tauri/tests/`.

**Spec:** the decisions below, ruled by Karthik on 2026-11-24. No other spec exists.

## Decisions (ruled 2026-11-24)

1. Hanger switches what each engine loads, to cut context cost: MCP servers first, skills second. It is a GUI for what mcpick does on the command line, built Hanger's way.
2. mcpick's adapters, write logic, safe-apply, rollback and tests are ported into Rust and keep mcpick's MIT notice. The mcpick binary is never run or bundled.
3. Anything a vendor owns goes through that vendor's CLI: `claude mcp`, `claude plugin`, `gh skill`.
4. A server is switched where it is declared. A global server goes off everywhere for that engine; a project's server goes off in that project. Per-project overrides of global servers are slice 2.
5. Every write is atomic, keeps a timestamped copy, and gets one Undo.
6. Each engine's switch ships only after that engine's own `mcp list` confirms it. Each engine says when a change applies.
7. Cost figures come from cached probe results only. Unprobed servers read "Not measured". A "Measure all" button probes on request. The budget states its coverage. Hanger never probes on its own.
8. UI: one Engines rail section. An engine's detail shows Context first. The MCP server inspector shows each engine's state. ⌘K carries command-style actions.
9. `docs/roadmap.md` drops "Not building New MCP Server".

## What the engines actually do (measured 2026-11-24)

Each row was run against a throwaway config directory on Karthik's machine. These are existence proofs for the installed versions, not a sample.

| Engine | Version | What was tried | What its own `mcp list` said | Result |
|---|---|---|---|---|
| Codex | codex-cli 0.171.0 | `enabled = false` under `[mcp_servers.beta]` | `alpha … enabled`, `beta … disabled` | Honoured. |
| Gemini CLI | 0.56.0 | `"disabled": true` on a server entry | `Invalid configuration … Unrecognized key(s) in object: 'disabled'` | **Rejected.** Writing this key breaks the user's Gemini config. Gemini has its own `gemini mcp disable <name>`. Not yet confirmed: in an untrusted folder Gemini lists every server as Disabled, so the test needs a trusted folder. |
| Claude Code | 2.1.331 | `"disabled": true` on a user-scope server | Health-checked `beta` exactly like `alpha` | **Ignored.** Claude Code has no machine-wide flag. Its real file carries per-project lists only (`disabledMcpjsonServers`, `enabledMcpjsonServers`). |
| OpenCode | v2.4.1 | `"enabled": false` | Not confirmed. `opencode mcp list` talks to the background service and lists the real config. With `--standalone` and a temporary `XDG_CONFIG_HOME` it reports "No MCP servers configured". | Open. |

Two consequences:

- mcpick writes `disabled` for Gemini CLI (`client-config.ts`, the `gemini-cli` adapter). That port would have broken a real config. Rule 6 exists for this.
- `~/.claude.json` is 200 KB here and Claude Code rewrites it while sessions run. Hanger never writes that file directly.

The other eleven hosts (Cursor, Claude Desktop, Zed, VS Code, Devin Desktop, Kiro, Trae, Amp, Roo Code, Kilo Code, Cline) have no `mcp list` command on this machine. Their switches cannot meet rule 6 by a command, so they wait on decision 11.

## Answers from Karthik (2026-11-24, in Plannotator)

10. **Claude Code is switched off by remove-and-keep now, and by its per-project lists in slice 2.** Off runs `claude mcp remove`; the server's config is kept in a private file (mode 0600) in Hanger's data folder; on restores it with `claude mcp add-json` over stdin. While a server is off it exists only in Hanger's store, including any secret values in its `env`.
11. **The eleven hosts with no `mcp list` command stay read-only until Karthik checks each one in the app.** Cursor, Claude Desktop, Zed and VS Code are installed here; each gets a two-minute check sheet (Task 1, Step 5). A host nobody has checked shows a stated reason and no switch. Vendor docs alone do not unblock one.
12. **`jsonc-parser` (its `cst` module) and `toml_edit` are added,** so a switch changes one line and keeps comments and key order. Hanger does not re-serialise a config file.

## Rulings at checkpoint 1 (2026-11-24, after the engine matrix)

13. **Gemini CLI is switched by writing its own state file,** `~/.gemini/mcp-server-enablement.json`, through the same safe replace and Undo as any other write. Its command, `gemini mcp disable`, is not used: on 0.56.0 it fails for every server and exits 0. This is a ruled exception to decision 3. The file is keyed by server name alone, so one switch covers every Gemini server of that name at any scope, and the row says so. This replaces the `GeminiCli` kind and `gemini_set` in Tasks 2 and 6.
14. **Codex is switchable at both scopes.** `enabled = false` in a trusted project's `.codex/config.toml` reads `disabled` in `codex mcp list` (codex-cli 0.171.0, measured 2026-11-24), the same as the global file.

15. **OpenCode is built read-only and checked at Task 13.** Its config reader accepts `"enabled": false`, but `opencode mcp list` could not be isolated, and the only confirmation is one switch on the real `opencode.json`, read back through the background service this session also runs on. That check joins Task 13's real-config checks, with Karthik's go-ahead then. If `opencode mcp list` shows the server off, OpenCode's `SWITCHES` row lands in its own commit; if the result is ambiguous, it is reported and OpenCode stays read-only.

16. **The 16 history findings are allowlisted by fingerprint.** They are one made-up AWS-shaped example string from `docs/plans/2026-11-24-tool-manager-phase-a.md`, held by T3 Code's checkpoint refs (`refs/t3/orchestration-v2/checkpoints/…`) and reachable from no branch, tag or remote. Their 16 fingerprints go into `.gitleaksignore` in a commit of their own that names the cause. The string itself is already gone from the file (`f3d4d0c`). Nothing else is allowlisted, and T3's refs are not deleted.

## Rulings before "go" (2026-11-24, in Plannotator)

17. **A server switched off for Claude Code stays in the MCP servers list, marked off.** It is declared in no file while off, and it must not vanish from the place it was switched off from. The backend keeps every count honest (Task 8A).
18. **Gemini CLI: global servers only.** A project-declared Gemini server shows its state and no switch, with the reason: Gemini switches by name, across every project.
19. **No "applies to" line until observed.** `EngineContext.applies` stays `None` for every engine until Task 13 watches a real session.
20. **The kept copy is built for Claude Code only.** Whether an app that ignores a file flag gets remove-and-keep is decided after Karthik's app checks (G3).
21. **The newest 20 backups per file are kept.**
22. **VS Code's new MCP config gets its own task right after the backend** (Task 8B): reading only. Karthik has a `~/.copilot/mcp-config.json` that Hanger does not read today.
23. **Commits go on `main` and are pushed at each checkpoint** (after Task 8B and at the end), only when the gates are green and Karthik says push.

## Human gates

- **G0 — this plan.** Karthik approves before any task starts.
- **G1 — naming brief** (`ui-copy.md`). The rail label, the screen title, and the strings for on, off, "applies to new sessions", Undo, "Not measured", "Measure all", the coverage line, and each read-only reason. Written to `docs/plans/2026-11-24-context-control-naming-brief.md`, every string through `/humanizer`. Blocks Tasks 9–12.
- **G2 — layout options.** Two or three layouts of the Engines pane and the inspector switch, rendered at true width in real tokens. Blocks Tasks 10–11.
- **G3 — app checks** (decision 11). One check per app, done by Karthik from the sheet Task 1 writes. Each passed check adds that app's row to `SWITCHES` in its own commit, with the app version and date as its evidence. Not on this slice's critical path: the slice can close with apps still read-only.
- **Close.** Karthik closes the slice after Task 13's evidence; automation does not.

Tasks 1–8B need only G0 and Karthik's "go".

## Checkpoints

Work stops and reports after Task 1 (done), after Task 8B (backend complete; push on Karthik's word), at G1, at G2, and after Task 13.

## Global constraints

- Code noun is **engine**; "MCP servers", never "tools", in copy. Internal ids: Rust module `mcp::switch`, screen id `"engines"`.
- **No value from a config file crosses IPC, reaches SQLite, or is logged.** `dialect.rs` drops env values at parse time, and that stays true. Raw file bytes exist only inside `mcp::switch`, in backup files and in stash files. No type in `mcp::switch` that holds raw bytes derives `Serialize`.
- Backups and stash files live under `<app data dir>/switch/` (directory mode 0700, files 0600). Never under the repo, never cwd-relative.
- The webview never names a path to write. A write command takes a `registration_key` and a host id; Rust resolves the file through `registry::SOURCES` and refuses anything else.
- Hanger never writes `~/.claude.json`. Hanger never writes a key an engine has not been shown to honour (the table above; `SWITCHES` carries the evidence).
- Counts come from the backend (`invariants.md`). Every budget figure is a field on the reply.
- Engine names reach the UI from the backend (`no-hardcoded-engine-copy.test.ts`).
- Every child process: absolute program path, `kill_on_drop(true)`, 10 s timeout, no shell, secrets on stdin and never in argv.
- No schema migration. Receipts are files beside their backups.
- Styling: semantic tokens, type roles, `strokeFor(box)`. No blocking dialogs.
- Gates per task, from the repo root unless stated: `npx vitest run`; `cargo test` (from `src-tauri/`); `bunx tsc --noEmit`; both `gitleaks` runs. Each in its own call.
- No peer session shares this checkout today, so commits use explicit paths. If one appears, `shared-checkout.md` applies.

## Review focus

1. **The file changed between Hanger's read and its write** (the engine or an editor saved it). Expected: Hanger refuses with "changed since Hanger read it" and writes nothing. Pinned in Task 4 by `a_file_changed_since_read_is_not_overwritten`.
2. **The config file is a symlink into a dotfiles repo.** A temp-file rename would replace the link with a plain file. Expected: Hanger writes the link's target and the link survives. Pinned in Task 4 by `a_symlinked_config_keeps_its_link`.
3. **The file holds secrets and is mode 0600.** Expected: the rewritten file and its backup keep 0600. Pinned in Task 4 by `mode_is_preserved_on_the_file_and_its_backup`.
4. **Undo after the user edited the file again.** Expected: Undo refuses instead of discarding their edit. Pinned in Task 4 by `undo_refuses_when_the_file_moved_on`.
5. **A comment, a trailing comma, or an unrelated key sits next to the server.** Expected: only the flag's line differs. Pinned in Task 3 by `only_the_flag_line_changes_in_jsonc` and `only_the_flag_line_changes_in_toml`.
6. **`claude mcp remove` succeeds and Hanger crashes before recording the stash.** Expected: the stash is written and fsynced before `remove` runs, so the server is never in neither place. Pinned in Task 6 by `the_stash_exists_before_remove_runs`.
7. **A secret in a server's `env`.** Expected: it appears in no IPC reply, error string, or log line. Pinned in Task 8 by `switch_replies_never_carry_a_config_value`.

---

### Task 1: Finish the engine matrix (no production code)

**Files:**
- Create: `docs/plans/2026-11-24-context-control-engine-matrix.md` (tracked; `docs/evidence/` is in `.gitignore`, and the `SWITCHES` evidence must be a file a reader can open)

- [ ] **Step 1: OpenCode.** Find the configuration `opencode mcp list --standalone` reads on v2.4.1 (try `OPENCODE_CONFIG_DIR`, a project `opencode.json` inside a git repo, `opencode debug config`). Then confirm `"enabled": false` reads as disabled.
- [ ] **Step 2: Gemini CLI.** In a throwaway `HOME`, with the folder trusted, run `gemini mcp disable beta`, then `gemini mcp list`. Record which file changed and how (diff the directory before and after).
- [ ] **Step 3: Claude Code.** In a throwaway `CLAUDE_CONFIG_DIR`: `claude mcp add-json beta - --scope user` with the JSON on stdin, `claude mcp list`, `claude mcp remove beta --scope user`, `claude mcp list`. Confirm an entry with `env`, `args` and `type` survives the round trip byte-equal as parsed JSON.
- [ ] **Step 4: When a change applies.** For each engine that passed: start a session, switch a server off, and check whether the running session still lists it. Record "new sessions" only where observed.
- [ ] **Step 5: App check sheets.** For Cursor, Claude Desktop, Zed and VS Code, read the vendor's MCP documentation (fetched and cited, with the date) and write one sheet each into the evidence file: the exact key to add by hand to a throwaway server entry, where in the app to look, and what "off" must look like there. The sheets are for Karthik to run; Hanger writes nothing to these apps' files in this task.
- [ ] **Step 6:** Write the evidence file: command, verbatim output, exit code, engine version, per engine. An engine with no confirmed mechanism is recorded as read-only with the reason.
- [ ] **Step 7: Checkpoint.** Report the matrix to Karthik. An engine that failed stays read-only in this slice; that is reported, not worked around.
- [ ] **Step 8: Commit** `docs(mcp): what each engine's own mcp list says about switching a server off`.

### Task 2: The switch table

**Files:**
- Modify: `src-tauri/Cargo.toml` (`jsonc-parser = { version = "0.34", features = ["cst"] }`, `toml_edit = "0.25"`), `src-tauri/src/mcp/registry.rs`, `src-tauri/src/mcp/mod.rs` (`pub mod switch;`)
- Create: `src-tauri/src/mcp/switch/mod.rs`
- Test: `src-tauri/tests/mcp_switch_tests.rs`

**Interfaces:**
- Produces, in `registry.rs`:
  ```rust
  pub enum SwitchKind {
      /// `enabled = false` in the server's table or object.
      EnabledKey,
      /// `"disabled": true` in the server's object.
      DisabledKey,
      /// `claude mcp remove` / `claude mcp add-json`, config kept in Hanger's stash.
      ClaudeCli,
      /// `{"<name>": {"enabled": false}}` in `~/.gemini/mcp-server-enablement.json` (ruling 13).
      GeminiEnablementFile,
  }
  pub struct SwitchRow {
      pub host_id: &'static str,
      pub kind: SwitchKind,
      /// Which tiers this mechanism covers.
      pub tiers: &'static [ScopeTier],
      /// Engine version and date the engine's own listing confirmed it.
      pub confirmed: &'static str,
  }
  pub const SWITCHES: &[SwitchRow];
  pub fn switch_for(host_id: &str, tier: ScopeTier) -> Option<&'static SwitchRow>;
  ```
- `SWITCHES` holds exactly three rows, each citing the engine matrix: `codex` — `EnabledKey`, `[Global, Project]`, `"codex-cli 0.171.0, 2026-11-24"`; `claude-code` — `ClaudeCli`, `[User]`, `"claude 2.1.331, 2026-11-24"`; `gemini` — `GeminiEnablementFile`, `[Global]`, `"gemini 0.56.0, 2026-11-24"`. A host with no row is read-only. OpenCode has no row until Task 13 (ruling 15).

- [ ] **Step 1: Write the failing tests** — `every_switch_row_names_a_host`; `switch_rows_are_unique_per_host_and_tier`; `gemini_is_never_switched_by_a_key_in_the_file` (no `gemini` row has `EnabledKey` or `DisabledKey`); `claude_code_is_never_switched_by_a_key_in_the_file`; `a_host_with_no_row_is_read_only` (`switch_for("cursor", Global)` and `switch_for("opencode", Global)` are `None`); `gemini_project_servers_have_no_switch` (`switch_for("gemini", Project)` is `None`); `claude_code_is_switchable_at_user_scope_only`.
- [ ] **Step 2: Run** `cargo test --test mcp_switch_tests` from `src-tauri/` → FAIL, unresolved items.
- [ ] **Step 3: Allowlist the 16 history findings** (ruling 16): append their fingerprints to `.gitleaksignore`, plant a new key-shaped string in a scratch commit on a throwaway branch to prove the history gate still fails on anything else, delete that branch, and commit `chore(gitleaks): allowlist one retired fixture string held by T3 checkpoint refs` on its own.
- [ ] **Step 3a: Implement.** Read docs.rs for `jsonc-parser` 0.34 `cst` and `toml_edit` 0.25 before using either; cite both in the module doc.
- [ ] **Step 4: Run** → PASS; all four gates.
- [ ] **Step 5: Commit** `feat(mcp): a table of how each engine switches a server off, with its evidence`.

### Task 3: Edit one flag, leave every other byte

**Files:**
- Create: `src-tauri/src/mcp/switch/edit.rs`
- Test: `src-tauri/tests/mcp_switch_tests.rs`, fixtures under `src-tauri/tests/fixtures/mcp_switch/`

**Interfaces:**
- Consumes: `registry::{Dialect, SwitchKind}`.
- Produces:
  ```rust
  pub enum EditError { NotFound, Unparseable(String), UnsupportedDialect }
  /// What the file says today. `None` means the key is absent, which every flag-switched engine reads as on.
  pub fn read_flag(body: &str, dialect: Dialect, kind: SwitchKind, name: &str) -> Result<Option<bool>, EditError>;
  /// The whole file with one server's flag set. Pure: a string in, a string out.
  pub fn set_enabled(body: &str, dialect: Dialect, kind: SwitchKind, name: &str, enabled: bool) -> Result<String, EditError>;
  ```
- Rules ported from mcpick (`set_server_enabled`, `codex-adapter.ts` → `writeEnabled`): `EnabledKey` writes `enabled = <bool>` and removes a stale `disabled`; `DisabledKey` writes `disabled = <!bool>`, unless the entry already carries `enabled`, in which case that key is kept and set. Unlike mcpick, only the named server is touched; mcpick rewrites the flag on every server in the file.
- Switching on writes `enabled = true` where the key exists and leaves an absent key absent, so a file Hanger never switched stays byte-identical after off-then-on only where the key pre-existed. `shortcut: off-then-on leaves an explicit "enabled = true" behind; Undo is the byte-exact way back.`
- Gemini's state file gets its own pair, because it is not a server declaration:
  ```rust
  /// `body` is `None` when the file does not exist yet. Key is `name.to_lowercase().trim()`, as Gemini's own reader does.
  pub fn gemini_is_enabled(body: Option<&str>, name: &str) -> Result<bool, EditError>;
  /// Off writes `{"enabled": false}` under the key; on removes the key. Other keys are untouched.
  pub fn gemini_set_enabled(body: Option<&str>, name: &str, enabled: bool) -> Result<String, EditError>;
  ```
- Dialects handled: `CodexToml` (`mcp_servers` table only; the legacy `tools` table is `UnsupportedDialect`), `McpServers`, `VsCodeServers`, `OpenCodeMcp`, `ZedContextServers`, `AmpSettingsKey`. `ClaudeJson` and `ClaudeAiConnectors` are `UnsupportedDialect`.

- [ ] **Step 1: Write the failing tests**, porting the enable/disable cases from mcpick's `client-config.test.ts` and `codex-adapter.test.ts` by name, plus:
  - `only_the_flag_line_changes_in_toml` — a fixture with comments, blank lines and an inline table; a line diff of input and output has exactly one added line.
  - `only_the_flag_line_changes_in_jsonc` — a fixture with `//` and `/* */` comments, a trailing comma and four-space indent; exactly one line differs.
  - `key_order_survives` — `zebra` before `alpha` in the input stays so.
  - `an_unknown_server_is_not_found`; `a_malformed_file_is_unparseable_and_returns_no_text`.
  - `read_flag_reads_both_spellings` — `enabled: false`, `disabled: true`, neither.
  - `the_other_servers_are_untouched` — the regression test against mcpick's rewrite-all behaviour.
  - `gemini_off_adds_one_key_and_on_removes_it`; `gemini_keys_are_lowercased_and_trimmed` (`" GitHub "` → `github`); `gemini_absent_file_reads_as_enabled_and_off_creates_it`; `gemini_other_names_are_untouched`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** with `jsonc_parser::cst::CstRootNode` and `toml_edit::DocumentMut`.
- [ ] **Step 4: Run** → PASS; all four gates.
- [ ] **Step 5: Commit** `feat(mcp): switch one server's flag and leave the rest of the file alone`.

### Task 4: Safe replace, receipts, Undo

**Files:**
- Create: `src-tauri/src/mcp/switch/apply.rs`
- Test: `src-tauri/tests/mcp_switch_tests.rs`

**Interfaces:**
- Produces:
  ```rust
  pub enum ApplyError { ChangedSinceRead, Backup(String), Write(String), Verify(String), NotUndoable(String) }
  #[derive(Serialize, Deserialize)]
  pub struct Receipt {
      pub id: String,            // uuid
      pub path: String,          // the real file (symlinks resolved)
      pub backup_file: String,   // file name inside the backups dir, never a full path over IPC
      pub before_sha256: String,
      pub after_sha256: String,
      pub at_ms: i64,
      pub what: String,          // "codex · beta · off": ids only, never file content
  }
  /// `expected_before` is `None` when the file must not exist yet (Gemini's state file on first use).
  pub fn safe_replace(path: &Path, expected_before: Option<&str>, next: &str, format: Format, backups: &Path, what: &str) -> Result<Receipt, ApplyError>;
  pub fn undo(receipt_id: &str, backups: &Path) -> Result<Receipt, ApplyError>;
  pub fn latest_receipts(backups: &Path) -> Vec<Receipt>;   // newest first
  ```
- `safe_replace`, ported from mcpick's `safe_content_write` with four additions marked †:
  1. † `fs::canonicalize(path)`, and write the result (Review focus 2).
  2. † Re-read the file; if its bytes differ from `expected_before`, return `ChangedSinceRead` (Review focus 1).
  3. Copy the current bytes to `<backups>/config-<basename>-<UTC stamp>-<sha256(path)[..10]>.<ext>`, mode 0600, and write `<that>.receipt.json`.
  4. Write `next` to `.<basename>.<pid>.<uuid>.tmp` in the same directory, † with the original's mode, then `sync_all`, then `rename`.
  5. Re-read and parse as `format` (JSONC or TOML). On any failure, write the original bytes back and return `Verify`.
  6. † Keep the newest 20 backups per file and delete older ones. `shortcut: a count cap, not an age cap; the backup and restore UI in slice 4 owns the real policy.`
- A write that creates the file has no backup; its receipt says so, and its Undo removes the file, under the same hash check.
- `undo` restores a receipt's backup only when the file's current hash equals `after_sha256`. Otherwise `NotUndoable` (Review focus 4). The restore itself goes through `safe_replace`, so an Undo can be undone.
- `transactional.rs` is not changed: its backups directory is relative to the working directory, which is `/` for an app opened from Finder. That defect is recorded in `known-debt.md`, in its own commit.

- [ ] **Step 1: Write the failing tests** (temp dirs only), porting mcpick's `safe-apply.test.ts` cases by name, plus `a_file_changed_since_read_is_not_overwritten`, `a_symlinked_config_keeps_its_link`, `mode_is_preserved_on_the_file_and_its_backup`, `undo_restores_the_exact_bytes`, `undo_refuses_when_the_file_moved_on`, `an_undo_can_be_undone`, `a_failed_verify_puts_the_original_back`, `the_twenty_first_backup_evicts_the_oldest`, `no_temp_file_is_left_behind`, `creating_a_file_is_undone_by_removing_it`, `a_file_that_appeared_since_read_is_not_overwritten`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; all four gates.
- [ ] **Step 5: Commit** `feat(mcp): every config write is backed up, atomic, verified and undoable`.
- [ ] **Step 6: Commit** `docs(debt): write_transactional's backups directory is cwd-relative` (`.claude/rules/known-debt.md` only).

### Task 5: Find and run an engine's CLI

This is Tasks 2 and 3 of `docs/plans/2026-11-24-tool-manager-phase-a.md`, built here because Task 6 needs them. That plan consumes the result unchanged.

**Files:**
- Create: `src-tauri/src/engine_status/mod.rs`, `src-tauri/src/engine_status/resolve.rs`, `src-tauri/src/engine_status/run.rs`
- Modify: `src-tauri/src/lib.rs` (`pub mod engine_status;`), `src-tauri/src/mcp/probe.rs` (`widened_path` becomes `pub(crate)`, body unchanged)
- Test: `src-tauri/tests/engine_status_tests.rs`

**Interfaces:**
- Produces:
  ```rust
  pub fn search_path() -> String;                                  // login-shell PATH, then widened_path(); cached
  pub fn resolve_in(bin: &str, path: &str) -> Option<PathBuf>;     // first executable hit
  pub struct Captured { pub ok: bool, pub stdout: String }         // stderr is dropped, never returned
  pub async fn run_capture(program: &Path, args: &[&str], stdin: Option<&[u8]>, envs: &[(&str, &str)], timeout: Duration) -> Option<Captured>;
  ```
- [ ] **Step 1: Write the failing tests** — `the_first_path_entry_wins`, `resolves_through_login_shell_path_when_process_path_is_minimal`, `a_non_executable_file_is_not_a_hit`, `a_hung_command_times_out_and_reports_nothing`, `stdin_reaches_the_child` (a temp script that echoes stdin).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; all four gates.
- [ ] **Step 5: Commit** `feat(engines): find and run each CLI the way the user's terminal does`.

### Task 6: Claude Code, switched through `claude mcp`

Gemini CLI is not here: by ruling 13 it is a file write, built in Tasks 3 and 4.

**Files:**
- Create: `src-tauri/src/mcp/switch/vendor.rs`
- Test: `src-tauri/tests/mcp_switch_tests.rs` (a fake `claude` script in a temp dir, a temp `CLAUDE_CONFIG_DIR`)

**Interfaces:**
- Consumes: `engine_status::{resolve_in, run_capture}`, `apply::Receipt`.
- Produces:
  ```rust
  pub async fn claude_off(home: &Path, scope: ClaudeScope, name: &str, stash: &Path, cli: &Path) -> Result<Receipt, SwitchError>;
  pub async fn claude_on(stash_id: &str, stash: &Path, cli: &Path) -> Result<Receipt, SwitchError>;
  pub fn claude_stashed(stash: &Path) -> Vec<StashedServer>;       // name, scope, transport, env KEY NAMES: no values
  ```
- `claude_off`, in this order: read the entry from `~/.claude.json` (read only); write it to `<stash>/claude-code/<uuid>.json`, mode 0600, and `sync_all`; run `claude mcp remove <name> --scope <scope>`; re-read and confirm the entry is gone. If the remove fails, delete the stash file and return the error.
- `claude_on`: run `claude mcp add-json <name> - --scope <scope>` with the stashed JSON on stdin; re-read and confirm the entry is present and equal as parsed JSON; only then delete the stash file.
- Undo for a vendor switch is the opposite call. Its `Receipt` names the stash id instead of a backup file.
- This slice covers Claude Code's user scope only. A project's `.mcp.json` server and a local-scope server are read-only until slice 2.

- [ ] **Step 1: Write the failing tests** — `the_stash_exists_before_remove_runs` (the fake `claude` asserts the stash file is present when it is invoked), `a_failed_remove_leaves_no_stash`, `on_restores_env_args_and_type`, `the_stash_is_deleted_only_after_the_entry_is_back`, `secrets_go_over_stdin_never_argv` (the fake records its argv; the fixture value is absent from it), `stashed_listing_carries_key_names_only`, `a_remove_that_exits_nonzero_is_an_error` (`claude mcp remove` exits 1 for a missing server; measured).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; all four gates.
- [ ] **Step 5: Commit** `feat(mcp): Claude Code is switched through its own command, with the config kept by Hanger`.

### Task 7: One engine's context — state, cost, coverage

**Files:**
- Create: `src-tauri/src/mcp/switch/context.rs`
- Test: `src-tauri/tests/mcp_switch_tests.rs`

**Interfaces:**
- Consumes: `discover::DiscoveryResult`, `edit::read_flag`, `vendor::claude_stashed`, `probe::{cache_key, tool_cost}`, `registry::switch_for`.
- Produces (pure; the file reader and the probe lookup are parameters):
  ```rust
  #[derive(Serialize)] #[serde(rename_all = "snake_case")]
  pub enum ItemState { On, Off }
  #[derive(Serialize)] #[serde(rename_all = "snake_case")]
  pub enum ReadOnlyReason { EngineNotConfirmed, PerProjectComesNext, SwitchesByNameEverywhere, ManagedByPlugin, ManagedByPolicy, RunsOnVendorServers, FileUnparseable }
  #[derive(Serialize)]
  pub struct ContextItem {
      pub key: String,                         // registration key, or "stash:<id>" for a stashed Claude Code server
      pub name: String,
      pub tier: String,
      pub config_path: String,                 // through preferences::sanitise_path
      pub state: ItemState,
      pub read_only: Option<ReadOnlyReason>,   // None = Hanger can switch it
      pub estimated_tokens: Option<u64>,       // None = not measured
      pub tool_count: Option<usize>,
  }
  #[derive(Serialize)]
  pub struct EngineContext {
      pub engine_id: String, pub engine_name: String,
      pub applies: Option<String>,             // None for every engine in this slice until Task 13 observes it (ruling 19)
      pub items: Vec<ContextItem>,
      pub on_count: usize, pub off_count: usize,
      pub measured_on_count: usize,            // the "12 of 15 measured" pair
      pub on_tokens_measured: u64,             // summed over measured, switched-on servers only
  }
  pub fn engine_context<R, P>(host_id: &str, discovered: &DiscoveryResult, stashed: &[StashedServer], read_file: R, probe_of: P) -> EngineContext;
  ```
- Read-only reasons: no `SWITCHES` row → `EngineNotConfirmed`; a tier the row does not cover → `PerProjectComesNext`, except a project-declared Gemini server, which is `SwitchesByNameEverywhere` (ruling 18) and still reports its state from the state file; a path under `.claude/plugins/marketplaces/` → `ManagedByPlugin`; `managed-mcp.json` or a `SystemAbsolute` source → `ManagedByPolicy`; the `claude-ai` host → `RunsOnVendorServers`.
- `on_tokens_measured` is the estimate the probe cache already makes (description bytes ÷ 4, schemas not stored). The budget is MCP servers only in this slice; skill descriptions join it in slice 5.

- [ ] **Step 1: Write the failing tests** — `an_absent_flag_is_on`; `enabled_false_is_off`; `a_stashed_claude_server_is_an_off_item`; `a_gemini_server_named_in_the_state_file_is_off_at_every_scope`; `a_gemini_project_server_is_read_only_because_the_switch_is_by_name`; `an_unconfirmed_engine_is_read_only_with_its_reason` (one test per reason); `off_servers_cost_nothing_in_the_budget`; `unmeasured_servers_are_counted_but_not_summed` (three on, two measured → `measured_on_count == 2`, `on_count == 3`); `a_failed_probe_is_measured_at_zero_not_unmeasured` (fixture taken from the producer: an error together with an all-zero cost, per `verification.md`); `counts_agree_with_items`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; all four gates.
- [ ] **Step 5: Commit** `feat(mcp): what one engine loads, what it costs, and how much of that is measured`.

### Task 8: IPC, and the documents that move with it

**Files:**
- Create: `src/types/engineContext.ts`
- Modify: `src-tauri/src/lib.rs` (four commands, `generate_handler!`), `docs/ipc.md`, `README.md` (regenerate the `ipc` region: `~/.bun/bin/bun run src/__tests__/readmeCounts.ts`), `docs/roadmap.md`, `docs/harness.md`
- Create: `THIRD-PARTY-NOTICES.md` (mcpick's MIT notice, Copyright (c) 2026 Scott Spence, and which modules derive from it)
- Test: `src-tauri/tests/mcp_switch_tests.rs`, `src-tauri/tests/ipc_boundary_tests.rs`

**Interfaces:**
- Produces (`#[tauri::command(async)]`):
  ```rust
  fn get_engine_context(app: AppHandle, engine_id: String) -> Result<EngineContext, String>;
  async fn set_mcp_server_enabled(app: AppHandle, engine_id: String, key: String, enabled: bool) -> Result<SwitchReply, String>;
  async fn undo_mcp_switch(app: AppHandle, receipt_id: String) -> Result<SwitchReply, String>;
  async fn measure_engine_context(app: AppHandle, engine_id: String) -> Result<EngineContext, String>;

  #[derive(Serialize)] pub struct SwitchReply { pub context: EngineContext, pub receipt_id: String, pub undoable: bool }
  ```
- `set_mcp_server_enabled` resolves `key` with `discover::resolve_registration`, checks the registration belongs to `engine_id`, looks up `switch_for`, and dispatches to the file path (Tasks 3–4) or the vendor path (Task 6). A key that resolves to nothing, or to another engine, is an error. No path from the webview is ever opened.
- `measure_engine_context` probes each switched-on, askable server of that engine through the existing `cached_probe`, one at a time. A server that is off is never started.
- Errors are fixed sentences chosen by error kind. No parser message and no file content is formatted into them.
- `docs/roadmap.md`: "Not building New MCP Server" is replaced by a pointer to this plan and the slice list. The "Reach is gated after declaration" section gains one line: switched-off servers are now modelled; approval, trust and managed policy still are not.
- `docs/harness.md`: one section, "Hanger writes engine configuration", stating the boundary: what it writes, through which path, and what it never writes.

- [ ] **Step 1: Write the failing tests** — `switching_codex_off_and_on_round_trips_a_real_file` (temp home, real `config.toml` fixture); `a_key_for_another_engine_is_refused`; `a_read_only_item_is_refused`; `measure_never_starts_a_switched_off_server`; and in `ipc_boundary_tests.rs`, `switch_replies_never_carry_a_config_value`: a fixture whose `env` holds a marker value is switched off, on and undone, and no serialised reply or error contains the marker. Plant first: temporarily add the raw entry to the reply, watch the test fail, remove it.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**, update the documents, regenerate the README region. **Step 4: Run** → PASS; all four gates (`readme-sync.test.ts` proves the region).
- [ ] **Step 5: Commit** `feat(mcp): switch a server off, on, and back from the webview`.

### Task 8A: A switched-off Claude Code server stays in the MCP servers list (ruling 17)

**Files:**
- Modify: `src-tauri/src/mcp/servers.rs`, `src-tauri/src/lib.rs` (`mcp_server_rows_for`), `src/types/` (the row's mirror)
- Test: `src-tauri/tests/mcp_servers_tests.rs`, `src-tauri/tests/mcp_switch_tests.rs`

**Interfaces:**
- Produces: `McpServerRow` gains `kept_off: Vec<KeptOff>` where `KeptOff { engine_id, engine_name, key }` and `key` is the `"stash:<id>"` that `set_mcp_server_enabled` accepts. A name that only the stash knows gets a row of its own with `registration_count: 0` and `file_count: 0`.
- Constraint, from `invariants.md` and the roadmap's "a header contradicts its own rows": before writing code, read how `count_assets` and the Tools header count this list. A kept-off-only row is either counted by the backend in a figure of its own, or kept out of the counted population and returned beside it; which one is decided from that code and reported, never papered over in the webview.

- [ ] **Step 1: Write the failing tests** — `a_server_kept_off_and_declared_elsewhere_carries_the_engine_on_its_row`; `a_server_only_the_stash_knows_still_has_a_row`; `kept_off_rows_join_no_registration_or_file_count`; `per_kind_asset_counts_are_unchanged_by_a_stash` (the `shared-asset-machinery.md` query, before and after).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; all four gates.
- [ ] **Step 5: Commit** `feat(mcp): a server switched off for Claude Code stays in the list`.

### Task 8B: Read VS Code's current MCP config (ruling 22)

Reading only. No switch for VS Code comes from this task.

**Files:**
- Modify: `src-tauri/src/mcp/registry.rs` (`SOURCES`), `docs/roadmap.md`, `docs/platforms.md` if it lists VS Code's paths
- Test: `src-tauri/tests/mcp_discovery_tests.rs`, fixtures

- [ ] **Step 1:** Re-fetch https://code.visualstudio.com/docs/agents/reference/mcp-configuration and cite it with the date in the registry comment. Read how the roadmap's "Config-directory env vars" section treats `CLAUDE_CONFIG_DIR` and `CODEX_HOME`, and apply the same rule to `COPILOT_HOME`.
- [ ] **Step 2: Write the failing tests** — `vscode_reads_the_copilot_user_file` (`~/.copilot/mcp-config.json`, `mcpServers`); `vscode_reads_a_workspace_root_mcp_json`; `the_deprecated_vscode_files_are_still_read` (they work until February 2027); `one_mcp_json_read_for_two_hosts_is_two_registrations_and_one_file` (the workspace-root `.mcp.json` is already a Claude Code source; `file_count` must not double).
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement** the rows. **Step 5: Run** → PASS; all four gates; per-kind counts before and after, with the difference explained by the newly read file.
- [ ] **Step 6: Commit** `fix(mcp): VS Code's servers are read from where VS Code now keeps them`.
- [ ] **Step 7: Checkpoint.** Report the backend to Karthik with test output. Push on his word (ruling 23).

### Task 9: Naming brief (G1)

- [ ] Research how Claude Code, Cursor, VS Code, Zed and mcpick word on/off, "applies to", Undo and cost. Write the brief with two or three options per string and a recommendation. Run every string through `/humanizer`. Karthik signs off. No code.

### Task 10: The switch in the MCP server inspector (after G1 and G2)

**Files:**
- Modify: `src/components/McpServerDetail.tsx` (its "Registered in" rows), its tests, the Design system specimen registry, `.claude/DESIGN.md`
- Create: `src/components/EngineSwitch.tsx` only if G2's layout needs a shared control with a second caller (Task 11); otherwise the control stays in the row.

**Interfaces:**
- Consumes: `get_engine_context`, `set_mcp_server_enabled`, `undo_mcp_switch`.

- [ ] **Step 1: Write the failing tests**, with fixtures captured from a real `get_engine_context` reply: each registration row shows its state; a switchable row's control calls `set_mcp_server_enabled` with that row's key and disables itself while pending; a read-only row shows G1's sentence for its reason and no control; after a switch, G1's Undo affordance calls `undo_mcp_switch` with the reply's `receipt_id`; a refusal shows G1's sentence and the state does not flip; nothing claims a state before the first reply lands.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; all four gates.
- [ ] **Step 5: Commit** `feat(mcp): switch a server off for one engine from its inspector`.

### Task 11: The Engines rail section and its Context view (after G1 and G2)

**Files:**
- Create: `src/components/EnginesPane.tsx`, `src/components/EngineContextView.tsx`, their tests
- Modify: `src/components/IconRail.tsx`, `src/App.tsx`, `src/utils/screenName.ts`, `src-tauri/src/telemetry.rs` (`SCREENS` gains `"engines"`), the specimen registry, `.claude/DESIGN.md`
- Test: `src/__tests__/icon_rail.test.tsx`, `src/utils/screenName.test.ts`, `src-tauri/tests/telemetry_session_tests.rs`

- [ ] **Step 1: Write the failing tests** — the rail entry selects `"engines"`; the list shows every engine `get_mcp_engine_summary` returns, by backend name; an engine's Context view shows the budget from `on_tokens_measured`, the coverage line from `measured_on_count` and `on_count`, and one row per item with its switch and cost; an unmeasured row shows G1's "Not measured"; "Measure all" calls `measure_engine_context` and disables itself while pending; `applies` renders G1's sentence, and nothing when it is `None`; no `.length` stands in for a count.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** to G2's layout. **Step 4: Run** → PASS; all four gates.
- [ ] **Step 5: Commit** `feat(engines): a rail section that shows what each engine loads and what it costs`. The telemetry allowlist change is named in the body.

### Task 12: ⌘K actions (after G1)

- [ ] Read how the palette registers actions today before specifying this; the plan does not guess its shape. Then add "switch `<server>` off for `<engine>`" and its opposite, with tests that the action calls `set_mcp_server_enabled` with the same arguments the inspector does. Commit `feat(search): switch a server from the palette`.

### Task 13: Prove it in the running app

- [ ] **Step 1:** Per-kind asset counts before and after the whole slice (`shared-asset-machinery.md` query). They must be identical: this slice changes no asset.
- [ ] **Step 2:** In the dev app (`verifying-ui.md`), on Karthik's real Codex config and with his go-ahead for that one write: `codex mcp list` before; switch one server off in Hanger; `codex mcp list` after shows `disabled`; `diff` of the backup against the file shows one line; Undo; `codex mcp list` and `shasum` show the original bytes back.
- [ ] **Step 3:** The same for Gemini CLI (`gemini mcp list`) and Claude Code (`claude mcp list`).
- [ ] **Step 3a: OpenCode** (ruling 15), with Karthik's go-ahead and outside a moment when losing this session's servers would matter: copy `~/.config/opencode/opencode.json`, set `"enabled": false` on one server, `opencode reload`, `opencode mcp list`, restore the bytes, confirm the hash. If the server reads as off, add OpenCode's `SWITCHES` row in its own commit; if the result is ambiguous, report it and leave OpenCode read-only.
- [ ] **Step 3b: When a change applies** (ruling 19). For each switchable engine, in a real signed-in session: switch a server off and note whether the running session still lists it. Set `applies` only for what was seen.
- [ ] **Step 4:** Screenshots: the inspector switch, the Engines Context view with its budget and coverage line, a read-only row with its reason.
- [ ] **Step 5:** Build the app, open it from Finder, and switch one Claude Code server off and on. Only a Finder launch proves the CLI is found without a terminal's PATH.
- [ ] **Step 6:** Report to Karthik with the evidence. He closes the slice.

---

## Later slices (outlines; each gets its own plan when it is next)

2. **Per-project overrides** of global servers: Claude Code's per-project lists, a project picker.
3. **Add, remove, and add from the MCP Registry with a pinned version;** plaintext secrets and unpinned packages as Needs review findings.
4. **Profiles,** and the backup and restore UI over the receipts this slice writes.
5. **Skills** off, on, update and install through `gh skill`; then Claude plugins, marketplaces, hooks and cache. Skill descriptions join the budget.
6. **The gateway:** mid-session switching through `tools/list_changed`.

Then engine status for the CLIs (`docs/plans/2026-11-24-tool-manager-phase-a.md`, less its Tasks 2–3, which this plan builds), the apps, and phase B's agent.

## Out of scope for this slice

- Writing `~/.claude.json` directly, or any key an engine was not shown to honour.
- Starting or stopping a running server. A switch changes what the next session loads.
- Probing without being asked.
- Adding or removing a server declaration (slice 3), except the remove-and-restore that is Claude Code's off and on.
