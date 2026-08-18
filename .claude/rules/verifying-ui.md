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
  `target/debug/tauri-app`, owner name "Hanger AI").
- `touch index.html` reloads the webview under `tauri dev`: a frontend cold
  start (state resets, the startup scan reruns) without killing anyone's
  process. Someone else may be in the app — read `selected_sidebar_item` from
  the store before you change it, and put it back.
- Webview console: `~/Library/Logs/com.rkarthik.hanger/Hanger AI.log`.
