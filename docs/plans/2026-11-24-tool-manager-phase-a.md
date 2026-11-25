# Engine Status (Phase A, Slice 1: the CLIs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hanger reports each installed agent CLI as a managed object (installed, version, update available and its command, sign-in, settings files), in a rail section of its own, with two Needs review findings.

**Architecture:** A new Rust module, `engine_status`, holds a static table of the four CLIs keyed to `AGENT_CONFIGS` ids. It resolves each binary through the user's login-shell PATH, runs `--version` and the vendor's own auth status command under a timeout, looks up the latest version on the npm registry daily, and reads settings files through a redactor. Three IPC commands expose it. The webview adds one screen, its inspector, and two issue kinds in `deriveReviewIssues`.

**Tech Stack:** Rust (tokio `Command`, `reqwest` 0.12, `serde_json`, `toml` 0.8 — all already in `Cargo.toml`), React 19 + TypeScript, Vitest, `cargo test` integration tests under `src-tauri/tests/`.

**Spec:** the decisions below, ruled by Karthik on 2026-11-24 in a grilling session. No other spec document exists; this section is it.

## Decisions (ruled 2026-11-24)

1. Hanger manages the coding tools themselves (phase A) and gains write operations on assets later (phase B). It works beside T3 Code, Conductor and VS Code and never runs agents in phase A.
2. In scope: agent CLIs and agent IDEs/apps, agent side only — never editor extensions or themes. Orchestrators (T3 Code, Conductor, Monocode) are not modelled.
3. Updates: check the latest version daily and on a manual refresh; show "update available" and the command that would run it; never run it. A preference turns checks off.
4. Sign-in: only the tool's own read-only status command. Keep the verdict and the method, never a token. No command → "Not reported". Never read credential files, app storage or the Keychain.
5. Settings: list each tool's settings files (path, exists, modified, Open in editor) and show them read-only with secrets masked. No per-tool parsing of settings values.
6. UI: a new rail section of its own — list on the left, detail on the right.
7. Needs review: "not signed in" and "settings file unreadable" are findings. "Update available" is a badge on the tool and on its rail entry, never a finding. "Not reported" and "not installed" are never findings.
8. Slices: **this plan is slice 1, the four CLIs** — Claude Code, Codex, Gemini CLI, OpenCode. Slice 2 (the apps) gets its own plan.
9. `docs/harness.md` drops its "four kinds, no more" premise in the same commit that introduces the engine model.

Facts measured on 2026-11-24 (Karthik's machine; existence proofs, not a sample):

| CLI | binary resolves to | `--version` prints | status command → output | npm package (latest that day) |
|---|---|---|---|---|
| Claude Code | `~/.local/share/claude/versions/2.1.330` (native) | `2.1.330 (Claude Code)` | `claude auth status` → JSON with `loggedIn`, `authMethod` | `@anthropic-ai/claude-code` (2.1.331) |
| Codex | `~/.npm-global/lib/node_modules/@openai/codex/…` (npm) | `codex-cli 0.171.0` | `codex login status` → `Logged in using ChatGPT` | `@openai/codex` (0.172.0) |
| Gemini CLI | `~/.bun/install/global/node_modules/@google/gemini-cli/…` (bun) | `0.56.0` | none found | `@google/gemini-cli` (0.71.1) |
| OpenCode | `~/.bun/install/global/node_modules/opencode-ai/…` (bun) | `1.18.21` | `opencode auth list` → `… 0 credentials` | `opencode-ai` (1.19.6) |

Settings files present that day: `~/.claude/settings.json`, `~/.codex/config.toml`, `~/.gemini/settings.json`, `~/.config/opencode/opencode.json`.

## Human gates

- **G1 — naming brief** (`ui-copy.md`): the rail label, the screen title, the Needs review category name, and the strings "Not reported", "Update available", "Not signed in", "Settings file unreadable". Brief written to `docs/plans/2026-11-24-engine-status-naming-brief.md`, every string through `/humanizer`, Karthik signs off. Blocks Tasks 8–10.
- **G2 — layout options** (memory: design options before building): two or three layouts of the pane and inspector rendered at true width in real tokens; Karthik picks. Blocks Task 9.

Tasks 1–7 (backend and IPC) proceed without either gate.

## Global Constraints

- Code noun is **engine** (`ui-copy.md`); internal ids: Rust module `engine_status`, screen id `"engines"`, telemetry screen `"engines"`. Never `tools` — that word means MCP servers in code (`IssueCategory` `"Tools"`, `selectedSidebarItem.endsWith(":Tools")` in `src/App.tsx`).
- Every user-facing string waits for G1. Until then use the brief's working strings only behind the gated tasks.
- Counts come from the backend (`invariants.md`); the pane renders what IPC gives it. `no-frontend-counting.test.ts` must stay green without new allowlist entries.
- Engine names reach the UI from the backend (`no-hardcoded-engine-copy.test.ts`).
- Styling: semantic tokens only; type roles from `src/components/typeRoles.ts`; icons via `strokeFor(box)`.
- Never block the webview: no `window.confirm/alert/prompt`.
- No credential value, token, or account email ever crosses IPC, lands in SQLite, or is logged.
- Every child process: absolute program path, `kill_on_drop(true)`, 5 s timeout, stdin null, no shell interpolation of arguments.
- Network: only `https://registry.npmjs.org/<package>/latest`, 10 s timeout, no headers beyond reqwest defaults, nothing about the machine in the request.
- No schema migration: cached latest versions live in `preferences` (key/value), not a new table.
- Gates per task, from the repo root unless stated: `npx vitest run`; `cargo test` (from `src-tauri/`); `bunx tsc --noEmit`; both `gitleaks` runs. `cargo test` relaunches a running dev app (`verifying-ui.md`).
- Commit with explicit paths only if no peer session shares the checkout; otherwise follow `shared-checkout.md`.

## Review Focus

1. **Hanger launched from Finder.** A GUI process inherits `/usr/bin:/bin:/usr/sbin:/sbin`, so `claude` in `~/.local/bin` and `codex` in a custom npm prefix are invisible. Expected: each CLI is found exactly as the user's terminal finds it. Pinned in Task 2 by `resolves_through_login_shell_path_when_process_path_is_minimal`.
2. **A status or version command hangs or prompts** (first-run onboarding, a network stall). Expected: after 5 s the child is killed and that field is "Not reported"; the other three engines are unaffected. Pinned in Task 3 by `a_hung_command_times_out_and_reports_nothing`.
3. **`claude auth status` prints the account email and organisation.** Expected: neither leaves Rust. Pinned in Task 4 by `auth_state_never_carries_email` and in Task 7 by the IPC boundary test.
4. **Offline, or the registry answers 404/500.** Expected: the last cached latest version and its check time stay on screen; no badge flips, no finding, no crash. Pinned in Task 5 by `a_failed_check_keeps_the_previous_cache`.
5. **Two installs of one CLI** (npm and native `claude` both present). Expected: Hanger reports the one the login shell runs first, with that install's method and update command. Pinned in Task 2 by `the_first_path_entry_wins`.

---

### Task 1: The engine CLI table, and harness.md's premise

**Files:**
- Create: `src-tauri/src/engine_status/mod.rs`, `src-tauri/src/engine_status/registry.rs`
- Modify: `src-tauri/src/lib.rs` (add `pub mod engine_status;` beside the other `pub mod` lines), `docs/harness.md` ("What it is", and a new section "Engines as managed objects")
- Test: `src-tauri/tests/engine_status_tests.rs`

**Interfaces:**
- Produces:
  ```rust
  pub enum AuthProbe { ClaudeJson, CodexText, OpenCodeList }
  pub struct EngineCli {
      pub engine_id: &'static str,        // an AGENT_CONFIGS id
      pub bin: &'static str,              // "claude", "codex", "gemini", "opencode"
      pub npm_package: &'static str,
      pub auth: Option<(&'static [&'static str], AuthProbe)>, // argv after bin
      pub settings_files: &'static [&'static str],            // home-relative
  }
  pub const ENGINE_CLIS: &[EngineCli];
  ```
  Values exactly as the facts table: auth argv `["auth","status"]`, `["login","status"]`, none, `["auth","list"]`; settings files `.claude/settings.json`, `.codex/config.toml`, `.gemini/settings.json`, `.config/opencode/opencode.json`.

- [ ] **Step 1: Write the failing tests** — `every_engine_cli_names_an_agent_config` (each `engine_id` is an `AGENT_CONFIGS` id), `engine_cli_ids_are_unique`, `slice_one_is_exactly_the_four_clis` (ids equal `["claude-code","codex","gemini","opencode"]`).
- [ ] **Step 2: Run** `cargo test --test engine_status_tests` from `src-tauri/` → FAIL, unresolved module.
- [ ] **Step 3: Implement** the table. `engine_status/mod.rs` declares the submodules this plan adds; at this task only `registry`.
- [ ] **Step 4: Rewrite `docs/harness.md` "What it is"**: the harness is the four asset kinds *and the engines that read them*; engines are managed objects (installed, version, update, sign-in, settings) and are not a fifth asset kind. Cite `engine_status::registry` → `ENGINE_CLIS` by symbol, not line.
- [ ] **Step 5: Run** the test → PASS; run all four gates.
- [ ] **Step 6: Commit** `feat(engines): the four agent CLIs become a table Hanger can manage` with the test, module, `lib.rs` and `docs/harness.md`.

### Task 2: Find the binary the user's terminal would run

**Files:**
- Create: `src-tauri/src/engine_status/resolve.rs`
- Modify: `src-tauri/src/mcp/probe.rs` (`widened_path` becomes `pub(crate)`; body unchanged — MCP probing is not touched)
- Test: `src-tauri/tests/engine_status_tests.rs`

**Interfaces:**
- Produces:
  ```rust
  pub enum InstallMethod { Native, Npm, Bun, Homebrew, Unknown }
  pub fn search_path() -> String;                       // login-shell PATH, then widened_path(); cached in a OnceLock
  pub fn resolve_in(bin: &str, path: &str) -> Option<PathBuf>;   // first executable hit, symlinks followed
  pub fn install_method(resolved: &Path, home: &Path) -> InstallMethod;
  pub fn update_command(cli: &EngineCli, method: InstallMethod) -> Option<String>;
  ```
- `search_path`: run `$SHELL -l -c 'printf %s "$PATH"'` (fallback `/bin/zsh`) once, 5 s timeout; on any failure use `widened_path()` alone.
- `install_method` by the canonicalised path: under `<home>/.local/share/claude/` → `Native`; contains `/.bun/install/global/` → `Bun`; contains `/lib/node_modules/` → `Npm`; under `/opt/homebrew/Cellar/` or `/usr/local/Cellar/` → `Homebrew`; else `Unknown`.
- `update_command` strings: Native → `claude update`; Npm → `npm install -g <pkg>@latest`; Bun → `bun add -g <pkg>@latest`; Homebrew → `brew upgrade <bin>`; Unknown → `None`.

- [ ] **Step 1: Write the failing tests** (temp dirs with fake executables, never the real home):
  - `the_first_path_entry_wins` — two dirs both holding `claude`; `resolve_in` returns the first.
  - `resolves_through_login_shell_path_when_process_path_is_minimal` — `resolve_in("claude", "<tmp>/a:/usr/bin")` finds `<tmp>/a/claude` while `PATH=/usr/bin` for the test process.
  - `a_non_executable_file_is_not_a_hit` (mode 0644 skipped).
  - `install_method_classifies_each_measured_layout` — the four paths from the facts table, rebased under a temp home, map to Native, Npm, Bun, Bun.
  - `update_command_per_method` — exact strings above for Codex/Npm, Gemini/Bun, Claude/Native, and `None` for Unknown.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** `resolve_in` follows symlinks with `fs::canonicalize` only for `install_method`; it returns the PATH entry, not the target.
- [ ] **Step 4: Run** → PASS; all four gates.
- [ ] **Step 5: Commit** `feat(engines): find each CLI the way the user's terminal does`.

### Task 3: Installed version, under a timeout

**Files:**
- Create: `src-tauri/src/engine_status/version.rs`
- Test: `src-tauri/tests/engine_status_tests.rs`

**Interfaces:**
- Consumes: `resolve::search_path`, `resolve::resolve_in`.
- Produces:
  ```rust
  pub const COMMAND_TIMEOUT: Duration = Duration::from_secs(5);
  pub async fn run_capture(program: &Path, args: &[&str], path_env: &str) -> Option<String>; // stdout, None on timeout/non-zero/spawn error
  pub fn parse_version(stdout: &str) -> Option<String>;   // first token matching \d+\.\d+\.\d+(-[0-9A-Za-z.]+)?
  pub fn is_newer(latest: &str, installed: &str) -> Option<bool>; // numeric major.minor.patch; None if either is unparseable
  ```
- `run_capture` uses tokio `Command` with `stdin(Stdio::null())`, `kill_on_drop(true)`, `env("PATH", path_env)`, wrapped in `tokio::time::timeout(COMMAND_TIMEOUT, …)`.

- [ ] **Step 1: Write the failing tests:**
  - `parse_version_reads_each_measured_output` — `"2.1.330 (Claude Code)"`→`2.1.330`, `"codex-cli 0.171.0"`→`0.171.0`, `"0.56.0"`→`0.56.0`, `"1.18.21"`→`1.18.21`, `"no version here"`→`None`.
  - `is_newer_compares_numerically` — `("0.71.1","0.56.0")`→`Some(true)`, `("2.1.330","2.1.330")`→`Some(false)`, `("1.10.0","1.9.9")`→`Some(true)`, `("nightly","1.0.0")`→`None`.
  - `a_hung_command_times_out_and_reports_nothing` — a temp script `sleep 30`; `run_capture` returns `None` in under 7 s.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** `is_newer` ignores pre-release suffixes for ordering — `shortcut: pre-release builds compare equal to their release, upgrade to the semver crate if a CLI ships pre-releases on its latest tag`.
- [ ] **Step 4: Run** → PASS; all four gates.
- [ ] **Step 5: Commit** `feat(engines): read each CLI's version without waiting on a stuck one`.

### Task 4: Sign-in, from the vendor's own answer

**Files:**
- Create: `src-tauri/src/engine_status/auth.rs`
- Test: `src-tauri/tests/engine_status_tests.rs`

**Interfaces:**
- Consumes: `version::run_capture`, `registry::AuthProbe`.
- Produces:
  ```rust
  #[derive(Serialize)] #[serde(tag = "state", rename_all = "snake_case")]
  pub enum AuthState { SignedIn { method: Option<String> }, SignedOut, NotReported }
  pub fn parse_auth(probe: AuthProbe, stdout: &str) -> AuthState;
  ```
- Parsing rules: `ClaudeJson` — `loggedIn: true` → `SignedIn { method: authMethod }`, `false` → `SignedOut`, unparseable → `NotReported`; **read only those two keys**. `CodexText` — `Logged in using X` → `SignedIn { method: Some(X) }`, a line starting `Not logged in` → `SignedOut`, else `NotReported`. `OpenCodeList` — `N credentials` with N > 0 → `SignedIn { method: Some("N credentials") }`; N = 0 → `NotReported` (OpenCode runs on environment keys and free models with no stored credential, so zero is not "signed out"). No probe → `NotReported`.

- [ ] **Step 1: Write the failing tests:**
  - `claude_json_signed_in` / `claude_json_signed_out` with fixtures in `src-tauri/tests/fixtures/engine_status/`.
  - `auth_state_never_carries_email` — the signed-in Claude fixture includes `"email":"someone@example.com"` and `"orgName":"Acme"`; `serde_json::to_string(&parse_auth(..))` contains neither string.
  - `codex_text_variants` — `Logged in using ChatGPT`, `Logged in using an API key`, `Not logged in`, empty.
  - `opencode_zero_credentials_is_not_reported` and `opencode_two_credentials_is_signed_in`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `parse_auth`. The raw stdout is dropped after parsing and never logged.
- [ ] **Step 4: Run** → PASS; all four gates.
- [ ] **Step 5: Commit** `feat(engines): sign-in state comes only from each CLI's status command`.

### Task 5: Latest version — daily, on demand, cached, switchable off

> **Amended 2026-11-25 (Karthik, Q10 of `2026-11-25-t3-code-review.md`):** a native Claude Code install gets no "update available" badge from npm. It updates itself, and npm's latest can be ahead of its `stable` channel, so a badge would offer an update `claude update` won't install. npm stays the source for npm installs. Q11 keeps this plan's light path: five install layouts, and each CLI's own status command for sign-in.

**Files:**
- Create: `src-tauri/src/engine_status/latest.rs`
- Modify: `src-tauri/src/lib.rs` (`setup`: start the daily loop beside `updates::spawn_background_checks`)
- Test: `src-tauri/tests/engine_status_tests.rs`

**Interfaces:**
- Produces:
  ```rust
  pub const CHECK_INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);
  pub const PREF_CHECKS: &str = "engine_update_checks";         // "on" (default when absent) | "off"
  pub fn cache_key(engine_id: &str) -> String;                   // "engine_latest:<id>"
  #[derive(Serialize, Deserialize)] pub struct LatestCache { pub version: String, pub checked_at_ms: i64 }
  pub fn registry_url(package: &str) -> String;                  // https://registry.npmjs.org/<package>/latest, '/' in scoped names kept
  pub fn parse_registry(body: &str) -> Option<String>;           // the "version" field
  pub async fn check_all(store: &PreferencesStore, base_url: &str, force: bool) -> ();
  pub fn spawn_daily(app: AppHandle);
  ```
- `check_all`: skips everything when `PREF_CHECKS == "off"`; per engine, skips when `!force` and the cache is younger than `CHECK_INTERVAL`; on success writes `LatestCache`; on any failure leaves the previous cache untouched. `base_url` exists so tests point it at a local server.
- `spawn_daily`: a check at launch, then `tokio::time::interval(CHECK_INTERVAL)`, mirroring `updates::spawn_background_checks`.

- [ ] **Step 1: Write the failing tests** (a `tokio::net::TcpListener` stub server on 127.0.0.1, a temp `PreferencesStore` (`preferences.rs`)):
  - `registry_url_keeps_the_scope` — `@openai/codex` → `https://registry.npmjs.org/@openai/codex/latest`.
  - `a_fresh_cache_is_not_rechecked` — cache 1 h old, `force=false`, stub never hit.
  - `force_rechecks_a_fresh_cache`.
  - `a_failed_check_keeps_the_previous_cache` — stub answers 500; the cache keeps its version and `checked_at_ms`.
  - `checks_off_means_no_request` — `PREF_CHECKS = "off"`, `force=true`, stub never hit.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** `reqwest::Client::builder().timeout(10 s)`; errors are logged through the existing `dispatch_error_line` so no URL query leaks.
- [ ] **Step 4: Run** → PASS; all four gates.
- [ ] **Step 5: Commit** `feat(engines): check each CLI's latest version once a day`.

### Task 6: Settings files — located, validated, redacted

**Files:**
- Create: `src-tauri/src/engine_status/settings.rs`
- Modify: `src-tauri/src/mcp/redact.rs` only if `looks_secret` must widen to `pub(crate)` use from this module (it already is `pub(crate)`; no change expected)
- Test: `src-tauri/tests/engine_status_tests.rs`

**Interfaces:**
- Consumes: `mcp::redact::looks_secret`.
- Produces:
  ```rust
  #[derive(Serialize)] #[serde(rename_all = "snake_case")]
  pub enum SettingsHealth { Missing, Ok, Unreadable }
  #[derive(Serialize)] pub struct SettingsFile { pub path: String, pub health: SettingsHealth, pub modified_ms: Option<i64> }
  pub fn inspect(home: &Path, rel: &str) -> SettingsFile;        // Unreadable = exists but read fails, or not valid JSON/TOML by extension
  pub fn redacted_text(home: &Path, rel: &str) -> Result<String, SanitisedError>;
  ```
- Redaction rule (line-based, format-agnostic): on a line holding a `key = value` or `"key": value` pair, mask the value as `"••••"` when `looks_secret(key)` is true, or when the value is a quoted string of 20+ characters with no whitespace that is not a path or URL. `looks_secret` is the shared predicate (`invariants.md`: the redactors share predicates); do not copy `SECRET_WORDS`.
- `redacted_text` accepts only a `rel` that appears in `ENGINE_CLIS`' `settings_files` — any other path returns an error. This is the trust boundary.

- [ ] **Step 1: Write the failing tests:**
  - `missing_ok_unreadable` — absent file → `Missing`; valid JSON → `Ok` with `modified_ms`; `{"broken": ` → `Unreadable`; valid TOML → `Ok`; invalid TOML → `Unreadable`.
  - `redacts_secret_keys_in_json_env_block` — `"ANTHROPIC_API_KEY": "sk-ant-xyz"` and `"GITHUB_TOKEN": "ghp_abc"` masked; `"model": "opus"` untouched.
  - `redacts_secret_keys_in_toml` — `api_key = "abc"` masked; `model = "gpt-5"` untouched.
  - `redacts_long_opaque_values_under_innocent_keys` — a 20-character upper-case alphanumeric value under the key `"x"` is masked (the test builds that value by concatenation, so no key-shaped literal sits in the tree for `gitleaks` to find); `"cwd": "/Users/a/very/long/path/name"` and `"url": "https://example.com/abc"` untouched.
  - `refuses_a_path_outside_the_table` — `redacted_text(home, "../.ssh/id_rsa")` and `".zshrc"` are errors.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; all four gates.
- [ ] **Step 5: Commit** `feat(engines): show each CLI's settings files with secrets masked`.

### Task 7: IPC — three commands, narrowed types, docs

**Files:**
- Create: `src/types/engineStatus.ts`, `src-tauri/src/engine_status/status.rs`
- Modify: `src-tauri/src/lib.rs` (`generate_handler!`), `docs/ipc.md` (three numbered entries in its existing format), `README.md` (regenerate the `ipc` region: `~/.bun/bin/bun run src/__tests__/readmeCounts.ts`)
- Test: `src-tauri/tests/engine_status_tests.rs`, `src-tauri/tests/ipc_boundary_tests.rs`

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces (Rust, `#[tauri::command]`):
  ```rust
  async fn get_engine_status(app: AppHandle) -> Result<EngineStatusReply, String>;
  async fn refresh_engine_versions(app: AppHandle) -> Result<EngineStatusReply, String>; // check_all(force = true), then status

  #[derive(Serialize)] pub struct EngineStatusReply { pub engines: Vec<EngineStatus>, pub update_count: u32 } // the rail badge number, counted in Rust
  fn get_engine_settings_text(engine_id: String, rel_path: String) -> Result<String, String>;

  #[derive(Serialize)] pub struct EngineStatus {
      pub engine_id: String, pub name: String,           // name from AGENT_CONFIGS
      pub installed: bool, pub bin_path: Option<String>,
      pub version: Option<String>, pub install_method: InstallMethod,
      pub latest: Option<LatestCache>, pub update_available: bool,   // is_newer == Some(true); false otherwise
      pub update_command: Option<String>,                // Some only when update_available
      pub auth: AuthState, pub settings: Vec<SettingsFile>,
  }
  ```
- TypeScript in `src/types/engineStatus.ts` mirrors it with `AuthState` as a discriminated union on `state`. Narrow at the boundary (`verification.md`, "A fixture built from the type"): `update_command` is typed `string | null` and fixtures must come from a captured `get_engine_status` reply.
- Status for the four engines is gathered concurrently (`futures::join_all` or `tokio::join!`), so one stuck CLI costs 5 s total, not 20.

- [ ] **Step 1: Write the failing tests:**
  - `status_for_a_missing_engine_is_not_installed_and_not_reported` (temp home, empty search path): `installed=false`, `auth=NotReported`, `update_available=false`.
  - In `ipc_boundary_tests.rs`, `engine_status_never_carries_a_secret_or_email` — build an `EngineStatus` from the Task 4 email fixture and a settings file holding `sk-ant-xyz`; the serialised JSON contains neither the email nor `sk-ant-xyz`.
  - `settings_text_command_refuses_unknown_paths`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** and register the commands; update `docs/ipc.md`; regenerate README.
- [ ] **Step 4: Run** → PASS; all four gates (`readme-sync.test.ts` proves the regenerated region).
- [ ] **Step 5: Commit** `feat(engines): expose engine status to the webview`.

### Task 8: Rail entry, screen id, telemetry (after G1)

**Files:**
- Modify: `src/components/IconRail.tsx`, `src/utils/screenName.ts` (`engines: "engines"`), `src-tauri/src/telemetry.rs` (`SCREENS` grows to 7 with `"engines"`; update its doc comment's "six"), `src/App.tsx` (route `selectedSidebarItem === "engines"`), `src/utils/screenName.ts`'s header comment ("Six fixed names" → seven)
- Test: `src/__tests__/icon_rail.test.tsx`, `src/utils/screenName.test.ts`, `src-tauri/tests/telemetry_session_tests.rs` (pins the screen allowlist)

**Interfaces:**
- Consumes: G1's rail label; `EngineStatus.update_available` for the rail badge.
- Produces: `IconRail` prop `engineUpdateCount: number`, taken from `EngineStatusReply.update_count` — never `.filter().length` in the webview.

- [ ] **Step 1: Write the failing tests** — the rail renders the entry with G1's label; clicking sets `selectedSidebarItem` to `"engines"`; the badge shows when `engineUpdateCount > 0` and is absent at 0; `screenNameFor("engines") === "engines"`; Rust `SCREENS` contains `"engines"` and has length 7.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; all four gates.
- [ ] **Step 5: Commit** `feat(engines): a rail section of its own`. The telemetry allowlist change is named in the body (`verification.md`: forced edits to a control are reported).

### Task 9: The pane and its inspector (after G1 and G2)

**Files:**
- Create: `src/components/EnginesPane.tsx`, `src/components/EngineInspector.tsx`, their tests
- Modify: `src/App.tsx` (render both for `"engines"`; a Settings row for `engine_update_checks`, on by default, beside `EditorSetting` at the existing settings site), the Design system specimen registry so `design-system-coverage.test.ts` sees both components, `.claude/DESIGN.md` (a Panes entry)

**Interfaces:**
- Consumes: `get_engine_status`, `refresh_engine_versions`, `get_engine_settings_text`, `openInEditor(path, editorName)` from `src/openInEditor.ts`, G2's chosen layout.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the failing tests** from a captured `get_engine_status` reply: list shows the four names in table order; an engine with `update_available` shows the badge and its `update_command` as copyable text; `installed=false` shows the G1 "not installed" string and no finding styling; `auth.state === "not_reported"` shows G1's "Not reported"; the settings section lists each file with Open in editor and renders `get_engine_settings_text` read-only; Refresh calls `refresh_engine_versions` and disables itself while pending; the Settings row writes `engine_update_checks` = `"off"` via `set_preference` and back to `"on"`; no assertion of absence renders before the first reply lands (`ui-copy.md`: pending is not a finding).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** to G2's layout, tokens and type roles only, every component with a specimen.
- [ ] **Step 4: Run** → PASS; all four gates.
- [ ] **Step 5: Commit** `feat(engines): the engines pane and inspector`.

### Task 10: Needs review findings (after G1)

**Files:**
- Modify: `src/utils/reviewIssues.ts` (`IssueKind` gains `"signed_out" | "settings_unreadable"`; `IssueCategory` gains G1's category name), `src/App.tsx` (pass engine status into `deriveReviewIssues`), `src/components/NeedsReviewPane.tsx` / `ReviewSidebar.tsx` only as far as the new category needs
- Test: `src/utils/reviewIssues.test.ts`, `src/__tests__/needs_review_pane.test.tsx`

**Interfaces:**
- Consumes: `EngineStatus[]`.
- Produces: `deriveReviewIssues(inventory, engines?: EngineStatus[])` — existing callers unchanged.

- [ ] **Step 1: Write the failing tests:** `auth.state === "signed_out"` on an installed engine → one `signed_out` issue; `settings[].health === "unreadable"` → one `settings_unreadable` issue per file; `update_available`, `not_reported`, `installed=false`, `health === "missing"` → no issues; existing review tests unchanged and green.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**, accumulating counts in loops as the file's header requires.
- [ ] **Step 4: Run** → PASS; all four gates.
- [ ] **Step 5: Commit** `feat(engines): signed-out and unreadable settings become findings`.

### Task 11: Prove it in the running app

**Files:** none committed except evidence notes Karthik asks for.

- [ ] **Step 1:** Capture per-kind counts before (`shared-asset-machinery.md` query). After everything lands, capture again: every category must be identical — this slice claims no asset change.
- [ ] **Step 2:** Run the dev app per `verifying-ui.md` (dev pid, `tauri-app` owner, window ≥ 900×600, theme named). Capture: the rail with the badge; the pane with all four engines; Gemini CLI's update row (0.56.0 → latest that day) with its `bun add -g @google/gemini-cli@latest` command; Codex sign-in "via ChatGPT"; one settings file open read-only with a masked value.
- [ ] **Step 3:** Launch the **built** app from Finder (`bun run tauri build`, open the `.app`) and confirm all four engines still resolve — Review Focus 1 cannot be proven from `tauri dev`, which inherits the terminal's PATH.
- [ ] **Step 4:** Report to Karthik with the evidence. He closes the slice; automation does not.
