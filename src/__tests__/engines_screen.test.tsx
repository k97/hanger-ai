// @vitest-environment happy-dom
/** App's share of Global's Engines tab (T1 of
 *  docs/plans/2026-11-25-ia-engines-into-global.md, which folded the Engines
 *  screen of docs/plans/2026-11-25-context-control-finish.md into Global):
 *  where the tab sits and where it does not, how a stored `engines` route
 *  migrates, which engines the chips hold (P8), which one is selected and how
 *  that survives a restart (`selected_engine`), the page_view name, the
 *  refetch a finished scan asks of the pane, and the two links D6 adds — a
 *  row's name opens its server in the inspector, and an engine's name in the
 *  inspector opens the tab on that engine. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act, within } from "@testing-library/react";
import App from "../App";
import { invoke } from "@tauri-apps/api/core";
import type { ContextItem, EngineContext, KeptOff } from "../types/engineContext";
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
 *  has no row for it: the chips must still reach it (P8). */
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

const CODEX_FILE = "/Users/test/.codex/config.toml";
/** The registration key the backend mints for alpha: the inventory's tool id
 *  and the context item's key are the same string. */
const ALPHA_KEY = `${CODEX_FILE}:alpha`;

/** One tool in the inventory, which Engine C's context lists, and a kept item
 *  that is in no file and so has no inventory asset. */
const INVENTORY = {
  agents: [],
  skills: [],
  tools: [
    {
      id: ALPHA_KEY,
      name: "alpha",
      command: "npx",
      args: [],
      transport: "stdio",
      config_path: CODEX_FILE,
      scope: { Global: { agent: "codex" } },
      owning_agent: "codex",
    },
  ],
  rules: [],
  subagents: [],
  project_scans: [],
};

const itemOf = (over: Partial<ContextItem> & Pick<ContextItem, "key" | "name">): ContextItem =>
  ({
    tier: "global",
    config_path: "~/.codex/config.toml",
    state: "on",
    read_only: null,
    estimated_tokens: null,
    tool_count: null,
    ...over,
  }) as ContextItem;

const ITEMS: Record<string, ContextItem[]> = {
  codex: [itemOf({ key: ALPHA_KEY, name: "alpha" })],
  "claude-code": [
    itemOf({ key: "stash:00000000-0000-4000-8000-000000000001", name: "beta", tier: "user", config_path: "", state: "off" }),
  ],
};

const contextOf = (engineId: string, engineName: string): EngineContext => ({
  engine_id: engineId,
  engine_name: engineName,
  applies: null,
  switches_by_name: false,
  items: ITEMS[engineId] ?? [],
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
    if (cmd === "get_mcp_processes") return [];
    if (cmd === "start_scan") return "mock-scan-id";
    return null;
  }),
}));

const contextCalls = () =>
  vi
    .mocked(invoke)
    .mock.calls.filter((c) => c[0] === "get_engine_context")
    .map((c) => (c[1] as { engineId: string }).engineId);

const completeScan = async (inventory: unknown = INVENTORY) => {
  await waitFor(() => expect(eventListeners["scan://complete"]).toBeDefined());
  await act(async () => {
    await eventListeners["scan://complete"]({ payload: { inventory } });
  });
};

const crumb = () => document.querySelector("[data-rail-column] > div") as HTMLElement;
const tabs = () => within(screen.getByRole("tablist", { name: "Filter by category" })).getAllByRole("tab");
const enginesTab = () => screen.getByRole("tab", { name: "Engines" });
const chips = () => within(screen.getByRole("group", { name: "Engines" })).getAllByRole("button");
const chip = (name: string) => within(screen.getByRole("group", { name: "Engines" })).getByRole("button", { name });
const routeWrites = () =>
  vi
    .mocked(invoke)
    .mock.calls.filter((c) => c[0] === "set_preference" && (c[1] as { key: string }).key === "selected_sidebar_item")
    .map((c) => (c[1] as { value: string }).value);

beforeEach(() => {
  cleanup();
  eventListeners = {};
  vi.mocked(invoke).mockClear();
  mockPreferences = {
    onboarding_complete: "true",
    consent_crash: "true",
    consent_usage: "true",
    sidebar_collapsed: "false",
    selected_sidebar_item: "global:Engines",
    inspector_open: "false",
  };
});
afterEach(cleanup);

describe("Global's Engines tab", () => {
  it("sits second on Global, straight after All, and carries no figure", async () => {
    mockPreferences.selected_sidebar_item = "profile";
    render(<App />);
    await completeScan();
    await waitFor(() => expect(tabs().length).toBeGreaterThan(1));
    // Karthik, 2026-11-25: All · Engines · Skills · MCP servers · Rules · Subagents.
    expect(tabs().map((t) => t.textContent?.replace(/\d+$/, ""))).toEqual([
      "All",
      "Engines",
      "Skills",
      "MCP servers",
      "Rules",
      "Subagents",
    ]);
    // No figure on Engines: the other five end in theirs.
    expect(enginesTab().textContent).toBe("Engines");
  });

  it("is not a tab on a repository", async () => {
    mockPreferences.selected_sidebar_item = "/Users/test/proj";
    render(<App />);
    await completeScan();
    await screen.findByRole("tablist", { name: "Filter by category" });
    expect(screen.queryByRole("tab", { name: "Engines" })).toBeNull();
  });

  it("has no rail entry", async () => {
    render(<App />);
    const rail = await screen.findByTestId("icon-rail");
    expect(within(rail).queryByRole("button", { name: "Engines" })).toBeNull();
  });

  it("a stored engines route lands on Global with the Engines tab, written back as global:Engines", async () => {
    mockPreferences.selected_sidebar_item = "engines";
    render(<App />);
    await completeScan();
    await waitFor(() => expect(enginesTab().getAttribute("aria-selected")).toBe("true"));
    expect(screen.getByTestId("engines-pane")).toBeTruthy();
    expect(routeWrites()).toContain("global:Engines");
    // The second column is Global's own source list, not an engines list.
    expect(screen.queryByTestId("engines-sidebar")).toBeNull();
    expect(within(crumb()).getByText("Global")).toBeTruthy();
    expect(
      within(screen.getByTestId("icon-rail")).getByRole("button", { name: "My machine" }).getAttribute("aria-current")
    ).toBe("true");
  });

  it("lists the summary's engines and an engine reachable only through its kept servers", async () => {
    render(<App />);
    await completeScan();
    await waitFor(() => expect(chips().map((b) => b.textContent)).toEqual(["Engine C", "Engine G", "Engine K"]));
  });

  it("restores the stored engine and reads its context", async () => {
    mockPreferences.selected_engine = "gemini";
    render(<App />);
    await completeScan();
    await waitFor(() => expect(chip("Engine G").getAttribute("aria-pressed")).toBe("true"));
    await waitFor(() => expect(contextCalls()).toContain("gemini"));
    expect(contextCalls()).not.toContain("codex");
  });

  it("falls back to the first engine when the stored one is not in the list", async () => {
    mockPreferences.selected_engine = "cursor";
    render(<App />);
    await completeScan();
    await waitFor(() => expect(chip("Engine C").getAttribute("aria-pressed")).toBe("true"));
    await waitFor(() => expect(contextCalls()).toContain("codex"));
  });

  it("before the first scan nothing is read", async () => {
    render(<App />);
    await screen.findByTestId("engines-pane");
    expect(screen.queryByRole("group", { name: "Engines" })).toBeNull();
    expect(contextCalls()).toEqual([]);
  });

  it("a click on a chip selects an engine and persists it as selected_engine", async () => {
    render(<App />);
    await completeScan();
    await waitFor(() => expect(chips()).toHaveLength(3));
    fireEvent.click(chip("Engine K"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_preference", { key: "selected_engine", value: "claude-code" })
    );
    await waitFor(() => expect(contextCalls()).toContain("claude-code"));
    expect(chip("Engine K").getAttribute("aria-pressed")).toBe("true");
  });

  it("a finished scan has the pane read its engine again", async () => {
    render(<App />);
    await completeScan();
    await waitFor(() => expect(contextCalls()).toEqual(["codex"]));
    await completeScan();
    await waitFor(() => expect(contextCalls()).toEqual(["codex", "codex"]));
  });

  it("another tab hands the choice back to the pane, so the route no longer holds it on Engines", async () => {
    render(<App />);
    await completeScan();
    await waitFor(() => expect(enginesTab().getAttribute("aria-selected")).toBe("true"));
    fireEvent.click(screen.getByRole("tab", { name: /^MCP servers/ }));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /^MCP servers/ }).getAttribute("aria-selected")).toBe("true")
    );
    expect(screen.queryByTestId("engines-pane")).toBeNull();
    expect(routeWrites()).toContain("profile");
  });

  it("a kept server's row in the MCP servers list opens it in the inspector, not the Engines tab", async () => {
    mockPreferences.selected_sidebar_item = "global:Tools";
    render(<App />);
    await completeScan();
    const line = await screen.findByText("Off for Engine K");
    fireEvent.click(line.closest("button")!);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_preference", { key: "inspector_open", value: "true" })
    );
    expect(routeWrites()).not.toContain("global:Engines");
    expect(invoke).not.toHaveBeenCalledWith("set_preference", { key: "selected_engine", value: "claude-code" });
  });

  it("reports the screen as my_machine, since a tab is not a screen", async () => {
    render(<App />);
    await screen.findByTestId("engines-pane");
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("track_screen_view", { screen: "my_machine" }));
    expect(invoke).not.toHaveBeenCalledWith("track_screen_view", { screen: "engines" });
  });
});

describe("Global's Engines tab and the inspector (D6)", () => {
  it("a click on a row's name opens its server in the inspector; a click on its switch does not", async () => {
    render(<App />);
    await completeScan();
    const row = (await screen.findAllByTestId("engine-item"))[0];
    expect(document.querySelector("aside")).toBeNull();

    fireEvent.click(within(row).getByRole("button", { name: "alpha" }));
    await waitFor(() => expect(vi.mocked(invoke).mock.calls.some((c) => c[0] === "set_mcp_server_enabled")).toBe(true));
    expect(document.querySelector("aside")).toBeNull();

    fireEvent.click(within(row).getByTestId("engine-item-name"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_preference", { key: "inspector_open", value: "true" })
    );
    const aside = await waitFor(() => {
      const el = document.querySelector("aside");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(await within(aside).findByRole("heading", { level: 2, name: "alpha" })).toBeTruthy();
    // Opening the inspector is not leaving the tab.
    expect(enginesTab().getAttribute("aria-selected")).toBe("true");
  });

  it("a kept item has no inventory asset, so its name opens the kept view", async () => {
    mockPreferences.selected_engine = "claude-code";
    render(<App />);
    await completeScan();
    const row = (await screen.findAllByTestId("engine-item"))[0];
    expect(within(row).getByTestId("engine-item-name").textContent).toBe("beta");
    expect(within(row).getByTestId("engine-item-name").closest("button")).not.toBeNull();
  });

  it("an engine's name in Registered in opens the Engines tab on that engine", async () => {
    mockPreferences.selected_sidebar_item = "profile";
    mockPreferences.selected_engine = "gemini";
    render(<App />);
    await completeScan();
    // Open alpha from the MCP servers list, then its Details tab.
    fireEvent.click(screen.getByRole("tab", { name: /^MCP servers/ }));
    const listRow = await screen.findByText("alpha");
    fireEvent.click(listRow.closest("[tabindex]") as HTMLElement);
    const aside = await waitFor(() => {
      const el = document.querySelector("aside");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    fireEvent.click(await within(aside).findByRole("tab", { name: "Details" }));
    const reg = await within(aside).findByTestId("registration-row");
    const link = within(reg)
      .getAllByRole("button")
      .find((b) => !b.getAttribute("aria-label"));
    expect(link, "the engine's name is not a link").toBeTruthy();

    fireEvent.click(link!);
    await waitFor(() => expect(routeWrites()).toContain("global:Engines"));
    expect(invoke).toHaveBeenCalledWith("set_preference", { key: "selected_engine", value: "codex" });
    await waitFor(() => expect(enginesTab().getAttribute("aria-selected")).toBe("true"));
    await waitFor(() => expect(chip("Engine C").getAttribute("aria-pressed")).toBe("true"));
    // A change of tab within Global keeps the inspector's subject.
    expect(document.querySelector("aside")).not.toBeNull();
  });
});
