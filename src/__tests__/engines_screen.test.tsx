// @vitest-environment happy-dom
/** App's share of the Engines screen (Tasks A5 and A6 of
 *  docs/plans/2026-11-25-context-control-finish.md): which engines the source
 *  list holds (P8), which one is selected and how that survives a restart
 *  (`selected_engine`), the crumb, the page_view name, and the refetch a
 *  finished scan asks of the pane. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act, within } from "@testing-library/react";
import App from "../App";
import { invoke } from "@tauri-apps/api/core";
import type { EngineContext, KeptOff } from "../types/engineContext";
import type { McpEngineSummaryData } from "../types/mcpEngineSummary";

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

const SUMMARY: McpEngineSummaryData = {
  rows: [
    { engine_id: "codex", engine_name: "Engine C", server_count: 2, tools_known: null },
    { engine_id: "gemini", engine_name: "Engine G", server_count: 1, tools_known: null },
  ],
  host_count: 2,
  tools_known_total: null,
  total_server_count: 3,
  answered_server_count: 0,
  unasked_server_count: 3,
  unaskable_server_count: 0,
  conflicting_server_count: 0,
};

/** Every server Engine K declares is switched off and kept, so the summary
 *  has no row for it: the list must still reach it (P8). */
const KEPT: KeptOff = {
  servers: [
    {
      key: "stash:00000000-0000-4000-8000-000000000001",
      name: "beta",
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

const contextOf = (engineId: string, engineName: string): EngineContext => ({
  engine_id: engineId,
  engine_name: engineName,
  applies: null,
  switches_by_name: false,
  items: [],
  on_count: 0,
  off_count: 0,
  measured_on_count: 0,
  on_tokens_measured: 0,
});

const NAMES: Record<string, string> = { codex: "Engine C", gemini: "Engine G", "claude-code": "Engine K" };

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
    if (cmd === "get_engine_context") return contextOf(args.engineId, NAMES[args.engineId] ?? args.engineId);
    if (cmd === "start_scan") return "mock-scan-id";
    return null;
  }),
}));

const contextCalls = () =>
  vi
    .mocked(invoke)
    .mock.calls.filter((c) => c[0] === "get_engine_context")
    .map((c) => (c[1] as { engineId: string }).engineId);

const completeScan = async () => {
  await waitFor(() => expect(eventListeners["scan://complete"]).toBeDefined());
  await act(async () => {
    await eventListeners["scan://complete"]({
      payload: { inventory: { agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [] } },
    });
  });
};

const crumb = () => document.querySelector("[data-rail-column] > div") as HTMLElement;

beforeEach(() => {
  cleanup();
  eventListeners = {};
  vi.mocked(invoke).mockClear();
  mockPreferences = {
    onboarding_complete: "true",
    consent_crash: "true",
    consent_usage: "true",
    sidebar_collapsed: "false",
    selected_sidebar_item: "engines",
    inspector_open: "false",
  };
});
afterEach(cleanup);

describe("The Engines screen in App", () => {
  it("lists the summary's engines and an engine reachable only through its kept servers", async () => {
    render(<App />);
    await completeScan();
    const list = await screen.findByTestId("engines-sidebar");
    await waitFor(() =>
      expect(within(list).getAllByRole("button").map((b) => b.textContent)).toEqual([
        "Engine C",
        "Engine G",
        "Engine K",
      ])
    );
  });

  it("restores the stored engine, names it in the crumb, and reads its context", async () => {
    mockPreferences.selected_engine = "gemini";
    render(<App />);
    await completeScan();
    const gemini = await screen.findByRole("button", { name: "Engine G" });
    await waitFor(() => expect(gemini.getAttribute("aria-current")).toBe("true"));
    expect(within(crumb()).getByText("Engines")).toBeTruthy();
    expect(within(crumb()).getByText("Engine G")).toBeTruthy();
    await waitFor(() => expect(contextCalls()).toContain("gemini"));
    expect(contextCalls()).not.toContain("codex");
  });

  it("falls back to the first engine when the stored one is not in the list", async () => {
    mockPreferences.selected_engine = "cursor";
    render(<App />);
    await completeScan();
    const codex = await screen.findByRole("button", { name: "Engine C" });
    await waitFor(() => expect(codex.getAttribute("aria-current")).toBe("true"));
    await waitFor(() => expect(contextCalls()).toContain("codex"));
  });

  it("before the first scan the crumb is just Engines and nothing is read", async () => {
    render(<App />);
    await screen.findByTestId("engines-sidebar");
    expect(within(crumb()).getByText("Engines")).toBeTruthy();
    expect(contextCalls()).toEqual([]);
  });

  it("a click selects an engine and persists it as selected_engine", async () => {
    render(<App />);
    await completeScan();
    fireEvent.click(await screen.findByRole("button", { name: "Engine K" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_preference", { key: "selected_engine", value: "claude-code" })
    );
    await waitFor(() => expect(contextCalls()).toContain("claude-code"));
    expect(within(crumb()).getByText("Engine K")).toBeTruthy();
  });

  it("a finished scan has the pane read its engine again", async () => {
    render(<App />);
    await completeScan();
    await waitFor(() => expect(contextCalls()).toEqual(["codex"]));
    await completeScan();
    await waitFor(() => expect(contextCalls()).toEqual(["codex", "codex"]));
  });

  it("reports the screen as engines", async () => {
    render(<App />);
    await screen.findByTestId("engines-sidebar");
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("track_screen_view", { screen: "engines" }));
  });
});
