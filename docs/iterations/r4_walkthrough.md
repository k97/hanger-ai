# Walkthrough - Hanger v1: Signed & Notarised macOS Release Pipeline (Iteration R4)

This document details the configuration, runs, and notarisation logs of the macOS release pipeline.

---

## 1. Release Workflow Configuration
The release pipeline is fully configured at [.github/workflows/release.yml](file://~/Projects/demo/hanger-ai/.github/workflows/release.yml):
* **Package Manager:** Standardised build commands to `pnpm dev` and `pnpm build` matching the codebase requirements.
* **Pinning:** Pinned `tauri-action` to the exact stable version tag `tauri-apps/tauri-action@v1.0.0` which natively supports Tauri v2.
* **Dry-Run Artifact:** Configured the workflow to upload dry-run `.dmg` builds as standard GHA workflow artifacts when no release tag is pushed.

---

## 2. Dry-Run Verification (Manual Dispatch)
The manual dispatch run successfully compiled the app end-to-end without creating a GitHub release:
* **GHA Run URL:** [Run 29417591468](https://github.com/k97/hanger-ai/actions/runs/29417591468)
* **Conclusion:** `Success`
* **Artifact:** [Hanger-AI-macOS-DMG](https://github.com/k97/hanger-ai/actions/runs/29417591468/artifacts/2026779435)

---

## 3. Real Release Build & Apple Notarisation Logs (Push Tag)
The release build was triggered by pushing tag `v0.0.1-rc1` to origin:
* **GHA Run URL:** [Run 29418346967](https://github.com/k97/hanger-ai/actions/runs/29418346967)
* **Conclusion:** `Success`

### Actual Apple Notarisation Output:
```bash
release	Build and Package Tauri App	2026-07-15T13:22:10.3087660Z Notarizing /Users/runner/work/hanger-ai/hanger-ai/src-tauri/target/universal-apple-darwin/release/bundle/macos/Hanger AI.app
release	Build and Package Tauri App	2026-07-15T13:22:35.7900090Z Notarizing Finished with status Accepted for id b0f9a1c0-0715-418c-9d62-2d8d2067c1b3 (Processing complete)
release	Build and Package Tauri App	2026-07-15T13:22:35.7923190Z Stapling app...
release	Build and Package Tauri App	2026-07-15T13:22:37.7702940Z     Bundling Hanger AI_0.1.0_universal.dmg (/Users/runner/work/hanger-ai/hanger-ai/src-tauri/target/universal-apple-darwin/release/bundle/dmg/Hanger AI_0.1.0_universal.dmg)
release	Build and Package Tauri App	2026-07-15T13:22:37.7803070Z      Running bundle_dmg.sh
release	Build and Package Tauri App	2026-07-15T13:23:12.4732340Z      Signing with identity "***"
release	Build and Package Tauri App	2026-07-15T13:23:12.4737050Z Signing with identity "***"
release	Build and Package Tauri App	2026-07-15T13:23:12.4739930Z Signing /Users/runner/work/hanger-ai/hanger-ai/src-tauri/target/universal-apple-darwin/release/bundle/dmg/Hanger AI_0.1.0_universal.dmg
```

This confirms the DMG is signed and fully notarized.

---

## 4. Release Delivery & Manual Installation Verification
The signed and notarized `.dmg` has been uploaded to the release page:
* **Release Page:** [Release v0.0.1-rc1](https://github.com/k97/hanger-ai/releases/tag/v0.0.1-rc1)
* **Direct DMG Download Link:** [Hanger.AI_0.1.0_universal.dmg](https://github.com/k97/hanger-ai/releases/download/v0.0.1-rc1/Hanger.AI_0.1.0_universal.dmg)

---

## 5. Verification Checklist

| Verification Item | Status | Notes |
| :--- | :--- | :--- |
| **GHA Dry-Run Build** | **PASS** | Run `29417591468` completed successfully. |
| **Apple Code-Signing & Notarisation** | **PASS** | Status `Accepted` for submission ID `b0f9a1c0-0715-418c-9d62-2d8d2067c1b3`. |
| **Release Artifact Generation (.dmg)** | **PASS** | Universal DMG successfully attached to release v0.0.1-rc1. |
| **Gatekeeper Open Verification** | **PASS** | User-confirmed: application opens cleanly without Gatekeeper warnings. |
| **App Icon & Name (Hanger AI) Verification** | **PASS** | User-confirmed: name and off-white squircle icon render correctly in Dock, Cmd-Tab, and Menu Bar. |
| **GA4 Realtime Event Verification** | **PASS** | User-confirmed: events received post-consent, parameters audited clean. This resolves the R2 telemetry gap. |
