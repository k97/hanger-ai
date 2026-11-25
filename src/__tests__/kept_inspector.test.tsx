// @vitest-environment happy-dom
/** A server Hanger is keeping while it is switched off opens in the
 *  inspector (T4, D5 of docs/plans/2026-11-25-ia-engines-into-global.md):
 *  from the "Switched off" group on Global › MCP servers, without a change of
 *  screen, with or without its engine picked. The kept view switches it back
 *  on through the one switch state, names its engine as a link that shows
 *  Global seen by it (docs/plans/2026-11-25-ia-global-by-engine.md), and the
 *  list of kept servers is read again after a switch, not only after the
 *  rescan. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act, within } from "@testing-library/react";
import App from "../App";
import { invoke } from "@tauri-apps/api/core";
import type { ContextItem, EngineContext, KeptOff } from "../types/engineContext";

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

const STASH = "stash:00000000-0000-4000-8000-000000000001";

const KEPT: KeptOff = {
  servers: [
    {
      key: STASH,
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
const NONE_KEPT: KeptOff = { servers: [], count: 0, only_kept_count: 0 };

const CODEX_FILE = "/Users/test/.codex/config.toml";
const ALPHA_KEY = `${CODEX_FILE}:alpha`;

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

const NAMES: Record<string, string> = { codex: "Engine C", "claude-code": "Engine K" };

const contextOf = (engineId: string, items: ContextItem[]): EngineContext => ({
  engine_id: engineId,
  engine_key: engineId.replace(/-/g, "_"),
  engine_name: NAMES[engineId] ?? engineId,
  applies: null,
  switches_by_name: false,
  items,
  on_count: 0,
  off_count: 0,
  measured_on_count: 0,
  on_tokens_measured: 0,
});

const ITEMS: Record<string, ContextItem[]> = {
  codex: [itemOf({ key: ALPHA_KEY, name: "alpha" })],
  "claude-code": [itemOf({ key: STASH, name: "beta", tier: "user", config_path: "", state: "off" })],
};

/** What `get_kept_off_servers` answers now; a switch back on empties it. */
let keptReply: KeptOff;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === "get_preference") return mockPreferences[args?.key] ?? null;
    if (cmd === "set_preference") {
      if (args?.key) mockPreferences[args.key] = String(args.value);
      return null;
    }
    if (cmd === "get_linked_directories") return [];
    if (cmd === "get_asset_counts") return { total: 1, byCategory: { tool: { global: 1 } }, engines: {} };
    if (cmd === "get_kept_off_servers") return keptReply;
    if (cmd === "get_engine_context") return contextOf(args.engineId, ITEMS[args.engineId] ?? []);
    if (cmd === "get_engine_contexts") return ["codex", "claude-code"].map((id) => contextOf(id, ITEMS[id]));
    if (cmd === "get_mcp_processes") return [];
    if (cmd === "get_asset_annotations")
      return [
        {
          asset_path: ALPHA_KEY,
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
          registrations: [ALPHA_KEY],
        },
      ];
    if (cmd === "set_mcp_server_enabled" && args?.engineId === "codex")
      return {
        context: contextOf("codex", [itemOf({ key: ALPHA_KEY, name: "alpha", state: "off" })]),
        receipt_id: "r0",
        undoable: true,
      };
    if (cmd === "set_mcp_server_enabled") {
      keptReply = NONE_KEPT;
      return {
        context: contextOf("claude-code", [itemOf({ key: "/Users/test/.claude.json:beta", name: "beta", tier: "user" })]),
        receipt_id: "r1",
        undoable: true,
      };
    }
    if (cmd === "start_scan") return "mock-scan-id";
    return null;
  }),
}));

const calls = (cmd: string) =>
  vi
    .mocked(invoke)
    .mock.calls.filter((c) => c[0] === cmd)
    .map((c) => c[1] as any);

const routeWrites = () =>
  calls("set_preference")
    .filter((a) => a.key === "selected_sidebar_item")
    .map((a) => a.value);

const completeScan = async (inventory: typeof INVENTORY = INVENTORY) => {
  await waitFor(() => expect(eventListeners["scan://complete"]).toBeDefined());
  await act(async () => {
    await eventListeners["scan://complete"]({ payload: { inventory } });
  });
};

/** INVENTORY plus a server named beta still declared in Codex's file: the
 *  declared twin of the kept beta (`also_declared`). */
const BETA_KEY = `${CODEX_FILE}:beta`;
const INVENTORY_WITH_BETA = {
  ...INVENTORY,
  tools: [...INVENTORY.tools, { ...INVENTORY.tools[0], id: BETA_KEY, name: "beta" }],
};

const aside = () =>
  waitFor(() => {
    const el = document.querySelector("aside");
    expect(el).not.toBeNull();
    return el as HTMLElement;
  });

const KEPT_LINE = "Removed from Engine K. Hanger keeps its configuration and puts it back when you switch it on.";

/** The "Switched off" group's row for beta. */
const keptRow = async () => (await screen.findByText("Off for Engine K")).closest("button") as HTMLElement;

beforeEach(() => {
  cleanup();
  eventListeners = {};
  keptReply = KEPT;
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

describe("A switched-off server opens in the inspector", () => {
  it("a Switched off row opens the kept view, is selected, and stays on MCP servers", async () => {
    render(<App />);
    await completeScan();
    const row = await keptRow();
    expect(row.getAttribute("data-selected")).toBe("false");
    fireEvent.click(row);

    const panel = await aside();
    expect(await within(panel).findByRole("heading", { level: 2, name: "beta" })).toBeTruthy();
    expect(within(panel).getByText("stdio")).toBeTruthy();
    expect(within(panel).getByText(KEPT_LINE)).toBeTruthy();
    await waitFor(() => expect((document.querySelector("[data-selected='true']") as HTMLElement)?.textContent).toContain("beta"));
    // Not a change of screen or of tab.
    expect(routeWrites()).not.toContain("global:Engines");
    expect(calls("set_preference").some((a) => a.key === "selected_engine")).toBe(false);
    expect(screen.getByRole("tab", { name: /^MCP servers/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("the kept view says when it was switched off, as an age", async () => {
    // Q4 of docs/plans/2026-11-25-decisions-round-2.md: "Switched off
    // {timeAgo}", from `at_ms` through the app's own timeAgo.
    keptReply = { ...KEPT, servers: [{ ...KEPT.servers[0], at_ms: Date.now() - 4 * 60_000 - 5_000 }] };
    render(<App />);
    await completeScan();
    fireEvent.click(await keptRow());
    const kept = await within(await aside()).findByTestId("kept-detail");
    expect(within(kept).getByText("Switched off 4 min ago")).toBeTruthy();
  });

  it("a kept remote server's chip shows the domain it lives on, never its address", async () => {
    const address = "https://hmc-zohomail-12345678901.zohomcp.in/mcp/0123456789abcdef0123456789abcdef/message";
    keptReply = { ...KEPT, servers: [{ ...KEPT.servers[0], transport: address }] };
    render(<App />);
    await completeScan();
    const row = await keptRow();
    expect(within(row).getByText("zohomcp.in")).toBeTruthy();
    expect(row.textContent).not.toContain("0123456789abcdef0123456789abcdef");
  });

  it("the kept view's switch turns it back on with its stash key, and the notice offers Undo", async () => {
    render(<App />);
    await completeScan();
    fireEvent.click(await keptRow());
    const panel = await aside();
    const sw = await within(panel).findByRole("button", { name: "beta" });
    expect(sw.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(sw);

    await waitFor(() =>
      expect(calls("set_mcp_server_enabled")).toEqual([{ engineId: "claude-code", key: STASH, enabled: true }])
    );
    const status = await screen.findByRole("status");
    await waitFor(() => expect(within(status).getByText("beta is on for Engine K.")).toBeTruthy());
    expect(within(status).getByRole("button", { name: "Undo" })).toBeTruthy();
  });

  it("the kept view names its engine as a link that shows Global seen by that engine, on the same tab", async () => {
    render(<App />);
    await completeScan();
    fireEvent.click(await keptRow());
    const panel = await aside();
    const kept = await within(panel).findByTestId("kept-detail");
    fireEvent.click(within(kept).getByRole("button", { name: "Engine K" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_preference", { key: "selected_engine", value: "claude-code" })
    );
    const chips = screen.getByRole("group", { name: "Engines" });
    await waitFor(() => expect(within(chips).getByRole("button", { name: "Engine K" }).getAttribute("aria-pressed")).toBe("true"));
    expect(routeWrites()).not.toContain("global:Engines");
    expect(screen.getByRole("tab", { name: /^MCP servers/ }).getAttribute("aria-selected")).toBe("true");
    // Picking an engine keeps the inspector's subject.
    expect(within(await aside()).getByRole("heading", { level: 2, name: "beta" })).toBeTruthy();
  });

  it("with its engine picked, the Switched off row still opens the same kept view", async () => {
    mockPreferences.selected_engine = "claude-code";
    render(<App />);
    await completeScan();
    fireEvent.click(await keptRow());

    const panel = await aside();
    expect(await within(panel).findByTestId("kept-detail")).toBeTruthy();
    expect(within(panel).getByRole("heading", { level: 2, name: "beta" })).toBeTruthy();
  });

  it("reads the kept servers again after a switch, without waiting for the rescan", async () => {
    // T2's gap: a Claude Code server switched off from a row's tile becomes a
    // kept server, and "Switched off" must show it on the switch's own read.
    keptReply = NONE_KEPT;
    render(<App />);
    await completeScan();
    const tile = await screen.findByRole("button", { name: "Switch alpha off for Engine C" });
    expect(screen.queryByText("Off for Engine K")).toBeNull();
    const reads = calls("get_kept_off_servers").length;
    keptReply = KEPT;
    fireEvent.click(tile);

    await waitFor(() => expect(calls("get_kept_off_servers").length).toBeGreaterThan(reads));
    // No scan://complete has fired since: the group comes from that read.
    expect(await screen.findByText("Off for Engine K")).toBeTruthy();
  });
});

describe("A kept server some file still declares", () => {
  it("says so, and Show it opens the declared server in the inspector", async () => {
    // Q4 of docs/plans/2026-11-25-decisions-round-2.md: the line and its
    // "Show it", which opens the declared server's own inspector.
    keptReply = { ...KEPT, servers: [{ ...KEPT.servers[0], also_declared: true }] };
    render(<App />);
    await completeScan(INVENTORY_WITH_BETA);
    fireEvent.click(await keptRow());
    const kept = await within(await aside()).findByTestId("kept-detail");
    expect(within(kept).getByText("A config file still declares a server named beta.")).toBeTruthy();
    fireEvent.click(within(kept).getByRole("button", { name: "Show it" }));

    const panel = await aside();
    await waitFor(() => expect(within(panel).queryByTestId("kept-detail")).toBeNull());
    expect(within(panel).getByRole("heading", { level: 2, name: "beta" })).toBeTruthy();
    // The declared server's own view: the MCP inspector's tabs, which the
    // kept view has none of.
    expect(within(panel).getByRole("tab", { name: "Details" })).toBeTruthy();
  });

  it("says nothing of the kind when no file declares it", async () => {
    render(<App />);
    await completeScan();
    fireEvent.click(await keptRow());
    const kept = await within(await aside()).findByTestId("kept-detail");
    expect(within(kept).queryByText(/still declares/)).toBeNull();
    expect(within(kept).queryByRole("button", { name: "Show it" })).toBeNull();
  });
});
