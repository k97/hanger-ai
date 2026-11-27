// @vitest-environment happy-dom
/** The overview card from the window bar (Task 5 of
 *  docs/plans/2026-11-26-overview-card.md, as amended: portals, not a lifted
 *  hook). App draws an empty slot in the content cap on Global; ProfilePane
 *  portals its button there and the card's popover to document.body, fed by
 *  the figures the strip already gets. ⌘E toggles it, Esc closes it, and
 *  ⌘E typed into a text field does nothing (Review Focus 3).
 *
 *  Since Task 2 of docs/plans/2026-11-26-global-list.md the card docks when
 *  the pane has room, and the popover is what it does when it has not. App
 *  takes no `forceDock`, so these run at a measured 883px pane, 1px too
 *  narrow to dock since round 21 (`notDocked()`): the not-docked case. The
 *  docked case is at the end. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act, within } from "@testing-library/react";
import App from "../App";
import { invoke } from "@tauri-apps/api/core";
import type { EngineContext } from "../types/engineContext";

vi.mock("@tauri-apps/plugin-log", () => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  attachConsole: vi.fn(() => Promise.resolve(() => {})),
}));

let mockPreferences: Record<string, string> = {};
let linkedDirectories: string[] = [];
let eventListeners: Record<string, Function> = {};

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, callback: any) => {
    eventListeners[event] = callback;
    return Promise.resolve(() => {
      delete eventListeners[event];
    });
  }),
}));

const contextOf = (engineId: string, engineName: string, tokens: number): EngineContext => ({
  engine_id: engineId,
  engine_key: engineId.replace(/-/g, "_"),
  engine_name: engineName,
  applies: null,
  switches_by_name: false,
  items: [],
  on_count: 1,
  off_count: 0,
  measured_on_count: 1,
  on_tokens_measured: tokens,
});

const CONTEXTS = [contextOf("codex", "Engine C", 9951), contextOf("claude-code", "Engine K", 13598)];

const INVENTORY = { agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [] };

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === "get_preference") return mockPreferences[args?.key] ?? null;
    if (cmd === "set_preference") {
      if (args?.key) mockPreferences[args.key] = String(args.value);
      return null;
    }
    if (cmd === "get_linked_directories") return linkedDirectories;
    if (cmd === "get_asset_counts") return { total: 0, byCategory: {}, engines: {} };
    if (cmd === "get_asset_annotations") return [];
    if (cmd === "get_engine_contexts") return CONTEXTS;
    if (cmd === "get_mcp_processes") return [];
    if (cmd === "start_scan") return "mock-scan-id";
    return null;
  }),
}));

const SHOW = "Show overview  ⌘E";
const HIDE = "Hide overview  ⌘E";
/** An accessible name collapses runs of whitespace (accname), so the
 *  approved double space before ⌘E is matched as one and the exact string is
 *  asserted on `aria-label` itself. */
const named = (label: string) => label.replace(/\s+/g, " ");

const completeScan = async () => {
  await waitFor(() => expect(eventListeners["scan://complete"]).toBeDefined());
  await act(async () => {
    await eventListeners["scan://complete"]({ payload: { inventory: INVENTORY } });
  });
};

/** The content cap: <main>'s own banner, not the inspector's or a pane's. */
const cap = () => document.querySelector("main > header") as HTMLElement;
const overviewButton = () => within(cap()).getByRole("button", { name: named(SHOW) });
const dialog = () => screen.queryByRole("dialog", { name: "Overview" });
const engineWrites = () =>
  vi
    .mocked(invoke)
    .mock.calls.filter((c) => c[0] === "set_preference" && (c[1] as { key: string }).key === "selected_engine")
    .map((c) => (c[1] as { value: string }).value);
const pressCmdE = (target: Element | Window = window) => fireEvent.keyDown(target, { key: "e", metaKey: true });

beforeEach(() => {
  cleanup();
  eventListeners = {};
  vi.mocked(invoke).mockClear();
  linkedDirectories = [];
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
  vi.unstubAllGlobals();
});

/** A ResizeObserver that reports `width` for whatever it observes, once,
 *  as a real one does on observe(). happy-dom's never fires. */
function stubPaneWidth(width: number) {
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
/** App's `forceDock={false}`: a pane too narrow to dock the card. */
const notDocked = () => stubPaneWidth(883);

describe("the overview button in the content cap", () => {
  it("is on Global, labelled Show overview  ⌘E", async () => {
    render(<App />);
    await completeScan();
    await waitFor(() => expect(overviewButton()).toBeTruthy());
    expect(overviewButton().getAttribute("aria-label")).toBe(SHOW);
    expect(overviewButton().getAttribute("aria-expanded")).toBe("false");
    expect(dialog()).toBeNull();
  });

  it("is absent on other screens, and leaves with Global", async () => {
    render(<App />);
    await completeScan();
    await waitFor(() => expect(overviewButton()).toBeTruthy());
    fireEvent.click(within(screen.getByTestId("icon-rail")).getByRole("button", { name: "Discovery" }));
    await waitFor(() => expect(within(cap()).queryByRole("button", { name: named(SHOW) })).toBeNull());
    expect(within(cap()).queryByRole("button", { name: named(HIDE) })).toBeNull();
    // ⌘E has nothing to open off Global.
    pressCmdE();
    expect(dialog()).toBeNull();
  });

  it("closes its card when Global is left", async () => {
    render(<App />);
    await completeScan();
    fireEvent.click(await waitFor(() => overviewButton()));
    expect(dialog()).not.toBeNull();
    fireEvent.click(within(screen.getByTestId("icon-rail")).getByRole("button", { name: "Discovery" }));
    await waitFor(() => expect(dialog()).toBeNull());
  });

  it("opens the card in a dialog and relabels itself Hide overview  ⌘E; pressed again, closes it", async () => {
    notDocked();
    render(<App />);
    await completeScan();
    fireEvent.click(await waitFor(() => overviewButton()));
    const card = dialog();
    expect(card).not.toBeNull();
    expect(within(card!).getByTestId("overview-card")).toBeTruthy();
    const hide = within(cap()).getByRole("button", { name: named(HIDE) });
    expect(hide.getAttribute("aria-label")).toBe(HIDE);
    expect(hide.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(hide);
    expect(dialog()).toBeNull();
    expect(overviewButton()).toBeTruthy();
  });
});

describe("on a repository", () => {
  const REPO_A = "/home/user/alpha";
  const REPO_B = "/home/user/beta";
  /** A repository's row in the source list, by its folder's name. */
  const sourceRow = (name: string) =>
    within(screen.getByTestId("sidebar")).getByText(name).closest("[tabindex]") as HTMLElement;

  it("is on a repository too, and its popover closes when the repository is left", async () => {
    notDocked();
    linkedDirectories = [REPO_A];
    mockPreferences.selected_sidebar_item = REPO_A;
    render(<App />);
    await completeScan();
    fireEvent.click(await waitFor(() => overviewButton()));
    expect(dialog()).not.toBeNull();
    fireEvent.click(within(screen.getByTestId("icon-rail")).getByRole("button", { name: "Discovery" }));
    await waitFor(() => expect(dialog()).toBeNull());
  });

  it("going from one repository to another closes the popover and opens the next on All", async () => {
    notDocked();
    linkedDirectories = [REPO_A, REPO_B];
    mockPreferences.selected_sidebar_item = REPO_A;
    render(<App />);
    await completeScan();
    const tab = (name: RegExp) => screen.getByRole("tab", { name });
    await waitFor(() => expect(tab(/^Skills/)).toBeTruthy());
    fireEvent.click(tab(/^Skills/));
    await waitFor(() => expect(tab(/^Skills/).getAttribute("aria-selected")).toBe("true"));
    fireEvent.click(await waitFor(() => overviewButton()));
    expect(dialog()).not.toBeNull();
    fireEvent.click(await waitFor(() => sourceRow("beta")));
    await waitFor(() => expect(mockPreferences.selected_sidebar_item).toBe(REPO_B));
    await waitFor(() => expect(dialog()).toBeNull());
    expect(tab(/^All/).getAttribute("aria-selected")).toBe("true");
  });
});

describe("⌘E and Esc", () => {
  it("⌘E toggles the card, and Esc closes it", async () => {
    notDocked();
    render(<App />);
    await completeScan();
    await waitFor(() => expect(overviewButton()).toBeTruthy());
    pressCmdE();
    expect(dialog()).not.toBeNull();
    pressCmdE();
    expect(dialog()).toBeNull();
    pressCmdE();
    expect(dialog()).not.toBeNull();
    // A real Esc targets the focused element or the body, never the window.
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(dialog()).toBeNull();
  });

  it("⌘E typed into a text field does nothing (Review Focus 3)", async () => {
    render(<App />);
    await completeScan();
    await waitFor(() => expect(overviewButton()).toBeTruthy());
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    pressCmdE(input);
    expect(dialog()).toBeNull();
    const area = document.createElement("textarea");
    document.body.appendChild(area);
    pressCmdE(area);
    expect(dialog()).toBeNull();
    input.remove();
    area.remove();
  });
});

describe("the card in the popover", () => {
  it("picking an engine changes the engine, persisted as selected_engine, and keeps the card open", async () => {
    notDocked();
    render(<App />);
    await completeScan();
    fireEvent.click(await waitFor(() => overviewButton()));
    const card = dialog()!;
    await waitFor(() => expect(card.querySelector('[data-engine-name="Engine C"]')).not.toBeNull());
    fireEvent.pointerDown(card.querySelector('[data-engine-name="Engine C"]')!);
    fireEvent.click(card.querySelector('[data-engine-name="Engine C"]')!);
    await waitFor(() => expect(engineWrites()).toEqual(["codex"]));
    const open = dialog();
    expect(open).not.toBeNull();
    expect(open!.querySelector('[data-engine-name="Engine C"]')!.getAttribute("aria-current")).toBe("true");
  });
});

describe("docked (a pane wide enough, no inspector)", () => {
  it("draws the card in the pane, not a dialog; the button reads Hide overview  ⌘E and hides it, and ⌘E shows it again", async () => {
    stubPaneWidth(1400);
    render(<App />);
    await completeScan();
    const docked = () => document.querySelector('[data-testid="overview-dock"]');
    await waitFor(() => expect(docked()).not.toBeNull());
    expect(dialog()).toBeNull();
    const hide = within(cap()).getByRole("button", { name: named(HIDE) });
    expect(hide.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(hide);
    await waitFor(() => expect(docked()).toBeNull());
    expect(dialog()).toBeNull();
    expect(overviewButton().getAttribute("aria-pressed")).toBe("false");
    pressCmdE();
    await waitFor(() => expect(docked()).not.toBeNull());
    expect(dialog()).toBeNull();
  });
});
