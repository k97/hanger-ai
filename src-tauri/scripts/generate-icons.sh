#!/usr/bin/env bash
#
# Regenerate every app icon artefact from src-tauri/AppIcon.icon.
#
# AppIcon.icon (Icon Composer) is the single source of truth. It produces two
# distinct things, because macOS 26 and everything else disagree about icons:
#
#   Assets.car   layered Liquid Glass icon, read by macOS 26 via CFBundleIconName
#                (set in src-tauri/Info.plist) and copied into the bundle by the
#                "macOS.files" entry in tauri.conf.json.
#   flat raster  app-icon.png -> the whole src-tauri/icons/ set. Used by Windows,
#                Linux, the window icon, and legacy macOS through icon.icns.
#
# Assets.car is committed so CI never needs Xcode. Re-run this script only when
# the artwork changes, and commit the results.
#
# Usage: src-tauri/scripts/generate-icons.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAURI_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$TAURI_DIR")"
TOOL="$SCRIPT_DIR/icon-tool.swift"
ICON_SOURCE="$TAURI_DIR/AppIcon.icon"
FLAT="$TAURI_DIR/app-icon.png"

[ -d "$ICON_SOURCE" ] || { echo "error: $ICON_SOURCE not found" >&2; exit 1; }
[ "$(uname -s)" = "Darwin" ] || { echo "error: this script needs macOS (swift, iconutil, actool)" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "==> Flattening AppIcon.icon -> app-icon.png (full-bleed 1024)"
swift "$TOOL" flatten "$ICON_SOURCE" "$FLAT" 1024 >/dev/null

echo "==> Generating the platform icon set (tauri icon)"
cd "$ROOT_DIR"
bun tauri icon "$FLAT" >/dev/null

# tauri icon writes a full-bleed icon.icns. macOS wants ~10% margins and a
# rounded rect, so rebuild just that file. The PNGs and .ico stay full-bleed —
# margins are a macOS convention, not a Windows or Linux one.
echo "==> Rebuilding icon.icns with HIG margins"
swift "$TOOL" macos "$FLAT" "$WORK/macos-1024.png" 1024 >/dev/null
mkdir -p "$WORK/icon.iconset"
for entry in 16:icon_16x16 32:icon_16x16@2x 32:icon_32x32 64:icon_32x32@2x \
             128:icon_128x128 256:icon_128x128@2x 256:icon_256x256 \
             512:icon_256x256@2x 512:icon_512x512 1024:icon_512x512@2x; do
  swift "$TOOL" resize "$WORK/macos-1024.png" "$WORK/icon.iconset/${entry#*:}.png" "${entry%%:*}" >/dev/null
done
iconutil -c icns "$WORK/icon.iconset" -o "$TAURI_DIR/icons/icon.icns"

echo "==> Compiling Assets.car (Liquid Glass, macOS 26)"
if [ -z "${DEVELOPER_DIR:-}" ] && [ -d /Applications/Xcode.app ]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi
if xcrun --find actool >/dev/null 2>&1; then
  xcrun actool \
    --compile "$WORK" \
    --app-icon AppIcon \
    --output-partial-info-plist "$WORK/partial.plist" \
    --platform macosx \
    --minimum-deployment-target 26.0 \
    --errors --warnings \
    "$ICON_SOURCE" >/dev/null
  cp "$WORK/Assets.car" "$TAURI_DIR/icons/Assets.car"
  echo "    wrote icons/Assets.car"

  # The dev icon gets its own catalog rather than a flat PNG. `tauri dev` has no
  # bundle, so src/dev_icon.rs writes a throwaway stub .app around this at
  # runtime and asks the system for its icon — which means Apple renders it,
  # with Liquid Glass and the correct light/dark appearance, exactly like the
  # shipped app. Pre-rendering cannot do that: icon appearance is resolved by
  # iconservicesagent against the live system setting, so a build-time render
  # would bake in whichever appearance the build machine happened to be using.
  if [ -d "$TAURI_DIR/AppIcon-Dev.icon" ]; then
    echo "==> Compiling the dev icon catalog"
    mkdir -p "$WORK/dev"
    xcrun actool \
      --compile "$WORK/dev" \
      --app-icon AppIcon-Dev \
      --output-partial-info-plist "$WORK/dev/partial.plist" \
      --platform macosx \
      --minimum-deployment-target 26.0 \
      --errors --warnings \
      "$TAURI_DIR/AppIcon-Dev.icon" >/dev/null
    cp "$WORK/dev/Assets.car" "$TAURI_DIR/icons/dev-Assets.car"
    echo "    wrote icons/dev-Assets.car"
  fi
else
  echo "    SKIPPED: actool needs full Xcode (not just Command Line Tools)." >&2
  echo "    Keeping the committed icons/Assets.car. Install Xcode and re-run" >&2
  echo "    to pick up artwork changes in the Liquid Glass icon." >&2
fi

echo
echo "Done. Review the diff, then commit src-tauri/icons/, app-icon.png and AppIcon.icon."
