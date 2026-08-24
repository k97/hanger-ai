import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * `tbBtnClass` is a deliberate exception to "declared once": it exists
 * verbatim in two files. The ruling and its reasons are recorded at
 * `.claude/DESIGN.md` → "tbBtnClass is a real, deliberate exception" and in
 * the comment at `InspectorCap.tsx:79-81` — App's copy lives inside the
 * component body and is not exported, App keeps needing its own regardless,
 * and extracting a shared module would stale citations already written
 * against both files rather than remove a duplicate.
 *
 * Both halves of that reason still hold. What did not exist was anything to
 * notice the two copies DRIFTING: change one and the cap's Expand/Collapse
 * button silently stops matching the toolbar's buttons, with nothing red.
 * A duplicate taken on purpose needs a control, or it is just a duplicate.
 *
 * This reads source text, so it is disarmed by a rename or a move rather
 * than by a real change (`verification.md`). Both anchors therefore throw
 * when they stop matching, rather than quietly comparing nothing.
 */
const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, "..", "..", rel), "utf-8");

function tbBtnClassIn(rel: string): string {
  const src = read(rel);
  const m = /(?:^|\n)\s*const tbBtnClass\s*=\s*\n?\s*"([^"]+)";/.exec(src);
  if (!m) {
    throw new Error(
      `No \`const tbBtnClass = "…"\` found in ${rel}. If it was renamed or moved, ` +
        `repoint this guard at it — do not delete the guard, and do not repoint it ` +
        `at less than it read before.`
    );
  }
  return m[1];
}

describe("the tbBtnClass duplicate", () => {
  it("is byte-identical in both files that declare it", () => {
    const app = tbBtnClassIn("src/App.tsx");
    const cap = tbBtnClassIn("src/components/InspectorCap.tsx");
    expect(app.length, "App's copy is empty — the anchor matched nothing useful").toBeGreaterThan(80);
    expect(cap).toBe(app);
  });

  it("is still declared in exactly the two files the ruling names", () => {
    // A third copy is a different problem from drift, and the ruling covers
    // two files, not "however many appear later".
    const dir = path.resolve(__dirname, "..");
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) files.push(full);
      }
    };
    walk(dir);
    const declaring = files
      .filter((f) => /(?:^|\n)\s*const tbBtnClass\s*=/.test(fs.readFileSync(f, "utf-8")))
      .map((f) => path.relative(path.resolve(__dirname, "..", ".."), f))
      .sort();
    expect(declaring).toEqual(["src/App.tsx", "src/components/InspectorCap.tsx"]);
  });
});
