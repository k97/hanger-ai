# Security Policy

## Supported Versions

Only the latest release of Hanger AI receives security updates.

| Version | Supported          |
| ------- | ------------------ |
| 1.5.0   | :white_check_mark: |
| < 1.5.0 | :x:                |

## Reporting a Vulnerability

If you discover a potential security vulnerability in Hanger AI, please report it privately rather than opening a public issue.

- **Contact:** Email security findings directly to the repository maintainers or use GitHub Security Advisories private vulnerability reporting.
- **Expected Response Window:** Maintainers will acknowledge security reports within 48 hours and aim to provide an initial assessment or remediation timeline within 5 business days.

## Telemetry & Sentry DSN Notice

The Sentry DSN (`VITE_SENTRY_DSN`) referenced in this repository and build configuration is **public by design**. It functions strictly as an ingestion key for client-side crash reporting, contains no secret privileges, and is not a credential. Telemetry and crash reporting in Hanger AI are strictly opt-in and transmit no data prior to explicit user consent.
