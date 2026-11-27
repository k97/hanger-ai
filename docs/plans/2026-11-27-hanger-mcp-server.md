# Hanger's own MCP server: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a stdio MCP server inside the Hanger binary that the user's own engines launch, answering read-only questions about the harness first, and later filing switch proposals that a person approves in Hanger's window.

**Architecture:** `"/Applications/Hanger AI.app/Contents/MacOS/Hanger AI" mcp` branches in `main.rs` before Tauri starts and serves MCP over stdio with the official Rust SDK (`rmcp`). It reads Hanger's store read-only and reads engine config files through the same `discover` and `mcp::switch::ops` code the app uses. It never writes an engine's config: in phase 2 it writes a proposal file into Hanger's data directory, and the running app applies an approved proposal through the existing switch code, in its own process.

**Tech Stack:** Rust 2021 crate `tauri-app` (lib `tauri_app_lib`), `rmcp` 3.12.0, `rusqlite` 0.31 bundled, `tokio` 1, React 19 + Vitest for the phase 2 approval surface.

**Spec:** `docs/plans/2026-11-27-harness-model-layer-research.md`, "Options for Hanger" (option A), section 5 "Safety", and "Rulings (Karthik, 2026-11-27, in Plannotator)". Ruling 3 is binding: "Hanger ships an MCP server of its own first, before any in-app model."

## Evidence this plan rests on

Every external URL was accessed 2026-11-27. "Verified" means the page was read, through a fetch tool that summarises. "Inferred" means reasoning or a summary that did not quote the point.

**The MCP spec (2026-07-28).**
- Sampling is deprecated: "Deprecate the Roots, Sampling, and Logging features", with the advice to "integrate directly with LLM provider APIs instead of Sampling" ([changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog), verified). This plan uses no sampling.
- The protocol is stateless: the changelog says "remove the `initialize`/`notifications/initialized` handshake" and "servers MUST implement" `server/discover` (same page, verified). Elicitation is now carried in an `InputRequiredResult` under the Multi Round-Trip Requests pattern, and servers no longer send requests (same page, verified).
- stdio: "Messages are delimited by newlines, and MUST NOT contain embedded newlines"; "The server MUST NOT write anything to its `stdout` that is not a valid MCP message"; the server "MAY write UTF-8 strings to `stderr`"; "Servers SHOULD exit promptly when their standard input is closed" ([stdio](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio), verified).
- Backward compatibility: a client that also speaks a legacy version "SHOULD probe with `server/discover`" and falls back to `initialize` on any other error (stdio page, verified). So the server must answer both eras.
- Tools: servers "SHOULD return tools in a deterministic order"; a no-parameter tool should use `{ "type": "object", "additionalProperties": false }`; a tool returning structured content "SHOULD also return the serialized JSON in a TextContent block"; input errors are tool execution errors with `isError: true`; servers "MUST: Validate all tool inputs, Implement proper access controls, Rate limit tool invocations, Sanitize tool outputs"; clients "MUST consider tool annotations to be untrusted" ([tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools), verified).

**rmcp, the official Rust SDK.**
- Latest 3.12.0, published 2026-11-26, repository `https://github.com/modelcontextprotocol/rust-sdk/` ([crates.io API](https://crates.io/api/v1/crates/rmcp), verified).
- "The SDK implements the stable MCP `2026-07-28` specification and remains compatible with `2025-11-25` and earlier versions" ([README](https://raw.githubusercontent.com/modelcontextprotocol/rust-sdk/main/README.md), verified through a summary). The changelog has "keep initialize on legacy protocol versions" (3.2.0) and "server discovery and negotiation (SEP-2575)" (3.0.0-beta.1) ([CHANGELOG](https://github.com/modelcontextprotocol/rust-sdk/blob/main/crates/rmcp/CHANGELOG.md), verified through a summary).
- Default features `base64`, `chrono`, `macros`, `server`; `transport-io` adds tokio `io-std` for stdio ([features](https://docs.rs/crate/rmcp/3.12.0/features), verified). Workspace `edition = "2024"`, `rust-version = "1.88"`, licence Apache-2.0 ([workspace Cargo.toml](https://raw.githubusercontent.com/modelcontextprotocol/rust-sdk/main/Cargo.toml), verified). The minimal server is `#[tool_router(server_handler)]` on an impl, `#[tool(description = …)]` per tool, `.serve(stdio())` (README, verified through a summary). The exact 3.12 type for returning `structuredContent` was not read on docs.rs (inferred: Task 5 checks it).
- This machine has `rustc 1.97.1`; `Cargo.lock` already resolves `schemars` 1.2.3 and `tokio` 1.54.1, and has no `rmcp` (read 2026-11-27).

**The tree (read 2026-11-27, `HEAD` 37d76b4).**
- The store runs a rollback journal: no `journal_mode` pragma exists under `src-tauri/src` (grep), and `invariants.md` says so.
- Every store read the tools need goes through `PreferencesStore::new`, which runs `init_db` (table creation and the `PRAGMA user_version` migrations): `scanner::count_assets` (`scanner.rs:24`), `search::search` (`search.rs:273`), `preferences::get_probe_result` (`preferences.rs:1845`). `annotations::asset_annotations` opens `Connection::open` read-write (`annotations.rs:113`). A second process calling them as they are would open the store read-write and could create it where none exists.
- rusqlite 0.31 sets a 5 s busy timeout on every connection it opens (`~/.cargo/registry/src/*/rusqlite-0.31.0/src/inner_connection.rs:121`, `sqlite3_busy_timeout(db, 5000)`). Only the two index writers (`search.rs` → `index_connection`) and the skill switch's store connection raise it to 30 s. So most of the app's writers give up after 5 s of waiting, and `search.rs`'s comment says a dropped index write is silent. Under a rollback journal a reader holds SHARED while its statement runs, and a writer cannot commit until every SHARED lock is gone. The server's reads can therefore starve the app's writers, as well as the other way round.
- The store is at `user_version` 8 (`preferences.rs:697`); no constant names that number.
- The store keeps no record of a completed scan. `scanned_at` and `last_scan` appear nowhere under `src-tauri/src`, and the frontend holds `lastScanAt` in memory only (`src/App.tsx`). `MAX(assets.last_seen)` cannot tell a scanned machine with no assets from one never scanned. `lib.rs` → `finish_scan` is the post-step of every `start_scan`, and `start_scan` is the only scan the webview starts (`src/App.tsx:1040`). It takes no `AppHandle` and `tests/mcp_launches_tests.rs` already calls it.
- The app's data directory comes from Tauri (`lib.rs` → `get_db_path`, `switch_places`, `skill_places`): `hanger.db`, `switch/backups`, `switch/stash`, `kept/skills`. On this machine it is `~/Library/Application Support/com.rkarthik.hanger/` (listed: `hanger.db`, `kept`, `switch`). `scanner::get_home_dir` honours `HANGER_TEST_HOME`, then `HOME`.
- `skill_switch::ops`: "One process-wide lock serialises every Off and On." `mcp::switch::apply`: "Two Hanger writes to one file at the same moment are not serialised. There is no lock." A second process writing engine configs would bypass both. This is why the server never writes them.
- Needs review findings are derived in the frontend (`src/utils/reviewIssues.ts` → `deriveReviewIssues`, kinds `broken`, `drifted`, `duplicate`, `parse`). Their inputs come from the backend in three forms. `AssetAnnotation::mechanism` gives `broken` and `drift` for global roots only, recomputed on each read. Every scope's per-asset drift is worked out by the scanner during its walk (`scanner.rs` → `check_asset_drift` against `deploy_checksums`, then `LinkState::Drifted` at `scanner.rs:1375`, `:1478`, `:2087`, `:2475`) and returned in the scan's `Inventory`. It is not a column of `assets`. `reviewIssues.ts` → `faultOf` reads it. Failed parses are `assets.parse_status`.
- `parse_error` holds "the parser's own words" (`reviewIssues.ts`), so it may quote file text.
- Asset names are untrusted, uncapped text. A skill's name comes from its frontmatter (`name: fm.name.clone()` at `scanner.rs:1497`, `:1637`, `:2096`, `:2218`), and a server's name is whatever its config file declares.
- `sanitise_path` reads `HOME` from the process environment (`preferences.rs:22-35`). `scanner::get_global_agents` and `annotations.rs:307` call `get_home_dir()`, which reads `HANGER_TEST_HOME` and then `HOME`. `agents::engine_base` reads `CODEX_HOME` and `CLAUDE_CONFIG_DIR`. `ipc_boundary_tests.rs` → `switch_bench` copes with this by calling `std::env::remove_var` on both variables and passing its own `system` root. In-process tests of anything built on these functions see the developer's real home and environment.
- `mcp::probe::probe` is a stdio MCP client speaking `CLIENT_PROTOCOL_VERSION = "2025-06-18"`: `initialize` at `probe.rs:605`, then `tools/list` at `:657`, inside `exchange`. It is a ready legacy-era client for the protocol test. The `initialize` at `:384` is in `probe_http`.
- `tauri-plugin-mcp-bridge` 0.13 is registered only under `#[cfg(debug_assertions)]` (`lib.rs:2205-2209`) and listens for the dev automation tool. It is a different server and this plan does not touch it.
- `tauri.conf.json`: `identifier` `com.rkarthik.hanger`, `mainBinaryName` `Hanger AI`. The installed binary is `/Applications/Hanger AI.app/Contents/MacOS/Hanger AI` (listed). Its path has a space.
- `README.md`'s `tests` region counts files under `src-tauri/tests/` (48 today, `ls`), and `src/__tests__/readme-sync.test.ts` fails when it is stale. Its `ipc` region counts `generate_handler!` entries and says "three events" as fixed text (`readmeCounts.ts:88`).
- `docs/TODO.md` T22 (Antigravity's config as a source in `registry.rs` `HOSTS`/`SOURCES`) runs alongside this work, and research ruling 4 splits Gemini CLI and Antigravity into two engines. Either change alters what `list_engines` and `engine_context` return. A table that grows must raise its floor in `src/__tests__/brand-coverage.test.ts` in the same commit (`shared-asset-machinery.md`).

## Decisions

1. **Process shape: a stdio subcommand of the shipped binary.** Engines launch `"<Hanger AI.app>/Contents/MacOS/Hanger AI" mcp`. It needs the app neither running nor open: it reads the store and the config files. A local HTTP endpoint would need the app running, a port, and a credential in every engine's config; a separate sidecar binary would need its own signing and notarisation. Ruling 3; Question 1 asks Karthik to confirm.
2. **SDK: `rmcp` 3.12.0**, features `server` and `transport-io`, because it already serves both protocol eras and the spec is churning (Question 2).
3. **The server reads, and never writes an engine's config.** Read-only store connections (Task 1) and the same read paths the app uses. No tool starts a process: `ops::measure_for` (which probes servers) and `claude_cli_for` (which runs a login shell) are never called.
4. **Writes are proposals, approved in Hanger's window** (phase 2). The research's option A: "a `switch_server` proposal that Hanger's UI approves". The approving person sees Hanger's own statement of the change, and the app applies it with the existing `set_enabled_for` / `undo_for` in its own process, keeping the skill switch's lock and the switch's single writer. Question 3.
5. **No model output reaches the screen.** A proposal carries a kind, an engine id, a key and a state, all checked against Hanger's own data. It carries no free text. So `docs/TODO.md` T23 is not triggered (Question 7 offers the alternative, which would trigger it).
6. **What leaves the process: fewer fields than research rule 6 allows.** Rule 6 lists "names, transport, command basename and env and header key names". This plan sends names, kinds, `~`-sanitised paths, states, Hanger's own reasons, and counts and token estimates computed in Rust. It drops transport, command basename and env and header key names. That is stricter than the rule, and it is a choice, not the rule followed. Never sent: launch arguments, env names or values, file bodies, `parse_error`, a raw home path. Asset descriptions and search snippets are left out of the first slice. Names are untrusted frontmatter or config text, so each one is capped and checked before it leaves (Question 4 asks for the cap and the fields).
7. **Findings: the backend subset, from two scopes.** `broken` and `drift` come from `annotations` and cover global roots only. Failed parses come from `parse_status` and cover every scope. The reply says which scope each list covers. Project-scope drift is left out, because only a scan's walk computes it. Duplicates stay in the frontend until `deriveReviewIssues` has a Rust owner (Question 5). Tool copy must not call this "Needs review".
8. **Install: copyable instructions in `docs/mcp-server.md`.** Hanger does not register itself: that is an add-a-server write, T18 slice 3, which is unbuilt (Question 6). Once a user adds it, Hanger's own server is one more MCP server in the inventory, found by `discover` like any other, with no special case.
9. **Read-only first.** Phase 2 (Tasks 8 to 11) starts only after the phase 1 live proof and Question 8.
10. **Ruling 3 is read as replacing option A's first ship.** Option A reads "First ship: deterministic findings (hash change, plaintext secret slot, unpinned `npx`/`uvx`, `curl | sh` in SKILL.md), the Antigravity and shared-directory reach fixes, and engine status. Then a stdio MCP server." This plan builds the server first over the findings that already exist, and leaves the new deterministic findings to their own plan. Karthik confirms or reverses this through Question 8.
11. **"Scanned" is a preference written by `finish_scan`.** Task 1 makes `lib.rs` → `finish_scan` write the preference `last_scan_completed_ms` after it records launches and rebuilds the index. The server answers `NotScannedYet` only when that key is absent. A store whose last scan found nothing then answers empty, and the empty answer is a finding (`ui-copy.md`). `as_of_ms` is that preference's value, not `MAX(last_seen)`. An install upgraded to this build reads `NotScannedYet` until its next `start_scan`, which the app runs at launch. This is a write on the app's scan path, so Task 1 captures the per-kind counts before and after (`shared-asset-machinery.md`).
12. **The server's reads are bounded, so the app's writers are not starved.** Each tool's queries run through `store_read::with_read_deadline` with `READ_DEADLINE = 1 s`, a fifth of the 5 s the app's default writers wait. A query still running at the deadline is interrupted through `rusqlite::Connection::get_interrupt_handle` (core rusqlite 0.31, no feature flag: `rusqlite-0.31.0/src/lib.rs:990`), and the tool answers `Busy`. Every `_on` function collects its rows and drops its statements before it does any filesystem work, so no SHARED lock is held while files are read. The server itself waits up to 30 s for the app's writers, because a pending writer blocks new readers and the server is the one that should give way.

## Global Constraints

- Stage-gate: a fresh reviewer runs `stage-gate --plan` on this file before Task 1, and `--dev` before any push (`CLAUDE.md` → Gates). Not the author.
- Gates are the four in `CLAUDE.md` → Verification, from the stated directories, each in its own call: `npx vitest run` (repo root), `cargo test` (`src-tauri/`), `bunx tsc --noEmit` (report the exit code), and both `gitleaks` commands (repo root).
- Every change under `src-tauri/src/` gets its own red/green cycle and its own diff (`verification.md`).
- A new file under `src-tauri/tests/` moves the README `tests` figure: regenerate with `~/.bun/bin/bun run src/__tests__/readmeCounts.ts` in the same commit. A new Tauri command does the same for the `ipc` figure.
- Nothing in `src-tauri/src/mcp_server/` writes to stdout except `rmcp`'s transport. No `println!` or `print!` there.
- The `mcp` subcommand initialises no telemetry (no Sentry, GA4 or PostHog) and no `tauri_plugin_log`. Model inputs and outputs never reach telemetry.
- No relative path is ever used for a write: the engine launches the server in a project folder (`known-debt.md`, `transactional::write_transactional`). Never call `execute_deploy` or `transactional` from this module.
- Store connections opened by the server are `SQLITE_OPEN_READ_ONLY` with a 30 s busy timeout, the timeout `search.rs:81` and `skill_switch/ops.rs:217` use (`invariants.md`).
- Every server query runs inside `with_read_deadline` (Decision 12). No `_on` function holds a statement open across filesystem work.
- Test isolation. Anything that calls `sanitise_path`, `get_home_dir`, `get_global_agents`, `annotations`, `discover` or `engine_base` is tested in a child process whose environment the test sets in full (`env_clear()`, then `HOME` and `HANGER_TEST_HOME` set to one canonicalised fixture home, plus only the variables that test names). That covers the annotation comparison in Task 1 and the tool tests in Tasks 3, 4 and 8. The child is either the built binary (Task 5) or the test binary re-running one `#[ignore]` helper (Task 3, "child helpers"). In Tasks 3, 4 and 8 the system root is a fixture, passed through `server_places_at`. Task 5's tests run the built binary, which reads the real `/`, so they assert only the protocol's shape and the tool names, never what a context holds. No test calls `set_var` or `remove_var`. Every sanitisation test asserts positively that a path starts with `~/`, so it fails if the sanitising is removed.
- Counts are computed in Rust and returned, never derived by a caller (`invariants.md`).
- Every user-facing string (tool names, tool descriptions, refusal texts, instructions, phase 2 UI copy) gets a naming brief, a `/humanizer` pass and Karthik's sign-off before it lands (`ui-copy.md`). Copy must be literally true of the code.
- Commits: explicit paths for files only this work touches; hunk staging for shared files (`src/App.tsx`); never `-a`; a commit runs in a Bash call of its own with no `-n` anywhere in it (memory: commit hook).
- `cargo test` relaunches the dev app: never run it during a capture sequence (`verifying-ui.md`).
- Anything that writes a real engine config on Karthik's machine waits for Karthik.

## Review Focus

1. **Hanger has never scanned, or the store is missing.** A person asks "what skills do I have" before the first scan. They expect "Hanger hasn't scanned yet", not zero (`ui-copy.md`: empty is a finding, pending is not). Pinned in Task 1 (`a_missing_store_is_not_scanned_yet_and_is_not_created`) and Task 3 (`every_read_tool_refuses_before_the_first_scan`).
2. **The app and the server contend for the lock, in both directions.** While the app is mid-scan, the server's read waits and then answers. It never migrates or creates the store. While the server is reading, the app's writers (5 s default) still commit, because the server's read gives way at 1 s. Pinned in Task 1 (`a_read_waits_out_a_writer_holding_the_lock`, `an_app_write_succeeds_while_a_server_read_is_in_progress`, `a_store_at_another_version_is_refused_and_left_unmigrated`).
3. **The engine's environment differs from the app's.** An engine launched from a terminal may carry `CODEX_HOME` or `CLAUDE_CONFIG_DIR`, and an app opened from Finder does not. Config reads follow the server's own environment through `agents::engine_base`, the same chokepoint the app uses, while store answers reflect the app's last scan. Pinned in Task 3 (`a_relocated_codex_home_is_read_where_the_env_says`). Every reply carries `as_of_ms` so the caller can see the store's age.
4. **Anything printed on stdout.** One stray line breaks the engine's connection. Pinned in Task 5 (`every_stdout_line_is_one_json_rpc_message`, `the_server_module_never_prints`).
5. **The space in `Hanger AI`.** An unquoted path in a shell command or a split `command` string fails to launch. Pinned in Task 5 (`the_server_launches_from_a_path_with_a_space`) and checked live in Task 7.

---

## Gate G0: Karthik rules on the Questions

- [ ] Send "Questions for Karthik" through Plannotator (memory: ask through Plannotator) and record his answers under a "Rulings" heading at the end of this file. Where a ruling differs from a Decision above, amend the Decision and the tasks it touches before Task 1 starts.

---

## Phase 1: read-only

### Task 1: Read the store safely from a second process

**Files:**
- Create: `src-tauri/src/store_read.rs`
- Modify: `src-tauri/src/lib.rs` (`pub mod store_read;`; `finish_scan` writes `last_scan_completed_ms`)
- Modify: `src-tauri/src/preferences.rs` (`STORE_VERSION`, `LAST_SCAN_KEY`, `get_probe_result_on`). The v8 step keeps its literal `PRAGMA user_version = 8;`. If that step read the constant, bumping the constant for a v9 migration would make the v8 step write 9 and skip migration 9.
- Modify: `src-tauri/src/scanner.rs` (`count_assets_on`), `src-tauri/src/annotations.rs` (`asset_annotations_on`), `src-tauri/src/search.rs` (`search_on`), `src-tauri/src/mcp/switch/ops.rs` (`cached_measure_on`)
- Test: `src-tauri/tests/store_read_tests.rs` (new), `src-tauri/tests/store_migration_tests.rs`, `src-tauri/tests/mcp_launches_tests.rs`

**Interfaces:**
- Produces:
  - `preferences::STORE_VERSION: i32 = 8`, pinned only by the test below
  - `preferences::LAST_SCAN_KEY: &str = "last_scan_completed_ms"`
  - `store_read::StoreUnavailable` (`Serialize`, snake_case): `NotScannedYet`, `OtherVersion`, `Busy`, `Unreadable`, with `fn code(self) -> &'static str`
  - `store_read::READ_DEADLINE: Duration = 1 s`
  - `store_read::open_read_only(db_path: &Path) -> Result<rusqlite::Connection, StoreUnavailable>`
  - `store_read::with_read_deadline<T>(conn: &Connection, limit: Duration, read: impl FnOnce(&Connection) -> Result<T, StoreUnavailable>) -> Result<T, StoreUnavailable>`: a thread calls `conn.get_interrupt_handle().interrupt()` at `limit`, and an interrupted query is `Busy`
  - `store_read::last_scan_ms(conn: &Connection) -> Result<Option<i64>, StoreUnavailable>`: the `LAST_SCAN_KEY` preference parsed as `i64`; `None` when it is absent
  - `scanner::count_assets_on(conn: &Connection, root: Option<&str>, grouping: Grouping) -> Result<AssetCounts, String>`
  - `annotations::asset_annotations_on(conn: &Connection) -> Result<Vec<AssetAnnotation>, String>`: it reads every row it needs and drops its statements before any filesystem call
  - `search::search_on(conn: &Connection, query: &str, limit: usize) -> Result<SearchResponse, SanitisedError>`
  - `preferences::get_probe_result_on(conn: &Connection, launch_hash: &str) -> Result<Option<CachedProbe>, SanitisedError>`
  - `mcp::switch::ops::cached_measure_on(conn: &Connection, launch_key: &str) -> Option<Measured>`
  - The existing path functions keep their signatures and call the `_on` variants.

- [ ] **Step 0:** Capture the per-kind counts (`shared-asset-machinery.md`, query as in Task 7 Step 1), because `finish_scan` is on the app's scan path.
- [ ] **Step 1: Write the failing tests** in `store_read_tests.rs`:
  - `a_missing_store_is_not_scanned_yet_and_is_not_created`: `open_read_only(dir/"hanger.db")` is `Err(NotScannedYet)`, and the file does not exist afterwards.
  - `a_read_only_store_refuses_a_write`: on a store made by `PreferencesStore::new`, `conn.execute("INSERT INTO preferences VALUES ('k','v')", [])` is an error.
  - `a_store_at_another_version_is_refused_and_left_unmigrated`: set `PRAGMA user_version = 7` on a fresh store. `open_read_only` is `Err(OtherVersion)`, and reading `user_version` with a plain connection afterwards gives 7.
  - `a_read_waits_out_a_writer_holding_the_lock`: a thread holds `BEGIN EXCLUSIVE` for 6 s, longer than rusqlite's 5 s default, so the server's own 30 s timeout is what is tested. `open_read_only`, then `last_scan_ms` on the main thread, returns `Ok` after at least 5.5 s.
  - `an_app_write_succeeds_while_a_server_read_is_in_progress`: the store holds 2,000 asset rows. On one thread, `with_read_deadline(conn, READ_DEADLINE, …)` runs a query that takes far longer than 5 s while it holds SHARED: `WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT count(*) FROM c, assets` with no limit. 200 ms in, a second thread does `PreferencesStore::new(..).set_preference("k", "v")` with rusqlite's default 5 s timeout. Assert that the write is `Ok` and lands within 5 s, and that the read is `Err(Busy)`. Red run: the same test with `with_read_deadline` replaced by a direct call must see the write fail with `database is locked`. Paste both runs into the checkpoint.
  - `a_store_never_scanned_has_no_last_scan`: `last_scan_ms` is `Ok(None)` on a fresh store.
  - `the_on_variants_answer_what_the_path_variants_answer`: on a fixture store built as `search_tests.rs` builds one (`index_inventory`), `count_assets_on` equals `count_assets` (compare serialised JSON), `search_on` equals `search` for one query, and `asset_annotations_on` equals `asset_annotations`. Run in a child process (Global Constraints, test isolation), because `annotations.rs:307` calls `get_home_dir()`.
  - In `mcp_launches_tests.rs`: `a_finished_scan_records_when_it_finished`. After `finish_scan`, the store's `LAST_SCAN_KEY` holds a number within 5 s of now. A second `finish_scan` on an inventory with no assets also sets it, so an empty scan still counts as a scan.
  - In `store_migration_tests.rs`: `store_version_is_the_version_a_fresh_store_reaches`: `PRAGMA user_version` of a fresh `PreferencesStore::new` equals `STORE_VERSION`.
- [ ] **Step 2: Run** `cargo test --test store_read_tests --test store_migration_tests --test mcp_launches_tests` from `src-tauri/`. Expected: compile failure on the missing names (red).
- [ ] **Step 3: Implement.**
  - `open_read_only`: if `Path::exists` is false, the answer is `NotScannedYet`. Open with `Connection::open_with_flags(path, SQLITE_OPEN_READ_ONLY)` and set `busy_timeout(Duration::from_secs(30))`. Read `user_version`; anything but `STORE_VERSION` is `OtherVersion`. A busy error after the timeout is `Busy`; anything else is `Unreadable`.
  - Each `_on` function is the body of its path function minus the open. The path function opens as before and delegates.
  - `finish_scan` calls `PreferencesStore::set_preference(LAST_SCAN_KEY, now_ms)` last. A failure there is logged and not fatal, as the index rebuild is.
- [ ] **Step 4: Run** the same command, then the full `cargo test`. Expected: PASS, and no existing test changed. Re-capture the per-kind counts after a dev-app rescan. They must match Step 0.
- [ ] **Step 5: Commit** the listed files plus the regenerated `README.md`: `feat(store): read the store from a second process without writing it or starving its writers`.

### Task 2: One spelling of Hanger's folders

**Files:**
- Create: `src-tauri/src/mcp_server/mod.rs`, `src-tauri/src/mcp_server/places.rs`
- Modify: `src-tauri/src/lib.rs` (`pub mod mcp_server;`; `switch_places` and `skill_places` call the new constructors)
- Modify: `src-tauri/src/mcp/switch/ops.rs` (`SwitchPlaces::under`), `src-tauri/src/skill_switch/ops.rs` (`SkillPlaces::under`)
- Test: `src-tauri/tests/mcp_server_tests.rs` (new)

**Interfaces:**
- Produces:
  - `mcp_server::places::BUNDLE_ID: &str = "com.rkarthik.hanger"`
  - `mcp_server::places::data_dir_for(home: &Path) -> PathBuf`: `<home>/Library/Application Support/com.rkarthik.hanger`
  - `SwitchPlaces::under(home: PathBuf, system: PathBuf, data_dir: &Path) -> SwitchPlaces`: `backups` `<data>/switch/backups`, `stash` `<data>/switch/stash`. The app passes `/` as `system`, as `switch_places` does today.
  - `SkillPlaces::under(home: PathBuf, data_dir: &Path) -> SkillPlaces`: `store` `<home>/.agents/skills` (`agents::SHARED_AGENTS_DIR`), `keep` `<data>/kept/skills`, `db_path` `<data>/hanger.db`
  - `mcp_server::places::ServerPlaces { home: PathBuf, db_path: PathBuf, switch: SwitchPlaces, skills: SkillPlaces }`, `server_places_at(home: &Path, system: &Path) -> ServerPlaces`, and `server_places(home: &Path) -> ServerPlaces`, which is `server_places_at(home, Path::new("/"))`. The system root is a parameter so that tests never read the real `/Library`.

- [ ] **Step 1: Write the failing tests** in `mcp_server_tests.rs`:
  - `the_bundle_id_is_tauri_confs_identifier`: parse `concat!(env!("CARGO_MANIFEST_DIR"), "/tauri.conf.json")`; `identifier == BUNDLE_ID`.
  - `the_data_dir_is_application_support_under_the_bundle_id`: `data_dir_for("/h")` is `/h/Library/Application Support/com.rkarthik.hanger`.
  - `switch_places_under_a_data_dir_match_the_apps_spelling` and `skill_places_under_a_data_dir_match_the_apps_spelling`: every field as listed above.
- [ ] **Step 2: Run** `cargo test --test mcp_server_tests`. Expected: compile failure (red).
- [ ] **Step 3: Implement** the constructors and `server_places_at`; change `lib.rs`'s two helpers to `SwitchPlaces::under(scanner::get_home_dir(), PathBuf::from("/"), &data_dir)` and `SkillPlaces::under(home, &data_dir)` with `data_dir` from `app.path().app_data_dir()` and its existing `"."` fallback. That Tauri resolves `app_data_dir` to `data_dir_for(home)` on macOS is inferred; Task 7 checks it against the real store path.
- [ ] **Step 4: Run** the test file, then the full `cargo test`. Expected: PASS; `mcp_switch_tests` and `skill_switch_tests` unchanged and green.
- [ ] **Step 5: Regenerate the README** with `~/.bun/bin/bun run src/__tests__/readmeCounts.ts`, because `mcp_server_tests.rs` is a new file under `src-tauri/tests/`. `npx vitest run src/__tests__/readme-sync.test.ts` from the repo root must pass.
- [ ] **Step 6: Commit** the listed files and `README.md`: `refactor(places): one spelling of Hanger's data folders for the app and its server`.

## Gate G1: naming brief for the server's strings

- [ ] Write a naming brief for the five tool names, their `title`s and `description`s, the refusal texts (one per `Refusal` code), and the server's `instructions`. Research what other local MCP servers name similar tools (the brief cites what it read). Each description says what the tool reads, that answers reflect Hanger's last scan, and what it leaves out. Reach covers engine global folders only. Findings are not the whole Needs review list, and drift covers global folders only. The line about Antigravity follows Question 9's ruling: either "Antigravity is not read" (`docs/TODO.md` T22), or nothing once T22 has landed. Copy must be true at the commit that ships it. Run `/humanizer` on every string. Karthik signs off. Task 3 does not start until he has.

### Task 3: The five read tools, as plain functions

**Files:**
- Create: `src-tauri/src/mcp_server/tools.rs`, `src-tauri/src/mcp_server/limit.rs`
- Test: `src-tauri/tests/mcp_server_tests.rs`

**Interfaces:**
- Consumes: Task 1's `open_read_only`, `with_read_deadline`, `last_scan_ms` and `_on` functions; Task 2's `ServerPlaces`; `ops::contexts_for`, `ops::context_for`, `scanner::get_global_agents`.
- Produces (all `Serialize`):
  - `Refusal`: `NotScannedYet`, `OtherVersion`, `Busy`, `Unreadable`, `NotFound`, `BadArgument`, `SlowDown`; `fn code(self) -> &'static str`; `From<StoreUnavailable>`
  - `Fresh<T> { as_of_ms: i64, result: T }`. `as_of_ms` is `last_scan_ms`.
  - `public_name(name: &str) -> String`: control characters (newlines included) become one space each, and the result is cut to 128 characters, ending in `…` when it was cut. Every name that leaves the process goes through it. 128 stands until Question 4 sets the cap.
  - `list_engines(p: &ServerPlaces) -> Result<Fresh<Engines>, Refusal>`; `Engines { detected: Vec<DetectedEngine { id, name }>, mcp: Vec<McpSummary { engine_id, engine_name, on_count, off_count, measured_on_count, on_tokens_measured }>, totals: AssetCounts }`. `detected` from `get_global_agents`, `mcp` from `contexts_for` with `cached_measure_on`, `totals` from `count_assets_on(conn, None, Grouping::PerRegistration)`. The two lists are not joined.
  - `engine_context(p: &ServerPlaces, engine_id: &str) -> Result<Fresh<EngineContext>, Refusal>`: `context_for`, with every `ContextItem::key` passed through `sanitise_path`. An id with no items is `NotFound`.
  - `find_assets(p: &ServerPlaces, query: &str, limit: usize) -> Result<Fresh<FoundAssets>, Refusal>`; `FoundAssets { assets: Vec<FoundAsset { kind, id, path, name, server, place }>, total }`, every path field sanitised, no snippet and no rank. `limit` outside `1..=50` is `BadArgument`.
  - `reach(p: &ServerPlaces, asset_path: &str) -> Result<Fresh<Reach>, Refusal>`: the annotation whose sanitised `asset_path` equals the sanitised argument, else `NotFound`. `Reach { asset_path, mechanism, engines: Vec<{ engine_key, engine_name, reached, reason, via_root }>, beyond: Option<{ kind, count, using_count }> }`, `via_root` sanitised.
  - `findings(p: &ServerPlaces) -> Result<Fresh<Findings>, Refusal>`; `Findings { broken_global, drifted_global, unparsed: Vec<Finding { category, name, path }>, broken_global_count, drifted_global_count, unparsed_count }`. The field names carry the scope (Decision 7). `broken_global` and `drifted_global` come from `asset_annotations_on` (`mechanism` `"broken"`, `"drift"`); `unparsed`, in every scope, comes from `SELECT category, name, abs_path FROM assets WHERE parse_status = 'failed' AND category != 'agent'`. Never `parse_error`.
  - `limit::RateLimit::new(max: usize, window: Duration)` and `fn allow(&mut self, now: Instant) -> bool`, used at 30 calls per 10 s (Hanger's choice, to meet the spec's "MUST rate limit").
  - Every read tool checks `last_scan_ms` before anything else, and refuses with `NotScannedYet` when it is `None`. So no config file is read before that check.
  - Every query a tool runs goes through `with_read_deadline(conn, READ_DEADLINE, …)`.

- [ ] **Step 1: Write the failing tests** in `mcp_server_tests.rs`. Each runs in a child process (Global Constraints, test isolation). The parent builds a canonicalised fixture root with `home/`, `system/` and a store at `data_dir_for(home)/hanger.db`, with `LAST_SCAN_KEY` set. The store is built as `asset_annotations_tests.rs::fixture` and `search_tests.rs` build theirs, and config files are written as `ipc_boundary_tests.rs::switch_bench` writes them, without its `remove_var` calls. The parent then runs `std::process::Command::new(std::env::current_exe())` with `["--exact", "<child helper>", "--ignored", "--nocapture"]`, `env_clear()`, and `HOME` = `HANGER_TEST_HOME` = the fixture home. `MCP_TEST_SYSTEM` (read only by test code) carries the fixture `system/`. The child helper is an `#[ignore]` test that calls the tool with `server_places_at(home, system)` and prints its serialised reply between `<<<` and `>>>`. The parent asserts on what is between the markers. Pairs are named `<test>` and `child_<test>`. A small `fn run_child(name: &str, extra_env: &[(&str, &str)]) -> String` in the file does the plumbing.
  - `every_read_tool_refuses_before_the_first_scan`: one store with no `LAST_SCAN_KEY` and one missing store. Each of the five tools returns `NotScannedYet`.
  - `an_empty_scanned_store_answers_empty_not_pending`: `LAST_SCAN_KEY` is set and there are no assets. `findings` is `Ok` with three zero counts, and `find_assets("x", 10)` is `Ok` with `total == 0`.
  - `list_engines_counts_come_from_the_store`: `totals` equals `count_assets_on` for the same store. One Codex server declared on gives an `McpSummary` with `on_count == 1`.
  - `engine_context_keys_are_sanitised`: every `key` and `config_path` starts with `~/`. None contains the fixture home's spelling or its canonical spelling. The `~/` check is the one that fails when sanitising is removed.
  - `an_unknown_engine_is_not_found`.
  - `find_assets_rejects_a_limit_of_zero_and_of_fifty_one`, `find_assets_returns_no_snippet`.
  - `reach_answers_for_a_global_skill_by_its_sanitised_path`: the skill's name is unique in the fixture. The argument is the full `~/.agents/skills/<unique>/SKILL.md` form, and the reply's `asset_path` equals it. `reach_of_a_path_hanger_has_not_annotated_is_not_found`, and `reach_does_not_match_on_a_shared_basename`: two skills both have `SKILL.md`, and asking for one returns that one.
  - `findings_name_a_failed_parse_without_its_parser_message`: an asset with `parse_status = 'failed'` and `parse_error` `"PARSE_MARKER"` appears in `unparsed`. The serialised output has no `PARSE_MARKER`, and `unparsed_count == 1`.
  - `a_name_with_a_newline_and_500_characters_leaves_as_one_line_of_at_most_128`: a skill whose frontmatter `name` is `"IGNORE PREVIOUS\n" + "x".repeat(500)`. In `find_assets`, its name has no `\n` and is at most 128 characters.
  - `a_relocated_codex_home_is_read_where_the_env_says`: `extra_env` sets `CODEX_HOME` to a fixture folder. Its server appears in `engine_context("codex")`, and the same config at `~/.codex` does not.
  - `the_thirty_first_call_in_ten_seconds_is_refused_and_the_window_slides`. This one is pure and runs in-process.
- [ ] **Step 2: Run** `cargo test --test mcp_server_tests`. Expected: red.
- [ ] **Step 3: Implement** each function. Open the store, check `last_scan_ms`, call the existing reader under the deadline, and map to the reply type. Sanitise every path with `preferences::sanitise_path` and pass every name through `public_name`. Use Gate G1's strings for nothing here: these functions return data and codes only.
- [ ] **Step 4: Run** the test file, then the full `cargo test`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(mcp-server): five read tools over the store and the config files`.

### Task 4: The server's boundary

**Files:**
- Create: `src-tauri/tests/mcp_server_boundary_tests.rs`
- Modify: `README.md` (regenerated `tests` figure)

**Interfaces:**
- Consumes: Task 3's five functions.

- [ ] **Step 1: Write the test** `no_reply_carries_a_config_value_asset_text_or_raw_home`. Fixture: a Codex `config.toml` server whose command, argument, env name and env value are the four markers `ipc_boundary_tests.rs` uses (`SWITCH_COMMAND`, `SWITCH_ARG`, `SWITCH_ENV_NAME`, `SWITCH_ENV_VALUE`, re-declared locally); a global skill whose description and body are `SKILL_MARKER`; a failed parse with `parse_error` `PARSE_MARKER`; a probe cache row (`index_probe_tools`) whose tool description is `TOOL_MARKER`. Run it in a child process as in Task 3, with `HOME` set to the fixture home, so that a raw home in a reply is the fixture's and can be seen. Call all five tools, including `find_assets` with each marker as the query, and every `Refusal` path once. Assert the fixture carries every marker (a guard that cannot fail proves nothing), that `seen.len()` equals the number of calls made, and that no serialised reply contains any marker or either spelling of the fixture home. Also assert positively that every path field starts with `~/`.
- [ ] **Step 2: Run** `cargo test --test mcp_server_boundary_tests`. Expected: PASS.
- [ ] **Step 3: Prove the guard.** In a detached worktree (`git worktree add --detach /tmp/verify-mcp-boundary HEAD`, `node_modules` symlinked, `verifying-ui.md`), plant two violations one at a time: add the search `snippet` to `FoundAsset`, and drop `sanitise_path` from `engine_context`'s keys. Each must turn the test red. Paste both failing outputs into the checkpoint report. Revert by inverse edit, never `git checkout --` (`shared-checkout.md`).
- [ ] **Step 4: Commit** the test file and `README.md`: `test(mcp-server): nothing secret, no asset text and no raw home leaves the server`.

### Task 5: The stdio server and the `mcp` subcommand

**Files:**
- Modify: `src-tauri/Cargo.toml` (`rmcp = { version = "3.12", default-features = false, features = ["server", "macros", "transport-io"] }`; confirm on docs.rs that those features compile the README's stdio example before settling them)
- Modify: `src-tauri/src/main.rs` (branch before `tauri_app_lib::run()`)
- Modify: `src-tauri/src/mcp_server/mod.rs` (`pub async fn serve_stdio() -> std::process::ExitCode` and the `rmcp` handler)
- Test: `src-tauri/tests/mcp_server_protocol_tests.rs` (new), `src-tauri/tests/mcp_server_tests.rs`

**Interfaces:**
- Consumes: Task 3's functions and `RateLimit`; Gate G1's strings.
- Produces: `tauri_app_lib::mcp_server::run_from_args(args: &[String]) -> Option<std::process::ExitCode>`: `Some` when `args[1] == "mcp"`, after serving until stdin closes; `None` otherwise. `main.rs` returns that code or calls `run()`.

- [ ] **Step 1: Write the failing tests** in `mcp_server_protocol_tests.rs`. Each launches `env!("CARGO_BIN_EXE_tauri-app")` with `mcp`, `env_clear()`, then `HOME` and `HANGER_TEST_HOME` set to a canonicalised fixture home holding a store at `data_dir_for(home)/hanger.db` with `LAST_SCAN_KEY` set, and talks newline-delimited JSON on stdin and stdout. The built binary uses `server_places`, so it reads the real `/` for system-wide config. No assertion here depends on what an engine context holds, only on the protocol's shape and the tool names. Content is Task 3's and Task 4's job, where the system root is a fixture:
  - `a_legacy_client_initializes_lists_and_calls`: `initialize` with `protocolVersion` `"2025-11-25"`, then `notifications/initialized`, then `tools/list`, then `tools/call` `list_engines`. The tool names come back in this order: `list_engines`, `engine_context`, `find_assets`, `reach`, `findings` (or Gate G1's names, in a fixed order). The call result has `structuredContent` and a text block that parses to the same JSON.
  - `a_modern_client_discovers_then_lists`: `server/discover` with `_meta` `io.modelcontextprotocol/protocolVersion` `"2026-07-28"`; the result's `supportedVersions` contains `"2026-07-28"`; then `tools/list` with the same `_meta` lists the five tools.
  - `hangers_own_probe_measures_hangers_own_server`: `mcp::probe::probe(<bin>, &["mcp".into()], Duration::from_secs(10))` returns no `error` and the five tool names. This is how Hanger's own server will be measured once a user registers it.
  - `a_refusal_is_a_tool_error_not_a_protocol_error`: `tools/call` `find_assets` with `limit` 0 gives a result with `isError: true` and the `bad_argument` text from Gate G1.
  - `every_stdout_line_is_one_json_rpc_message`: across the legacy test's exchange, every stdout line parses as a JSON object with `"jsonrpc": "2.0"`.
  - `the_server_exits_when_stdin_closes`: drop stdin; the child exits within 2 s with status 0.
  - `the_server_launches_from_a_path_with_a_space`: copy the binary to `<tmp>/Hanger AI/Hanger AI` and repeat the probe.
  - In `mcp_server_tests.rs`: `the_server_module_never_prints`: no file under `src-tauri/src/mcp_server/` contains `println!` or `print!(`. Plant one and watch it fail before committing.
- [ ] **Step 2: Run** `cargo test --test mcp_server_protocol_tests --test mcp_server_tests`. Expected: red (no subcommand; the binary starts the GUI or fails). Kill any child that outlives the test.
- [ ] **Step 3: Implement.** The handler owns a `ServerPlaces` from `server_places(&scanner::get_home_dir())` and a `Mutex<RateLimit>`. Each `#[tool]` runs its Task 3 function in `tokio::task::spawn_blocking` (SQLite and file reads block), returns the reply as structured content plus its JSON text, and a `Refusal` as `isError: true` with Gate G1's text. No-parameter tools declare `{ "type": "object", "additionalProperties": false }`. No resources, prompts, sampling, roots, logging or elicitation are declared. `run_from_args` builds its own tokio runtime; nothing Tauri is touched.
- [ ] **Step 4: Run** the two test files, then the full `cargo test`, then `bunx tsc --noEmit` and `npx vitest run` from the repo root. Expected: PASS; `readme-sync` green after regenerating.
- [ ] **Step 5: Commit** `Cargo.toml`, `Cargo.lock`, `main.rs`, the module, the tests and `README.md`: `feat(mcp-server): serve the read tools over stdio as "Hanger AI mcp"`.

### Task 6: How a person adds it to an engine

**Files:**
- Create: `docs/mcp-server.md`
- Modify: `README.md` (one link from "## Quick start"; the section set stays fixed)

- [ ] **Step 1:** Write `docs/mcp-server.md`: what the server answers and what it leaves out (Gate G1's wording), that it reads Hanger's last scan and works with the app closed, and the lines to add it. Claude Code: `claude mcp add --scope user hanger -- "/Applications/Hanger AI.app/Contents/MacOS/Hanger AI" mcp`. Codex: a `[mcp_servers.hanger]` table with `command = "/Applications/Hanger AI.app/Contents/MacOS/Hanger AI"` and `args = ["mcp"]`. Any other engine: its JSON `command` and `args` form. Check each line against the engine's current docs and cite them with an access date; mark any line not run as unverified. Say that once added it shows up in Hanger's MCP servers list like any other server, and can be switched off there.
- [ ] **Step 2:** `/humanizer` pass; Karthik signs off on the page (`ui-copy.md`).
- [ ] **Step 3:** `npx vitest run src/__tests__/readme-sync.test.ts` from the repo root. Expected: PASS (links resolve).
- [ ] **Step 4: Commit** the two files: `docs(mcp-server): adding Hanger's server to an engine`.

## Gate G2 / Task 7: Live proof with a real engine (human-gated)

Nothing here is done until Karthik's results are in the conversation (`verification.md`, Human-gated steps).

- [ ] **Step 1:** Capture the per-kind baseline (`shared-asset-machinery.md`): `sqlite3 "$HOME/Library/Application Support/com.rkarthik.hanger/hanger.db" "select category, scope, count(*) from assets group by category, scope order by category, scope;"`. Paste it verbatim.
- [ ] **Step 2:** Build a release-shaped binary from the branch (Karthik picks how; the installed `/Applications` build is older and has no subcommand). Confirm `data_dir_for($HOME)` names the directory that holds the live `hanger.db` (closes Task 2's inference).
- [ ] **Step 3:** Karthik adds the server to one engine himself, from `docs/mcp-server.md`. That is a write to his engine config, so he does it, not an agent.
- [ ] **Step 4:** In that engine, Karthik asks for: the engines, one engine's servers and their cost, a skill by name, its reach, and the findings. Save the transcript under `docs/evidence/` (local-only) and quote the five tool calls and replies in the report. For each reply, take a screenshot of Hanger's window showing the same fact (the engine's servers and cost, the skill's row and reach, the Needs review rows), per `verifying-ui.md`. Save the shot under `docs/evidence/` next to the reply, and put a table in the report: reply, screenshot path, agree or differ. A difference is a finding to report, not something to reconcile away.
- [ ] **Step 5:** Rescan in Hanger. Screenshot (per `verifying-ui.md`) the MCP servers list showing the new server as an ordinary row, then measure it and screenshot its tool count.
- [ ] **Step 6:** Re-run Step 1's query. Every category must match the baseline, except one more `tool` row for the server just added. Any other move is a blocker.
- [ ] **Step 7:** A fresh reviewer runs `stage-gate --dev` on the phase 1 diff. Push only when Karthik says so.

---

## Phase 2: proposals approved in Hanger

Starts only after Gate G2 and Question 8. If Question 3 is ruled for elicitation, Tasks 8 to 11 are re-planned first.

### Task 8: The server files proposals

**Files:**
- Create: `src-tauri/src/mcp_server/proposals.rs`
- Modify: `src-tauri/src/mcp_server/mod.rs` (three tools), `src-tauri/src/mcp_server/places.rs` (`proposals: PathBuf` = `<data>/mcp/proposals`)
- Test: `src-tauri/tests/mcp_proposal_tests.rs` (new)

**Interfaces:**
- Produces:
  - `Proposal { id: String, at_ms: i64, ask: Ask, status: Status }`, `Serialize + Deserialize`
  - `Ask`: `Server { engine_id: String, key: String, enabled: bool }`, `Skill { key: String, enabled: bool }`, `Undo { kind: UndoKind, engine_id: Option<String>, receipt_id: String }`. No free text field.
  - `Status`: `Waiting`, `Applied { receipt_id: Option<String> }`, `Declined`, `Expired`, `Failed { code: String }` (a `SwitchFailure` or `SkillSwitchFailure` code)
  - `propose(places: &ServerPlaces, ask: Ask, now_ms: i64) -> Result<Proposal, Refusal>`, `get(places: &ServerPlaces, id: &str, now_ms: i64) -> Result<Proposal, Refusal>`, `list_waiting(dir: &Path, now_ms: i64) -> Vec<Proposal>`
  - `EXPIRES_AFTER_MS: i64 = 600_000` and `MAX_WAITING: usize = 5` (Hanger's choices)
  - Tools `propose_switch`, `propose_undo`, `get_proposal` (names from a Gate G1-style brief)

- [ ] **Step 1: Write the failing tests:** `a_server_key_must_be_an_item_of_that_engines_context_now` (a key from another engine, an unknown key, a `read_only` item and a `stash:` key asked to go off are each refused with the code `ops` gives, and no file is written); `a_skill_key_must_be_switchable_now` (via `skill_switch::ops::switch_info_for`); `a_sanitised_key_is_matched_back_exactly` (the `~/…` form matches, and a key differing by one byte does not; run in a child process as in Task 3, with `HOME` set to the fixture home); `an_undo_proposal_for_an_unknown_or_foreign_receipt_is_refused` (a made-up `file:<uuid>`, a real `file:` receipt that belongs to another engine's file, a `kept:<uuid>` the stash does not hold, a `restored:<name>` for a name this engine does not declare, and an id with an unknown prefix are each refused as `not_undoable` at propose time, with no proposal file written; the checks only read, through `apply::latest_receipts`, `vendor::claude_stashed` and the engine's context); `a_sixth_waiting_proposal_is_slow_down`; `a_proposal_older_than_ten_minutes_reads_expired`; `proposal_files_are_0600_in_a_0700_folder`; `a_proposal_carries_no_free_text` (serialised `Proposal` has exactly the listed keys).
- [ ] **Step 2: Run** `cargo test --test mcp_proposal_tests`. Expected: red.
- [ ] **Step 3: Implement.** Validation reads only (`ops::context_for` with `cached_measure_on`, `switch_info_for`). The file is written with a temp file and a rename in an absolute folder; nothing else is written by the server.
- [ ] **Step 4: Run** the file, then the full `cargo test`. Expected: PASS.
- [ ] **Step 5: Regenerate the README** (`~/.bun/bin/bun run src/__tests__/readmeCounts.ts`) for the new `mcp_proposal_tests.rs`, and run `npx vitest run src/__tests__/readme-sync.test.ts` from the repo root. Expected: PASS.
- [ ] **Step 6: Commit** the listed files and `README.md`: `feat(mcp-server): file a switch proposal for Hanger to approve`.

### Task 9: The app applies an approved proposal

**Files:**
- Modify: `src-tauri/src/lib.rs` (commands `list_mcp_proposals`, `decide_mcp_proposal`; `generate_handler!`)
- Create: `src-tauri/src/mcp_server/approve.rs`
- Modify: `docs/ipc.md` (two sections), `README.md` (`ipc` and `tests` figures)
- Test: `src-tauri/tests/mcp_proposal_tests.rs`, `src-tauri/tests/ipc_boundary_tests.rs`

**Interfaces:**
- Consumes: Task 8's `Proposal`, `list_waiting`; `ops::set_enabled_for`, `ops::undo_for`, `skill_switch::ops::set_enabled_for`, `skill_switch::ops::undo_for`; `edit::set_enabled` for the preview.
- Produces:
  - `Preview { id, engine_name: Option<String>, name: String, from: ItemState, to: ItemState, config_path: String, changed_lines: Vec<String> }`: For a flag-file engine, `changed_lines` holds only the lines that differ between the file and `edit::set_enabled`'s output, never context lines. For Claude Code it holds the literal argv `vendor` will run, untruncated: `claude mcp remove <name> --scope user` to switch off (`vendor.rs:330`) and `claude mcp add-json <name> - --scope user` to switch on (`vendor.rs:544`). The `-` means the entry goes on stdin, so the argv holds no config value. The preview says that the stdin entry is the one Hanger kept when it switched the server off, and shows none of its content. That satisfies research rule 5 ("the untruncated `add-json` argv") and Decision 6 (no config values) together. It is a reconciliation, not a ruling, and is reported to Karthik at Gate G3. For skills, `changed_lines` is empty, and the preview names the folder move and its link count from `SkillSwitchInfo`.
  - `PendingProposals { proposals: Vec<Preview>, count: usize }`
  - `list_mcp_proposals() -> PendingProposals`; `decide_mcp_proposal(id: String, approve: bool) -> Result<Proposal, String>` (`Err` is a code)

- [ ] **Step 1: Write the failing tests:** `approving_a_codex_proposal_switches_it_and_records_the_receipt` (fixture config; status becomes `Applied` with the `file:` receipt; the file changed in one line); `declining_writes_nothing` (file bytes unchanged; status `Declined`); `an_expired_proposal_cannot_be_approved`; `a_proposal_whose_server_changed_since_is_failed_not_applied` (edit the config between propose and approve: `Failed { code: "changed_since_read" }` or `not_found`); `an_undo_proposal_takes_back_the_receipt`; `a_claude_code_preview_is_the_literal_argv_and_no_entry` (`changed_lines` equals `["claude mcp remove <name> --scope user"]` for an off, and the kept entry's four switch markers are absent for an on); and in `ipc_boundary_tests.rs`, `proposal_previews_never_carry_a_config_value` (the four switch markers sit on lines next to the flag; none reaches `Preview`, and no raw home does).
- [ ] **Step 2: Run** both test files. Expected: red.
- [ ] **Step 3: Implement** `approve.rs` as the only caller of the switch code for proposals, re-validating at approval time; the commands are thin wrappers built from `switch_places`, `claude_cli_for` and `skill_places`. Add the two `docs/ipc.md` sections; regenerate `README.md`.
- [ ] **Step 4: Run** the full `cargo test`, `npx vitest run`, `bunx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(mcp-server): apply an approved proposal through the existing switch`.

## Gate G3: the approval surface's design and copy

- [ ] Render two or three options at true width in real tokens (memory: design options before building) for where pending proposals appear and how one is approved, with no blocking dialog (`invariants.md`). Naming brief for every string: the surface's name, the buttons, the states, and what the engine tells the person ("open Hanger to approve"), which also goes back into Task 8's tool replies. `/humanizer`. Karthik picks and signs off.

### Task 10: The approval surface

**Files:** decided at Gate G3. Expect a new component under `src/components/` with a test and a Design system specimen (`design-system-coverage.test.ts`), and a hunk-staged change in `src/App.tsx`.

- [ ] **Step 1: Write the failing Vitest tests:** the surface renders nothing when `count` is 0; it renders `changed_lines` verbatim and Hanger's own names, nothing from the engine; Approve and Decline call `decide_mcp_proposal` with the id; the figure shown is `count` from the backend, not `.length` (`no-frontend-counting.test.ts` stays green).
- [ ] **Step 2: Run** `npx vitest run <file>`. Expected: red.
- [ ] **Step 3: Implement** per Gate G3. Poll `list_mcp_proposals` every 3 s while the document is visible and on window focus (Hanger's choice: no new event, so the README's "three events" stays true).
- [ ] **Step 4: Run** the four gates. Expected: PASS.
- [ ] **Step 5:** Screenshots from the running dev app (`verifying-ui.md`): a pending proposal, after Approve, after Decline, in both themes, naming the theme read from the store.
- [ ] **Step 6: Commit** with hunk staging for `src/App.tsx` (`shared-checkout.md`).

## Gate G4 / Task 11: Live proof of a write (human-gated)

- [ ] **Step 1:** Per-kind baseline as in Task 7.
- [ ] **Step 2:** In his engine, Karthik asks it to switch one server off. The engine calls `propose_switch`; Karthik approves in Hanger; the engine's `get_proposal` reads `Applied`. Then he asks for the Undo and approves it. Transcript and screenshots saved; the config file's diff after each step pasted.
- [ ] **Step 3:** The same for one skill.
- [ ] **Step 4:** Per-kind counts after; only the switched items may differ, and they must be back after the Undo.
- [ ] **Step 5:** A fresh reviewer runs `stage-gate --dev` on the phase 2 diff.

---

## Questions for Karthik

:::question
How should engines reach Hanger's server?

This decides packaging, whether the app must be running, and whether a credential ends up in engine configs. The shipped binary can branch on `mcp` before Tauri starts, needs nothing running, and reuses the signed, notarised executable.

- [ ] A stdio subcommand of the app's own binary — works with Hanger closed, one signed binary, no port or token
- [ ] A local HTTP endpoint the running app hosts — one shared process, but needs the app open, a port and a token in each engine's config
- [ ] A separate sidecar binary in the bundle — smaller process, but a second binary to sign, notarise and version

Recommended: A stdio subcommand of the app's own binary
:::

:::question
Should the server use the official Rust SDK, rmcp?

The 2026-07-28 spec dropped `initialize` for `server/discover`, while engines may still speak older versions. rmcp 3.12.0 says it serves 2026-07-28 and stays compatible with 2025-11-25 and earlier; a hand-written server would track both eras itself.

- [ ] rmcp 3.12 — official, tracks spec churn, one new dependency under Apache-2.0
- [ ] Hand-written JSON-RPC over stdio — no dependency, but Hanger owns both protocol eras and every spec change

Recommended: rmcp 3.12
:::

:::question
Where should a person approve a write an engine asks for?

Hanger's rule is explicit approval for every write. The engine's own prompt is controlled by the engine and can be set to auto-approve; the spec's elicitation also renders in the engine. Hanger's skill switch serialises writes with an in-process lock that a second process would bypass.

- [ ] In Hanger's window, as a proposal the app applies — Hanger shows its own statement of the change and stays the only writer
- [ ] In the engine, through MCP elicitation — no window switch, but Hanger cannot tell a person answered and the server process would write
- [ ] The engine's own tool-permission prompt — simplest, weakest, and off in auto modes

Recommended: In Hanger's window, as a proposal the app applies
:::

:::question
What asset text and names should the server return, and how capped?

Descriptions are untrusted text, and so are names: a skill's name comes from its own frontmatter (`scanner.rs` → `fm.name`) and a server's from its config file, with no length limit. The plan sends fewer fields than research rule 6 allows (no transport, command basename, or env and header key names) and passes every name through `public_name`: control characters become spaces, cut at 128 characters.

- [ ] Names capped at 128 and stripped of control characters, no descriptions, none of rule 6's extra fields — smallest surface, names stay readable
- [ ] As above, plus transport and command basename, as rule 6 lists — more diagnostic, still no values
- [ ] As above, plus descriptions fenced as untrusted and capped at 300 characters — more useful answers, prose from every engine in one context
- [ ] Names uncapped, as the files spell them — faithful, one injected name can be any length

Recommended: Names capped at 128 and stripped of control characters, no descriptions, none of rule 6's extra fields
:::

:::question
Which findings should the server report?

Needs review is computed in the frontend (`deriveReviewIssues`). From the store alone, the server can see broken and drifted links for global folders (`annotations`) and failed parses in every scope. Drift in project folders is computed only during a scan's walk (`check_asset_drift`) and is not stored, and duplicates exist only in the frontend.

- [ ] The store subset now: global broken and drifted, failed parses everywhere, each labelled by scope — no second copy of frontend logic, and no new reads
- [ ] Also project drift, by running `check_asset_drift` against `deploy_checksums` per tracked copy — closer to Needs review, hashes files on every call
- [ ] Port `deriveReviewIssues` to Rust first, and have the frontend use it — one source for both, a larger change before anything ships
- [ ] No findings tool in the first slice — smallest, drops a fact the ruling names

Recommended: The store subset now: global broken and drifted, failed parses everywhere, each labelled by scope
:::

:::question
How should a person add Hanger's server to their engines?

Hanger registering itself is a write that adds a server to an engine's config, which is T18 slice 3 and unbuilt; the switch only flips existing entries. Instructions need no new write path.

- [ ] Copyable instructions in `docs/mcp-server.md` — no new write path, ships with the server
- [ ] An instructions card inside Hanger — easier to find, needs a design and a naming brief
- [ ] Hanger adds itself, with backup and Undo — one click, but builds T18 slice 3 first

Recommended: Copyable instructions in `docs/mcp-server.md`
:::

:::question
Should a proposal carry the engine's reason for it?

A reason is model output, and showing it in Hanger's approval surface would trigger T23 (ask about A2UI first). Without it, the surface shows only Hanger's own statement of the change. Either way the engine's model still chooses which server or skill to propose, and Hanger shows that choice. The plan treats that as a selection checked against Hanger's own data, not model output.

- [ ] No free text: Hanger states the change itself, and the model's choice of item is not counted as model output — T23 not triggered
- [ ] No free text, and treat the chosen item as model output too — T23 must be ruled before phase 2
- [ ] Carry a short reason and show it — more context, but T23 must be ruled first

Recommended: No free text: Hanger states the change itself, and the model's choice of item is not counted as model output
:::

:::question
What ships first, and in what order?

Option A in the research says "First ship: deterministic findings (hash change, plaintext secret slot, unpinned `npx`/`uvx`, `curl | sh` in SKILL.md) … Then a stdio MCP server." The plan reads ruling 3 as putting the server first, over the findings that exist today, with writes (phase 2) after a live proof.

- [ ] Read-only server first, writes after its live proof, new findings in their own plan — ruling 3 as written, smallest first ship
- [ ] Option A's order: new deterministic findings first, then the server — the server has more to say on day one, ships later
- [ ] Read-only and writes on one branch — one release, more to review at once

Recommended: Read-only server first, writes after its live proof, new findings in their own plan
:::

:::question
Does the server wait for T22, the Antigravity source and the Gemini split?

T22 adds Antigravity's config to `registry.rs` (`HOSTS`, `SOURCES`), and ruling 4 splits Gemini CLI from Antigravity. Both change what `list_engines` and `engine_context` return and what the tool descriptions may truthfully say. Whichever commit grows a table must raise its floor in `brand-coverage.test.ts`.

- [ ] Ship without waiting, saying "Antigravity is not read" until T22 lands; T22's author raises the floors and updates the tool copy in its own commit — no blocking, copy stays true at every commit
- [ ] Wait for T22 and the split, then ship — no caveat in the copy, the server waits on another track
- [ ] Ship without the caveat and let T22 catch up — simplest, false until T22 lands

Recommended: Ship without waiting, saying "Antigravity is not read" until T22 lands; T22's author raises the floors and updates the tool copy in its own commit
:::

## Answers (Karthik, 2026-11-27, in Plannotator)

All nine took the recommendation:

1. A **stdio subcommand of the app's own binary.**
2. **rmcp 3.12.**
3. Writes are **approved in Hanger's window, as a proposal the app applies.**
4. **Names capped at 128 and stripped of control characters, no descriptions, none of rule 6's extra fields.**
5. Findings: **the store subset now** (global broken and drifted, failed parses everywhere), each labelled by scope.
6. Install: **copyable instructions in `docs/mcp-server.md`.**
7. **No free text** in a proposal; the model's choice of item is not counted as model output.
8. **Read-only server first, writes after its live proof, new findings in their own plan.**
9. **Ship without waiting for T22**, saying "Antigravity is not read" until it lands; T22's author raises the floors and updates the tool copy in its own commit.
