import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * The neutral ramp (--n-0 … --n-950) is legacy and INCOHERENT IN DARK MODE:
 * tokens.css declares thirteen stops in :root but .dark redefines only four
 * (--n-0 … --n-100), so any consumer of --n-200 or darker would render its
 * LIGHT value in dark mode (findings.md F11).
 *
 * As of 2026-08-14 the ramp has zero consumers — every surface uses the
 * semantic tokens (bg-plane, text-ink-2, border-line …). Rather than define
 * nine dark values for tokens nothing reads, this guard keeps the consumer
 * count at zero so the defect can never express.
 *
 * If you actually need a neutral here: use a semantic token. If you truly
 * need the ramp: define the missing .dark stops in tokens.css first, then
 * delete this guard in the same commit and say so.
 */

const SRC_ROOT = path.resolve(__dirname, "..");
const TOKEN_FILES = new Set(["styles/tokens.css", "styles/index.css"]);

// bg-n-200, text-n-700, border-n-500 … — anchored so duration-200 and
// friends cannot match.
const UTILITY_CONSUMER =
  /\b(?:bg|text|border|from|to|via|fill|stroke|ring|divide|outline|accent|caret|decoration|shadow|placeholder)-n-(?:0|25|50|100|200|300|400|500|600|700|800|900|950)\b/;
const VAR_CONSUMER = /var\(\s*--n-(?:0|25|50|100|200|300|400|500|600|700|800|900|950)\b/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx|css)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("Neutral ramp stays unconsumed", () => {
  const files = sourceFiles(SRC_ROOT).filter(
    (f) => !TOKEN_FILES.has(path.relative(SRC_ROOT, f))
  );

  it("scans a non-trivial file set", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("no component consumes any --n-* stop, as utility or var()", () => {
    const violations: string[] = [];
    for (const file of files) {
      const rel = path.relative(SRC_ROOT, file);
      fs.readFileSync(file, "utf-8")
        .split("\n")
        .forEach((line, i) => {
          if (UTILITY_CONSUMER.test(line) || VAR_CONSUMER.test(line)) {
            violations.push(`${rel}:${i + 1}: ${line.trim()}`);
          }
        });
    }
    expect(
      violations,
      `Neutral-ramp consumers found. The ramp renders LIGHT values in dark ` +
        `mode for --n-200 and darker (findings.md F11). Use a semantic token, ` +
        `or define the missing .dark stops and delete this guard:\n` +
        violations.join("\n")
    ).toEqual([]);
  });
});
