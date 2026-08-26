# Security Policy

## Supported Versions

Only the current major release of Hanger AI receives security updates.

| Version | Supported          |
| ------- | ------------------ |
| 1.0.0   | :white_check_mark: |
| < 1.0.0 | :x:                |

## Scope and Data Privacy

Hanger AI is a local-first desktop application that scans AI agent assets across local development directories (`src-tauri/src/scanner.rs:34-120`). Scanning is strictly restricted to agent configuration folders (`~/.claude`, `~/.codex`, `~/.gemini`, `.agents`, `.claude`, `.gemini`, `.cursorrules`, `AGENTS.md`).

No file contents, project source files, local path strings, or environment credentials leave your local machine (`src-tauri/src/lib.rs:45-129`, `src-tauri/src/preferences.rs`).

## Telemetry and Consent

Crash reporting is opt-in and off until you turn it on. Usage analytics are on by
default: the onboarding consent step shows the switch already enabled, and you can
turn it off there before anything is sent, or later from Settings. Turning it off
is remembered and survives restarts (`src-tauri/src/lib.rs:167-186`).

Neither transmits anything while its consent atom is false, and no file contents,
source, local paths or credentials are ever included in either.

- **Crash Reporting (Sentry):** Crash events are gated by an in-memory atomic boolean (`src-tauri/src/lib.rs:19`, `src-tauri/src/lib.rs:57`). When enabled, stacktraces and error messages are filtered through sanitisation helpers to scrub local filesystem paths prior to dispatch (`src-tauri/src/lib.rs:45-129`).
- **Usage Metrics (GA4):** Anonymised usage events are gated by an in-memory atomic boolean (`src-tauri/src/lib.rs:20`, `src-tauri/src/lib.rs:175`). Event payloads contain only high-level event names and generic category badges, with path strings explicitly rejected (`src-tauri/src/lib.rs:174-220`).
- **Sentry DSN Notice:** The Sentry DSN (`VITE_SENTRY_DSN`) referenced in this repository is public by design. It functions strictly as an ingestion key for client-side crash reporting, contains no secret privileges, and is not a credential.

## Reporting a Vulnerability

If you discover a potential security vulnerability in Hanger AI, please report it privately:

- **Contact:** Email `karthik97live@gmail.com` or submit a report via GitHub Private Vulnerability Reporting on the repository (`https://github.com/k97/hanger-ai`).
- **Expected Response Window:** As a solo maintainer project, reports will be acknowledged within 7 days. Fixes will be prioritised based on severity, but fixed remediation timelines are not guaranteed.
