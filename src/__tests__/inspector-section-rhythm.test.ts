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

/** What a content section in an inspector panel is spaced with. Margins, so
 *  adjacent sections collapse to one gap rather than summing two. */
const SECTION_SPACING = "mx-[12px] my-3.5";

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
