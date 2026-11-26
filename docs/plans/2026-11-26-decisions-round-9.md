# Round 9: the renamed-Xcode fix is ready to push

On local `main`, 2 commits ahead of GitHub:
- `f8a13ab` **fix(editors): open the editor Hanger detected, by its path**
  - The interface still sends only the table's name ("Xcode").
  - Rust checks that name against its own table, asks macOS where that app is installed, and opens it at that path. A renamed `Xcode_26.6.app` now opens.
  - Anything not in the table, or not installed, is refused.
- `6537eed` **fix(capability): the interface names no app when it opens a path**
  - Removes the 36 per-editor entries from the app's permission file. Without them, the interface can't open an editor directly and get round the check above.
  - The subagent added this beyond what you asked, as its own commit. It's the stricter setup, so I kept it.

All checks pass on `main`:
- 890 Rust tests
- 1,553 JS tests
- the type check
- both secret scans

This should turn CI green: its one failure was the renamed-Xcode test that these commits replace.

Not checked by hand: clicking "Open in …" in the running app, which would open one of your editors with a file.

:::question-multi
What should I do?

- [ ] Push these 2 commits
- [ ] Check "Open in …" in the dev app first: open this repo's README in your default editor, through the remote-control link

Recommended: Push these 2 commits and Check "Open in …" in the dev app first: open this repo's README in your default editor, through the remote-control link
:::
