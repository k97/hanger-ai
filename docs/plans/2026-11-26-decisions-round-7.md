# Round 7: the release-build check, ready now

The release app is built from `main` at `945668a`: `src-tauri/target/release/bundle/macos/Hanger AI.app`.

Its last step failed: signing the auto-update package needs your private key, which isn't set here. The app itself built fine, and nothing is uploaded or published.

What I'll do, in about 2 minutes, using the real mouse:
1. Open the built app the way Finder does (`open`), so it gets Finder's PATH, not a terminal's.
2. Global › MCP servers, pick Claude Code, switch `cua-driver` off.
3. Check that Claude Code no longer lists it, then press Undo and check its entry matches the original exactly, as in the earlier Claude Code check.
4. Quit the release app.

The dev app isn't running, so only one copy of Hanger uses your store.

:::question
Ready for me to drive the mouse for about 2 minutes?

Answer when you've stepped away. Your answer is my signal to start.

- [ ] I've stepped away, go now
- [ ] Not now, ask me again later
- [ ] Skip the release check

Recommended: I've stepped away, go now
:::
