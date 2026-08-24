// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import App from "../App";

/**
 * Clicking one MCP server must mark one row.
 *
 * This is the third time identity has leaked at this seam and the first time a
 * test has covered it end to end. ProfilePane was fixed to key rows on
 * `registrationKey`, and `handleSelectAsset` was fixed to RESOLVE by it — but
 * the object it then stored dropped `id`, so ProfilePane fell back to comparing
 * `path`, which for a tool is the config FILE. Clicking `tauri` lit up every
 * Claude.ai connector in ~/.claude.json alongside it.
 *
 * The component test passes `selectedAsset` in directly and so can never see
 * this: the defect lives in the handoff, not in either side of it.
 */

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
  selected_sidebar_item: "profile",
  inspector_open: "true",
};

/** Four servers, ONE config file — the shape of ~/.claude.json. */
const mockInventory = {
  agents: [],
  skills: [],
  tools: [
    { id: "/Users/test/.claude.json-tauri", name: "tauri", command: "npx", args: [], transport: "stdio",
      config_path: "/Users/test/.claude.json", scope: { Global: { agent: "claude-code" } }, owning_agent: "claude-code" },
    { id: "/Users/test/.claude.json-Gmail", name: "Gmail", command: "", args: [], transport: "claude.ai",
      config_path: "/Users/test/.claude.json", scope: { Global: { agent: "claude-code" } }, owning_agent: "claude-code" },
    { id: "/Users/test/.claude.json-Granola", name: "Granola", command: "", args: [], transport: "claude.ai",
      config_path: "/Users/test/.claude.json", scope: { Global: { agent: "claude-code" } }, owning_agent: "claude-code" },
    { id: "/Users/test/.claude.json-Figma", name: "Figma", command: "", args: [], transport: "claude.ai",
      config_path: "/Users/test/.claude.json", scope: { Global: { agent: "claude-code" } }, owning_agent: "claude-code" },
  ],
  rules: [],
  subagents: [],
  project_scans: [],
};

// App reads the TOP-LEVEL per-category keys from this command and rebuilds
// byCategory itself (App.tsx refreshGlobalCounts), so both shapes are supplied.
const mockAssetCounts = {
  total_assets: 4,
  total: 4,
  skill: { total: 0, global: 0, project: 0 },
  tool: { total: 4, global: 4, project: 0 },
  rule: { total: 0, global: 0, project: 0 },
  subagent: { total: 0, global: 0, project: 0 },
  byCategory: {
    skill: { total: 0, global: 0, project: 0 },
    tool: { total: 4, global: 4, project: 0 },
    rule: { total: 0, global: 0, project: 0 },
    subagent: { total: 0, global: 0, project: 0 },
  },
  engines: { claude_code: 4 },
};

let eventListeners: Record<string, (evt: any) => void> = {};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === "get_preference") return mockPreferences[args?.key] ?? null;
    if (cmd === "set_preference") {
      if (args?.key) mockPreferences[args.key] = String(args.value);
      return null;
    }
    if (cmd === "get_linked_directories") return ["/Users/test/Work"];
    if (cmd === "get_asset_counts") return mockAssetCounts;
    if (cmd === "get_inventory") return mockInventory;
    if (cmd === "get_mcp_processes") return [];
    if (cmd === "start_scan") {
      eventListeners["scan://complete"]?.({ payload: { inventory: mockInventory } });
      return "mock-scan-id";
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

beforeEach(() => {
  eventListeners = {};
});
afterEach(cleanup);

/** App registers its scan listener after initializeApp has already fired, so
 *  the inventory is delivered from the test rather than from the start_scan
 *  mock, which would land before anyone was listening. */
const deliverInventory = async () => {
  await waitFor(() => expect(eventListeners["scan://complete"]).toBeDefined());
  eventListeners["scan://complete"]({ payload: { inventory: mockInventory } });
};

describe("selecting one MCP server out of a file that declares four", () => {
  it("marks exactly one row", async () => {
    render(<App />);
    await deliverInventory();
    const row = await screen.findByText("tauri");
    fireEvent.click(row.closest("[tabindex]") as HTMLElement);

    await waitFor(() => {
      const marked = document.querySelectorAll('[data-selected="true"]');
      expect(marked.length).toBe(1);
    });
  });

  it("marks the one that was clicked, not the first in the file", async () => {
    render(<App />);
    await deliverInventory();
    const row = await screen.findByText("Granola");
    fireEvent.click(row.closest("[tabindex]") as HTMLElement);

    await waitFor(() => {
      const marked = document.querySelector('[data-selected="true"]');
      expect(marked?.textContent).toContain("Granola");
    });
  });
});
