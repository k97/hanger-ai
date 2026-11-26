// @vitest-environment happy-dom
/** App's share of the switchable engine tiles (T2 of
 *  docs/plans/2026-11-25-ia-engines-into-global.md): it primes every engine's
 *  context from cache on mount, then refreshes once per scan, hands the listed ones down, runs a tile
 *  click through the one switch state, so the notice offers Undo, and takes
 *  the reply's context at once, with no rescan. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act, within } from "@testing-library/react";
import App from "../App";
import { invoke } from "@tauri-apps/api/core";
import type { ContextItem, EngineContext } from "../types/engineContext";

vi.mock("@tauri-apps/plugin-log", () => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  attachConsole: vi.fn(() => Promise.resolve(() => {})),
}));

let mockPreferences: Record<string, string> = {};
let eventListeners: Record<string, Function> = {};

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, callback: any) => {
    eventListeners[event] = callback;
    return Promise.resolve(() => {
      delete eventListeners[event];
    });
  }),
}));

const KEY = "/Users/demo/.codex/config.toml:alpha";

const TOOL = {
  id: KEY,
  name: "alpha",
  command: "npx",
  transport: "stdio",
  config_path: "/Users/demo/.codex/config.toml",
  scope: { Global: { agent: "codex" } },
  owning_agent: "codex",
};

const item = (state: "on" | "off"): ContextItem =>
  ({
    key: KEY,
    name: "alpha",
    tier: "global",
    config_path: "~/.codex/config.toml",
    state,
    read_only: null,
    estimated_tokens: null,
    tool_count: null,
  }) as ContextItem;

const codex = (state: "on" | "off"): EngineContext => ({
  engine_id: "codex",
  engine_key: "codex",
  engine_name: "Engine C",
  applies: null,
  switches_by_name: false,
  items: [item(state)],
  on_count: state === "on" ? 1 : 0,
  off_count: state === "off" ? 1 : 0,
  measured_on_count: 0,
  on_tokens_measured: 0,
});

let answerContext: () => Promise<EngineContext>;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === "get_preference") return mockPreferences[args?.key] ?? null;
    if (cmd === "set_preference") return null;
    if (cmd === "get_linked_directories") return [];
    if (cmd === "get_asset_counts") return { total: 1, byCategory: { tool: { global: 1 } }, engines: {} };
    if (cmd === "get_kept_off_servers") return { servers: [], count: 0, only_kept_count: 0 };
    if (cmd === "get_asset_annotations")
      return [
        {
          asset_path: KEY,
          mechanism: "none",
          reach: [{ engine_id: 2, engine_key: "codex", engine_name: "Codex", reached: true }],
          beyond: null,
        },
      ];
    if (cmd === "get_mcp_servers")
      return [
        {
          name: "alpha",
          transport: "stdio",
          registration_count: 1,
          distinct_spec_count: 1,
          file_count: 1,
          agreement: "Consistent",
          aliased_with: [],
          plugin: null,
          registrations: [KEY],
        },
      ];
    if (cmd === "get_engine_context") return answerContext();
    if (cmd === "get_engine_contexts") return [await answerContext()];
    if (cmd === "set_mcp_server_enabled") return { context: codex("off"), receipt_id: "r1", undoable: true };
    if (cmd === "start_scan") return "mock-scan-id";
    return null;
  }),
}));

const calls = (cmd: string) =>
  vi
    .mocked(invoke)
    .mock.calls.filter((c) => c[0] === cmd)
    .map((c) => c[1] as any);

const completeScan = async () => {
  await waitFor(() => expect(eventListeners["scan://complete"]).toBeDefined());
  await act(async () => {
    await eventListeners["scan://complete"]({
      payload: { inventory: { agents: [], skills: [], tools: [TOOL], rules: [], subagents: [], project_scans: [] } },
    });
  });
};

beforeEach(() => {
  cleanup();
  eventListeners = {};
  answerContext = async () => codex("on");
  vi.mocked(invoke).mockClear();
  mockPreferences = {
    onboarding_complete: "true",
    consent_crash: "true",
    consent_usage: "true",
    sidebar_collapsed: "false",
    selected_sidebar_item: "global:Tools",
    inspector_open: "false",
  };
});
afterEach(cleanup);

describe("Global › MCP servers: App wires the engine tiles to the switch", () => {
  it("reads cached contexts on mount and refreshes once per scan", async () => {
    let release: (c: EngineContext) => void = () => {};
    let contextReads = 0;
    answerContext = () => {
      contextReads += 1;
      return contextReads === 1
        ? new Promise((r) => (release = r))
        : Promise.resolve(codex("on"));
    };
    render(<App />);
    // The mount's cached read is pending; the card is the available surface
    // before scan inventory exists.
    await waitFor(() => expect(calls("get_engine_contexts")).toEqual([undefined]));
    const overviewButton = await screen.findByRole("button", { name: /Show overview/ });
    fireEvent.click(overviewButton);
    const overview = await screen.findByTestId("overview-card");
    expect(within(overview).queryByText("Engine C")).toBeNull();

    await act(async () => {
      release(codex("on"));
    });
    expect(await within(overview).findByText("Engine C")).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Overview" })).toBeNull());

    // The scan reads again; it is not blocked behind the two disk-derived MCP reads.
    await waitFor(() => expect(eventListeners["scan://complete"]).toBeDefined());
    let handled: Promise<unknown> = Promise.resolve();
    act(() => {
      handled = eventListeners["scan://complete"]({
        payload: { inventory: { agents: [], skills: [], tools: [TOOL], rules: [], subagents: [], project_scans: [] } },
      });
    });
    await waitFor(() => expect(calls("get_engine_contexts")).toEqual([undefined, undefined]));
    expect(calls("get_engine_context")).toEqual([]);
    await act(async () => { await handled; });
    const btn = await screen.findByRole("button", { name: "Switch alpha off for Engine C" });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("a click switches at once, the notice offers Undo, the row stays unselected, and the reply redraws the tile", async () => {
    render(<App />);
    await completeScan();
    const before = await screen.findByRole("button", { name: "Switch alpha off for Engine C" });
    const contextReads = calls("get_engine_contexts").length;
    fireEvent.click(before);

    await waitFor(() =>
      expect(calls("set_mcp_server_enabled")).toEqual([{ engineId: "codex", key: KEY, enabled: false }])
    );
    const status = await screen.findByRole("status");
    await waitFor(() => expect(within(status).getByText("alpha is off for Engine C.")).toBeTruthy());
    expect(within(status).getByRole("button", { name: "Undo" })).toBeTruthy();

    const after = await screen.findByRole("button", { name: "Switch alpha on for Engine C" });
    expect(after.getAttribute("aria-pressed")).toBe("false");
    // The reply's context, not a second read.
    expect(calls("get_engine_contexts")).toHaveLength(contextReads);
    expect(calls("get_engine_context")).toEqual([]);

    const row = after.closest("[data-selected]") as HTMLElement;
    expect(row.getAttribute("data-selected")).toBe("false");
  });
});
