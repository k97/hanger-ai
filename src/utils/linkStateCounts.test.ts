import { describe, it, expect } from "vitest";
import { needsReview, needsReviewCount } from "./linkStateCounts";
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

describe("needsReviewCount", () => {
  it("returns 0 for a null or clean inventory", () => {
    expect(needsReviewCount(null)).toBe(0);
    expect(needsReviewCount(emptyInventory)).toBe(0);
  });

  it("counts flagged assets across every category, once each", () => {
    const inventory: Inventory = {
      ...emptyInventory,
      skills: [
        // Broken-and-drifted still counts exactly once.
        { id: "1", name: "a", description: "", version: "1", path: "/a", parse_status: "failed", drifted: true },
        { id: "2", name: "b", description: "", version: "1", path: "/b" },
      ],
      tools: [
        { id: "3", name: "t", command: "", transport: "", config_path: "/t", scope: {}, owning_agent: "", link_state: "drifted" },
      ],
      rules: [
        { id: "4", name: "r", path: "/r", content: "", link_state: "linked" },
      ],
      subagents: [
        { id: "5", name: "s", description: "", path: "/s", declared_tools: [], link_state: "foreign" },
      ],
    };
    expect(needsReviewCount(inventory)).toBe(3);
  });
});
