// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import RepoPane from "./RepoPane";
import { Inventory } from "../App";

afterEach(() => {
  cleanup();
});

const mockInventory: Inventory = {
  agents: [],
  skills: [
    {
      id: "skill-1",
      name: "Project Skill",
      description: "local skill",
      version: "1.0.0",
      path: "/home/user/project/skills/local-skill",
      source_origin: "origin",
      scope: { Project: { agent: "unknown", root: "/home/user/project" } },
      source_path: "/home/user/.claude/skills/local-skill", // Has provenance!
      is_symlink: true,
    },
    {
      id: "skill-2",
      name: "Native Skill",
      description: "native local skill",
      version: "1.0.0",
      path: "/home/user/project/skills/native-skill",
      scope: { Project: { agent: "unknown", root: "/home/user/project" } },
      is_symlink: false,
      // No provenance (native)
    }
  ],
  tools: [],
  rules: [],
  subagents: [],
  project_scans: [],
};

describe("RepoPane Linking Gestures Integration", () => {
  it("should render unlink button only for rows with resolved provenance", () => {
    const handleSelectAsset = vi.fn();
    const handleRefresh = vi.fn();
    const handleLinkFromProfile = vi.fn();

    render(
      <RepoPane
        repoPath="/home/user/project"
        inventory={mockInventory}
        loading={false}
        onRefresh={handleRefresh}
        onSelectAsset={handleSelectAsset}
        onLinkFromProfile={handleLinkFromProfile}
      />
    );

    expect(screen.getByText("Project Skill")).toBeTruthy();
    expect(screen.getByText("Native Skill")).toBeTruthy();
    expect(screen.getByText("Symlinked")).toBeTruthy();
    expect(screen.getByText("Local only")).toBeTruthy();
  });

  it("should trigger onLinkFromProfile when empty-repo CTA button is clicked", () => {
    const handleSelectAsset = vi.fn();
    const handleRefresh = vi.fn();
    const handleLinkFromProfile = vi.fn();

    const emptyInventory: Inventory = {
      agents: [],
      skills: [],
      tools: [],
      rules: [],
      subagents: [],
      project_scans: [],
    };

    render(
      <RepoPane
        repoPath="/home/user/empty-project"
        inventory={emptyInventory}
        loading={false}
        onRefresh={handleRefresh}
        onSelectAsset={handleSelectAsset}
        onLinkFromProfile={handleLinkFromProfile}
      />
    );

    // Empty state CTA should be visible
    const ctaButton = screen.getByText("Link an asset from Profile");
    expect(ctaButton).toBeTruthy();

    fireEvent.click(ctaButton);
    expect(handleLinkFromProfile).toHaveBeenCalledTimes(1);
    expect(handleLinkFromProfile).toHaveBeenCalledWith("/home/user/empty-project");
  });
});
