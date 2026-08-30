# The app icon

Moved out of `README.md` on 2026-08-30: this is contributor internals, and a
README is the wrong place for it. Nothing here is duplicated elsewhere —
`.claude/DESIGN.md:1868` and `.claude/rules/verifying-ui.md:54` mention only
`dev_icon::window_title`, which is window identity, a different subject.

`src-tauri/AppIcon.icon` (Icon Composer) is the source of truth. It feeds two
outputs, because macOS 26 and older systems read icons differently:

- `src-tauri/icons/Assets.car` — the layered Liquid Glass icon. macOS 26 finds
  it through `CFBundleIconName` in `src-tauri/Info.plist`; the bundler copies it
  in via the `macOS.files` entry in `tauri.conf.json`.
- `src-tauri/icons/` — the flat set (`icon.icns`, `.ico`, PNGs) used by Windows,
  Linux, the window icon, and macOS 15 and earlier.

Both are committed, so CI needs no Xcode. After changing the artwork, re-run
the generator on a Mac with Xcode installed and commit what it produces:

```bash
src-tauri/scripts/generate-icons.sh
```

Development builds use a separate `src-tauri/AppIcon-Dev.icon` (a DEV-badged
variant) so a dev instance is never mistaken for an installed Hanger AI in the
Dock. `tauri dev` runs a bare binary rather than an `.app`, so there is no
bundle for macOS to read an icon from. [src-tauri/src/dev_icon.rs](src-tauri/src/dev_icon.rs)
works around that: it embeds `icons/dev-Assets.car`, writes a throwaway stub
`.app` around it under `TMPDIR` at startup, and asks the system for that
bundle's icon. Apple does the rendering, so the dev icon gets real Liquid Glass
and follows light/dark like the shipped app.

It applies on `RunEvent::Ready` (Tauri sets its own dev icon while converting
that event, so anything earlier is overwritten) and re-applies on
`WindowEvent::ThemeChanged`, because the icon is resolved for the appearance
current at fetch time. The whole module is compiled out of release builds.

Note that the dev icon cannot be pre-rendered to a PNG: appearance is resolved
by `iconservicesagent` against the live system setting, so a build-time render
would bake in whichever appearance the build machine happened to be using.
