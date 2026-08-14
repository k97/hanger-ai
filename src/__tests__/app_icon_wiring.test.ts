import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// The app icon is wired through three files that have to agree, and nothing in
// the build fails loudly when they drift — you just silently ship a generic or
// stale icon. macOS 26 renders the Liquid Glass icon from Resources/Assets.car
// via CFBundleIconName; every older macOS falls back to CFBundleIconFile and
// icon.icns. Both paths must stay intact.
//
// Regenerate all of it with: src-tauri/scripts/generate-icons.sh

const ROOT = path.resolve(__dirname, "../..");
const TAURI = path.join(ROOT, "src-tauri");

const read = (relative: string) => fs.readFileSync(path.join(TAURI, relative), "utf8");
const exists = (relative: string) => fs.existsSync(path.join(TAURI, relative));

describe("app icon wiring", () => {
  it("keeps the Icon Composer source in a tracked location", () => {
    // docs/ is gitignored, so the .icon cannot live there or CI loses it.
    expect(exists("AppIcon.icon/icon.json")).toBe(true);

    const spec = JSON.parse(read("AppIcon.icon/icon.json"));
    const images: string[] = (spec.groups ?? []).flatMap(
      (group: { layers?: { "image-name"?: string }[] }) =>
        (group.layers ?? []).map((layer) => layer["image-name"]).filter(Boolean),
    );
    expect(images.length).toBeGreaterThan(0);

    // Every layer the spec references must actually be present.
    for (const image of images) {
      expect(exists(path.join("AppIcon.icon/Assets", image))).toBe(true);
    }
  });

  it("ships a compiled Assets.car for the macOS 26 Liquid Glass icon", () => {
    expect(exists("icons/Assets.car")).toBe(true);

    // A stub or truncated car would still "exist" — the real one carries the
    // layered image stack and is comfortably over a megabyte.
    const size = fs.statSync(path.join(TAURI, "icons/Assets.car")).size;
    expect(size).toBeGreaterThan(500_000);
  });

  it("declares CFBundleIconName so macOS 26 finds the icon in Assets.car", () => {
    const plist = read("Info.plist");
    expect(plist).toMatch(/<key>CFBundleIconName<\/key>\s*<string>AppIcon<\/string>/);
  });

  it("keeps the dev icon catalog that src/dev_icon.rs embeds", () => {
    // `tauri dev` runs a bare binary with no bundle, so dev_icon.rs wraps this
    // catalog in a stub .app at runtime and asks the system to render it. It is
    // pulled in with include_bytes!, so a missing file breaks the Rust build.
    expect(exists("AppIcon-Dev.icon/icon.json")).toBe(true);
    expect(exists("icons/dev-Assets.car")).toBe(true);
  });

  it("applies the dev icon on Ready and re-applies it on theme change", () => {
    const lib = read("src/lib.rs");

    // Ready, because Tauri sets its own dev icon while converting that event —
    // anything earlier (setup) gets silently overwritten.
    expect(lib).toMatch(/RunEvent::Ready\s*=>\s*dev_icon::install\(\)/);

    // ThemeChanged, because the icon is resolved for the appearance current at
    // fetch time and does not update itself when the system flips.
    expect(lib).toMatch(/WindowEvent::ThemeChanged\(_\)/);
  });

  it("copies Assets.car into the bundle and keeps the legacy icns", () => {
    const config = JSON.parse(read("tauri.conf.json"));

    // Destination is relative to Contents/; source is relative to src-tauri/.
    expect(config.bundle?.macOS?.files).toMatchObject({
      "Resources/Assets.car": "icons/Assets.car",
    });

    // Pre-macOS 26 has no Liquid Glass and falls back to this.
    expect(config.bundle?.icon).toContain("icons/icon.icns");
    expect(exists("icons/icon.icns")).toBe(true);
  });
});
