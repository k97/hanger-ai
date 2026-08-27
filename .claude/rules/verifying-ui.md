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
- **Filter CGWindowList by pid, never by owner name — `"Hanger AI"` is the
  installed release app.** This bullet said owner name "Hanger AI" until
  2026-08-27, and following it exactly returns a window belonging to
  `/Applications/Hanger AI.app`, not to `tauri dev`. That evening both were
  running at *byte-identical* bounds:

  ```
  num=14970 pid=26080 owner=tauri-app   title="Hanger AI"  1024x700 @244,79   <- tauri dev
  num=14721 pid=86869 owner="Hanger AI" title="Hanger AI"  1024x700 @244,79   <- /Applications
  ```

  Nothing distinguishes them by geometry, title, or the frame's general look.
  This session captured 14721, found it blank, and reported the dev webview
  as HMR-dead to three other sessions; the dev build was rendering fine the
  whole time. The release binary is an *older* build, so its DOM and
  stylesheet do not come from the working tree at all — a capture of it shows
  layout no reading of current source can explain, which is indistinguishable
  from a real defect. Resolve the pid first
  (`pgrep -f "target/debug/tauri-app"`), then match `kCGWindowOwnerPID`.
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
