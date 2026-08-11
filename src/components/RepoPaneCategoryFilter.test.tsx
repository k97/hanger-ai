// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RepoPane from "./RepoPane";

const mockInventory = {
  agents: [
    { id: "claude", name: "Claude", global_config_path: "/Users/test/.claude", project_footprints: ["/Users/test/Work"] }
  ],
  skills: [
    { id: "s1", name: "Work Skill", description: "", version: "1.0", path: "/Users/test/Work/.agents/skills/s1", scope: { Project: { agent: "claude", root: "/Users/test/Work" } } }
  ],
  tools: [
    { id: "t1", name: "Work Tool", command: "node", transport: "stdio", config_path: "/Users/test/Work/.mcp.json", scope: { Project: { agent: "claude", root: "/Users/test/Work" } }, owning_agent: "claude" }
  ],
  rules: [
    { id: "r1", name: "Work Rule", path: "/Users/test/Work/AGENTS.md", content: "# Rule", scope: { Project: { agent: "claude", root: "/Users/test/Work" } } }
  ],
  subagents: [],
  project_scans: [],
};

describe("RepoPane Category Filter Tiles Integration", () => {
  it("filters repo assets when stat cards are clicked and restores view on toggle", () => {
    render(
      <RepoPane
        repoPath="/Users/test/Work"
        inventory={mockInventory as any}
        loading={false}
        onRefresh={vi.fn()}
        onSelectAsset={vi.fn()}
        onLinkFromProfile={vi.fn()}
      />
    );

    // Initial state: all items visible
    expect(screen.getByText("Work Skill")).toBeTruthy();
    expect(screen.getByText("Work Tool")).toBeTruthy();
    expect(screen.getByText("Work Rule")).toBeTruthy();

    // Click Skills card to filter for Skills only
    const skillsCard = screen.getAllByText("Skills").find(el => el.closest("[tabindex]"))?.closest("[tabindex]");
    expect(skillsCard).toBeTruthy();
    fireEvent.click(skillsCard!);

    expect(screen.getByText("Work Skill")).toBeTruthy();
    expect(screen.queryByText("Work Tool")).toBeNull();
    expect(screen.queryByText("Work Rule")).toBeNull();

    // Click Skills card again to toggle filter off
    fireEvent.click(skillsCard!);

    expect(screen.getByText("Work Skill")).toBeTruthy();
    expect(screen.getByText("Work Tool")).toBeTruthy();
    expect(screen.getByText("Work Rule")).toBeTruthy();
  });
});
