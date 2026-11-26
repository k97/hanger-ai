# Round 10: a switch to turn a skill off everywhere

**Answered by Karthik, 2026-11-26:** all four as recommended. Note on Q1: "when I turn on, it should be back where it was before".

Your Agentation note on a skill's panel: "similar to MCP server, can we have a toggle to turn off the skill at a global level."

Also in this round: the panel fix from your other note is on local `main` as `1132a2c`, not pushed. A server's transport chip now has its own row under the name. It's cut short with an ellipsis, and the full URL shows on hover. `zoho-mail-server`'s name and switch are visible again.

## Why skills differ from MCP servers

An MCP server is an entry in each engine's config file, so "off" means changing that entry. A skill is a folder of files. Engines find it like this, using `3d-kasumidera-ultra-realism` as the example:

- **Through a shared link** (Claude Code, Codex, Gemini): each engine's skills folder links to `~/.agents/skills` as a whole. There's no per-engine, per-skill link to remove, so turning a skill off for one engine alone isn't possible here. Off means off everywhere, which is what you asked for.
- **Read directly** (Zed reads `~/.agents`): this works the same way.
- **Linked one by one** (some skills, in some places): one link per skill. Moving the skill away would leave those links broken, and Needs review would flag them.

No engine has a per-skill on/off setting that Hanger could flip. Claude Code has two candidates, `skillOverrides` and the frontmatter's `disable-model-invocation`, but neither is measured yet; the T3 Code review marked them for Phase 2.

So "off" has to mean moving the skill's folder somewhere no engine looks.

## Proposal

The model is the switched-off MCP servers in Claude Code.

- **The switch:** one in the skill panel's header, "On" / "Off". Off moves the skill's folder out of `~/.agents/skills` into Hanger's own keep, under `~/Library/Application Support/com.rkarthik.hanger/kept/skills/`. On moves it back. Undo works as for servers.
- **Single links:** any one-by-one link to that skill is removed, and recorded so that switching it on puts it back. Nothing is left dangling.
- **"Switched off" group:** the Skills tab gets one, as MCP servers has. Each row opens the skill's panel with the switch to turn it back on.
- **Safety:** before moving anything, Hanger checks that nothing changed underneath it, keeps a receipt, and refuses if the folder can't be put back exactly. These are the same rules as the MCP switch: byte-for-byte restore, no overwrite, and a refusal message when unsure.

:::question
Build the skill switch this way: move the skill's folder into Hanger's keep, and put it back on "On"?

- [ ] Yes, as proposed
- [ ] Use Claude Code's own setting instead (`skillOverrides`). It would work for Claude Code only, and only after Phase 2 measures that it really keeps the skill out
- [ ] Not now

Recommended: Yes, as proposed
:::

:::question
Which skills get the switch?

- [ ] Skills in the global store only (`~/.agents/skills`) for now; a repo's own skills later
- [ ] Every skill, including those inside repos

Recommended: Skills in the global store only (`~/.agents/skills`) for now; a repo's own skills later
:::

:::question
How should I build it?

It moves files on your disk, so I'd write a short plan for you to approve first, as we did for the MCP switch.

- [ ] Write the plan, then build after you approve it
- [ ] Build it straight away

Recommended: Write the plan, then build after you approve it
:::

:::question
Push the panel fix (`1132a2c`) now?

- [ ] Push now
- [ ] Wait and push with the skill switch

Recommended: Push now
:::
