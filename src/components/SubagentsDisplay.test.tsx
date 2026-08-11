// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ProfilePane from "./ProfilePane";
import { Inventory } from "../App";

afterEach(() => {
  cleanup();
});

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
  tools: [],
  rules: [],
  subagents: [
    {
      id: "subagent-1",
      name: "Local Coder Subagent",
      description: "Writes code using edit_file",
      path: "/home/user/.claude/agents/coder.md",
      declared_tools: ["edit_file", "grep_search"],
      scope: { Global: { agent: "claude-code" } }
    }
  ],
  project_scans: []
};

describe("ProfilePane Subagents Rendering and Gating Integration", () => {
  it("should render subagents", () => {
    const handleSelectAsset = vi.fn();
    const handleLinkAsset = vi.fn();

    render(
      <ProfilePane
        inventory={mockInventory}
        loading={false}
        onSelectAsset={handleSelectAsset}
        onLinkAsset={handleLinkAsset}
      />
    );

    // Verify subagent info is visible
    expect(screen.getByText("Local Coder Subagent")).toBeTruthy();
  });

  it("should filter for Subagents only when the Subagents card is selected", () => {
    const handleSelectAsset = vi.fn();

    render(
      <ProfilePane
        inventory={mockInventory}
        loading={false}
        onSelectAsset={handleSelectAsset}
        onLinkAsset={vi.fn()}
      />
    );

    // Both skill and subagent are rendered initially
    expect(screen.queryByText("Claude Math Skill")).toBeTruthy();
    expect(screen.queryByText("Local Coder Subagent")).toBeTruthy();

    // Click on "Subagents" card
    const subagentsCard = screen.getAllByText("Subagents").find(el => el.closest("[tabindex]"))?.closest("[tabindex]");
    expect(subagentsCard).toBeTruthy();
    fireEvent.click(subagentsCard!);

    // Now, ONLY Local Coder Subagent should be present. Skills must be absent!
    expect(screen.queryByText("Local Coder Subagent")).toBeTruthy();
    expect(screen.queryByText("Claude Math Skill")).toBeNull();

    // Clear filter
    fireEvent.click(subagentsCard!);
    expect(screen.queryByText("Claude Math Skill")).toBeTruthy();
    expect(screen.queryByText("Local Coder Subagent")).toBeTruthy();
  });
});
