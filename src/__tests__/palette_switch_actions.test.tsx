// @vitest-environment happy-dom
/** ⌘K's "Switch" actions (Task A8, part 2, of
 *  docs/plans/2026-11-25-context-control-finish.md): App reads every listed
 *  engine's context once per palette open, offers a switch for each server
 *  Hanger can switch whose name holds the query, and runs it through the one
 *  switch state with exactly what the Engines pane would send. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act, within } from "@testing-library/react";
import App from "../App";
import { invoke } from "@tauri-apps/api/core";
import type { ContextItem, EngineContext, KeptOff } from "../types/engineContext";
import type { McpEngineSummaryData } from "../types/mcpEngineSummary";
import type { SwitchRequest } from "../hooks/useMcpSwitch";

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

/** Every request the one switch state receives, whoever made it: the real
 *  hook, with its `switchServer` recorded on the way through. */
const switchCalls: SwitchRequest[] = [];
vi.mock("../hooks/useMcpSwitch", async (importOriginal) => {
  const real = await importOriginal<typeof import("../hooks/useMcpSwitch")>();
  return {
    ...real,
    useMcpSwitch: (opts: { onChanged: () => void }) => {
      const s = real.useMcpSwitch(opts);
      return {
        ...s,
        switchServer: (a: SwitchRequest) => {
          switchCalls.push(a);
          return s.switchServer(a);
        },
      };
    },
  };
});

const SUMMARY: McpEngineSummaryData = {
  rows: [
    { engine_id: "codex", engine_name: "Engine C", server_count: 3, tools_known: null },
    { engine_id: "gemini", engine_name: "Engine G", server_count: 1, tools_known: null },
  ],
  host_count: 2,
  tools_known_total: null,
  total_server_count: 4,
  answered_server_count: 0,
  unasked_server_count: 4,
  unaskable_server_count: 0,
  conflicting_server_count: 0,
};

/** Engine K is reachable only through its kept server (P8). */
const KEPT: KeptOff = {
  servers: [
    {
      key: "stash:00000000-0000-4000-8000-000000000001",
      name: "kappa",
      engine_id: "claude-code",
      engine_name: "Engine K",
      transport: "stdio",
      at_ms: 1795566217263,
      also_declared: false,
    },
  ],
  count: 1,
  only_kept_count: 1,
};

/** docs/ipc.md entry 15's example item shape. */
const item = (over: Partial<ContextItem> & Pick<ContextItem, "key" | "name">): ContextItem =>
  ({
    tier: "global",
    config_path: "~/.codex/config.toml",
    state: "on",
    read_only: null,
    estimated_tokens: null,
    tool_count: null,
    ...over,
  }) as ContextItem;

const context = (engine_id: string, engine_name: string, items: ContextItem[]): EngineContext => ({
  engine_id,
  engine_name,
  applies: null,
  switches_by_name: false,
  items,
  on_count: 0,
  off_count: 0,
  measured_on_count: 0,
  on_tokens_measured: 0,
});

let contexts: Record<string, EngineContext> = {};
const defaultContexts = (): Record<string, EngineContext> => ({
  codex: context("codex", "Engine C", [
    item({ key: "/Users/demo/.codex/config.toml:alpha", name: "alpha" }),
    item({ key: "/Users/demo/.codex/config.toml:beta", name: "beta", state: "off" }),
    item({ key: "/Users/demo/.codex/config.toml:alpine", name: "alpine", read_only: "managed_by_plugin" }),
  ]),
  gemini: context("gemini", "Engine G", [
    item({ key: "/Users/demo/.gemini/settings.json:Alphabet", name: "Alphabet", state: "off", config_path: "~/.gemini/settings.json" }),
  ]),
  "claude-code": context("claude-code", "Engine K", [
    item({ key: KEPT.servers[0].key, name: "kappa", tier: "user", config_path: "", state: "off" }),
  ]),
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === "get_preference") return mockPreferences[args?.key] ?? null;
    if (cmd === "set_preference") {
      if (args?.key) mockPreferences[args.key] = String(args.value);
      return null;
    }
    if (cmd === "get_linked_directories") return [];
    if (cmd === "get_asset_counts") return { total: 0, byCategory: {}, engines: {} };
    if (cmd === "get_mcp_engine_summary") return SUMMARY;
    if (cmd === "get_kept_off_servers") return KEPT;
    if (cmd === "get_engine_context") return contexts[args.engineId] ?? context(args.engineId, args.engineId, []);
    if (cmd === "search_assets") return { hits: [], total: 0 };
    // Already as asked: nothing changed, so no notice and no rescan.
    if (cmd === "set_mcp_server_enabled")
      return { context: contexts[args.engineId], receipt_id: null, undoable: false };
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
      payload: { inventory: { agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [] } },
    });
  });
};

const openPalette = () => fireEvent.keyDown(window, { key: "k", metaKey: true });
const type = async (q: string) =>
  fireEvent.change(await screen.findByLabelText("Search assets"), { target: { value: q } });
const switchGroup = () => document.querySelector('[cmdk-group][aria-label="Switch"]') as HTMLElement | null;
const actionLabels = () =>
  Array.from(switchGroup()?.querySelectorAll("[cmdk-item]") ?? []).map(
    (el) => el.querySelector("[data-action-label]")?.textContent
  );

beforeEach(() => {
  cleanup();
  eventListeners = {};
  switchCalls.length = 0;
  contexts = defaultContexts();
  vi.mocked(invoke).mockClear();
  mockPreferences = {
    onboarding_complete: "true",
    consent_crash: "true",
    consent_usage: "true",
    sidebar_collapsed: "false",
    selected_sidebar_item: "profile",
    inspector_open: "false",
  };
});
afterEach(cleanup);

describe("⌘K's Switch actions", () => {
  it("sends exactly what the Engines pane sends for the same server", async () => {
    mockPreferences.selected_sidebar_item = "engines";
    mockPreferences.selected_engine = "codex";
    render(<App />);
    await completeScan();

    const pane = await screen.findByTestId("engines-pane");
    const paneSwitch = await within(pane).findByRole("button", { name: "alpha" });
    fireEvent.click(paneSwitch);
    await waitFor(() => expect(calls("set_mcp_server_enabled")).toHaveLength(1));
    await waitFor(() => expect((paneSwitch as HTMLButtonElement).disabled).toBe(false));

    openPalette();
    await type("alpha");
    const option = await screen.findByRole("option", { name: /^Switch alpha off for Engine C/ });
    fireEvent.click(option);

    await waitFor(() => expect(calls("set_mcp_server_enabled")).toHaveLength(2));
    expect(switchCalls).toHaveLength(2);
    expect(switchCalls[1]).toEqual(switchCalls[0]);
    expect(calls("set_mcp_server_enabled")[1]).toEqual(calls("set_mcp_server_enabled")[0]);
    expect(calls("set_mcp_server_enabled")[0]).toEqual({
      engineId: "codex",
      key: "/Users/demo/.codex/config.toml:alpha",
      enabled: false,
    });
    // Picking an action closes the palette.
    expect(screen.queryByRole("dialog", { name: "Search" })).toBeNull();
  });

  it("does the same for a server Hanger is keeping, which is in no file", async () => {
    mockPreferences.selected_sidebar_item = "engines";
    mockPreferences.selected_engine = "claude-code";
    render(<App />);
    await completeScan();

    const pane = await screen.findByTestId("engines-pane");
    const paneSwitch = await within(pane).findByRole("button", { name: "kappa" });
    fireEvent.click(paneSwitch);
    await waitFor(() => expect(calls("set_mcp_server_enabled")).toHaveLength(1));
    await waitFor(() => expect((paneSwitch as HTMLButtonElement).disabled).toBe(false));

    openPalette();
    await type("kappa");
    fireEvent.click(await screen.findByRole("option", { name: /^Switch kappa on for Engine K/ }));

    await waitFor(() => expect(switchCalls).toHaveLength(2));
    expect(switchCalls[1]).toEqual(switchCalls[0]);
  });

  it("offers each switchable server whose name holds the query, in any case, and never a read-only one", async () => {
    render(<App />);
    await completeScan();
    openPalette();
    await type("AL");
    await waitFor(() => expect(switchGroup()).not.toBeNull());
    expect(actionLabels()).toEqual(["Switch alpha off for Engine C", "Switch Alphabet on for Engine G"]);
    // `alpine` matches the query and is managed by a plugin: no action.
    expect(screen.queryByText(/alpine/)).toBeNull();
  });

  it("offers nothing for an empty query", async () => {
    render(<App />);
    await completeScan();
    openPalette();
    await screen.findByLabelText("Search assets");
    await waitFor(() => expect(calls("get_engine_context")).toHaveLength(3));
    expect(switchGroup()).toBeNull();
    await type("   ");
    expect(switchGroup()).toBeNull();
    expect(screen.getByText("Type to search names and what's inside.")).toBeTruthy();
  });

  it("offers at most eight", async () => {
    contexts.gemini = context(
      "gemini",
      "Engine G",
      Array.from({ length: 10 }, (_, i) =>
        item({ key: `/Users/demo/.gemini/settings.json:srv${i}`, name: `srv${i}`, config_path: "~/.gemini/settings.json" })
      )
    );
    render(<App />);
    await completeScan();
    openPalette();
    await type("srv");
    await waitFor(() => expect(switchGroup()).not.toBeNull());
    expect(actionLabels()).toEqual(Array.from({ length: 8 }, (_, i) => `Switch srv${i} off for Engine G`));
  });

  it("reads each listed engine's context once per open, and again on the next", async () => {
    render(<App />);
    await completeScan();
    expect(calls("get_engine_context")).toEqual([]);

    openPalette();
    await type("a");
    await type("al");
    await waitFor(() => expect(switchGroup()).not.toBeNull());
    expect(calls("get_engine_context").map((a) => a.engineId).sort()).toEqual(["claude-code", "codex", "gemini"]);

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Search" })).toBeNull());
    openPalette();
    await type("al");
    await waitFor(() => expect(calls("get_engine_context")).toHaveLength(6));
  });

  it("before the first scan, opens with no actions and reads nothing", async () => {
    render(<App />);
    await screen.findByTestId("icon-rail");
    openPalette();
    await type("alpha");
    expect(screen.getByText("Results show up here once the first scan finishes.")).toBeTruthy();
    expect(switchGroup()).toBeNull();
    expect(calls("get_engine_context")).toEqual([]);
  });
});
