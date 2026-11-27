# stage-gate --plan: T19 engine status

- **Artifact:** `docs/plans/2026-11-28-t19-engine-status-plan.md`, as committed in `0bccfbc` (unchanged at `c5348be`, the tree reviewed)
- **Spec:** `docs/plans/2026-11-28-harness-design.md` (§4.7, §5, §7, and the binding round-43 Answers); research `docs/plans/research/2026-11-28-t19-engine-status.md`; brief `docs/plans/research/2026-11-28-plan-brief.md`; rulings `memory/hanger-tool-manager-direction.md`
- **Reviewer:** independent (fresh reviewer, read-only on code)

## Per-step table

| Step | Traceable to request? | Verifiable? | Notes |
|---|---|---|---|
| T1 `ENGINE_CLIS`, `version` | Yes: §4.7, §5 owner row | Yes: 6 named tests with values, red compile error named | Step 7's plant cannot prove the new subset assertion (F3). Antigravity's settings path is unsourced (F7). |
| T2 install method, channel, update command | Yes: §4.7 | Yes: 4 named tests | Homebrew node formulae classify as `Npm` (F2). The Homebrew fixtures are invented, not measured; this machine has no Homebrew install of any of the five. |
| T3 G1 naming brief | Yes: `ui-copy.md`, §7 batched round | Yes: the artefact is signed-off strings in the file | The state list is missing "update available, no command known" (F9). |
| T4 G2 combined card layout round | Yes: §5 overview-card row, §7 | Yes: the ruling file, HTML and PNGs | Sound. It surfaces disagreement 7 (no MCP server, no card row) to Karthik. |
| T5 sign-in parsers | Yes: direction note (auth) | Yes: 7 named tests, incl. the redaction assertions | Sound. Exit-status-independence is pinned. |
| T6 settings inspect | Yes: direction note (settings), narrowed per option A | Yes: 5 named tests | Sound. |
| T7 daily npm check, cache, off switch | Yes: direction note (updates), Addendum | Yes: 8 tests against a local stub, request counts asserted | npm-only departure accepted (see Departures). The doc departure is not (F4). |
| T8 `gather`, `get_engine_status`, types, fixture | Yes: §4.7 ("beside `get_engine_contexts`") | Yes: 7 tests, producer-captured fixture, README regen red then green | "One stuck CLI costs one timeout" is two timeouts per row: version and auth run in sequence (F10). |
| T9 Status rows on the card | Yes: §4.7, option A | Yes: named tests, a screenshot for placement | The commit instruction contradicts `shared-checkout.md` (F1). |
| T10 two findings | Yes: direction note (Needs review) | Yes: named tests, incl. the "no `engines` → today's result" case | Co-edits `reviewIssues.ts` with P3, and neither plan names the other (F5). App.tsx commit as F1. |
| T11 G3 Finder-launched live check | Yes: §7 ("S on a Finder-launched build") | Yes: frames plus store reads before and after | Sound. Per-kind counts captured before and after. |

## Findings

### Blocking

**F1. Task 9 Step 6 tells the builder to stage `App.tsx` by hunk and then commit with explicit paths.** `shared-checkout.md` says exactly that is backwards: `git commit -- <path>` re-adds the whole working-tree file, discards the hunk staging, and sweeps the peer's uncommitted edits into the commit. On 2026-08-27 this broke the branch tip. The Global Constraints commit rule (`git commit -m "…" -- <paths>`) carries the same hazard for Tasks 9 and 10, both of which touch `App.tsx`, where a peer holds uncommitted edits today (`git status`: ` M src/App.tsx`). Fix: for any commit that includes `App.tsx`, stage it as an exact blob (`git hash-object -w` + `git update-index --cacheinfo`), stage the other paths with `git add`, check `git diff --cached --name-only`, then run a bare `git commit` with no paths. Afterwards, build the commit in a detached worktree and run vitest. Explicit paths stay right only for commits that touch no shared file.

**F2. Homebrew node formulae will be classified `Npm` and offered the wrong command.** `install_method` checks `/lib/node_modules/` before `Cellar`/`Caskroom`. Homebrew installs a node formula (gemini-cli is one) under `Cellar/<name>/<ver>/libexec/lib/node_modules/…`, and `bin/<name>` symlinks into it, so the canonicalised path matches `Npm` first. The card would then show `npm install -g @google/gemini-cli@latest`, which installs a second copy instead of upgrading the one in use. The test fixture (`<tmp>/usr/local/Cellar/gemini-cli/0.56.0/bin/gemini` as a plain file) is not the real layout, so the test cannot see this. Fix: check `Cellar`/`Caskroom` before `node_modules`, and give the fixture the real shape, a symlink into `libexec/lib/node_modules/…`. Stated as reasoning from Homebrew's formula convention, not measured: no Homebrew install of these CLIs exists on this machine.

**F3. Task 1 Step 7's plant cannot fail the assertion it claims to prove.** The plan adds `ENGINE_CLIS` as a source in `backendEngineIds()`, and `"not-an-engine"` has no brand mark. So the existing "every engine or host id … resolves to a brand mark" test fails on that plant whether or not the new AGENT_CONFIGS-subset assertion exists. The expected "FAIL naming `not-an-engine`" is met either way, which is what `verification.md` calls a control that asserts nothing. Fix: plant an id that has a brand mark and is not an `AGENT_CONFIGS` id, such as `"cursor"` or `"windsurf"` (HOSTS ids). Then only the new assertion can go red. The floor plant (delete a row) is fine.

### Departures from the design, judged

**npm only, not "npm and GitHub": accepted.** The Addendum's "npm and GitHub" is design prose, not a round-43 Answer, so it doesn't bind against measurement. All four rows with a source resolve on npm dist-tags (measured). Codex's GitHub release only agreed with npm. GitHub's API refuses a request without a `User-Agent`, and the research ruled out extra headers. Dropping it removes a second outbound host with no loss. The plan flags it for Karthik ("Fix this if Karthik rules otherwise"). One assumption should be written down (see F6).

**`docs/ipc.md` instead of `docs/telemetry.md`: not accepted as reasoned.** The plan's reason is that `telemetry.md` lists no outbound calls, the updater's `latest.json` included. That gap already exists and is no reason to widen it. `telemetry.md` is titled "Telemetry & Privacy Documentation", and it is where anyone asking "what does Hanger send off the machine" will look. `ipc.md` is the webview↔backend contract. The design's Addendum says the call is "named in the T19 plan's telemetry notes", and the plan has no such section. This is a default-on daily request. Recommended: a short "Other outbound requests" paragraph in `telemetry.md`, naming the npm dist-tags GET, its cadence, what it carries (no headers beyond reqwest's defaults; the npm registry sees the IP address) and the off preference. Keep the `ipc.md` entry as well. This is a one-paragraph doc change; it blocks only if Karthik wants it ruled rather than done.

### Non-blocking

- **F4.** See the ipc.md/telemetry.md judgment above.
- **F5. `src/utils/reviewIssues.ts` has two editors and no owner in §5.** P3 adds `IssueKind` `"secret" | "unpinned"` and `ReviewCounts` fields, and edits `NeedsReviewPane` and `ReviewSidebar`. T19 adds `"signed_out" | "settings_unreadable"`, a new `IssueCategory`, and edits the same two components. Neither plan names the other. The edits are additive, but `LEGEND`, the aria label and the counts initialiser will conflict at merge. Name P3 under Cross-plan interfaces and agree an order (or let whichever merges second rebase).
- **F6. Unstated assumption: npm's tag is the right comparison for every install method.** For a Homebrew install, npm can lead the formula (the research measured OpenCode: brew 2.4.1, npm 2.4.2). The badge would then offer `brew upgrade <name>`, which does nothing until the formula catches up. State it, and add a `shortcut:` comment or suppress the badge for `Homebrew` until a brew source exists.
- **F7. Antigravity's settings file `.gemini/config/config.json` has no cited source.** It does exist on this machine (existence checked, not read), but the plan should cite where it comes from, as it does for every other row. `AGENT_CONFIGS` gives the root `.gemini/config`, and `registry.rs` names only `mcp_config.json` there.
- **F8. Cross-plan names, P5 and P8.**
  - P5 assumes `ENGINE_CLIS` names the `claude` binary for `"claude-code"`, and `run_capture` frozen. Both match: `cli_for("claude-code").bin`. P5 does not consume `engine_status::install`, though T19 says it does. The overclaim is harmless, but drop it or confirm with P5.
  - P8 assumes the `ENGINE_CLIS` lookup, `parse_version` plus "the version comparison" (`is_newer` serves), and "Claude's sign-in reading (`loggedIn`, `authMethod`)" as a Rust call. T19's list offers P8 only `EngineStatus.auth` over IPC. Add `engine_status::auth::{parse_auth, AuthState}` and `AuthProbe::ClaudeJson` to "Owned here" for P8.
  - Note for P8: which `authMethod` value means "subscription" is unmeasured, because the signed-in shape has never been seen.
- **F9.** `update_available` can be true while `update_command` is `None` (`Other` install method, Codex installed by hand). G1's state list has no string for "an update exists, no command known". Add it.
- **F10.** `gather` runs version and auth in sequence per row, so one hung CLI costs up to two timeouts (10 s), not one. The test (`sleep 30`, 1 s timeout, under 3 s) passes because it allows 2 s. Fix the claim, or run the two commands concurrently.
- **F11. Owner-table wording.** Design §5 puts `get_engine_contexts` in T19's overview-card row. The plan names P2 as its owner, through `mcp::switch::context`. T19 changes neither, so nothing breaks, but the plan's "Consumed" line should say the design lists it under T19's card row and that T19 leaves it untouched.
- **F12. Secret hygiene wording.** `claude_channel` reads `~/.claude/settings.json` into a `String`, and that file can carry `env` values (keys). Deserialising one field still reads every byte into memory. The scanner already does the same with MCP configs, so this is no new exposure. But the Global Constraints say "No secret … is read". Say instead that the file is read to a string, one field is kept, and the rest is dropped unlogged.
- `RepoPane` also renders `OverviewCard`, in `engineCounts` mode. Task 9 doesn't list it. The new props are optional, so nothing breaks; Task 4 already draws that state.
- The `get_engine_status` force path bypasses `spawn_daily`'s in-flight flag, so it can duplicate a request in the background loop. This is harmless and needs at most a comment.

## Spot-checks against `main` (`c5348be`), all as the plan states

- `engine_status/` holds only `mod.rs`, `resolve.rs` and `run.rs`, and the header says the table, install methods, update commands and version parsing "are not built".
- `run_capture(program, args, stdin, envs, timeout) -> Option<Captured { ok, stdout }>`. `engine_status_tests.rs` calls it with all five arguments. Its callers are `vendor.rs` (3) and `resolve.rs` (1).
- `resolve::search_path` (async) and `resolve_in(bin, path)`.
- `agents::engine_base` maps child paths such as `.claude/settings.json` through `CLAUDE_CONFIG_DIR`/`CODEX_HOME`.
- `AGENT_CONFIGS` order puts `claude-code`, `codex`, `gemini` and `antigravity` before `opencode`, and has 12 ids. The names are "Codex" and "Antigravity CLI".
- `contexts_for` builds the engine list from registrations, which confirms disagreement 7.
- `get_engine_contexts` is `#[tauri::command(async)]` at the place named. `updates::spawn_background_checks(handle.clone())` is in `setup`, and `updates.rs` holds the in-flight-flag pattern.
- `PreferencesStore { db_path }` is `Send + Sync`, so holding it across an await is fine. `get_preference`/`set_preference` exist. `STORE_VERSION = 8`.
- `scanner::get_home_dir` is `pub(crate)`.
- reqwest 0.12 is present with default features, and tokio has `full`.
- `OverviewCard` has `w-[280px]`, `EngineSection` and `engineCounts`. Its callers are `ProfilePane`, `RepoPane` and `DesignSystemPane`.
- `openInEditor(path, editorName)`. `refreshEngineContexts` runs on mount (`onlyIfEmpty`) and after scan completion. `EditorSetting` is in `App.tsx`.
- `deriveReviewIssues(inventory)`. `IssueKind` and `IssueCategory` are as quoted. The file header holds the loop-counting rule.
- `docs/ipc.md` entry 20 is `get_engine_contexts`, and 24 is the last entry. `telemetry.md` lists Sentry, GA4 and PostHog only, so the plan's claim is true.
- Every guard and test file the plan names exists. `src/__tests__/fixtures/` does not exist yet, and the plan creates it.
- The settings paths for all five rows exist on this machine (names only, nothing read).

## Verdict

**Needs answers.** These block, in order:

1. F1: Rewrite the commit rule for every commit that includes `App.tsx` (Tasks 9, 10): exact-blob staging, then a bare `git commit`, never `git commit -- <paths>`.
2. F2: Order `install_method` so `Cellar`/`Caskroom` win over `/lib/node_modules/`, and give the Homebrew fixture the real `libexec/lib/node_modules` symlink shape.
3. F3: Plant a branded non-`AGENT_CONFIGS` id (for example `"cursor"`) in Task 1 Step 7, so only the new subset assertion can fail.
4. Departure 2: Add a paragraph naming the npm request to `docs/telemetry.md`, or have Karthik rule that `ipc.md` alone is enough.
