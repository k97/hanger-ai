import { describe, it, expect } from "vitest";
import { DIRECTORIES, TIERS } from "../data/directories";
import { kindCounts, matchesDirectory } from "./directoryFacets";

describe("Directory catalogue", () => {
  it("is broad enough to be worth browsing", () => {
    expect(DIRECTORIES.length).toBeGreaterThanOrEqual(30);
  });

  it("gives every entry an https url, a two-letter mark and at least one kind", () => {
    for (const dir of DIRECTORIES) {
      expect(dir.url.startsWith("https://"), `${dir.name} url`).toBe(true);
      expect(dir.mark, `${dir.name} mark`).toMatch(/^[a-z0-9]{2}$/);
      expect(dir.kinds.length, `${dir.name} kinds`).toBeGreaterThan(0);
      expect(dir.desc.length, `${dir.name} desc`).toBeGreaterThan(40);
      expect(dir.fetch.length, `${dir.name} fetch`).toBeGreaterThan(0);
    }
  });

  it("names each entry exactly once", () => {
    const seen = new Set(DIRECTORIES.map((d) => d.name));
    expect(seen.size).toBe(DIRECTORIES.length);
  });

  it("places every entry in a declared tier, and every tier carries entries", () => {
    const tiers = new Set(TIERS.map((t) => t.tier));
    for (const dir of DIRECTORIES) {
      expect(tiers.has(dir.tier), `${dir.name} tier`).toBe(true);
    }
    for (const t of TIERS) {
      expect(
        DIRECTORIES.some((d) => d.tier === t.tier),
        `${t.tier} has entries`
      ).toBe(true);
    }
  });

  it("covers the whole ecosystem, not just skills", () => {
    const kinds = new Set(DIRECTORIES.flatMap((d) => d.kinds));
    for (const expected of ["Skills", "Plugins", "Subagents", "MCP servers", "Rules", "Commands"]) {
      expect(kinds.has(expected), `catalogue covers ${expected}`).toBe(true);
    }
  });
});

describe("kindCounts", () => {
  it("leads with All and totals the catalogue", () => {
    const facets = kindCounts(DIRECTORIES);
    expect(facets[0].kind).toBe("All");
    expect(facets[0].count).toBe(DIRECTORIES.length);
  });

  it("counts an entry once per kind it carries, most common first", () => {
    const facets = kindCounts([
      { mark: "aa", name: "A", url: "https://a.dev", tier: "Community", kinds: ["Skills"], fetch: "x", desc: "d" },
      { mark: "bb", name: "B", url: "https://b.dev", tier: "Community", kinds: ["Skills", "Plugins"], fetch: "x", desc: "d" },
    ]);
    expect(facets).toEqual([
      { kind: "All", count: 2 },
      { kind: "Skills", count: 2 },
      { kind: "Plugins", count: 1 },
    ]);
  });
});

describe("matchesDirectory", () => {
  const entry = {
    mark: "sh",
    name: "skills.sh",
    url: "https://skills.sh",
    tier: "Community" as const,
    kinds: ["Skills", "Commands"],
    fetch: "npx skills add <repo>",
    desc: "A distribution hub organised by the agent that consumes the skill.",
  };

  it("passes everything when the facet is All and the query is empty", () => {
    expect(matchesDirectory(entry, "All", "")).toBe(true);
  });

  it("narrows by kind", () => {
    expect(matchesDirectory(entry, "Skills", "")).toBe(true);
    expect(matchesDirectory(entry, "MCP servers", "")).toBe(false);
  });

  it("searches name, url, description, kind and tier", () => {
    expect(matchesDirectory(entry, "All", "skills.sh")).toBe(true);
    expect(matchesDirectory(entry, "All", "distribution")).toBe(true);
    expect(matchesDirectory(entry, "All", "commands")).toBe(true);
    expect(matchesDirectory(entry, "All", "community")).toBe(true);
    expect(matchesDirectory(entry, "All", "postgres")).toBe(false);
  });

  it("ignores case and surrounding whitespace in the query", () => {
    expect(matchesDirectory(entry, "All", "  SKILLS.SH ")).toBe(true);
  });
});
