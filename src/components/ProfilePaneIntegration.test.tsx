// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
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

describe("ProfilePane — the empty state is a finding, not a default", () => {
  const renderGlobal = (over: Partial<React.ComponentProps<typeof ProfilePane>>) =>
    render(
      <ProfilePane
        inventory={null}
        loading={false}
        onSelectAsset={vi.fn()}
        onLinkAsset={vi.fn()}
        {...over}
      />
    );

  it("makes no claim before the first scan completes", () => {
    // Seen 2026-08-16: the first scan on a fresh store rendered a headline
    // denying the engine folders existed while the sidebar showed their marks.
    renderGlobal({ loading: true, scannedAt: null });
    expect(screen.getByTestId("scan-pending")).toBeTruthy();
    expect(screen.getByText("Scanning your machine")).toBeTruthy();
    // "once the scan finishes", not "as roots finish": inventory lands on
    // scan://complete only, so nothing here fills in root by root.
    expect(screen.getByText("Assets in the global store show up here once the scan finishes.")).toBeTruthy();
    expect(screen.queryByText("No engine folders on this machine yet")).toBeNull();
  });

  it("with no scan running and none finished, says so rather than 'nothing here'", () => {
    renderGlobal({ loading: false, scannedAt: null });
    // The strip's stamp says the same words; the claim under test is the plane's.
    expect(within(screen.getByTestId("scan-pending")).getByText("Not scanned yet")).toBeTruthy();
    expect(screen.getByText("Rescan when you're ready.")).toBeTruthy();
    expect(screen.queryByText("No engine folders on this machine yet")).toBeNull();
  });

  it("claims the store is empty only after a completed scan finds nothing", () => {
    renderGlobal({
      loading: false,
      scannedAt: new Date(),
      assetCounts: { total: 0, byCategory: {} },
    });
    expect(screen.queryByTestId("scan-pending")).toBeNull();
    expect(screen.getByText("No engine folders on this machine yet")).toBeTruthy();
  });

  it("names the right absence: engine folders present, nothing in them — and names the engines", () => {
    // The headline is decided by the filesystem probe (get_detected_engines),
    // not by assetCounts.engines — that map is built from asset rows and is
    // empty whenever the store is, so it cannot tell these two states apart.
    renderGlobal({
      loading: false,
      scannedAt: new Date(),
      assetCounts: { total: 0, byCategory: {} },
      detectedEngines: [{ id: "claude", name: "Claude Code" }, { id: "gemini", name: "Gemini CLI" }],
    });
    expect(screen.getByText("Nothing in the global store yet")).toBeTruthy();
    expect(
      screen.getByText(/Claude Code and Gemini CLI are here, but their global folders hold no skills, rules, MCP servers or subagents yet/)
    ).toBeTruthy();
    expect(screen.queryByText("No engine folders on this machine yet")).toBeNull();
  });

  it("one engine reads in the singular", () => {
    renderGlobal({
      loading: false,
      scannedAt: new Date(),
      assetCounts: { total: 0, byCategory: {} },
      detectedEngines: [{ id: "codex", name: "Codex" }],
    });
    expect(screen.getByText(/Codex is here, but its global folder holds no/)).toBeTruthy();
  });

  it("names the right absence: no engine folders at all", () => {
    renderGlobal({
      loading: false,
      scannedAt: new Date(),
      assetCounts: { total: 0, byCategory: {} },
      detectedEngines: [],
      knownEngines: [
        { id: "claude-code", name: "Claude Code" },
        { id: "codex", name: "Codex" },
      ],
    });
    expect(screen.getByText("No engine folders on this machine yet")).toBeTruthy();
    expect(screen.getByText(/Run one of them once, then rescan/)).toBeTruthy();
    expect(screen.queryByText("Nothing in the global store yet")).toBeNull();
  });

  it("the engines it says it looks for come from the backend, never a literal", () => {
    // This line named "Claude Code, Codex and Gemini" in the source and went
    // stale the day the backend's table grew to eight. A fictional roster
    // proves the sentence is rendering the prop, not a string in the file.
    renderGlobal({
      loading: false,
      scannedAt: new Date(),
      assetCounts: { total: 0, byCategory: {} },
      detectedEngines: [],
      knownEngines: [
        { id: "a", name: "Aardvark" },
        { id: "b", name: "Bandicoot" },
        { id: "c", name: "Capybara" },
      ],
    });
    expect(
      screen.getByText(
        /Hanger looks in your home directory for the folders Aardvark, Bandicoot and Capybara keep there/
      )
    ).toBeTruthy();
    expect(screen.queryByText(/Claude Code/)).toBeNull();
  });

  it("says something sane if the roster has not arrived yet", () => {
    // get_known_engines is fetched on mount and can lose the race, or fail.
    // The sentence drops the list rather than naming an empty one.
    renderGlobal({
      loading: false,
      scannedAt: new Date(),
      assetCounts: { total: 0, byCategory: {} },
      detectedEngines: [],
      knownEngines: [],
    });
    expect(
      screen.getByText(
        "Hanger looks in your home directory for the folders coding agents keep there, and found none. Run one once, then rescan."
      )
    ).toBeTruthy();
  });

  it("a category emptied by a filter says so; a category with nothing says that", () => {
    // mockInventory has one global skill and one global tool. A search that
    // hides the skill is not "no skills"; and the chip says MCP servers, so
    // an empty Tools view must never say "tools".
    const { unmount } = render(
      <ProfilePane
        inventory={mockInventory}
        loading={false}
        scannedAt={new Date()}
        selectedCategory="Skills"
        filterText="zzz-nothing"
        onSelectAsset={vi.fn()}
        onLinkAsset={vi.fn()}
      />
    );
    expect(screen.getByText("No skill matches that filter")).toBeTruthy();
    unmount();

    render(
      <ProfilePane
        inventory={{ ...mockInventory, tools: [] }}
        loading={false}
        scannedAt={new Date()}
        selectedCategory="Tools"
        onSelectAsset={vi.fn()}
        onLinkAsset={vi.fn()}
      />
    );
    expect(screen.getByText("No MCP servers in the global store")).toBeTruthy();
    expect(screen.queryByText(/No global tools/)).toBeNull();
  });

  it("a re-scan is pending, not an empty claim, even though an earlier scan already finished", () => {
    // Regression: `hasScanned` alone gated the absence claim. The store's
    // own state (inventory, assetCounts) does not reset when Rescan is
    // clicked -- it only changes on scan://complete -- so if the store was
    // already empty before this rescan, `loading` going true is the only
    // signal that distinguishes "still empty" from "don't know yet, a fresh
    // answer is coming". Without consulting it, the plane keeps asserting
    // "nothing here" for the whole rescan.
    renderGlobal({
      loading: true,
      scannedAt: new Date(),
      assetCounts: { total: 0, byCategory: {} },
    });
    expect(screen.getByTestId("scan-pending")).toBeTruthy();
    expect(screen.getByText("Scanning your machine")).toBeTruthy();
    expect(screen.queryByText("No engine folders on this machine yet")).toBeNull();
    expect(screen.queryByText("Nothing in the global store yet")).toBeNull();
  });

  it("filtering to a category with nothing in it, mid-scan, is pending -- not an absence claim", () => {
    // storeEmpty is false here (skills and rules are present), so the
    // whole-store planes never fire; the category branch is what has to
    // answer for a filtered, empty Tools view while a rescan is running.
    renderGlobal({
      inventory: { ...mockInventory, tools: [] },
      loading: true,
      scannedAt: new Date(),
      selectedCategory: "Tools",
    });
    expect(screen.getByTestId("scan-pending")).toBeTruthy();
    expect(screen.getByText("Scanning your machine")).toBeTruthy();
    expect(screen.getByText("MCP servers show up here once the scan finishes.")).toBeTruthy();
    expect(screen.queryByText("No MCP servers in the global store")).toBeNull();
  });

  it("filtering to a category with nothing in it, scan finished, correctly claims the absence", () => {
    renderGlobal({
      inventory: { ...mockInventory, tools: [] },
      loading: false,
      scannedAt: new Date(),
      selectedCategory: "Tools",
    });
    expect(screen.queryByTestId("scan-pending")).toBeNull();
    expect(screen.getByText("No MCP servers in the global store")).toBeTruthy();
    expect(screen.getByText("The scan finished without finding any.")).toBeTruthy();
  });

  // One of everything, at Global scope, so emptying a single category for
  // the loop below never makes the WHOLE store look empty and trip the
  // planes this suite already covers above.
  const oneOfEveryCategory: Inventory = {
    agents: [{ id: "a1", name: "Claude Code", global_config_path: "/home/user/.claude", project_footprints: [] }],
    skills: [{ id: "s1", name: "S", description: "", version: "1.0.0", path: "/s", scope: { Global: { agent: "a1" } } }],
    tools: [{ id: "t1", name: "T", command: "x", transport: "stdio", config_path: "/t", scope: { Global: { agent: "a1" } }, owning_agent: "a1" }],
    rules: [{ id: "r1", name: "R", path: "/r", content: "x", scope: { Global: { agent: "a1" } } }],
    subagents: [{ id: "sa1", name: "SA", description: "", path: "/sa", declared_tools: [], scope: { Global: { agent: "a1" } } }],
    project_scans: [],
  };

  it.each([
    ["Skills", "skills"],
    ["Tools", "MCP servers"],
    ["Rules", "rules"],
    ["Subagents", "subagents"],
    ["Agents", "agents"],
  ] as const)("category %s gets its own pending state mid-scan, named with its own noun", (category, noun) => {
    const emptiedField =
      category === "Skills" ? "skills" :
      category === "Tools" ? "tools" :
      category === "Rules" ? "rules" :
      category === "Subagents" ? "subagents" : "agents";
    renderGlobal({
      inventory: { ...oneOfEveryCategory, [emptiedField]: [] },
      loading: true,
      scannedAt: new Date(),
      selectedCategory: category,
    });
    expect(screen.getByTestId("scan-pending")).toBeTruthy();
    expect(screen.getByText("Scanning your machine")).toBeTruthy();
    expect(screen.getByText(`${noun} show up here once the scan finishes.`)).toBeTruthy();
  });
});
