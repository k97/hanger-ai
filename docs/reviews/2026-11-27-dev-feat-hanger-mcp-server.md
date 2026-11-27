# stage-gate --dev: feat/hanger-mcp-server, phase 1

- **Artifact:** `git diff 01201dc..HEAD` on `feat/hanger-mcp-server` (worktree
  `hanger-mcp-server`). Phase 1 of `docs/plans/2026-11-27-hanger-mcp-server.md`,
  Tasks 1 to 7. 17 commits, `6fe9475` to `63955d2`. `docs/reviews/` is left out.
- **Pinned ref:** `63955d20576e21719ebc1250a87a9af0c6abcc57`. It was re-read after the gates ran and had not moved.
- **Reviewer:** independent. A fresh session that wrote none of this work.
- **Base:** `01201dc`. The range holds only this branch's commits (`git log 01201dc..HEAD`).
  `main` has moved to `fb189ac` since then. That matters for finding 3.

## Evidence run

- `npx vitest run` (worktree root): 184 files, 1751 tests passed, exit 0.
- `bunx tsc --noEmit`: exit 0.
- `gitleaks detect --source .`: "no leaks found", exit 0. `gitleaks detect --source . --no-git -c .gitleaks.toml`: "no leaks found", exit 0. Both were run from the worktree root (`pwd` printed).
- `cargo test --test mcp_server_tests --test mcp_server_boundary_tests --test mcp_server_protocol_tests --test store_read_tests` (src-tauri/): 21 + 1 + 18 + 8 passed, 0 failed, exit 0.
- **Not run by me:** the full `cargo test`. Nothing under `src-tauri/` has changed since `f3917b6`, where round 36 reports 993 passed (`git diff --stat f3917b6..HEAD` shows four `docs/plans` files only). That figure is the author's, not this gate's.
- **Live check.** I drove the worktree's release binary at `src-tauri/target/release/tauri-app`, built 21:23 at `82aaf26`. `git diff 82aaf26..HEAD -- src-tauri/src src-tauri/Cargo.toml` is empty, so it is the code under review. It ran under `env -i HOME=$HOME` against the real store, which the server opens read-only:
  - `find_assets("chrome-devtools")` returns `{"kind":"server","id":"~/.claude.json:chrome-devtools","path":"~/.claude.json"}`
  - `reach("~/.claude.json")`, the `path` above, gives `isError: true`, "Hanger has nothing under that engine id or path…"
  - `reach("~/.claude.json:chrome-devtools")`, the `id` above, is answered (`beyond.kind = ancestor_reach`)
  - stderr: 0 bytes.

## Findings

```
File: src-tauri/src/mcp_server/tools.rs:169 (engine_context, items[].key) and :203 (find_assets, assets[].id)
Lens: Verification
Guideline: Ruling Q4 and plan Task 3: "Every name that leaves the process goes through [public_name]", meaning capped at 128 with control characters removed.
Why: A server's key is `format!("{config_path}:{name}")` (`domain.rs` → `RegistrationKey::new`). `public_path` → `sanitise_path` rewrites only the home prefix, so a server name from a config file leaves raw, with its newlines and at any length, in `key` and `id`, beside a `name` field that is capped. No test plants a long or multi-line server name: the 500-character test checks a skill's `name` in find_assets only. `docs/mcp-server.md` ("Names are cut at 128 characters") overclaims as a result.
Suggested action: Build the public key from its parts, `public_path(config_path) + ":" + public_name(name)`, in both places. Apply the same transform in `reach`'s match, because reach takes this id back (finding 2). Add a test that declares the newline-plus-500 name on a Codex server and asserts on `key` and `id`.
```

```
File: src-tauri/src/mcp_server/strings.rs:36-41 (REACH description and argument line), tools.rs:237-249
Lens: Verification
Guideline: ui-copy.md: "Copy must be literally true of the code."
Why: The signed-off copy tells the model to pass "the asset's path as find_assets returns it". For a server or an mcp_tool, find_assets' `path` is the config file, and reach answers not_found. Reach answers only when given the `id` (the registration key, which is the annotation's `asset_path`). The live check above shows both. The copy is false for one of the four kinds, and that kind has reach data. G2 tried only a skill, and no test calls reach for a server.
Suggested action: The smallest fix is copy. Point both strings at the `id` find_assets returns, which equals `path` for skills, rules and subagents. That goes through a naming-brief line for Karthik. Add one tool test that calls reach for a server with exactly what find_assets returned.
```

```
File: src-tauri/src/mcp_server/strings.rs:21, :49; docs/mcp-server.md:18
Lens: Verification
Guideline: Ruling Q9: the sentence "Antigravity's MCP servers are not read" stays until T22 lands, and whichever branch merges second removes it. ui-copy.md: copy must be true at the commit that ships it.
Why: `main` (`fb189ac`) now reads `.gemini/config/mcp_config.json` for host `antigravity` (`registry.rs:107`, `:185`), so this branch merges second. Merged as it stands, it ships the sentence as false in LIST_ENGINES, INSTRUCTIONS and the setup page. The author already lists this under "Still open" in the G2 doc. Recorded intent is not executed work (verification.md).
Suggested action: Before merging, rebase onto or merge `main`, remove the sentence in all three places, re-run the protocol tests that pin the strings, and re-check what list_engines says about Gemini CLI and Antigravity CLI now that they are two engines.
```

```
File: docs/mcp-server.md:54
Lens: Verification
Guideline: Copy must be literally true; the evidence is G2 Step 3.
Why: The page still says "Not yet run" for the Claude Code line. G2 Step 3 ran it as written (exit 0, `claude mcp get hanger` reported "Connected", Claude Code 2.1.332).
Suggested action: Replace "Not yet run" with the run date and version from G2. The Codex and JSON lines stay marked as not run.
```

```
File: src-tauri/src/mcp_server/tools.rs:39-51 (Refusal::code), src-tauri/src/store_read.rs:38-47 (StoreUnavailable::code)
Lens: Simplicity
Guideline: No code with zero callers.
Why: Nothing in src/ or tests/ calls either `code()` (grep). The `lib.rs` `.code()` calls belong to the switch failures. `serde(rename_all = "snake_case")` already gives the same spelling. The plan's interface asked for these methods, which explains them but does not give them a caller.
Suggested action: Delete both, or leave them and accept them as phase 2 scaffolding in writing.
```

```
File: src-tauri/src/mcp_server/places.rs:22-27 (ServerPlaces.home, .skills)
Lens: Simplicity
Guideline: Nothing speculative.
Why: No phase 1 tool reads `home` or `skills`. Only `mcp_server_tests.rs` does. They are there for phase 2.
Suggested action: None needed now, because the plan names the struct. Phase 2 either uses them or drops them.
```

```
File: src-tauri/src/mcp_server/tools.rs:308-311
Lens: Simplicity
Guideline: Minimum code that solves the problem.
Why: `findings` loads every asset row in every scope, about 1,200 on this machine, into a HashMap. It does this only to name the broken and drifted global annotations, and G2 found 0 of them. `abs_path` is also not unique across rows, so the map keeps whichever row came last.
Suggested action: Fetch names only for the annotation paths that matched, or restrict the query to `engine_global` roots, as `asset_annotations_on` does.
```

Settled findings, checked again:

- I1, I2, M1, M4, M5 and M6 (limit bounds) held. `TOOLS` is one table that the schema, `fits` and the dispatch all read.
- M-a (a limit of 1 or 50 accepted, and `limit` sent to a tool that takes none) is now pinned by `a_limit_of_1_and_of_50_is_accepted_and_0_and_51_are_refused` and `a_limit_sent_to_a_tool_that_takes_none_gets_that_tools_line`.
- M-c (temp folders left behind) is pinned by `a_session_leaves_no_temp_folder_behind`.
- M2 and M3 remain parked by ruling 34.
- M4's corrected docs sentence is true for `name` fields and false for keys (finding 1).

## Surgical lens

- Every hunk traces to Tasks 1 to 7.
- The `annotations.rs` reorder hoists the asset query and replaces the per-asset link query with one batched `stored_links`. Decision 12 requires this: the old per-asset query ran between file reads.
- The changes to `lib.rs` (places), `search.rs`, `scanner.rs` and `preferences.rs` are the `_on` splits and constructors the plan names.
- The README changes are the tests figure (48 to 52) and one Quick start link. The section set is unchanged.
- I found no reformatting, no out-of-scope refactor, and no orphan the diff created.

## Read-only, no window, no secrets

- No window. `main.rs` branches to `run_from_args` before `tauri_app_lib::run()`, and no path from `mcp` reaches Tauri.
- The store. `open_read_only` uses `SQLITE_OPEN_READ_ONLY` and checks `exists()` first, so it never creates a store. `a_read_only_store_refuses_a_write` and `a_missing_store_…` pass.
- Engine configs. Every config read goes through `discover_machine_at`, `claude_stashed`, `StateFile::read` or `fs::read_to_string`. No tool calls `measure_for` or `claude_cli_for`.
- Secrets. The boundary test is live and its markers are present. It does not cover two things:
  - Finding 1, a channel for untrusted names.
  - `find_assets` matching on a server's redacted `launch_display`, which `search.rs:146-151` indexes as body text. A query can confirm that a launch line contains a word, though the text never leaves. The fixture indexes no server body, so this path is untested. It is an oracle, not a leak, and is noted rather than counted as a finding.

## Human gate

G2 was executed by the agent on Karthik's word (round 38). verification.md: "only Karthik may declare an iteration closed." The G2 document records the results, but the conversation holds no acceptance from Karthik. Merging waits for it.

| # | Finding | Lens | Blocks push? |
|---|---|---|---|
| 1 | Server name leaves raw and uncapped inside `key` / `id` | Verification | Yes |
| 2 | `reach` copy points at find_assets' `path`, which is not_found for servers | Verification | Yes |
| 3 | "Antigravity's MCP servers are not read" is false once merged with `main` | Verification | Yes (before merge) |
| 4 | Setup page says the Claude Code line was "Not yet run" | Verification | No |
| 5 | `Refusal::code` / `StoreUnavailable::code` have no caller | Simplicity | No |
| 6 | `ServerPlaces.home` / `.skills` unused in phase 1 | Simplicity | No |
| 7 | `findings` loads every asset row to name a few | Simplicity | No |

**Verdict: Trim first.** Fix 1, 2 and 3, in that order. Findings 2 and 3 change signed-off strings, so they go to Karthik first.
