# Opening paths with `tauri-plugin-opener`

Three footguns in `openPath`, all of which fail *silently*. Found 2026-08-29
building "Open in editor"; each would have shipped a dead feature.

- **A `$HOME/**` scope reaches none of Hanger's assets.** `tauri/src/scope/fs.rs:215-225`
  defaults `require_literal_leading_dot` to **true on unix**, and with that flag
  a glob will not match any path containing a dot component. Every asset
  Hanger owns has one — `~/.agents/skills`, `~/.claude`, `~/.codex`,
  `~/.mcp.json`, a project's own `.claude/`. So the scope refused every open,
  which is what "Open in editor does nothing" actually was. Set
  `plugins.opener.requireLiteralLeadingDot: false` in `tauri.conf.json`;
  `editor_tests.rs::the_opener_scope_reaches_dot_directories` pins it.
  **The config is read at build time** — a running dev app will not pick it up
  until it is rebuilt.

- **The capability refuses every `openWith` unless the entry names an app.**
  `scope.rs:139` requires the path scope AND an app match, and
  `Application::matches` maps an entry with no `app` key to
  `Self::Default => a.is_none()` (`scope_entry.rs` makes `Default` the serde
  default). So `{ "path": "$HOME/**" }` permits `openPath(p)` and rejects
  `openPath(p, "Cursor")`. Add `{ "path": "…", "app": "<name>" }` per app, or
  `"app": true` for any. Entries are compared byte-for-byte, so use the app
  **name** (`"Visual Studio Code"`) — a path entry refuses anyone whose editor
  lives outside `/Applications`.
- **`openPath` skips its own existence check once an app is named.**
  `open.rs:56` is `if with.is_none() { _ = path.metadata()?; }`. The
  one-argument call rejects on a bad path; the two-argument call does nothing
  at all and reports success. Stat the path yourself before calling.

`open`'s exit code means "dispatched", not "the app did something with the
argument" — `open -g -a Preview <dir>` exits 0 having ignored the folder.

A curated bundle-id table keyed on `NSWorkspace` goes stale invisibly: a
missing or wrong id is indistinguishable from "not installed", so the editor is
simply never offered and nothing goes red. `Antigravity IDE.app` disappeared
from this machine between a morning probe and the same afternoon's build.
