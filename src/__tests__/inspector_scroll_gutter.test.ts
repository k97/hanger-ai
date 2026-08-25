import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// The inspector panel's left and right padding read unequal on a mouse-
// attached Mac left at the "Automatic" scrollbar setting: classic scrollbars
// take layout space at the container's inline end, so a child's symmetric
// `mx-[18px]` inset is measured from an edge already pushed inward (found
// 2026-08-24, AssetDetail.tsx). `scroll-gutter-stable` (index.css) reserves
// an equal gutter on both edges regardless of whether a scrollbar is drawn,
// and is a no-op under overlay scrollbars — so it belongs on every bare
// `overflow-y-auto` container in the inspector, the shape that put the inset
// on a child instead of the scroller itself.
//
// This file scans the five inspector components that share that shape,
// rather than pinning today's five call sites as a fixed list: a future
// bare `overflow-y-auto` added to one of these files without the utility
// fails this test, the way a snapshot of "five known lines" would not. The
// scan is intentionally NOT run over the whole of src/components — a
// scroller that carries its own inset (ProfilePane.tsx's bordered list,
// Flyout.tsx's `p-[18px]` container) legitimately does not need the gutter
// utility, and nothing in a plain text scan can distinguish "padding lives
// on the scroller, by design" from "padding lives on a child, by omission"
// across the whole component tree. Restricting the scan to the inspector
// files sidesteps that ambiguity rather than guessing at it: every scroller
// in this specific set is the bare-container shape, so the rule "carries
// scroll-gutter-stable" is unambiguous here even though it would not be
// everywhere.
const INSPECTOR_FILES = [
  "AssetDetail.tsx",
  "ReviewInspector.tsx",
  "LinkPanel.tsx",
  "McpServerDetail.tsx",
  "McpEngineSummary.tsx",
];

const COMPONENTS_DIR = path.resolve(__dirname, "../components");

function classNamesContaining(source: string, needle: string): string[] {
  const matches = source.match(/className="([^"]*)"/g) ?? [];
  return matches
    .map((m) => m.slice('className="'.length, -1))
    .filter((cls) => cls.split(/\s+/).includes(needle));
}

describe("scroll-gutter-stable is declared", () => {
  it("as a scrollbar-gutter: stable both-edges utility in index.css", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../styles/index.css"), "utf-8");
    expect(css).toMatch(
      /@utility scroll-gutter-stable \{[^}]*scrollbar-gutter:\s*stable both-edges;[^}]*\}/s
    );
  });
});

// The thin scrollbar (Karthik's ruling, 2026-08-25) pairs with the gutter
// above: a stock macOS classic scrollbar draws at ~15px, so shrinking it to
// 6px is what lets the panel's own inset shrink from 18px to 12px and still
// land near the original ~18px total. Two things must hold for that ruling
// to survive a future edit: the width stays 6px (a wider or narrower value
// throws the 12+6=18 arithmetic off), and the thumb colour is a design
// token, never a hardcoded hex or rgb() literal — the same guarantee
// `no-off-token-styles.test.ts` makes for `.tsx`, applied here to the one
// CSS file allowed to declare tokens in the first place.
describe("scroll-thin is declared", () => {
  const css = fs.readFileSync(path.resolve(__dirname, "../styles/index.css"), "utf-8");
  // Non-greedy up to the first line-initial "}" — the utility's three nested
  // ::-webkit-scrollbar rules all close on an indented "  }", so the first
  // unindented "}" is the outer utility's own close, not an inner one.
  const utilityMatch = css.match(/@utility scroll-thin \{([\s\S]*?)\n\}/);

  it("exists in index.css", () => {
    expect(utilityMatch, "@utility scroll-thin not found in index.css").not.toBeNull();
  });

  const body = utilityMatch?.[1] ?? "";

  it("sets the custom scrollbar to 6px", () => {
    expect(body).toMatch(/&::-webkit-scrollbar\s*\{[^}]*width:\s*6px;[^}]*\}/);
  });

  it("draws the thumb from a token, never a literal colour", () => {
    const thumbMatch = body.match(/&::-webkit-scrollbar-thumb\s*\{([^}]*)\}/);
    expect(thumbMatch, "scroll-thin has no ::-webkit-scrollbar-thumb rule").not.toBeNull();
    const thumbBody = thumbMatch?.[1] ?? "";
    expect(thumbBody).toMatch(/background-color:\s*var\(--[a-z0-9-]+\);/);
    expect(thumbBody).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(thumbBody).not.toMatch(/rgba?\(/);
  });

  it("gives the thumb a radius token, never a literal", () => {
    const thumbMatch = body.match(/&::-webkit-scrollbar-thumb\s*\{([^}]*)\}/);
    const thumbBody = thumbMatch?.[1] ?? "";
    expect(thumbBody).toMatch(/border-radius:\s*var\(--radius-[a-z0-9-]+\);/);
  });
});

describe("every bare overflow-y-auto scroll container in the inspector carries scroll-gutter-stable", () => {
  for (const file of INSPECTOR_FILES) {
    it(`${file}`, () => {
      const source = fs.readFileSync(path.join(COMPONENTS_DIR, file), "utf-8");
      const scrollers = classNamesContaining(source, "overflow-y-auto");
      // A file that stops being a scroll container entirely is not this
      // test's concern, but a file with zero matches here would silently
      // stop guarding anything — fail loudly instead of passing vacuously.
      expect(scrollers.length, `${file}: expected at least one overflow-y-auto container`).toBeGreaterThan(0);
      for (const cls of scrollers) {
        expect(
          cls.split(/\s+/),
          `${file}: found "overflow-y-auto" without "scroll-gutter-stable" in className="${cls}"`
        ).toContain("scroll-gutter-stable");
      }
    });
  }
});
