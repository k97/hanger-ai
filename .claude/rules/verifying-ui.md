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
- Window ids change on every relaunch, and a peer's rebuild relaunches the dev
  app: re-read the pid and window id each run (CGWindowList; the process is
  `target/debug/tauri-app`, owner name "Hanger AI").
- `touch index.html` reloads the webview under `tauri dev`: a frontend cold
  start (state resets, the startup scan reruns) without killing anyone's
  process. Someone else may be in the app — read `selected_sidebar_item` from
  the store before you change it, and put it back.
- Webview console: `~/Library/Logs/com.rkarthik.hanger/Hanger AI.log`.
