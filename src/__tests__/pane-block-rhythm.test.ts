import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { BLOCK_GAP } from "./spacingContract";

/**
 * The two content panes stack the same four blocks, and space them the same.
 *
 * Global (`ProfilePane`) and My machine (`RepoPane`) both lay out: a facet
 * row, a summary strip, optional disclosure cards, and the list. Every gap
 * between them is one value, and the horizontal inset is one value.
 *
 * They were not. Measured at 2x in the running app, Global drew 16px between
 * the facets and the strip (`pb-1.5` plus `mt-2.5`, which sum because padding
 * and margin do not collapse into each other), then 10px twice below it. My
 * machine drew 20px from strip to list, because its list card carried
 * `mt-2.5` and Global's carried nothing -- the same shape of divergence the
 * inspector panels had, in a second pair of files.
 *
 * A CLASS-CONTRACT guard, and the same caveat applies as to its sibling
 * `inspector-section-rhythm.test.ts`: this reads source text. happy-dom lays
 * nothing out, so no test here can measure a rendered gap. Screenshots verify
 * the geometry; this keeps the two panes spelling it the same way between
 * screenshots.
 */

const ROOT = path.resolve(__dirname, "../..");
const PANES = ["src/components/ProfilePane.tsx", "src/components/RepoPane.tsx"];

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** The pane's inset from the icon rail and from the window edge. */
const INSET = "18px";

describe("pane block rhythm", () => {
  it("gives the summary strip the same wrapper class in both panes", () => {
    for (const pane of PANES) {
      const m = read(pane).match(/<div className="(mx-\[[^\]]+\][^"]*)">\s*<SummaryStrip/);
      expect(m, `${pane}: summary strip wrapper`).toBeTruthy();
      expect(m![1]).toBe(`mx-[${INSET}] mb-${BLOCK_GAP}`);
    }
  });

  it("keeps the list card free of a top margin, in both panes", () => {
    // The actual divergence: RepoPane's list card carried `mt-2.5` and
    // ProfilePane's carried none, so the same relationship drew 20px in one
    // pane and 10px in the other. The gap belongs to the block above -- one
    // owner per gap, or two owners disagree and nothing on screen says which.
    for (const pane of PANES) {
      const m = read(pane).match(/className="@container flex-1 min-h-0 overflow-y-auto ([^"]*)"/);
      expect(m, `${pane}: list card`).toBeTruthy();
      expect(m![1], `${pane}: list card classes`).toContain(`mx-[${INSET}]`);
      expect(m![1], `${pane}: list card must not own its top gap`).not.toMatch(/\bmt-/);
    }
  });

  it("ends every block above the list with the same bottom gap", () => {
    // Each block owns the space beneath it. A block that ends on some other
    // number is the gap that reads wrong.
    for (const pane of PANES) {
      const src = read(pane);
      const wrappers = [...src.matchAll(/<div className="(?:px|mx)-\[18px\][^"]*"/g)].map((m) => m[0]);
      expect(wrappers.length, `${pane}: pane blocks`).toBeGreaterThan(0);
      for (const w of wrappers) {
        const gap = w.match(/\b[pm]b-([\d.]+)\b/);
        // The foot line has no block beneath it, so it owns no bottom gap.
        if (!gap) continue;
        expect(gap[1], `${pane}: ${w}`).toBe(BLOCK_GAP);
      }
    }
  });

  it("insets every pane block from the rail by the same amount", () => {
    for (const pane of PANES) {
      const insets = [...read(pane).matchAll(/\b(?:px|mx)-\[(\d+px)\]/g)].map((m) => m[1]);
      expect(insets.length, `${pane}: inset uses`).toBeGreaterThan(0);
      expect(new Set(insets), `${pane}: inset values`).toEqual(new Set([INSET]));
    }
  });
});
