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
    if (cmd === "get_linked_directories") return [];
    if (cmd === "get_asset_counts") {
      return { total: 0, byCategory: {}, engines: {} };
    }
    if (cmd === "start_scan") {
      setTimeout(() => {
        if (eventListeners["scan://complete"]) {
          eventListeners["scan://complete"]({
            payload: {
              inventory: { agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [] },
            },
          });
        }
      }, 0);
      return "mock-scan-id";
    }
    return null;
  }),
}));

const flaggedInventory = {
  agents: [],
  rules: [],
  subagents: [],
  project_scans: [],
  skills: [
    { id: "1", name: "drifty-one", description: "", version: "1", path: "/g/one", drifted: true, scope: { Global: { agent: "claude" } } },
    { id: "2", name: "drifty-two", description: "", version: "1", path: "/g/two", drifted: true, scope: { Global: { agent: "claude" } } },
  ],
  tools: [
    { id: "3", name: "broken-tool", command: "x", transport: "stdio", config_path: "/g/tool", scope: { Global: { agent: "claude" } }, owning_agent: "claude", parse_status: "failed" },
  ],
};

describe("Icon rail", () => {
  beforeEach(() => {
    cleanup();
    eventListeners = {};
    mockPreferences.selected_sidebar_item = "profile";
  });

  it("renders the four rail sections", async () => {
    const { unmount } = render(<App />);
    await screen.findByTitle("My machine");
    expect(screen.getByTitle("Discovery")).toBeTruthy();
    expect(screen.getByTitle(/Needs review/)).toBeTruthy();
    expect(screen.getByTitle("Settings")).toBeTruthy();
    unmount();
  });

  it("switches to Discovery and persists the selection", async () => {
    const { unmount } = render(<App />);
    const discovery = await screen.findByTitle("Discovery");
    fireEvent.click(discovery);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("set_preference", {
        key: "selected_sidebar_item",
        value: "discovery",
      });
    });
    expect(discovery.getAttribute("aria-current")).toBe("true");
    unmount();
  });

  it("shows the flagged-asset count badge only when something needs review", async () => {
    const { unmount } = render(<App />);
    const needsReview = await screen.findByTitle(/Needs review/);
    expect(needsReview.textContent).toBe("");

    eventListeners["scan://complete"]({ payload: { inventory: flaggedInventory } });

    await waitFor(() => {
      expect(screen.getByTitle("Needs review — 3 flagged").textContent).toBe("3");
    });
    unmount();
  });

  it("toggles the needs-review filter on click", async () => {
    const { unmount } = render(<App />);
    const needsReview = await screen.findByTitle(/Needs review/);
    expect(needsReview.getAttribute("aria-current")).toBeNull();

    fireEvent.click(needsReview);
    expect(needsReview.getAttribute("aria-current")).toBe("true");

    fireEvent.click(needsReview);
    expect(needsReview.getAttribute("aria-current")).toBeNull();
    unmount();
  });
});
