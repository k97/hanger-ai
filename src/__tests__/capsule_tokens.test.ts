import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// The segmented track's selected capsule (Karthik, 2026-08-22): no border,
// a tight contact elevation — a second, smaller one beside the map's — and
// in dark a lighter surface instead, because an elevation is invisible on
// black. Two tokens, declared in both themes, registered once.
const tokens = fs.readFileSync(path.resolve(__dirname, "../styles/tokens.css"), "utf-8");
const index = fs.readFileSync(path.resolve(__dirname, "../styles/index.css"), "utf-8");
const [light, dark] = tokens.split(".dark");

describe("the capsule tokens", () => {
  it("declares --capsule and --capsule-shadow in light and again in dark", () => {
    expect(light).toMatch(/--capsule:\s*var\(--page\);/);
    expect(light).toMatch(/--capsule-shadow:\s*0 1px 2px rgba\(0, 0, 0, 0\.10\), 0 2px 6px rgba\(0, 0, 0, 0\.06\);/);
    expect(dark).toMatch(/--capsule:\s*var\(--tint\);/);
    expect(dark).toMatch(/--capsule-shadow:\s*0 1px 2px rgba\(0, 0, 0, 0\.6\);/);
  });

  it("registers the surface as a colour utility and the elevation as one named utility", () => {
    expect(index).toMatch(/--color-capsule:\s*var\(--capsule\);/);
    expect(index).toMatch(/@utility capsule-raised \{[^}]*background-color:\s*var\(--capsule\);[^}]*box-shadow:\s*var\(--capsule-shadow\);[^}]*\}/s);
  });
});
