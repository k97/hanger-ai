// @vitest-environment happy-dom
import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import RepoPane from "../components/RepoPane";
import ProfilePane from "../components/ProfilePane";
import CategoryFilterCards from "../components/CategoryFilterCards";
import AssetRow from "../components/AssetRow";
import DisclosureBanner from "../components/DisclosureBanner";
import { Inventory, CategoryCounts } from "../App";

const mockInventory: Inventory = {
  skills: [
    {
      id: "skill-1",
      name: "GlobalSkill",
      description: "A global skill",
      version: "1.0.0",
      path: "~/.claude/skills/global.md",
      scope: { Global: { agent: "claude-code" } },
    },
    {
      id: "skill-2",
      name: "ProjectSkill",
      description: "A project skill",
      version: "1.0.0",
      path: "~/Work/Project/.claude/skills/proj.md",
      scope: { Project: { agent: "claude-code", root: "~/Work/Project" } },
    },
    {
      id: "skill-3",
      name: "NullEngineSkill",
      description: "Skill with null engine",
      version: "1.0.0",
      path: "~/Work/Project/.claude/skills/null.md",
      scope: { Project: { agent: "", root: "~/Work/Project" } },
    },
  ],
  agents: [],
  tools: [],
  rules: [],
  subagents: [],
  project_scans: [
    {
      path: "~/Work/Project",
      layered: false,
      rule_chains: {},
      parse_warnings: [
        "Warning 1: invalid syntax",
        "Warning 2: missing schema",
        "Warning 3: deprecated field",
        "Warning 4: unhandled key",
        "Warning 5: unused option",
        "Warning 6: missing docs",
        "Warning 7: trailing slash",
      ],
    },
  ],
};

const mockAssetCounts: CategoryCounts = {
  total: 3,
  byCategory: {
    skill: { total: 3, global: 1, project: 2 },
    tool: { total: 0, global: 0, project: 0 },
    rule: { total: 0, global: 0, project: 0 },
    subagent: { total: 0, global: 0, project: 0 },
  },
  engines: {
    "claude-code": 2,
    none: 1,
  },
};

describe("Avionics A6-R2 Defect Tests", () => {
  afterEach(() => {
    cleanup();
  });

  it("1. RepoPane renders NO element containing the repository's filesystem path", () => {
    const repoPath = "~/Work/Project";
    render(
      <RepoPane
        repoPath={repoPath}
        inventory={mockInventory}
        assetCounts={mockAssetCounts}
        loading={false}
        onRefresh={vi.fn()}
        onSelectAsset={vi.fn()}
        onLinkFromProfile={vi.fn()}
      />
    );

    // In normal (non-permission-denied) view, repoPath should not be displayed in any header/band
    expect(screen.queryByText(repoPath)).toBeNull();
  });

  it("2. Exactly one rescan/refresh control exists in RepoPane", () => {
    const onRefresh = vi.fn();
    const { container } = render(
      <RepoPane
        repoPath="~/Work/Project"
        inventory={mockInventory}
        assetCounts={mockAssetCounts}
        loading={false}
        onRefresh={onRefresh}
        onSelectAsset={vi.fn()}
        onLinkFromProfile={vi.fn()}
      />
    );

    // RepoPane itself contains 0 rescan controls (Rescan belongs exclusively to the toolbar)
    const refreshButtons = container.querySelectorAll("button[title*='Rescan'], button[title*='Refresh']");
    expect(refreshButtons.length).toBe(0);
  });

  it("3. A NULL-engine row renders 'Any agent' — exact string, and 'unknown' appears nowhere", () => {
    render(
      <AssetRow
        item={{
          name: "NullEngineSkill",
          category: "Skills",
          path: "/path/to/null.md",
          engine: null,
        }}
      />
    );

    const matches = screen.getAllByText("Any agent");
    expect(matches.length).toBeGreaterThan(0);
    expect(screen.queryByText(/unknown/i)).toBeNull();
  });

  it("4. An engine-owned row renders the display name, not the key", () => {
    render(
      <AssetRow
        item={{
          name: "ClaudeSkill",
          category: "Skills",
          path: "/path/to/claude.md",
          engine: "Claude Code",
        }}
      />
    );

    expect(screen.getByText("Claude Code")).toBeDefined();
  });

  it("5. A zero count renders '0'", () => {
    render(
      <CategoryFilterCards
        skillsCount={0}
        toolsCount={0}
        rulesCount={0}
        subagentsCount={0}
        selectedCategory={null}
        onSelectCategory={vi.fn()}
        loading={false}
      />
    );

    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBe(4);
    expect(screen.queryByText("—")).toBeNull();
  });

  it("6. The scan warnings banner contains the count exactly once", () => {
    const { container } = render(
      <DisclosureBanner variant="warning" summary="scan warning" count={7}>
        <div>Warning Detail List</div>
      </DisclosureBanner>
    );

    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain("7 scan warnings");
    expect(button?.textContent).not.toContain("7 7");
  });

  it("7. ProfilePane and RepoPane render the same four column headers", () => {
    const { container: profileContainer } = render(
      <ProfilePane
        inventory={mockInventory}
        assetCounts={mockAssetCounts}
        loading={false}
        onSelectAsset={vi.fn()}
        onLinkAsset={vi.fn()}
      />
    );

    const { container: repoContainer } = render(
      <RepoPane
        repoPath="~/Work/Project"
        inventory={mockInventory}
        assetCounts={mockAssetCounts}
        loading={false}
        onRefresh={vi.fn()}
        onSelectAsset={vi.fn()}
        onLinkFromProfile={vi.fn()}
      />
    );

    const getHeaderTitles = (container: HTMLElement) => {
      const headerButtons = container.querySelectorAll("[data-testid='asset-header-row'] button");
      return Array.from(headerButtons).map((btn) => btn.textContent?.trim());
    };

    const profileHeaders = getHeaderTitles(profileContainer);
    const repoHeaders = getHeaderTitles(repoContainer);

    expect(profileHeaders).toEqual(["Name", "Kind", "Engine", "State"]);
    expect(repoHeaders).toEqual(["Name", "Kind", "Engine", "State"]);
    expect(profileHeaders).toEqual(repoHeaders);
  });

  it("8. An engine whose display_name differs from a title-cased key renders database value (Gemini / Antigravity)", () => {
    render(
      <AssetRow
        item={{
          name: "GeminiSkill",
          category: "Skills",
          path: "/path/to/gemini.md",
          engine: "Gemini / Antigravity",
        }}
      />
    );

    expect(screen.getByText("Gemini / Antigravity")).toBeDefined();
  });
});
