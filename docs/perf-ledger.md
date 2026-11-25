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
- **A scan, off the app**: `src-tauri/tests/scan_bench_tests.rs`, run as
  `cargo test [--release] --test scan_bench_tests -- --ignored --nocapture
  --test-threads=1` from `src-tauri/`. It builds a temp home and linked
  projects, then times `scanner::scan_targets` (the function `start_scan`
  runs) plus `search::index_inventory`: five cold scans, each into a fresh
  database, and the warm rescan after each. Wall from `Instant`, CPU from
  `getrusage(RUSAGE_SELF)`. Sizes are `HANGER_BENCH_*` env vars; the file
  header lists them. Compare a change only against a baseline of the same
  profile and sizes.

## Ledger

| Date | Idea | Baseline → Result | Verdict | Why |
|---|---|---|---|---|
| 2026-08-29 | Drop the rail column's `transition-[width]` (sidebar toggle instant) | Content process 229 ms/toggle (20 toggles, 4.58 s) → 51 ms/toggle (20 toggles, state-consistent run); GPU process 44 → 5 ms/toggle | **kept** (`cdfe7af`) | Also the root cause of the corner glitch: the corner's owner flipped at t=0 while the edge animated for 240 ms. One layout per toggle instead of ~14. A second after-run read 3 ms/toggle but its clicks did not all land; the 51 is the honest figure. |
| 2026-11-25 | **Baseline** for Phase B (scan speed): no change, the scan as of `2e5498d` (`scan_targets` extracted, behaviour pinned) | Bench, default sizes (300 global skills, 100 subagents, 2 MCP configs × 5 servers, 6 linked projects × 20 skills + 2 servers + 1 rule + 30 plain files; 7 targets, 549 assets). Wall ms min / median / max, CPU ms median. **Debug**: cold 2012 / 2015 / 2054, CPU 1855; warm 1953 / 1991 / 2192, CPU 1825. **Release**: cold 1507 / 1627 / 1959, CPU 1428; warm 1522 / 1596 / 1672, CPU 1419. `index_inventory` is 10–17 ms of each. Real store, Rescan to `scan://complete`: **not taken** | baseline | Wall ≈ CPU, so the scan is CPU-bound, not waiting on disk. Release is only ~20% faster than debug. A warm rescan costs the same as a cold first scan. The real-machine figure was deferred: the main checkout's dev app was running (another session's `tauri dev`), and the ledger method needs it quiet. Take it before B2's row. |

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
