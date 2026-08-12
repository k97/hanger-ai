# Hanger AI

Hanger AI is a local-first desktop application that inventories, monitors, and deploys AI agent assets across Claude Code, Codex, and Gemini CLI.

![IMAGE — main inventory view]

## Requirements

- **Operating System:** macOS.
- **Architecture:** Apple silicon (arm64) and Intel (x86_64) universal binary.

## Installation

Download the latest `.dmg` installer from the official [Releases](https://github.com/k97/hanger-ai/releases) page, open the disk image, and drag Hanger AI into your Applications folder.

## Asset Coverage and Detection

Hanger AI scans local development and configuration directories to detect agent assets across nine categories:

- **Categories:** Skills, Agents, Tools, Rules, Memory, Subagents, Hooks, Permissions, Plugins.
- **Supported Engines:** Claude Code (`~/.claude`, `.claude`), Codex (`~/.codex`), and Gemini CLI (`~/.gemini`, `.gemini`).

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

## Licence

Licensed under the [MIT License](LICENSE).
