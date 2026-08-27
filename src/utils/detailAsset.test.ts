import { describe, it, expect } from "vitest";
import { buildDetailAsset } from "./detailAsset";

describe("buildDetailAsset", () => {
  it("threads the backend's resolved origin and origin_blocked onto the object handed to the inspector", () => {
    const asset = { name: "Provenance Skill", category: "Skills" as const, path: "/skills/prov/SKILL.md" };
    const fullAsset = {
      name: "Provenance Skill",
      version: "1.0.0",
      scope: { Project: { agent: "unknown", root: "/home/user/project" } },
      origin: { kind: "declared", label: "acme-plugin" },
      origin_blocked: false,
    };

    const built = buildDetailAsset(asset, fullAsset);

    expect(built.origin).toEqual({ kind: "declared", label: "acme-plugin" });
    expect(built.origin_blocked).toBe(false);
  });

  it("leaves origin_blocked=true intact — a distinct fact from no origin found", () => {
    const asset = { name: "Blocked Skill", category: "Skills" as const, path: "/skills/blocked/SKILL.md" };
    const fullAsset = {
      name: "Blocked Skill",
      scope: {},
      origin: undefined,
      origin_blocked: true,
    };

    const built = buildDetailAsset(asset, fullAsset);

    expect(built.origin).toBeUndefined();
    expect(built.origin_blocked).toBe(true);
  });

  it("leaves a Skills asset's details undefined — the inspector renders origin once, in its own row, not again as a composed subtitle", () => {
    const asset = { name: "Provenance Skill", category: "Skills" as const, path: "/skills/prov/SKILL.md" };
    const fullAsset = {
      name: "Provenance Skill",
      scope: {},
      source_origin: "some-plugin",
    };

    const built = buildDetailAsset(asset, fullAsset);

    expect(built.details).toBeUndefined();
  });

  it("leaves the Tools and Subagents details compositions untouched", () => {
    const toolBuilt = buildDetailAsset(
      { name: "srv", category: "Tools" as const, path: "/tools.json" },
      { name: "srv", scope: {}, command: "node", transport: "stdio" }
    );
    expect(toolBuilt.details).toBe("Command: node (Transport: stdio)");

    const subagentBuilt = buildDetailAsset(
      { name: "sa", category: "Subagents" as const, path: "/subagents/sa.md" },
      { name: "sa", scope: {}, declared_tools: ["Read", "Write"] }
    );
    expect(subagentBuilt.details).toBe("Declared Tools: Read, Write");
  });
});
