import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * The two inspector panels stack content sections the same way.
 *
 * This is a CLASS-CONTRACT guard, and it is worth saying plainly what that
 * means: it reads source text. It cannot see the rendered gap, because
 * happy-dom lays nothing out -- every rect is 0 and margins never collapse
 * there, so no test in this suite can measure the thing this rule is
 * actually about (`.claude/rules/verification.md`). What it can do is hold
 * the two panels to one spelling, which is how they drifted apart in the
 * first place: `McpServerDetail` spent `py-` where `AssetDetail` spent `my-`,
 * and padding does not collapse between siblings, so identical numbers drew
 * 28px in one panel and 14px in the other. The geometry is verified by
 * screenshot; this stops the spelling diverging again between screenshots.
 */

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/**
 * What a content section in an inspector panel is spaced with. Margins, so
 * adjacent sections collapse to one gap rather than summing two.
 *
 * 20px between sections, 8px from a section's heading to its own card.
 *
 * Where those come from, precisely, because the two halves are not sourced
 * equally. Apple's CURRENT HIG publishes no macOS spacing number at all --
 * it gives figures for tvOS and visionOS and, for macOS, only the principle:
 * "Make essential information easy to find by giving it sufficient space...
 * don't obscure it by crowding it with nonessential details."
 *
 * The numbers survive in the Aqua-era HIG, where Apple specified "8 pixels:
 * between section labels and first control" and "12 pixels: spacing between
 * control groups". The 8 is taken literally. The 12 is NOT: it describes a
 * 2009 preferences dialog of packed controls, it is tighter than the 14 this
 * panel already had, and Karthik's read was that 14 was crowded -- so
 * following it would move the wrong way. 20 is the margin Apple repeats
 * along window sides and bottoms throughout that same document, and it is
 * what this app's own chrome already echoes.
 *
 * So: 8 is Apple's, 20 is ours, chosen against Apple's stated principle
 * rather than a stated number. Said plainly here because a citation that
 * overstates its source is worse than none.
 *
 * The ratio is the part that matters. At 14/10 a heading was almost as far
 * from its own card as from the section above it, so proximity said nothing
 * about which content the heading belonged to. At 20/8 it binds.
 */
const SECTION_SPACING = "mx-[12px] my-5";

/** Gap from a section's heading row to the card beneath it. */
const HEADING_GAP = "mb-2";

describe("inspector section rhythm", () => {
  it("spaces MCP panel sections with the same class the skill panel uses", () => {
    const mcp = read("src/components/McpServerDetail.tsx");
    const match = mcp.match(/^const SECTION = "(.*)";$/m);
    expect(match, "McpServerDetail must declare a SECTION const").toBeTruthy();
    expect(match![1]).toBe(SECTION_SPACING);
  });

  it("spaces skill panel sections with that same class", () => {
    // Read from the other side too: pinning only McpServerDetail would let
    // AssetDetail move and call the pair consistent while they diverged.
    const asset = read("src/components/AssetDetail.tsx");
    const sections = [...asset.matchAll(/<section className="([^"]*)"/g)].map((m) => m[1]);
    expect(sections.length, "AssetDetail must render content sections").toBeGreaterThan(0);
    expect(new Set(sections)).toEqual(new Set([SECTION_SPACING]));
  });

  it("gives every section heading row the same gap to its card, in both panels", () => {
    // The second divergence, found the same way as the first: MCP spent
    // `mb-[10px]` where the skill panel spent `mb-3`. Both are section
    // heading rows; neither number was chosen against the other.
    for (const file of ["src/components/McpServerDetail.tsx", "src/components/AssetDetail.tsx"]) {
      const rows = [...read(file).matchAll(/className="flex items-(?:center|baseline) justify-between gap-2 (mb-[^"]*)"/g)];
      expect(rows.length, `${file} must have section heading rows`).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row[1], `${file}: heading row gap`).toBe(HEADING_GAP);
      }
    }
  });

  it("keeps padding off both, since padding between siblings does not collapse", () => {
    // The specific defect, named: `py-` here draws double the gap `my-` does
    // for the same number, and nothing on screen says which one a panel used.
    const mcp = read("src/components/McpServerDetail.tsx");
    const sectionConst = mcp.match(/^const SECTION = "(.*)";$/m)![1];
    expect(sectionConst).not.toMatch(/\bp[xy]?-/);
    const asset = read("src/components/AssetDetail.tsx");
    for (const cls of [...asset.matchAll(/<section className="([^"]*)"/g)].map((m) => m[1])) {
      expect(cls).not.toMatch(/\bp[xy]?-/);
    }
  });
});
