# Round 32: merging the repository view, and finishing Antigravity

Two branches are done and reviewed. Nothing has been merged or pushed.

- `feat/repo-view-parity`: 15 commits. The final review says Ready to merge,
  `stage-gate --dev` says Ship, and its three fixes are in. `main` has moved
  three commits since the branch started, all of them plan documents, so this
  is a merge commit, not a fast-forward.
- `fix/antigravity-source`: 9 commits. `--dev` says Ship and its four small
  findings are fixed. It stops at Task 5, which needs you.

The MCP server branch is still building Tasks 5 and 6. It is not part of this
round.

:::question
Merge `feat/repo-view-parity` into local `main` now?

I would merge from the main checkout after checking that no other session is
mid-commit there, run the four gates on the merged tree, and push nothing.
Two things only you can check by eye, in the branch's running dev app: the
overview card's popover (⌘E with the inspector open), and the repository view
in the dark theme. Nothing here can press keys or switch the theme without
taking over your screen.

- [ ] Merge now — you check ⌘E and dark after, on `main`'s dev app
- [ ] Wait — you check ⌘E and dark in the branch's dev app first, then say merge
- [ ] Needs changes — say what in a note

Recommended: Merge now
:::

:::question
How should Antigravity's Task 5 run?

Task 5 has two parts. First, screenshots of the new Antigravity CLI mark at
12px in light and dark: I take those, but only one dev app can hold port 8397,
so the repository view's dev app has to stop first. Second, your live check:
in a signed-in `agy` session, `/skills` lists Antigravity's skills, and a
server you switch off in Hanger is skipped on `agy`'s next start.

- [ ] After the parity merge — I stop its dev app, start Antigravity's, take the screenshots, then hand you the `agy` check
- [ ] Merge Antigravity into `main` first, then do both checks on `main`'s dev app
- [ ] Later — leave the branch as it is for now

Recommended: After the parity merge
:::

:::question
The nested-paths column on a repository can't be scrolled with the keyboard. Add it to `docs/TODO.md`?

The final review found it and parked it. The list needs to take focus, which
means it needs an accessible name, and a new label gets a naming brief before
it lands. T25, because the Antigravity branch already takes T24.

- [ ] Add it as T25, with the naming brief as its first step
- [ ] Fix it on the branch before the merge
- [ ] Leave it

Recommended: Add it as T25
:::

## Answers (Karthik, 2026-11-27)

1. **Merge now.** Merged as `c5a1baf`; he checks ⌘E and dark on `main`'s dev app.
2. **After the parity merge.**
3. **Add it as T25.**
