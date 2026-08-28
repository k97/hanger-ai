// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import App from "../App";

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

let searchAnswer: { hits: any[]; total: number } = { hits: [], total: 0 };

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
    if (cmd === "search_assets") return searchAnswer;
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

const inventory = {
  agents: [],
  tools: [
    {
      id: "/home/u/.claude.json:spades",
      name: "spades",
      command: "npx",
      transport: "stdio",
      config_path: "/home/u/.claude.json",
      scope: { Global: { agent: "claude" } },
      owning_agent: "claude",
    },
  ],
  rules: [],
  subagents: [],
  project_scans: [],
  skills: [
    {
      id: "/Users/u/Work/proj/.claude/skills/deploy-helper",
      name: "deploy-helper",
      description: "",
      version: "1",
      path: "/Users/u/Work/proj/.claude/skills/deploy-helper",
      scope: { Project: { agent: "claude", root: "/Users/u/Work/proj" } },
    },
  ],
};

describe("picking a search hit", () => {
  beforeEach(() => {
    cleanup();
    eventListeners = {};
    mockPreferences.selected_sidebar_item = "profile";
    mockPreferences.inspector_open = "false";
    mockAssetCounts = { total: 0, byCategory: {}, engines: {} };
  });
  afterEach(() => cleanup());

  it("switches to the hit's project and opens it in the inspector", async () => {
    searchAnswer = {
      hits: [{
        kind: "skill", id: inventory.skills[0].path, path: inventory.skills[0].path, name: "deploy-helper",
        server: null, place: "/Users/u/Work/proj", snippet: "deploy", rank: -1,
      }],
      total: 1,
    };
    const { unmount } = render(<App />);
    await screen.findByTestId("icon-rail");
    eventListeners["scan://complete"]({ payload: { inventory } });

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    fireEvent.change(await screen.findByLabelText("Search assets"), { target: { value: "deploy" } });
    fireEvent.click(await screen.findByText("deploy-helper", { selector: "[cmdk-item] *" }));

    await waitFor(() => expect(mockPreferences.selected_sidebar_item).toBe("/Users/u/Work/proj"));
    expect(mockPreferences.inspector_open).toBe("true");
    expect(screen.queryByRole("dialog", { name: "Search" })).toBeNull();
    // The inspector names the asset it opened on.
    expect(await screen.findByTestId("inspector-header")).toBeTruthy();
    unmount();
  });

  it("a tool hit opens its server on Global", async () => {
    mockPreferences.selected_sidebar_item = "/Users/u/Work/proj";
    searchAnswer = {
      hits: [{
        kind: "mcp_tool", id: "/home/u/.claude.json:spades", path: "/home/u/.claude.json", name: "set_volume",
        server: "spades", place: "global", snippet: "loudness", rank: -1,
      }],
      total: 1,
    };
    const { unmount } = render(<App />);
    await screen.findByTestId("icon-rail");
    eventListeners["scan://complete"]({ payload: { inventory } });

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    fireEvent.change(await screen.findByLabelText("Search assets"), { target: { value: "loud" } });
    fireEvent.click(await screen.findByText("set_volume"));

    await waitFor(() => expect(mockPreferences.selected_sidebar_item).toBe("profile"));
    expect(mockPreferences.inspector_open).toBe("true");
    unmount();
  });
});
