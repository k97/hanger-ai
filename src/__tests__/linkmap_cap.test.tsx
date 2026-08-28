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
    // header that had not finished rendering anything at all. The cap's own
    // search field is gone (Task 9); the breadcrumb's "Global" label is the
    // stable landmark now.
    expect(within(header).getByText("Global")).toBeTruthy();

    eventListeners["scan://complete"]({ payload: { inventory: emptyInventory } });
    await waitFor(() => {
      expect(within(header).getByText("Global")).toBeTruthy();
    });

    expect(within(header).queryByText("Scanned moments ago")).toBeNull();
    expect(within(header).queryByText("Not scanned yet")).toBeNull();
    expect(within(header).queryByLabelText("Rescan")).toBeNull();

    // Unmount HERE, not at the next `beforeEach`. `mockPreferences` is one
    // mutable record shared by every test in this file, and `set_preference`
    // writes into it (`:34`), so a still-mounted App can persist
    // `selected_sidebar_item: "profile"` AFTER `beforeEach` has reset it to
    // "linkmap" — leaving the next test on the wrong pane, with no map node
    // to find. This is the only test here that leaves the map view, so it is
    // the only one that can do that. Seen once in a full parallel run.
    cleanup();
    mockPreferences.selected_sidebar_item = "linkmap";
  });

  it("clears the traffic lights itself, since this view renders no sidebar toggle", async () => {
    // The link map hides the source list and, with it, the sidebar toggle
    // (`App.tsx:1337`). On every other view that toggle sits in the band the
    // native traffic lights occupy and the crumb steps aside for it; here
    // nothing does, so the crumb has to clear the dots on its own.
    //
    // It did not: `pl-[18px]` put the breadcrumb 1.5pt after the green dot's
    // ink, measured at 2x on the live window (green ends x=147, crumb ink
    // starts x=150). The other two gaps in this cluster are ~11.5pt and
    // ~10.5pt, so this one read as an overlap.
    //
    // A CLASS CONTRACT, not a spacing measurement: happy-dom lays nothing
    // out, so nothing here can see a gap. What it can do is fail if the
    // link-map branch goes back to sharing the narrow inset with the views
    // that have a toggle to hide behind. The pt figures live in DESIGN.md
    // and are retuned by measuring a live window.
    render(<App />);
    await screen.findByTestId("map-node-2");

    // The premise, asserted rather than assumed: no toggle in this view.
    expect(screen.queryByLabelText("Toggle sidebar")).toBeNull();

    const crumb = screen.getByText("Link map").parentElement!;
    expect(crumb.className).toContain("pl-[28px]");
    expect(crumb.className).not.toContain("pl-[18px]");
    expect(crumb.className).not.toContain("pl-[51px]");
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
