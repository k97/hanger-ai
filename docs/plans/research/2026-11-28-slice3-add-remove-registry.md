# Slice 3: add and remove MCP servers, add from the official Registry (pinned), and secret and unpinned findings

Researched 2026-11-28. No code changed. Vendor CLIs ran with a throwaway `HOME` and `--help` only.

## 1. What it is and why

Hanger can switch a server off and on. It cannot yet put a server into an engine's config or take one out. Slice 3 adds that: a form to add one by hand, a Registry search that adds one at an exact version, a Remove, and two Needs review findings: "a secret sits in the file as plaintext" and "this server runs whatever the package's latest version is". The point is that adding a server is also the moment a secret or an unpinned package gets written, so the check and the write should share one detector.

## 2. What exists today

- **Safe write.** `mcp::switch::apply` → `safe_replace` (refuses a file changed since read, keeps a copy plus receipt, temp file and rename, reads back, restores on failure), `undo(receipt_id)`, `latest_receipts`. `KEPT_PER_FILE = 20`. The module takes any path and backups folder. Reusable for add and remove unchanged.
- **Edit layer.** `mcp::switch::edit` is pure text-in, text-out, comment-preserving (`jsonc-parser` cst, `toml_edit`). It has only `set_enabled`. Add and remove entry functions are new, per `Dialect`.
- **Claude Code.** `switch::vendor` already runs `claude mcp remove` and `claude mcp add-json` (entry on stdin), with a scratch-folder pre-flight because `add-json` silently drops unknown keys (engine matrix, 2026-11-24). It keeps a stash and never writes `~/.claude.json`. Add and remove for Claude Code are the same two commands.
- **Gating tables.** `registry.rs` → `SWITCHES` (4 rows) says where a flag is confirmed. `HOSTS` has 17 `McpHost` entries, and `Dialect` has 9 variants (one is `Unsupported`, one `ClaudeAiConnectors`). Add and remove need their own confirmed-per-engine table, by the same rule ("a row is added only with the engine's own listing as evidence").
- **No env values in memory.** `dialect.rs` keeps env names only; `docs/scanning.md` §7 forbids values in structs, logs and the store. `McpServer.env_keys` is names. Headers are not read at all (grep `header` in `dialect.rs` finds nothing but TOML error text).
- **Findings today.** `src/utils/reviewIssues.ts`: `IssueKind = "broken" | "drifted" | "duplicate" | "parse"`, category `"Tools"` included, derived on the frontend from the inventory. Hanger's own server `findings` (`mcp_server/tools.rs`) is a different, narrower list (broken and drifted global links, unparsed files) with `Finding { category, name, path }`.
- **Rulings.** `hanger-tool-manager-direction.md` (2026-11-24): config writes ported to Rust on the dialect layer for all hosts; vendor CLI for vendor-owned mechanisms (`claude mcp`); port mcpick's adapters, behaviours and tests; keep its copyright notice (`switch/mod.rs` already carries it); atomic write plus timestamped copy plus one Undo per write; never auto-probe. Context-control plan, Out of scope for slice 1: add/remove deferred to slice 3. `2026-11-27-hanger-mcp-server.md` Answer 8 / Decision 10: new deterministic findings left to their own plan; Decision 8: Hanger's own server is not registered by Hanger until this slice exists.

## 3. Outside facts

**mcpick (MIT, read 2026-11-28).**

| Concern | mcpick | Ports to Rust? |
|---|---|---|
| Registry client | `core/registry-api.ts` → `search_registry`, `find_registry_server` (`/v0/servers?search=`, 10 s timeout, drops `isLatest === false`) | Yes, plus change to `/v0.1` and `version=latest` |
| Registry to config | `core/registry-install.ts` → `registry_install_config`: accepts only `npm` + `stdio`, requires `pkg.version`, builds `npx -y pkg@version`, rejects unresolved required runtime args; 4 tests | Logic yes; scope is too narrow (see below) |
| Secrets | `utils/secrets.ts`: `scan_secret_values`, `detect_secret_patterns` (8 value patterns, key-name rule `TOKEN|SECRET|PASSWORD|API[-_]?KEY`, placeholder skip), `resolve_from_env`, `collect_config_warnings`; 26 tests | Yes, directly (regex crate). `resolve_from_env` does not port: see section 6 |
| Unpinned | `detect_unpinned_package`: flags `@latest`, or `-y`/`--yes` followed by a name with no `@version` | Yes, but it is weak: misses `npx pkg` without `-y`, `uvx`, `pnpm dlx`, `bunx` |
| Doctor | `core/doctor.ts` → `run_doctor`: 8 checks (`config-parse`, `schema-shape`, `command-missing`, `duplicate-server`, `plaintext-secret`, `unpinned-server`, `skill-drift`, `unpinned-skill`); 17 tests | Only the last two server checks matter here. Hanger's scanner already covers parse and duplicates |
| Add/remove | `core/client-config.ts` → `add_client_server`, `remove_client_server`; `cli/commands/add.ts`, `remove.ts`; Claude via `utils/claude-cli.ts` (`add_mcp_via_cli`, `remove_mcp_via_cli`) | Adapter shapes port; its "registry" in `core/registry.ts` is mcpick's own saved list, not the MCP Registry, and has no Hanger equivalent |
| Safe write | `utils/safe-apply.ts` | Already ported (`apply.rs`) |

**Official MCP Registry (read 2026-11-28; `gh api` on `modelcontextprotocol/registry`, live `curl`).**
- Base `https://registry.modelcontextprotocol.io`. `GET /v0.1/servers?search=&limit=&version=latest`, `GET /v0.1/servers/{url-encoded-name}/versions/latest|{exact}`, cursor paging by `metadata.nextCursor`. `/v0` still answers and returns older `$schema` entries; `docs/reference/api/CHANGELOG.md` says changes apply to "both `/v0` and `/v0.1`".
- Stability: third-party reports (Atlan, a Go package doc) say the REST API froze at v0.1 on 2025-10-24. The registry's own docs I read do not say "frozen"; the latest registry release is v1.8.17 (2026-11-27) and its changelog lists an "Unreleased" breaking change (a remote URL may be shared across server names), so a client must key by name plus version, never URL. Treat it as stable-with-additive-change, not a contract.
- Pinning: each record is one server version (`server.version`) and each package carries its own exact `version`. Docs: listings are ordered by version as text, so "first result is latest" is wrong; use `version=latest` or `isLatest`. Deprecated versions can still be `isLatest`, so check `_meta["io.modelcontextprotocol.registry/official"].status == "active"`. Since the last changelog, npm dist-tags (`next`, `beta`) are refused as a package version, `latest` and ranges were already refused, and the registry checks npm/PyPI/NuGet/Cargo packages against OSV malware records on publish (report mode by default).
- Shape of a package: `registryType` (`npm`, `pypi`, `oci`, …), `identifier`, `version`, optional `runtimeHint`, `transport.type`, `runtimeArguments`, `environmentVariables[{name, isRequired, isSecret, default}]`. Remote servers use `remotes[{type: streamable-http|sse, url, headers}]`.
- One page of 100 live records (existence proof, not a proportion): 97 `streamable-http` remotes, 1 `sse`, 6 npm and 1 pypi packages; none of the 7 had a `runtimeHint`. So the command must be derived from `registryType` (npm to `npx`, pypi to `uvx`), and mcpick's npm-stdio-only rule would reject most of what a search returns.

**Each engine's add and remove (`--help`, 2026-11-28; versions claude 2.1.332, codex-cli 0.172.0, gemini 0.56.0, agy 1.5.18, opencode v2.4.2).**

| Engine | CLI add / remove | Trap for a GUI |
|---|---|---|
| Claude Code | `claude mcp add [-s local\|user\|project] [-e K=V] [-H] -- cmd…`; `add-json`; `remove [-s]` | Default scope is `local` (per-project in `~/.claude.json`). `-e K=V` takes the value, so it sits in argv. `add-json` on stdin avoids that |
| Codex | `codex mcp add NAME [--env K=V] [--bearer-token-env-var VAR] (--url \| -- cmd)`; `remove` | Flags include `--oauth-*` and "the immediate login", so a URL add may start an OAuth login (not run) |
| Gemini CLI | `gemini mcp add [-s user\|project] …`; `remove [-s]` | Default scope is `project`, i.e. the process's cwd, which a GUI app does not have |
| Antigravity | `agy mcp add [--env] [--header] [-t]`; `remove` | No scope flag; flags must precede the name; "add or update" overwrites a same-name server |
| OpenCode | `opencode mcp add [--url] [--env] [--header] [--global]`; no `remove` in its listed subcommands (list, add, auth, logout) | Remove has no CLI |

The other hosts (Cursor, VS Code, Windsurf, Zed, Kiro, Amp, Roo and the rest of `HOSTS`) have no CLI worth driving; they are file edits.

**Secret slots without holding the secret (docs read 2026-11-28).**
- Claude Code expands `${VAR}` and `${VAR:-default}` in `command`, `args`, `env`, `url`, `headers` (code.claude.com/docs/en/mcp). An unset variable keeps the literal text and warns in `claude mcp list`.
- Codex stores names, not values, in `env_vars`, `bearer_token_env_var` and the values of `env_http_headers`; `env` and `http_headers` hold literals (learn.chatgpt.com/docs/extend/mcp).
- Gemini CLI expands `$VAR` and `${VAR}` in the `env` block; the page does not say for `headers` (geminicli.com/docs/tools/mcp-server).
- Cursor, VS Code, Windsurf, Zed, Kiro, OpenCode, Amp: not checked. Each needs its own check before the form offers "use a variable".
- Keychain: no engine reads it natively. Reaching it needs a launcher that fetches the secret and execs the server. That launcher runs at engine start, so Hanger would have to ship one (the gateway's job, slice 6). Not found as an existing engine feature.

## 4. Options

**A. Vendor CLI for every engine that has one.** Least dialect code. Cost: cwd-dependent defaults (Gemini, Claude `local`), side effects (Codex login), no Undo receipt (a CLI write is not a file Hanger read), values on argv, OpenCode and 12 other hosts uncovered anyway. Rejected: it breaks the ruled write-safety promise.

**B. Hanger's dialect writes for every file host; Claude Code through `vendor` only.** Matches the 2026-11-24 ruling. Add and remove become `edit::add_server` / `edit::remove_server` per `Dialect`, behind `safe_replace`, with the same receipt, backup and Undo as a switch. Claude Code reuses `vendor`'s `add-json`/`remove` and stash. Cost: one new function pair per dialect (7 real ones), and a confirmed-per-engine table beside `SWITCHES` with each engine's own `mcp list` as proof. Tradeoff: the biggest build, but the only one where every write has a receipt.

**C. B, shipped in stages by engine.** Stage 1: Claude Code, Codex, Gemini, Antigravity (the four already in `SWITCHES`, each already verified with its own `mcp list`). Registry add and secret findings land with stage 1. Remaining hosts follow as each is verified.

**Pick: C.** It reuses the proven four, keeps every write behind `safe_replace`, and avoids shipping unverified writes to the other 13 hosts. The Registry add is a *source* of an entry, not a new write path.

**Registry add rules (my design, for the plan):** `/v0.1` with `version=latest`, filter `status == active`; pin to the package's `version`, refuse anything that is not an exact version; map `npm` to `npx -y pkg@ver`, `pypi` to `uvx pkg==ver`, `remotes` to a URL entry, and say plainly when a package type (`oci`, others) is not supported rather than guessing. Show the trust signals mcpick shows (repo URL, published date, status).

## 5. Shared machinery

- `mcp::switch::{apply, edit, vendor, ops}` and `registry.rs` → `SWITCHES`: all touched. `ops` today accepts only a server discovery just found; add needs a second rule ("a path the engine's host table names") because the server does not exist yet. That is the one real design question for the write boundary.
- `dialect.rs` and `docs/scanning.md` §7: plaintext-secret detection needs the values `dialect` drops. Do not weaken §7. Run the detector at the parse boundary and keep only `{key, pattern-name}` (mcpick's own rule: pattern names only). This is a small, deliberate edit to an invariant, so it must be reported as such.
- Needs review: `reviewIssues.ts` `IssueKind` gains kinds (or one `"config"` kind with a `check` field); `annotations.rs` does not hold MCP findings today. Counts must come from the backend (`no-frontend-counting.test.ts`), so the detector's results should be backend-computed and returned with the inventory.
- Store: no migration needed if the verdict is derived at read time like link state. A persisted flag would be a `user_version` bump; I recommend against it.
- `mcp_server`: its `findings` tool would gain these only if Karthik wants them there (they carry server names and key names, never values).
- Shared-asset rule: the engine's config directory also owns skills, rules and subagents. Slice 3 writes only MCP files, and the plan must show unchanged per-kind counts from the store before and after.
- Collisions: **Slice 2** (per-project overrides use the same dialect writes and project-scope rules in `ops`); **Slice 4** (profiles are sets of add/remove/switch writes over these receipts); **MCP phase 2** (Hanger's own-server registration and `findings` tool); **Slice 6** (the Keychain launcher). Not Slice 5 or T19.

## 6. Depends on / unblocks

Depends on nothing unbuilt: `apply`, `edit`, `vendor` and `ops` exist. Better after Slice 2's decision on project-scope writes, so add does not invent a second rule. Unblocks Slice 4 (profiles need add), MCP phase 2 (one-click "add Hanger's server"), and the Q6 install step in `docs/mcp-server.md`.

Secret flow, as designed: the form never asks for a value. It asks for a variable name and writes the reference in that engine's own spelling (`${VAR}` for Claude Code; `env_vars` / `bearer_token_env_var` for Codex; `$VAR` for Gemini). A Registry variable with `isSecret: true` defaults to "reference a variable". The user sets the variable in their shell. mcpick's `--from-env` copies the value into the file, so it must not be ported. Caveat: an engine launched from Finder does not see shell variables, which Hanger cannot fix. Say so on the form. A literal value is allowed only after a warning, and Hanger then flags the file.

**Should this slice own the findings (Q8)?** The two MCP findings, yes: the write-time warning and the scan-time finding are one detector, and splitting them would build it twice. The other Q8 items (hash change, `curl | sh` in SKILL.md) are skill and file findings and belong to a separate findings plan.

Unpinned detection needs more than mcpick: add `uvx` (no `==`), `npx` without `-y`, `pnpm dlx`, `bunx`, and `pkg@latest`. Verify against `command` forms the scanner already reads (`npx`, `uvx` as first token).

## 7. Questions only Karthik can answer

1. **Which engines in the first cut?** (a) the four already switchable, (b) all file hosts at once, (c) Claude Code only. Pick (a).
2. **May the scanner see env and header values, to flag them?** (a) yes at the parse boundary, keeping only the pattern name, §7 amended in the same commit; (b) no, and the finding is only "a secret-looking key name is set to something that is not a `${VAR}` reference", which needs no values but is weaker. Pick (a): same rule as mcpick, and the verdict never leaves the parse step.
3. **Does Hanger ship a Keychain launcher?** (a) no, env references only for now; (b) yes, as part of the gateway. Pick (a); Slice 6 decides (b).
4. **Is a literal secret allowed in the form?** (a) refused, only references; (b) allowed after a warning. Pick (b): refusing strands engines that cannot expand variables, and the finding then names the file.

## 8. Size

About 11 tasks: (1) per-dialect add and remove in `edit`, red/green per dialect; (2) the add-boundary rule in `ops`; (3) Claude Code add/remove through `vendor`; (4) the Registry client and entry mapping; (5) secret detector at parse; (6) unpinned detector; (7) backend findings and the Needs review kinds; (8) per-engine confirmation table with live proof; (9) form UI; (10) Registry search UI; (11) per-kind counts before and after.

Human gates: a naming brief for the add/remove labels (`ui-copy.md`); layout options for the form and Registry results; `/humanizer` pass on every string; live proof per engine in the real app (a throwaway project, never a real config); Karthik's ruling on question 2 before task 5.
