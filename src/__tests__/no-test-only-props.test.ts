import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * `forceShed` is production code whose only caller is a test, taken
 * deliberately: the real shed is measured off `scrollWidth`/`clientWidth`,
 * and `happy-dom` lays nothing out — its `ResizeObserver` exists but
 * `observe()` never fires, and both measurements stay 0 — so a test cannot
 * drive the collapsed states any other way (`InspectorCap.tsx:65-69`).
 *
 * That reason still holds. What nothing checked is the failure it invites:
 * a production call site passing `forceShed` pins the cap to one shed level
 * and disables the measured path entirely (`:141` returns early whenever the
 * prop is defined). Nothing would go red — the suite drives this prop on
 * purpose, so it cannot tell a test's use from a caller's.
 *
 * A test-only escape hatch that production may pass is not an escape hatch.
 */
const SRC = path.resolve(__dirname, "..");
const ROOT = path.resolve(__dirname, "..", "..");

const productionFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...productionFiles(full));
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
};

describe("test-only props stay out of production call sites", () => {
  it("declares forceShed exactly once, and no production file passes it", () => {
    const files = productionFiles(SRC);

    const declaring = files.filter((f) => /forceShed\?:/.test(fs.readFileSync(f, "utf-8")));
    // If this stops matching, the prop was renamed or removed — repoint or
    // delete this guard deliberately, rather than letting it pass on nothing.
    expect(
      declaring.map((f) => path.relative(ROOT, f)),
      "forceShed?: is no longer declared where this guard expects it"
    ).toEqual(["src/components/InspectorCap.tsx"]);

    // A JSX prop or an object property handing it a value, anywhere in
    // production. The declaration itself (`forceShed?:`) and the destructure
    // (`forceShed,`) are not call sites.
    const passing: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf-8");
      const rel = path.relative(ROOT, f);
      for (const [i, line] of src.split("\n").entries()) {
        if (/forceShed\s*[=:]\s*[^:]/.test(line) && !/forceShed\?:/.test(line)) {
          passing.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      }
    }
    expect(passing, `production call sites passing forceShed:\n${passing.join("\n")}`).toEqual([]);
  });
});
