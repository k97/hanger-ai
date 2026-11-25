# Decisions, round 3: driving the app for the real-machine checks

Your answers from round 2 are in. Running now, each on its own branch:
- the three design fixes and the approved wording
- the `~/.cursor` fix
- the two flaky tests and the count-of-7 fixture
- the T3 Code review, which only reads code

The dev reload fix is on `main` as `c483d8f`.

What's left needs the app driven:
- the real-machine rescan timing
- the C1 checks you approved: Codex, Claude Code, Gemini, the release build and OpenCode, each switched off then back on with Undo

You asked me to click only when you've stepped away. That was because my mouse clicks kept landing in the wrong place while you were using the computer.

:::question
May I drive the dev app through its built-in remote-control link, without moving your mouse?

The dev build has a local link (port 9223, dev builds only) that presses buttons inside the app through the same code a click runs. It doesn't move the pointer, take focus or touch any other app, so it can't land in the wrong place. You'd still see the Hanger window change while I work: about 5 minutes for the timing and the C1 checks. Every C1 change is switched back with Undo, and I check each file is byte-for-byte the same afterwards. Taking screenshots doesn't use the mouse either.

- [ ] Yes, use the remote-control link any time
- [ ] Yes, but only for C1 and the timing, now
- [ ] No, wait until I say I've stepped away

Recommended: Yes, but only for C1 and the timing, now
:::

:::question
When should the OpenCode check run?

It's a hand edit to OpenCode's config followed by `opencode reload`. This session runs in OpenCode, so it can lose its own tools until the edit is put back, and I might lose contact partway through.

- [ ] Last, after everything else is merged and reported
- [ ] Now, with the others

Recommended: Last, after everything else is merged and reported
:::
