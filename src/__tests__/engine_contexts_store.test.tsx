// @vitest-environment happy-dom
/** App's one copy of every engine's context (Q1 of
 *  docs/plans/2026-11-25-t3-code-review.md). It is read once per scan, by
 *  `get_engine_contexts`, and every surface that shows an engine's servers
 *  reads it: the engine tiles on Global's MCP servers rows, the MCP server
 *  inspector's switches and ⌘K's Switch actions. A switch's reply replaces
 *  that engine's entry, so all three follow it without another read. */
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
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(), revealItemInDir: vi.fn(), openPath: vi.fn() }));

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

const FILE = "/Users/demo/.codex/config.toml";
const KEY = `${FILE}:alpha`;

const TOOL = {
  id: KEY,
  name: "alpha",
  command: "npx",
  args: [],
  transport: "stdio",
  config_path: FILE,
  scope: { Global: { agent: "codex" } },
  owning_agent: "codex",
};

const codex = (state: "on" | "off"): EngineContext => ({
  engine_id: "codex",
  engine_key: "codex",
  engine_name: "Engine C",
  applies: null,
  switches_by_name: false,
  items: [
    {
      key: KEY,
      name: "alpha",
      tier: "global",
      config_path: "~/.codex/config.toml",
      state,
      read_only: null,
      estimated_tokens: null,
      tool_count: null,
    } as ContextItem,
  ],
  on_count: state === "on" ? 1 : 0,
  off_count: state === "off" ? 1 : 0,
  measured_on_count: 0,
  on_tokens_measured: 0,
});

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
          reach: [{ engine_id: 2, engine_key: "codex", engine_name: "Engine C", reached: true }],
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
    // Both read commands answer, so a surface that still asks one engine at
    // a time is counted rather than left waiting.
    if (cmd === "get_engine_contexts") return [codex("on")];
    if (cmd === "get_engine_context") return codex("on");
    if (cmd === "set_mcp_server_enabled") return { context: codex("off"), receipt_id: "r1", undoable: true };
    if (cmd === "mcp_cached_probe") return { result: null, verifiedAt: null, fromCache: false, declined: false };
    if (cmd === "search_assets") return { hits: [], total: 0 };
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

const aside = () =>
  waitFor(() => {
    const el = document.querySelector("aside");
    expect(el).not.toBeNull();
    return el as HTMLElement;
  });

/** Open alpha in the inspector, on the tab that lists its registrations. */
const openInspector = async () => {
  const tile = await screen.findByRole("button", { name: /^Switch alpha (off|on) for Engine C$/ });
  fireEvent.click(tile.closest("[data-selected]") as HTMLElement);
  const panel = await aside();
  fireEvent.click(await within(panel).findByRole("tab", { name: "Details" }));
  return panel;
};

const inspectorSwitch = async (panel: HTMLElement) =>
  within(panel).findByRole("button", { name: `Engine C, ${FILE}` });

const openPalette = async (query: string) => {
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  fireEvent.change(await screen.findByLabelText("Search assets"), { target: { value: query } });
};

beforeEach(() => {
  cleanup();
  eventListeners = {};
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

describe("App keeps one copy of every engine's context", () => {
  it("reads it once per scan, not once per engine per surface", async () => {
    render(<App />);
    await completeScan();
    const panel = await openInspector();
    expect((await inspectorSwitch(panel)).getAttribute("aria-pressed")).toBe("true");
    await openPalette("alpha");
    await screen.findByRole("option", { name: /^Switch alpha off for Engine C/ });

    // The tile, the inspector and ⌘K are all drawn from one read.
    expect(calls("get_engine_contexts")).toHaveLength(1);
    expect(calls("get_engine_context")).toEqual([]);

    await completeScan();
    await waitFor(() => expect(calls("get_engine_contexts")).toHaveLength(2));
    expect(calls("get_engine_context")).toEqual([]);
  });

  it("a switch from the inspector redraws the row's tile and ⌘K's action from its reply", async () => {
    render(<App />);
    await completeScan();
    const panel = await openInspector();
    fireEvent.click(await inspectorSwitch(panel));

    await waitFor(() => expect(calls("set_mcp_server_enabled")).toEqual([{ engineId: "codex", key: KEY, enabled: false }]));
    await waitFor(async () => expect((await inspectorSwitch(panel)).getAttribute("aria-pressed")).toBe("false"));
    const tile = await screen.findByRole("button", { name: "Switch alpha on for Engine C" });
    expect(tile.getAttribute("aria-pressed")).toBe("false");

    await openPalette("alpha");
    expect(await screen.findByRole("option", { name: /^Switch alpha on for Engine C/ })).toBeTruthy();
    // The reply, not another read: the mock's reads still say alpha is on.
    expect(calls("get_engine_contexts")).toHaveLength(1);
    expect(calls("get_engine_context")).toEqual([]);
  });
});
