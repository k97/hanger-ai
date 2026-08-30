import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { renderCountsBlock, counts, START, END } from "./readmeCounts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readme = () => fs.readFileSync(path.join(ROOT, "README.md"), "utf-8");

describe("README counts", () => {
  it("no parse silently collects nothing", () => {
    for (const [k, v] of Object.entries(counts())) {
      expect(v, `${k} parsed to ${v} — its anchor or regex stopped matching`).toBeGreaterThan(0);
    }
  });

  it("the committed block matches a fresh generation", () => {
    const src = readme();
    const s = src.indexOf(START);
    const e = src.indexOf(END);
    expect(s, `README.md has no ${START} marker`).toBeGreaterThan(-1);
    expect(e, `README.md has no ${END} marker`).toBeGreaterThan(-1);
    expect(src.slice(s, e + END.length)).toBe(renderCountsBlock());
  });
});
