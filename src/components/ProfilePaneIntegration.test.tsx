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
        // mockInventory's one agent is Claude Code, so it belongs here too —
        // Task 11 gives Tools its own, more specific absence claim (Appendix
        // A.1) once engines are known to be detected; the generic
        // "No MCP servers in the global store" line this used to assert is
        // what A.1 replaces for exactly this category.
        detectedEngines={[{ id: "claude-code", name: "Claude Code" }]}
        onSelectAsset={vi.fn()}
        onLinkAsset={vi.fn()}
      />
    );
    expect(screen.getByText("No MCP servers registered")).toBeTruthy();
    expect(
      screen.getByText("Claude Code is installed here, but no engine has a server configured.")
    ).toBeTruthy();
    expect(screen.queryByText(/No global tools/)).toBeNull();
    expect(screen.queryByText("No MCP servers in the global store")).toBeNull();
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
    // Tools' own absence claim is Appendix A.1/A.2 (Task 11), tested in full
    // in the "Tools' own empty states" describe block below; this general
    // pattern test now exercises the Claude Code / A.1 shape its own
    // inventory fixture already implies, rather than the generic per-category
    // line A.1/A.2 replaced for Tools specifically.
    renderGlobal({
      inventory: { ...mockInventory, tools: [] },
      loading: false,
      scannedAt: new Date(),
      selectedCategory: "Tools",
      detectedEngines: [{ id: "claude-code", name: "Claude Code" }],
    });
    expect(screen.queryByTestId("scan-pending")).toBeNull();
    expect(screen.getByText("No MCP servers registered")).toBeTruthy();
    expect(
      screen.getByText("Claude Code is installed here, but no engine has a server configured.")
    ).toBeTruthy();
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

describe("ProfilePane — Tools' own empty states (Appendix A.1, A.2)", () => {
  // Reachable only by filtering to Tools with zero servers and a completed
  // scan — Task 10's chip exemption is what lets the chip be clicked at all
  // when its count is zero.
  const renderTools = (over: Partial<React.ComponentProps<typeof ProfilePane>>) =>
    render(
      <ProfilePane
        inventory={{ ...mockInventory, tools: [] }}
        loading={false}
        scannedAt={new Date()}
        selectedCategory="Tools"
        onSelectAsset={vi.fn()}
        onLinkAsset={vi.fn()}
        {...over}
      />
    );

  describe("A.1 — engines detected, zero MCP servers", () => {
    it("substitutes the template for three detected engines", () => {
      renderTools({
        detectedEngines: [
          { id: "claude-code", name: "Claude Code" },
          { id: "codex", name: "Codex" },
          { id: "gemini", name: "Gemini / Antigravity" },
        ],
        mcpCoverage: { checked_file_count: 5, checked_engine_count: 3, checked_files: [] },
      });
      expect(screen.getByText("No MCP servers registered")).toBeTruthy();
      expect(
        screen.getByText(
          "Claude Code, Codex and Gemini / Antigravity are installed here, but none has a server configured."
        )
      ).toBeTruthy();
      expect(screen.getByText("Checked 5 config files across 3 engines")).toBeTruthy();
    });

    it("truncates past three engines to 'and n others' — never a fixed list", () => {
      renderTools({
        detectedEngines: [
          { id: "a", name: "Claude Code" },
          { id: "b", name: "Codex" },
          { id: "c", name: "Gemini / Antigravity" },
          { id: "d", name: "Cursor" },
          { id: "e", name: "Zed" },
        ],
        mcpCoverage: { checked_file_count: 9, checked_engine_count: 5, checked_files: [] },
      });
      expect(
        screen.getByText(
          "Claude Code, Codex, Gemini / Antigravity and 2 others are installed here, but none has a server configured."
        )
      ).toBeTruthy();
    });

    it("reads in the singular for exactly one detected engine: is / no engine has", () => {
      renderTools({
        detectedEngines: [{ id: "claude-code", name: "Claude Code" }],
        mcpCoverage: { checked_file_count: 1, checked_engine_count: 1, checked_files: [] },
      });
      expect(
        screen.getByText("Claude Code is installed here, but no engine has a server configured.")
      ).toBeTruthy();
      expect(screen.getByText("Checked 1 config file across 1 engine")).toBeTruthy();
    });

    it("reads 'neither' for exactly two detected engines", () => {
      renderTools({
        detectedEngines: [
          { id: "claude-code", name: "Claude Code" },
          { id: "codex", name: "Codex" },
        ],
        mcpCoverage: { checked_file_count: 2, checked_engine_count: 2, checked_files: [] },
      });
      expect(
        screen.getByText("Claude Code and Codex are installed here, but neither has a server configured.")
      ).toBeTruthy();
    });

    it("the file/engine counts are the backend's own fields, not a derived length", () => {
      // Same three engines as the first case, but a coverage shape a
      // frontend-computed `.length` could never produce on its own —
      // proves the numbers rendered are `mcpCoverage`'s fields.
      renderTools({
        detectedEngines: [
          { id: "claude-code", name: "Claude Code" },
          { id: "codex", name: "Codex" },
          { id: "gemini", name: "Gemini / Antigravity" },
        ],
        mcpCoverage: { checked_file_count: 41, checked_engine_count: 7, checked_files: [] },
      });
      expect(screen.getByText("Checked 41 config files across 7 engines")).toBeTruthy();
    });

    it("has no primary action — Hanger does not author configs", () => {
      renderTools({
        detectedEngines: [{ id: "claude-code", name: "Claude Code" }],
        mcpCoverage: { checked_file_count: 1, checked_engine_count: 1, checked_files: [] },
      });
      expect(screen.queryByRole("button", { name: /add/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /rescan/i })).toBeNull();
    });

    it("[Show files] discloses the real paths read, one per line", () => {
      renderTools({
        detectedEngines: [{ id: "claude-code", name: "Claude Code" }],
        mcpCoverage: {
          checked_file_count: 2,
          checked_engine_count: 1,
          checked_files: ["~/.claude.json", "~/.claude/mcp.json"],
        },
      });
      expect(screen.queryByText("~/.claude.json")).toBeNull();
      fireEvent.click(screen.getByText("Show files"));
      expect(screen.getByText("~/.claude.json")).toBeTruthy();
      expect(screen.getByText("~/.claude/mcp.json")).toBeTruthy();
      fireEvent.click(screen.getByText("Hide files"));
      expect(screen.queryByText("~/.claude.json")).toBeNull();
    });

    it("does not offer the disclosure when there is nothing to show", () => {
      renderTools({
        detectedEngines: [{ id: "claude-code", name: "Claude Code" }],
        mcpCoverage: { checked_file_count: 0, checked_engine_count: 0, checked_files: [] },
      });
      expect(screen.queryByText("Show files")).toBeNull();
    });
  });

  describe("A.2 — no engines detected at all", () => {
    it("substitutes the registry's own roster, truncated past three", () => {
      renderTools({
        detectedEngines: [],
        knownEngines: [
          { id: "a", name: "Aardvark" },
          { id: "b", name: "Bandicoot" },
          { id: "c", name: "Capybara" },
          { id: "d", name: "Dingo" },
        ],
        knownEngineLocations: { location_count: 12, locations: [] },
      });
      expect(screen.getByText("No AI engines found")).toBeTruthy();
      expect(
        screen.getByText("Hanger looks for Aardvark, Bandicoot, Capybara and 1 other in their standard locations.")
      ).toBeTruthy();
      expect(screen.getByText("Checked 12 locations")).toBeTruthy();
    });

    it("reads the singular for exactly one checked location", () => {
      renderTools({
        detectedEngines: [],
        knownEngines: [{ id: "a", name: "Aardvark" }],
        knownEngineLocations: { location_count: 1, locations: [] },
      });
      expect(screen.getByText("Checked 1 location")).toBeTruthy();
    });

    it("[Show locations] discloses the real paths checked, one per line", () => {
      renderTools({
        detectedEngines: [],
        knownEngines: [{ id: "a", name: "Aardvark" }],
        knownEngineLocations: { location_count: 2, locations: ["~/.claude", "~/.codex"] },
      });
      expect(screen.queryByText("~/.claude")).toBeNull();
      fireEvent.click(screen.getByText("Show locations"));
      expect(screen.getByText("~/.claude")).toBeTruthy();
      expect(screen.getByText("~/.codex")).toBeTruthy();
    });

    it("adding a registry row changes the string with no copy edit — §6.5's exit criterion", () => {
      // The view renders whatever `knownEngines` it is given; nothing here
      // is a literal. A real registry row growing the table would flow
      // through `get_known_engines` the same way this synthetic one does.
      renderTools({
        detectedEngines: [],
        knownEngines: [
          { id: "a", name: "Aardvark" },
          { id: "b", name: "Bandicoot" },
          { id: "z", name: "Zorse" },
        ],
        knownEngineLocations: { location_count: 15, locations: [] },
      });
      expect(
        screen.getByText("Hanger looks for Aardvark, Bandicoot and Zorse in their standard locations.")
      ).toBeTruthy();
      expect(screen.getByText("Checked 15 locations")).toBeTruthy();
    });
  });

  describe("gating: pending is not empty, even for Tools' own states", () => {
    it("a rescan in flight shows the category spinner, never A.1 or A.2", () => {
      renderTools({
        loading: true,
        detectedEngines: [{ id: "claude-code", name: "Claude Code" }],
        mcpCoverage: { checked_file_count: 1, checked_engine_count: 1, checked_files: [] },
      });
      expect(screen.getByTestId("scan-pending")).toBeTruthy();
      expect(screen.getByText("Scanning your machine")).toBeTruthy();
      expect(screen.queryByText("No MCP servers registered")).toBeNull();
      expect(screen.queryByText("No AI engines found")).toBeNull();
    });

    it("before any scan has completed, neither A.1 nor A.2 renders", () => {
      render(
        <ProfilePane
          inventory={null}
          loading={false}
          scannedAt={null}
          selectedCategory="Tools"
          onSelectAsset={vi.fn()}
          onLinkAsset={vi.fn()}
          detectedEngines={[{ id: "claude-code", name: "Claude Code" }]}
        />
      );
      expect(screen.queryByText("No MCP servers registered")).toBeNull();
      expect(screen.queryByText("No AI engines found")).toBeNull();
    });
  });
});
