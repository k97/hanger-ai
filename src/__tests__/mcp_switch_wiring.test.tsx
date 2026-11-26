// @vitest-environment happy-dom
/** App's share of the MCP switch: it keeps the servers Hanger holds while
 *  they are switched off, refreshed after every scan, and it mounts the one
 *  switch notice.
 *
 *  The notice is a direct child of the shell root, never inside <main>:
 *  <main> is `hidden` while the inspector is expanded, so a switch made there
 *  would show nothing, and an always-present node inside the pane container
 *  would satisfy `window_chrome_sheet.test.tsx`'s "pane rendered" query on
 *  every screen. Switching itself is driven from the screens that offer it
 *  (the Engines pane, the server inspector), not from here. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import App from "../App";
import { invoke } from "@tauri-apps/api/core";
import type { KeptOff } from "../types/engineContext";

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

// docs/ipc.md entry 19: with nothing kept, the list is empty and both counts are 0.
const NOTHING_KEPT: KeptOff = { servers: [], count: 0, only_kept_count: 0 };

// `start_scan` does not complete the scan on its own: each test emits
// `scan://complete` itself, so "before" and "after" are both observable.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === "get_preference") return mockPreferences[args?.key] ?? null;
    if (cmd === "set_preference") return null;
    if (cmd === "get_linked_directories") return [];
    if (cmd === "get_asset_counts") return { total: 0, byCategory: {}, engines: {} };
    if (cmd === "get_kept_off_servers") return NOTHING_KEPT;
    if (cmd === "start_scan") return "mock-scan-id";
    return null;
  }),
}));

const commands = () => vi.mocked(invoke).mock.calls.map((c) => c[0]);

const completeScan = async () => {
  await waitFor(() => expect(eventListeners["scan://complete"]).toBeDefined());
  await act(async () => {
    await eventListeners["scan://complete"]({
      payload: { inventory: { agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [] } },
    });
  });
};

beforeEach(() => {
  cleanup();
  eventListeners = {};
  vi.mocked(invoke).mockClear();
});
afterEach(cleanup);

describe("The switch wiring in App", () => {
  it("primes contexts on mount, then reads kept-off servers before the scan's context refresh", async () => {
    render(<App />);
    await screen.findByLabelText("My machine");
    await waitFor(() => expect(commands()).toContain("start_scan"));
    expect(commands(), "kept-off servers read before any scan completed").not.toContain("get_kept_off_servers");

    await completeScan();

    await waitFor(() => expect(commands()).toContain("get_kept_off_servers"));
    const calls = commands();
    expect(calls.indexOf("get_kept_off_servers")).toBeGreaterThan(calls.indexOf("get_mcp_coverage"));
    expect(calls.indexOf("get_mcp_coverage")).toBeGreaterThan(-1);
    await waitFor(() => expect(commands().filter((command) => command === "get_engine_contexts")).toHaveLength(2));
    const contextReads = commands()
      .map((command, index) => (command === "get_engine_contexts" ? index : -1))
      .filter((index) => index >= 0);
    expect(contextReads[0]).toBeLessThan(calls.indexOf("get_kept_off_servers"));
    expect(contextReads[1]).toBeGreaterThan(calls.indexOf("get_kept_off_servers"));
  });

  it("mounts the switch notice's status region, empty, outside <main>", async () => {
    render(<App />);
    await screen.findByLabelText("My machine");
    await completeScan();

    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");
    expect(document.querySelector("main"), "no <main> rendered").not.toBeNull();
    expect(status.closest("main"), "the switch notice is inside <main>").toBeNull();
  });
});
