# Round 11: the skill switch on your real skills (Task 11)

The skill switch is built and on local `main` at `b3ed58b`, not pushed: Tasks 1–10, 11 commits.

| Check | Result |
|---|---|
| JS tests | 1,598 passed |
| Type check | clean |
| Secret scans | both clean |
| Rust tests | 943 passed on the branch; re-running on `main` now |

Nothing has touched your real skills yet. Every test used temporary folders.

**Heads-up:** your dev app now has the skill switch in a skill's panel header. A click there really moves that skill's folder. Avoid it until Task 11, or use it knowing it's live; Undo puts the folder back.

## Task 11

Using `animation-motion-design` (the plan's choice):

1. **Before:** record the folder's path, inode and content fingerprint, plus each one-by-one link to it (its text, mode and target).
2. **Off:** through the remote-control link.
   - Check the folder is in Hanger's storage and no longer in `~/.agents/skills`.
   - Check that each engine's one-by-one link to it is gone.
   - Check that Claude Code, Codex and Gemini no longer see it.
   - Check that nothing shows as broken, and that ⌘K no longer finds it.
   - Take screenshots.
3. **On:** check that the path, inode, fingerprint and every link text match the "before" record exactly.
4. **Off again, then Undo:** the same checks.

Each of those three steps writes to your disk, and I'll stop at the first surprise.

:::question
May I run Task 11 now, on `animation-motion-design`?

- [ ] Yes, run all three steps (Off, On, then Off and Undo), stopping at the first surprise
- [ ] Yes, but use a different skill (name it in a note)
- [ ] Not now

Recommended: Yes, run all three steps (Off, On, then Off and Undo), stopping at the first surprise
:::

:::question
One wording fix. When Hanger removes one link, the notice reads "Hanger removed 1 link to it and will put them back."

- [ ] "Hanger removed 1 link to it and will put it back."
- [ ] "Hanger removed 1 link to the skill and will put it back."

Recommended: "Hanger removed 1 link to the skill and will put it back."
:::

:::question
Push the skill switch after Task 11 passes?

- [ ] Push after Task 11 passes
- [ ] Wait for my word

Recommended: Push after Task 11 passes
:::
