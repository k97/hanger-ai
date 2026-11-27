# T19 Engine Status (the five CLIs, on the overview card) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Reconciled 2026-11-28** after the `--plan` review (`docs/reviews/2026-11-28-plan-2026-11-28-t19-engine-status-plan.md`), applying `docs/plans/research/2026-11-28-reconciliation-rulings.md` R5 (this plan owns `engine_status` and the card, lists `engine_status::auth::{parse_auth, AuthState}` as produced for P8, and edits `src/utils/reviewIssues.ts` before P3, which rebases) and the P7 fixes: Tasks 9 and 10 stage `App.tsx` as an exact blob and then run a bare `git commit`; the install check tests `Cellar` and `Caskroom` before `node_modules`, with a real Homebrew layout fixture; Task 1's plant is `"cursor"`; `docs/telemetry.md` gains a paragraph naming the daily npm request and its off switch, beside `docs/ipc.md`. The review's mechanical findings are fixed in place. Shared names: `docs/plans/research/2026-11-28-cross-plan-interfaces.md`.

**Goal:** For each of five engine CLIs (Claude Code, Codex, Gemini CLI, Antigravity CLI, OpenCode), Hanger reports installed version, whether its channel has a newer one and the command that would install it, sign-in as the CLI itself reports it, and where its settings file is. The overview card's engine section shows these as Status rows, and two of them become Needs review findings.

**Architecture:** `engine_status` gets a static table, `ENGINE_CLIS`, keyed to `AGENT_CONFIGS` ids, plus pure functions for versions, install method, channel and update command. Those land first because P5 and P8 build on them. Behind the table: per-CLI sign-in parsers that read the vendor's own status command through the existing `run::run_capture`, a settings-file inspector that never reads content, and a once-a-day npm dist-tags check cached in `preferences`. One IPC command, `get_engine_status`, sits beside `get_engine_contexts` and returns a sibling reply keyed by engine id. `EngineContext` is not widened. The webview draws Status rows in `OverviewCard`'s engine section to the layout chosen in the combined card round, and maps two verdicts to findings in `deriveReviewIssues`.

**Tech Stack:** Rust (tokio, `reqwest` 0.12, `serde_json`, all in `Cargo.toml` already; no new crate), React 19 + TypeScript, Vitest, `cargo test` integration tests under `src-tauri/tests/`.

**Spec:** `docs/plans/2026-11-28-harness-design.md`: §4.7, §5 (owner table: `engine_status` and the overview card), §7 (waves, gates), and the binding Answers of round 43. Research: `docs/plans/research/2026-11-28-t19-engine-status.md` (option A). Where those and the code disagree, the code is the fact. The disagreements are listed under "Where the spec, research and code disagree".

## What this replaces in `2026-11-24-tool-manager-phase-a.md`

This plan replaces the old plan's stale parts. Task 1 adds a superseded banner to the top of the old plan.

| Old part | Fate here |
|---|---|
| Decisions 1–5, 7 | **Survive.** Decision 3 is narrowed by the fixed values: a native Claude install is compared to its own channel. Decision 5 keeps path, health, modified time and Open in editor. The masked settings viewer belongs to research option B and is deferred, because option A shows no file content at all. |
| Decision 6 (rail section) | **Superseded.** Status rows go on the card's engine section (Engines is a lens on Global). |
| Decision 8 (exactly four CLIs) | **Superseded.** There are five CLIs; Antigravity CLI (`agy`) is added. Apps come later (direction note). |
| Decision 9 (harness.md premise) | **Reworded.** "Four kinds, no more" stays true. `docs/harness.md` gains a short section: engines are managed objects, not a fifth kind (Task 1). |
| Facts table | **Superseded** by this plan's table (Task 1). |
| The 2026-11-25 amendment to Task 5 (no badge for native Claude) | **Superseded** by the fixed value: compare to the install's channel. |
| G1 naming brief | **Survives, narrowed** (Task 3). The rail label and screen title are gone. |
| G2 layout | **Superseded** by the combined card layout round (Task 4). |
| Task 1 (table) | **Survives** as Task 1, with five rows, `@opencode/cli`, and version parsing folded in. |
| Task 2 (resolve) | Resolver **built** (`resolve::search_path`, `resolve_in`). `install_method` and `update_command` move to Task 2. |
| Task 3 (run_capture, version) | `run_capture` **built**, with a different signature that is now frozen. `parse_version` and `is_newer` move to Task 1. |
| Task 4 (auth) | **Survives** as Task 5, corrected for OpenCode argv and for signed-out exit codes. |
| Task 5 (latest) | **Survives** as Task 7: dist-tags endpoint, a 24 h cache age checked every 6 h, and the off preference. |
| Task 6 (settings) | **Survives in part** as Task 6. It inspects only; redaction and the text viewer are deferred with option B. |
| Task 7 (IPC, three commands) | **Superseded** by Task 8: one command beside `get_engine_contexts`, no rail count. |
| Task 8 (rail entry, `SCREENS` to 7) | **Deleted.** `SCREENS` and telemetry do not change. |
| Task 9 (EnginesPane, EngineInspector) | **Superseded** by Task 9: Status rows inside `OverviewCard`. |
| Task 10 (findings) | **Survives** as Task 10. |
| Task 11 (proof) | **Survives** as Task 11. |

## Where the spec, research and code disagree (code and measurement win)

Measured 2026-11-28. Any CLI run used a throwaway `HOME`; no credential file was read.

1. **Two OpenCode installs; the login shell runs the other one.** `zsh -l -i` puts `~/.opencode/bin` (OpenCode's own installer, `opencode v2.4.2`, a Mach-O binary) ahead of `~/.bun/bin` (`@opencode/cli` via bun, `opencode v2.4.1`). The research saw only the bun install. Hanger reports the first, as the terminal would. Its update command is `opencode upgrade` whatever the install method, as the research recommends.
2. **The OpenCode sign-in argv gains `--format json`.** `opencode auth list --standalone --format json` printed `[]` with rc 0 on both installs. The signed-in text shape has never been seen, but an array length can be read without knowing it.
3. **Signed-out status commands exit 1.** `claude auth status` printed `{"loggedIn": false, "authMethod": "none", …}` with rc 1, and `codex login status` printed `Not logged in` with rc 1. So the parsers read stdout whatever `Captured.ok` says.
4. **Native Claude's channel is the `autoUpdatesChannel` setting.** code.claude.com/docs/en/setup → "Configure release channel": `"latest"` is the default and `"stable"` the alternative, set in `settings.json`. Homebrew installs pick a channel by cask name: `claude-code` is stable and `claude-code@latest` is latest. The research's "native installs sit ahead of `stable`" is a machine on `latest`; with `is_newer` that already yields no badge.
5. **npm only, not "npm and GitHub".** All four rows that have a source resolve on `https://registry.npmjs.org/-/package/<pkg>/dist-tags`, measured: Claude `stable 2.1.326`/`latest 2.1.332`, Codex `latest` present, Gemini `latest 0.71.1`, OpenCode `latest 2.4.2`. GitHub's REST API refuses requests without a `User-Agent`, and the research rules out headers beyond reqwest's defaults. Codex's GitHub release only agreed with npm, so GitHub adds nothing. Fix this if Karthik rules otherwise.
6. **`docs/telemetry.md` does not list outbound calls yet.** It lists Sentry, GA4 and PostHog only; the updater's own `latest.json` GET is absent. That gap is no reason to widen it, and the file is where a reader asks "what does Hanger send off the machine". So Task 8 adds a short "Other outbound requests" paragraph there naming the npm dist-tags GET, its daily cadence, what it carries (reqwest's default headers only; the registry sees the IP address) and the off preference. The npm call is also named in `docs/ipc.md`'s new entry and in the off preference's description (Task 3 copy).
7. **The card lists only engines that declare an MCP server.** `mcp::switch::ops::contexts_for` builds the list from registrations, so an installed CLI with no server has no card row and no Status rows. Its findings still reach Needs review. Task 4 shows this case to Karthik.
8. **"Unreadable" means an I/O failure, not a syntax error.** OpenCode and Gemini CLI accept comments in their JSON; a strict parse would turn valid files into findings.

## Global Constraints

- Updates are never run. Hanger shows the command as text (§3, direction note).
- Sign-in comes only from the CLI's own read-only status command. Keep a verdict and a fixed method token, never vendor text, an email, an org, a path or a key fragment. Gemini CLI and Antigravity CLI read "Not reported".
- OpenCode's package is `@opencode/cli`; its sign-in argv is `auth list --standalone` (plus `--format json`, see disagreement 2).
- A native Claude install is compared to its own channel, never to `latest` by default.
- The daily check is on by default. Preference `engine_update_checks` = `"off"` turns it off, and off means no request at all, a forced refresh included. The cache is `engine_latest:<engine_id>` in `preferences`. No migration: `STORE_VERSION` stays 8.
- Network: only `GET https://registry.npmjs.org/-/package/<package>/dist-tags`, 10 s timeout, reqwest default headers, nothing about the machine in it.
- Child processes go only through `engine_status::run::run_capture`, whose signature is frozen. The existing calls in `src-tauri/tests/engine_status_tests.rs` pin all five parameters: changing the signature breaks their compilation. Timeout 5 s; programs come from `resolve::resolve_in` with `resolve::search_path()`.
- No secret, token, email or credential file is logged, stored or sent over IPC, and no credential file is read. One settings file is read to a string: `claude_channel` reads `~/.claude/settings.json` (which can carry `env` values) to deserialise one field; the rest is dropped unlogged, as the scanner already does with MCP configs. Development probes run under a throwaway `HOME` only.
- `EngineContext`, `context.rs` and `get_engine_contexts` are unchanged; T19's reply is a sibling.
- `ENGINE_CLIS` gets a coverage assertion and a floor of 5 in `brand-coverage.test.ts` in the commit that creates it.
- Counts come from the backend; the webview computes no count (`no-frontend-counting.test.ts`). Engine names come from the backend (`no-hardcoded-engine-copy.test.ts`). Tokens and type roles only. No blocking dialogs.
- Every new string waits for Task 3's sign-off. Every addition to the card waits for Task 4's result.
- Gates, from the repo root unless stated, each in its own call: `npx vitest run`; `cargo test` (from `src-tauri/`); `bunx tsc --noEmit`; `gitleaks detect --source .`; `gitleaks detect --source . --no-git -c .gitleaks.toml`. `cargo test` relaunches a running dev app.
- Commits that touch no shared file: `git add <paths>` in one call, then `git commit -m "…" -- <paths>` in its own call, with no `-n` anywhere in it. Check `git diff --cached --name-only` in a separate call. Run `/simplify` before each code commit (not docs or tests). Never touch a peer's uncommitted hunk.
- **Commits that include `src/App.tsx`** (Tasks 9 and 10; a peer holds uncommitted edits there): build the file you mean to commit, stage it as an exact blob (`git hash-object -w <file>` then `git update-index --cacheinfo 100644,<blob>,src/App.tsx`), `git add` the other paths, check `git diff --cached --name-only`, then run a **bare `git commit`** with no paths and no `-a`. A path-scoped `git commit -- <paths>` re-adds the whole working-tree file and sweeps the peer's hunks in (`shared-checkout.md`). Afterwards, build the commit in a detached worktree and run `npx vitest run` there. `stage-gate --dev` before push.

## Review Focus

1. **A signed-out CLI exits 1** (`claude`, `codex`). The user should see "signed out" and get a finding, not "Not reported". Pinned in Task 5 by `signed_out_output_is_read_whatever_the_exit_status`, and in Task 8 by the fake `codex` that exits 1.
2. **Two installs of one CLI** (OpenCode: `~/.opencode/bin` 2.4.2 ahead of bun's 2.4.1). Hanger should report the one the login shell runs first, and offer `opencode upgrade`. Pinned in Task 2 by `install_method_classifies_each_measured_layout` (both layouts) and `update_command_per_method`. First-wins is already pinned by `the_first_path_entry_wins`.
3. **A settings file with comments or a trailing comma** (OpenCode, Gemini CLI). It should be Ok with no finding. Pinned in Task 6 by `a_file_with_comments_is_ok`.
4. **Native Claude on the stable channel, running ahead of stable.** No badge should show. On latest and behind, the badge shows `claude update`. Pinned in Task 8 by `claude_native_on_stable_ahead_of_stable_has_no_update` and `claude_native_on_latest_behind_latest_offers_claude_update`.
5. **Offline, a 500, or a garbage body from npm.** The last cache stays with its `checked_at_ms`, and no badge flips. Pinned in Task 7 by `a_failed_check_keeps_the_previous_cache`.

---

### Task 1: The engine CLI table and version parsing (the interface P5 and P8 consume)

**Files:**
- Create: `src-tauri/src/engine_status/clis.rs`, `src-tauri/src/engine_status/version.rs`
- Modify: `src-tauri/src/engine_status/mod.rs` (declare both; rewrite the header's "are not built" sentence to say what now is), `src/__tests__/brand-coverage.test.ts` (new source + floor), `docs/harness.md` (one section), `docs/plans/2026-11-24-tool-manager-phase-a.md` (banner only)
- Test: `src-tauri/tests/engine_cli_tests.rs` (new; the existing `engine_status_tests.rs` is left as it is)

**Interfaces:**
- Produces (`engine_status::clis`), exactly:
  ```rust
  #[derive(Debug, Clone, Copy, PartialEq, Eq)]
  pub enum AuthProbe { ClaudeJson, CodexText, OpenCodeJson }
  #[derive(Debug, Clone, Copy, PartialEq, Eq)]
  pub enum LatestSource { Npm(&'static str), None }
  #[derive(Debug)]
  pub struct EngineCli {
      pub engine_id: &'static str,                 // an AGENT_CONFIGS id
      pub bin: &'static str,                       // command name, resolved with resolve::resolve_in
      pub latest: LatestSource,
      pub auth: Option<(&'static [&'static str], AuthProbe)>, // argv after bin
      pub own_update: Option<&'static str>,        // a command the CLI ships for itself
      pub settings_files: &'static [&'static str], // home-relative, resolved through agents::engine_base
  }
  pub const ENGINE_CLIS: &[EngineCli];
  pub fn cli_for(engine_id: &str) -> Option<&'static EngineCli>;
  ```
  Rows, in `AGENT_CONFIGS` order:

  | engine_id | bin | latest | auth | own_update | settings_files |
  |---|---|---|---|---|---|
  | `claude-code` | `claude` | `Npm("@anthropic-ai/claude-code")` | `["auth","status"]`, `ClaudeJson` | None | `.claude/settings.json` |
  | `codex` | `codex` | `Npm("@openai/codex")` | `["login","status"]`, `CodexText` | None | `.codex/config.toml` |
  | `gemini` | `gemini` | `Npm("@google/gemini-cli")` | None | None | `.gemini/settings.json` |
  | `antigravity` | `agy` | `None` | None | None | `.gemini/config/config.json` |
  | `opencode` | `opencode` | `Npm("@opencode/cli")` | `["auth","list","--standalone","--format","json"]`, `OpenCodeJson` | `opencode upgrade` | `.config/opencode/opencode.json` |

- Produces (`engine_status::version`):
  ```rust
  pub const COMMAND_TIMEOUT: std::time::Duration; // 5 s
  pub fn parse_version(stdout: &str) -> Option<String>; // first whitespace token that, after an optional leading 'v', is N.N.N with an optional -suffix
  pub fn is_newer(latest: &str, installed: &str) -> Option<bool>; // numeric major.minor.patch; None if either fails to parse
  ```
  `is_newer` ignores pre-release suffixes when ordering. Add a `shortcut:` comment: pre-releases compare equal to their release; upgrade to semver ordering if a source ever serves a pre-release on `latest` or `stable`. No regex crate: parse by hand.

- [ ] **Step 1: Capture the per-kind baseline.** Run `sqlite3 -readonly "$HOME/Library/Application Support/com.rkarthik.hanger/hanger.db" "select category, scope, count(*) from assets group by category, scope order by category, scope;"` and paste the output into the task report. This plan claims no asset change.
- [ ] **Step 2: Write the failing tests** in `engine_cli_tests.rs`:
  - `engine_clis_are_the_five_in_table_order`: ids `["claude-code","codex","gemini","antigravity","opencode"]`, bins `["claude","codex","gemini","agy","opencode"]`.
  - `every_engine_cli_names_an_agent_config`: each `engine_id` is an `agents::AGENT_CONFIGS` id.
  - `cli_for_finds_by_engine_id`: `cli_for("codex").unwrap().bin == "codex"`; `cli_for("zed")` and `cli_for("")` are `None`.
  - `latest_sources_are_the_measured_packages`: the four `Npm` values above; `antigravity` is `LatestSource::None`; `opencode.own_update == Some("opencode upgrade")`.
  - `parse_version_reads_each_measured_output`: `"2.1.332 (Claude Code)"`→`"2.1.332"`, `"codex-cli 0.172.0"`→`"0.172.0"`, `"0.56.0\n"`→`"0.56.0"`, `"opencode v2.4.2"`→`"2.4.2"`, `"1.5.18"`→`"1.5.18"`, `"0.72.0-preview.0"`→`"0.72.0-preview.0"`, `"no version here"`→`None`, `"2.1"`→`None`.
  - `is_newer_compares_numerically`: `("0.71.1","0.56.0")`→`Some(true)`, `("2.1.332","2.1.332")`→`Some(false)`, `("2.1.326","2.1.332")`→`Some(false)`, `("1.10.0","1.9.9")`→`Some(true)`, `("nightly","1.0.0")`→`None`.
- [ ] **Step 3: Run** `cd src-tauri && cargo test --test engine_cli_tests`. Expected: FAIL to compile, with ``error[E0432]: unresolved import `tauri_app_lib::engine_status::clis` ``.
- [ ] **Step 4: Implement** both modules.
- [ ] **Step 5: Run** the same command. Expected: PASS, 6 tests.
- [ ] **Step 6: Extend `brand-coverage.test.ts`** with a source `"engine_status/clis.rs ENGINE_CLIS"`, read as `block(read("src-tauri/src/engine_status/clis.rs"), "pub const ENGINE_CLIS", "];", …)`, with ids matched by `/engine_id: "([^"]+)"/g`. Add floor `5`. Add an assertion that every id from that source is also an `agents.rs AGENT_CONFIGS` id. Update the comment's tally line.
- [ ] **Step 7: Prove the guard fires.** In a detached worktree (`git worktree add --detach /tmp/t19-plant HEAD` plus a symlinked `node_modules`, never the watched tree), change one `engine_id` to `"cursor"` (a `HOSTS` id with a brand mark, and not an `AGENT_CONFIGS` id, so only the new subset assertion can go red) and run `npx vitest run src/__tests__/brand-coverage.test.ts`. Expected: FAIL naming `cursor` in the `AGENT_CONFIGS`-subset assertion, and no other assertion failing. Delete one row instead. Expected: FAIL on the floor (`yielded only 4 ids, expected at least 5`). Paste both outputs, then remove the worktree.
- [ ] **Step 8: Docs.** Add a section to `docs/harness.md`, "Engines are managed, not a fifth kind": the four kinds stand, and an engine's CLI is a managed object with version, update, sign-in and settings, tabled in `engine_status::clis` → `ENGINE_CLIS` (cite the symbol). Add a top banner to `docs/plans/2026-11-24-tool-manager-phase-a.md`: "Superseded 2026-11-28 by `docs/plans/2026-11-28-t19-engine-status-plan.md`, whose first section says which parts survive."
- [ ] **Step 9: Run all four gates.**
- [ ] **Step 10: Commit** `feat(engines): five engine CLIs become a table, with version parsing`, with the two modules, `mod.rs`, the test file, `brand-coverage.test.ts`, `docs/harness.md` and the old plan. The body names the guard edit, says why it was required (design §5, "Tables keyed to them … get a coverage assertion and floor"), and records Step 7's plant.

### Task 2: Install method, channel and update command (interface, lands with Task 1)

**Files:**
- Create: `src-tauri/src/engine_status/install.rs`; declare in `mod.rs`
- Test: `src-tauri/tests/engine_cli_tests.rs`

**Interfaces:**
- Consumes: `clis::EngineCli`.
- Produces (`engine_status::install`):
  ```rust
  #[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
  #[serde(tag = "kind", rename_all = "snake_case")]
  pub enum InstallMethod { Native, Npm, Bun, Homebrew { name: String }, Other }
  #[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
  #[serde(rename_all = "snake_case")]
  pub enum Channel { Latest, Stable }
  pub fn install_method(resolved: &Path, home: &Path) -> InstallMethod;
  pub fn claude_channel(method: &InstallMethod, user_settings_json: Option<&str>) -> Channel;
  pub fn update_command(cli: &EngineCli, method: &InstallMethod) -> Option<String>;
  ```
- `install_method` reads the canonicalised path:
  - under `<home>/.local/share/claude/` → `Native`;
  - a path component after one named `Caskroom` or `Cellar` → `Homebrew { name }`. This is checked before `node_modules`: a Homebrew node formula (gemini-cli is one) lives under `Cellar/<name>/<ver>/libexec/lib/node_modules/…`, and checking `node_modules` first would classify it `Npm` and offer a command that installs a second copy;
  - contains `/.bun/install/global/` → `Bun`;
  - contains `/lib/node_modules/` → `Npm`;
  - anything else → `Other`.
- `claude_channel`:
  - `Native` reads only the top-level `autoUpdatesChannel` string from the JSON: `"stable"` → `Stable`, anything else, absent or unparseable → `Latest`.
  - `Homebrew { name }` → `Latest` if `name` ends with `@latest`, else `Stable`.
  - Every other method → `Latest`.
  - Deserialise into a one-field struct so nothing else in the file is kept. Add a `shortcut:` comment: managed settings and project files can also set the channel and are not read; read them if a managed-install user reports a wrong badge.
- `update_command`:
  - `own_update` wins when present.
  - `Native` → `"claude update"` for `claude-code`, `None` otherwise.
  - `Npm` → `"npm install -g <pkg>@latest"`; `Bun` → `"bun add -g <pkg>@latest"`, where `<pkg>` comes from `LatestSource::Npm` (`None` when the row has no package).
  - `Homebrew { name }` → `"brew upgrade <name>"`, with a `shortcut:` comment: the latest version comes from npm, which can lead the formula, so this command may do nothing until the formula catches up; add a brew source if users report it. `Other` → `None`.

- [ ] **Step 1: Write the failing tests.** Use temp dirs with real symlinks, never the real home.
  - `install_method_classifies_each_measured_layout`:
    - `<home>/.local/bin/claude` → `<home>/.local/share/claude/versions/2.1.332` gives `Native`;
    - `<home>/.npm-global/bin/codex` → `<home>/.npm-global/lib/node_modules/@openai/codex/bin/codex.js` gives `Npm`;
    - `<home>/.bun/bin/gemini` → `<home>/.bun/install/global/node_modules/@google/gemini-cli/bundle/gemini.js` gives `Bun`;
    - `<home>/.bun/bin/opencode` → relative `../install/global/node_modules/@opencode/cli/bin/opencode.exe` gives `Bun`;
    - plain files `<home>/.opencode/bin/opencode` and `<home>/.local/bin/agy` give `Other`.
  - `homebrew_layouts_name_their_formula`: a file at `<tmp>/opt/homebrew/Caskroom/claude-code@latest/2.1.332/claude` gives `Homebrew { name: "claude-code@latest" }`. The real node-formula shape: `<tmp>/opt/homebrew/bin/gemini` is a symlink to `../Cellar/gemini-cli/0.56.0/bin/gemini`, which is itself a symlink to `../libexec/lib/node_modules/@google/gemini-cli/dist/index.js`; it gives `Homebrew { name: "gemini-cli" }`, not `Npm`. (The shape is reasoned from Homebrew's formula convention; no Homebrew install of these CLIs exists on this machine to measure.)
  - `update_command_per_method`:
    - codex + `Npm` → `"npm install -g @openai/codex@latest"`;
    - gemini + `Bun` → `"bun add -g @google/gemini-cli@latest"`;
    - claude-code + `Native` → `"claude update"`;
    - claude-code + `Homebrew{"claude-code"}` → `"brew upgrade claude-code"`;
    - opencode + `Bun` → `"opencode upgrade"`; opencode + `Other` → `"opencode upgrade"`;
    - codex + `Other` → `None`; antigravity + `Other` → `None`; gemini + `Native` → `None`.
  - `claude_channel_follows_the_setting_and_the_cask`:
    - `Native` + `{"autoUpdatesChannel":"stable"}` → `Stable`;
    - `Native` + `{"autoUpdatesChannel":"latest"}` → `Latest`;
    - `Native` + `None` → `Latest`; `Native` + `{"broken":` → `Latest`;
    - `Native` + `{"env":{"autoUpdatesChannel":"stable"}}` → `Latest` (top level only);
    - `Homebrew{"claude-code"}` → `Stable`; `Homebrew{"claude-code@latest"}` → `Latest`;
    - `Npm` + the stable JSON → `Latest`.
- [ ] **Step 2: Run** `cd src-tauri && cargo test --test engine_cli_tests`. Expected: FAIL with ``unresolved import `tauri_app_lib::engine_status::install` ``.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** again. Expected: PASS, 10 tests.
- [ ] **Step 5: Run the four gates; commit** `feat(engines): each CLI's install method, channel and update command`.

### Task 3: HUMAN GATE G1, the naming brief for the Status rows and the finding category (stops for Karthik)

No code. Blocks Tasks 9 and 10. It runs alongside Tasks 5–8.

- [ ] **Step 1:** Write T19's section into the batched naming round (design §7, "one batched naming brief"). If no batched file exists when this task starts, write `docs/plans/2026-11-28-t19-engine-status-naming-brief.md` in the shape of `docs/plans/2026-11-27-repo-view-parity-naming-brief.md`. Research each term against how the vendors and comparable tools name it, and give two or three candidates with a recommendation for each of:
  - the three row labels (working: Version, Sign-in, Settings);
  - the states:
    - "Not installed" and "Not reported";
    - signed in with a method: tokens `chatgpt`, `api_key`, and Claude's `authMethod` values;
    - signed out;
    - an update available, with its command;
    - an update available with no command known (`update_available` with `update_command: None`: an `Other` install such as a hand-placed Codex);
    - up to date;
    - checks off;
    - settings missing, and settings unreadable;
  - the refresh control and its in-flight label;
  - the off preference's label and description, which must say it is a daily request to the npm registry;
  - the Needs review category name, and the two finding lines.
- [ ] **Step 2:** Run every string through `/humanizer`. Check each against the code: copy must be literally true. For example, "checked today" is true only once `checked_at_ms` is within today.
- [ ] **Step 3: STOP for Karthik.** Ask through Plannotator. The artefact is his sign-off recorded in the brief file, string by string. An answer without the recorded strings does not open the gate (`verification.md`, "His answer is not his result").
- [ ] **Step 4: Commit** the brief: `docs(plans): T19 status naming brief, signed off`.

### Task 4: HUMAN GATE G2, the combined card layout round (stops for Karthik; its result binds five plans)

No production code. It runs right after Task 2, before anyone builds on the card. Blocks Task 9 here, and the card tasks of P2, P5b, P6 and P4b.

**Inputs** (see Cross-plan interfaces): each piece's card addition, in its plan's working strings. If a plan has not written one by the round's date, draw a slot labelled with that plan and record it as provisional.

- [ ] **Step 1:** Build `docs/design-ref-prototypes/2026-11-28-card-layout-round-options.html`. It is a static page in the shape of `2026-11-27-repo-overview-options.html`, with the token values copied from `src/styles/tokens.css`, light and dark, and each card at its true 280px width (`OverviewCard`'s `w-[280px]`). Draw two or three whole-card options. Each option shows every addition together:
  - **T19:** Status rows in the engine section, and the update mark on an engine row;
  - **P2:** "Off in this repo" as a repository card row action;
  - **P5b:** skill figures in the kinds rows;
  - **P6:** the applies line;
  - **P4b:** the profile control.

  Draw each option in these states:
  - All engines;
  - Claude Code picked: signed in, update available, settings Ok;
  - Gemini CLI picked: sign-in Not reported, latest newer;
  - Antigravity CLI picked: no latest source;
  - checks off;
  - an installed CLI that declares no MCP server and so has no card row (disagreement 7: ask whether that is acceptable);
  - the repository card (`engineCounts` mode).
- [ ] **Step 2:** Capture each option to PNG beside the HTML.
- [ ] **Step 3: STOP for Karthik.** Ask through Plannotator. He picks, usually a hybrid.
- [ ] **Step 4:** Record his ruling in `docs/plans/2026-11-28-card-layout-round.md`: the chosen option per addition, its order inside the card, the provisional slots, and his words verbatim. That file is what P2, P5b, P6 and P4b build to.
- [ ] **Step 5: Commit** both files and the PNGs: `docs(design): the combined overview card layout round, ruled`.

### Task 5: Sign-in from each CLI's own status command

**Files:**
- Create: `src-tauri/src/engine_status/auth.rs`; declare in `mod.rs`
- Test: `src-tauri/tests/engine_cli_tests.rs`

**Interfaces:**
- Consumes: `clis::AuthProbe`.
- Produces:
  ```rust
  #[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
  #[serde(tag = "state", rename_all = "snake_case")]
  pub enum AuthState { SignedIn { method: Option<String> }, SignedOut, NotReported }
  pub fn parse_auth(probe: AuthProbe, stdout: Option<&str>) -> AuthState; // None = the command produced no result
  ```
- Rules:
  - **`ClaudeJson`:** read only `loggedIn` and `authMethod`. `loggedIn: true` → `SignedIn`, with `method` = `authMethod` only when it matches `^[a-z0-9_.-]{1,32}$` and is not `"none"`. `loggedIn: false` → `SignedOut`. Anything else → `NotReported`.
  - **`CodexText`:** the first non-empty trimmed line. If it starts `Logged in using`, the result is `SignedIn` with method `"chatgpt"` if the line contains `ChatGPT`, `"api_key"` if it contains `API key`, else `None`; the rest of the line is never kept. If it starts `Not logged in` → `SignedOut`. Anything else → `NotReported`.
  - **`OpenCodeJson`:** a JSON array with length > 0 → `SignedIn { method: None }`. Anything else, including `[]`, → `NotReported`. OpenCode is never `SignedOut`: it runs on environment keys and free models, so zero stored integrations is not signed out.
  - `stdout: None` → `NotReported`.

- [ ] **Step 1: Write the failing tests:**
  - `claude_signed_out_json_is_signed_out`: the measured body (`"loggedIn": false, "authMethod": "none", "apiProvider": "firstParty", …`, with paths under `/tmp/x/.claude`) → `SignedOut`.
  - `claude_signed_in_keeps_only_the_method`: `{"loggedIn":true,"authMethod":"claude.ai","email":"someone@example.com","orgName":"Acme","configDirectory":"/Users/someone/.claude"}` → `SignedIn{method:Some("claude.ai")}`. `serde_json::to_string` of the result contains none of `someone@example.com`, `Acme`, `/Users/someone`.
  - `claude_auth_method_outside_the_token_shape_is_dropped`: `authMethod: "someone@example.com"` → `SignedIn{method:None}`.
  - `codex_lines`:
    - `"Not logged in\n"` → `SignedOut`;
    - `"Logged in using ChatGPT\n"` → `SignedIn{Some("chatgpt")}`;
    - `"Logged in using an API key - " + "sk-proj-" + "***ABCD"` → `SignedIn{Some("api_key")}`, and its JSON contains neither `sk-proj` nor `ABCD`. Build the string by concatenation so gitleaks sees no key-shaped literal;
    - `""` → `NotReported`.
  - `opencode_arrays`: `"[]"` → `NotReported`; `"[{}]"` → `SignedIn{None}`; `"No authenticated integrations"` → `NotReported`.
  - `signed_out_output_is_read_whatever_the_exit_status`: `parse_auth` takes stdout only. Document on the function that callers pass stdout for `ok: false` too.
  - `no_output_is_not_reported`: each probe with `None` → `NotReported`.
- [ ] **Step 2: Run** `cd src-tauri && cargo test --test engine_cli_tests`. Expected: FAIL with ``unresolved import `tauri_app_lib::engine_status::auth` ``.
- [ ] **Step 3: Implement.** Raw stdout is dropped after parsing and never logged.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Four gates; commit** `feat(engines): sign-in comes only from each CLI's own status command`.

### Task 6: Settings files, located and checked without being read

**Files:**
- Create: `src-tauri/src/engine_status/settings.rs`; declare in `mod.rs`
- Test: `src-tauri/tests/engine_cli_tests.rs`

**Interfaces:**
- Produces:
  ```rust
  #[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
  #[serde(rename_all = "snake_case")]
  pub enum SettingsHealth { Missing, Ok, Unreadable }
  #[derive(Debug, Clone, serde::Serialize)]
  pub struct SettingsFile { pub path: String, pub health: SettingsHealth, pub modified_ms: Option<i64> }
  pub fn inspect(path: &Path) -> SettingsFile;
  pub fn settings_for(cli: &EngineCli, home: &Path) -> Vec<SettingsFile>; // each rel through agents::engine_base(home, rel)
  ```
- `Missing`: nothing at the path. `Unreadable`: it exists but `File::open` fails, or it is a directory. `Ok` otherwise, with `modified_ms`. Content is never read or parsed here. Resolving through `engine_base` honours `CLAUDE_CONFIG_DIR` and `CODEX_HOME` as every root does (`shared-asset-machinery.md`). Add a `shortcut:` comment: OpenCode's `opencode.jsonc` is not looked for; add it when a user's lives there.

- [ ] **Step 1: Write the failing tests:**
  - `absent_is_missing`: `health == Missing`, `modified_ms == None`.
  - `a_file_with_comments_is_ok`: a file holding `// note\n{"a":1,}` → `Ok`, `modified_ms.is_some()`.
  - `an_unopenable_file_is_unreadable`: mode `0o000` → `Unreadable`.
  - `a_directory_is_unreadable`.
  - `settings_for_lists_the_rows_file_under_home`: opencode with temp home → one entry whose `path` ends with `.config/opencode/opencode.json`.
- [ ] **Step 2: Run** `cd src-tauri && cargo test --test engine_cli_tests`. Expected: FAIL with ``unresolved import `tauri_app_lib::engine_status::settings` ``.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Four gates; commit** `feat(engines): find each CLI's settings file and whether it opens`.

### Task 7: The daily latest-version check, its cache and its off switch

**Files:**
- Create: `src-tauri/src/engine_status/latest.rs`; declare in `mod.rs`
- Modify: `src-tauri/src/lib.rs` (`setup`: call `engine_status::latest::spawn_daily(handle.clone())` beside `updates::spawn_background_checks`)
- Test: `src-tauri/tests/engine_latest_tests.rs` (new)

**Interfaces:**
- Consumes: `preferences::PreferencesStore` (`get_preference`, `set_preference`), `version::parse_version`.
- Produces:
  ```rust
  pub const NPM_BASE: &str = "https://registry.npmjs.org";
  pub const MAX_AGE: Duration;        // 24 h
  pub const LOOP_EVERY: Duration;     // 6 h
  pub const REQUEST_TIMEOUT: Duration; // 10 s
  pub const PREF_CHECKS: &str = "engine_update_checks"; // "off" disables; absent or anything else is on
  pub fn cache_key(engine_id: &str) -> String;           // "engine_latest:<id>"
  #[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
  pub struct LatestCache { pub latest: Option<String>, pub stable: Option<String>, pub checked_at_ms: i64 }
  pub fn dist_tags_url(base: &str, package: &str) -> String; // "{base}/-/package/{package}/dist-tags", '/' in a scope kept
  pub fn parse_dist_tags(body: &str, checked_at_ms: i64) -> Option<LatestCache>; // only `latest` and `stable`, each kept only if parse_version accepts it; None if neither
  pub fn checks_on(store: &PreferencesStore) -> bool;
  pub fn read_cache(store: &PreferencesStore, engine_id: &str) -> Option<LatestCache>;
  pub async fn check_all(store: &PreferencesStore, base: &str, targets: &[(&str, &str)], now_ms: i64, force: bool);
  pub fn spawn_daily(app: tauri::AppHandle);
  ```
- `check_all` does nothing when `!checks_on`, `force` included. For each `(engine_id, package)` target, it skips when `!force` and the cache is younger than `MAX_AGE`. On success it writes the cache; on any failure (transport, non-2xx, body `parse_dist_tags` rejects) it leaves the old cache untouched. Errors are logged without the URL. `base` exists so tests can point at a local stub.
- `spawn_daily` runs once at launch, then every `LOOP_EVERY`, each time `check_all(force = false)` over the installed targets (`status::check_targets`, Task 8). Until Task 8 lands, an empty target list is passed; say so in a comment written as intent, not present tense. A static `AtomicBool` in-flight flag lives in this spawn layer, not in `check_all`, so parallel tests share no global. A run that finds the flag set returns.

- [ ] **Step 1: Write the failing tests.** Use a `tokio::net::TcpListener` stub on 127.0.0.1 that counts requests and answers a fixed status and body, and a temp `PreferencesStore::new(<tmp>/hanger.db)`.
  - `dist_tags_url_keeps_the_scope`: (`NPM_BASE`, `"@openai/codex"`) → `"https://registry.npmjs.org/-/package/@openai/codex/dist-tags"`.
  - `parse_dist_tags_keeps_latest_and_stable`:
    - `{"stable":"2.1.326","latest":"2.1.332","next":"2.1.332"}` → `latest Some("2.1.332")`, `stable Some("2.1.326")`;
    - `{"preview":"0.72.0-preview.0","nightly":"0.71.0-nightly.20261124.gaafdfdfb5","latest":"0.71.1"}` → `latest Some("0.71.1")`, `stable None`;
    - `{"latest":"nightly"}` → `None`; `"<html>"` → `None`.
  - `a_fresh_cache_is_not_rechecked`: cache 1 h old, `force=false` → 0 requests.
  - `a_stale_cache_is_rechecked`: cache 25 h old → 1 request, and the cache now holds the stub's versions and `checked_at_ms == now_ms`.
  - `force_rechecks_a_fresh_cache`: 1 request.
  - `a_failed_check_keeps_the_previous_cache`: the stub answers 500, then in a second case 200 with `<html>`. In both, the cache equals what it was, `checked_at_ms` included.
  - `checks_off_means_no_request`: `PREF_CHECKS = "off"`, `force=true` → 0 requests.
  - `only_the_targets_given_are_asked`: one target out of a store holding none → exactly 1 request, and only `engine_latest:<that id>` is written.
- [ ] **Step 2: Run** `cd src-tauri && cargo test --test engine_latest_tests`. Expected: FAIL with ``unresolved import `tauri_app_lib::engine_status::latest` ``.
- [ ] **Step 3: Implement** `latest.rs` and the `setup` call.
- [ ] **Step 4: Run.** Expected: PASS, 8 tests.
- [ ] **Step 5: Four gates; commit** `feat(engines): check each CLI's channel on npm once a day, cached, with an off switch`.

### Task 8: Gather status, one IPC command beside `get_engine_contexts`, and the types

**Files:**
- Create: `src-tauri/src/engine_status/status.rs`; declare in `mod.rs`. Create `src/types/engineStatus.ts` and `src/__tests__/fixtures/engineStatusReply.json`.
- Modify: `src-tauri/src/lib.rs` (the command, placed right after `get_engine_contexts`, registered in `generate_handler!`; `spawn_daily` now passes `status::check_targets`), `docs/ipc.md` (one entry at the next free number at commit time, in the format of entry 20; it names the npm request, its daily cadence and the off preference), `docs/telemetry.md` (a short "Other outbound requests" paragraph: the npm dist-tags GET, once a day, reqwest's default headers only, the registry sees the IP address, and the `engine_update_checks` preference turns it off), and `README.md`'s `ipc` region (regenerate with `~/.bun/bin/bun run src/__tests__/readmeCounts.ts`).
- Test: `src-tauri/tests/engine_cli_tests.rs`, `src-tauri/tests/ipc_boundary_tests.rs`

**Interfaces:**
- Consumes: Tasks 1, 2, 5, 6, 7; `resolve::{search_path, resolve_in}`; `run::run_capture`; `agents::AGENT_CONFIGS` for names; `scanner::get_home_dir`.
- Produces:
  ```rust
  #[derive(Debug, Clone, serde::Serialize)]
  pub struct EngineStatus {
      pub engine_id: String, pub engine_name: String, pub installed: bool,
      pub version: Option<String>, pub install_method: Option<InstallMethod>, // None when not installed
      pub channel: Channel, pub latest: Option<String>, pub checked_at_ms: Option<i64>,
      pub update_available: bool,           // is_newer(latest, version) == Some(true)
      pub update_command: Option<String>,   // None whenever !update_available
      pub auth: AuthState, pub settings: Vec<SettingsFile>,
  }
  #[derive(Debug, Clone, serde::Serialize)]
  pub struct EngineStatusReply { pub engines: Vec<EngineStatus>, pub checks_on: bool }
  pub async fn gather<F: Fn(&str) -> Option<LatestCache>>(home: &Path, path_env: &str, timeout: Duration, cache: F) -> Vec<EngineStatus>;
  pub fn check_targets(path_env: &str) -> Vec<(&'static str, &'static str)>; // installed rows with an Npm source
  // lib.rs
  #[tauri::command] async fn get_engine_status(app: AppHandle, force_check: bool) -> Result<EngineStatusReply, String>;
  ```
- `gather` covers every `ENGINE_CLIS` row concurrently, and within a row runs `--version` and the auth argv concurrently too (`tokio::join!`), so one stuck CLI costs one `timeout` (use `tokio::task::JoinSet` or `join!`; no new crate). Per row:
  - `resolve_in(bin, path_env)`;
  - `<bin> --version` through `run_capture` with `envs = [("PATH", path_env)]`, keeping `parse_version(stdout)` only when `ok`;
  - the auth argv, its stdout passed to `parse_auth` whatever `ok` says;
  - `install_method`;
  - for `claude-code`, the channel from `engine_base(home, ".claude").join("settings.json")` read to a string; every other row gets `Latest`;
  - `latest` is the cache's tag for that channel.
- The command: `search_path().await`. If `force_check && checks_on`, run `check_all(force = true)` over `check_targets` first. This path doesn't take `spawn_daily`'s in-flight flag, so it can overlap a background check and make one duplicate request; a comment says so, and that it is harmless. Then `gather` with `COMMAND_TIMEOUT` and `read_cache`. Return `checks_on`. A failed store read becomes `Err` with a fixed message, never a path.
- TypeScript in `engineStatus.ts` mirrors the reply exactly:
  - `AuthState` is a union on `state`, and `method` exists only on `signed_in`;
  - `InstallMethod` is a union on `kind`;
  - `update_command: string | null`.
- The fixture comes from the producer: the `--nocapture` print of `a_fake_codex_reports_version_signed_out_and_its_update`'s serialised reply. It is never typed by hand.

- [ ] **Step 1: Write the failing tests.** Fake CLIs are `#!/bin/sh` scripts that answer by `$1`, in temp dirs; the home is a temp dir.
  - `a_missing_engine_is_not_installed_and_not_reported`: empty path → five entries, each `installed=false`, `version=None`, `install_method=None`, `auth=NotReported`, `update_available=false`, `update_command=None`.
  - `a_fake_codex_reports_version_signed_out_and_its_update`: `codex` lives at `<home>/.npm-global/lib/node_modules/@openai/codex/bin/codex.js` and is symlinked from `<tmp>/bin/codex`. `--version` prints `codex-cli 0.171.0`; `login status` prints `Not logged in` and exits 1. The cache gives `latest "0.172.0"`. Expected: `installed`, `version "0.171.0"`, `install_method Npm`, `update_available`, `update_command "npm install -g @openai/codex@latest"`, `auth SignedOut`, `engine_name "Codex"`.
  - `claude_native_on_stable_ahead_of_stable_has_no_update`: `claude` is at `<home>/.local/share/claude/versions/2.1.332` via `<home>/.local/bin/claude` and prints `2.1.332 (Claude Code)`. `<home>/.claude/settings.json` holds `{"autoUpdatesChannel":"stable"}`. The cache gives `latest 2.1.332`, `stable 2.1.326`. Expected: `channel Stable`, `latest "2.1.326"`, `update_available false`, `update_command None`. The test asserts `CLAUDE_CONFIG_DIR` is unset first.
  - `claude_native_on_latest_behind_latest_offers_claude_update`: the same layout at 2.1.330 with no settings file → `channel Latest`, `latest "2.1.332"`, `update_command "claude update"`.
  - `one_hung_cli_costs_one_timeout`: fake `claude` and `codex` both `sleep 30` on every argv (so `--version` and `auth status` both hang); timeout 1 s; `gather` returns in under 1.8 s, both with `version None` and `auth NotReported`. Under 1.8 s fails if the two commands of a row ran in sequence (2 s).
  - `check_targets_lists_installed_rows_with_a_package`: only fake `gemini` and `agy` on the path → `[("gemini","@google/gemini-cli")]`.
  - In `ipc_boundary_tests.rs`, `engine_status_never_carries_an_email_or_key_fragment`: fake `claude` whose `auth status` prints the Task 5 signed-in fixture with the email and org, and fake `codex` printing the API-key line. The serialised `EngineStatusReply` contains none of `someone@example.com`, `Acme`, `sk-proj`, `ABCD`.
- [ ] **Step 2: Run** `cd src-tauri && cargo test --test engine_cli_tests --test ipc_boundary_tests`. Expected: FAIL with ``unresolved import `tauri_app_lib::engine_status::status` ``.
- [ ] **Step 3: Implement** `status.rs` and the command; wire `check_targets` into `spawn_daily`.
- [ ] **Step 4: Run.** Expected: PASS. Then run `npx vitest run src/__tests__/readme-sync.test.ts`. Expected: FAIL on the `ipc` region count. Regenerate the README, rerun, expected PASS.
- [ ] **Step 5:** Write `engineStatus.ts` and the captured fixture; `bunx tsc --noEmit` exits 0.
- [ ] **Step 6: Four gates; commit** `feat(engines): get_engine_status beside get_engine_contexts`, with `docs/telemetry.md` among the paths.

### Task 9: Status rows on the card (after G1 and G2)

**Files:**
- Modify:
  - `src/components/OverviewCard.tsx`: Status rows inside `EngineSection` and the update mark on an engine row, both to Task 4's ruling, as local functions, so no new component needs a specimen.
  - `src/utils/overviewCopy.ts`: Task 3's strings.
  - `src/components/ProfilePane.tsx`: pass status through to its `OverviewCard`. (`RepoPane` also renders `OverviewCard`, in `engineCounts` mode; the new props are optional, so it is unchanged, and Task 4 draws that state.)
  - `src/App.tsx`: state, reads, the Settings row. Stage it as an exact blob and commit bare (Global Constraints); a peer holds uncommitted edits there.
  - `src/components/DesignSystemPane.tsx`: the engine specimen gains a status from the fixture.
  - `.claude/DESIGN.md`: the `OverviewCard` paragraph moves with the shape.
- Test: `src/components/OverviewCard.test.tsx`, `src/__tests__/engine_status_wiring.test.tsx` (new), `src/__tests__/settings_editor_row.test.tsx` only if the new row sits in the component it covers

**Interfaces:**
- Consumes: `EngineStatusReply` (Task 8), `openInEditor(path, editorName)` from `src/openInEditor.ts`, Task 3's strings, Task 4's ruling.
- Produces: `OverviewCardProps` gains `statuses?: EngineStatus[] | null`, `onRefreshStatus?: () => void`, `statusRefreshing?: boolean` and `onOpenSettings?: (path: string) => void`. All are optional, so existing callers are unchanged. Slots for P2, P5b, P6 and P4b follow `docs/plans/2026-11-28-card-layout-round.md`; this task draws none of them.
- App reads `get_engine_status` with `{ forceCheck: false }` on mount and once per `scan://complete`, right after `refreshEngineContexts`, the same cadence the contexts use. This is why the launch check, which lands after the mount read, reaches the card at the startup scan's end. The refresh control calls it with `{ forceCheck: true }`. A failed read keeps what was there. The Settings row sits beside `EditorSetting` and writes `engine_update_checks` as `"off"` or `"on"` through `set_preference`.

- [ ] **Step 1: Write the failing tests** from the captured fixture, never a hand-built status:
  - **Picked engine with a status:**
    - the Version row shows its version;
    - with `update_available`, the update command is shown as copyable text and the engine row carries the mark;
    - `installed=false` shows G1's not-installed string with no finding styling;
    - `auth.state === "not_reported"` shows G1's "Not reported";
    - the Settings row lists each file, and Open in editor calls `onOpenSettings(path)`;
    - `checks_on=false` shows G1's checks-off string and no latest figure.
  - **Pending:** with `statuses === null`, no Status row is drawn. Pending is not a finding.
  - **Wiring** (`engine_status_wiring.test.tsx`):
    - `get_engine_status` is invoked with `{forceCheck:false}` on mount and again after `scan://complete`;
    - refresh invokes it with `{forceCheck:true}` and is disabled while that call is pending;
    - the Settings row writes `"off"` and then `"on"`.
- [ ] **Step 2: Run** `npx vitest run src/components/OverviewCard.test.tsx src/__tests__/engine_status_wiring.test.tsx`. Expected: FAIL (the new props and command are not used).
- [ ] **Step 3: Implement** to the ruling: tokens and `typeRoles` only, `strokeFor` icons, no count computed in the webview.
- [ ] **Step 4: Run** the two files; expected PASS. Then run the four gates. The guards that must stay green with no new allowlist entry: `no-frontend-counting`, `no-off-token-styles`, `type-roles`, `no-hardcoded-engine-copy` and `design-system-coverage`.
- [ ] **Step 5: Screenshot** the dev app per `verifying-ui.md` (dev pid, owner `tauri-app`, window ≥ 900×600, theme read from the store and named): Claude Code picked, one engine with an update, one Not reported. happy-dom cannot see layout, so the frame is the evidence for placement.
- [ ] **Step 6: Commit** `feat(engines): Status rows on the overview card's engine section`, by the Global Constraints' `App.tsx` recipe: exact blob for `src/App.tsx`, `git add` for the rest, `git diff --cached --name-only`, then a bare `git commit` in its own call with no paths and no `-n`. Then build the commit in a detached worktree and run `npx vitest run` there.

### Task 10: Signed out and unreadable settings become findings (after G1)

**Files:**
- Modify: `src/utils/reviewIssues.ts` (`IssueKind` gains `"signed_out" | "settings_unreadable"`; `IssueCategory` gains G1's category; `ReviewCounts` gains matching fields, accumulated in loops per the file's header), `src/App.tsx` (pass `engineStatus?.engines` in; exact blob), and `NeedsReviewPane.tsx` / `ReviewSidebar.tsx` only as far as the new category needs. **This plan edits these files before P3** (ruling R5): P3's Task 10 adds `"secret" | "unpinned"` to the same `IssueKind`, `ReviewCounts`, `LEGEND` and aria label, and rebases onto this task. Tell P3's session over `SendMessage` when this task merges, with the SHA.
- Test: `src/utils/reviewIssues.test.ts`, `src/__tests__/needs_review_pane.test.tsx`

**Interfaces:**
- Consumes: `EngineStatus[]` (Task 8).
- Produces: `deriveReviewIssues(inventory: Inventory | null, engines?: EngineStatus[] | null): ReviewDerivation`. The existing caller and existing tests are unchanged.

- [ ] **Step 1: Write the failing tests** from the fixture:
  - an installed engine with `auth.state === "signed_out"` → one `signed_out` issue named by `engine_name`;
  - each `settings[]` entry with `health === "unreadable"` → one `settings_unreadable` issue;
  - none of these produce an issue: `update_available`, `not_reported`, `installed=false` (even with a `signed_out` value), `health === "missing"`;
  - `counts.total` includes the new issues;
  - with no `engines` argument, the result equals today's for the same inventory.
- [ ] **Step 2: Run** `npx vitest run src/utils/reviewIssues.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it and `src/__tests__/needs_review_pane.test.tsx`; expected PASS. Then the four gates.
- [ ] **Step 5: Commit** `feat(engines): a signed-out CLI and an unopenable settings file are findings`, by the Global Constraints' `App.tsx` recipe (exact blob, bare `git commit`), then build it in a detached worktree and run `npx vitest run` there.

### Task 11: HUMAN GATE G3, the live check on a Finder-launched build (stops for Karthik)

- [ ] **Step 1:** Run the branch's dev app through one scan and one daily check. Then read the store, read-only: `sqlite3 -readonly "$HOME/Library/Application Support/com.rkarthik.hanger/hanger.db" "select key, value from preferences where key like 'engine_%';"`. Expect an `engine_latest:<id>` row for each installed engine with a package. An older build never wrote these keys (`verification.md`, "A live proof against the real store reads what older builds wrote").
- [ ] **Step 2:** Build the app (`bun run tauri build`) and open the `.app` with `open`, as Finder does, so it inherits the minimal GUI `PATH`. `tauri dev` inherits the terminal's PATH and proves nothing here.
- [ ] **Step 3: STOP for Karthik.** He picks each engine on the card. The artefacts:
  - a screenshot per engine from the built app, showing versions matching `--version`;
  - OpenCode reporting the login shell's first install;
  - his real sign-in states;
  - one Open in editor;
  - one refresh, followed by a store read showing a newer `checked_at_ms`.

  His "done" without the frames and the store read does not close the gate.
- [ ] **Step 4:** Turn checks off. Refresh, and read the store: `checked_at_ms` is unchanged, so no request was made.
- [ ] **Step 5:** Capture the per-kind counts again with Task 1's query. Every row must match the baseline; a move is a blocker to report.
- [ ] **Step 6:** Report with the evidence. Karthik closes the piece; automation does not.

## Human gates, and where they sit

| Gate | Task | Blocks | Artefact that opens it |
|---|---|---|---|
| G1: naming brief for the Status rows, the states, the off preference and the finding category | Task 3 | Tasks 9, 10 | Signed-off strings recorded in the brief file |
| G2: combined card layout round (T19 Status rows, P2 repository row action, P5b skill figures, P6 applies line, P4b profile control) | Task 4, right after the interface tasks | Task 9, and the card tasks of P2, P5b, P6, P4b | `docs/plans/2026-11-28-card-layout-round.md` with his ruling verbatim, plus the options HTML and PNGs |
| G3: live check on a Finder-launched build | Task 11 | Closing T19 | Built-app screenshots per engine, plus store reads of `engine_latest:*` before and after a refresh |

Tasks 1, 2 and 5–8 need no gate and run while G1 and G2 wait. `stage-gate --plan` gates this file. `stage-gate --dev` runs before every push, and `--release` after merge.

## Cross-plan interfaces

Every name here matches its consumers' plans; the full table is `docs/plans/research/2026-11-28-cross-plan-interfaces.md`.

**Owned here, landed first (Tasks 1–2, then 5), for others to build on** (ruling R5):
- `engine_status::clis::{ENGINE_CLIS, EngineCli, cli_for, LatestSource, AuthProbe}`: P4 (a profile load approved through P1's queue finds `claude` with `cli_for("claude-code")`), P5 (`claude plugin` finds `claude` through `cli_for("claude-code").bin`; `gh` is not an engine and is resolved with `resolve::resolve_in("gh", …)` directly) and P8 (which engine program to spawn).
- `engine_status::version::{parse_version, is_newer, COMMAND_TIMEOUT}`: P8 (`MIN_CLAUDE` and the readiness check).
- `engine_status::auth::{parse_auth, AuthState}` and `AuthProbe::ClaudeJson` (Task 5): P8, which calls `parse_auth(AuthProbe::ClaudeJson, …)` on `claude auth status` for its readiness copy. Which `authMethod` value means "subscription" is unmeasured: the signed-in shape has never been seen here.
- `engine_status::install::{InstallMethod, install_method, Channel, claude_channel, update_command}`: used inside this plan only. No other plan consumes them today.
- `engine_status::run::run_capture`, signature frozen: P2 (the git check), P3 (`vendor`) and P5 call it unchanged, and P8 adds its streaming sibling `engine_status::stream::run_streaming` beside it without changing this one.
- `EngineStatus.version` and `EngineStatus.auth` from `get_engine_status` (Task 8): P8, to check installed and signed in before a run. P6 doesn't version-gate its applies line.
- The overview card's Status rows and the round's ruling file: P2, P5b, P6 and P4b each draw their addition into `OverviewCard` per `docs/plans/2026-11-28-card-layout-round.md`, in the design §5 order (P2 → P5b → P6 → P4b).
- `src/utils/reviewIssues.ts` and its two panes: this plan's Task 10 edits them first, and P3's Task 10 rebases onto it (ruling R5).

**Consumed from other plans:**
- `mcp::switch::context::EngineContext` and `get_engine_contexts` (owner **P2, slice 2**, whose `mcp::switch::context` defines them; design §5 lists `get_engine_contexts` under this plan's overview-card row, and this plan leaves it untouched): read unchanged. T19 adds a sibling reply and no field. P2 makes `get_engine_contexts` an `async fn` command; this plan's wiring awaits it the same way.
- `EngineContext.applies`, filled by **P6** with one of `next_turn`, `after_reload`, `next_session` (`Option<String>`), for the card's applies line.
- For Task 4 only, each plan's card addition and its working strings: "Off in this repo" as a repository card row action (**P2**), skill figures in the kinds rows with an "over the cap" note (**P5b**, round 44 Q7), the applies line from `EngineContext.applies` (**P6**), and the profile control (**P4b**). A plan that has not stated its addition by the round's date gets a provisional slot. The task waits on none of them to start.

## Known limits

- **Antigravity CLI's settings file, `.gemini/config/config.json`, has no cited source.** It exists on this machine (existence checked, not read); `AGENT_CONFIGS` gives the root `.gemini/config` and `registry.rs` names only `mcp_config.json` there. Cite a source, or drop the row's settings file, before Task 6 ships.
- **npm's tag is the comparison for every install method.** For a Homebrew install, npm can lead the formula (OpenCode: brew 2.4.1, npm 2.4.2), so the badge offers `brew upgrade <name>`, which does nothing until the formula catches up. `update_command` for `Homebrew` carries a `shortcut:` comment saying so; suppress the badge for `Homebrew` if Karthik prefers, once a brew source exists.
- **The Homebrew layouts are reasoned, not measured**: no Homebrew install of the five CLIs exists here.
- **A forced refresh can overlap the daily check** and make one duplicate request (Task 8).
