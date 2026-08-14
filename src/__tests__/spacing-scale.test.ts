import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * The numeric spacing utilities must mean what they say.
 *
 * Tailwind resolves `h-7` to `--spacing-7` when that name is registered, and
 * to `calc(var(--spacing) * 7)` when it is not. The Cockpit scale ran
 * 4/8/12/16/24/32/48, so registering it under this namespace silently
 * redefined every numeric utility from 5 upward: `h-7` rendered the filter
 * chips at 48px against a 28px spec, and `w-6` rendered the icon rail's
 * separator at 32px against 24px. Nothing in the markup looked wrong, which
 * is exactly why it survived a full redesign.
 *
 * Any genuinely off-grid value is stated at its call site (`h-[30px]`,
 * `px-[18px]`), so this namespace stays empty.
 */
describe("Spacing scale", () => {
  const indexCss = fs.readFileSync(path.resolve(__dirname, "../styles/index.css"), "utf-8");

  it("registers no --spacing-<n>, so N × 4px is what N means", () => {
    const declarations = [...indexCss.matchAll(/^\s*--spacing-(\d+)\s*:/gm)].map((m) => m[1]);
    expect(
      declarations,
      `--spacing-${declarations.join(", --spacing-")} redefines Tailwind's numeric ` +
        `scale. State off-grid values at the call site instead, e.g. h-[30px].`
    ).toEqual([]);
  });

  it("keeps the base --spacing step at Tailwind's 4px grid if it sets one at all", () => {
    const base = /^\s*--spacing\s*:\s*([^;]+);/m.exec(indexCss);
    if (base) {
      expect(base[1].trim()).toBe("0.25rem");
    }
  });
});
