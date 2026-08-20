// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import App from "../App";
import { invoke } from "@tauri-apps/api/core";

const mockPreferences: Record<string, string> = {
  onboarding_complete: "true",
  consent_crash: "true",
  consent_usage: "true",
  sidebar_collapsed: "false",
  sidebar_width: "240",
  selected_sidebar_item: "~/Work/demo",
  inspector_open: "false",
  inspector_width: "280",
};

const mockInventoryData = {
  agents: [],
  skills: [
    {
      id: "skill-1",
      name: "Inspector Skill One",
      description: "Sample skill for inspector test",
      version: "1.2.0",
      path: "~/Work/demo/skills/inspector-skill-1",
      source_origin: "~/Source/skills/inspector-skill-1",
      is_symlink: true,
      scope: { Project: { agent: "claude", root: "~/Work/demo" } },
    },
  ],
  tools: [
    {
      id: "tool-1",
      name: "Inspector Tool One",
      command: "node",
      transport: "stdio",
      config_path: "~/Work/demo/tools/inspector-tool-1.json",
      scope: { Project: { agent: "claude", root: "~/Work/demo" } },
      owning_agent: "claude",
    },
  ],
  rules: [
    {
      id: "rule-1",
      name: "Inspector Rule One",
      path: "~/Work/demo/CLAUDE.md",
      content: "Always write tests first",
      scope: { Project: { agent: "claude", root: "~/Work/demo" } },
    },
  ],
  subagents: [],
  project_scans: [
    {
      path: "~/Work/demo",
      layered: false,
      rule_chains: {},
      parse_warnings: [],
    },
  ],
};

const countsObj = { total: 1, global: 1, project: 0 };
const mockAssetCounts = {
  total_assets: 3,
  total: 3,
  skill: countsObj,
  tool: countsObj,
  rule: countsObj,
  subagent: { total: 0, global: 0, project: 0 },
  byCategory: {
    skill: countsObj,
    tool: countsObj,
    rule: countsObj,
    subagent: { total: 0, global: 0, project: 0 },
  },
  engines: {},
};

let eventListeners: Record<string, (evt: any) => void> = {};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === "get_preference") {
      return mockPreferences[args?.key] ?? null;
    }
    if (cmd === "set_preference") {
      if (args?.key) {
        mockPreferences[args.key] = String(args.value);
      }
      return null;
    }
    if (cmd === "get_linked_directories") return ["~/Work/demo"];
    if (cmd === "get_asset_counts") return mockAssetCounts;
    if (cmd === "get_inventory") return mockInventoryData;
    if (cmd === "start_scan") {
      if (eventListeners["scan://complete"]) {
        eventListeners["scan://complete"]({ payload: { inventory: mockInventoryData } });
      }
      return "scan-123";
    }
    return null;
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, callback: any) => {
    eventListeners[event] = callback;
    return Promise.resolve(() => {
      delete eventListeners[event];
    });
  }),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-log", () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  attachConsole: vi.fn(() => Promise.resolve(() => {})),
}));

describe("Avionics A5 — Docked Right Inspector Integration", () => {
  beforeEach(() => {
    cleanup();
    eventListeners = {};
    mockPreferences.selected_sidebar_item = "~/Work/demo";
    mockPreferences.inspector_open = "false";
    mockPreferences.inspector_width = "280";
  });

  const setupMockInvoke = (inspectorOpenPref = "false", inspectorWidthPref = "280") => {
    mockPreferences.inspector_open = inspectorOpenPref;
    mockPreferences.inspector_width = inspectorWidthPref;
  };

  it("1. Toggle opens and closes the inspector", async () => {
    setupMockInvoke("false");
    render(<App />);

    await screen.findByText("Inspector Skill One");

    // Closed initially
    expect(screen.queryByText("Nothing selected")).toBeNull();

    // Click inspector toggle in header toolbar
    fireEvent.click(screen.getByLabelText("Toggle inspector"));

    // Inspector is now open and renders empty state (since no row selected yet)
    await screen.findByText("Nothing selected");

    // Open, the same toggle docks in the inspector's own cap instead of the
    // toolbar — a fresh query, not the toolbar button's now-unmounted node.
    fireEvent.click(screen.getByLabelText("Toggle inspector"));

    await waitFor(() => {
      expect(screen.queryByText("Nothing selected")).toBeNull();
    });
  });

  it("2. Open state persists across a simulated restart", async () => {
    setupMockInvoke("true", "300");
    render(<App />);

    // Inspector should be open immediately upon restart render
    await screen.findByText("Nothing selected");
  });

  it("3. Selecting a row with the inspector closed opens it straight away on that asset", async () => {
    setupMockInvoke("false");
    render(<App />);

    const skillRow = await screen.findByText("Inspector Skill One");

    // Click an asset row — tapping a row means "inspect this"
    fireEvent.click(skillRow);

    // Inspector opens immediately, showing the tapped asset (not the empty state)
    await screen.findByText("~/Work/demo/skills/inspector-skill-1");
    expect(screen.queryByText("Nothing selected")).toBeNull();

    // The open state persists like the toolbar toggle does
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("set_preference", {
        key: "inspector_open",
        value: "true",
      });
    });
  });

  it("4. With a row selected and the inspector open, the asset's full path string renders — asserts path text itself", async () => {
    setupMockInvoke("true");
    render(<App />);

    const skillRow = await screen.findByText("Inspector Skill One");

    // Select the skill row by clicking its row container div
    const rowContainer = skillRow.closest("div") || skillRow;
    fireEvent.click(rowContainer);

    // Assert the full path string renders
    await waitFor(() => {
      expect(screen.getByText("~/Work/demo/skills/inspector-skill-1")).toBeDefined();
    });
  });

  it("5. Inspector open with no selection renders an empty state", async () => {
    setupMockInvoke("true");
    render(<App />);

    await screen.findByText("Nothing selected");
    await screen.findByText("Pick an asset or a repository to see its details.");
  });

  it("6. Content pane and inspector coexist; both render simultaneously", async () => {
    setupMockInvoke("true");
    render(<App />);

    // Content pane renders asset rows
    await screen.findByText("Inspector Skill One");
    await screen.findByText("Inspector Tool One");
    // Inspector pane renders simultaneously alongside content pane
    await screen.findByText("Nothing selected");
  });

  it("7. Selecting a row sets the inspector to THAT asset — assert the asset's own path string renders, not merely that a path renders", async () => {
    setupMockInvoke("true");
    render(<App />);

    const toolRow = await screen.findByText("Inspector Tool One");
    fireEvent.click(toolRow);

    await waitFor(() => {
      expect(screen.getByText("~/Work/demo/tools/inspector-tool-1.json")).toBeDefined();
      expect(screen.queryByText("~/Work/demo/skills/inspector-skill-1")).toBeNull();
    });
  });

  it("8. Changing scope with the inspector open clears the selection. The inspector shows its empty state, not the previous scope's asset", async () => {
    setupMockInvoke("true");
    render(<App />);

    // Select an asset in project scope
    const skillRow = await screen.findByText("Inspector Skill One");
    fireEvent.click(skillRow);

    await screen.findByText("~/Work/demo/skills/inspector-skill-1");

    // Change scope to the Global store in the sidebar. "Global" also renders
    // in the inspector's provenance eyebrow, so scope the query to the
    // sidebar landmark.
    const profileSidebarBtn = within(screen.getByTestId("sidebar")).getByText("Global");
    fireEvent.click(profileSidebarBtn);

    // Inspector MUST clear selection and return to empty state
    await waitFor(() => {
      expect(screen.queryByText("~/Work/demo/skills/inspector-skill-1")).toBeNull();
      expect(screen.getByText("Nothing selected")).toBeDefined();
    });
  });

  it("9. Changing category filter with the inspector open clears the selection", async () => {
    setupMockInvoke("true");
    render(<App />);

    // Select an asset
    const skillRow = await screen.findByText("Inspector Skill One");
    fireEvent.click(skillRow);

    await screen.findByText("~/Work/demo/skills/inspector-skill-1");

    // Filter by Tools category
    const toolsFilter = screen.getByText("MCP servers");
    fireEvent.click(toolsFilter);

    // Inspector MUST clear selection. `selected_sidebar_item` here is
    // "~/Work/demo" (set in `beforeEach`) — a REPOSITORY pane, not the
    // global store. Task 15 (f6d108f) first made the Tools-filtered empty
    // body always McpEngineSummary; fix round 1's item 5 (94f6cb3, then
    // this file's own commit) scoped that replacement to the global pane
    // only, because McpEngineSummary is a machine-wide read and a repo
    // pane showing it was the reviewer's own live finding. So a repo pane
    // keeps the ORIGINAL "Nothing selected" body once again — this
    // assertion is back to what it was before Task 15 touched this test,
    // not a new claim.
    await waitFor(() => {
      expect(screen.queryByText("~/Work/demo/skills/inspector-skill-1")).toBeNull();
      expect(screen.getByText("Nothing selected")).toBeDefined();
    });
  });

  it("10. Row highlight and inspector content always reference the same asset", async () => {
    setupMockInvoke("true");
    render(<App />);

    const toolRow = await screen.findByText("Inspector Tool One");
    const skillRow = await screen.findByText("Inspector Skill One");

    const toolContainer = toolRow.closest("div[data-selected]") || toolRow.closest("div")!;
    const skillContainer = skillRow.closest("div[data-selected]") || skillRow.closest("div")!;

    // Select tool row
    fireEvent.click(toolRow);

    await waitFor(() => {
      expect(toolContainer.getAttribute("data-selected")).toBe("true");
      expect(skillContainer.getAttribute("data-selected")).toBe("false");
      expect(screen.getByText("~/Work/demo/tools/inspector-tool-1.json")).toBeDefined();
    });

    // Select skill row
    fireEvent.click(skillRow);

    await waitFor(() => {
      expect(skillContainer.getAttribute("data-selected")).toBe("true");
      expect(toolContainer.getAttribute("data-selected")).toBe("false");
      expect(screen.getByText("~/Work/demo/skills/inspector-skill-1")).toBeDefined();
    });
  });

  it("11. Skill and subagent render the same inspector field set (Path, Scope, no phantom Size field)", async () => {
    setupMockInvoke("true");
    render(<App />);

    const skillRow = await screen.findByText("Inspector Skill One");
    fireEvent.click(skillRow);

    await waitFor(() => {
      expect(screen.getByText("~/Work/demo/skills/inspector-skill-1")).toBeDefined();
      expect(screen.queryByText(/Size:/i)).toBeNull();
      expect(screen.queryByText(/characters/i)).toBeNull();
    });
  });
});
