// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RepoPane from "./RepoPane";
import { Inventory } from "../App";

const mockInventoryWithTccWarning: Inventory = {
  agents: [],
  skills: [],
  tools: [],
  rules: [],
  subagents: [],
  project_scans: [
    {
      path: "/home/user/project",
      parse_warnings: [
        "Permission denied: /home/user/project",
        "Malformed frontmatter in skill at /home/user/project/SKILL.md"
      ],
      layered: false,
      rule_chains: {}
    }
  ]
};

describe("RepoPane TCC Warnings Relocation", () => {
  it("should render macOS Folder Scan Access Denied box when a permission warning exists", () => {
    const handleSelectAsset = vi.fn();
    const handleRefresh = vi.fn();
    const handleLinkFromProfile = vi.fn();

    render(
      <RepoPane
        repoPath="/home/user/project"
        inventory={mockInventoryWithTccWarning}
        loading={false}
        onRefresh={handleRefresh}
        onSelectAsset={handleSelectAsset}
        onLinkFromProfile={handleLinkFromProfile}
      />
    );

    // Verify TCC Fix Panel header
    expect(screen.getByText("macOS Folder Scan Access Denied")).toBeDefined();
    
    // Verify TCC Fix Panel button
    expect(screen.getByText("Retry Scan")).toBeDefined();

    // Verify normal warnings list is rendered via DisclosureBanner
    const warningBanner = screen.getByRole("button", { name: /1 scan warning/i });
    expect(warningBanner).toBeDefined();
    fireEvent.click(warningBanner);
    expect(screen.getByText("Malformed frontmatter in skill at /home/user/project/SKILL.md")).toBeDefined();
    expect(screen.queryByText("Permission denied: /home/user/project")).toBeNull();
  });
});
