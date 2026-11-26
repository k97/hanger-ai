// @vitest-environment happy-dom
/** Task 2 of docs/plans/2026-11-26-global-list.md: the overview card docks
 *  at the top right when the list has room, as T3 Code's session card does,
 *  and opens from its window-bar button as a popover when it has not (round
 *  16 q2). The pin, its preference and the inspector slot are gone; the
 *  button hides the docked card instead, under `overview_hidden`.
 *
 *  happy-dom lays nothing out, so the dock is forced here (`forceDock`) or
 *  measured off a stubbed ResizeObserver. Where the card lands on screen,
 *  and the lane's 32px clearance, are screenshot claims; what these pin is
 *  the class contract and the wiring. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act, within } from "@testing-library/react";
import App, { type Inventory } from "../App";
import ProfilePane from "../components/ProfilePane";
import type { EngineContext } from "../types/engineContext";

vi.mock("@tauri-apps/plugin-log", () => ({
  warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), trace: vi.fn(),
  attachConsole: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(), openPath: vi.fn(), revealItemInDir: vi.fn() }));

let mockPreferences: Record<string, string> = {};
/** Holds `get_mcp_servers` open, as a slow read on a large machine does, so
 *  the reads App makes after it on scan://complete have not run. */
let holdMcpServers = false;
let eventListeners: Record<string, Function> = {};

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, callback: any) => {
    eventListeners[event] = callback;
    return Promise.resolve(() => {
      delete eventListeners[event];
    });
  }),
}));

const CONTEXT: EngineContext = {
  engine_id: "claude-code",
  engine_key: "claude_code",
  engine_name: "Engine K",
  applies: null,
  switches_by_name: false,
  items: [],
  on_count: 1,
  off_count: 0,
  measured_on_count: 1,
  on_tokens_measured: 13598,
};

const inventory: Inventory = {
  agents: [],
  skills: [
    {
      id: "skill-1",
      name: "Claude Math Skill",
      description: "Math Solver",
      version: "1.0.0",
      path: "/home/user/.claude/skills/math",
      scope: { Global: { agent: "claude-code" } },
    },
  ],
  tools: [],
  rules: [],
  subagents: [],
  project_scans: [],
} as unknown as Inventory;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === "get_preference") return mockPreferences[args?.key] ?? null;
    if (cmd === "set_preference") {
      if (args?.key) mockPreferences[args.key] = String(args.value);
      return null;
    }
    if (cmd === "get_linked_directories") return [];
    if (cmd === "get_asset_counts")
      return {
        total_assets: 1,
        skill: { total: 1, global: 1, project: 0 },
        tool: { total: 0, global: 0, project: 0 },
        rule: { total: 0, global: 0, project: 0 },
        subagent: { total: 0, global: 0, project: 0 },
        engines: {},
      };
    if (cmd === "get_asset_annotations") return [];
    if (cmd === "get_engine_contexts") return [CONTEXT];
    if (cmd === "get_mcp_servers" && holdMcpServers) return new Promise(() => {});
    if (cmd === "get_mcp_processes") return [];
    if (cmd === "read_asset_body")
      return {
        path: "/home/user/.claude/skills/math/SKILL.md",
        text: "# math",
        bytes: 7, lines: 1, estimated_tokens: 2,
        always_on_bytes: null, always_on_estimated_tokens: null, modified_ms: null,
      };
    if (cmd === "list_asset_dir") return [];
    if (cmd === "start_scan") {
      setTimeout(() => {
        eventListeners["scan://complete"]?.({ payload: { inventory } });
      }, 0);
      return "mock-scan-id";
    }
    return null;
  }),
}));

const SHOW = "Show overview  ⌘E";
const HIDE = "Hide overview  ⌘E";
const named = (label: string) => label.replace(/\s+/g, " ");
const dialog = () => screen.queryByRole("dialog", { name: "Overview" });
const docked = () => document.querySelector('[data-testid="overview-dock"]') as HTMLElement | null;
const cap = () => document.querySelector("main > header") as HTMLElement;

let capSlot: HTMLElement | null = null;
const paneProps = () => {
  capSlot = document.createElement("div");
  document.body.appendChild(capSlot);
  return {
    inventory,
    loading: false,
    onSelectAsset: vi.fn(),
    onLinkAsset: vi.fn(),
    engineContexts: [CONTEXT],
    overviewSlots: { cap: capSlot },
  };
};
const button = () => within(capSlot!).getByRole("button");
/** The box each lane is centred in: the list's, and the kind tabs'. */
const laneBoxes = () => [
  screen.getByTestId("list-lane").parentElement!,
  screen.getByRole("tablist").closest("section")!.parentElement!.parentElement!.parentElement!,
];
const ticks = () => screen.queryByRole("navigation", { name: "Jump to a group" });
/** Two groups, so the ticks have somewhere to jump. */
const twoGroups: Inventory = {
  ...inventory,
  rules: [
    {
      id: "rule-1",
      name: "house-style",
      description: "",
      version: "",
      path: "/home/user/.claude/rules/house-style.md",
      scope: { Global: { agent: "claude-code" } },
    },
  ],
} as unknown as Inventory;

beforeEach(() => {
  cleanup();
  eventListeners = {};
  holdMcpServers = false;
  mockPreferences = {
    onboarding_complete: "true",
    consent_crash: "true",
    consent_usage: "true",
    sidebar_collapsed: "false",
    selected_sidebar_item: "profile",
    inspector_open: "false",
  };
});
afterEach(() => {
  cleanup();
  capSlot?.remove();
  capSlot = null;
  vi.unstubAllGlobals();
});

describe("docked (room for the card, no inspector)", () => {
  it("draws the card in the pane, absolute at the top right, 280px wide, and no dialog", () => {
    render(<ProfilePane {...paneProps()} forceDock />);
    const dock = docked();
    expect(dock).not.toBeNull();
    expect(within(dock!).getByTestId("overview-card")).toBeTruthy();
    for (const c of ["absolute", "right-3", "top-3", "w-[280px]"]) expect(dock!.className.split(/\s+/)).toContain(c);
    expect(dialog()).toBeNull();
  });

  it("keeps the lane clear of the card: both lanes sit in a box that ends 324px from the pane's edge", () => {
    render(<ProfilePane {...paneProps()} forceDock />);
    for (const box of laneBoxes()) expect(box.className.split(/\s+/)).toContain("mr-[306px]");
  });

  it("shows the button pressed, labelled Hide overview  ⌘E, and a press asks App to hide the card", () => {
    const onToggleOverviewHidden = vi.fn();
    render(<ProfilePane {...paneProps()} forceDock onToggleOverviewHidden={onToggleOverviewHidden} />);
    expect(button().getAttribute("aria-label")).toBe(HIDE);
    expect(button().getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button());
    expect(onToggleOverviewHidden).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
  });

  it("⌘E hides and shows the docked card, rather than opening a popover", () => {
    const onToggleOverviewHidden = vi.fn();
    render(<ProfilePane {...paneProps()} forceDock onToggleOverviewHidden={onToggleOverviewHidden} />);
    fireEvent.keyDown(window, { key: "e", metaKey: true });
    expect(onToggleOverviewHidden).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
  });

  it("hidden, draws no card, gives the lane its centre back, and the button reads Show overview  ⌘E", () => {
    render(<ProfilePane {...paneProps()} forceDock overviewHidden />);
    expect(docked()).toBeNull();
    for (const box of laneBoxes()) expect(box.className).not.toContain("mr-[306px]");
    expect(button().getAttribute("aria-label")).toBe(SHOW);
    expect(button().getAttribute("aria-pressed")).toBe("false");
  });
});

/** The docked lane, from the Task 3 screenshots: the lane had lost its
 *  padding, the ticks sat on the row icons and "Skills" was clipped. Docked,
 *  the lane lives left of the card, in [0, cardLeft − 32]: 968 − 12 − 280 −
 *  32 = 644px at Karthik's 1,024px window. It is centred there with its
 *  usual 736px cap, and its padding follows the undocked rule on that
 *  area: 48px from 640px, 12px below, the ticks only with the 48px. Class
 *  contracts on a measured width; where it lands is a screenshot claim. */
describe("the docked lane keeps its margin", () => {
  it("docked at 968, the lane's box ends at 644 (968 − 324, less the list's 18px inset: mr-[306px]) and keeps px-12 and the ticks", () => {
    stubResizeObserver(968);
    render(<ProfilePane {...paneProps()} inventory={twoGroups} />);
    expect(docked()).not.toBeNull();
    for (const box of laneBoxes()) expect(box.className.split(/\s+/)).toContain("mr-[306px]");
    for (const lane of [screen.getByTestId("list-lane"), laneBoxes()[1].firstElementChild!.firstElementChild!]) {
      const classes = lane.className.split(/\s+/);
      expect(classes).toContain("mx-auto");
      expect(classes).toContain("max-w-[736px]");
      expect(classes).toContain("px-12");
      expect(lane.className).not.toMatch(/(^|\s)m[lr]-/);
    }
    expect(ticks()).not.toBeNull();
  });

  it("in a docked area under 640px (924 − 324 = 600), the lane takes px-3 and there are no ticks", () => {
    stubResizeObserver(924);
    render(<ProfilePane {...paneProps()} inventory={twoGroups} forceDock />);
    expect(docked()).not.toBeNull();
    const classes = screen.getByTestId("list-lane").className.split(/\s+/);
    expect(classes).toContain("px-3");
    expect(classes).not.toContain("px-12");
    expect(ticks()).toBeNull();
  });
});

describe("not docked (Review Focus 2: the inspector open at 1024)", () => {
  it("draws no card in the pane; the button opens it in a dialog", () => {
    render(<ProfilePane {...paneProps()} forceDock={false} />);
    expect(docked()).toBeNull();
    expect(dialog()).toBeNull();
    fireEvent.click(button());
    const d = dialog();
    expect(d).not.toBeNull();
    expect(within(d!).getByTestId("overview-card")).toBeTruthy();
    for (const box of laneBoxes()) expect(box.className).not.toContain("mr-[306px]");
  });

  it("ignores overview_hidden: hidden only hides a docked card", () => {
    render(<ProfilePane {...paneProps()} forceDock={false} overviewHidden />);
    fireEvent.click(button());
    expect(dialog()).not.toBeNull();
  });
});

describe("the window-bar button is shadcn's Toggle in Hanger's tokens", () => {
  it("is a 28px toggle with an 8px radius and a tint when on", () => {
    render(<ProfilePane {...paneProps()} forceDock />);
    const b = button();
    expect(b.getAttribute("data-slot")).toBe("toggle");
    for (const c of ["h-7", "w-7", "rounded-control", "data-pressed:bg-tint"]) expect(b.className.split(/\s+/)).toContain(c);
  });
});

describe("the pin is gone", () => {
  it("no Pin or Unpin control anywhere, docked or in the popover", async () => {
    render(<ProfilePane {...paneProps()} forceDock />);
    expect(screen.queryByRole("button", { name: /pin/i })).toBeNull();
    cleanup();
    render(<ProfilePane {...paneProps()} forceDock={false} />);
    fireEvent.click(button());
    expect(within(dialog()!).queryByRole("button", { name: /pin/i })).toBeNull();
  });

  it("App never reads or writes overview_pinned", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockClear();
    mockPreferences.overview_pinned = "true";
    render(<App />);
    await screen.findByText("Claude Math Skill");
    const keys = vi.mocked(invoke).mock.calls.map((c) => (c[1] as { key?: string } | undefined)?.key);
    expect(keys).not.toContain("overview_pinned");
    expect(screen.queryByTestId("overview-inspector-slot")).toBeNull();
  });
});

/** A ResizeObserver that reports `width` for whatever it observes, once,
 *  as a real one does on observe(). happy-dom's never fires. */
function stubResizeObserver(width: number) {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb;
      }
      observe(el: Element) {
        this.cb([{ target: el, contentRect: { width } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      unobserve() {}
      disconnect() {}
    }
  );
}

describe("in App: the dock is measured, and overview_hidden persists", () => {
  it("a wide window docks the card; the button hides it, persisted, and it stays hidden after a remount", async () => {
    stubResizeObserver(1400);
    const first = render(<App />);
    await screen.findByText("Claude Math Skill");
    await waitFor(() => expect(docked()).not.toBeNull());
    expect(dialog()).toBeNull();
    fireEvent.click(within(cap()).getByRole("button", { name: named(HIDE) }));
    await waitFor(() => expect(docked()).toBeNull());
    expect(mockPreferences.overview_hidden).toBe("true");
    first.unmount();
    render(<App />);
    await screen.findByText("Claude Math Skill");
    await waitFor(() => expect(within(cap()).getByRole("button", { name: named(SHOW) })).toBeTruthy());
    expect(docked()).toBeNull();
  });

  it("docked, the card holds the Engines head and one row per engine, without waiting on the scan's later reads", async () => {
    // The Task 3 screenshots: docked mid-scan, the card had only the store
    // and its actions. scan://complete read get_engine_contexts last, after
    // waiting on get_mcp_servers; that read is held open here, as a slow
    // read on a large machine holds it.
    holdMcpServers = true;
    stubResizeObserver(1400);
    render(<App />);
    await screen.findByText("Claude Math Skill");
    await waitFor(() => expect(docked()).not.toBeNull());
    const card = within(docked()!).getByTestId("overview-card");
    await waitFor(() => expect(within(card).getByText("Engines")).toBeTruthy());
    const rows = Array.from(card.querySelectorAll("[data-engine-name]")).map((r) => r.getAttribute("data-engine-name"));
    expect(rows).toEqual(["All engines", "Engine K"]);
  });

  it("a narrow window keeps it behind the button", async () => {
    // 1px under round 21's 884px (900 docks since then).
    stubResizeObserver(883);
    render(<App />);
    await screen.findByText("Claude Math Skill");
    const show = await waitFor(() => within(cap()).getByRole("button", { name: named(SHOW) }));
    expect(docked()).toBeNull();
    fireEvent.click(show);
    expect(dialog()).not.toBeNull();
  });
});

describe("the Esc rule still clears the selection on Global", () => {
  it("with an asset selected and nothing else open, Esc drops it", async () => {
    mockPreferences.inspector_open = "true";
    render(<App />);
    fireEvent.click(await screen.findByText("Claude Math Skill"));
    const inspecting = () => screen.queryByRole("tablist", { name: "Inspector view" }) !== null;
    await waitFor(() => expect(inspecting()).toBe(true));
    act(() => {
      fireEvent.keyDown(document.body, { key: "Escape" });
    });
    await waitFor(() => expect(inspecting()).toBe(false));
  });
});
