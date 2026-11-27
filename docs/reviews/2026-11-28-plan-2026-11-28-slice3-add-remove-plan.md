# stage-gate --plan: slice 3, add, remove, Registry and two findings (P3)

- **Artifact:** `docs/plans/2026-11-28-slice3-add-remove-plan.md`, read from disk at `c5348be` (unchanged through `dd77fe0`, the tip when this report was written)
- **Spec:** `docs/plans/2026-11-28-harness-design.md` §4.3, §5, §7 and the round-43 Answers (binding)
- **Also read:** `docs/plans/research/2026-11-28-slice3-add-remove-registry.md`, `docs/plans/research/2026-11-28-plan-brief.md`, `docs/plans/2026-11-28-mcp-phase2-plan.md` (P1, `310017f`), `docs/plans/2026-11-28-slice2-per-project-plan.md` (P2, committed `8042433` during this review), `docs/plans/2026-11-28-slice4-recent-profiles-plan.md` (P4, `70ed205`), `docs/plans/2026-11-28-slice5-skills-plugins-plan.md` (P5, `8149550`)
- **Reviewer:** independent (fresh reviewer agent, not the plan's author)

## Per-step table

| Step | Traceable to request? | Verifiable? | Notes |
|---|---|---|---|
| 1 Baseline counts, `NewServer` | Yes, §4.3, Q3, shared-asset rule | Yes, red/green named | Also narrows Q3 to "no literals at all" (Finding B2) |
| 2 `render` per engine | Yes, Q3, Q5 | Yes | |
| 3 `edit::entries` add/remove | Yes, §4.3, §5 (slice 3 owns entries) | Yes, byte-identity round trips | `pub mod entries;` in P2's `edit.rs`; P2 says its Task 3 lands the `pub mod` lines, so agree who adds this one |
| 4 `from_entry` (copy source) | Yes, Q10 "an existing entry" | Yes | URL not checked (Finding R2) |
| 5 Secret detector | Yes, Q4, §4.3 | Yes, plus a planted mutation | mcpick's 26 cases and `225b5a2` not checked here |
| 6 Unpinned detector | Yes, §4.3 list | Yes, table-driven | |
| 7 Registry client | Yes, §4.3 rules | Yes, TcpListener stub | Name-from-registry-name rule unstated (N4) |
| 8 G-N naming brief | Yes, ui-copy.md, §7 | Human gate, artefact = his sign-off | Separate file vs §7's "one batched brief" (N7) |
| 9 Findings at parse, §7 amended | Yes, Q4 | Yes, plus counts re-capture | Won't compile as specified (Finding R1) |
| 10 Needs review kinds | Yes, §4.3 | Yes, vitest + screenshot | Frontend tally vs "counts from the backend" (N2) |
| 11 Claude add/remove via `vendor` | Yes, §4.3, Q6 | Yes | Receipt shape conflicts with P4/P5 (Finding B1) |
| 12 `ops` add/remove/copy, `ENTRY_WRITES` | Yes, §5 spine, Q5 | Yes | Guard commit split contradicts §5 (N1) |
| 13 Commands, IPC | Yes | Yes, four gates | |
| 14 G-L layout | Yes, §7 | Human gate | |
| 15 Form, Registry results, Copy, Remove | Yes | Yes, component tests + screenshot | |
| 16 G-V live check ×4 | Yes, Q5 | Yes, artefacts named per round | |
| 17 Repo scope, untracked only | Yes, Q2 | Yes, plus a live check | Claude Code repo scope excluded on an incomplete reason (N5); P2 names differ (R3) |
| 18 Model verbs in `Ask` | Yes, Q10 | Yes, plus a live check | P1 names wrong (R4) |
| 19 Close | Yes | Yes, counts and four gates | |

## Findings

### Blocking (need Karthik or a cross-plan owner)

**B1. Q6's vendor-CLI receipt has three incompatible shapes across P3, P4 and P5, and P3's doesn't hold the reverse command.** Q6 is binding: "A vendor-CLI write records a receipt holding the reverse command, shows in Recent changes, and Undo runs that command."
- P3 (Task 11) lands `ClaudeChange` at `<stash>/claude-code/changes/<uuid>.json`, holding `{id, name, action, at_ms, entry?}`. Its Undo ids are `added:`/`removed:` through `undo_mcp_switch`, and its table claims "4a consumes from this plan".
- P4 (committed `70ed205`, Cross-plan row "Vendor-CLI receipts") assumes `VendorReceipt { …, reverse_argv }` at `<data>/vendor/receipts/`, `vendor_receipts(dir)` and `undo_vendor_change`. It says "Design §5 names no owner; whichever lands first owns the shape", and it never mentions `claude_changes`.
- P5 (`8149550`) assumes P4 owns `apply::CommandReceipt { …, program, reverse_args }`, `record_command` and `load_command`.

§5 gives `vendor` to P3 and `apply` to 4a, but neither owns the receipt type. Task 11 lands an on-disk format other plans read, so this has to be settled before Task 11. Keep one constraint whichever shape wins: a Claude remove's reverse (`add-json`) needs the removed entry, and that can hold a credential. P3 keeps it inside the stash folder, which is one of the anti-goal's two named places. A shared receipt must keep it there, never in `reverse_argv`.

**B2. P3 narrows Q3 on its own authority.** Q3 forbids a literal *secret*. P3's "Decision here" forbids every literal env or header value. `deny_unknown_fields` on `EnvRef`/`HeaderRef`, and `from_entry` refuses `{"env":{"LOG_LEVEL":"debug"}}` with `SourceHasValues`. So neither a person nor a model (Q10, "by … an existing entry") can copy any entry that has a non-secret literal. The plan states this openly, which is good, but `coding-guardrails.md` says "scaling it down is Karthik's call". Task 1 lands the `NewServer` shape that other plans build on, so he needs to confirm it first.

### Required fixes (no question, fix in the plan before build)

**R1. Task 9 won't compile as specified.** `domain.rs` → `Tool` derives `Serialize, Deserialize`. But the plan's `ConfigFinding` derives `Serialize` only, and its `pattern` is a `&'static str`, as is `Check`'s. A `findings: Vec<ConfigFinding>` field on `Tool` then fails the `Deserialize` derive. Use `pattern: String` with `Deserialize` on both types, or `#[serde(skip_deserializing, default)]` on `Tool.findings`, and state which in "Interfaces this plan owns".

**R2. `from_entry` doesn't check a copy source's URL.** Task 4 Step 3 calls `secret_findings(launch_pairs(args, None))`, and `redact_launch(command, args)` sees no URL either. So a source with `https://x/mcp?api_key=…` or `https://user:pass@host/…` is copied literally into another engine's file and into Task 18's add preview. That contradicts the Global Constraint "Secrets never … reach a preview" and Task 18's "They can hold no value". Pass the URL, refuse userinfo, and add a test case for each. Then state whether the add preview also applies P1's withheld rule.

**R3. P2's names are now committed (`8042433`) and differ from the table.** This is provisional, as the dispatch says, but the plan can be corrected now:
- P2's type is `Target<'a> { Machine { key }, InProject { project: &'a KnownProject, key } }`.
- The tracked-file refusal is `ReadOnlyReason::RepoFileTracked`, raised inside `ops` through `run_capture(git ls-files …)`. It also covers "couldn't ask git".
- There is no `ops::git_tracks` and no `repo_key: String`. The project travels as a `project` argument resolved to `KnownProject`.
- P2 confirms P3 adds the `NewEntry` variant and no field to the existing variants.

**R4. P1's names are wrong in the Cross-plan table, and P1 is already committed (`310017f`).** P1 has no `Preview { …, changed_lines }`. Its `Preview` carries `change: Change`, with variants `Lines { lines }`, `Command { argv }`, `Withheld`, `MoveSkill`, `Nothing` and `Unavailable { code }`, plus `to: ItemState` and `PreviewTarget::Server { engine_id, engine_name, config_path }`. Its brief is "Gate N", not a "G1-style brief". Task 18 should also say what `to` is for a remove, and resolve `from_key` the way P1 resolves public ids (`public_key`, exactly one match).

### Non-blocking

- **N1.** Task 12 Step 5 puts the `ENTRY_WRITES` coverage assertion and floor in a separate `test(guard)` commit. Design §5 says tables keyed to `HOSTS` get them "in the same commit", and `shared-asset-machinery.md` says the same.
- **N2.** Task 10 adds `counts.secret` and `counts.unpinned` to `deriveReviewIssues`, a frontend tally. The Global Constraints say "Counts come from the backend". The design blesses the mapping (§4.3, "as it maps drift today"), so name this as the existing exception rather than leave the two statements in conflict.
- **N3.** Task 11 Step 3 says "the `README` and `docs/ipc.md` text 'Hanger never writes `.claude.json`' stays true". That sentence is only in `vendor.rs`'s module doc; a grep of `README.md` and `docs/ipc.md` finds it in neither. P2, under Q1, will make it false anyway. Coordinate the wording rather than assert it.
- **N4.** The rule that turns a Registry name into a server name (`io.github.example/weather` → `weather`) is unstated, and so is what happens when two Registry names share a last segment.
- **N5.** Claude Code repository scope is excluded because "`run_capture` takes no working directory". But a repo's `.mcp.json` is a plain `McpServers` file. The real reason is the vendor-CLI ruling (`claude mcp … --scope project`). Say that, and list it in Out of scope for Karthik to see.
- **N6.** Task 11 "waits on P2's merge", but its tests are vendor-only and need no `ops`. It could run in wave 1.
- **N7.** Task 8 writes its own brief file, while design §7 and P1 describe one batched brief. Agree where the batch lives.
- **N8.** Task 12's "creates a missing Gemini settings file" doesn't say what happens when `~/.gemini/` itself is missing. `apply` has `NO_FOLDER` for that case.

## Spot-checks against `main`

All of these hold:
- **Literal counts:** 19 `McpServer {` literals across 6 files, and 9 `Tool {` literals in the files named.
- **Dependencies:** `regex` 1.13.2 is in `Cargo.lock` and absent from `Cargo.toml`; `reqwest` is 0.12.
- **`apply`:** `safe_replace`, `undo`, `latest_receipts` and `Format::{Jsonc, StrictJson, Toml}` exist.
- **`edit.rs`:** the private `JSONC`, `parse_json`, `props_named`, `last_prop`, `parse_toml`, `toml_text` and `format_of` exist and are reachable from a child module.
- **`vendor`:**
  - `is_refused`, `comes_back`, `read_entry`, `keep`, `Scratch` and the "The pre-flight" doc section all exist.
  - `claude_stashed` reads only top-level `*.json`, so a `changes/` folder is skipped.
  - `SwitchError` has `WouldNotComeBack` and `AlreadyThere`.
- **`dialect`:** `server_from_json` reads only `url`, and Codex is read under both `mcp_servers` and `tools`.
- **Registry and paths:**
  - `HOSTS` has 17 entries by bounded grep.
  - `SWITCHES` has 4 rows.
  - `discover::home_base_for` is private, as the plan says.
- **Other symbols:** `redact_launch(command, args)` and `run_capture` exist.
- **Inventory:** it reaches the webview from the scan itself (`get_inventory` → `run_scan`, `scan://complete`), so findings can ride on the in-memory `Tool` without a schema change.
- **SHAs:** `e673e20` resolves.

Not checked:
- mcpick's case count and commit `225b5a2`;
- the Registry API's behaviour;
- each engine CLI's behaviour (Task 16 covers those).

## Verdict

**Needs answers**

1. Q6's receipt: which plan owns the vendor-CLI receipt type, and which shape does P3's Claude add and remove write? Today P3's `ClaudeChange`, P4's `VendorReceipt` and P5's `apply::CommandReceipt` disagree, and P3's holds no reverse command.
2. Q3: confirm the narrowing. `NewServer` carries no literal value of any kind, so an entry with a non-secret literal (`LOG_LEVEL=debug`) can't be copied by a person or a model. Or allow non-secret literals that the detector passes.
