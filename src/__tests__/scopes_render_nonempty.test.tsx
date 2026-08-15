// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import App from "../App";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/plugin-log", () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
}));

const mockPreferences: Record<string, string> = {
  onboarding_complete: "true",
  consent_crash: "true",
  consent_usage: "true",
  sidebar_collapsed: "false",
  sidebar_width: "240",
  selected_sidebar_item: "/Users/test/Work",
  inspector_open: "false",
};

const mockInventory = {
  agents: [],
  skills: [
    { id: "s1", name: "global-skill-1", description: "", version: "1.0", path: "/Users/test/.gemini/skills/s1", scope: { Global: { agent: "unknown" } } },
    { id: "s2", name: "work-skill-1", description: "", version: "1.0", path: "/Users/test/Work/.agents/skills/s2", scope: { Project: { agent: "claude", root: "/Users/test/Work" } } },
    { id: "s3", name: "demo-user-skill-1", description: "", version: "1.0", path: "/Users/test/demo-user/.agents/skills/s3", scope: { Project: { agent: "claude", root: "/Users/test/demo-user" } } },
  ],
  tools: [
    { id: "t1", name: "work-tool-1", command: "node", transport: "stdio", config_path: "/Users/test/Work/.mcp.json", scope: { Project: { agent: "claude", root: "/Users/test/Work" } }, owning_agent: "claude" },
  ],
  rules: [
    { id: "r1", name: "global-rule-1", path: "/Users/test/.claude/AGENTS.md", content: "# Rule", scope: { Global: { agent: "unknown" } } },
    { id: "r2", name: "demo-user-rule-1", path: "/Users/test/demo-user/labs/proj1/AGENTS.md", content: "# Rule", scope: { Project: { agent: "claude", root: "/Users/test/demo-user/labs/proj1" } } },
  ],
  subagents: [],
  project_scans: [],
};

const mockAssetCounts = {
  total_assets: 10,
  total: 10,
  skill: { total: 3, global: 1, project: 2 },
  tool: { total: 1, global: 0, project: 1 },
  rule: { total: 2, global: 1, project: 1 },
  subagent: { total: 0, global: 0, project: 0 },
  byCategory: {
    skill: { total: 3, global: 1, project: 2 },
    tool: { total: 1, global: 0, project: 1 },
    rule: { total: 2, global: 1, project: 1 },
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
    if (cmd === "get_linked_directories") return ["/Users/test/Work", "/Users/test/demo-user"];
    if (cmd === "get_asset_counts") {
      return mockAssetCounts;
    }
    if (cmd === "get_inventory") {
      return mockInventory;
    }
    if (cmd === "start_scan") {
      if (eventListeners["scan://complete"]) {
        eventListeners["scan://complete"]({ payload: { inventory: mockInventory } });
      }
      return "mock-scan-id-123";
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

describe("Sidebar Scope Asset List Verification", () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(invoke).mockClear();
    eventListeners = {};
    mockPreferences.selected_sidebar_item = "/Users/test/Work";
  });

  it("asserts all three scopes (Work, demo-user, Global) render a non-empty asset list", async () => {
    const { unmount } = render(<App />);

    // 1. Work Repository Scope
    await waitFor(() => {
      expect(screen.getByText("work-skill-1")).toBeTruthy();
    }, { timeout: 3000 });

    // 2. demo-user Repository Scope
    const demoUserButton = await screen.findByText("demo-user", {}, { timeout: 3000 });
    fireEvent.click(demoUserButton);

    await waitFor(() => {
      expect(screen.getByText("demo-user-skill-1")).toBeTruthy();
    }, { timeout: 3000 });

    // 3. Global scope
    const profileBtn = await screen.findByText("Global", {}, { timeout: 3000 });
    fireEvent.click(profileBtn);

    await waitFor(() => {
      expect(screen.getByText("global-skill-1")).toBeTruthy();
    }, { timeout: 3000 });

    unmount();
  });
});
