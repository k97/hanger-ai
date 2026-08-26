# Developer Setup Guide

This document outlines the prerequisites, installation steps, configuration requirements, and environment variables needed to develop and build **Hanger AI**.

---

## Prerequisites

Before starting, ensure your development environment has the following tools installed:

1. **macOS Developer Environment**:
   - Xcode Command Line Tools (`xcode-select --install`). Xcode CLT is required for compiling Rust binaries on macOS.
2. **Rust Toolchain**:
   - Rust standard toolchain version `1.77` or higher. Install via rustup:
     ```bash
     curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
     ```
3. **Node.js Environment**:
   - Node.js LTS version `20.x` or higher.
4. **Package Manager**:
   - `bun` package manager (version `1.x` or higher). Install via curl:
     ```bash
     curl -fsSL https://bun.sh/install | bash
     ```

---

## Clone and Run Steps

1. **Clone the repository**:
   ```bash
   git clone https://github.com/k97/hanger-ai.git
   cd hanger-ai
   ```

2. **Install frontend dependencies**:
   ```bash
   bun install
   ```

3. **Run in development mode (standard hot reload)**:
   ```bash
   bun run tauri dev
   ```

---

## Environment Variables

Hanger supports telemetry (consent-gated crash reporting and usage analytics) which requires specific environment variables during compilation/build time. 

### Telemetry Config Environment Variables:
- `SENTRY_DSN` - The DSN URL for Sentry error monitoring.
- `GA4_MEASUREMENT_ID` - Google Analytics 4 Measurement ID. Optional: builds
  fall back to the desktop property compiled into `DEFAULT_MEASUREMENT_ID`
  (`src-tauri/src/lib.rs`). Set it only to report a build elsewhere.
- `GA4_API_SECRET` - Google Analytics 4 Measurement Protocol API Secret.
  Required for any analytics to be sent, and has no default. It must belong
  to the **same data stream** as the measurement ID in use; a mismatched
  pair is answered with 401.

> [!NOTE]
> **No-Telemetries fallback**:
> Dev builds or local compile tasks executed without these environment variables configured will build and run cleanly with telemetry functionality completely disabled by design (safely avoiding compile-time panic).

---

## CI/CD Release Pipeline Secrets

To build and release signed, notarised macOS binaries via GitHub Actions, the following GitHub Repository Secrets must be configured:

- `APPLE_CERTIFICATE` - base64 encoded macOS Installer/Application signing certificate p12 file.
- `APPLE_CERTIFICATE_PASSWORD` - Decryption password for the p12 certificate.
- `APPLE_SIGNING_IDENTITY` - Exact developer signing identity name matching the certificate (e.g. `Developer ID Application: YOUR_NAME (YOUR_TEAM_ID)`).
- `APPLE_ID` - Developer account Apple ID email.
- `APPLE_PASSWORD` - Apple App-Specific Password generated for notarisation access.
- `APPLE_TEAM_ID` - 10-character Apple Developer Team ID.
- `SENTRY_DSN` - (Optional) Sentry DSN configuration for release builds.
- `GA4_MEASUREMENT_ID` - (Optional) GA4 telemetry measurement target.
- `GA4_API_SECRET` - (Optional) GA4 API authentication secret.

---

## Local Storage & Database

Development and production builds store their configuration, linked repositories list, and consent preferences in a local SQLite database file located at the standard OS-specific application support directories:
- **macOS**: `~/Library/Application Support/com.rkarthik.hanger/hanger.db`


---

## Build Artifact Hygiene

`src-tauri/target/` grows without bound and nothing reclaims it on its own.
On 2026-08-26 it held **94.2 GiB across 324,852 files**. Cargo's automatic
garbage collection, stable since 1.88, only ever touches `~/.cargo`; collecting
`target/` is still unimplemented ([rust-lang/cargo#13136][gc-issue]), so this
is manual maintenance.

Where the space went, measured rather than assumed:

| Cause | Size |
|---|---|
| `deps/` — every superseded build kept forever, keyed by content hash | 26 GB |
| `incremental/` — 536 compilation sessions | 7.1 GB |
| 237 test executables, one per integration suite, each statically linked | 3.0 GB |
| `.a` static archives (`crate-type` includes `staticlib`) | 3.1 GB |

Cargo never removes superseded artifacts from `deps/`: five copies of
`libtauri_plugin_mcp_bridge.a` at 308–380 MB each had accumulated since August.
Running the test suite is what drives this — 36 integration suites each link
the whole library.

### Routine

Nothing cleans `target/` automatically, and deliberately so: sweeping on every
build would delete artifacts you just made, and a 30-day threshold would no-op
for a month and then remove a great deal at once, mid-work. The failure this
guards against is silent growth over months, not sudden growth.

- **Every few weeks, or when `deps/` passes a few GB:** `bun run tidy`. It
  prints the size, runs `cargo sweep --time 30` — which deletes artifacts
  unused for 30 days and keeps what you are actively building — then prints the
  size again. Requires `cargo install cargo-sweep` (installed 2026-08-26).
- **Preview first if you want:** `cargo sweep --dry-run --time 30` from
  `src-tauri/` reports what it would remove without touching anything.
- **When it has got away from you:** `cargo clean` from `src-tauri/`. Reclaims
  everything at the cost of one full rebuild. Safe — `target/` is gitignored
  with zero tracked files, CI builds on a fresh runner, and nothing but
  compiled output lives there.
- **Check before deciding:** `du -sh src-tauri/target/*` shows which of the
  causes above is dominant.

### What is already configured

`[profile.dev.package."*"] debug = false` in `src-tauri/Cargo.toml` strips
debug symbols from dependencies, which is what made `deps/` the largest
contributor. Hanger's own crate keeps full debug info, so backtraces and
stepping through this project are unaffected; only stepping *inside* a
dependency is lost.

`src-tauri/target/.metadata_never_index` keeps Spotlight from indexing the
tree. Without it, stale `.app` bundles surface in Spotlight search and can be
launched by accident — an old binary opening the current store is a real
hazard, since migrations are forward-only and a 1.0.2 build understands schema
v2 against a live v7 store.

### Not done, deliberately

`crate-type = ["staticlib", "cdylib", "rlib"]` produces the 740 MB
`libtauri_app_lib.a`. No mobile targets are set up (`gen/` holds only
`schemas`) and nothing in `build.rs` consumes the archive, so `staticlib` looks
like `create-tauri-app` scaffolding — but `.claude/rules/invariants.md` marks
the crate's naming and shape as load-bearing, so removing it needs its own
red/green cycle rather than a drive-by edit.

[gc-issue]: https://github.com/rust-lang/cargo/issues/13136
