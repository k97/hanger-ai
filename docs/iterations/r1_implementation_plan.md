# Implementation Plan - Hanger MVP Build

This document outlines the step-by-step technical plan to construct **Hanger**, a local-first control panel for developer AI skills and tools. The architecture adheres to a strict separation of frontend layout operations (webview) and native OS mutations (Rust kernel).

---

## 1. Architectural & Dependency Mapping

We will construct Hanger using **Tauri v2** with **Vanilla TypeScript** and **Bun** as our package/run manager.

### 1.1 Rust Dependencies (`src-tauri/Cargo.toml`)
- `tauri` (v2): Core application frame.
- `serde` / `serde_json`: IPC communication serialization.
- `walkdir` / `ignore`: Fast multi-threaded directory traversal respecting `.gitignore`.
- `glob`: Filename glob pattern matching for ad-hoc tool discovery.
- `sha2` / `hex`: SHA-256 checksum compilers to track version drift.
- `ureq`: Lightweight blocking HTTP client for background telemetry dispatches.
- `sysinfo` or custom POSIX calls: File handle and process lock detection.

### 1.2 Frontend Dev/Runtime Dependencies (`package.json`)
- `vite`: Build tool.
- `typescript`: Type safety.
- `@tauri-apps/api` (v2): Tauri IPC bridge.
- Custom fonts: Quadrant-like mechanical serif font ("Arvo" or Monospace Serif fallback) and neutral sans-serif ("Inter").

---

## 2. Execution Tiers & Proposed Code Structure

We will structure the project using clean domain separations.

```
hanger/
├── docs/                     # PRD and visual assets
├── src-tauri/                # Rust Core & State/Driver Layer
│   ├── src/
│   │   ├── main.rs           # Entry point
│   │   ├── lib.rs            # Tauri setup and command routing
│   │   ├── core_engine.rs    # Tier 4: Walkdir, Ignore rules, transaction swaps, symlinks
│   │   ├── evaluation.rs     # Tier 3: AST parsing, Frontmatter regex matching, SHA-256 hash checks
│   │   └── telemetry.rs      # Firebase & Crashlytics HTTPS telemetry client
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                      # Tier 1 & 2: Frontend View & IPC Bridge
│   ├── style.css             # Granola CSS design system & custom properties
│   ├── main.ts               # Frontend logic & state manager
│   ├── tauri_bridge.ts       # IPC serialized structures
│   └── index.html            # Core layout
└── package.json
```

---

## 3. Detailed Proposed Changes

### Step 1: Scaffold application
Initialize the Tauri v2 template:
```bash
bun create tauri-app . --yes --manager bun --template vanilla-ts --force
```

### Step 2: Configure Rust backend
Create the Rust modules:
- **`core_engine.rs`**: Handles file operations:
  - Recursive listing using the `ignore` crate to skip `.git` and `node_modules` automatically.
  - Symlink vs hard copy creation.
  - Backup rotations inside `.hanger/backups/[timestamp]_filename.bak` before atomic updates.
- **`evaluation.rs`**:
  - Scan file headers for Markdown YAML frontmatter and JSON configurations.
  - Checksum generator: Computes SHA-256 hash of folder/file configurations.
- **`telemetry.rs`**: Sends anonymous data events using `ureq` to Firebase endpoints.

### Step 3: Configure Frontend & Granola UI Style Guide
Implement `src/style.css` using custom tokens:
```css
:root {
  --bg-primary: #FFFFFF;
  --bg-secondary: #F9F9F9;
  --border-color: #EEEEEE;
  --text-primary: #111111;
  --text-secondary: #777777;
  --accent-moss: #4A5D4E;        /* Muted moss green */
  --accent-moss-hover: #3F4E42;
  --border-radius: 0px;          /* Sharp mechanical edges */
  --font-mechanical: "Arvo", "Courier New", serif;
  --font-neutral: "Inter", system-ui, sans-serif;
}
```
Create a clean double-column notebook interface (Mode A: My Machine / Mode B: Discovery). Ensure action buttons are hidden and only fade in during active cursor hovers.

### Step 4: Map Tauri Commands
Define IPC interface endpoints:
- `scan_workspaces(roots: Vec<String>, custom_globs: Vec<String>) -> Result<ScanReport, String>`
- `formalize_draft_skill(script_path: String, manifest_data: SkillManifest) -> Result<SkillInfo, String>`
- `execute_deployment(skill_id: String, target_path: String, is_symlink: bool) -> Result<DeployResult, String>`
- `rollback_last_transaction() -> Result<(), String>`
- `fetch_discovery_index() -> Result<Vec<DiscoveryItem>, String>`
- `send_telemetry_event(event_name: String, parameters: serde_json::Value)`

---

## 4. Verification Plan

### 4.1 Automated Tests
- Run Rust units: `cargo test` verifying file backups, atomic renames, and frontmatter extraction logic.
- Run frontend check: `bun run tauri dev` to check layout and build validity.

### 4.2 Manual Verification Checklist
1. **Scanning Verification:** Verify scanning multiple workspace folders correctly ignores `.git` / `node_modules` and discovers `mcp.json`/`.agents/skills`.
2. **Draft Promotion Check:** Verify that selecting an informal JS/Python script and clicking "Formalize Skill" generates standard `SKILL.md` YAML manifest and moves it to `.agents/skills`.
3. **Symlink and Hard Copy Visual Physics:** Verify symlinked files display a visual connection string while hard-copied files display a clone icon.
4. **Environment Check & Linter:** Verify that deploying a tool to a workspace checking for missing `.env` variables or runtime dependencies (`bun`) fires UI warnings.
5. **Atomic Fallbacks:** Test modifying a configuration and verify a backup file is generated in `.hanger/backups` before execution.
6. **Telemetry Verification:** Verify that abstract telemetry events are triggered on scan/deploy actions without leaking private path names.
