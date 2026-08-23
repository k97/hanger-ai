// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import App from "../App";

vi.mock("@tauri-apps/plugin-log", () => ({
  warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), trace: vi.fn(),
  attachConsole: vi.fn(() => Promise.resolve(() => {})),
}));

const mockPreferences: Record<string, string> = {
  onboarding_complete: "true",
  consent_crash: "true",
  consent_usage: "true",
  sidebar_collapsed: "false",
  sidebar_width: "240",
  selected_sidebar_item: "linkmap",
  inspector_open: "false",
};

let eventListeners: Record<string, Function> = {};
const emptyInventory = { agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [] };

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, callback: any) => {
    eventListeners[event] = callback;
    return Promise.resolve(() => { delete eventListeners[event]; });
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === "get_preference") return mockPreferences[args?.key] ?? null;
    if (cmd === "set_preference") { if (args?.key) mockPreferences[args.key] = String(args.value); return null; }
    if (cmd === "get_linked_directories") return [];
    if (cmd === "get_asset_counts") return { total: 0, byCategory: {}, engines: {} };
    if (cmd === "get_inventory") return emptyInventory;
    if (cmd === "link_graph") return { nodes: [], edges: [], warnings: [], empty_state: "no_links_at_all" };
    if (cmd === "start_scan") return "scan-1";
    return null;
  }),
}));

describe("the map cap", () => {
  beforeEach(() => {
    cleanup();
    eventListeners = {};
    mockPreferences.selected_sidebar_item = "linkmap";
  });

  it("carries the scan stamp beside Rescan, and nowhere before a scan has finished says an age", async () => {
    render(<App />);
    const rescan = await screen.findByLabelText("Rescan");
    const header = screen.getByRole("banner");
    expect(header.contains(rescan)).toBe(true);
    expect(within(header).getByText("Not scanned yet")).toBeTruthy();

    eventListeners["scan://complete"]({ payload: { inventory: emptyInventory } });
    await waitFor(() => {
      expect(within(header).getByText("Scanned moments ago")).toBeTruthy();
    });
    // The stamp sits immediately before the Rescan control in the trailing cluster.
    const stamp = within(header).getByText("Scanned moments ago");
    expect(stamp.nextElementSibling?.contains(rescan) || stamp.nextElementSibling === rescan).toBe(true);
  });
});
