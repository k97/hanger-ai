# stage-gate --plan: slice 5, skills and plugins (P5)

- **Artifact:** `docs/plans/2026-11-28-slice5-skills-plugins-plan.md`, as committed in `8149550`, gated on `main` at `0bdb4b0`
- **Spec:** `docs/plans/2026-11-28-harness-design.md` (§4.5, §5, §7, round 43 Answers, Q6, Q7 and Q10 in particular)
- **Also read:** `docs/plans/research/2026-11-28-slice5-skills-plugins.md`, `docs/plans/research/2026-11-28-plan-brief.md`, and the sibling plans P1 (`mcp-phase2`), P4 (`slice4-recent-profiles`, `70ed205`) and P7 (`t19-engine-status`)
- **Reviewer:** independent (fresh reviewer, not the plan's author)

## Per-step table

| Step | Traceable to request? | Verifiable? | Notes |
|---|---|---|---|
| 1 `install_slot` + pinned signatures | Yes: §5 says slice 5 owns `skill_switch` and lands first | Yes: red compile error, then green, plus a planted-signature proof in a worktree | Signatures match `main` (`set_enabled_for`, `undo_for`, `switch_info_for`). `is_store_name` already refuses `""`, `/`, `.`, `..` and leading `.`. Adding `-x` is new. |
| 2 `vendor_cli` core, `gh skill` read side | Yes: §4.5 5a | Yes: fakes plus captured fixtures. The search fixture is gated on Karthik's file. | `run_capture` and `resolve_in`/`search_path` match `main` (envs are added to the inherited environment, and stderr is discarded). |
| 3 install and update | Yes: 5a, Q7 | Yes | Assumes the folder `gh` creates is named after the `skill` argument. Task 9 is the first place that gets checked. |
| 4 receipts and Undo | Yes: Q6 | Yes at fixture level, **but it waits on an interface nobody owns** (Finding 1) | `update` reverse depends on an unverified `@<version>` form (Finding 5) |
| 5 commands + Q10 guard | Yes: Q10 | Yes: planted import proves it fires | The guard is a substring denylist (Finding 6) |
| 6 naming brief + Q6 contradictions | Yes: `ui-copy.md`, design §7 | Yes: Plannotator file is the artefact | Runs after Tasks 3 and 4 have already built the contested reverses (Findings 2 and 3) |
| 7 layout options, skill surface | Yes | Yes: recorded pick | — |
| 8 5a webview | Yes | Partly: "frames of every status state" can't all be produced (Finding 8) | — |
| 9 live `gh skill install` + Undo | Yes: design §7 | Yes: folder, frontmatter, receipt, store counts, screenshot | Update Undo may stay fixture-only. The plan says so. |
| 10 H1 live session | Yes: §4.5 5b | Yes: transcript grep | It doesn't probe the aggregate listing budget (Finding 4) |
| 11 listing rules | Yes: 5b | Yes | Rules incomplete (Finding 4) |
| 12 `get_skill_budgets` | Yes: 5b | Yes | `AssetAnnotation` has no category field (Finding 7). The sum ignores the aggregate budget (Finding 4). |
| 13 card Skills figure | Yes: §5 card row, after the combined round | Yes: red Vitest, then screenshot | Correctly waits on T19 and the layout round |
| 14 `claude plugin` read side | Yes: 5c | Yes: captured fixtures | Correctly waits on P7. P7's plan names the lookup `cli_for("claude-code")`. |
| 15 plugin and marketplace writes | Yes: 5c, Q2, Q6 | Yes | Waits on Finding 1 and on Q6(b) |
| 16 layout options, Plugins pane | Yes | Yes | — |
| 17 Plugins pane | Yes | Yes plus screenshots | — |
| 18 close | Yes | Yes: four pinned gates, counts, `--dev` | — |

## Findings

### Blocking

1. **No plan owns the vendor-CLI receipt, and the two plans that name it disagree on its shape.** P5's Cross-plan interfaces names **P4** as owner of `CommandReceipt { id, at_ms, what, program: ReverseProgram, reverse_args }`, with `apply::record_command`, `apply::load_command` and `apply::command_receipts_dir`. P4's plan (`70ed205`, Cross-plan interfaces) says the opposite: "Design §5 names no owner; whichever lands first owns the shape". It assumes `VendorReceipt { id, at_ms, tool, engine_id, what, reverse_argv }` in `<data>/vendor/receipts/`, with `vendor_receipts(dir)`, and marks its Task 9 as "Waiting on P3/P5". So P5 Task 4 waits on P4, and P4 Task 9 waits on P5. That's a deadlock with two incompatible shapes. Design §5 has no row for this machinery. P5 also defines the shape in full (including `ReverseProgram::SkillSwitch`, which only P5 needs) while saying it doesn't define it. This is an interface it uses but doesn't own, and the owner it names hasn't accepted it. Someone has to rule on an owner, and that owner has to land the type first.
2. **Q6 contradiction (a): the reverse of an install is not a command.** Q6 is binding: "a receipt holding the reverse command … Undo runs that command." `gh skill` has no uninstall, so the plan makes the reverse a skill switch-off into Hanger's keep (`ReverseProgram::SkillSwitch`). That's a reasonable answer, but it departs from a binding ruling. Task 4 builds it before Task 6 asks the question, so a different ruling means rework. It has to be ruled before Task 4, not in Task 6.
3. **Q6 contradiction (b): plugin update without an Undo.** `claude plugin update` has no way back, so the plan records an empty reverse. That breaks "Undo runs that command" for one write Q6 explicitly put in scope ("skills and plugins update on click"). Task 15 can't be written to a final shape until this is ruled.
4. **The 5b budget leaves out Claude Code's aggregate listing budget, so the "honest" figure over-counts.** The research file says its read of code.claude.com/docs/en/skills stopped at 100k of 121k characters and that "the 'descriptions are cut short' section was truncated". This reviewer read the remaining part (WebFetch, offset 100000, 2026-11-28). It says:

   > "if you have many skills, Claude Code drops some descriptions to fit the listing's character budget … The budget scales at 1% of the model's context window. When the listing overflows, Claude Code drops descriptions starting with the skills you invoke least."

   It also says the budget can be changed with `skillListingBudgetFraction` and `SLASH_COMMAND_TOOL_CHAR_BUDGET`, and the 1,536 cap with `skillListingMaxDescChars`. `listing_bytes` and `claude_budget` sum every reached skill with a fixed 1,536 cap and read only `skillOverrides`. On a machine with many skills (this store holds 574 `skill|global` rows), that is well above what the model receives. That is the over-count 5b exists to remove. Karthik needs to say what the card's Skills figure means: the listing after the budget (needs the model's context window and invocation-order data Hanger doesn't have), the uncapped demand with a "capped by Claude Code" note, or "Not measured" until it can be computed. Tasks 10 to 12 depend on the answer. H1 should also gain a many-skills overflow probe, and `/doctor` or `/context` output is a better artefact than a transcript grep for this.

### Non-blocking

5. **The update's reverse `<name>@<previous_version>` is untested against the producer.** Task 2 Step 1 captures `list` after a `--from-local` install, which carries no GitHub `version`. So `update_records_the_reinstall_at_the_previous_version` has to invent the fixture value. That's a fixture built from the type, not from the producer (`verification.md`). Nothing shows that `list`'s `version` (tag or tree SHA) is a value `install …@<v>` accepts, or that a versioned reinstall leaves `pinned` unchanged. Task 9 Step 4 may never exercise it. Say so in the test's comment and in the Task 9 report, or capture one remote-install `list` row first.
6. **The Q10 guard only matches the text `vendor_cli`.** A call from `mcp_server/` to a `lib.rs` wrapper (`install_gh_skill`, `change_claude_plugin`) or through a re-export passes it. That is the "guard defeated by a rename" shape in memory. Add the command and function names to the denylist, or assert on `use crate::` paths reaching `vendor_cli` through `lib.rs`. The guard also reads P1's directory (P1 owns `mcp_server/`), so tell P1 it exists.
7. **`AssetAnnotation` has no category field.** On `main` it is `{ asset_path, mechanism, reach, beyond }` (`annotations.rs`). Task 12's "rows of category `skill`" needs a join back to `assets` by path. `asset_annotations_on` also reads only `engine_global` roots. That's right for a user-level figure, so say it. A skill's `abs_path` is its folder, not its `SKILL.md` (store read: `~/.agents/skills/simplify`).
8. **Task 8 Step 5 asks for "frames of every status state" from a throwaway-HOME dev run.** `NotSignedIn` is reachable that way. `NotInstalled` isn't reliably reachable, because `search_path` falls back to a widened PATH that likely still holds `/opt/homebrew/bin`. `NoSkillCommand` would need an older `gh`. Name the reachable states and route the rest to Vitest, as `verification.md` asks.
9. **Undo's argument re-check is underspecified.** It reads "each arg re-checked with `safe_arg`, apart from the `--` flags Hanger itself wrote". Receipts are files on disk, so Undo can't tell which flags Hanger wrote. Use a fixed allowlist of flags per program and verb.
10. **`docs/ipc.md` numbering collides.** P5 claims entries 25 to 35, and P4 claims 25 to 33. Use "the next free number at commit time", as P7 does.
11. **Shared files committed by path.** Tasks 2, 5, 12 and 14 to 15 pass `src-tauri/src/lib.rs`, `docs/ipc.md` and `README.md` by path. That's safe in Track K's own worktree and unsafe in the shared checkout. The Global Constraint names only `App.tsx`. Say which hazard applies (`shared-checkout.md`).
12. **The two skill figures will disagree.** The inspector's per-skill "always on" figure (`lib.rs` → `always_on_bytes`) stays uncapped, and the card's sum is capped. The plan leaves this out on purpose. The copy brief in Task 6 should name the difference.
13. **One H1 sub-question is already answered by the docs.** The docs say `skillOverrides` "matches entries against skill names only", and a skill's name is its frontmatter `name`, defaulting to the folder. H1 can still confirm it.

### Cross-plan interface check against design §5

- `skill_switch`: P5 owns it and lands it first (Task 1). Consistent with §5.
- `engine_status`: consumed unchanged (`run_capture`, `resolve_in`, `search_path` match `main`). `claude` is resolved through P7's `ENGINE_CLIS`, and P7's plan agrees: `cli_for("claude-code")`, with `gh` resolved directly. Consistent.
- Overview card: consumed after T19's combined round (Task 13). Consistent.
- `Ask` (P1): not extended. Consistent with Q10.
- **Defined but not owned:** the vendor-CLI receipt type and its file store, placed in P4's `apply` (Finding 1). Also the Q10 guard over P1's `mcp_server/` directory (Finding 6, needs a note to P1).

### Unchecked by this reviewer

- `claude plugin uninstall --keep-data`, `--prune` and `--json` on enable and disable, and `marketplace remove --scope user`, weren't checked against `--help`. A throwaway-HOME run was refused by the permission system. Task 14 Step 1's fixture capture settles them.
- Whether `gh skill --help` exits non-zero on a `gh` that has no `skill` command.

## Verdict

**Needs answers**

1. Who owns the vendor-CLI receipt type and store? P5 names P4, and P4 names "P3/P5, whoever lands first", with a different shape. Neither can start Task 4 or Task 9 until this is ruled.
2. Is a skill switch-off into Hanger's keep acceptable as the "reverse command" for `gh skill install`, given that `gh skill` has no uninstall? (Q6)
3. Does `claude plugin update` ship without an Undo, or is it left out until it can have one? (Q6)
4. Claude Code caps the whole skill listing at 1% of the context window and drops the least-used descriptions. What should the card's Skills figure show: the capped listing, the uncapped demand with a note, or "Not measured"?
