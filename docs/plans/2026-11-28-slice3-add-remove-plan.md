# Slice 3: add, remove, Registry add, and two findings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Reconciled 2026-11-28** after the `--plan` review (`docs/reviews/2026-11-28-plan-2026-11-28-slice3-add-remove-plan.md`), applying `docs/plans/research/2026-11-28-reconciliation-rulings.md` R2 (Claude Code `add-json` and `remove` write P4's `apply::CommandReceipt` with the reverse command, replacing this plan's own change records), R3 (Task 18 uses P1's names: one filing function per verb, `Preview { target, change }`, `Ask` tagged by `verb`), R4 (Tasks 12 and 17 use P2's `Target`, `ReadOnlyReason::RepoFileTracked`, `refused_files` and `project` argument; Task 17 waits on P2's Task 5, which follows Claude's live check), R5 (P7 edits `src/utils/reviewIssues.ts` first and Task 10 rebases onto it) and the P3 fixes: Task 9's derive compiles; `from_entry` passes URLs to the secret check (query and `user:pass`). Copying literal values **ruled in round 44 Q8 (the recommended option)**; the recommended option is built as the provisional default. Shared names: `docs/plans/research/2026-11-28-cross-plan-interfaces.md`.

**Goal:** A person can add an MCP server to an engine by hand, from the official MCP Registry at a pinned version, or by copying an existing entry, and can remove one. Every write is atomic with a receipt and an Undo. Needs review shows two new findings, a plaintext secret and an unpinned package. A model gets the same verbs through the approval queue.

**Architecture:** Add and remove are dialect writes behind `apply::safe_replace`. Claude Code writes go through `vendor` (`claude mcp add-json` on stdin, `claude mcp remove`). One neutral entry type (`NewServer`) carries variable *names* only. It comes from the form, from a Registry record, or from an existing entry, and is rendered per engine. One detector module serves the write-time check and the scan-time finding. The scan-time finding runs at `dialect::parse` and keeps only `{key, pattern}`. Part A (wave 1, track F) touches no `ops`. Part B waits on P2's `ops` target, and its last task waits on P1's `Ask`.

**Tech Stack:** Rust (`jsonc-parser` cst, `toml_edit`, `reqwest` 0.12, `regex` 1, already 1.13.2 in `Cargo.lock`), Tauri 2 commands, React 19 + TypeScript, Vitest.

**Spec:** `docs/plans/2026-11-28-harness-design.md` (§4.3, §5, §7 and the round-43 Answers). Research: `docs/plans/research/2026-11-28-slice3-add-remove-registry.md`.

## Global Constraints

- Answer Q2: add and remove write at user scope by default. A repository file is written only when git does not track it; otherwise Hanger says why it can't write there.
- Answer Q3: the form never takes a literal secret, only a variable name in the engine's spelling. An engine that can't expand one is told to add the secret by hand. `NewServer`, which crosses IPC and fills the form, carries no literal env or header value at all, so no value ever reaches the window or a model.
- **Copying literal values ruled in round 44 Q8 (the recommended option).** Provisional default (the recommended option): a copy (`copy_for`) carries over the source's literal env and header values that `findings::secret_findings` finds nothing in, file to file inside the backend. The value never reaches the window or a model, and a preview shows only the key name. A literal the detector flags refuses the copy (`secret_in_entry`). If Karthik picks "drop every literal", `copy_for` refuses any source holding a literal (`source_has_values`) instead, and the `literals_of` step below is skipped.
- Answer Q4: the scanner reads env and header values at the parse boundary and keeps only `{key, pattern name}`. `docs/scanning.md` §7 is amended in the same commit.
- Answer Q5: the first cut is the four `SWITCHES` engines (Claude Code, Codex, Gemini CLI, Antigravity CLI). Each one writes only after its own live check lands its `ENTRY_WRITES` row. Every other host stays read-only.
- Answer Q6: a vendor-CLI write records a receipt holding the reverse command, and Undo runs it. The receipt is P4's `apply::CommandReceipt` (ruling R2). A Claude remove's reverse needs the removed entry, which can hold a credential: the entry stays in the stash folder, and the receipt names only the stash record (`reverse_stdin_stash`), never the entry.
- Answer Q10: a model may ask for add and remove, by Registry id or by an existing entry. It never sends an entry body (Answer 7: no free text in a proposal).
- Registry: base `https://registry.modelcontextprotocol.io/v0.1`, `version=latest`, keep only `status == "active"`, exact versions only. `npm` becomes `npx -y <id>@<ver>` and `pypi` becomes `uvx <id>==<ver>`. Remotes (`streamable-http`, `sse`) become a URL entry (design §4.3; the dispatch summary names only the two package types). Any other type is refused with a reason.
- Secrets never cross IPC, reach a model, or reach a preview. Never read credential files. Live checks run only with a throwaway `HOME`.
- The store schema never moves: findings are computed at scan time and ride on the in-memory `Tool`. Nothing is persisted.
- Counts come from the backend (`invariants.md`). Tokens-only styling. No blocking dialogs.
- Shared machinery (design §5): `ops`, `SWITCHES` and `context` belong to P2. `apply`, including `CommandReceipt`, belongs to 4a and is called unchanged. `Ask` and the queue belong to P1. This plan owns `vendor`, `edit::entries`, `entry`, `findings`, `official_registry` and `ENTRY_WRITES`. `src/utils/reviewIssues.ts` is shared with P7, which edits it first (ruling R5).
- Gitleaks: no test source holds a literal token. Build fixture secrets at runtime, e.g. `format!("ghp_{}", "a".repeat(36))`.
- Every commit names its paths explicitly, runs in its own Bash call, and has no `-n` anywhere in that call. New files are `git add`ed in a separate call first.

## Review Focus

1. **Hanger's own `${VAR}` references flagged as plaintext secrets.** A file Hanger just wrote must scan clean. Test `a_file_hanger_wrote_raises_no_secret_finding` (Task 9).
2. **A name already declared.** This covers both Codex spellings (`[mcp_servers.x]` and `[tools.x]`) and a JSON key declared twice. Add refuses with `AlreadyThere`. Remove takes out every declaration, so no stale one comes back into effect. Tests `adding_a_declared_name_is_refused_in_either_spelling` and `remove_takes_out_every_declaration_of_the_name` (Task 3).
3. **A Registry record that is not addable.** That means a range or dist-tag version, a deprecated or deleted `isLatest`, an `oci`-only package, a non-stdio package, or a required runtime argument with no value. Each is refused with its own code, and search results show the reason before any click. Tests in Task 7.
4. **An engine that can't express a reference.** Codex `env_vars` can't rename (key ≠ variable). An engine's references may not be confirmed yet. Gemini and Antigravity URL entries are not confirmed. Each case is refused with a code that says "add it by hand", and nothing is written. Tests in Tasks 2 and 12.
5. **The config file is not there yet** (a fresh `~/.gemini/settings.json`). Add creates it holding only that entry, and Undo removes the file. Test `add_for_creates_a_missing_gemini_settings_file_and_undo_removes_it` (Task 12).

---

## Interfaces this plan owns (land as written; other plans build on them)

`src-tauri/src/mcp/switch/entry.rs` (Task 1):

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NewServer { pub name: String, pub launch: Launch, pub env: Vec<EnvRef>, pub headers: Vec<HeaderRef> }
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Launch { Command { command: String, args: Vec<String> }, Url { url: String, transport: UrlTransport } }
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)] #[serde(rename_all = "kebab-case")]
pub enum UrlTransport { StreamableHttp, Sse }
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EnvRef { pub key: String, pub var: String }          // key = what the server sees, var = the user's shell variable
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HeaderRef { pub name: String, pub var: String, pub scheme: HeaderScheme }
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)] #[serde(rename_all = "snake_case")]
pub enum HeaderScheme { Bearer, Raw }                            // Bearer only on `Authorization`
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntryError { NameRefused, VarRefused, BearerNotAuthorization, EnvRenameUnsupported, UrlUnconfirmed, UrlTransportUnsupported, SourceHasValues, SecretInEntry, UrlHasCredentials, UnsupportedHost }
pub fn name_is_refused(name: &str) -> bool;                      // vendor's rule: empty, leading '-', control char
pub fn check(server: &NewServer) -> Result<(), EntryError>;      // names, vars ([A-Za-z_][A-Za-z0-9_]*), Bearer rule
pub fn render(host_id: &str, server: &NewServer) -> Result<serde_json::Value, EntryError>;   // Task 2
pub fn from_entry(entry: &serde_json::Value, dialect: Dialect) -> Result<NewServer, EntryError>; // Task 4, name filled by caller; references only
/// Backend-only, never serialised: the source's literal env and header values the detector finds nothing in (round 44 Q8's provisional default).
pub struct Literals { pub env: Vec<(String, String)>, pub headers: Vec<(String, String)> }
pub fn literals_of(entry: &serde_json::Value, dialect: Dialect) -> Result<Literals, EntryError>; // Task 4; SecretInEntry if the detector flags any
```

`src-tauri/src/mcp/switch/edit/entries.rs`, declared by one line `pub mod entries;` in `edit.rs` (Task 3):

```rust
pub enum EntryEditError { AlreadyThere, NotFound, Unparseable(String), UnsupportedDialect }
pub fn add_server(body: Option<&str>, dialect: Dialect, name: &str, entry: &serde_json::Value) -> Result<String, EntryEditError>;
pub fn remove_server(body: &str, dialect: Dialect, name: &str) -> Result<String, EntryEditError>;
pub fn entry_of(body: &str, dialect: Dialect, name: &str) -> Result<serde_json::Value, EntryEditError>; // for copy; backend-only
```

`src-tauri/src/mcp/findings.rs` (Tasks 5–6):

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)] #[serde(rename_all = "snake_case")]
pub enum Check { PlaintextSecret, UnpinnedPackage }
// Serialize and Deserialize, with owned strings, because `domain::Tool` derives both and carries these (Task 9).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConfigFinding { pub check: Check, pub key: String, pub pattern: String }
pub fn secret_findings<'a>(pairs: impl IntoIterator<Item = (&'a str, &'a str)>) -> Vec<ConfigFinding>;
pub fn launch_pairs(args: &[String], url: Option<&str>) -> Vec<(String, String)>; // `--flag value`, `--flag=value`, url query, and url userinfo as ("userinfo", "<user:pass>")
pub fn unpinned_finding(command: &str, args: &[String]) -> Option<ConfigFinding>;
pub fn is_exact_version(v: &str) -> bool;   // ^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$
```

`src-tauri/src/mcp/official_registry.rs` (Task 7):

```rust
pub const REGISTRY_BASE: &str = "https://registry.modelcontextprotocol.io/v0.1";
pub const REGISTRY_TIMEOUT: Duration = Duration::from_secs(10);
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RegistryResult { pub registry_name: String, pub version: String, pub description: Option<String>,
  pub repository_url: Option<String>, pub published_at: Option<String>, pub kind: &'static str /* "npm"|"pypi"|"remote"|other */,
  pub refused: Option<&'static str> /* RegistryRefusal::code */ }
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RegistrySearch { pub results: Vec<RegistryResult>, pub next_cursor: Option<String> }
pub enum RegistryRefusal { NotActive, NotExactVersion, UnsupportedPackageType, NotStdio, NeedsRuntimeArgument, NothingToRun }
pub enum RegistryError { Unreachable, BadStatus, Unparseable }   // each has `code(self) -> &'static str`
pub async fn search(base: &str, query: &str, cursor: Option<&str>) -> Result<RegistrySearch, RegistryError>;
pub async fn entry(base: &str, registry_name: &str, version: &str) -> Result<Result<NewServer, RegistryRefusal>, RegistryError>;
pub fn to_new_server(record: &serde_json::Value) -> Result<NewServer, RegistryRefusal>;  // pure
```

`registry.rs` (Task 12), beside `SWITCHES` and never inside it:

```rust
pub struct EntryRow { pub host_id: &'static str, pub tier: ScopeTier,
  pub file: Option<&'static str>,   // a SOURCES path for host_id at tier; None = the engine's CLI writes (Claude Code)
  pub env_refs: bool, pub header_refs: bool, pub urls: bool, pub confirmed: &'static str }
pub const ENTRY_WRITES: &[EntryRow] = &[];   // a row lands only with its live check (Task 16)
pub fn entry_write_for(host_id: &str, tier: ScopeTier) -> Option<&'static EntryRow>;
```

`vendor.rs` (Task 11). Every write records P4's `apply::CommandReceipt` (ruling R2); P4's Recent changes lists it, and P5's `undo_vendor_change` runs its reverse through `claude_reverse`:

```rust
pub async fn claude_add(config: &Path, name: &str, entry_json: &str, stash: &Path, receipts: &Path, cli: &Path, path_env: &str) -> Result<CommandReceipt, SwitchError>;
pub async fn claude_remove(config: &Path, name: &str, stash: &Path, receipts: &Path, cli: &Path, path_env: &str) -> Result<CommandReceipt, SwitchError>;
/// Run a Claude Code MCP receipt's reverse: `mcp remove` for an add, `mcp add-json` with the stash record on stdin for a remove. Records the reverse's own receipt, whose reverse is the original write.
pub async fn claude_reverse(config: &Path, receipt: &CommandReceipt, stash: &Path, receipts: &Path, cli: &Path, path_env: &str) -> Result<CommandReceipt, SwitchError>;
```

Receipts: `program: Claude`. An add records `what: "claude-code · add · <name>"`, `reverse_args: ["mcp","remove",<name>,"--scope","user"]`, `reverse_stdin_stash: None`. A remove first keeps the entry in a stash record at `<stash>/claude-code/removed/<uuid>.json` (0600 in a 0700 folder; `claude_stashed` reads top-level files only, so a removed server is never listed as kept off), then records `what: "claude-code · remove · <name>"`, `reverse_args: ["mcp","add-json",<name>,"-","--scope","user"]`, `reverse_stdin_stash: Some(<that uuid>)`. Receipt ids are `cmd:<uuid>`. The entry never leaves the stash folder.

## Cross-plan interfaces (assumed, not defined here)

Every name here matches its owner's plan; the full table is `docs/plans/research/2026-11-28-cross-plan-interfaces.md`.

| Name and type | Owner | Used by |
|---|---|---|
| `ops::Target<'a> { Machine { key: &'a str }, InProject { project: &'a KnownProject, key: &'a str } }`, landed in P2's Task 2. This plan adds a `NewEntry { host_id, tier, path }` variant and no field to the existing ones | **P2** | Tasks 12, 17. Wait for P2's Task 2 |
| `project::refused_files(real: &Path, files: &[PathBuf]) -> Vec<PathBuf>` (async, fail-closed: "couldn't ask git" is refused) and `ReadOnlyReason::RepoFileTracked`. | **P2**, Task 5, which starts only after Claude Code's live check (P2 Task 4 Step 6) is accepted | Task 17 |
| The repository, named by the `project: Option<String>` argument on P2's switch commands and resolved to a `project::KnownProject` by `KnownProject::among` over `preferences::get_linked_directories`. | **P2**, Task 2 | Task 17 |
| `Ask` (`#[serde(tag = "verb")]`), extended only; one filing function per verb, each `(p: &ServerPlaces, …, asked_by: Option<&'static str>, now_ms: i64) -> Result<Fresh<Filed>, Refusal>`; `tools::public_key` (`pub(crate)`) and P1's exactly-one-match rule; `Preview { id, at_ms, expires_at_ms, asked_by, undo, name, to: Option<ItemState>, target: PreviewTarget, change: Change }` with `Change::{Lines { lines }, Withheld, Command { argv }, …}` and `PreviewTarget::Server { engine_id, engine_name, config_path }`; `approve::decide`; `decide_mcp_proposal`; the tool table `TOOLS` in `mcp_server/mod.rs`; P1's Gate N (the batched naming round) | **P1** | Task 18. Wait for P1's merge |
| `apply::safe_replace`, `apply::undo`, `Receipt`, called unchanged | **4a** | Tasks 12, 17 |
| `apply::CommandReceipt { id, at_ms, what, program: ReverseProgram, reverse_args, reverse_stdin_stash }`, `record_command`, `load_command`, `command_receipts_dir` | **4a**, Task 3b (ruling R2) | Task 11. Wait for P4's Task 3b |
| `vendor_cli::undo(receipt: &CommandReceipt, ctx: &UndoContext)` and the IPC `undo_vendor_change`. Task 11 adds one arm: a `Claude` receipt whose `reverse_args[0] == "mcp"` calls `vendor::claude_reverse` | **P5** (Task 4) | Task 11. Tell P5 before editing its file |
| `src/utils/reviewIssues.ts`, `NeedsReviewPane.tsx`, `ReviewSidebar.tsx`: P7's Task 10 adds `signed_out` and `settings_unreadable` first | **P7 first, then this plan** (ruling R5) | Task 10 rebases onto P7's Task 10 |
| `skill_switch`, `engine_status::run::run_capture` (signature frozen, no cwd) | P5 / P7 | `vendor` calls `run_capture` unchanged |

If a P1 or P2 name differs once that plan lands, use theirs and edit this table in the same commit.

## File structure

- Create: `src-tauri/src/mcp/switch/entry.rs`, `src-tauri/src/mcp/switch/edit/entries.rs`, `src-tauri/src/mcp/findings.rs`, `src-tauri/src/mcp/official_registry.rs`
- Modify (one line each): `src-tauri/src/mcp/switch/mod.rs` (`pub mod entry;`), `src-tauri/src/mcp/switch/edit.rs` (`pub mod entries;`; tell P2 first, since it is their file), `src-tauri/src/mcp/mod.rs` (two `pub mod`), `src-tauri/Cargo.toml` (`regex = "1"`)
- Part B modifies: `vendor.rs`, `ops.rs`, `registry.rs`, `dialect.rs`, `domain.rs`, `scanner.rs`, `lib.rs`, `src/utils/reviewIssues.ts`, `src/components/NeedsReviewPane.tsx`, `src/components/ReviewSidebar.tsx`, `src/types/engineContext.ts`, `src/utils/switchCopy.ts`, the new form components (named at G-L), `docs/scanning.md`, `docs/ipc.md`, `README.md`, `src/__tests__/brand-coverage.test.ts`
- Tests: new `src-tauri/tests/mcp_entry_tests.rs`, `mcp_findings_tests.rs`, `mcp_official_registry_tests.rs`, `mcp_entry_live.rs` (all `#[ignore]`); extended `mcp_switch_tests.rs`, `ipc_boundary_tests.rs`, `src/utils/reviewIssues.test.ts`

Each task that adds a test file regenerates the README `tests` region (`~/.bun/bin/bun run src/__tests__/readmeCounts.ts`) and runs `npx vitest run src/__tests__/readme-sync.test.ts` from the repo root.

---

# Part A — disjoint, starts at once (wave 1, track F)

### Task 1: Baseline counts and the `NewServer` interface

**Files:** Create `src-tauri/src/mcp/switch/entry.rs`. Modify `src-tauri/src/mcp/switch/mod.rs`. Test: `src-tauri/tests/mcp_entry_tests.rs`.

**Interfaces:** Produces the types, `name_is_refused` and `check` above.

- [ ] **Step 0: Capture per-kind counts**, read-only, and save the output to `docs/evidence/2026-11-28-slice3/counts-before.txt`:
  `sqlite3 -readonly "$HOME/Library/Application Support/com.rkarthik.hanger/hanger.db" "select category, scope, count(*) from assets group by category, scope order by category, scope;"`
- [ ] **Step 1: Write the failing tests.**
  - `the_form_shape_deserialises`: the JSON `{"name":"weather","launch":{"kind":"command","command":"npx","args":["-y","@example/weather-mcp@1.4.2"]},"env":[{"key":"WEATHER_API_KEY","var":"WEATHER_API_KEY"}],"headers":[]}` becomes the equal `NewServer`.
  - `a_form_with_a_value_field_is_refused`: `"env":[{"key":"K","value":"x"}]` fails to deserialise (`deny_unknown_fields` on `EnvRef` and `HeaderRef`).
  - `names_and_vars_are_checked`: `""`, `"-x"` and `"a\u{7}"` give `NameRefused`. A var of `"1ABC"` or `"A B"` gives `VarRefused`. `HeaderRef{name:"X-Api-Key",scheme:Bearer}` gives `BearerNotAuthorization`. `"authorization"` with `Bearer` passes.
- [ ] **Step 2: Run** `cd src-tauri && cargo test --test mcp_entry_tests`. Expected: FAIL with `error[E0432]: unresolved import tauri_app_lib::mcp::switch::entry`.
- [ ] **Step 3: Implement** the types and the two functions. `vendor::is_refused` becomes a call to `entry::name_is_refused`, so there is one rule.
- [ ] **Step 4: Run** the file, then `cargo test --test mcp_switch_tests`. Expected: PASS (vendor's name-refusal tests unchanged).
- [ ] **Step 5: Commit** `entry.rs`, `mod.rs`, `vendor.rs`, `mcp_entry_tests.rs`, `README.md`: `feat(mcp): a neutral new-server entry that carries variable names only`.

### Task 2: Render a `NewServer` per engine

**Files:** Modify `entry.rs`. Test: `mcp_entry_tests.rs`.

**Interfaces:** Produces `render(host_id, &NewServer) -> Result<serde_json::Value, EntryError>`. The value is a JSON object for every host, and Task 3 turns it into a TOML table for Codex.

- [ ] **Step 1: Write the failing tests.** Use `gh` = `Command{npx, ["-y","@modelcontextprotocol/server-github@2025.4.8"]}` with env `[{GITHUB_PERSONAL_ACCESS_TOKEN, GITHUB_TOKEN}]`.
  - `claude_code_and_gemini_and_antigravity_write_braced_references`: for `claude-code`, `gemini` and `antigravity` the result is `{"command":"npx","args":[…],"env":{"GITHUB_PERSONAL_ACCESS_TOKEN":"${GITHUB_TOKEN}"}}`.
  - `codex_passes_a_variable_under_its_own_name`: with key = var = `GITHUB_TOKEN`, the result is `{"command":"npx","args":[…],"env_vars":["GITHUB_TOKEN"]}`. With key ≠ var the result is `Err(EnvRenameUnsupported)`.
  - `url_entries`: the URL is `https://api.example.com/mcp`, streamable-http, with header `Authorization` Bearer `EXAMPLE_TOKEN`. Claude Code gives `{"type":"http","url":…,"headers":{"Authorization":"Bearer ${EXAMPLE_TOKEN}"}}`. Codex gives `{"url":…,"bearer_token_env_var":"EXAMPLE_TOKEN"}`. Codex with a Raw `X-Api-Key` gives `{"url":…,"env_http_headers":{"X-Api-Key":"EXAMPLE_KEY"}}`. Codex with `Sse` gives `Err(UrlTransportUnsupported)`. `gemini` and `antigravity` give `Err(UrlUnconfirmed)`. Claude Code with `Sse` gives `"type":"sse"`.
  - `other_hosts_are_unsupported`: `cursor` gives `Err(UnsupportedHost)`.
- [ ] **Step 2: Run** `cargo test --test mcp_entry_tests render`. Expected: FAIL, `cannot find function render`.
- [ ] **Step 3: Implement.** `type` is always written for a Claude Code URL entry, because `add-json` refuses a `url` with no `type` (vendor module doc, "The pre-flight"). Gemini and Antigravity URL keys (`httpUrl`, `serverUrl`) are not written: `dialect::server_from_json` reads only `url`, so Hanger would show such an entry as `unknown`. They wait for a later plan.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `entry.rs`, `mcp_entry_tests.rs`: `feat(mcp): render a new server in each first-cut engine's spelling`.

### Task 3: Add and remove an entry in a file's text

**Files:** Create `src-tauri/src/mcp/switch/edit/entries.rs`. Modify `edit.rs` (one line). Test: `mcp_entry_tests.rs`.

**Interfaces:** Consumes `edit`'s private `JSONC`, `parse_json`, `props_named`, `last_prop`, `parse_toml` and `toml_text`, which a child module can reach. Produces `add_server`, `remove_server` and `entry_of`.

- [ ] **Step 0:** Send P2 a `SendMessage` before touching `edit.rs`: one line, `pub mod entries;`, nothing else.
- [ ] **Step 1: Write the failing tests.**
  - `json_add_then_remove_gives_the_bytes_back`. Start from `"{\n  // mine\n  \"mcpServers\": {\n    \"a\": { \"command\": \"x\" }\n  }\n}\n"`. Add `b` = `{"command":"y"}`. `dialect::parse` then lists `a` and `b`, the `// mine` line is unchanged, and so is `a`'s line. Removing `b` again equals the original bytes.
  - `toml_add_then_remove_gives_the_bytes_back`. Start from `"# keep\n[mcp_servers.a]\ncommand = \"x\"\n"`. Adding `b` (with `env_vars = ["T"]`) gives text containing `[mcp_servers.b]` and `env_vars = ["T"]`. Removing it gives the original bytes.
  - `adding_to_no_file_creates_it`: `add_server(None, McpServers, "b", …)` parses to exactly one server `b`. `add_server(None, CodexToml, "b", {"command":"x"})` equals `"[mcp_servers.b]\ncommand = \"x\"\n"`.
  - `adding_a_declared_name_is_refused_in_either_spelling`: a file holding `[tools.a]` gives `Err(AlreadyThere)` for `a`. So does a JSON map holding `a`.
  - `remove_takes_out_every_declaration_of_the_name`: `[mcp_servers.a]` plus `[tools.a]`, and a JSON object with key `a` twice. After the remove, `dialect::parse` lists no `a`.
  - `remove_of_an_absent_name_is_not_found`. `claude_json_is_unsupported` (`ClaudeJson`, `ClaudeAiConnectors` and `Unsupported` all give `UnsupportedDialect`). `entry_of_returns_the_parsed_entry`.
- [ ] **Step 2: Run** `cargo test --test mcp_entry_tests`. Expected: FAIL, `could not find entries in edit`.
- [ ] **Step 3: Implement.** Map keys repeat `format_of`'s list. TOML is added as `[mcp_servers.<name>]`, the spelling current Codex writes. Errors carry locators only, never file text, as `EditError` does. The known `jsonc-parser` limit (blank lines inside an object it inserts into) goes in the module doc.
- [ ] **Step 4: Run** the file, then `cargo test --test mcp_switch_tests`. Expected: PASS, so slice 2's flag functions are untouched.
- [ ] **Step 5: Commit** `edit.rs`, `edit/entries.rs`, `mcp_entry_tests.rs`: `feat(mcp): add and remove a server entry, leaving the rest of the file as written`.

### Task 4: An existing entry as a `NewServer` (the copy source)

**Files:** Modify `entry.rs`. Test: `mcp_entry_tests.rs`.

**Interfaces:** Produces `from_entry(entry, dialect) -> Result<NewServer, EntryError>`. It reads values only to recognise a reference, keeps the variable name, and drops the rest. Also `literals_of(entry, dialect) -> Result<Literals, EntryError>` (round 44 Q8, provisional default): the literal env and header values the detector passes, held in a backend-only struct that derives no `Serialize`. Both check the launch's arguments **and its URL**: `launch_pairs(args, url)`'s query pairs, and any `user:pass@` userinfo, which is refused outright (`UrlHasCredentials`).

- [ ] **Step 1: Write the failing tests.** `from_entry_keeps_references`: `{"command":"npx","args":["-y","p@1.0.0"],"env":{"K":"${V}","L":"$W"}}` gives env `[{K,V},{L,W}]`. Codex `{"command":"x","env_vars":["T"],"bearer_token_env_var":"B","url":…}` is handled likewise. `a_literal_is_left_out_of_the_new_server`: `{"env":{"LOG_LEVEL":"debug"}}` gives a `NewServer` with no env, and `literals_of` gives `env == [("LOG_LEVEL","debug")]` (round 44 Q8's provisional default; under "drop every literal", `from_entry` gives `Err(SourceHasValues)` instead). `a_secret_looking_argument_is_refused`: args `["--api-key", <runtime-built sk- token>]` give `Err(SecretInEntry)`. So does any args where `redact::redact_launch(command, args)` differs from the plain join. `a_secret_in_a_url_is_refused`: a `url` of `https://x.example/mcp?api_key=<runtime-built sk- token>` gives `Err(SecretInEntry)`, and `https://user:pass@x.example/mcp` gives `Err(UrlHasCredentials)`. `a_literal_the_detector_flags_is_refused`: `{"env":{"GITHUB_TOKEN":<runtime-built ghp_ token>}}` gives `literals_of` → `Err(SecretInEntry)`.
- [ ] **Step 2: Run.** Expected: FAIL, `cannot find function from_entry`.
- [ ] **Step 3: Implement.** Check args and the URL with `findings::secret_findings(launch_pairs(args, url))`, and refuse URL userinfo with `reqwest::Url`'s `username()`/`password()` (`reqwest::Url` is re-exported by the direct dependency `reqwest = 0.12`; the `url` crate is only transitive, so add no dependency). Until Task 5 lands, it's the redact check and the userinfo check alone. Task 5 adds the detector call and a test case.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `entry.rs`, `mcp_entry_tests.rs`: `feat(mcp): read an existing entry for copy only when it holds no values`.

### Task 5: The plaintext-secret detector

**Files:** Create `src-tauri/src/mcp/findings.rs`. Modify `src-tauri/src/mcp/mod.rs`, `Cargo.toml` (`regex = "1"`, already in the lock as 1.13.2, so nothing new compiles), and `entry.rs` (call it from `from_entry`). Test: `src-tauri/tests/mcp_findings_tests.rs`.

**Interfaces:** Produces `Check`, `ConfigFinding`, `secret_findings` and `launch_pairs`.

- [ ] **Step 1: Write the failing tests.** These port mcpick's `src/utils/secrets.ts` (26 cases in `secrets.test.ts`, commit `225b5a2`): the 8 value patterns by their mcpick names, the key-name rule `(TOKEN|SECRET|PASSWORD|API[-_]?KEY)` giving `sensitive-key-value` only when no value pattern matched, and the placeholder skips (`${…}`, `<…>`, `x+`, `changeme`/`placeholder`/…/`none`, `your…`, shorter than 4). Every token is built at runtime. Plus:
  - `launch_pairs_reads_flags_and_query`: `["--api-key","v1","--token=v2","pos"]` with URL `https://x.example/mcp?api_key=v3&region=eu` gives `[("--api-key","v1"),("--token","v2"),("api_key","v3"),("region","eu")]`. With `https://u:p@x.example/mcp` it adds `("userinfo","u:p")`.
  - `a_finding_never_holds_the_value`: the serialised `ConfigFinding` has exactly the keys `check`, `key` and `pattern`, and its JSON does not contain the token.
  - `from_entry` gains the cases: args `["--key", <ghp_ token>]` give `SecretInEntry`, and so does a `url` whose query holds one.
- [ ] **Step 2: Run** `cargo test --test mcp_findings_tests`. Expected: FAIL, unresolved import `mcp::findings`.
- [ ] **Step 3: Implement.** Compile patterns once (`std::sync::LazyLock`). The module doc carries mcpick's MIT notice, as `switch/mod.rs` does.
- [ ] **Step 4: Run** both test files. Expected: PASS. Then plant the value `"sk-abcdefghijk"` under key `X` with the `api-key-sk` pattern deleted, and watch `api_key_sk_is_found` go red. Revert by inverse edit.
- [ ] **Step 5: Commit** `findings.rs`, `mcp/mod.rs`, `Cargo.toml`, `Cargo.lock`, `entry.rs`, `mcp_findings_tests.rs`, `README.md`: `feat(mcp): detect a plaintext secret by pattern name, never keeping the value`.

### Task 6: The unpinned-package detector

**Files:** Modify `findings.rs`. Test: `mcp_findings_tests.rs`.

**Interfaces:** Produces `unpinned_finding(command, args)` and `is_exact_version`. The finding's `key` is the runner's basename (`npx`, `uvx`, `pnpm`, `bunx`). The package name is never carried, because args can hold anything.

- [ ] **Step 1: Write the failing tests.** `unpinned_cases` is a table of `(command, args) → Option<pattern>`:
  - `npx ["-y","pkg"]` → `unpinned-version`; `npx ["-y","pkg@1.2.3"]` → None; `npx ["pkg"]` → `unpinned-version`
  - `npx ["-y","@s/p"]` → `unpinned-version`; `npx ["-y","@s/p@1.2.3"]` → None; `npx ["-y","pkg@latest"]` → `latest-tag`; `npx ["-y","pkg@^1.2.0"]` → `unpinned-version`
  - `uvx ["mcp-server-git"]` → `unpinned-version`; `uvx ["mcp-server-git==0.6.2"]` → None; `uvx ["mcp-server-git@0.6.2"]` → None; `uvx ["--from","mcp-server-git==0.6.2","mcp-server-git"]` → None
  - `pnpm ["dlx","pkg"]` → `unpinned-version`; `bunx ["pkg"]` → `unpinned-version`; `bunx ["pkg@1.0.0"]` → None
  - `/usr/local/bin/npx ["-y","pkg"]` → `unpinned-version`; `node ["server.js"]` → None
  - `is_exact_version`: `1.2.3`, `1.2.3-beta.1` and `1.2.3+b5` are true; `1`, `1.2`, `^1.2.3` and `latest` are false.
- [ ] **Step 2: Run.** Expected: FAIL, `cannot find function unpinned_finding`.
- [ ] **Step 3: Implement.** The package is the first argument after the runner (and `dlx` for `pnpm`) that does not start with `-`. `--from <spec>` wins for `uvx`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `findings.rs`, `mcp_findings_tests.rs`: `feat(mcp): flag a server that runs whatever version a package publishes next`.

### Task 7: The official Registry client

**Files:** Create `src-tauri/src/mcp/official_registry.rs`. Modify `mcp/mod.rs`. Test: `src-tauri/tests/mcp_official_registry_tests.rs`. Its fixtures live in `src-tauri/tests/fixtures/official_registry/`, trimmed from a real `/v0.1` page with names replaced.

**Interfaces:** Consumes `findings::is_exact_version` and `entry::NewServer`. Produces the items listed under "Interfaces this plan owns".

- [ ] **Step 1: Write the failing tests.**
  - `npm_maps_to_a_pinned_npx`: `io.github.example/weather`, npm `@example/weather-mcp` `1.4.2`, env `WEATHER_API_KEY` (isSecret) → `NewServer{name:"weather", Command{npx,["-y","@example/weather-mcp@1.4.2"]}, env:[{WEATHER_API_KEY,WEATHER_API_KEY}]}`. The name rule: the last `/`-separated segment of `registry_name`. Two Registry names sharing a last segment give the same suggested name; the form's name field is editable, and an add of a declared name is refused `already_there`.
  - `pypi_maps_to_a_pinned_uvx`: `mcp-server-time` `0.6.2` → `uvx ["mcp-server-time==0.6.2"]`.
  - `a_remote_maps_to_a_url_entry`: streamable-http → `Url{…,StreamableHttp}`; a required header `Authorization` → `HeaderRef{Authorization, var:"AUTHORIZATION", Raw}`.
  - `a_package_wins_over_a_remote`: npm, then pypi, then a remote.
  - Refusals: `oci` → `UnsupportedPackageType`; npm `^1.0.0` → `NotExactVersion`; `_meta[…official].status = "deprecated"` → `NotActive`; package transport `http` → `NotStdio`; a required runtime argument with no `value` → `NeedsRuntimeArgument`; no packages and no remotes → `NothingToRun`.
  - `non_required_non_secret_env_is_left_out`: a non-required env var with a `default` is not written.
  - `search_asks_v0_1_for_latest_and_keeps_active`: a `TcpListener` stub on 127.0.0.1, in the style of `mcp_cached_probe_tests.rs`, records the request line `GET /v0.1/servers?search=weather&version=latest&limit=30`. It serves 3 records (active, deprecated, active with `oci`). The result has 2 entries, the `oci` one with `refused: Some("unsupported_package_type")`, and `next_cursor` comes from `metadata.nextCursor`.
  - `entry_encodes_the_name`: the request line is `GET /v0.1/servers/io.github.example%2Fweather/versions/1.4.2`.
  - Failures: a 500 → `BadStatus`; a stub that never answers, with the timeout shortened through a `#[doc(hidden)]` `_within` twin → `Unreachable`; non-JSON → `Unparseable`.
- [ ] **Step 2: Run** `cargo test --test mcp_official_registry_tests`. Expected: FAIL, unresolved import.
- [ ] **Step 3: Implement** with `reqwest::Client` and `REGISTRY_TIMEOUT`. The name goes through `reqwest::Url::path_segments_mut` so `/` becomes `%2F`. The user agent is a fixed generic string, `Hanger`. No error carries response text.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** the listed files and `README.md`: `feat(mcp): read the official MCP Registry and map a record to a pinned entry`.

---

# Part B — waits as marked (waves 2 and 3)

### Task 8: GATE G-N, the naming brief (stops for Karthik)

This brief is a section of design §7's naming round, in `docs/plans/2026-11-28-naming-round.md` (P1's Gate N and P7's G1 append to the same file). Its labels: the add action, remove, copy ("Copy to…"), Registry search (field, results, "no results", the refusal reasons per `RegistryRefusal`), the form's fields (name, command, arguments, URL, environment variable, the variable it reads, header, Bearer), the scope choice ("your user settings" vs "this repository"), the two finding categories and their Problem strings, their `NeedsReviewPane` legend words, and the words for each new failure code. The new codes are `no_entry_write`, `refs_unconfirmed`, `env_rename_unsupported`, `url_unconfirmed`, `url_transport_unsupported`, `secret_in_entry`, `source_has_values`, `already_there` (reused), `registry_unreachable`, and the five Registry refusals. One line on the form must say that an engine opened from Finder doesn't see shell variables.

- [ ] Append this plan's section to `docs/plans/2026-11-28-naming-round.md` and stop for sign-off, researched against what VS Code, Cursor and mcpick call these. Include the copy for round 44 Q8's answer (a copy that carries non-secret values, shown by key name only). Run `/humanizer` on every string.
- [ ] **STOP.** Karthik signs off string by string. Read his answer from the conversation, never infer it. Nothing in Tasks 10, 13 and 15 renders a string before this.

### Task 9: Findings at the parse boundary and in the inventory (§7 amended)

Placed in Part B by the dispatch. It has no code dependency on P2. It touches `dialect.rs`, where P2's Task 5 changes `servers_from_toml_table` (P2 reads Claude's per-project lists in `context.rs`, not here); whichever merges second rebases.

**Files:** Modify `src-tauri/src/mcp/dialect.rs`, `src-tauri/src/domain.rs`, `src-tauri/src/scanner.rs`, `docs/scanning.md` §7. Add the mechanical `findings: vec![]` to every literal. By grep on `main` at `e673e20`, that is **19** `McpServer {` literals across 6 files and **9** `Tool {` literals (`scanner.rs` ×2, `domain.rs` ×1, and one each in `registration_key_tests.rs`, `mcp_server_tests.rs`, `mcp_scanner_tests.rs`, `mcp_server_protocol_tests.rs`, `ipc_boundary_tests.rs`, `search_tests.rs`). Re-grep before editing. Tests: `mcp_findings_tests.rs` and `ipc_boundary_tests.rs`.

**Interfaces:** Produces `McpServer.findings: Vec<ConfigFinding>` and `Tool.findings: Vec<ConfigFinding>` (serialised, `#[serde(default, skip_serializing_if = "Vec::is_empty")]`). `domain::Tool` derives `Serialize, Deserialize`, which is why `ConfigFinding` and `Check` derive both and `pattern` is a `String` (see "Interfaces this plan owns").

- [ ] **Step 1: Write the failing tests.**
  - `parse_flags_a_plaintext_env_value`: `McpServers` `{"mcpServers":{"a":{"command":"x","env":{"GITHUB_TOKEN":<ghp_ token>}}}}` gives `findings == [{PlaintextSecret,"GITHUB_TOKEN","github-personal-access-token"}]`.
  - `parse_flags_headers_and_codex_tables`: JSON `headers`; OpenCode `environment`; Codex `env` and `http_headers`.
  - `a_file_hanger_wrote_raises_no_secret_finding`: run `render` + `add_server` for Claude Code, Gemini and Codex on `gh`, then parse. No `PlaintextSecret`.
  - `parse_flags_an_unpinned_launch`: `npx -y pkg` gives `{UnpinnedPackage,"npx","unpinned-version"}`.
  - In `ipc_boundary_tests.rs`, `a_serialised_tool_carries_findings_and_no_value`: `tool_with_a_credential()` serialises a `findings` array, and its JSON contains no fixture credential.
- [ ] **Step 2: Run** `cargo test --test mcp_findings_tests --test ipc_boundary_tests`. Expected: FAIL, `struct McpServer has no field named findings`.
- [ ] **Step 3: Implement.** Each parser collects `(key, value)` pairs from the entry's `env` / `environment` / `headers` (JSON) or `env` / `http_headers` (TOML), plus `launch_pairs`. It calls `secret_findings` and `unpinned_finding`, then drops the values. `scanner.rs` copies `findings` onto `Tool`. Rewrite §7's first bullet to say what is now true: values are read at the parse boundary to be matched against patterns, and only the key and pattern name are kept. No value is held in a domain struct, the store, a log or an IPC reply.
- [ ] **Step 4: Run** the full `cargo test` from `src-tauri/`. Expected: PASS. Then re-capture the per-kind counts. They must equal `counts-before.txt` (findings change no row).
- [ ] **Step 5: Commit** production and docs (`dialect.rs`, `domain.rs`, `scanner.rs`, `docs/scanning.md`) together with the new tests: `feat(scan): flag plaintext secrets and unpinned launches, keeping only key and pattern`. The 9 + 19 forced literal edits in test files are named in the body, because neither half compiles alone (`verification.md`, the ordering exception).

### Task 10: Needs review shows the two findings

**Waits on:** Tasks 8 and 9, and P7's Task 10 (ruling R5: P7 adds `signed_out` and `settings_unreadable` to `reviewIssues.ts`, `NeedsReviewPane`'s `LEGEND` and `ReviewSidebar` first; this task rebases onto it and names it in the commit body).

**Files:** Modify `src/utils/reviewIssues.ts`, `src/App.tsx`'s `Tool` type (stage by hunk; a peer holds uncommitted edits in this file), `src/components/NeedsReviewPane.tsx` (`LEGEND`, the aria label) and `src/components/ReviewSidebar.tsx`. Test: `src/utils/reviewIssues.test.ts`.

- [ ] **Step 1: Write the failing tests.**
  - `a_tool_with_a_secret_finding_is_one_secret_issue`: one Tool with two `PlaintextSecret` findings gives one issue of kind `secret`, whose `detail` names both keys and patterns, and `counts.secret === 1`.
  - `an_unpinned_finding_is_an_unpinned_issue`.
  - `a_tool_with_no_findings_adds_no_issue`.
  - `a_parse_failure_still_outranks`: SEVERITY order is broken, drifted, parse, secret, unpinned, duplicate.
- [ ] **Step 2: Run** `npx vitest run src/utils/reviewIssues.test.ts` from the repo root. Expected: FAIL.
- [ ] **Step 3: Implement.** `IssueKind` gains `"secret" | "unpinned"`, and `ReviewCounts` gains the two fields, counted in the existing loop. This is the existing, design-blessed exception to "counts come from the backend" (§4.3, "as it maps drift today"): `deriveReviewIssues` already tallies drift and parse issues in that loop, and these two are tallied the same way. Strings come only from G-N.
- [ ] **Step 4: Run** `npx vitest run`, `bunx tsc --noEmit` (report the exit code), then a screenshot of Needs review in the dev app per `verifying-ui.md`. Use a throwaway fixture file holding a runtime-written fake token, never a real config. Name the theme in the evidence file.
- [ ] **Step 5: Commit** by explicit path. For `src/App.tsx`, use `shared-checkout.md`'s exact-blob recipe. Message: `feat(review): show plaintext secrets and unpinned launches in Needs review`.

### Task 11: Claude Code add and remove through `vendor`

**Waits on:** P4's Task 3b (`apply::CommandReceipt`, ruling R2). The tests are vendor-only and need no `ops`, so this task does not wait on P2 and can run in wave 1 once Task 3b lands.

**Files:** Modify `src-tauri/src/mcp/switch/vendor.rs` and P5's `src-tauri/src/vendor_cli/mod.rs` (one arm in `undo`, after telling P5; only if P5's Task 4 is on `main`, else P5 adds it from this task's `SendMessage`). Test: `mcp_switch_tests.rs`, using its `#!/bin/sh` fake `claude` (section "Claude Code, switched through its own command").

**Interfaces:** Produces `claude_add`, `claude_remove` and `claude_reverse` (see "Interfaces this plan owns"). Consumes P4's `CommandReceipt`, `ReverseProgram::Claude`, `record_command` and `load_command`.

- [ ] **Step 1: Write the failing tests.**
  - `claude_add_runs_add_json_with_the_entry_on_stdin`: the config gains the entry, the argv is exactly `mcp add-json weather - --scope user`, and the entry is absent from argv.
  - `claude_add_refuses_a_declared_name`: `AlreadyThere`, and the fake's call log is empty.
  - `claude_add_refuses_an_entry_add_json_would_change`: the fake drops `description`. Result `WouldNotComeBack`, the real config is byte-identical, and no receipt exists.
  - `claude_add_records_its_reverse`: `load_command(receipts, &r.id)` has `program: Claude`, `reverse_args == ["mcp","remove","weather","--scope","user"]`, `reverse_stdin_stash: None`.
  - `claude_remove_keeps_the_entry_in_the_stash_and_not_in_the_receipt`: `claude_stashed` is empty; the receipt has `reverse_args == ["mcp","add-json","weather","-","--scope","user"]` and `reverse_stdin_stash: Some(id)`; `<stash>/claude-code/removed/<id>.json` holds the entry; the receipt file's text holds none of the entry's four switch markers.
  - `reversing_a_remove_gives_the_entry_back` and `reversing_an_add_removes_it`, each through `claude_reverse`, each recording a receipt whose own reverse is the original write.
  - `stash_records_and_receipts_are_0600_in_0700_folders`.
- [ ] **Step 2: Run** `cargo test --test mcp_switch_tests claude_`. Expected: FAIL, `cannot find function claude_add`.
- [ ] **Step 3: Implement** by reusing `comes_back`, `read_entry`, `keep` and `Scratch`. The pre-flight runs for add and for remove, so a removed entry provably comes back. The stash record and the receipt are written and synced **before** the command, as `claude_off` keeps. "The file decides, never the command" holds for both. Extend the module doc's tables, and correct its sentence that Hanger never writes `.claude.json` together with P2 (whose per-project switch makes it false): say it in one place, in `vendor.rs`'s module doc, true of both plans. Neither `README.md` nor `docs/ipc.md` carries that sentence (grep checked 2026-11-28).
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit** `vendor.rs` and `mcp_switch_tests.rs` (and `vendor_cli/mod.rs` if this task added the arm): `feat(mcp): add and remove a Claude Code server through its own command, with a receipt holding its reverse`. Then `SendMessage` P4 (Recent changes will list these receipts) and P5 (the `mcp` arm of `vendor_cli::undo`).

### Task 12: `ops` add, remove and copy, and `ENTRY_WRITES`

**Waits on:** P2's Task 2 (`ops::Target`) merged (the serial spine, design §6 B), and Task 11.

**Files:** Modify `src-tauri/src/mcp/switch/ops.rs`, `src-tauri/src/mcp/registry.rs`, `src-tauri/src/mcp/discover.rs` (make `home_base_for` `pub(crate)`) and `src/__tests__/brand-coverage.test.ts`. Tests: `mcp_switch_tests.rs`, `ipc_boundary_tests.rs`.

**Interfaces:** Consumes P2's `Target`, `entry::*` (`literals_of` included), `edit::entries::*`, `findings::*`, `vendor::claude_add`/`claude_remove`/`claude_reverse` and `apply` (unchanged).
Produces:
- `add_for(places, cli, engine_id, server: NewServer, probe_of) -> Result<SwitchReply, SwitchFailure>`
- `remove_for(places, cli, engine_id, key, probe_of) -> Result<SwitchReply, SwitchFailure>`
- `copy_for(places, cli, engine_id, from_key, name: Option<String>, probe_of) -> Result<SwitchReply, SwitchFailure>`
- `entry_for_key(places, from_key) -> Result<NewServer, SwitchFailure>`
- `check_entry(&NewServer) -> Vec<ConfigFinding>`
- `#[doc(hidden)]` `_with(rows: &[EntryRow], …)` twins for the three writers
- New `SwitchFailure` variants with codes: `NoEntryWrite`, `RefsUnconfirmed`, `EnvRenameUnsupported`, `UrlUnconfirmed`, `UrlTransportUnsupported`, `SecretInEntry`, `SourceHasValues`
- `undo_for` accepts `cmd:<uuid>` ids for `claude-code` (loaded with `apply::load_command` and handed to `vendor::claude_reverse`, the same function P5's `undo_vendor_change` reaches), and `file:` receipts for a file named by this engine's `ENTRY_WRITES` rows. So the form's own Undo stays `undo_mcp_switch`.

- [ ] **Step 1: Write the failing tests**, all through the `_with` twins with a test row, against a temp home:
  - `add_for_writes_a_codex_entry_and_undo_takes_it_out`: `~/.codex/config.toml` gains `[mcp_servers.weather]`, the receipt is `file:`, and `undo_for` restores the bytes exactly.
  - `add_for_creates_a_missing_gemini_settings_file_and_undo_removes_it`.
  - `add_for_refuses_an_engine_with_no_entry_row` → `no_entry_write`. The real `ENTRY_WRITES` is empty at this commit, so `add_for` on `codex` is refused.
  - `add_for_refuses_references_not_yet_confirmed` → `refs_unconfirmed` (row `env_refs: false`, server with env).
  - `add_for_refuses_a_declared_name` → `already_there`.
  - `add_for_refuses_a_literal_secret_in_arguments` → `secret_in_entry`. No file is written (check mtime and bytes).
  - `remove_for_takes_out_a_server_by_key_and_undo_restores_it` (Codex and Antigravity).
  - `remove_for_refuses_a_key_from_another_engine` → `wrong_engine`; an unknown key → `not_found`.
  - `copy_for_copies_a_claude_entry_into_codex` (the entry holds `${GITHUB_TOKEN}` under key `GITHUB_TOKEN`).
  - `copy_for_carries_a_non_secret_literal_file_to_file` (round 44 Q8, provisional default): a Claude source with `{"LOG_LEVEL":"debug"}` copied into Gemini writes `"LOG_LEVEL": "debug"` in the target file, and the `SwitchReply` serialises no `debug`. Under "drop every literal" this test is replaced by `copy_for_refuses_a_source_holding_a_literal` → `source_has_values`.
  - `copy_for_refuses_a_source_whose_literal_is_a_secret` → `secret_in_entry`.
  - `add_for_refuses_when_the_config_folder_is_missing`: with no `~/.gemini/` folder, the add is `Err(WriteFailed)` from `apply`'s `NO_FOLDER`, and nothing is created.
  - `check_entry_warns_on_an_unpinned_launch`.
  - In `ipc_boundary_tests.rs`, `entry_replies_never_carry_a_config_value`: the four switch markers sit in a source entry, and none reaches any `SwitchReply` or `NewServer` returned.
  - In `brand-coverage.test.ts`, `every ENTRY_WRITES host is a HOSTS id`, plus a floor of `0`, raised by every Task 16 round. This lands in the same commit as the `ENTRY_WRITES` table (design §5: tables keyed to `HOSTS` get their coverage assertion "in the same commit").
- [ ] **Step 2: Run** `cargo test --test mcp_switch_tests --test ipc_boundary_tests`. Expected: FAIL, `cannot find function add_for`.
- [ ] **Step 3: Implement.**
  - The target of an add is P2's `Target`, extended with `NewEntry`. The path comes from `ENTRY_WRITES.file`, resolved through `discover::home_base_for` (so `CODEX_HOME` and `CLAUDE_CONFIG_DIR` are honoured as discovery honours them), and never from the webview.
  - Remove resolves by key exactly as a switch does ("A key is not a path").
  - Order: `entry::check`, the row, `render`, the row's `env_refs`/`header_refs`/`urls`, `findings::secret_findings(launch_pairs)`, `add_server`, `safe_replace` with `Format::Toml` or `Format::Jsonc`.
  - Claude Code goes to `vendor`.
  - Gemini's state file is left alone on remove; a stale key there is harmless and is noted in the doc.
  - An add whose config folder is missing (`~/.gemini/` itself) is refused through `apply`'s `NO_FOLDER`; Hanger doesn't create an engine's folder.
  - A copy writes `literals_of`'s values into the rendered entry inside `ops`, after `render`, so they never enter a `NewServer`.
  - Extend `ops`' module doc tables.
- [ ] **Step 4: Run** the full `cargo test`, `npx vitest run src/__tests__/brand-coverage.test.ts`, then the four gates. Re-capture per-kind counts; they must equal the baseline.
- [ ] **Step 5: Commit** production with its tests and the `brand-coverage.test.ts` assertion and floor, in one commit (design §5): `feat(mcp): add, remove and copy a server behind a confirmed-engine table`. The body names the guard addition and why it rides in this commit.

### Task 13: Commands and the webview contract

**Waits on:** Tasks 7, 8 and 12.

**Files:** Modify `src-tauri/src/lib.rs` (`generate_handler!`), `docs/ipc.md` (six sections, at the next free numbers at commit time), `README.md` (the `ipc` and `tests` regions, regenerated; the `ipc` figure rises by 6 over the tip), `src/types/engineContext.ts` (the codes union) and `src/utils/switchCopy.ts` (words from G-N). Tests: `ipc_boundary_tests.rs`, `src/utils/switchCopy.test.ts`.

**Interfaces:** Thin wrappers built from `switch_places` and `claude_cli_for`:
- `search_mcp_registry(query, cursor) -> Result<RegistrySearch, String>`
- `get_mcp_registry_entry(registry_name, version) -> Result<NewServer, String>`
- `get_mcp_server_entry(from_key) -> Result<NewServer, String>`
- `check_mcp_server_entry(server) -> Vec<ConfigFinding>`
- `add_mcp_server(engine_id, server) -> Result<SwitchReply, String>`
- `remove_mcp_server(engine_id, key) -> Result<SwitchReply, String>`

Undo stays `undo_mcp_switch`. The human "copy" is `get_mcp_server_entry` filling the form, then `add_mcp_server`. The human Registry add is `get_mcp_registry_entry` filling the form. So the form is the only human write path.

- [ ] **Step 1: Write the failing tests.** `switchCopy.test.ts`: every new code has a non-empty string. In `ipc_boundary_tests.rs`, `registry_and_entry_commands_carry_no_value` applies the four markers to `get_mcp_server_entry` (a refused source returns only a code). `readme-sync` goes red until regenerated.
- [ ] **Step 2: Run** `npx vitest run src/utils/switchCopy.test.ts` and `cargo test --test ipc_boundary_tests`. Expected: FAIL.
- [ ] **Step 3: Implement**, regenerate the README, and write the `docs/ipc.md` sections.
- [ ] **Step 4: Run** the four gates. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(ipc): add, remove, copy and Registry commands for MCP servers`.

### Task 14: GATE G-L, layout options (stops for Karthik)

- [ ] Render two or three options at true width in real tokens for the add form: where it opens (no blocking dialog), the command/URL switch, environment variables as key plus variable, headers, the unpinned warning, and the "engine opened from Finder" line. Do the same for Registry results: trust signals (repo link, published date, status) and a refused row with its reason. Also show the entry point for Copy to… and for Remove on a server row. Use G-N's strings only. Draft canvases are moved to `docs/design-ref-prototypes/` before any commit.
- [ ] **STOP.** Karthik picks, usually a hybrid. His pick names the component files for Task 15.

### Task 15: The form, Registry results, Copy and Remove

**Waits on:** Tasks 13 and 14.

**Files:** As decided at G-L, under `src/components/`, each with a test and a Design system specimen (`design-system-coverage.test.ts`). Stage `src/App.tsx` by hunk if it is touched.

- [ ] **Step 1: Write the failing tests** for each component. Submitting calls `add_mcp_server` with exactly the `NewServer` built from the fields. No field exists for a variable's value (assert that no `input` is labelled for one). A refused Registry row has no Add button and shows its reason. Remove shows the receipt's Undo. A `check_mcp_server_entry` warning renders before submit. Counts shown come from the backend only.
- [ ] **Step 2: Run** the component tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Use type roles, tokens and the sheet corner per `DESIGN.md`. Errors go through `switchCopy`.
- [ ] **Step 3b: Regenerate the README figures.** This task adds a test file, so the `tests` figure moves. Run `~/.bun/bin/bun run src/__tests__/readmeCounts.ts`, then `npx vitest run src/__tests__/readme-sync.test.ts` from the repo root. Expected: PASS. Add `README.md` to the commit.
- [ ] **Step 4: Run** the four gates, then take screenshots from the dev app (`verifying-ui.md`: pid filter, title `Hanger AI (dev)`, frontmost, the theme read from the store). At this point `ENTRY_WRITES` is empty, so the evidence shows the form and its `no_entry_write` refusal. A successful add is shown in Task 16.
- [ ] **Step 5: Commit**: `feat(mcp): a form to add a server by hand, from the Registry or from another engine`.

### Task 16: GATE G-V, a live check per engine, each landing its `ENTRY_WRITES` row (four rounds, each stops for Karthik)

**Files:** Create `src-tauri/tests/mcp_entry_live.rs` (`#[ignore]`). Modify `registry.rs` (one row per round), `brand-coverage.test.ts` (floor +1 per round). Evidence goes in `docs/evidence/2026-11-28-slice3/<engine>/`, which is local-only.

Order, per Answer Q5: Claude Code, Codex, Gemini CLI, Antigravity CLI. Each round:

- [ ] **Step 1:** Run `cargo test --test mcp_entry_live live_<engine> -- --ignored` with a throwaway `HOME` under the scratchpad (and `CLAUDE_CONFIG_DIR`/`CODEX_HOME` inside it). It calls `ops::add_for_with` using the candidate row, then the engine's own CLI, then `remove_for`, then `undo_for`. The server is `hanger-live-check`, with command `/bin/sh` and args `["-c","printenv HANGER_PROBE_KEY > <tmp>/seen"]`, env `[{HANGER_PROBE_KEY, HANGER_LIVE_VAR}]` and `HANGER_LIVE_VAR=live-ok` in the CLI's environment. Record:
  - the config diff after add, after remove and after Undo
  - `<engine> mcp list` (and `codex mcp get hanger-live-check --json`) after add and after remove
  - `<tmp>/seen` (`live-ok` proves `env_refs`; for Codex, which does not start servers on `list`, `env_vars` listed back by its own `mcp get` is the evidence)
  - the receipt files
  - For Claude Code and Codex, a URL entry to `http://127.0.0.1:9/mcp` with a Bearer header reference, listed back, which proves `urls` and `header_refs`.
- [ ] **Step 2: STOP.** Karthik reads the artefacts. His "done" is not the result; the files are (`verification.md`, Human-gated steps).
- [ ] **Step 3:** On his word, add the row with `confirmed: "<cli> <version>, <date>"`. Each bool is true only where Step 1 showed it. Raise the floor. Then take a dev-app screenshot of a successful add into a throwaway `HANGER_TEST_HOME` instance. If a peer's dev app is running, ask Karthik before starting a second one.
- [ ] **Step 3b: Regenerate the README figures (first round only, when `mcp_entry_live.rs` is created).** This task adds a test file, so the `tests` figure moves. Run `~/.bun/bin/bun run src/__tests__/readmeCounts.ts`, then `npx vitest run src/__tests__/readme-sync.test.ts` from the repo root. Expected: PASS. Add `README.md` to the commit.
- [ ] **Step 4:** Run `cargo test` and `npx vitest run`, then commit: `feat(mcp): <engine> adds and removes servers, confirmed by its own listing`.

### Task 17: Repository scope for Codex and Gemini CLI, untracked files only (Answer Q2)

**Waits on:** P2's Task 5, which lands `project::refused_files` and starts only after Claude Code's live check (P2 Task 4 Step 6) is accepted, so this task sits behind that human gate. Then Task 16's Codex and Gemini rows.

**Files:** `ops.rs`, `registry.rs` (`Project` rows for `.codex/config.toml` and `.gemini/settings.json`), `lib.rs` (a `project: Option<String>` argument on `add_mcp_server` and `remove_mcp_server`, resolved with P2's `KnownProject::among` over `preferences::get_linked_directories`; no match is `Err("not_found")`), the form's scope control from G-L, `docs/ipc.md`. Tests: `mcp_switch_tests.rs`, `mcp_entry_live.rs`.

Claude Code project scope is out by the vendor-CLI ruling: Claude Code entries are written only through `claude mcp … --scope user`, and a project-scope `claude mcp` write is not part of it. (A repo's `.mcp.json` is a plain `McpServers` file, so file format is not the reason.)

- [ ] **Step 1: Write the failing tests.**
  - `a_project_add_writes_an_untracked_file`: a temp git repo where `.codex/config.toml` is absent gains the file.
  - `a_project_add_refuses_a_tracked_file`: the file is committed; `refused_files` returns it, the add is `Err(ReadOnly)` with the item's reason `RepoFileTracked`, and the bytes are unchanged.
  - `a_project_remove_by_key_refuses_a_tracked_file`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** on P2's `Target::InProject { project, .. }` and this plan's `Target::NewEntry`, calling `refused_files(project.real_path(), &[path])` before every write and every Undo.
- [ ] **Step 4:** Live check in a throwaway repo under a throwaway `HOME`, for both the tracked and the untracked case, with the same artefacts as Task 16. **STOP for Karthik**, then land the rows.
- [ ] **Step 5: Commit**: `feat(mcp): add a server to a repository's own config when git does not track it`.

### Task 18: The model's verbs in `Ask` (wave 3)

**Waits on:** P1 merged (Track Q). P1 owns `Ask`, so this extends it and never replaces it (ruling R3).

**Files:** `src-tauri/src/mcp_server/proposals.rs`, `approve.rs`, `mod.rs` (three tools in `TOOLS`), `strings.rs`, P1's `src/types/mcpProposals.ts` only if a new target arm is needed (it isn't: these previews use `PreviewTarget::Server`), `docs/mcp-server.md`, `docs/ipc.md`. Test: `src-tauri/tests/mcp_proposal_tests.rs`.

**Interfaces** (P1's committed names):
- `Ask::Add { engine_id: String, from_key: String }`, `Ask::Remove { engine_id: String, key: String }` and `Ask::AddFromRegistry { engine_id: String, registry_name: String, version: String }`. Wire, under P1's `#[serde(tag = "verb", rename_all = "snake_case")]`: `{"verb":"add","engine_id":…,"from_key":…}`, `{"verb":"remove",…}`, `{"verb":"add_from_registry",…}`. There is no entry body and no free text. `from_key` and `key` are stored as the real resolved keys.
- One filing function per verb, each `(p: &ServerPlaces, …, asked_by: Option<&'static str>, now_ms: i64) -> Result<Fresh<Filed>, Refusal>`, each running `scanned(p)?` first: `propose_add(p, engine_id, from_key, …)`, `propose_remove(p, engine_id, key, …)` and `propose_registry_add(p, engine_id, registry_name, version, …)`. A model's `from_key`/`key` is a public id, resolved the way P1 resolves one: the items of `context_for` whose `public_key(&item.key)` equals it, exactly one match or `NotFound`/`Ambiguous`. `version` must pass `is_exact_version`. Then P1's queue check.
- Tools in `TOOLS`, working names until P1's Gate N: `propose_server_add(engine_id, from_key)`, `propose_server_remove(engine_id, key)`, `propose_registry_add(engine_id, registry_name, version)`.
- Preview arms, in P1's `Preview` with `to: None` (neither verb is on or off), `name` the server's name through `public_name`, and `target: PreviewTarget::Server { engine_id, engine_name, config_path }`:
  - An add to a file host: `change: Change::Lines { lines }`, the lines the file gains (`+ ` prefix), run through P1's withheld rule; a line that fails it makes the change `Withheld`. They hold no value: a copy source with a secret is refused, its non-secret literals (round 44 Q8) appear by key name only because the add preview renders the entry with each literal replaced by its key, and Registry entries carry references only. For Claude Code: `change: Change::Command { argv: ["claude","mcp","add-json",<name>,"-","--scope","user"] }`; the entry goes on stdin and none of it is shown.
  - A remove from a file host: `change: Change::Withheld`, because the removed lines may hold a secret; the band says only the name and the file. For Claude Code: `Change::Command { argv: ["claude","mcp","remove",<name>,"--scope","user"] }`.
- Decide arms: `approve::decide` calls `ops::copy_for`, `ops::remove_for` and `ops::add_for` (fed by `official_registry::entry`), and records P1's `Status::Applied { receipt_id, stopped_at: None }`.

- [ ] **Step 1: Write the failing tests.**
  - `the_ask_wire_shape_is_pinned` extended with the three literals above.
  - `a_registry_add_is_revalidated_at_approval`: the stub's record turns deprecated between propose and approve, giving `Failed{code:"not_active"}`.
  - `a_remove_preview_carries_no_entry_text`: the four markers are absent, and `change` is `Withheld` (file host) or `Command` (Claude Code).
  - `an_add_from_a_source_with_a_secret_is_refused_at_propose`: `Err` with no file written.
  - `an_ask_carries_no_free_text`: the serialised keys are exactly the listed ones.
  - `a_public_id_shared_by_two_servers_is_ambiguous`: two servers whose names share their first 127 of 129+ characters give `Err(Ambiguous)`.
- [ ] **Step 2: Run** `cargo test --test mcp_proposal_tests`. Expected: FAIL (no variant `Add`).
- [ ] **Step 3: Implement.** Tell P1 on `SendMessage` before editing its files.
- [ ] **Step 4:** Run the four gates. Then do a live check with Karthik in his engine: a proposed Registry add, approved, then its Undo. Keep the transcript and the config diff. **STOP for Karthik.** T23 is not triggered: a proposal holds no model-written text. If a preview would ever render text a model wrote, stop and ask in Plannotator first.
- [ ] **Step 5: Commit**: `feat(mcp-server): a model may propose adding and removing a server`.

### Task 19: Close

- [ ] Re-capture the per-kind counts into `counts-after.txt`. Every category must equal `counts-before.txt`. A move is a blocker to report.
- [ ] Run the four pinned gates from the repo root, each in its own call. Record their exit codes.
- [ ] Run `stage-gate --dev` (a fresh reviewer) before push, and `--release` after merge (`git -C <main checkout> merge --ff-only`, gates rerun on the merged tree). Grep the merged tree's strings for claims a sibling branch falsifies (`ui-copy.md`).

---

## Human gates, and where they sit

| Gate | Where | Verified by |
|---|---|---|
| G-N naming brief and `/humanizer` (add, remove, copy, Registry search, finding categories, codes) | Task 8, before Tasks 10, 13 and 15; appended to `docs/plans/2026-11-28-naming-round.md` | Karthik's sign-off in the conversation |
| G-L layout options at true width (add form, Registry results, Copy/Remove entry points) | Task 14, before Task 15 | His pick, in the conversation |
| G-V live check per engine in a throwaway `HOME`: Claude Code, Codex, Gemini CLI, Antigravity CLI | Task 16, four rounds; each lands one `ENTRY_WRITES` row | Config diffs, the engine's own `mcp list`/`mcp get`, `seen` file, receipts, screenshot |
| Repository-scope live check (tracked and untracked) | Task 17 | The same artefacts in a throwaway repo |
| Model add/remove live check | Task 18 | Transcript, config diff, receipt |
| T23 | Not triggered (no model-written text is rendered); Task 18 stops if that changes | Plannotator |
| `stage-gate --plan` (dispatcher), `--dev`, `--release` | Before build; Task 19 | Fresh reviewer |

## Out of scope

The other 13 `HOSTS` (each one waits for its own live check, in a later plan). Claude Code local or project scope (the vendor-CLI ruling covers `--scope user` writes only; Karthik can widen it). Gemini and Antigravity URL entries, until `dialect` reads `httpUrl`/`serverUrl`. Literal env or header values in the form (a copy may carry non-secret ones file to file, round 44 Q8). Registry `default` values. The `mcp_server` `findings` tool (P1's, on Karthik's word). Hanger adding its own server (server plan Decision 8, a follow-on). Hash-change and `curl | sh` findings (`docs/roadmap.md`). A Keychain launcher. A remove for a server kept off in the Claude stash.

## Known limits

- **mcpick's case count and commit `225b5a2`** were not checked by the review; Task 5's port should cite what it actually copied.
- **Two Registry names sharing a last segment** suggest the same server name; the person renames in the form, and a model's `propose_registry_add` of a declared name is refused `already_there`.
- **`deriveReviewIssues` tallies `secret` and `unpinned` in the webview**, the existing exception design §4.3 blesses; `no-frontend-counting.test.ts` is unaffected because the tally lives in that file's allowed loop.
- **Literal values copied file to file** (round 44 Q8's provisional default) are never shown, so a person approves a copy without seeing them; the preview lists their keys.
