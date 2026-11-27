# Round 43: the harness design, and what only you can decide

The [T20 harness design](2026-11-28-harness-design.md) is open beside this
round. It decides how the eight remaining pieces fit together:

- **Kept:** MCP phase 2, slice 2, slice 3 and T19. Phase B is kept too, and
  goes last.
- **Split:** slice 4 becomes Recent changes and profiles. Slice 5 becomes
  `gh skill`, the skill budget, and plugins.
- **Cut as a build:** slice 6, the gateway. It becomes a per-engine spike plus
  a line saying when a switch takes effect.

All eight plans would be written in parallel, then built in six worktrees at
once. One chain runs in order because it shares the switch code: slice 2, then
slice 3's add and remove, then profiles.

Eight researchers fed the design, and a fresh builder then checked it. These
are the 13 decisions it can't make for you. The most consequential come first.

:::question
Q1. May Hanger write one key in `~/.claude.json`, `projects[<path>].disabledMcpServers`, to switch a server off in one project? And how does Undo work, given that Claude Code keeps rewriting that file?

Today's Undo refuses once the file has changed since the write, and Claude Code rewrites this file all the time, so a whole-file Undo would almost always be refused.

- [ ] Yes, and Undo reverses just that key. It re-reads the file and takes the project back out of the list. This is a new kind of Undo in `apply`, and it survives Claude's own rewrites.
- [ ] Yes, with the whole-file Undo it has today, so Undo usually ends up refused
- [ ] No. Claude Code gets per-project state shown read-only, and slice 2 is Codex and Gemini CLI only

Recommended: Yes, and Undo reverses just that key
:::

:::question
Q2. May Hanger write files inside a repository? Codex's per-project switch lives in `.codex/config.toml`, and Gemini's in `.gemini/settings.json`. Both sit in the project folder, and teammates may share them through git.

- [ ] Only when the file isn't tracked by git. Otherwise Hanger shows why it can't switch there. Add and remove write at user scope by default.
- [ ] Yes, always, with a warning when the file is tracked
- [ ] Never. Slice 2 is Claude Code only (its key lives in your home folder), and add and remove are user scope only

Recommended: Only when the file isn't tracked by git
:::

:::question
Q3. May the add form take a secret typed in as plain text, such as an API key?

- [ ] No. The form takes a variable name in the engine's own spelling (`${GITHUB_TOKEN}`). For an engine that can't expand one, Hanger says to add the secret by hand.
- [ ] Yes, after a warning, and the file is flagged in Needs review

Recommended: No. The form takes a variable name. A typed value would cross from the window into the app, and Hanger's rules forbid that.
:::

:::question
Q4. May the scanner read env and header values while parsing, so it can flag plaintext secrets? It would keep only the key name and which pattern matched, and the secrets rule in `docs/scanning.md` §7 would be amended in the same commit.

- [ ] Yes, the value never leaves the parse step (this is mcpick's own check)
- [ ] No. Flag only a secret-looking key name whose value isn't a `${VAR}` reference

Recommended: Yes
:::

:::question
Q5. How do new writes roll out across engines?

- [ ] Proven engines first: Claude Code first in slice 2, and in slice 3 the four engines Hanger can already switch. The others follow one live check at a time.
- [ ] Every engine with a config file, all at once
- [ ] Claude Code only

Recommended: Proven engines first
:::

:::question
Q6. Writes made through a vendor CLI (`gh skill install` and `update`, `claude plugin` install, update, uninstall, enable and disable, and `marketplace add` and `remove`) can't be atomic, and Hanger can't copy what they change byte for byte. What does Undo mean for them? And does "never runs an update" apply to the engine CLIs only?

- [ ] Each writes a receipt that records the reverse command (uninstall, remove, disable) and shows in Recent changes. Undo runs that reverse command. "Never runs an update" covers the engine CLIs only, so skills and plugins update when you click.
- [ ] They're outside receipts and Undo, done with a confirmation only
- [ ] No updates at all, even for skills and plugins

Recommended: Each writes a receipt that records the reverse command
:::

:::question
Q7. Where does `gh skill install` put a skill?

- [ ] `--agent universal`, which puts it in `~/.agents/skills`, the one place Hanger's skill switch can switch it
- [ ] The engine's own folder, where the switch can only read it
- [ ] Ask each time

Recommended: `--agent universal`
:::

:::question
Q8. What does a profile cover, and what happens to servers it doesn't name?

If a profile covers the whole machine, it can be built now, alongside the other tracks. If it covers one project, it has to wait for slice 2 and lives on the repository view.

- [ ] The whole machine, servers only. On load, servers it doesn't name are left alone, and "turn everything else off" is a checkbox in the preview.
- [ ] Per project. Same handling of unnamed servers, and it waits for slice 2.
- [ ] The whole machine, and loading it always switches off the servers it doesn't name

Recommended: The whole machine, servers only, unnamed servers left alone
:::

:::question
Q9. What can Recent changes restore, and for how long?

- [ ] Any kept copy, behind a warning, and the restore can itself be undone. 20 copies per file, none deleted before 30 days. A file the engine keeps rewriting (`~/.claude.json`) can be undone but not restored from an old copy, because that would wipe the engine's own later changes.
- [ ] The last write only

Recommended: Any kept copy, except for files the engine keeps rewriting
:::

:::question
Q10. Which actions may a model ask for at all? Each one becomes a proposal you approve in Hanger's window. The list can grow later but not shrink.

- [ ] Switching on and off, Undo, add and remove (by Registry id or an existing entry), and loading a profile. Not restoring from an old copy, and not installing or updating skills or plugins, because those bring in code from the internet.
- [ ] Everything a person can do in the window, each as a proposal
- [ ] Switching on and off and Undo only, for now

Recommended: Switching on and off, Undo, add and remove, and loading a profile
:::

:::question
Q11. Where does phase B's Anthropic key come from when Hanger runs Claude for you?

- [ ] `ANTHROPIC_API_KEY` from your login shell's environment, read when the run starts and never stored. Your own `apiKeyHelper` is the fallback.
- [ ] The macOS Keychain

Recommended: Your shell's `ANTHROPIC_API_KEY`, never stored
:::

:::question
Q12. After the spike, what would justify building the gateway shim that switches servers in the middle of a session?

- [ ] Claude Code and at least one other engine drop a removed tool mid-session
- [ ] Any three engines do
- [ ] Claude Code alone does

Recommended: Claude Code and at least one other engine
:::

:::question
Q13. Do you approve the design, with its plan: all eight plans written and gated in parallel, six build tracks at once, and one chain in order (slice 2, then slice 3's add and remove, then profiles)?

- [ ] Approve. The eight plans get written in parallel next, each with a fresh `stage-gate --plan`.
- [ ] Approve, but run all eight build tracks at once regardless, and merge the overlaps by hand
- [ ] Needs changes. Say what in a note on the design.

Recommended: Approve
:::

## Answers (Karthik, 2026-11-28)

All 13 took the recommendation. They are recorded as binding in the design's "Answers" section. Q8 takes profiles (4b) off the serial chain.
