import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * `Tool.args` is `#[serde(skip_serializing)]`, so it is absent from every IPC
 * payload and any read yields `undefined`. The Rust test in
 * `src-tauri/tests/ipc_boundary_tests.rs` asserts that property directly.
 *
 * This is the second line: it catches a frontend that starts reaching for raw
 * launch arguments again, which would now fail silently — `undefined` joins to
 * an empty string rather than throwing, so the bug would be a missing launch
 * rather than a crash.
 *
 * Any property read of `args` — `t.args`, `matches[0].args`,
 * `(row as ToolRow).args`. The negative lookbehind excludes `...args`, which is
 * a rest parameter, not a property read; `src/App.tsx`'s console wrappers use
 * it legitimately.
 *
 * An earlier version of this pattern required a bare identifier immediately
 * before the dot, which silently missed `matches[0].args` — the exact line this
 * guard was written to prevent. It would have shipped green.
 */
const OFFENDER = /(?<!\.)\.\s*args\b/;

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sources(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("raw launch arguments never reach the frontend", () => {
  it("no source reads .args off a tool or registration row", () => {
    const hits: string[] = [];
    for (const file of sources("src")) {
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        if (OFFENDER.test(line)) hits.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
