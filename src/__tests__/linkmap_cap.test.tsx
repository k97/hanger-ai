// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, within, waitFor, fireEvent } from "@testing-library/react";
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
    if (cmd === "get_inventory") return { ...emptyInventory, agents: [{ id: "claude-code", name: "Claude Code", global_config_path: "/u/k/.claude", project_footprints: [] }] };
    if (cmd === "link_graph") return { nodes: [{ id: 2, kind: "engine_root", label: "Claude Code", path: "/u/k/.claude", asset_count: 1, linked: true, skill_count: 1, rule_count: 0, subagent_count: 0, tool_count: 0, linked_from: 0, rules: [] }], edges: [], warnings: [], empty_state: null };
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

  it("keeps the stamp out of another view's header — the toolbar slot is the map's alone", async () => {
    // The sibling above asserts only PRESENCE in the map view, so a stamp
    // that leaked into every view's toolbar would pass it. The slot is gated
    // on `selectedSidebarItem === "linkmap"` (`App.tsx:1518`); this is the
    // other half of that gate. The panes' own stamp lives inside SummaryStrip,
    // which is not the banner, so scoping to the header keeps the two apart.
    mockPreferences.selected_sidebar_item = "profile";
    render(<App />);
    const header = await screen.findByRole("banner");
    // A positive anchor first: without it the absences below could pass on a
    // header that had not finished rendering anything at all.
    expect(within(header).getByPlaceholderText(/Search .* assets/)).toBeTruthy();

    eventListeners["scan://complete"]({ payload: { inventory: emptyInventory } });
    await waitFor(() => {
      expect(within(header).getByPlaceholderText(/Search .* assets/)).toBeTruthy();
    });

    expect(within(header).queryByText("Scanned moments ago")).toBeNull();
    expect(within(header).queryByText("Not scanned yet")).toBeNull();
    expect(within(header).queryByLabelText("Rescan")).toBeNull();
  });

  it("Show its assets goes to Global with the engine's own list in the inspector", async () => {
    render(<App />);
    const node = await screen.findByTestId("map-node-2");
    // The inspector column only mounts once `inventory` is set (App.tsx:1641,
    // `selectedSidebarItem === "review" || inventory`), and `inventory` is
    // populated solely by the scan://complete payload — never by
    // `get_inventory`, which App.tsx does not call. Deviation from the
    // brief's literal snippet: it omitted this, and without it the test can
    // never reach the heading assertion below, mirroring the same
    // `eventListeners["scan://complete"]` technique the sibling test above
    // already uses for the same reason.
    eventListeners["scan://complete"]({
      payload: {
        inventory: {
          ...emptyInventory,
          agents: [{ id: "claude-code", name: "Claude Code", global_config_path: "/u/k/.claude", project_footprints: [] }],
        },
      },
    });
    // fireEvent is imported from @testing-library/react
    fireEvent.click(node);
    fireEvent.click(await screen.findByRole("button", { name: "Show its assets" }));
    await waitFor(() => {
      expect(mockPreferences.selected_sidebar_item).toBe("profile");
      expect(mockPreferences.inspector_open).toBe("true");
    });
    // The inspector titles the engine — the agent bubble body.
    expect((await screen.findByRole("heading", { level: 2 })).textContent).toBe("Claude Code");
  });
});
