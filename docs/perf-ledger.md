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
| 2026-11-25 | **B2**: `scan_targets` runs the machine-wide pass once, then each target's project pass from what it found (`GlobalPass`), instead of the whole of `scan_with_progress` per target. The machine pass's engine and root rows are rewritten before each later target, as before | Bench, same default sizes and fixture as the baseline (7 targets, 549 assets). Wall ms min / median / max, CPU ms median. **Debug**: cold 2012 / 2015 / 2054 → **421 / 448 / 485**, CPU 1855 → 405; warm 1953 / 1991 / 2192 → **374 / 473 / 691**, CPU 1825 → 398. **Release**: cold 1507 / 1627 / 1959 → **326 / 370 / 390**, CPU 1428 → 328; warm 1522 / 1596 / 1672 → **312 / 341 / 391**, CPU 1419 → 298. Real store, Rescan to `scan://complete`: **deferred** | **kept** | Outside the noise by a wide margin: every after-run, max included, is below the baseline's minimum, in both profiles. About 4.5× in debug and 4.4× in release on 6 linked projects; the saving grows with the number of linked directories. The real-machine figure needs a Rescan click in the dev app's window, which this run could not make without window interaction; no dev app was running from the main checkout. |
| 2026-11-25 | **B3**: a scan writes through one store connection, opened by the machine pass and held until the last project pass, with `prepare_cached` statements (16 distinct, cache capacity 32). Every write used to open its own connection and compile its statements: 156 opens for a 9-target test fixture, 2 now (the schema check and the scan's). The project-roots query runs for project upserts only | Bench, same default sizes and fixture (7 targets, 549 assets). Wall ms min / median / max, CPU ms median. B2 was rebuilt from `86e261a` and run in the same session, back to back with B3, because B2's row came from an earlier session. **Debug**: B2 rebuilt cold 410 / 429 / 455, CPU 387; warm 397 / 412 / 423, CPU 384 → B3 cold **292 / 312 / 338**, CPU 269; warm **275 / 281 / 299**, CPU 251. An earlier B3 debug run read cold 320 / 340 / 577 (the 577 was `index_inventory` at 238 ms in that run, not the scan), warm 315 / 327 / 592, CPU 293 / 294. **Release**: B2 rebuilt cold 329 / 368 / 512, CPU 317; warm 308 / 327 / 434, CPU 285 → B3 cold **249 / 259 / 261**, CPU 222; warm **233 / 235 / 241**, CPU 208. Against B2's own row: debug cold median 448 → 312, release 370 → 259. Real store, Rescan to `scan://complete`: **deferred** | **kept** | Outside the noise: in release and in the back-to-back debug run every B3 run, max included, is below B2's minimum, cold and warm. About 27–35% less wall and CPU on this fixture (medians). The first debug run overlaps B2 only through two outliers, one of them in the search index rather than the scan. The real-machine figure needs a Rescan click in the dev app's window; not taken, as for B2. |
| 2026-11-25 | **B4**: opening a server panel no longer rescans. `start_scan` records `(registration_key, command, args)` for every tool of its final inventory in a Tauri-managed `McpLaunches`; `get_mcp_processes` matches running processes against that and writes nothing. Before any scan completes it falls back to `run_scan` as before | `panel_open_bench` in `scan_bench_tests.rs`, same default fixture (6 linked projects): `mcp_processes_from` timed with the real process table read inside the timing, as the command does. "Old" is the same function with nothing recorded, so it takes the fallback, which is exactly the pre-B4 command (`run_scan` over the linked directories, then the match). Alone, and 30 ms into a concurrent Rescan (`scan_targets` + `index_inventory`) on another thread. 5 runs each, fresh store per run; ms min / median / max. **Debug** (two runs): panel alone 282 / 290 / 315 and 302 / 331 / 350 → **48 / 49 / 50** and 53 / 56 / 57; panel during a Rescan 449 / 487 / 514 and 584 / 591 / 628 → **50 / 51 / 52** and 56 / 57 / 57; the Rescan it ran beside 548 / 571 / 581 and 628 / 660 / 674 → **251 / 269 / 290** and 267 / 312 / 399. **Release**: panel alone 226 / 232 / 258 → **10 / 11 / 12**; during a Rescan 251 / 452 / 730 → **11 / 12 / 12**; the Rescan beside it 494 / 536 / 871 → **228 / 257 / 275**. Real store, Rescan to `scan://complete`: **deferred** | **kept** | Outside the noise: every after-run, max included, is below every before-run's minimum, in both profiles and both scenarios. What is left of the panel's cost is reading the process table (`running_processes`, ~50 ms debug, ~11 ms release here). A Rescan running when a panel opens is no longer slowed by it: the old panel's own scan ran beside it and roughly doubled its wall. On the real machine the old path scanned every linked directory (10 on 2026-11-25), so the saving there is larger than on this fixture. It also fixes a defect: `run_scan` scans linked directories only, so with none linked the panel matched no tools at all. The real-machine figure needs a Rescan click in the dev app's window; not taken, as for B2 and B3. |

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
