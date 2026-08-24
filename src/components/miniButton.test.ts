import { describe, it, expect } from "vitest";
import { miniBtnClass, miniBtnFillClass, miniBtnTonalClass, miniSetClass } from "./miniButton";

/**
 * `toContain` proved presence, never exclusivity: `miniBtnFillClass` could
 * gain `bg-page` alongside its `bg-fill`, or `miniBtnClass` gain
 * `border-transparent` alongside its `border-line-2`, and every assertion
 * still passed. These are hoisted class constants — the file exists to be the
 * one place these strings live — so the whole string is the contract, which is
 * what `miniSetClass` alone already did.
 *
 * The rules the old assertions spelled out, kept as the reasons rather than as
 * weaker checks (Karthik's ruling 2026-08-23, `.claude/DESIGN.md:161`): 26px on
 * `rounded-control` and never a pill, so the two tiers never read as one
 * control at two scales; the outlined tier borders in `--line-2` on the page;
 * fill and tonal carry no visible border.
 */
const BASE =
  "h-[26px] px-2.5 inline-flex items-center gap-1.5 whitespace-nowrap text-small cursor-pointer transition-colors duration-hover ease-spring";

describe("the mini button tier", () => {
  it("pins each tier's whole class string, so a stray utility cannot hide in it", () => {
    expect(miniBtnClass).toBe(
      BASE + " text-ink-1 border border-line-2 rounded-control bg-page hover:bg-plane-2"
    );
    expect(miniBtnFillClass).toBe(
      BASE + " text-on-fill border border-transparent rounded-control bg-fill"
    );
    expect(miniBtnTonalClass).toBe(
      BASE + " text-ink-1 border border-transparent rounded-control bg-plane-2 hover:bg-tint"
    );
  });

  it("a set is a wrapping row on a 6px gap", () => {
    expect(miniSetClass).toBe("flex flex-wrap gap-1.5");
  });

  it("the three tiers are one size ladder: a shared base, and no two alike", () => {
    // BASE above is this file's copy of the constant at `miniButton.ts:12-13`.
    // Asserting the three exports actually open with it is what makes the copy
    // a check rather than a duplicate free to drift.
    const tiers = { miniBtnClass, miniBtnFillClass, miniBtnTonalClass };
    for (const [name, cls] of Object.entries(tiers)) {
      expect(cls.startsWith(BASE + " "), name + " does not open with the shared base").toBe(true);
    }
    expect(new Set(Object.values(tiers)).size).toBe(3);
  });
});
