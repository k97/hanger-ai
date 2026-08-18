# Hanger AI

A local-first macOS app that inventories, monitors and deploys AI agent assets
— skills, rules, subagents and MCP servers — across the engines that read
them. It walks the directories those engines read from, records what it finds
in a local SQLite store, and adds two facts nothing on disk keeps: which
engines reach each asset and through which path, and how far past your global
store it has spread.

Why it exists: [Hanger](https://www.rkarthik.co/work/hanger).
The model it is built on: [docs/harness.md](docs/harness.md).

![IMAGE — main inventory view]

## Requirements

- **Operating System:** macOS.
- **Architecture:** Apple silicon (arm64) and Intel (x86_64) universal binary.

## Platform support

macOS only, deliberately, until the app is stable and usable on one platform.

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

## Installation

Download the latest `.dmg` installer from the official [Releases](https://github.com/k97/hanger-ai/releases) page, open the disk image, and drag Hanger AI into your Applications folder.

## Asset Coverage and Detection

Hanger AI walks local development and configuration directories and models
what it finds as four kinds of asset — the four the ecosystem actually
publishes (`src-tauri/src/domain.rs:323-326`):

- **Categories:** Skills, Rules, Subagents, MCP servers.

Coverage comes from two tables, kept separately because they answer different
questions:

- **Engines with directories of their own** — eleven, in `AGENT_CONFIGS`
  (`src-tauri/src/agents.rs:69`): Claude Code, Codex, Gemini / Antigravity,
  Kiro, Trae, OpenCode, Amp, Zed, Roo Code, Kilo Code and Cline. Each
  declares the roots it owns and where it keeps each category. Two more
  engines are known by their rules file alone — Cursor and GitHub Copilot
  (`agents.rs:367`).
- **MCP hosts** — sixteen, in `mcp::registry::HOSTS`
  (`src-tauri/src/mcp/registry.rs:91`), each with the config paths and
  dialect it uses. A host is not always an engine: Claude Desktop and VS Code
  declare MCP servers without owning skills or rules.

Ownership and reach are separate questions and the distinction matters before
changing either table — [docs/harness.md](docs/harness.md).

Scanning respects `.gitignore` rules (`src-tauri/src/scanner.rs:34-120`) and never inspects `node_modules` or credential files.

## Asset Reaping Safeguards (`HANGER_ENABLE_REAP`)

The stale-asset reaper cleans up database records when a root scan completes and recorded assets no longer exist on disk.

- **Default Status:** **Disabled.**
- **Risk Notice:** Automatic reaping is disabled by default behind the `HANGER_ENABLE_REAP` environment variable because it caused data loss twice during initial development when transient directory unmounts or interrupted walks caused active assets to be incorrectly removed from the database.
- **Enabling Reaper:** Enabling the reaper is strictly at the user's risk. To enable stale-asset cleanup, launch the application with:
  ```bash
  HANGER_ENABLE_REAP=1 /Applications/Hanger\ AI.app/Contents/MacOS/Hanger\ AI
  ```

## Local Development

Building from source requires [Bun](https://bun.sh) and [Rust](https://www.rust-lang.org/):

```bash
# Install frontend dependencies
bun install

# Start local development server
bun run tauri dev

# Build production bundle
bun run tauri build
```

### App icon

`src-tauri/AppIcon.icon` (Icon Composer) is the source of truth. It feeds two
outputs, because macOS 26 and older systems read icons differently:

- `src-tauri/icons/Assets.car` — the layered Liquid Glass icon. macOS 26 finds
  it through `CFBundleIconName` in `src-tauri/Info.plist`; the bundler copies it
  in via the `macOS.files` entry in `tauri.conf.json`.
- `src-tauri/icons/` — the flat set (`icon.icns`, `.ico`, PNGs) used by Windows,
  Linux, the window icon, and macOS 15 and earlier.

Both are committed, so CI needs no Xcode. After changing the artwork, re-run
the generator on a Mac with Xcode installed and commit what it produces:

```bash
src-tauri/scripts/generate-icons.sh
```

Development builds use a separate `src-tauri/AppIcon-Dev.icon` (a DEV-badged
variant) so a dev instance is never mistaken for an installed Hanger AI in the
Dock. `tauri dev` runs a bare binary rather than an `.app`, so there is no
bundle for macOS to read an icon from. [src-tauri/src/dev_icon.rs](src-tauri/src/dev_icon.rs)
works around that: it embeds `icons/dev-Assets.car`, writes a throwaway stub
`.app` around it under `TMPDIR` at startup, and asks the system for that
bundle's icon. Apple does the rendering, so the dev icon gets real Liquid Glass
and follows light/dark like the shipped app.

It applies on `RunEvent::Ready` (Tauri sets its own dev icon while converting
that event, so anything earlier is overwritten) and re-applies on
`WindowEvent::ThemeChanged`, because the icon is resolved for the appearance
current at fetch time. The whole module is compiled out of release builds.

Note that the dev icon cannot be pre-rendered to a PNG: appearance is resolved
by `iconservicesagent` against the live system setting, so a build-time render
would bake in whichever appearance the build machine happened to be using.

Licensed under the [MIT License](LICENSE).
