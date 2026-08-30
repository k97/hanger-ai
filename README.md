# Hanger AI

An interface for the agent harness — the skills, rules, subagents and MCP
servers that decide what your engines can actually do. Hanger is a local-first
macOS app that inventories, monitors and deploys them: it walks the
directories your engines read from, records what it finds in a local SQLite
store, and adds two facts nothing on disk keeps — which engines reach each
asset and through which path, and how far past your global store it has
spread.

Why the harness needs an interface: [Hanger](https://www.rkarthik.co/work/hanger).
How this app models it: [docs/harness.md](docs/harness.md).

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

<!-- hanger:counts:start -->

| What | Count | Where it is written down |
|---|---:|---|
| Engines with directories of their own | 11 | `src-tauri/src/agents.rs` → `AGENT_CONFIGS` |
| MCP hosts | 16 | `src-tauri/src/mcp/registry.rs` → `HOSTS` |
| Tauri commands | 42 | `src-tauri/src/lib.rs` → `generate_handler!` |
| Frontend test files | 74 | `src/__tests__/` |
| Rust test files | 44 | `src-tauri/tests/` |

<!-- hanger:counts:end -->

Coverage comes from two tables, kept separately because they answer different
questions:

- **MCP hosts** — sixteen, in `mcp::registry::HOSTS`
  (`src-tauri/src/mcp/registry.rs:91`), each with the config paths and
  dialect it uses. A host is not always an engine: Claude Desktop and VS Code
  declare MCP servers without owning skills or rules.

Ownership and reach are separate questions and the distinction matters before
changing either table — [docs/harness.md](docs/harness.md).

## Asset Reaping Safeguards (`HANGER_ENABLE_REAP`)

The stale-asset reaper cleans up database records when a root scan completes and recorded assets no longer exist on disk.

- **Default Status:** **Disabled.**
- **Enabling Reaper:** Enabling the reaper is strictly at the user's risk. To enable stale-asset cleanup, launch the application with:
  ```bash
  HANGER_ENABLE_REAP=1 /Applications/Hanger\ AI.app/Contents/MacOS/Hanger\ AI
  ```

Licensed under the [MIT License](LICENSE).
