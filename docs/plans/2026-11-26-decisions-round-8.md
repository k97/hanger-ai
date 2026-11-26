# Round 8: CI fails on a renamed Xcode

The push is on GitHub (`2c03063`). CI's `gates` job fails on one Rust test, `every_table_name_matches_the_installed_app` in `src-tauri/tests/editor_tests.rs`:

> table calls com.apple.dt.Xcode "Xcode" but the installed app is "Xcode_26.6.app" — `open -a "Xcode"` would not resolve

This isn't from this run's work. The 24 November run, before it began, failed with the same message, and every other test passes.

GitHub's Mac runners install Xcode under a versioned name. People who keep more than one Xcode do the same. Hanger finds the app by its bundle id, but then opens files with `open -a "<name from its table>"`. So for anyone with a renamed Xcode, "Open in Xcode" silently does nothing. The test caught a real bug.

:::question
How should I fix it?

- [ ] Open the editor by the app Hanger actually found: its path or bundle id, not the name in the table. This fixes renamed apps for everyone, and the test changes to check that the found app opens. It touches the opener's allowed-apps check (`scope.rs`), so it's a small Rust change with its own tests.
- [ ] Skip renamed apps in that test. CI passes again, but the bug stays for people with a renamed Xcode.
- [ ] Leave it for now. CI stays red.

Recommended: Open the editor by the app Hanger actually found: its path or bundle id, not the name in the table. This fixes renamed apps for everyone, and the test changes to check that the found app opens. It touches the opener's allowed-apps check (`scope.rs`), so it's a small Rust change with its own tests.
:::
