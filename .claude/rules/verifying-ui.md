# Verifying UI in the running app

`verification.md` accepts only screenshots from a running build. How to take one
that tells the truth from the `tauri dev` app:

- **Bring the window frontmost before capturing a state change.** An occluded
  WKWebView suspends CSS transitions and smooth-scroll; `screencapture -o -x
  -l<windowid>` still returns a frame, frozen at the transition's start value
  — it once read as "the rail highlights the wrong item". Focus first:
  `osascript -e 'tell application "System Events" to set frontmost of (first
  process whose unix id is <pid>) to true'`, wait ~1s, then capture. Static
  content captures fine occluded.
- The first synthetic click on an unfocused window only activates it; the
  click itself is swallowed. Re-focus immediately before each click.
- **A capture by window id is not evidence that your click reached that
  window.** `screencapture -l<windowid>` captures the window even when another
  app covers it, but synthetic clicks go to whatever is topmost at those screen
  coordinates. Found 2026-08-18 by the Blogpost session: Chrome sat at (0,33)
  1512x870, fully covering Hanger at its default position, so every click
  landed in Chrome while `-l` kept returning correct, current, entirely
  unchanged frames of Hanger. Nothing looks wrong — the app simply never moved.
  Corroborate with state, per `verification.md`'s ranking: read
  `selected_sidebar_item` from the store after a click, or assert the frame
  contains something only the new state could contain. Related: `-R x,y,w,h`
  captures the *screen* region and will happily return the covering app's
  window instead of yours.
- Window ids change on every relaunch, and a peer's rebuild relaunches the dev
  app: re-read the pid and window id each run (CGWindowList; the process is
  `target/debug/tauri-app`, **owner name `tauri-app`**). The window also moves
  between reads — it was at `@244,79` and `@267,92` twenty minutes apart on
  2026-08-27 — so re-read bounds before every capture and every click.
- **Three windows share the dev pid.** CGWindowList lists a 500×500 helper
  and the menu-bar strip under the same `tauri-app` pid as the main window;
  two captures on 2026-08-28 hit those first. Take the entry with width ≥ 900
  and height ≥ 600. `tauri dev` also relaunches the *previous* binary after a
  `src-tauri` change and rebuilds without relaunching — before a capture,
  `ps -o lstart= -p <pid>` must be younger than
  `stat -f %Sm src-tauri/target/debug/tauri-app`. The `theme` preference is
  shared state like `selected_sidebar_item`: a peer flipped it to dark
  mid-session, so read it from the store first and name the theme in the
  evidence file.
- **To run the build you just made, touch `tauri.conf.json` after the binary
  lands** — wait for its mtime to move and `rustc` to be gone, then touch; the
  relaunch picks up the current binary (2026-08-28). Nothing measured from a
  stale process is evidence for a config: `trafficLightPosition` was retuned
  4.5pt from one, and it would have put the release lights 4.5pt low. The
  installed release app is the reference for window-server geometry.
- **A third session may be driving the app.** Relaunches, a moved pointer and
  swallowed clicks mid-sequence all happened on 2026-08-28. Verify every step
  by the store and the frame, not by the click having been sent; capture
  passively while Karthik is in it.
- **The dev window names itself `Hanger AI (dev)`; `Hanger AI` is the
  installed release app.** Since 2026-08-27 the dev build sets its own title
  (`dev_icon::window_title`, applied in `lib.rs`'s `setup`), so a capture can
  no longer silently be of the wrong build. Assert the title you got.

  Before that, both builds were "Hanger AI" and could run at *byte-identical*
  bounds — this pair was live that evening:

  ```
  num=14970 pid=26080 owner=tauri-app   title="Hanger AI"  1024x700 @244,79   <- tauri dev
  num=14721 pid=86869 owner="Hanger AI" title="Hanger AI"  1024x700 @244,79   <- /Applications
  ```

  Nothing distinguished them by geometry, title, or the frame's general look.
  A session captured 14721, found it blank, and reported the dev webview as
  HMR-dead to three others; the dev build was rendering fine the whole time.
  The release binary is an *older* build, so its DOM and stylesheet do not
  come from the working tree at all — a capture of it shows layout no reading
  of current source can explain, which is indistinguishable from a real
  defect.

  **Filtering by pid remains the robust form**, because the title is only as
  good as the build you are running: resolve
  `pgrep -f "target/debug/tauri-app"` and match `kCGWindowOwnerPID`. Never
  filter on `kCGWindowOwnerName == "Hanger AI"` — that is the release app's
  owner name; the dev build's is `tauri-app`.
  `ps -eo pid,lstart,command | grep -i hanger` shows whether a second copy is
  running at all; if one is, say so rather than quitting it — it may be
  Karthik's.
- **`screencapture -o -x out.png` captures the MAIN display only.** This
  machine has two. A window on the other one is simply absent from the frame,
  which reads exactly like "the window is gone" — twice on 2026-08-25 that
  produced a wrong diagnosis before `-D 2` showed the second display held a
  browser, not Hanger. Capture per display, or capture by window id.
- **`System Events` reports 0 windows for the Tauri webview**, so
  `get {position, size} of window 1` fails with `-1719 Invalid index` even
  with Accessibility granted, and even while the app's own **Window menu
  still lists the window**. Do not read that as "the app has no window". The
  tool that works here is CGWindowList via `swift`:

  ```swift
  import CoreGraphics
  let l = CGWindowListCopyWindowInfo(.optionAll, kCGNullWindowID) as? [[String: Any]]
  // filter kCGWindowOwnerPID == the tauri dev pid -- NOT kCGWindowOwnerName,
  // which matches the installed release app instead (see the bullet above);
  // read kCGWindowNumber, kCGWindowBounds, kCGWindowIsOnscreen
  ```

  `python3` has no `Quartz` module on this machine, so the Python route in
  older notes does not run. Clicking the window's entry in the app's Window
  menu raises it when nothing else will.
- `touch index.html` reloads the webview under `tauri dev`: a frontend cold
  start (state resets, the startup scan reruns) without killing anyone's
  process. Someone else may be in the app — read `selected_sidebar_item` from
  the store before you change it, and put it back.
- **Reach one asset by the palette, not the list.** Focus the window, send
  Cmd+K, `keystroke` the name, `key code 36`: the inspector opens on that
  asset and the frame carries its title, tabs and cards — verify by that,
  not by the keys having been sent. Three things then move it out from
  under you (2026-08-29, one round each): Escape drops the pick back to the
  list's own selected row, so close a stray menu by clicking, never Escape;
  the Content/Details tab persists across picks, so click Content and read
  the frame; and wheel events go to the pane under the pointer, and the
  window's centre (x≈512 of 1024) is the *left* pane — park the pointer at
  x≈830, y≈560 to scroll the inspector's document.
- **`cargo test` relaunches the dev app.** Twice on 2026-08-29 the pid and
  window id changed, and the window moved, about a minute into a
  `cargo test` run with nothing under `src-tauri/src` touched — the bin
  rebuilds as a test dependency and `tauri dev` reacts. The frontend
  cold-starts, so the palette pick is gone too. Run the gate before or
  after a capture sequence, never alongside, and re-read pid and window id
  after any cargo run.
- Webview console: `~/Library/Logs/com.rkarthik.hanger/Hanger AI.log`.
- **Mutation cycles kill the dev server. Run them in a detached worktree.**
  Planting a defect, running a test and reverting takes seconds, so Vite's
  watcher catches files mid-write. Once HMR fails it does not recover: on
  2026-08-25 a `ListCard` plant/revert produced

  ```
  [vite] Failed to reload /src/components/ListCard.tsx.
  [vite] Failed to reload /src/styles/index.css.
  ```

  and the webview stayed blank through `touch index.html`, a forced Rust
  rebuild, and a full app relaunch. Only restarting `bun run tauri dev`
  fixed it. `git worktree add --detach /tmp/<name> HEAD` plus a symlinked
  `node_modules` runs the whole suite and never touches the watched tree.
- **Blank webview: prove it is not the code before touching the app.** Load
  the same dev URL in Chrome. If React boots there — the DevTools notice in
  the console is the signal — and the page reaches its loading state, the
  frontend is fine and the fault is the webview's. In Chrome the Tauri IPC
  calls reject, so `Uncaught (in promise)` there is expected, not a finding.
