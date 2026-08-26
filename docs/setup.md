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

