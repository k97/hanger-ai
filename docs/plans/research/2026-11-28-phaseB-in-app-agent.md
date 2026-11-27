# Phase B, the in-app agent: research (2026-11-28)

Piece 8 of the eight. Research only; no code was changed. Every outside fact
was read on 2026-11-28. CLI facts come from `--help` of the installed binaries:
Claude Code 2.1.332, codex-cli 0.172.0, Gemini CLI 0.56.0, `agy` 1.5.18 and
OpenCode 2.4.1.

## 1. What it is and why

Hanger becomes "a harness for your harnesses". The user asks a question about
the selected engine or asset, and Hanger runs the user's own installed engine
headless to answer it. Hanger brings no model and no key of its own. The
model's only tools are Hanger's safe verbs: list, measure, switch, link and
undo. It reads freely inside the scope. Every write, and any read outside the
scope, waits for the user to approve it in Hanger's window.

## 2. What exists today

- **The verbs.** Hanger's MCP server is `mcp_server` → `TOOLS` (5 specs:
  `list_engines`, `engine_context`, `find_assets`, `reach`, `findings`).
  `main.rs` branches to `mcp_server::run_from_args` when `args[1] == "mcp"`,
  so the app binary is already a stdio server that an engine can launch.
  Its boundary (no launch commands, env, skill bodies, tool descriptions or
  parser messages) is pinned by `tests/mcp_server_boundary_tests.rs`.
- **Proposals (planned, not built).** Phase 2 of
  `docs/plans/2026-11-27-hanger-mcp-server.md` (Tasks 8 to 11) adds
  `propose_switch`, `propose_undo` and `get_proposal`. It writes proposal
  files into `<data>/mcp/proposals`, and the app applies an approved one
  through `ops::set_enabled_for` / `undo_for` with no free text. That is
  exactly phase B's write-approval path. Round 41 says phase 2 is unblocked.
- **Spawning.** `engine_status::run::run_capture` spawns with no shell,
  `kill_on_drop(true)`, stderr discarded and a timeout. `resolve::search_path`
  and `resolve_in` find a CLI the way a terminal does, and `lib.rs` →
  `claude_cli_for` already uses them. It captures the output when the run
  ends and does not stream it.
- **Redaction.** `mcp::redact` (`redact_launch`, `looks_secret`,
  `SECRET_WORDS`).
- **UI.** `SearchPalette.tsx` (cmdk 1.1.1), and the inspector `Flyout.tsx`
  with `UnderlineTabs`. A grep for `Channel` found no use in `src/` or
  `src-tauri/src/`. Streaming today is `app.emit` events (`scan://*`).
- **Store.** `preferences.rs` → `STORE_VERSION = 8`.
- **Binding rulings.** No default engine. Claude only through `--bare` with
  the user's key. Saved views are drafted by the model and frozen by the
  user. Ollama is for tagging and dedup only. T23 (A2UI or Hanger's own
  format) must be asked again before any model output goes on screen. The
  research's safety rules 1 to 8 also apply
  (`2026-11-27-harness-model-layer-research.md` §5).

## 3. Outside facts

**Claude Code** ([headless](https://code.claude.com/docs/en/headless),
[CLI reference](https://code.claude.com/docs/en/cli-reference),
[errors](https://code.claude.com/docs/en/errors)):
- `--bare` skips hooks, plugins, MCP servers, auto memory and CLAUDE.md.
  "Only servers supplied on the command line connect." Auth is "strictly
  ANTHROPIC_API_KEY or apiKeyHelper via --settings (OAuth and keychain are
  never read)" (`--help`).
- `--tools ""` disables every built-in tool and leaves MCP tools alone.
  `--strict-mcp-config --mcp-config <json>` loads only the servers you pass.
- `--output-format stream-json --verbose [--include-partial-messages]` emits
  JSONL: `system/init` (lists `mcp_servers` with status and
  `mcp_server_errors`), `assistant`, `user`, `stream_event`,
  `system/api_retry`, `permission_denied` and `result`. The result carries
  `total_cost_usd`, which is a client-side estimate. `--max-budget-usd` and
  `--max-turns` cap a run, and `--json-schema` fills `structured_output`.
- Since v2.1.302 a `-p` run starts in Manual mode. A call that needs approval
  is denied unless a hook or `--permission-prompt-tool` approves it. That
  tool must return one text block,
  `{"behavior":"allow"}` or `{"behavior":"deny","message":…}`.
- Cancelling: SIGINT ends the turn, and SIGTERM exits 143 with the turn left
  unfinished. `--no-session-persistence` stops the transcript being written.
- Without `--bare`, `-p` "runs the hooks in a project's
  `.claude/settings.json` and connects the servers in its `.mcp.json`, even
  in a folder you've never trusted".

**Codex** (`codex exec --help`;
[non-interactive](https://learn.chatgpt.com/docs/non-interactive-mode);
[config reference](https://learn.chatgpt.com/docs/config-file/config-reference)):
- `--json` prints JSONL events: `thread.started`, `turn.started`, `item.*`,
  `turn.completed` with token usage, `turn.failed` and `error`. The page
  gives token counts and no dollar cost.
- Auth: saved CLI sign-in by default, or `CODEX_API_KEY`. The sandbox is
  read-only by default.
- `--ignore-user-config` skips `config.toml`, and auth still comes from
  `CODEX_HOME`. `-c mcp_servers.<id>.command=…` and `args` can declare
  Hanger per run. `mcp_servers.<id>.default_tools_approval_mode` takes
  `auto | prompt | writes | approve`; what each value means was not read.
  `--ephemeral` writes no rollout files, and `--output-schema` constrains the
  final reply.
- **A read-only sandbox still lets the shell read any file.** The feature
  flags include `shell_tool` and `unified_exec`, both stable and on (from
  `codex features list` on a throwaway `CODEX_HOME`). Whether
  `--disable shell_tool --disable unified_exec` removes every built-in tool
  was not tested.

**Others.** Gemini CLI has `-p`, `-o stream-json` and
`--allowed-mcp-server-names`. Its OAuth is barred for third-party use (model
research §2). `agy` has `-p`, `--output-format stream-json`, `--settings`
and an `acp` subcommand, and no flag that limits MCP servers to a given set.
`opencode run` has `--format json` and `--auto`, and no MCP flag. None of the
three goes in the first cut.

**Tauri.** Channels "are designed to be fast and deliver ordered data", and
the docs name child process output as a use. The event system "is not
designed for low latency or high throughput"
([calling the frontend](https://v2.tauri.app/develop/calling-frontend/)).
Hanger runs the user's installed CLI, so a bundled sidecar (`externalBin`)
does not apply. `tokio::process` is enough, and `tauri-plugin-shell` is not
a dependency.

**T23 facts** (from `npm view`, 2026-11-28):
- `@a2ui/react` 0.16.1 (published 2026-11-23, Apache-2.0) has peer
  dependencies `react ^17 || ^18 || ^19`, so React 19 is declared supported.
  Nothing has been rendered yet.
- It renders A2UI v0.9, v0.9.1 and v1.0, and needs `@a2ui/web_core`. That
  pulls in `lit`, `@preact/signals-core`, `zod ^3.25`,
  `zod-to-json-schema`, `markdown-it` and `validate-color`, none of which
  Hanger has today.
- The package is still 0.x, while the spec it renders is at 1.0. It accepts
  custom catalogues.
- A format of Hanger's own would be a Rust enum validated at the boundary,
  rendered by existing specimened components, with no new dependencies.

## 4. Options

**A. A one-shot child process. Hanger's own server, in agent mode, is the
only tool. Approvals go through phase 2's proposals.**
- Hanger spawns the engine in an empty run folder under its data directory,
  never in the user's repository. For Claude:
  `claude --bare -p --tools "" --strict-mcp-config --mcp-config '{hanger: <app> mcp --agent <run-id>}' --allowedTools "mcp__hanger__*" --output-format stream-json --verbose --no-session-persistence --max-budget-usd N`.
  For Codex:
  `codex exec --json --ephemeral --ignore-user-config --sandbox read-only -c mcp_servers.hanger…`,
  with the shell tools disabled if the spike proves that works.
- The server's agent mode reads the run's scope from a file the app wrote.
  It answers in-scope reads, files a read proposal for an out-of-scope read,
  and files a proposal for every write. Approvals are therefore enforced in
  one engine-agnostic place, never by the engine.
- Output is parsed into a typed event enum per engine and sent over a Tauri
  `Channel`. Cancel sends SIGINT, then kills the process.
- **Cost:** one runner, two stream parsers, an agent-mode tool set, and
  proposals extended to reads.
- **Trade-off:** one question per run. A follow-up starts a fresh run.

**B. Like A, with the MCP server served by the running app over localhost
HTTP.**
- An approval can block inside the tool call, and the scope lives in app
  memory.
- **Cost:** a network listener with a token in a desktop app, plus a new
  `rmcp` transport feature. It also stops reusing the stdio binary and its
  boundary tests.

**C. Drive each engine's own protocol:** `codex app-server` JSON-RPC
approvals, Claude `--input-format stream-json` with
`--permission-prompt-tool`, and ACP for `agy`.
- Multi-turn, with approvals mid-turn.
- **Cost:** a schema to track per engine and per version. Approvals live in
  three dialects. It drifts toward the "never an agent runner" line.

**Pick: A.** It reuses the stdio binary, its boundary tests and phase 2's
approval path. Approvals do not depend on any engine's permission system, and
no network port is opened. Multi-turn can come later through Claude's
stream-json input without changing the trust model.

**The sanitised view.** The model sees phase 1's view and nothing more. If
the agent gets an in-scope "read this asset's text" verb, it exists only in
agent mode. It returns body text passed through `mcp::redact`, labelled as
untrusted, and its free text never becomes an action (rules 1 and 2). The
user-facing server's boundary stays unchanged.

## 5. Shared machinery

- **`mcp_server`:** agent mode, scope checks and read proposals. Collides with
  **piece 1** (MCP phase 2), which owns proposals. The two must share one
  proposal type.
- **`mcp::switch` and `skill_switch`:** reached only through phase 2's
  approval path. Phase B writes nothing directly. Indirect collision with
  **pieces 2, 3, 4 and 5**, whose verbs it exposes.
- **`engine_status::resolve` and `run`:** the runner needs a streaming spawn
  next to `run_capture`. Collides with **piece 7** (T19).
- **`AGENT_CONFIGS`:** a "can be driven, with these flags" fact per engine.
  Collides with **piece 7**.
- **Store:** a run record (request, verb, text hashes, approval, receipt)
  means `user_version` 9 unless it is kept as files. Collides with **piece 4**
  (profiles) and saved views on the version number.
- **Overview card:** not touched. **`HOSTS`:** not touched.
- **`telemetry.rs`:** must never carry model input or output.

## 6. Depends on / unblocks

**Needs first:**
- **Piece 1, MCP phase 2:** the proposal files, `decide_mcp_proposal` and the
  approval surface. Hard prerequisite.
- **Piece 7, T19:** a resolved binary, its version for flag gating
  (`--tools ""` behaviour, Manual mode from 2.1.302) and sign-in status
  (Codex). Hard prerequisite.
- **Pieces 3, 4 and 5** (Registry add and remove, profiles, `gh skill`):
  only add verbs. Not needed to start. Phase B ships with list, measure,
  switch and undo.
- **Piece 6 (gateway):** not needed.
- **T23:** must be ruled before the first task that shows model text.

**Unblocks:** model-drafted saved views (ruling 6), "explain this asset",
and sentence-to-previewed-operations.

## 7. Questions only Karthik can answer

1. **Where does the Claude API key come from?**
   - (a) Hanger reads `ANTHROPIC_API_KEY` from the login shell's environment
     at spawn, the way `search_path` reads PATH, and never stores it.
   - (b) The user names an `apiKeyHelper` command, and Hanger stores the
     command, not the key.
   - (c) Hanger keeps the key in the Keychain.

   **Pick: (a), with (b) as the fallback.** Hanger then holds no secret at
   rest.
2. **Codex if its shell can't be stripped.**
   - (a) Claude only, until a spike proves Codex can run with no built-in
     tools.
   - (b) Ship Codex anyway, accepting unapproved reads anywhere on disk.
   - (c) Drive Codex through `app-server` approvals (option C).

   **Pick: (a).** Option (b) breaks the scope ruling.
3. **The surface.**
   - (a) A tab in the inspector of the selected engine or asset, which
     carries the scope by construction.
   - (b) A drawer.
   - (c) A ⌘K mode.

   **Pick: (a), started from ⌘K.** Layout options are rendered before
   building.
4. **T23: A2UI catalogue or Hanger's own typed format.** The facts are in
   §3. No pick, as T23 asks.

## 8. Size

Roughly 14 tasks:
- two spikes on a throwaway `HOME`: Claude with `--tools ""` and the agent
  server, and Codex tool stripping;
- agent mode and its scope;
- read proposals;
- the runner (spawn, cancel, timeout);
- two stream parsers;
- the Channel;
- the run record;
- the engine preference (no default) and the key source;
- the surface;
- states and cancel;
- docs and README counts.

**Human gates:**
- T23 in Plannotator, before the first UI task;
- a naming brief for the surface and every string;
- layout options;
- a live run with his key that ends in an approved switch and Undo, checked
  by its artefacts;
- Anthropic's answer, before any subscription route.
