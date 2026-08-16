// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
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
        scannedAt={new Date()}
        onRefresh={handleRefresh}
        onSelectAsset={handleSelectAsset}
        onLinkFromProfile={handleLinkFromProfile}
      />
    );

    // Empty state CTA should be visible
    const ctaButton = screen.getByText("Link an asset from Global");
    expect(ctaButton).toBeTruthy();

    fireEvent.click(ctaButton);
    expect(handleLinkFromProfile).toHaveBeenCalledTimes(1);
    expect(handleLinkFromProfile).toHaveBeenCalledWith("/home/user/empty-project");
  });
});

describe("RepoPane — the empty state is a finding, not a default", () => {
  const emptyInventory: Inventory = {
    agents: [],
    skills: [],
    tools: [],
    rules: [],
    subagents: [],
    project_scans: [],
  };

  const renderRepo = (over: Partial<React.ComponentProps<typeof RepoPane>>) =>
    render(
      <RepoPane
        repoPath="/home/user/empty-project"
        inventory={emptyInventory}
        loading={false}
        onRefresh={vi.fn()}
        onSelectAsset={vi.fn()}
        onLinkFromProfile={vi.fn()}
        {...over}
      />
    );

  it("makes no claim before the first scan completes", () => {
    // Seen 2026-08-16: mid-scan the pane said the repository held no assets
    // while the sidebar was already counting 82 for it.
    renderRepo({ loading: true, scannedAt: null });
    expect(screen.getByTestId("scan-pending")).toBeTruthy();
    expect(screen.getByText("Scanning your machine")).toBeTruthy();
    expect(screen.getByText("Assets in empty-project show up here once the scan finishes.")).toBeTruthy();
    expect(screen.queryByText("Nothing in empty-project yet")).toBeNull();
    expect(screen.queryByText("Link an asset from Global")).toBeNull();
  });

  it("with no scan running and none finished, says so rather than 'nothing here'", () => {
    renderRepo({ loading: false, scannedAt: null });
    // The strip's stamp says the same words; the claim under test is the plane's.
    expect(within(screen.getByTestId("scan-pending")).getByText("Not scanned yet")).toBeTruthy();
    expect(screen.getByText("Rescan when you're ready.")).toBeTruthy();
    expect(screen.queryByText("Nothing in empty-project yet")).toBeNull();
  });

  it("claims the repository is empty only after a completed scan finds nothing", () => {
    renderRepo({ loading: false, scannedAt: new Date(), assetCounts: { total: 0, byCategory: {} } });
    expect(screen.queryByTestId("scan-pending")).toBeNull();
    expect(screen.getByText("Nothing in empty-project yet")).toBeTruthy();
    expect(screen.getByText("Link an asset from Global")).toBeTruthy();
  });

  it("a category emptied by a filter says so; a category with nothing says that", () => {
    // Skills exist in this repo, so "no skills here" would be false when a
    // search is what hid them. The chip says MCP servers, so the copy must
    // never say "tools".
    const { unmount } = render(
      <RepoPane
        repoPath="/home/user/project"
        inventory={mockInventory}
        loading={false}
        scannedAt={new Date()}
        selectedCategory="Skills"
        filterText="zzz-nothing"
        onRefresh={vi.fn()}
        onSelectAsset={vi.fn()}
        onLinkFromProfile={vi.fn()}
      />
    );
    expect(screen.getByText("No skill matches that filter")).toBeTruthy();
    unmount();

    render(
      <RepoPane
        repoPath="/home/user/project"
        inventory={mockInventory}
        loading={false}
        scannedAt={new Date()}
        selectedCategory="Tools"
        onRefresh={vi.fn()}
        onSelectAsset={vi.fn()}
        onLinkFromProfile={vi.fn()}
      />
    );
    expect(screen.getByText("No MCP servers in project")).toBeTruthy();
    expect(screen.queryByText(/tools/i)).toBeNull();
  });
});
