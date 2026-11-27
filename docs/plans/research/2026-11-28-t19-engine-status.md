# T19 engine status: research (2026-11-28)

Outside facts below were read on 2026-11-28 from this machine's CLIs and the
public endpoints named. The status commands ran under a throwaway `HOME`. No
credential file, token or env value was read.

## 1. What it is and why

For each engine, Hanger shows four facts: the installed version, whether an
update exists, whether you are signed in, and where its settings files are. It
reports them and never runs the update, because that is a write and belongs to
phase B. The CLIs come first (Claude Code, Codex, Gemini CLI, OpenCode, and now
Antigravity CLI), then the apps.

## 2. What exists today

- `engine_status::resolve` has `search_path`, `cached_shell_path`,
  `login_shell`, `path_from_shell`, `merge_paths` and `resolve_in`. They find a
  CLI the way the user's terminal does. `engine_status::run` has `run_capture`,
  which takes a timeout, optional stdin and env, drops stderr, kills on drop,
  and returns `Option<Captured { ok, stdout }>`.
- Two callers use them: `mcp::switch::vendor` and `lib.rs`, which finds `claude`.
  The `engine_status/mod.rs` header says the engine table, install methods,
  update commands and version parsing "are not built".
- `AGENT_CONFIGS` has 12 entries (grep), including `antigravity`. No table of
  CLIs exists. `mcp::switch::context::EngineContext` already feeds the overview
  card through `get_engine_contexts`. The card is `OverviewCard`, hosted by
  `OverviewHost` and `OverviewPopover`, and pinned into `Flyout`.
- `updates.rs` has the model for a background loop: `spawn_background_checks`,
  an in-flight flag, and a 4 hour interval for Hanger's own updates.
  `set_preference` and `get_preference` give a key/value store, so no migration
  is needed.

**Rulings that bind it** (`hanger-tool-manager-direction.md`):

- Updates: check daily plus a manual refresh. Report the update and its
  command, and never run it. A preference turns checks off.
- Auth: use only the tool's own read-only status command. Keep the verdict and
  method, never a token. A tool with no command shows "Not reported".
- Settings: path, exists, mtime and Open in editor, read-only and masked
  through `mcp::redact`.
- Findings: "not signed in" and an unreadable settings file are findings.
  "Update available" is a badge. "Not reported" and "not installed" are never
  findings.
- Under the context-control UI ruling, an engine's detail is Context plus
  Status. Engines is a lens on Global, so a separate rail section is no longer
  the target.

**Stale marks on `2026-11-24-tool-manager-phase-a.md`:**

| Part | Mark |
|---|---|
| Decision 6 (rail section of its own) | STALE. Engines is now a lens on Global. |
| Decision 8 (slice 1 is exactly four CLIs; apps are slice 2) | STALE. Antigravity CLI is a fifth engine, and apps follow. |
| Facts table | STALE. See section 3: the OpenCode package is wrong, and Gemini and `agy` have no status command. |
| Human gate G1 | PARTLY STALE. The rail label is gone. The strings and a Needs review category name remain. |
| Human gate G2 | STALE. The layout is the card's engine section. |
| Task 1 (`ENGINE_CLIS`, harness.md) | NOT BUILT. It needs a fifth row for `agy` and OpenCode's real package. |
| Task 2 (resolve) | MOSTLY BUILT. `search_path` is async, with a cached shell path. `install_method` and `update_command` are not built. |
| Task 3 (run_capture, version) | `run_capture` is BUILT with a different signature. `parse_version`, `is_newer` and the 5 s `COMMAND_TIMEOUT` constant are not built. |
| Task 4 (auth) | NOT BUILT. The OpenCode rule is WRONG now (section 3). |
| Task 5 (latest) | NOT BUILT. It carries the 2026-11-25 amendment. It is still valid, but OpenCode's source changes. |
| Task 6 (settings) | NOT BUILT. Still valid. |
| Task 7 (IPC) | STALE in shape. Use `get_engine_contexts`' neighbour, not a parallel list. |
| Task 8 (rail entry, `SCREENS` to 7) | STALE. Delete it. |
| Task 9 (EnginesPane and EngineInspector) | STALE. The card's engine section replaces it. |
| Task 10 (findings) | STILL VALID. Needs a category name. |
| Task 11 (proof) | STILL VALID. The per-kind count check is moot, because no asset changes. The Finder-launch check stays. |

## 3. Outside facts

**Per CLI (installed here):**

| CLI | `--version` prints | Latest source (endpoint) | Read-only auth command |
|---|---|---|---|
| Claude Code | `2.1.332 (Claude Code)` | npm `https://registry.npmjs.org/-/package/@anthropic-ai/claude-code/dist-tags` gave `latest 2.1.332`, `stable 2.1.326` | `claude auth status` (JSON default, `--text` available) |
| Codex | `codex-cli 0.172.0` | npm `@openai/codex/latest` gave 0.172.0. GitHub `repos/openai/codex/releases/latest` gave `rust-v0.172.0`, which matches | `codex login status` |
| Gemini CLI | `0.56.0` | npm `@google/gemini-cli/latest` gave 0.71.1. The `preview` and `nightly` tags exist, so use `latest` only | none found |
| OpenCode | `opencode v2.4.1` | npm `@opencode/cli` gave `latest 2.4.2`. Homebrew `formulae.brew.sh/api/formula/opencode.json` gave stable 2.4.1 | `opencode auth list --standalone` |
| Antigravity CLI | `1.5.18` | not found | none found |

What each status command printed, under a throwaway `HOME`, signed out:

- **Claude Code** printed JSON with `loggedIn: false` and `authMethod: "none"`.
  It also printed `apiProvider`, `analyticsDisabled`, `projectsDirectory`,
  `configDirectory`, `loginExpiresAt` and `consoleProfileSignInOffered`. The
  file paths it prints are the whole config directory, so a parser must read
  only `loggedIn` and `authMethod`. I did not run the signed-in shape. The old
  plan says it adds email and org, and that is unverified.
- **Codex** printed `Not logged in`, with a stderr warning about alias helpers.
  `run_capture` already discards stderr.
- **OpenCode** is the important change. The plan's `opencode auth list` hung
  past 20 s and was killed (rc 124). It connects to a "background service". With
  `--standalone` it returned `No authenticated integrations` promptly. The plan
  says zero credentials means "Not reported", which fits this output, but the
  parse and the argv are both new.
- **Gemini CLI**: `gemini --help` lists mcp, extensions, skills, hooks and gemma
  only. Running it bare errors with "Please set an Auth method in … settings.json
  or specify one of … GEMINI_API_KEY …". Reading the auth type out of a settings
  file is a possible later step, but the ruling says "Not reported" until then.
- **`agy`**: no auth subcommand in `--help`. It has `update`, `changelog` and
  `install`. `agy changelog` printed 1.5.17 first while 1.5.18 is installed, so
  it is not a latest-version feed.

**Wrong in the plan, found by running it:**

1. OpenCode's installed package is `@opencode/cli` (the binary is
   `…/@opencode/cli/bin/opencode.exe`). The plan's package, `opencode-ai`,
   shows `latest 1.19.6`, a different, older line. Using it would say "no
   update" forever, or say a downgrade exists. The OpenCode CLI also has its own
   update command, `opencode upgrade [--method curl|npm|bun|brew…]`.
2. `claude` native installs sit ahead of `stable`: installed 2.1.332, npm
   `stable` 2.1.326. This confirms the 2026-11-25 amendment. Compare a native
   install to nothing, or to the channel it is on, never to `latest`.
3. Claude Code's native bucket (the `…/claude-code-releases/stable` file on
   `storage.googleapis.com`) agrees with npm's `stable` tag (2.1.326). It is
   undocumented and carries a hard-coded bucket name, so use the npm tags.
4. OpenCode.app (2.4.2) is also installed and shares the product name.

**Per app** (Info.plist `CFBundleShortVersionString`, read here; no app carries
`SUFeedURL`):

| App | Installed | Feed |
|---|---|---|
| Visual Studio Code | 1.148.0 | `update.code.visualstudio.com/api/update/darwin-arm64/stable/latest` gave 1.148.0. This is the endpoint VS Code itself uses. |
| Zed | 1.30.2 | `zed.dev/api/releases/latest?asset=zed&os=macos&arch=aarch64` gave 1.30.2 after a redirect |
| Warp | 0.2026.11.04… | `releases.warp.dev/channel_versions.json` has `stable.version` v0.2026.11.18… |
| Cursor | 3.16.29 | `api2.cursor.sh/updates/api/update/darwin-arm64/cursor/<ver>/x/stable` gave 3.32.10, which looks odd. It is undocumented. |
| Antigravity | 2.35.2 | The updater URL I tried gave 2.0.6, a different version scheme. Treat it as no usable feed. |
| Claude.app | 6.28899.6 | The download redirect returned 403. Not found. It uses Squirrel, with no readable feed. |
| OpenCode.app | 2.4.2 | not found. Its version matches `@opencode/cli` latest. |

Only VS Code, Zed and Warp have feeds that are stable enough to rely on. Every
other app should say "Not reported" for "update available", as the ruling says.

## 4. Options

**A. The card's engine section, with no new screen (pick).** When an engine is
picked, the overview card's engine section gets three "Status" rows: Version,
Sign-in, Settings. An update shows as a dot on that engine's card row, plus the
command as copyable text. A new IPC command `get_engine_status` sits next to
`get_engine_contexts`, and findings feed `deriveReviewIssues`. This costs about
a day in the webview and adds no rail entry and no telemetry screen. It trades
away a roomy detail pane. Settings text can open in the inspector, as other
assets do.

**B. A dedicated Engines pane in Global's inspector.** An engine row opens a
Flyout subject with the full detail, including a masked settings viewer. It
costs a new Flyout kind and new specimens and `DESIGN.md` entries. Pick this
second, once settings viewing proves too long for the card.

**C. The old plan's rail section.** It contradicts the lens ruling and
duplicates a surface that now exists. Rejected.

**Backend, any option.** Build `ENGINE_CLIS` keyed to `AGENT_CONFIGS` ids with
five CLI rows. Give each row a package or other latest source, its auth argv and
parse, and its settings files. Add `parse_version` and `is_newer`. Take
`install_method` from the canonicalised path. Treat OpenCode and Gemini as
bun-or-npm installs. For OpenCode, prefer its own `opencode upgrade` as the
command text.

**The daily check.** Run once at launch if the cache is older than 24 hours,
then check every 6 hours whether the cache has gone stale. A fixed 24 hour
interval from launch drifts, and the Mac may sleep. Use the same in-flight flag
as `updates.rs`. Check only installed engines, which is five GETs a day at most.
Cache `{version, checked_at_ms}` per engine in `preferences` under
`engine_latest:<id>`, with no migration. A failed check keeps the old cache.
`engine_update_checks = "off"` skips all requests, even a forced refresh. A
refresh button forces it. A request carries no headers beyond the defaults.

## 5. Shared machinery

- **`engine_status`** is shared with MCP vendor switching and Slice 5
  (`claude plugin`, `gh skill`). Everything here reuses `run_capture` and
  `resolve`, so the signature stays. `ENGINE_CLIS` should become the one table of
  "which program is this engine's", and Piece 8 (the in-app agent) needs the same
  lookup.
- **`OverviewCard`, `OverviewHost` and `get_engine_contexts`.** Slices 2 to 4 may
  also touch them. Add a sibling reply keyed on `engine_id` and do not widen
  `EngineContext`, which Slices 2 to 4 and `mcp_server` all read.
- **`mcp_server` (`list_engines`).** Adding version and sign-in there would give
  models a sanitised view. It is a possible extension and not part of this
  slice. It collides with MCP phase 2.
- **`AGENT_CONFIGS` and `brand-coverage.test.ts`.** A new `ENGINE_CLIS` table
  needs its own coverage assertion, and floors move with it.
- **Store schema.** No `user_version` change. The only new preference keys are
  `engine_update_checks` and `engine_latest:<id>`.
- **Telemetry `SCREENS`.** No change under option A.

## 6. Depends on and unblocks

It depends on nothing first. Antigravity as its own engine has landed. T20's
decision on whether it absorbs this piece only changes the order. It unblocks
Piece 8: an agent run needs to know the engine is installed and signed in. It
also unblocks Slice 5 (update and install need the same install-method
detection) and any "update available" Needs review wording.

## 7. Questions only Karthik can answer

1. **Where does status show?** (a) the card's engine section (my pick), (b) a
   Flyout detail, (c) a rail section. A is smallest. B is roomier.
2. **OpenCode's update source.** (a) `@opencode/cli` on npm (my pick, since it
   matches the installed package), (b) Homebrew, (c) none and "Not reported". It
   changes by install method. Is bun-global the install you care about?
3. **Apps in this slice?** (a) CLIs plus the three apps with usable feeds (VS
   Code, Zed, Warp) now, (b) CLIs only, apps later (my pick, because five of
   seven apps have no usable feed and the Info.plist version alone is a
   one-hour task).
4. **Sign-in "Not reported" for Gemini and Antigravity.** (a) Stay "Not reported"
   (my pick), (b) read Gemini's `security.auth.selectedType` from
   `settings.json`. That is a settings file, not a credential, but it reads a
   setting Hanger has promised to only display.

## 8. Size

About 8 tasks:

1. `ENGINE_CLIS` plus the `harness.md` premise.
2. `install_method` and `update_command`.
3. `parse_version` and `is_newer`.
4. Auth parsers for Claude, Codex and OpenCode, with the `--standalone` argv and
   timeout.
5. Latest-version check, cache, daily loop and the off preference.
6. Settings inspect and redact.
7. IPC and types.
8. Card section and findings, then the Finder-launch proof.

Human gates:

- a naming brief for the strings ("Sign-in", "Update available" and a Needs
  review category);
- one layout look at the card section;
- a Finder-launched build to prove PATH resolution (`verifying-ui.md`).

Not run: signed-in `claude auth status` (email shape unseen), Windows or Linux.
Risk: the plan's OpenCode package and `auth list` argv would both have shipped
wrong.
