// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ProfilePane from "./ProfilePane";
import { Inventory } from "../App";

afterEach(() => {
  cleanup();
});

// Mock mixed inventory with skills, tools, rules, and agents
const mockInventory: Inventory = {
  agents: [
    {
      id: "claude-code",
      name: "Claude Code",
      global_config_path: "/home/user/.claude",
      project_footprints: []
    }
  ],
  skills: [
    {
      id: "skill-1",
      name: "Claude Math Skill",
      description: "Math Solver",
      version: "1.0.0",
      path: "/home/user/.claude/skills/math",
      scope: { Global: { agent: "claude-code" } }
    }
  ],
  tools: [
    {
      id: "tool-1",
      name: "Node Runner Tool",
      command: "node",
      transport: "stdio",
      config_path: "/home/user/.claude/tools.json",
      scope: { Global: { agent: "claude-code" } },
      owning_agent: "claude-code"
    }
  ],
  rules: [
    {
      id: "rule-1",
      name: "CLAUDE.md",
      path: "/home/user/.claude/CLAUDE.md",
      content: "global rules",
      scope: { Global: { agent: "claude-code" } }
    }
  ],
  subagents: [],
  project_scans: []
};

describe("ProfilePane Component-Level Filtering Integration", () => {
  it("should update rendered lists correctly when category cards are toggled", () => {
    const handleSelectAsset = vi.fn();
    render(
      <ProfilePane
        inventory={mockInventory}
        loading={false}
        onSelectAsset={handleSelectAsset}
        onLinkAsset={vi.fn()}
      />
    );

    // Default view: all three assets (Skill, Tool, Rule) are present
    expect(screen.getByText("Claude Math Skill")).toBeTruthy();
    expect(screen.getByText("Node Runner Tool")).toBeTruthy();
    expect(screen.getByText("CLAUDE.md")).toBeTruthy();

    // Click on the MCP servers card
    const toolsCard = screen.getAllByText("MCP servers").find(el => el.closest("[tabindex]"))?.closest("[tabindex]");
    expect(toolsCard).toBeTruthy();
    fireEvent.click(toolsCard!);

    // Now, ONLY Node Runner Tool should be present. Skills and Rules must be absent!
    expect(screen.queryByText("Node Runner Tool")).toBeTruthy();
    expect(screen.queryByText("Claude Math Skill")).toBeNull();
    expect(screen.queryByText("CLAUDE.md")).toBeNull();

    // Click on "Skills" card
    const skillsCard = screen.getAllByText("Skills").find(el => el.closest("[tabindex]"))?.closest("[tabindex]");
    expect(skillsCard).toBeTruthy();
    fireEvent.click(skillsCard!);

    // Now, ONLY Claude Math Skill should be present. Tools and Rules must be absent!
    expect(screen.queryByText("Claude Math Skill")).toBeTruthy();
    expect(screen.queryByText("Node Runner Tool")).toBeNull();
    expect(screen.queryByText("CLAUDE.md")).toBeNull();

    // Click on "Skills" card again to clear filter back to All
    fireEvent.click(skillsCard!);
    expect(screen.getByText("Claude Math Skill")).toBeTruthy();
    expect(screen.getByText("Node Runner Tool")).toBeTruthy();
    expect(screen.getByText("CLAUDE.md")).toBeTruthy();
  });

  it("ProfilePane renders total and category card counts equal to get_asset_counts global counts", () => {
    const mockGlobalCounts = {
      total: 212,
      byCategory: {
        skill: { total: 244, global: 200, project: 44 },
        tool: { total: 10, global: 8, project: 2 },
        rule: { total: 5, global: 3, project: 2 },
        subagent: { total: 2, global: 1, project: 1 },
      },
    };

    render(
      <ProfilePane
        inventory={mockInventory}
        assetCounts={mockGlobalCounts}
        loading={false}
        onSelectAsset={vi.fn()}
        onLinkAsset={vi.fn()}
      />
    );

    // Chips render "{label}{count}" — the count span carries the global figure.
    const skillsCard = screen.getAllByText("Skills").find(el => el.closest("[tabindex]"))?.closest("[tabindex]");
    expect(skillsCard?.textContent).toBe("Skills200");

    const toolsCard = screen.getAllByText("MCP servers").find(el => el.closest("[tabindex]"))?.closest("[tabindex]");
    expect(toolsCard?.textContent).toBe("MCP servers8");

    const rulesCard = screen.getAllByText("Rules").find(el => el.closest("[tabindex]"))?.closest("[tabindex]");
    expect(rulesCard?.textContent).toBe("Rules3");

    const subagentsCard = screen.getAllByText("Subagents").find(el => el.closest("[tabindex]"))?.closest("[tabindex]");
    expect(subagentsCard?.textContent).toBe("Subagents1");
  });
});
