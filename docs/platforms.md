# Platform support

macOS only, deliberately, until the app is stable and usable on one platform.
Moved out of `README.md` on 2026-08-30; the README keeps the decision and
links here for the reasoning.

Adding a platform is not a matter of relaxing a `cfg`. These are the parts that
assume macOS today:

| Area | macOS assumption |
|---|---|
| `src-tauri/src/dev_icon.rs` | `cfg(all(debug_assertions, target_os = "macos"))`; AppKit `NSApplication`, and a stub `.app` bundle so the Dock resolves the icon |
| `src-tauri/scripts/generate-icons.sh` | Refuses to run off Darwin; needs `swift`, `iconutil`, `sips` and `xcrun actool` |
| `src-tauri/src/mcp/registry.rs` | Config paths such as `Library/Application Support/…` |
| `src-tauri/src/mcp/observe.rs` | Resolves the spawning host from macOS process names |
| `.github/workflows/ci.yml` | `macos-latest` for every job |

The MCP dialects, discovery, probe and the whole frontend are already
platform-neutral. A second platform means a per-OS path table in the registry, a
host-resolution strategy for that OS, and an icon pipeline that does not need
Xcode — one platform at a time, once this one is solid.
