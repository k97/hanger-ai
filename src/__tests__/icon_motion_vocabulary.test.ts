import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// The icon-motion vocabulary (docs/v5-animate-icons/00-state-inventory.md §2).
// Longhand only: aim-loop/aim-once compose on top by setting iteration-count
// and fill-mode, and the reduced-motion kill at the foot of index.css resets
// the longhands via the `animation` shorthand — a shorthand here would both
// break composition and dodge that kill.
const css = fs.readFileSync(path.resolve(__dirname, "../styles/index.css"), "utf-8");

const UTILITIES = [
  "aim-part", "aim-spin", "aim-spin-ccw", "aim-draw", "aim-scan",
  "aim-seek", "aim-burst", "aim-relay", "aim-stagger", "aim-loop", "aim-once",
];

describe("the icon-motion vocabulary", () => {
  it("declares every utility", () => {
    for (const u of UTILITIES) {
      expect(css, `@utility ${u} missing`).toMatch(new RegExp(`@utility ${u} \\{`));
    }
  });

  it("never uses the animation shorthand inside an aim utility", () => {
    const blocks = css.match(/@utility aim-[\s\S]*?\n\}/g) ?? [];
    expect(blocks.length).toBeGreaterThanOrEqual(UTILITIES.length);
    for (const b of blocks) {
      expect(b, `shorthand in: ${b.slice(0, 40)}`).not.toMatch(/[^-]animation:\s/);
    }
  });

  it("keeps the reduced-motion kill that silences all of it", () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce/);
    expect(css).toMatch(/animation: none !important/);
  });

  it("pins the two rules: loop is infinite, once holds both ends", () => {
    expect(css).toMatch(/@utility aim-loop \{[^}]*animation-iteration-count: infinite;[^}]*\}/s);
    expect(css).toMatch(/@utility aim-once \{[^}]*animation-iteration-count: 1;[^}]*animation-fill-mode: both;[^}]*\}/s);
  });

  it("pins the origin mechanism: aim-part reads --ox/--oy, defaulting to the grid centre", () => {
    expect(css).toMatch(/@utility aim-part \{[^}]*transform-box: view-box;[^}]*transform-origin: var\(--ox, 12px\) var\(--oy, 12px\);[^}]*\}/s);
  });

  // happy-dom does not compile Tailwind's `@utility` at-rule syntax or
  // resolve computed animation state (no dashoffset/fill-mode timeline), so
  // this pins the CSS declaration itself rather than asserting the resolved
  // rendering — declaration-only, not behavioural.

  it("pins aim-loop's backwards fill, the guard against a staggered loop's first-cycle blink", () => {
    // Without a backwards fill, a delayed element in a looping stagger group
    // (aim-loop + aim-stagger, e.g. Link2Icon's 110ms/220ms delays) renders
    // its un-animated state through the delay — for aim-draw that's
    // stroke-dashoffset's default of 0, fully drawn — then snaps to the 0%
    // frame's dashoffset:1 (invisible) the instant the delay ends and the
    // animation starts: a visible blink before the first draw. `backwards`,
    // not `both`: the loop is infinite, so there is no natural end for a
    // forwards fill to hold.
    expect(css).toMatch(/@utility aim-loop \{[^}]*animation-fill-mode: backwards;[^}]*\}/s);
  });
});
