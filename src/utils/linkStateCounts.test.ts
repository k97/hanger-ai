import { describe, it, expect } from "vitest";
import {
  needsReview,
  classifyAsset,
  matchesStateFilter,
  linkStateCounts,
} from "./linkStateCounts";
import type { Inventory } from "../App";

const emptyInventory: Inventory = {
  skills: [],
  agents: [],
  tools: [],
  rules: [],
  subagents: [],
  project_scans: [],
};

describe("needsReview", () => {
  it("flags broken, drifted and foreign link states", () => {
    expect(needsReview({ link_state: "broken" })).toBe(true);
    expect(needsReview({ link_state: "drifted" })).toBe(true);
    expect(needsReview({ link_state: "foreign" })).toBe(true);
  });

  it("flags parse failures and the legacy drifted boolean", () => {
    expect(needsReview({ parse_status: "failed" })).toBe(true);
    expect(needsReview({ drifted: true })).toBe(true);
  });

  it("passes linked and local assets", () => {
    expect(needsReview({ link_state: "linked" })).toBe(false);
    expect(needsReview({})).toBe(false);
  });
});

describe("classifyAsset", () => {
  it("gives broken precedence over drifted, and drifted over linked", () => {
    expect(classifyAsset({ parse_status: "failed", drifted: true })).toBe("broken");
    expect(classifyAsset({ link_state: "drifted", is_symlink: true })).toBe("drifted");
    expect(classifyAsset({ link_state: "foreign" })).toBe("drifted");
  });

  it("treats symlinks and tracked copies as linked, both field spellings", () => {
    expect(classifyAsset({ is_symlink: true })).toBe("linked");
    expect(classifyAsset({ isSymlink: true })).toBe("linked");
    expect(classifyAsset({ source_path: "/src" })).toBe("linked");
    expect(classifyAsset({ sourcePath: "/src" })).toBe("linked");
    expect(classifyAsset({})).toBe("local");
  });
});

describe("matchesStateFilter", () => {
  it("passes everything with no filter and maps needs-review to broken+drifted", () => {
    expect(matchesStateFilter({}, null)).toBe(true);
    expect(matchesStateFilter({ drifted: true }, "needs-review")).toBe(true);
    expect(matchesStateFilter({ parse_status: "failed" }, "needs-review")).toBe(true);
    expect(matchesStateFilter({ is_symlink: true }, "needs-review")).toBe(false);
    expect(matchesStateFilter({ is_symlink: true }, "linked")).toBe(true);
    expect(matchesStateFilter({}, "local")).toBe(true);
    expect(matchesStateFilter({}, "linked")).toBe(false);
  });
});

describe("linkStateCounts", () => {
  const inventory: Inventory = {
    ...emptyInventory,
    skills: [
      { id: "1", name: "g1", description: "", version: "1", path: "/g1", scope: { Global: { agent: "claude" } }, is_symlink: true },
      { id: "2", name: "g2", description: "", version: "1", path: "/g2", scope: { Global: { agent: "claude" } }, drifted: true },
      { id: "3", name: "p1", description: "", version: "1", path: "/repo/p1", scope: { Project: { agent: "claude", root: "/repo" } }, parse_status: "failed" },
      { id: "4", name: "p2", description: "", version: "1", path: "/repo/p2", scope: { Project: { agent: "claude", root: "/repo" } } },
      { id: "5", name: "other", description: "", version: "1", path: "/other/p", scope: { Project: { agent: "claude", root: "/other" } } },
    ],
    tools: [
      { id: "6", name: "t", command: "", transport: "", config_path: "/gt", scope: { Global: { agent: "claude" } }, owning_agent: "claude" },
    ],
  };

  it("splits the global scope by state", () => {
    expect(linkStateCounts(inventory, { kind: "global" })).toEqual({
      linked: 1,
      drifted: 1,
      broken: 0,
      local: 1,
      total: 3,
    });
  });

  it("splits a repo scope by state and excludes other roots", () => {
    expect(linkStateCounts(inventory, { kind: "repo", root: "/repo" })).toEqual({
      linked: 0,
      drifted: 0,
      broken: 1,
      local: 1,
      total: 2,
    });
  });

  it("returns zeros for a null inventory", () => {
    expect(linkStateCounts(null, { kind: "global" }).total).toBe(0);
  });
});

describe("linkStateCounts restricted to one category", () => {
  const categoryInventory: Inventory = {
    ...emptyInventory,
    skills: [
      { id: "1", name: "s1", description: "", version: "1", path: "/s1", scope: { Global: { agent: "claude" } }, is_symlink: true },
    ],
    rules: [
      { id: "2", name: "r1", path: "/r1", content: "", scope: { Global: { agent: "claude" } } },
    ],
    tools: [
      { id: "3", name: "t1", command: "", transport: "", config_path: "/t1", scope: { Global: { agent: "claude" } }, owning_agent: "claude" },
    ],
  };

  it("counts all four categories with no category given", () => {
    expect(linkStateCounts(categoryInventory, { kind: "global" }).total).toBe(3);
  });

  it("restricts to Skills", () => {
    expect(linkStateCounts(categoryInventory, { kind: "global" }, "Skills")).toEqual({
      linked: 1,
      drifted: 0,
      broken: 0,
      local: 0,
      total: 1,
    });
  });

  it("restricts to Rules", () => {
    expect(linkStateCounts(categoryInventory, { kind: "global" }, "Rules")).toEqual({
      linked: 0,
      drifted: 0,
      broken: 0,
      local: 1,
      total: 1,
    });
  });

  it("counts nothing for Agents", () => {
    expect(linkStateCounts(categoryInventory, { kind: "global" }, "Agents").total).toBe(0);
  });
});

describe("annotationStateCounts", () => {
  it("splits by the backend's mechanism words, symlink and copy both counting as linked", async () => {
    const { annotationStateCounts } = await import("./linkStateCounts");
    const counts = annotationStateCounts([
      { mechanism: "symlink" },
      { mechanism: "copy" },
      { mechanism: "drift" },
      { mechanism: "broken" },
      { mechanism: "none" },
      { mechanism: "none" },
    ]);
    expect(counts).toEqual({ linked: 2, drifted: 1, broken: 1, local: 2, total: 6 });
  });
});
