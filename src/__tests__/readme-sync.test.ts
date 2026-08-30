// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import mermaid from "mermaid";
import { BLOCK_NAMES, renderBlock, startMarker, endMarker, counts } from "./readmeCounts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readme = () => fs.readFileSync(path.join(ROOT, "README.md"), "utf-8");

describe("README counts", () => {
  it("no parse silently collects nothing", () => {
    // Covers both shapes counts() returns: a tally, and a roster of names. An
    // anchor that stops matching yields 0 or [], and either would render a
    // confident, wrong block rather than failing.
    for (const [k, v] of Object.entries(counts())) {
      const size = Array.isArray(v) ? v.length : v;
      expect(size, `${k} parsed to ${JSON.stringify(v)} — its anchor or regex stopped matching`).toBeGreaterThan(0);
    }
  });

  it("the tally and the roster agree, though they use different anchors", () => {
    // hosts counts `McpHost { id: "` (one line); hostNames collects
    // `display_name: "` (anywhere). rustfmt wraps at 100 and the longest HOSTS
    // line is already 94, so one longer display name would render a count above
    // a roster that disagrees with it, with both other tests still green.
    const c = counts();
    expect(c.engineNames.length, "engine tally and roster disagree").toBe(c.engines);
    expect(c.hostNames.length, "host tally and roster disagree").toBe(c.hosts);
  });

  it("every committed block matches a fresh generation", () => {
    const src = readme();
    for (const name of BLOCK_NAMES) {
      const a = src.indexOf(startMarker(name));
      const b = src.indexOf(endMarker(name));
      expect(a, `README.md has no ${startMarker(name)}`).toBeGreaterThan(-1);
      expect(b, `README.md has no ${endMarker(name)}`).toBeGreaterThan(-1);
      expect(src.slice(a, b + endMarker(name).length), `${name} block is stale`).toBe(renderBlock(name));
    }
  });
});

/** The section set .claude/rules/readme.md requires. */
const SECTIONS = [
  "## Quick start",
  "## How it works",
  "## Architecture",
  "## What Hanger looks for",
  "## Testing",
  "## Design decisions",
  "## Installation",
  "## Platform support",
];

describe("README diagrams", () => {
  /* The README's headline feature is three mermaid diagrams, and GitHub is
     the only place they render. v0.6.0 shipped with a broken one: a semicolon
     inside a `Note over` ends the statement, so the rest of the line parsed as
     garbage and GitHub printed "Unable to render rich display" on the front
     page. Reviewing the syntax by eye is what failed; this parses it. */
  it("every mermaid block parses", async () => {
    mermaid.initialize({ startOnLoad: false });
    const blocks = [...readme().matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1]);
    expect(blocks.length, "no mermaid blocks found — the fence syntax moved").toBeGreaterThan(0);
    for (const [i, block] of blocks.entries()) {
      await expect(
        mermaid.parse(block),
        `mermaid block ${i + 1} does not parse:\n${block}`,
      ).resolves.toBeTruthy();
    }
  });
});

describe("README structure", () => {
  it("carries every section the rule requires", () => {
    const src = readme();
    const missing = SECTIONS.filter((h) => !src.includes(`\n${h}\n`));
    expect(missing, `README.md is missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("every relative link and file:line citation resolves", () => {
    const src = readme();
    const problems: string[] = [];
    // The fragment is matched generically, then inspected. An earlier version
    // only matched `#Lnnn`, so `](docs/x.md#some-anchor)` failed to match the
    // pattern at all and the file behind it was never checked.
    for (const m of src.matchAll(/\]\((?!https?:|mailto:|#)([^)#\s]+)(?:#([^)\s]*))?\)/g)) {
      const [, rel, fragment] = m;
      const abs = path.join(ROOT, rel);
      if (!fs.existsSync(abs)) {
        problems.push(`${rel} does not exist`);
        continue;
      }
      const lines = fragment?.match(/^L(\d+)(?:-L(\d+))?$/);
      if (lines) {
        const total = fs.readFileSync(abs, "utf-8").split("\n").length;
        const highest = Number(lines[2] ?? lines[1]);
        if (highest > total) problems.push(`${rel}#${fragment} points past end of file (${total} lines)`);
      }
    }
    expect(problems, problems.join("; ")).toEqual([]);
  });
});
