// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import App from "../App";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/plugin-log", () => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  attachConsole: vi.fn(() => Promise.resolve(() => {})),
}));

// Mock preferences store
const mockPreferences: Record<string, string> = {
  onboarding_complete: "true",
  consent_crash: "true",
  consent_usage: "true",
  sidebar_collapsed: "false",
  sidebar_width: "240",
  selected_sidebar_item: "profile",
  inspector_open: "false",
};

let eventListeners: Record<string, Function> = {};

// Mutable so individual tests can seed non-zero counts.
let mockAssetCounts: any = { total: 0, byCategory: {}, engines: {} };

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, callback: any) => {
    eventListeners[event] = callback;
    return Promise.resolve(() => {
      delete eventListeners[event];
    });
  }),
}));

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
    if (cmd === "get_linked_directories") return ["/Users/test/project-alpha"];
    if (cmd === "get_asset_counts") {
      return mockAssetCounts;
    }
    if (cmd === "get_inventory") {
      return { agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [] };
    }
    if (cmd === "start_scan") {
      setTimeout(() => {
        if (eventListeners["scan://complete"]) {
          eventListeners["scan://complete"]({ payload: { inventory: { agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [] } } });
        }
      }, 0);
      return "mock-scan-id-123";
    }
    return null;
  }),
}));

describe("Avionics A3 Toolbar Verification", () => {
  beforeEach(() => {
    cleanup();
    eventListeners = {};
    mockPreferences.inspector_open = "false";
    mockPreferences.selected_sidebar_item = "profile";
    mockAssetCounts = { total: 0, byCategory: {}, engines: {} };
  });

  it("theme control lives in the settings panel, not the toolbar", async () => {
    const { unmount } = render(<App />);
    await screen.findByLabelText("Refresh scan");

    // No theme control anywhere in the composed tree until settings opens
    expect(screen.queryByLabelText("Toggle theme colour")).toBeNull();
    expect(screen.queryByText("Dark")).toBeNull();

    // Open settings from the icon rail — the Light/Dark segment is the control
    fireEvent.click(screen.getByLabelText("Settings"));
    const darkButton = await screen.findByText("Dark");
    expect(screen.getAllByText("Dark")).toHaveLength(1);

    // Choosing Dark persists the preference
    fireEvent.click(darkButton);
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("set_preference", {
        key: "dark_mode",
        value: "true",
      });
    });
    unmount();
  });

  it("renders no filesystem path string in the toolbar region", async () => {
    mockPreferences.selected_sidebar_item = "/Users/test/project-alpha";
    const { unmount } = render(<App />);
    await screen.findByLabelText("Refresh scan");
    const header = screen.getByRole("banner");
    expect(header.textContent).not.toContain("/Users/test/project-alpha");
    expect(header.textContent).toContain("project-alpha");
    unmount();
  });

  it("puts rescan in the summary strip, not the toolbar, and fires its handler", async () => {
    const { unmount } = render(<App />);
    const refreshButton = await screen.findByLabelText("Refresh scan");
    expect(refreshButton).toBeTruthy();

    // It sits with the figure it refreshes, not in the window chrome.
    expect(screen.getByRole("banner").contains(refreshButton)).toBe(false);
    expect(screen.getByLabelText("Inventory summary").contains(refreshButton)).toBe(true);

    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("start_scan");
    });
    unmount();
  });

  it("persists inspector state across simulated restart", async () => {
    // 1. Initial render - inspector closed
    const first = render(<App />);
    const inspectorButton = await screen.findByLabelText("Toggle inspector");
    expect(inspectorButton).toBeTruthy();

    // Click inspector toggle
    fireEvent.click(inspectorButton);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("set_preference", {
        key: "inspector_open",
        value: "true",
      });
    });

    first.unmount();
    cleanup();

    // 2. Simulate app restart with persisted preference
    mockPreferences.inspector_open = "true";
    const second = render(<App />);

    const newInspectorButton = await screen.findByLabelText("Toggle inspector");
    expect(newInspectorButton).toBeTruthy();
    expect(newInspectorButton.className).toContain("bg-tint");
    second.unmount();
  });

  it("narrows visible rows through the toolbar filter field", async () => {
    mockAssetCounts = {
      total_assets: 2,
      skill: { total: 2, global: 2, project: 0 },
      engines: {},
    };
    const { unmount } = render(<App />);
    await screen.findByLabelText("Refresh scan");

    const inventory = {
      agents: [],
      tools: [],
      rules: [],
      subagents: [],
      project_scans: [],
      skills: [
        {
          id: "1",
          name: "alpha-skill",
          description: "",
          version: "1",
          path: "/global/alpha",
          scope: { Global: { agent: "claude" } },
        },
        {
          id: "2",
          name: "beta-skill",
          description: "",
          version: "1",
          path: "/global/beta",
          scope: { Global: { agent: "claude" } },
        },
      ],
    };
    eventListeners["scan://complete"]({ payload: { inventory } });

    await screen.findByText("alpha-skill");
    expect(screen.getByText("beta-skill")).toBeTruthy();

    const filterInput = screen.getByLabelText("Filter assets");
    fireEvent.change(filterInput, { target: { value: "alpha" } });

    await waitFor(() => {
      expect(screen.queryByText("beta-skill")).toBeNull();
    });
    expect(screen.getByText("alpha-skill")).toBeTruthy();
    unmount();
  });
});
