# Performance ledger

Every attempt, kept or reverted, with the measurement that decided it — so a
dead idea stays dead and a kept one can be re-checked the same way. Method
per entry: what was measured, how, and the run-to-run spread. A number that
is inside its own noise is a revert, not a keep.

## How the shell is measured

- **Renderer cost of an interaction**: CPU time of the WebKit content process
  of the *dev app* (`com.apple.WebKit.WebContent`, the one whose start time
  matches `target/debug/tauri-app`'s — every WKWebView app has one, so pick by
  pid, never by name) before and after N interactions, `ps -o cputime`, with an
  idle control of the same length first. WindowServer moves with everything on
  the display and is not attributable; leave it out.
- **Frame timeline of an interaction**: `screencapture -v -V <s>` records the
  main display (240fps on this machine, ~57fps of distinct frames), `ffmpeg`
  crops to the window and dumps frames, and a pixel scan per frame gives the
  geometry (`scratch/edges.swift` in the session that did it; ~20 lines).
  Video lifts black to ~16, so "page" is `< 32`, not `== 0`.
- **Rust process**: `sample <pid> 3` for where the time goes; `ps -o cputime`
  deltas for how much.

## Ledger

| Date | Idea | Baseline → Result | Verdict | Why |
|---|---|---|---|---|
| 2026-08-29 | Drop the rail column's `transition-[width]` (sidebar toggle instant) | Content process 229 ms/toggle (20 toggles, 4.58 s) → 51 ms/toggle (20 toggles, state-consistent run); GPU process 44 → 5 ms/toggle | **kept** (`cdfe7af`) | Also the root cause of the corner glitch: the corner's owner flipped at t=0 while the edge animated for 240 ms. One layout per toggle instead of ~14. A second after-run read 3 ms/toggle but its clicks did not all land; the 51 is the honest figure. |

## Open findings, not yet worked (measured, no fix attempted)

- **Rust process during a scan: ~70% CPU, 3 min of CPU time in the first 8
  minutes after launch.** A 3 s `sample` mid-scan put the hot stacks in
  `rusqlite` `Connection::prepare` / `prepare_with_flags` / `RawStatement::step`
  under `preferences`, and in SQLite's busy handler (`sqliteDefaultBusyCallback`
  → `sqlite3OsSleep`, 31 stacks of ~2000). Two shapes worth measuring next:
  statements compiled per call where `prepare_cached` would compile once, and
  writers sleeping on the store's lock rather than batching.
- **A preference write costs the Rust process ~9–18 ms of CPU** (20 toggles →
  +18 to +36 cs, two runs). Each toggle persists `sidebar_collapsed`; the cost
  is the store round-trip, not the toggle.
