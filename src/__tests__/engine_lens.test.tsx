// @vitest-environment happy-dom
/** App's share of the engine lens (Phase 1 of
 *  docs/plans/2026-11-25-ia-global-by-engine.md), which replaces the Engines
 *  tab T1 of docs/plans/2026-11-25-ia-engines-into-global.md built. Global has
 *  no Engines tab; a stored Engines route lands on Global and keeps its
 *  engine; the engine is picked in the overview card's Engines group (the
 *  chip row until Task 7 of docs/plans/2026-11-26-overview-card.md), persisted as
 *  `selected_engine` ("" for All engines) and restored on open (Q2); the crumb
 *  names the engine, and its "Global" clears it; and the inspector's engine
 *  names set the engine without leaving the tab. These are the intents of the
 *  retired engines_screen.test.tsx, moved onto the new surface. */
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

/** Every server Engine K declares is switched off and kept, so it is listed
 *  last, for its kept server alone: the chips must still reach it (P8). */
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

const ITEMS: Record<string, ContextItem[]> = {
  codex: [itemOf({ key: ALPHA_KEY, name: "alpha" })],
  "claude-code": [
    itemOf({ key: "stash:00000000-0000-4000-8000-000000000001", name: "beta", tier: "user", config_path: "", state: "off" }),
  ],
};

const contextOf = (engineId: string, engineName: string): EngineContext => ({
  engine_id: engineId,
  engine_key: engineId.replace(/-/g, "_"),
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

/** alpha reaches Engine C, so its tile can link there. */
const ANNOTATIONS = [
  {
    asset_path: ALPHA_KEY,
    mechanism: "none",
    reach: [{ engine_id: 2, engine_key: "codex", engine_name: "Engine C", reached: true, reason: null }],
    beyond: null,
  },
];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === "get_preference") return mockPreferences[args?.key] ?? null;
    if (cmd === "set_preference") {
      if (args?.key) mockPreferences[args.key] = String(args.value);
      return null;
    }
    if (cmd === "get_linked_directories") return [];
    if (cmd === "get_asset_counts") return { total: 0, byCategory: {}, engines: {} };
    if (cmd === "get_asset_annotations") return ANNOTATIONS;
    if (cmd === "get_kept_off_servers") return KEPT;
    if (cmd === "get_engine_context") return contextOf(args.engineId, NAMES[args.engineId] ?? args.engineId);
    if (cmd === "get_engine_contexts") return ["codex", "gemini", "claude-code"].map((id) => contextOf(id, NAMES[id]));
    if (cmd === "get_mcp_processes") return [];
    if (cmd === "start_scan") return "mock-scan-id";
    return null;
  }),
}));

const completeScan = async (inventory: unknown = INVENTORY) => {
  await waitFor(() => expect(eventListeners["scan://complete"]).toBeDefined());
  await act(async () => {
    await eventListeners["scan://complete"]({ payload: { inventory } });
  });
};

const crumb = () => document.querySelector("[data-rail-column] > div") as HTMLElement;
const crumbText = () =>
  Array.from(crumb().querySelectorAll("button, span, b"))
    .filter((el) => el.children.length === 0)
    .map((el) => el.textContent)
    .filter((t) => t !== "›" && t !== "")
    .join(" › ");
const tabs = () => within(screen.getByRole("tablist", { name: "Filter by category" })).getAllByRole("tab");
const tab = (name: RegExp) => screen.getByRole("tab", { name });
/** The engine selector is the overview card's Engines group since Task 7 of
 *  docs/plans/2026-11-26-overview-card.md: the card opens from the content
 *  cap's button, and stays open while an engine is picked. */
const openCard = () => {
  const open = screen.queryByRole("dialog", { name: "Overview" });
  if (open) return open;
  fireEvent.click(screen.getByLabelText("Show overview ⌘E"));
  return screen.getByRole("dialog", { name: "Overview" });
};
const chipGroup = () => within(openCard()).getByRole("group", { name: "Engines" });
const chips = () => within(chipGroup()).getAllByRole("button");
const chip = (name: string) => {
  const row = chipGroup().querySelector(`[data-engine-name="${name}"]`);
  if (!row) throw new Error(`no engine row named ${name}`);
  return row as HTMLElement;
};
const routeWrites = () =>
  vi
    .mocked(invoke)
    .mock.calls.filter((c) => c[0] === "set_preference" && (c[1] as { key: string }).key === "selected_sidebar_item")
    .map((c) => (c[1] as { value: string }).value);
const engineWrites = () =>
  vi
    .mocked(invoke)
    .mock.calls.filter((c) => c[0] === "set_preference" && (c[1] as { key: string }).key === "selected_engine")
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
    selected_sidebar_item: "profile",
    inspector_open: "false",
  };
});
afterEach(cleanup);

describe("Global has no Engines tab", () => {
  it("lists the kinds only: All · Skills · MCP servers · Rules · Subagents", async () => {
    render(<App />);
    await completeScan();
    await waitFor(() => expect(tabs().length).toBeGreaterThan(1));
    expect(tabs().map((t) => t.textContent?.replace(/\d+$/, ""))).toEqual([
      "All",
      "Skills",
      "MCP servers",
      "Rules",
      "Subagents",
    ]);
    expect(screen.queryByRole("tab", { name: "Engines" })).toBeNull();
  });

  it("a stored engines route lands on Global, written back as profile, and keeps the engine", async () => {
    mockPreferences.selected_sidebar_item = "engines";
    mockPreferences.selected_engine = "gemini";
    render(<App />);
    await completeScan();
    await waitFor(() => expect(routeWrites()).toContain("profile"));
    expect(routeWrites()).not.toContain("global:Engines");
    await waitFor(() => expect(chip("Engine G").getAttribute("aria-current")).toBe("true"));
    expect(screen.queryByTestId("engines-pane")).toBeNull();
    expect(engineWrites()).toEqual([]);
  });

  it("a stored global:Engines route lands on Global, written back as profile, and keeps the engine", async () => {
    mockPreferences.selected_sidebar_item = "global:Engines";
    mockPreferences.selected_engine = "codex";
    render(<App />);
    await completeScan();
    await waitFor(() => expect(routeWrites()).toContain("profile"));
    await waitFor(() => expect(chip("Engine C").getAttribute("aria-current")).toBe("true"));
    expect(tab(/^All/).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByTestId("engines-pane")).toBeNull();
    expect(
      within(screen.getByTestId("icon-rail")).getByRole("button", { name: "My machine" }).getAttribute("aria-current")
    ).toBe("true");
  });

  it("reports the screen as my_machine", async () => {
    render(<App />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("track_screen_view", { screen: "my_machine" }));
    expect(invoke).not.toHaveBeenCalledWith("track_screen_view", { screen: "engines" });
  });
});

describe("the engines in the overview card", () => {
  it("lead with All engines, then every engine get_engine_contexts lists, ranked", async () => {
    render(<App />);
    await completeScan();
    // None has a figure here, so the ranking falls to the names.
    await waitFor(() =>
      expect(chips().map((b) => b.getAttribute("data-engine-name"))).toEqual(["All engines", "Engine C", "Engine G", "Engine K"])
    );
  });

  it("sit on every Global tab, and the selection holds as the tab changes", async () => {
    render(<App />);
    await completeScan();
    await waitFor(() => expect(chips()).toHaveLength(4));
    fireEvent.click(chip("Engine C"));
    for (const name of [/^Skills/, /^MCP servers/, /^Rules/, /^Subagents/, /^All/]) {
      const t = screen.queryByRole("tab", { name });
      if (!t) continue;
      fireEvent.click(t);
      expect(chip("Engine C").getAttribute("aria-current")).toBe("true");
      expect(chip("All engines").getAttribute("aria-current")).toBeNull();
    }
  });

  it("open on All engines the first time", async () => {
    render(<App />);
    await completeScan();
    await waitFor(() => expect(chip("All engines").getAttribute("aria-current")).toBe("true"));
    expect(crumbText()).toBe("My machine › Global");
  });

  it("restore the stored engine and read its context, on a tab with no MCP rows", async () => {
    mockPreferences.selected_sidebar_item = "global:Skills";
    mockPreferences.selected_engine = "gemini";
    render(<App />);
    await completeScan();
    await waitFor(() => expect(chip("Engine G").getAttribute("aria-current")).toBe("true"));
    await waitFor(() => expect(vi.mocked(invoke).mock.calls.some((c) => c[0] === "get_engine_contexts")).toBe(true));
  });

  it("fall back to All engines when the stored engine is not in the list", async () => {
    mockPreferences.selected_engine = "cursor";
    render(<App />);
    await completeScan();
    await waitFor(() => expect(chip("All engines").getAttribute("aria-current")).toBe("true"));
  });

  it("claim nothing before the first scan", async () => {
    render(<App />);
    await screen.findByRole("tablist", { name: "Filter by category" });
    expect(screen.queryByRole("group", { name: "Engines" })).toBeNull();
  });

  it("persist a pick as selected_engine, and All engines as the empty value", async () => {
    render(<App />);
    await completeScan();
    await waitFor(() => expect(chips()).toHaveLength(4));
    fireEvent.click(chip("Engine K"));
    await waitFor(() => expect(engineWrites()).toEqual(["claude-code"]));
    expect(chip("Engine K").getAttribute("aria-current")).toBe("true");
    fireEvent.click(chip("All engines"));
    await waitFor(() => expect(engineWrites()).toEqual(["claude-code", ""]));
    expect(chip("All engines").getAttribute("aria-current")).toBe("true");
  });

  it("are buttons with a visible focus target: the picked one aria-current, no outline opt-out", async () => {
    render(<App />);
    await completeScan();
    await waitFor(() => expect(chips()).toHaveLength(4));
    for (const b of chips()) {
      expect(b.tagName).toBe("BUTTON");
      expect(b.getAttribute("aria-current")).toBe(b.getAttribute("data-engine-name") === "All engines" ? "true" : null);
      expect(b.className).not.toMatch(/outline-none/);
    }
  });
});

describe("the crumb", () => {
  it("names the engine, and its Global clears back to All engines", async () => {
    render(<App />);
    await completeScan();
    await waitFor(() => expect(chips()).toHaveLength(4));
    fireEvent.click(chip("Engine C"));
    await waitFor(() => expect(crumbText()).toBe("My machine › Global › Engine C"));

    fireEvent.click(within(crumb()).getByRole("button", { name: "Global" }));
    await waitFor(() => expect(crumbText()).toBe("My machine › Global"));
    expect(chip("All engines").getAttribute("aria-current")).toBe("true");
    expect(engineWrites()).toEqual(["codex", ""]);
  });

  it("names no tab id on a tab route", async () => {
    mockPreferences.selected_sidebar_item = "global:Tools";
    render(<App />);
    await completeScan();
    await waitFor(() => expect(chips()).toHaveLength(4));
    expect(crumbText()).toBe("My machine › Global");
  });
});

describe("the inspector sets the engine, and the tab stays", () => {
  it("an engine's name in Registered in selects that engine on the current tab", async () => {
    mockPreferences.selected_sidebar_item = "profile";
    render(<App />);
    await completeScan();
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
    await waitFor(() => expect(engineWrites()).toEqual(["codex"]));
    await waitFor(() => expect(chip("Engine C").getAttribute("aria-current")).toBe("true"));
    expect(screen.getByRole("tab", { name: /^MCP servers/ }).getAttribute("aria-selected")).toBe("true");
    expect(routeWrites()).not.toContain("global:Engines");
    // Setting the engine is not choosing a new subject.
    expect(document.querySelector("aside")).not.toBeNull();
  });
});
