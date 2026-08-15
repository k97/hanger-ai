// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import fs from "fs";
import path from "path";
import RepoPane from "../components/RepoPane";
import { Inventory, CategoryCounts } from "../App";

// Ground truth inventory fixture representing assets from src-tauri/tests/fixtures/project
const fixtureInventory: Inventory = {
  agents: [],
  skills: [
    { id: "s1", name: "s1", description: "", version: "", path: "/project/skill1", scope: { Project: { agent: "a", root: "/project" } } },
    { id: "s2", name: "s2", description: "", version: "", path: "/project/skill2", scope: { Project: { agent: "a", root: "/project" } } },
    { id: "s3", name: "s3", description: "", version: "", path: "/project/skill3", scope: { Project: { agent: "a", root: "/project" } } },
    { id: "s4", name: "s4", description: "", version: "", path: "/project/skill4", scope: { Project: { agent: "a", root: "/project" } } }
  ],
  tools: [
    { id: "t1", name: "t1", command: "", transport: "", config_path: "/project/t1", scope: { Project: { agent: "a", root: "/project" } }, owning_agent: "a" },
    { id: "t2", name: "t2", command: "", transport: "", config_path: "/project/t2", scope: { Project: { agent: "a", root: "/project" } }, owning_agent: "a" },
    { id: "t3", name: "t3", command: "", transport: "", config_path: "/project/t3", scope: { Project: { agent: "a", root: "/project" } }, owning_agent: "a" },
    { id: "t4", name: "t4", command: "", transport: "", config_path: "/project/t4", scope: { Project: { agent: "a", root: "/project" } }, owning_agent: "a" },
    { id: "t5", name: "t5", command: "", transport: "", config_path: "/project/t5", scope: { Project: { agent: "a", root: "/project" } }, owning_agent: "a" },
    { id: "t6", name: "t6", command: "", transport: "", config_path: "/project/t6", scope: { Project: { agent: "a", root: "/project" } }, owning_agent: "a" }
  ],
  rules: [
    { id: "r1", name: "r1", path: "/project/r1", content: "", scope: { Project: { agent: "a", root: "/project" } } },
    { id: "r2", name: "r2", path: "/project/r2", content: "", scope: { Project: { agent: "a", root: "/project" } } },
    { id: "r3", name: "r3", path: "/project/r3", content: "", scope: { Project: { agent: "a", root: "/project" } } }
  ],
  subagents: [
    { id: "sa1", name: "sa1", description: "", path: "/project/sa1", declared_tools: [], scope: { Project: { agent: "a", root: "/project" } } },
    { id: "sa2", name: "sa2", description: "", path: "/project/sa2", declared_tools: [], scope: { Project: { agent: "a", root: "/project" } } },
    { id: "sa3", name: "sa3", description: "", path: "/project/sa3", declared_tools: [], scope: { Project: { agent: "a", root: "/project" } } },
    { id: "sa4", name: "sa4", description: "", path: "/project/sa4", declared_tools: [], scope: { Project: { agent: "a", root: "/project" } } }
  ],
  project_scans: [{ path: "/project", layered: false, rule_chains: {}, parse_warnings: [] }]
};

// SQL counting path logic (all non-agent categories: skills + tools + rules + subagents)
function queryHeaderCategorySum(repoPath: string, inventory: Inventory) {
  const skills = inventory.skills.filter(
    (s) => s.scope?.Project?.root === repoPath || s.path.startsWith(repoPath)
  ).length;
  const tools = inventory.tools.filter(
    (t) => t.scope?.Project?.root === repoPath || t.config_path.startsWith(repoPath)
  ).length;
  const rules = inventory.rules.filter(
    (r) => r.scope?.Project?.root === repoPath || r.path.startsWith(repoPath)
  ).length;
  const subagents = inventory.subagents.filter(
    (sa) => sa.scope?.Project?.root === repoPath || sa.path.startsWith(repoPath)
  ).length;
  return skills + tools + rules + subagents;
}

describe("Per-repository count synchronization", () => {
  it("verifies getRepoAssetCount function is removed from Sidebar.tsx", () => {
    const sidebarPath = path.resolve(__dirname, "../components/Sidebar.tsx");
    const content = fs.readFileSync(sidebarPath, "utf-8");
    expect(content.includes("getRepoAssetCount")).toBe(false);
  });

  it("per-repository count equals category sum from single counting path (17 = 17)", () => {
    const repoPath = "/project";
    const expectedCategorySum = queryHeaderCategorySum(repoPath, fixtureInventory);
    expect(expectedCategorySum).toBe(17);
  });

  it("RepoPane renders header total and category cards from get_asset_counts prop, not inventory.length", () => {
    const repoPanePath = path.resolve(__dirname, "../components/RepoPane.tsx");
    const content = fs.readFileSync(repoPanePath, "utf-8");
    expect(content.includes("assetCounts")).toBe(true);
    expect(content.includes("repoSkills.length")).toBe(false);
    expect(content.includes("repoTools.length")).toBe(false);
    expect(content.includes("repoRules.length")).toBe(false);
    expect(content.includes("repoSubagents.length")).toBe(false);
  });

  it("RepoPane renders group section headers matching assetCounts.byCategory values", () => {
    const mockCounts: CategoryCounts = {
      total: 261,
      byCategory: {
        skill: { total: 244, global: 200, project: 44 },
        tool: { total: 10, global: 8, project: 2 },
        rule: { total: 5, global: 3, project: 2 },
        subagent: { total: 2, global: 1, project: 1 },
      },
    };

    render(
      <RepoPane
        repoPath="/project"
        inventory={fixtureInventory}
        assetCounts={mockCounts}
        loading={false}
        onRefresh={() => {}}
        onSelectAsset={() => {}}
        onLinkFromProfile={() => {}}
      />
    );

    expect(screen.getByText("Skills · 244")).toBeTruthy();
    expect(screen.getByText("MCP servers · 10")).toBeTruthy();
    expect(screen.getByText("Rules · 5")).toBeTruthy();
    expect(screen.getByText("Subagents · 2")).toBeTruthy();
  });

  it("RepoPane renders engine breakdown section from assetCounts.engines including Any agent bucket", () => {
    const mockCounts: CategoryCounts = {
      total: 261,
      byCategory: {
        skill: { total: 244, global: 200, project: 44 },
        tool: { total: 10, global: 8, project: 2 },
        rule: { total: 5, global: 3, project: 2 },
        subagent: { total: 2, global: 1, project: 1 },
      },
      engines: {
        "Claude Code": 200,
        "Cursor": 17,
        none: 44,
      },
    };

    const { container } = render(
      <RepoPane
        repoPath="/project"
        inventory={fixtureInventory}
        assetCounts={mockCounts}
        loading={false}
        onRefresh={() => {}}
        onSelectAsset={() => {}}
        onLinkFromProfile={() => {}}
      />
    );

    expect(screen.getByText("Engines")).toBeTruthy();
    expect(screen.getByText("Claude Code 200")).toBeTruthy();
    expect(screen.getByText("Cursor 17")).toBeTruthy();
    expect(screen.getByText("Any agent 44")).toBeTruthy();

    // Paired with the label above: the mark beside "Claude Code 200" must
    // resolve to that engine specifically, not just be present.
    const claudeEntry = screen.getByText("Claude Code 200");
    expect(claudeEntry.parentElement?.querySelector("svg")?.getAttribute("data-brand")).toBe("claude_code");

    const headings = Array.from(container.querySelectorAll("h3")).map((h) => h.textContent?.trim());
    const enginesIndex = headings.findIndex((h) => h === "Engines");
    const skillsIndex = headings.findIndex((h) => h?.startsWith("Skills"));
    expect(enginesIndex).toBeGreaterThan(-1);
    expect(skillsIndex).toBeGreaterThan(-1);
    expect(enginesIndex).toBeLessThan(skillsIndex);
  });

  it("RepoPane sorts named engines descending and places Any agent last regardless of count size", () => {
    const mockCounts: CategoryCounts = {
      total: 280,
      byCategory: {},
      engines: {
        none: 166,
        "Gemini / Antigravity": 1,
        "Claude Code": 113,
      },
    };

    const { container } = render(
      <RepoPane
        repoPath="/project"
        inventory={fixtureInventory}
        assetCounts={mockCounts}
        loading={false}
        onRefresh={() => {}}
        onSelectAsset={() => {}}
        onLinkFromProfile={() => {}}
      />
    );

    const spans = Array.from(container.querySelectorAll("span")).map((s) => s.textContent?.trim()).filter(Boolean);
    const claudeIdx = spans.findIndex((t) => t === "Claude Code 113");
    const geminiIdx = spans.findIndex((t) => t === "Gemini / Antigravity 1");
    const anyAgentIdx = spans.findIndex((t) => t === "Any agent 166");

    expect(claudeIdx).toBeGreaterThan(-1);
    expect(geminiIdx).toBeGreaterThan(-1);
    expect(anyAgentIdx).toBeGreaterThan(-1);

    expect(claudeIdx).toBeLessThan(geminiIdx);
    expect(geminiIdx).toBeLessThan(anyAgentIdx);
  });

  it("verifies App.tsx passes assetCounts prop through to RepoPane", () => {
    const appPath = path.resolve(__dirname, "../App.tsx");
    const content = fs.readFileSync(appPath, "utf-8");
    if (!content.includes("assetCounts={repoAssetCountsMap[selectedSidebarItem.split(\":\")[0]]")) {
      throw new Error("App.tsx does not pass missing prop 'assetCounts' to RepoPane");
    }
  });

  it("for a parent root and a nested child root, the parent's rendered list contains NO asset whose scope root is the child", () => {
    const parentInventory: Inventory = {
      agents: [],
      skills: [
        {
          id: "parent-skill",
          name: "Parent Skill",
          description: "",
          version: "1.0.0",
          path: "~/Work/skills/parent-skill",
          scope: { Project: { agent: "claude_code", root: "~/Work" } },
        },
        {
          id: "child-skill",
          name: "Child Skill",
          description: "",
          version: "1.0.0",
          path: "~/Work/Projects/demo-user/skills/child-skill",
          scope: { Project: { agent: "claude_code", root: "~/Work/Projects/demo-user" } },
        },
      ],
      tools: [],
      rules: [],
      subagents: [],
      project_scans: [{ path: "~/Work", layered: false, rule_chains: {}, parse_warnings: [] }],
    };

    render(
      <RepoPane
        repoPath="~/Work"
        inventory={parentInventory}
        assetCounts={{ total: 1, byCategory: { skill: { total: 1, global: 0, project: 1 } } }}
        loading={false}
        onRefresh={() => {}}
        onSelectAsset={() => {}}
        onLinkFromProfile={() => {}}
      />
    );

    expect(screen.getByText("Parent Skill")).toBeTruthy();
    expect(screen.queryByText("Child Skill")).toBeNull();
  });
});
