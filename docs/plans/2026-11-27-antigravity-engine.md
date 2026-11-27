# Antigravity CLI as its own engine: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the "Gemini / Antigravity" engine into Gemini CLI and Antigravity CLI, so Antigravity's servers, skills and subagents are read from where `agy` reads them and each engine gets its own switch.

**Architecture:** One new `AGENT_CONFIGS` row (`antigravity`, global root `.gemini/config`), one new `HOSTS` row with one `SOURCES` row (`~/.gemini/config/mcp_config.json`, `McpServers`), and one `SWITCHES` row of the existing `SwitchKind::DisabledKey`. Ownership splits by longest root: `engine_for_path` already prefers `.gemini/config` (depth 2) over `.gemini` (depth 1). The `gemini` id and engine key stay, so no store migration.

**Tech Stack:** Rust (Tauri 2, rusqlite), React 19 + TypeScript, Vitest, `@lobehub/icons-static-svg@1.94.0`.

**Spec:** `docs/TODO.md` → T22; Karthik's ruling, Rulings item 4 of `docs/plans/2026-11-27-harness-model-layer-research.md` ("split into two engines with separate switches"); method from `docs/plans/2026-11-24-context-control-engine-matrix.md`.

## Global Constraints

- The engine ids stay `gemini` (Gemini CLI) and become `antigravity` (new). `engines.key` for the new engine is `antigravity`.
- Labels are not final until Task 0's naming brief is signed off (`.claude/rules/ui-copy.md`). This plan writes `Gemini CLI` and `Antigravity CLI` as placeholders for Q1.
- Every user-facing string goes through `/humanizer` before it lands.
- A `SWITCHES` row needs the engine's own `mcp list` as evidence (`mcp/registry.rs` → `SWITCHES` doc comment). The evidence below meets that bar for Global only.
- Never write to the real `~/.gemini`. Every engine probe runs with `HOME` pointed at a throwaway directory.
- Gates, from the repo root unless stated: `npx vitest run`; `cargo test` from `src-tauri/`; `bunx tsc --noEmit`; `gitleaks detect --source .` and `gitleaks detect --source . --no-git -c .gitleaks.toml`.
- This is a worktree on `fix/antigravity-source`. Commit with explicit paths (disjoint work, `shared-checkout.md`), never `-a`. A commit command must not contain `-n` anywhere (the commit hook reads it as `--no-verify`), so commit in its own Bash call.

## Evidence

Each fact says how it was established. "Verified" means a command was run or a file was read on 2026-11-27; "inferred" means it was not.

### What `agy` 1.5.18 reads

1. **MCP, global: `~/.gemini/config/mcp_config.json`, `{"mcpServers": {...}}`.** Verified. Vendor docs: "`~/.gemini/config/mcp_config.json`, which applies to all your projects" ([Antigravity MCP](https://antigravity.google/docs/mcp)). Measured with a throwaway home (`$S`), transcript below: `agy mcp list` lists the servers in that file and nothing else.
2. **`agy` does not read `~/.gemini/antigravity/mcp_config.json`, `~/.gemini/settings.json` or `~/.gemini/mcp-server-enablement.json`.** Verified by the same transcript: `legacy` and `gemini-only` are absent from the list, and `alpha` lists `enabled` although the enablement file says `{"alpha":{"enabled":false}}`. So Hanger's current Gemini switch does nothing for Antigravity.
3. **Gemini CLI 0.56.0 does not read `~/.gemini/config/mcp_config.json`.** Verified: `HOME=$S gemini mcp list` on the same home listed only `gemini-only`. The two engines' MCP files are disjoint.
4. **MCP, workspace: `<workspace>/.agents/mcp_config.json`.** Vendor docs only. Not verified: `agy mcp list` run from a directory holding `.agents/mcp_config.json` did not list its server, so `mcp list` may show the global file only.
5. **`~/.gemini/antigravity/` and `~/.gemini/antigravity-cli/` hold state, not config.** Their `mcp/<server>/` folders are per-tool JSON schema caches ("Cached tool schemas: `~/.gemini/antigravity/mcp/<serverName>/` for the App and IDE, or `~/.gemini/antigravity-cli/mcp/<serverName>/` for the CLI", same page). Listing on this machine: `browse`, `claude-mem`, `cua`, each holding `*.json` per tool and `instructions.md`. Verified.
6. **Skills.** Vendor docs ([Antigravity skills](https://antigravity.google/docs/skills)), CLI: workspace `.agents/skills/` (and each parent up to the repo root), global `~/.gemini/config/skills/`, plugins `~/.gemini/config/plugins/<plugin>/skills/`, and CLI-only `~/.gemini/antigravity-cli/skills/` and `~/.gemini/skills/`. Not measured against `agy`.
7. **Rules.** Vendor docs ([Antigravity rules](https://antigravity.google/docs/rules)), global: `~/.gemini/AGENTS.md`, `~/.gemini/GEMINI.md`, `~/.gemini/config/AGENTS.md`, `~/.gemini/config/GEMINI.md`, `~/.gemini/config/rules/*.md`; workspace: `AGENTS.md`, `GEMINI.md`, `.agents/AGENTS.md`, `.agents/GEMINI.md`, `.agents/rules/*.md`. Not measured.
8. **Subagents.** Vendor docs ([Antigravity subagents](https://antigravity.google/docs/subagents/)): global `~/.gemini/config/agents/<name>.md` or `<name>/agent.md`, workspace `.agents/agents/`, plugins `plugins/<plugin>/agents/`. Not measured.
9. **`agy` creates `~/.gemini/config` on first run.** Verified: an empty throwaway home held `.gemini/config` after `agy mcp list`. So on an Antigravity-only machine `~/.gemini` exists, which is Gemini CLI's detection root (see Q4).
10. **`gemini mcp list` does not create `~/.gemini/config`.** Verified for that one read-only command (transcript below). It creates `~/.gemini/history/`, `~/.gemini/projects.json` and `~/.gemini/tmp/`. A first interactive `gemini` run was not measured.
11. **`agy` reads `~/.agents/skills`: from the vendor's own changelog, not measured.** `HOME=$S agy changelog` (shipped in the 1.5.18 binary) has under `1.5.16:` "Added discovery of user-global skills in `~/.agents/skills`, so cross-tool Agent Skills appear in `/skills`, `/` autocomplete, and agent turns, with skills in `~/.gemini` taking precedence on name collisions." I could not measure it read-only. `agy` has no skill-listing subcommand (`agy --help` lists `acp agent agents changelog help install mcp mic-serve models plugin remote-control update`); `/skills` needs an interactive, signed-in session. `agy agents` lists only `~/.gemini/config/agents`. In a throwaway home with agents at `~/.gemini/config/agents/cfg.md`, `~/.agents/agents/h.md` and `<git repo>/.agents/agents/w.md`, run from the repo, it printed `cfg-agent` alone. So it cannot show either the home `.agents` or the workspace scope. This is Q2.

On this machine (names only, verified): `~/.gemini/config/` holds `config.json`, `hooks.json`, `mcp_config.json` (servers `claude-mem`, `cua`, `cua-driver`, `browse`), `node_modules/`, `plugins/` (7), `projects/`, `sidecars/`, `skills/` (58 symlinks into `~/.agents/skills`, 11 real directories with a `SKILL.md`), and no `agents/`, `rules/`, `GEMINI.md` or `AGENTS.md`. Nothing in this plan walks `node_modules/` or `sidecars/`. `~/.gemini/settings.json` declares `tauri`, `skill-retrieval`, `cua`, `cua-driver`, `browse`. `~/.gemini/skills` is a symlink to `~/.agents/skills`. Both `gemini` (0.56.0, `~/.bun/bin/gemini`) and `agy` (1.5.18, `~/.local/bin/agy`) are installed.

### How `agy` switches a server

Verified, `agy` 1.5.18, every file under a throwaway `$S`:

```
$ cat $S/.gemini/config/mcp_config.json
{"mcpServers":{"alpha":{"command":"/usr/bin/true"},"beta":{"command":"/usr/bin/true","disabled":true},"gamma":{"command":"/usr/bin/true","enabled":false}}}
$ cat $S/.gemini/antigravity/mcp_config.json
{"mcpServers":{"legacy":{"command":"/usr/bin/true"}}}
$ cat $S/.gemini/settings.json
{"mcpServers":{"gemini-only":{"command":"/usr/bin/true"}}}
$ cat $S/.gemini/mcp-server-enablement.json
{"alpha":{"enabled":false}}
$ HOME=$S agy mcp list
NAME   TYPE   STATUS    COMMAND/URL
alpha  stdio  enabled   /usr/bin/true
beta   stdio  disabled  /usr/bin/true
gamma  stdio  enabled   /usr/bin/true
exit=0
$ HOME=$S agy mcp disable alpha
Disabled MCP server "alpha"
exit=0
$ cat $S/.gemini/config/mcp_config.json
{ ... "alpha": { "command": "/usr/bin/true", "disabled": true }, ... }
$ HOME=$S agy mcp enable alpha
Enabled MCP server "alpha"
exit=0
$ cat $S/.gemini/config/mcp_config.json
{ ... "alpha": { "command": "/usr/bin/true" }, ... }
$ HOME=$S gemini mcp list
Warning: MCP servers are configured but disabled because this folder is untrusted.
...
○ gemini-only: /usr/bin/true  (stdio) - Disabled
exit=0
```

(The two `cat` outputs after `disable`/`enable` are abridged: `agy` re-pretty-prints the whole file; `beta` and `gamma` came back unchanged.)

A second throwaway home, for the values Hanger itself writes and for a stub entry:

```
$ cat $S/.gemini/config/mcp_config.json
{"mcpServers":{"off":{"command":"/usr/bin/true","disabled":true},"on-false":{"command":"/usr/bin/true","disabled":false},"absent":{"command":"/usr/bin/true"},"str":{"command":"/usr/bin/true","disabled":"true"},"ghost":{"disabled":true}}}
$ HOME=$S agy mcp list
NAME      TYPE   STATUS    COMMAND/URL
absent    stdio  enabled   /usr/bin/true
ghost     stdio  disabled  
off       stdio  disabled  /usr/bin/true
on-false  stdio  enabled   /usr/bin/true
exit=0
```

Gemini CLI on an empty home, listing every file before and after:

```
$ find $S | sort  # before
.
$ HOME=$S gemini mcp list
No MCP servers configured.
exit=0
$ find $S | sort  # after
.
./.gemini
./.gemini/history
./.gemini/history/probe-gemini-empty
./.gemini/history/probe-gemini-empty/.project_root
./.gemini/projects.json
./.gemini/tmp
./.gemini/tmp/probe-gemini-empty
./.gemini/tmp/probe-gemini-empty/.project_root
```

What this establishes:

- `"disabled": true` in the server's entry is honoured by `agy mcp list` (`beta`). This is `SwitchKind::DisabledKey`, already implemented in `mcp/switch/edit.rs` and used by no `SWITCHES` row today.
- `"enabled": false` is ignored (`gamma` lists `enabled`). `edit.rs` currently reads and writes `enabled` for a `DisabledKey` entry that already carries it (`reading`: `SwitchKind::DisabledKey => disabled.or(enabled)`; `change`: `if kind == SwitchKind::EnabledKey || flags.enabled != Held::Absent`). For `agy` that is wrong in both directions (Q6).
- `"disabled": false` lists as `enabled` (`on-false`). Hanger's DisabledKey "on" for an entry that had no key writes exactly that (`edit.rs` module doc: "Off-then-on of an entry that had no key leaves an explicit ... `disabled = false` behind"), so Hanger's round trip leaves `agy` with the server on.
- An entry whose `disabled` is not a boolean (`"disabled": "true"`) is dropped from the list altogether (`str` is absent). Hanger reads such a flag as `Held::Other` and refuses to switch it (`FLAG_IS_NOT_A_BOOLEAN`), and context reports `FileUnparseable`; Hanger will still list the server as on while `agy` hides it.
- `agy mcp disable <name>` exits 0 for a name the file does not declare and writes a stub `{"disabled": true}` entry, which lists as `disabled` with an empty command (`ghost`). Hanger never needs the command, but it may meet the stub in a user's file.
- Not established: that a running `agy` session (not `mcp list`) skips a disabled server. That is Karthik's check in Task 5.

### Where the brief and the code disagree

- **T22 names the wrong file.** It says `agy` "keeps its MCP servers in `~/.gemini/antigravity/mcp_config.json`". That file exists (Jul 22, one server) but `agy` 1.5.18 does not read it (fact 2). `~/.gemini/config/mcp_config.json.cua-backup-20261003T144429Z` is the same 211 bytes, which suggests the config file was migrated from it (inferred). The research doc's path (`~/.gemini/config/mcp_config.json`) is the right one.
- **The scanner already files two Antigravity files under Gemini.** `scanner.rs`, the `if agent.id == "gemini"` block in "4. Global Subagents", scans `~/.gemini/config/agents` and `~/.gemini/config/plugins/*/agents`. The store holds two such rows under `gemini` (`flutter/agents/a11y_agent.md`, `firebase/agents/firestore-rules-author.md`).
- **`brands.ts` already maps `antigravity` to the Gemini mark** (`ALIASES.antigravity: "gemini"`), so `brand-coverage.test.ts` would pass with no Antigravity mark at all. The guard cannot force a distinct mark; Task 3 does it by hand, pending Q7.

## Blast radius, per kind

The new root `~/.gemini/config` sits inside Gemini's `~/.gemini`. What each kind does with the shared code:

- **MCP servers.** The global sweep (`scanner.rs`, `is_swept_mcp_config`, which matches `mcp_config.json`) reads the direct children of each engine's first present root. Gemini's sweep reads `~/.gemini/*` and does not descend into `config/`, so it does not double-read. Antigravity's sweep will read `~/.gemini/config/mcp_config.json`, and so will the new `SOURCES` row; both feed `seen_registrations` keyed on `(config_path, server_name)`, and the sweep runs first. So `agent_id_static` must map `antigravity` to `antigravity`, or the surviving row carries host id `""` and no switch. Gemini's five registrations in `~/.gemini/settings.json` are untouched.
- **Skills.** The global walk is `g_path_buf.join("skills")`, hardcoded, with `follow_links` off. Antigravity's walk reaches `~/.gemini/config/skills`: the 11 real directories become new Antigravity rows; the 58 symlinked directories are not descended, so no store row is touched. If a future change turned `follow_links` on, those 58 would canonicalise into `~/.agents/skills/*` with `skills_shared` false and `upsert_asset_on` would move 58 store rows to Antigravity ("A move between two known engines is now taken at face value", and `(None, Some)` takes the incoming engine). Task 1 pins this with a test. Gemini's `~/.gemini/skills` walk is unchanged.
- **Rules.** Direct children of the root matching `RULE_FILENAMES`. `~/.gemini/GEMINI.md` stays Gemini's. `~/.gemini/config/{GEMINI,AGENTS}.md` would become Antigravity's; none exist here. `~/.gemini/config/rules/*.md` is not walked by any code (the `rules` field is metadata), so it stays unread, same as today.
- **Subagents.** `~/.gemini/config/agents` and the plugin `agents/` folders move from the `gemini` block to Antigravity. The two stored rows re-parent on the next scan through `upsert_asset_on`'s known-engine move; the count does not change. `subagent_owner_for_path` gains a participant (`.gemini/config/agents`); its first-match-wins comment lists the participants and must name the new one.
- **Reach.** `engine_reach` (`annotations.rs`): an asset in an engine's own root is reached by that engine only. So Antigravity will read as not reaching `~/.gemini/GEMINI.md` and `~/.gemini/skills`, which the vendor docs say it reads (Q8). Store assets: `reads_agents_dir` decides whether Antigravity reaches every shared-store asset without a link (`engine_reach`, the `in_shared_store && reads_shared_dir` arm), which is several hundred rows here (563 global skills, most on the `~/.agents` root). The workspace `.agents/` is documented (facts 4, 6, 7, 8) and `~/.agents/skills` comes from the changelog only (fact 11). Q2 decides it; Task 1 writes whichever value Q2 rules.
- **Counts.** `count_assets` groups by root `abs_path` equality, not prefix, so nested roots do not double-count. `engine_map` is keyed by display name, so the rename moves Gemini's figures to the new label.
- **Deploy.** `resolve_target_path` uses `project_roots.first()`. Antigravity owns no project directory (its workspace is the shared `.agents/`), so deploying one of its 11 skills to a repo refuses with "Antigravity CLI declares no project directory to deploy into". Today the same skill resolves to Gemini and deploys to `<repo>/.gemini/<name>`, a place neither engine reads. The refusal is the honest change; noted, not fixed.
- **Skill switch.** `skill_switch::links::link_places` step 1 now yields `~/.gemini/config/skills` from the new row; `EXTRA_LINK_PLACES` also lists it and `link_places` dedupes. Left as is.
- **Not touched.** `mcp/observe.rs` `host_for_process_name` (no `agy` match; the process name is unmeasured), Antigravity plugin skills, rules and `mcp_config.json` under `~/.gemini/config/plugins/`, `~/.gemini/antigravity-cli/skills/`, and the workspace `.agents/mcp_config.json` source. Each goes to `docs/roadmap.md` in Task 4.

### The store needs no migration

Read-only queries against `~/Library/Application Support/com.rkarthik.hanger/hanger.db`, `user_version` 8:

- `engines`: `3|gemini|Gemini / Antigravity|/Users/karthik/.gemini|agent`. `upsert_engine_on` updates `display_name` on conflict, so the rename lands on the next scan.
- `roots`: one Gemini root, `4|engine_global|/Users/karthik/.gemini`. No row at `/Users/karthik/.gemini/config` today.
- Assets under `gemini`: rule 1 (`~/.gemini/GEMINI.md`), subagent 2 (the plugin agents above), tool 5 (`~/.gemini/settings.json`). Skills 0.
- `preferences`: no key or value contains `gemini`. `selected_engine` holds an engine key; `gemini` stays a valid key, and an unknown one falls back to All engines (`App.tsx`).
- `links` with a destination root under engine 3: 0.

The id is kept, so nothing keyed on `gemini` changes meaning except the two subagent rows, which the scan moves. Task 1's test proves the move on a fixture store.

### Per-kind baseline

Captured 2026-11-27 from the real store; re-capture immediately before Task 1 (a peer's scan moves these):

```
rule|global|3        rule|project|19
skill|global|563     skill|project|218
subagent|global|302  subagent|project|4
tool|global|65       tool|project|2
```

Predicted after Task 1, on this machine: skill global 574 (+11, the real directories in `~/.gemini/config/skills`); tool global 69 (+4, `~/.gemini/config/mcp_config.json`); every other line identical. Subagent totals identical, with two rows changing engine. Any other movement is a blocker to report, not reconcile.

Which store the "after" figures come from is Q3. A branch build writing the real store leaves an `antigravity` engine row, a `~/.gemini/config` root and about 15 asset rows there; reaping is off (`HANGER_ENABLE_REAP`), so they stay if the branch is not merged, under an engine `main` does not know. The app has no database-path override (only `HANGER_ENABLE_REAP` and `HANGER_TEST_HOME` are read from the environment), so the copy route is a test: Task 1 Step 9.

## Review Focus

1. **A server declared in both engines' files** (`cua`, `cua-driver`, `browse` are, here). Switching it off for Antigravity must leave `~/.gemini/mcp-server-enablement.json` alone, and the Gemini switch must leave `mcp_config.json` alone. Test in Task 2.
2. **An Antigravity entry that carries `enabled`.** `agy` ignores it (measured). Hanger must not show such a server as off, and must not write `enabled` to switch it. Test in Task 2, behaviour per Q6.
3. **A machine with `~/.gemini` and no `~/.gemini/config`** (Gemini CLI only, or an older install). No Antigravity engine row, no Antigravity tile. Test in Task 1.
4. **`~/.gemini/config/skills` full of symlinks into the store.** No store row changes owner. Test in Task 1.
5. **A stub entry `{"disabled": true}` with no `command`**, as `agy mcp disable <unknown>` writes. Discovery must not fail the file. Test in Task 2.

---

### Task 0: Naming brief and baseline (gate, no code)

**Files:**
- Create: `docs/plans/2026-11-27-antigravity-engine-naming-brief.md`

- [ ] **Step 1:** Write the naming brief for the two labels (Q1): what each product calls itself (`agy --help` says "agy"; vendor pages say "Antigravity CLI", "Antigravity IDE", "Antigravity App"; Gemini's say "Gemini CLI"), what the row actually covers (`~/.gemini/config` is read by the CLI and, per the MCP page, the IDE), and where the label renders (engine tiles, MCP host rows, inspector "Engine", README coverage).
- [ ] **Step 2:** Run `/humanizer` over the brief's proposed strings.
- [ ] **Step 3:** Stop. Karthik answers the questions in Plannotator. Q1 to Q4 gate Task 1, Q5 and Q6 gate Task 2, Q7 gates Task 3, Q8 gates Task 4. No task starts before the questions that gate it are answered; an answer that differs from a recommendation means re-planning the steps that cite it.
- [ ] **Step 4:** Re-capture the per-kind baseline with the query in `.claude/rules/shared-asset-machinery.md`, plus `select coalesce(e.key,'NULL'), a.category, count(*) from assets a left join engines e on e.id=a.engine_id group by 1,2;`, and paste both into the Task 1 report.
- [ ] **Step 5:** Run the `stage-gate --plan` skill on this plan with a fresh reviewer (`CLAUDE.md` → Gates).

### Task 1: The Antigravity engine, its MCP host and source, and the Gemini rename

One commit, because the tables must agree: a `HOSTS` id with no label fails `engine-labels.test.ts`, a new `AGENT_CONFIGS` id with no engine key panics the scan, and README figures that disagree fail `readme-sync`.

**Files:**
- Modify: `src-tauri/src/agents.rs` (`AGENT_CONFIGS`, `subagent_owner_for_path` doc comment; the module doc's "filed under 'Gemini / Antigravity'" is history and stays)
- Modify: `src/data/brands.ts` (the two comments that quote the old label, lines 69 and 95; no mapping change until Task 3)
- Modify: `src-tauri/src/scanner.rs` (`get_engine_key`, `agent_id_static`, the `if agent.id == "gemini"` block in "4. Global Subagents")
- Modify: `src-tauri/src/mcp/registry.rs` (`HOSTS`, `SOURCES`)
- Modify: `src/utils/mcpServerView.ts` (`HOST_NAMES`), `src/utils/assetProvenance.ts` (`NAMES`)
- Modify: `src/__tests__/brand-coverage.test.ts`, `src/__tests__/engine-labels.test.ts`, `src/__tests__/no-hardcoded-engine-copy.test.ts` (floors and one allowlist entry, see Step 6)
- Modify: `README.md` (regenerated `coverage` region only)
- Create: `src-tauri/tests/antigravity_engine_tests.rs`
- Modify: `src-tauri/tests/agent_attribution_tests.rs`, `src-tauri/tests/mcp_discovery_tests.rs`

**Interfaces:**
- Produces: `AgentConfig { id: "antigravity", name: <Q1 label>, global_roots: &[".gemini/config"], project_roots: &[], skills: Some("skills"), rules: Some("rules"), subagents: Some("agents"), reads_agents_dir: <Q2>, detect_files: &[] }`, placed right after the `gemini` row. `get_engine_key("antigravity") == Some("antigravity")`. `agent_id_static("antigravity") == "antigravity"`. `McpHost { id: "antigravity", display_name: <same label>, kind: HostKind::Agent }` right after `gemini`. `McpSource { host_id: "antigravity", location: HomeRelative, path: ".gemini/config/mcp_config.json", tier: Global, dialect: McpServers }`. The `gemini` row and host keep their id and take the Q1 Gemini label.

- [ ] **Step 1: Write the failing tests**

In `src-tauri/tests/agent_attribution_tests.rs`:

```rust
#[test]
fn antigravity_owns_its_config_dir_and_gemini_keeps_the_rest() {
    let home = Path::new("/Users/u");
    let owner = |rel: &str| engine_for_path(&home.join(rel)).map(|c| c.id);
    assert_eq!(owner(".gemini/config/skills/paseo/SKILL.md"), Some("antigravity"));
    assert_eq!(owner(".gemini/config/agents/a.md"), Some("antigravity"));
    assert_eq!(owner(".gemini/config/mcp_config.json"), Some("antigravity"));
    assert_eq!(owner(".gemini/skills/x/SKILL.md"), Some("gemini"));
    assert_eq!(owner(".gemini/GEMINI.md"), Some("gemini"));
    assert_eq!(owner(".gemini/settings.json"), Some("gemini"));
    assert_eq!(owner(".agents/skills/x/SKILL.md"), None);
}
```

In `src-tauri/tests/mcp_discovery_tests.rs`: `antigravity_reads_only_its_config_file` builds a temp home with `.gemini/config/mcp_config.json` (servers `alpha`, `beta`), `.gemini/antigravity/mcp_config.json` (server `legacy`) and `.gemini/settings.json` (server `gemini-only`), calls `discover_machine(&home)`, and asserts the registrations with `host_id == "antigravity"` are exactly `{alpha, beta}` at `ScopeTier::Global`, none is named `legacy`, and `gemini-only` has `host_id == "gemini"`.

Create `src-tauri/tests/antigravity_engine_tests.rs`, with the `HANGER_TEST_HOME` and env-guard harness of `home_root_hazard_tests.rs`, one fixture home, a full scan into a temp store, then SQL over `assets` joined to `engines`:

- `both_engines_file_each_asset_under_their_own_key`: fixture holds `.gemini/settings.json` (server `g1`), `.gemini/GEMINI.md`, `.gemini/config/mcp_config.json` (servers `a1`, `a2`), `.gemini/config/skills/real/SKILL.md`, `.gemini/config/agents/sub.md`, `.gemini/config/plugins/p/agents/plug.md`. Assert: `g1` tool and `GEMINI.md` rule are `gemini`; `a1`, `a2` tools, skill `real`, subagents `sub` and `plug` are `antigravity`; no asset is under `gemini` with a path containing `/.gemini/config/`.
- `the_two_rows_filed_under_gemini_move_on_the_next_scan`: seed the store with `upsert_engine("gemini", ...)`, its root, and a subagent row at `.gemini/config/plugins/p/agents/plug.md` under `gemini`; scan; assert that row's engine key is `antigravity`, the row count for that path is 1, and its `root_id` is the `.gemini/config` root.
- `a_gemini_only_home_has_no_antigravity_engine`: fixture with `.gemini/settings.json` only; assert `engines` has `gemini` and no `antigravity` row.
- `symlinked_store_skills_in_the_config_dir_keep_their_owner`: fixture has `~/.agents/skills/s/SKILL.md`, `~/.claude/skills -> ~/.agents/skills` (this machine's shape, so Claude Code's walk records the store row) and `~/.gemini/config/skills/s -> ../../../.agents/skills/s`. After the scan assert, in this order: exactly one asset row exists at the canonical `.agents/skills/s` path (if the fixture produces none, the test fails here, never passes on an empty query); that row has `engine_id IS NULL` and the `~/.agents` root; no asset row exists under `.gemini/config/skills/s`.
- `the_config_sweep_keeps_the_antigravity_host`: after the scan, the inventory tool `a1` has `owning_agent == "antigravity"` (so the sweep, which runs before the registry pass, does not leave host `""`).

- [ ] **Step 2: Run them and see them fail**

Run: `cd src-tauri && cargo test --test agent_attribution_tests antigravity_ && cargo test --test mcp_discovery_tests antigravity_ && cargo test --test antigravity_engine_tests`
Expected: FAIL. `engine_for_path` answers `gemini` for `.gemini/config/...`; discovery has no `antigravity` host; the scan files the plugin subagent under `gemini`. `a_gemini_only_home_has_no_antigravity_engine` and `symlinked_store_skills_in_the_config_dir_keep_their_owner` may pass red-first because they pin current behaviour; record which. After Step 3, plant one violation per test, each reverted by inverse edit, never `git checkout` (`shared-checkout.md`):
  - `a_gemini_only_home_has_no_antigravity_engine`: add `".gemini"` as a second entry in the new row's `global_roots`. Expected: this test fails on an `antigravity` engine row.
  - `symlinked_store_skills_in_the_config_dir_keep_their_owner`: add `.follow_links(true)` to the `WalkBuilder` in "3. Global Skills under skills/ folder". Expected: this test fails on `engine_id` (the Antigravity walk now descends the link and `upsert_asset_on` moves the store row to `antigravity`).
  Paste each red run and the green run after the revert.

- [ ] **Step 3: Implement**

Add the rows from Interfaces. In `get_engine_key` add `"antigravity" => Some("antigravity")`; in `agent_id_static` add `"antigravity" => "antigravity"`. In "4. Global Subagents" keep `~/.gemini/agents` for `gemini` and move the `.gemini/config/agents` push and the `plugins/*/agents` loop to an `agent.id == "antigravity"` branch that reads `g_path_buf.join("plugins")` (the generic `g_path_buf.join("agents")` push already covers `~/.gemini/config/agents`). Add `antigravity` to `HOST_NAMES` and `NAMES` with the Q1 label, and set `gemini` in both to the Q1 Gemini label. Fix the two `brands.ts` comments that quote "Gemini / Antigravity" (lines 69 and 95) and list `.gemini/config` among `subagent_owner_for_path`'s participants.

- [ ] **Step 4: Move the guard floors, in this commit, named in the body**

`brand-coverage.test.ts`: `"registry.rs HOSTS": 17`, `"agents.rs AGENT_CONFIGS": 12`, `"scanner.rs get_engine_key": 14`, the distinct-size floor to the real distinct count (grep it, do not guess), and the comment's counts. `engine-labels.test.ts`: host floor 17, scope-agent floor 14. `no-hardcoded-engine-copy.test.ts`: the union floor `knownEngineNames().length` (line 124) 16 to 17, `agentDisplayNames()` floor 12, `hostDisplayNames()` floor 17, and the comments that say "11" and "16". Each number comes from a `grep -c` against the edited tables, pasted in the report.

Why these stay in the table commit although an ordering with two green commits exists (the floors are `>=`, so the old values pass): `.claude/rules/shared-asset-machinery.md` says "Growing one of those tables means raising its floor in the same commit", and `verification.md`'s separate-commit rule covers edits *forced* by another change, which a floor raise is not (nothing goes red without it). The commit body lists each floor, old and new value, as a separately reported enforcement edit.

- [ ] **Step 5: Regenerate the README figures**

Run: `~/.bun/bin/bun run src/__tests__/readmeCounts.ts`. Expected: the `coverage` region reads 12 engines and 17 hosts with both labels, and the `tests` region reads 49 Rust integration test files (48 today, README.md line 162; `readmeCounts.ts` counts `src-tauri/tests/*.rs`, and this task adds `antigravity_engine_tests.rs`). The `ipc` region does not change. Any other movement is reported.

- [ ] **Step 6: The allowlist entry the rename forces**

If the Gemini label becomes `Gemini CLI`, `DesignSystemPane.tsx:1226` (`<EngineLabel engineKey="gemini" engineName="Gemini CLI">Gemini CLI</EngineLabel>`) becomes a hardcoded engine name and `no-hardcoded-engine-copy.test.ts` fails. Add an `ALLOWLIST` entry beside the Claude Code and Codex specimen entries, reason "Same showcase Specimen as the Claude Code row above." No ordering leaves the rename commit and a separate allowlist commit both green, so this is the `verification.md` ordering exception: it goes in this commit and the body names it and its cause.

- [ ] **Step 7: Run the four gates**

Expected: all green. Paste the commands, outputs and exit codes.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/agents.rs src-tauri/src/scanner.rs src-tauri/src/mcp/registry.rs src/utils/mcpServerView.ts src/utils/assetProvenance.ts src/data/brands.ts src/__tests__/brand-coverage.test.ts src/__tests__/engine-labels.test.ts src/__tests__/no-hardcoded-engine-copy.test.ts README.md src-tauri/tests/antigravity_engine_tests.rs src-tauri/tests/agent_attribution_tests.rs src-tauri/tests/mcp_discovery_tests.rs
git commit -m "feat(engines): Antigravity CLI is its own engine, read from ~/.gemini/config" -- <the same paths>
```

Body: the ruling, the guard floors moved and why, the allowlist entry and why.

- [ ] **Step 9: Capture per-kind counts on a copy of the store** (per Q3; recommended route)

Add `#[ignore]` test `real_machine_counts_on_a_store_copy` to `antigravity_engine_tests.rs`: it copies the real store with `sqlite3 "<store>" ".backup <tempdir>/hanger.db"` (read-only on the source), builds `DirectoryScanner { db_path: <the copy>, cancellation_token }`, prints both baseline queries from the untouched copy ("before"), calls `global_pass()` against the real home, and prints them again ("after"). Run: `cd src-tauri && cargo test --test antigravity_engine_tests real_machine_counts_on_a_store_copy -- --ignored --nocapture`. Take it right after a Rescan in the main checkout's dev app (main's code), so "before" is main's reading of today's disk; a delta outside the prediction may then be disk drift since that Rescan, so rerun after a fresh Rescan before calling it a blocker. Compare with the prediction above line by line. It covers the machine pass only: project-scope figures come from the copy unchanged and are expected identical. If Q3 rules for the real store instead, rescan in a dev app built from this branch (Q3 says how) and run the same queries on the real store.

### Task 2: Antigravity's switch

**Files:**
- Modify: `src-tauri/src/mcp/registry.rs` (`SWITCHES`, `SwitchKind::DisabledKey` doc)
- Modify: `src-tauri/src/mcp/switch/edit.rs` (`reading`, `change`, module doc rules), only if Q6 rules "disabled only"
- Modify: `src-tauri/tests/mcp_switch_tests.rs`

**Interfaces:**
- Consumes: Task 1's `antigravity` host and Global `SOURCES` row.
- Produces: `SwitchRow { host_id: "antigravity", kind: SwitchKind::DisabledKey, tiers: &[Global], confirmed: "agy 1.5.18, 2026-11-27" }`. If Q5 rules read-only, no row, and Antigravity servers report `ReadOnlyReason::EngineNotConfirmed` (already produced by `context.rs` for a host with no row).

- [ ] **Step 1: Write the failing tests** in `mcp_switch_tests.rs`, beside `codex_is_switchable_at_both_scopes`:

```rust
#[test]
fn antigravity_is_switched_by_a_disabled_key_at_global_only() {
    assert_eq!(kind_at("antigravity", ScopeTier::Global), Some(SwitchKind::DisabledKey));
    for tier in [ScopeTier::Project, ScopeTier::Local, ScopeTier::User] {
        assert!(registry::switch_for("antigravity", tier).is_none(), "antigravity at {:?}", tier);
    }
}
```

- `antigravity_off_writes_disabled_and_leaves_the_gemini_state_file_alone`: a bench home holding `.gemini/settings.json` and `.gemini/config/mcp_config.json`, both declaring `cua`; switch `cua` off for `antigravity` through `ops::set_enabled_for`; assert `mcp_config.json`'s `cua` entry gains `"disabled": true`, `~/.gemini/mcp-server-enablement.json` does not exist, and `settings.json` is byte-identical. Then the mirror: switch it off for `gemini`; assert the enablement file gets `{"cua":{"enabled":false}}` and `mcp_config.json` is byte-identical.
- Per Q6 ("disabled only", recommended): `an_antigravity_entry_that_says_enabled_false_still_reads_on` asserts `edit::read_flag(r#"{"mcpServers":{"g":{"command":"x","enabled":false}}}"#, Dialect::McpServers, SwitchKind::DisabledKey, "g") == Ok(None)`, and `switching_it_off_writes_disabled` asserts the off text is `{"mcpServers":{"g":{"disabled": true,"command":"x","enabled":false}}}` (the key goes first, per `edit.rs`'s "Where a new key goes").
- `a_stub_entry_with_no_command_does_not_fail_the_file`: discovery over `{"mcpServers":{"ghost":{"disabled":true},"alpha":{"command":"x"}}}` still returns `alpha`; `ghost` reads off.

- [ ] **Step 2: Run them and see them fail**

Run: `cd src-tauri && cargo test --test mcp_switch_tests antigravity_ && cargo test --test mcp_switch_tests a_stub_entry`
Expected: FAIL on the missing row; the Q6 tests fail on `Ok(Some(false))` and an `enabled` write.

- [ ] **Step 3: Implement**

Add the `SWITCHES` row with a comment citing this plan's transcript, the shape of the existing rows. Under Q6 "disabled only": `reading` returns `disabled` alone for `DisabledKey`, and `change` writes `disabled` for `DisabledKey` whatever `enabled` holds; update the module doc's rules and the `DisabledKey` doc in `registry.rs` (it says "No row in `SWITCHES` uses it").

- [ ] **Step 4: The tests Q6 forces, reported separately**

Under Q6 "disabled only", run the whole file after Step 3 (`cd src-tauri && cargo test --test mcp_switch_tests`) and list the tests that go red from that run's output, not from this plan. Expected from reading the code: `an_entry_that_already_says_enabled_keeps_that_key` and the `enabled_off`/`enabled_on` cases of `read_flag_reads_both_spellings` under `SwitchKind::DisabledKey`. `when_both_keys_disagree_the_one_the_engine_is_switched_by_is_read` should stay green: its fixture holds both keys and both `disabled.or(enabled)` and `disabled` alone give `Some(false)`. A red outside the run's own list, or a missing expected red, is reported before anything is edited. Only the assertions that go red change. Changing the behaviour and those assertions cannot be split into two green commits, so they share the commit and the body names each test, the old assertion, the new one, and the `agy` evidence that forced it. If Karthik rules otherwise, stop and re-plan this step.

- [ ] **Step 5: Run the four gates.** Expected: green; outputs pasted.

- [ ] **Step 6: Commit** (explicit paths, own Bash call): `feat(switch): Antigravity CLI servers switch by a disabled key in mcp_config.json`.

### Task 3: Antigravity's mark (pending Q7)

**Files:**
- Modify: `src/data/brands.ts` (`BrandId`, `BRANDS`, `ALIASES`), `src/assets/brand/SOURCES.md`, `src/components/DesignSystemPane.tsx` (one `BrandIcon` in the specimen row)
- Modify: `src/data/brands.test.ts`

- [ ] **Step 1: Failing test.** In `brands.test.ts`, move `"antigravity"` and any Q1 Antigravity label spellings out of the `gemini` alias list into a new `antigravity: ["antigravity", "Antigravity CLI"]` entry, add `"antigravity"` to the sorted `BRAND_IDS` expectation, and keep `"Gemini / Antigravity"` resolving to `gemini` (an old stored display name still draws a mark). These are forced edits to a pinning test; the body names them.
- [ ] **Step 2: Run** `npx vitest run src/data/brands.test.ts`. Expected: FAIL, `antigravity` resolves to `gemini`.
- [ ] **Step 3: Implement.** `import antigravitySvg from "@lobehub/icons-static-svg/icons/antigravity-color.svg?raw";` (or `antigravity.svg` with `ink: true`, per Q7), `antigravity: { svg: antigravitySvg, ink: false, source: "lobe" }`, alias `antigravity: "antigravity"` plus the normalised Q1 label. Add the `SOURCES.md` row. Add `<BrandIcon engineKey="antigravity" size={16} />` to the design-system specimen row so `design-system-coverage` stays honest.
- [ ] **Step 4: Run the four gates.** The colour file carries a `<mask>` and a `<filter>`; `svgSymbol.ts` prefixes every `id=` and `url(#…)`, which should cover both (inferred, so Task 5's screenshot is the check).
- [ ] **Step 5: Commit**: `feat(brands): Antigravity CLI draws its own mark`.

### Task 4: Records

**Files:**
- Modify: `docs/plans/2026-11-24-context-control-engine-matrix.md` (new section "Antigravity CLI: a disabled key in the entry is honoured; enabled is ignored", with the transcript above, and a Summary row)
- Modify: `docs/TODO.md` (T22: done-when met, with the commit SHAs, resolved with `git cat-file -t`)
- Modify: `docs/roadmap.md` (the "Not touched" list from Blast radius, and Q8's ruling)
- Modify: `docs/TODO.md`, a new entry after T23 for Q4 if he accepts the phantom tile: "Gemini CLI is detected by `~/.gemini`, which `agy` creates", with the fact 9 and fact 10 evidence and a done-when ("an Antigravity-only home shows no Gemini CLI engine, pinned by a test")

- [ ] **Step 1:** Write the edits. Every path and count in them comes from a command run that day.
- [ ] **Step 2:** `npx vitest run` (the link guard reads docs). Expected: green.
- [ ] **Step 3: Commit**: `docs: Antigravity CLI in the engine matrix, T22 closed`.

### Task 5: Evidence in the running app (human-gated)

- [ ] **Step 1:** Screenshots per `.claude/rules/verifying-ui.md`, from a dev app built from this branch and run the way Q3 rules (dev pid, window title `Hanger AI (dev)`, theme read from the store and named): Global with both engine tiles and their marks, light and dark; the `cua` server's detail with a Gemini CLI row and an Antigravity CLI row, each with its own switch. Save under `docs/evidence/2026-11-27-antigravity-engine/`.
- [ ] **Step 2: Karthik's check** (the part `mcp list` cannot prove). In Hanger, switch `cua` off for Antigravity CLI only. Then in a terminal: `agy mcp list` must show `cua ... disabled`; start `agy`, run `/mcp`, and `cua` must not be connected. `gemini mcp list` must still show `cua` enabled. Switch it back on in Hanger; `agy mcp list` shows `enabled` (measured on a throwaway home: `"disabled": false` lists `enabled`), and `git diff --no-index` against a copy taken before shows one added line, `"disabled": false` in `cua`'s entry, and nothing else. Hanger's DisabledKey "on" writes that key rather than removing it (`a_server_switched_off_and_on_again_ends_with_its_flag_saying_on` and the `edit.rs` module doc). Not done until his result is in the conversation.
- [ ] **Step 3:** Per-kind counts once more, and the `stage-gate --dev` review by a fresh reviewer before any push.

## Questions for Karthik

Ordered as they block: Q1 to Q4 gate Task 1, Q5 and Q6 gate Task 2, Q7 gates Task 3, Q8 gates Task 4.

:::question
What should the two engines be called?

The labels render on engine tiles, MCP host rows, the inspector and the README. Gemini CLI already calls itself "Gemini CLI" in two places in the UI (`assetProvenance.ts`, `mcp/observe.rs`). The vendor says the CLI and the IDE both read `~/.gemini/config`, so "Antigravity" might seem to cover the IDE and App too. But the IDE/App may still read `~/.gemini/antigravity/mcp_config.json` (it exists on this machine, `agy` does not read it, and the IDE was not measured), which this row does not read.

- [ ] Gemini CLI and Antigravity CLI — matches your ruling's words and the one program measured
- [ ] Gemini CLI and Antigravity — names the whole family, but claims IDE and App coverage nobody has measured

Recommended: Gemini CLI and Antigravity CLI
:::

:::question
Should Antigravity read the shared `.agents/` store (`reads_agents_dir: true`) before that is measured?

It decides the Reach column for every shared-store asset, several hundred rows here, not just Antigravity's own. `agy`'s own changelog (1.5.16) says it discovers `~/.agents/skills`, and the vendor docs say it reads the workspace `.agents/`. I could not measure it read-only: `agy` has no skill-listing command, `/skills` needs a signed-in session, and `agy agents` shows only `~/.gemini/config/agents`.

- [ ] `true` now, on the changelog and docs — Reach is right if they are, and your `/skills` check in a real session settles it before merge
- [ ] `false` until measured — no Reach claim without a measurement; Antigravity reads as not reaching store skills it probably reads

Recommended: `true` now, on the changelog and docs
:::

:::question
Where should the "after" counts and the screenshots come from?

A dev build of this branch scanning your real store writes an `antigravity` engine row, a `~/.gemini/config` root and about 15 asset rows. Reaping is off, so they stay under an engine `main` does not know if this branch is not merged. The app has no database-path override. Vite is pinned to port 8397 with `strictPort`, so a second `tauri dev` from this worktree cannot run while the main checkout's is up.

- [ ] Counts from an ignored test that scans a copy of the store; screenshots from this branch's dev app only after the main one is stopped, accepting the rows it writes — no real-store writes for the counts, one deliberate window for the screenshots
- [ ] Both from this branch's dev app on the real store, main's dev app stopped meanwhile — simplest, and leaves rows behind if the branch stalls
- [ ] Counts from the copy now; screenshots only after merge, from main — no branch rows ever reach the real store, and the UI is unverified until merge

Recommended: Counts from an ignored test that scans a copy of the store; screenshots from this branch's dev app only after the main one is stopped, accepting the rows it writes
:::

:::question
`agy` creates `~/.gemini` on first run, so an Antigravity-only machine will also show a Gemini CLI engine. Fix that now?

Gemini CLI is detected by the existence of `~/.gemini` (`get_global_agents_with_denials`). Before the split the same machine showed one combined engine. After it, a Gemini CLI tile appears for a program that is not installed. The reverse does not happen: `gemini mcp list` on an empty home creates no `~/.gemini/config` (measured). Fixing it means detecting Gemini CLI by a file such as `~/.gemini/settings.json`, which `AgentConfig` has no field for today.

- [ ] Accept it for this plan; Task 4 adds a `docs/TODO.md` entry after T23 — keeps this change to the tables
- [ ] Add a Gemini CLI detection file in this plan — honest on every machine, one more AgentConfig change

Recommended: Accept it for this plan; Task 4 adds a `docs/TODO.md` entry after T23
:::

:::question
Ship Antigravity's switch now, or read-only until you have run the live check?

`agy mcp list` honours `"disabled": true` on an isolated home, and lists `"disabled": false` as enabled. That is the same bar the Codex and Gemini rows were added on. What it cannot show is that a running `agy` session skips the server; Task 5 step 2 is that check.

- [ ] Ship the switch at Global now — the evidence meets the SWITCHES bar, and your check follows before merge
- [ ] Read-only (EngineNotConfirmed) until your check passes — no write ships on mcp list alone

Recommended: Ship the switch at Global now
:::

:::question
When an entry already carries an `enabled` key, should DisabledKey still read and write `disabled` only?

`agy` ignores `enabled` (measured: `"enabled": false` lists as enabled), but the DisabledKey code ported from mcpick reads and writes `enabled` when it is there, so Hanger would show such a server off while `agy` runs it. DisabledKey is generic: changing it binds every future DisabledKey host too (Cursor, VS Code and Claude Desktop, whose check sheets try `disabled`), and for those the mcpick rule may be the right one. Two existing tests pin it today.

- [ ] DisabledKey reads and writes `disabled` only — right for the one engine measured; a future host needing the mcpick rule gets its own kind then
- [ ] Refuse to switch an entry that carries `enabled` — no test changes and the generic rule stays, but a read-only row for a hand-edited file
- [ ] Leave it, and record the gap — smallest change, and a wrong state on screen

Recommended: DisabledKey reads and writes `disabled` only
:::

:::question
Which mark should Antigravity draw?

lobe 1.94.0 ships `antigravity-color.svg` (multi-colour, uses a mask and a blur filter) and `antigravity.svg` (currentColor). Gemini draws its colour sparkle beside it. Today `antigravity` resolves to the Gemini sparkle.

- [ ] antigravity-color.svg — matches Gemini's colour mark; check it at 12px and on dark
- [ ] antigravity.svg, ink — simplest file, follows --ink like Cursor and Kiro
- [ ] Keep the Gemini sparkle — no new file, but two tiles with one mark

Recommended: antigravity-color.svg
:::

:::question
Antigravity reads `~/.gemini/GEMINI.md` and `~/.gemini/skills`, which Gemini CLI owns. Should the Reach column say so?

`engine_reach` lets only the owning engine reach an asset in an engine root, so those two will read "not reached" for Antigravity although the vendor docs say it reads them. This is the same open question as Cursor and Cline reading Claude Code's folders (research doc, section 3).

- [ ] Record it as a known limit in docs/roadmap.md — one model change for every engine pair, later
- [ ] Add a cross-engine reach edge for these two paths now — correct for this pair, a one-off in annotations.rs

Recommended: Record it as a known limit in docs/roadmap.md
:::

## Answers (Karthik, 2026-11-27, in Plannotator)

All eight took the recommendation:

1. Labels: **Gemini CLI** and **Antigravity CLI**.
2. **`reads_agents_dir: true` now,** on agy's changelog and docs.
3. Counts from the **ignored test that scans a copy of the store**; screenshots from this branch's dev app **only after the main one is stopped**, accepting the rows it writes.
4. The phantom Gemini CLI engine on an Antigravity-only machine is **accepted for this plan**; Task 4 adds a `docs/TODO.md` entry after T23.
5. **Ship Antigravity's switch at Global now.**
6. **DisabledKey reads and writes `disabled` only.**
7. Mark: **`antigravity-color.svg`.**
8. Antigravity reading Gemini CLI's `~/.gemini/GEMINI.md` and `~/.gemini/skills`: **recorded as a known limit in `docs/roadmap.md`.**
