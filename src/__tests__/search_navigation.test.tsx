// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import App from "../App";

vi.mock("@tauri-apps/plugin-log", () => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  attachConsole: vi.fn(() => Promise.resolve(() => {})),
}));

// Mock preferences store
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

// Mutable so individual tests can seed non-zero counts. Raw backend shape
// (`total_assets`, `skill`/`tool`/`rule`/`subagent` each `{ total, global,
// project }`, `engines`) — App.tsx's `fetchRepoCounts`/`refreshGlobalCounts`
// read these fields directly off whatever `get_asset_counts` returns before
// reshaping into `CategoryCounts`; ProfilePane's `storeEmpty` in turn reads
// the `.global` half of each category via `sumGlobalAssets`, so a fixture
// carrying only `.total` renders "No engine folders on this machine yet"
// over real rows regardless of what `inventory` holds.
const zeroCat = () => ({ total: 0, global: 0, project: 0 });
let mockAssetCounts: any = {
  total_assets: 0,
  skill: zeroCat(),
  tool: zeroCat(),
  rule: zeroCat(),
  subagent: zeroCat(),
  engines: {},
};

let searchAnswer: { hits: any[]; total: number } = { hits: [], total: 0 };

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, callback: any) => {
    eventListeners[event] = callback;
    return Promise.resolve(() => {
      delete eventListeners[event];
    });
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === "get_preference") {
      return mockPreferences[args?.key] ?? null;
    }
    if (cmd === "set_preference") {
      if (args?.key) {
        mockPreferences[args.key] = String(args.value);
      }
      return null;
    }
    if (cmd === "get_linked_directories") return ["/Users/test/project-alpha"];
    if (cmd === "get_asset_counts") {
      return mockAssetCounts;
    }
    if (cmd === "get_inventory") {
      return { agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [] };
    }
    if (cmd === "search_assets") return searchAnswer;
    if (cmd === "start_scan") {
      setTimeout(() => {
        if (eventListeners["scan://complete"]) {
          eventListeners["scan://complete"]({ payload: { inventory: { agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [] } } });
        }
      }, 0);
      return "mock-scan-id-123";
    }
    return null;
  }),
}));

const inventory = {
  agents: [],
  tools: [
    {
      id: "/home/u/.claude.json:spades",
      name: "spades",
      command: "npx",
      transport: "stdio",
      config_path: "/home/u/.claude.json",
      scope: { Global: { agent: "claude" } },
      owning_agent: "claude",
    },
  ],
  rules: [],
  subagents: [],
  project_scans: [],
  skills: [
    {
      id: "/Users/u/Work/proj/.claude/skills/deploy-helper",
      name: "deploy-helper",
      description: "",
      version: "1",
      path: "/Users/u/Work/proj/.claude/skills/deploy-helper",
      scope: { Project: { agent: "claude", root: "/Users/u/Work/proj" } },
    },
    // A second row in the same project — needed to exercise a plain click
    // that moves the selection between two rows (search hits alone never
    // give AssetRow a false->true transition to move a click's origin onto).
    {
      id: "/Users/u/Work/proj/.claude/skills/cleanup-helper",
      name: "cleanup-helper",
      description: "",
      version: "1",
      path: "/Users/u/Work/proj/.claude/skills/cleanup-helper",
      scope: { Project: { agent: "claude", root: "/Users/u/Work/proj" } },
    },
  ],
};

describe("picking a search hit", () => {
  let scrollIntoViewSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    cleanup();
    eventListeners = {};
    mockPreferences.selected_sidebar_item = "profile";
    mockPreferences.inspector_open = "false";
    mockAssetCounts = {
      total_assets: 0,
      skill: zeroCat(),
      tool: zeroCat(),
      rule: zeroCat(),
      subagent: zeroCat(),
      engines: {},
    };
    scrollIntoViewSpy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    scrollIntoViewSpy.mockRestore();
  });

  it("switches to the hit's project and opens it in the inspector", async () => {
    searchAnswer = {
      hits: [{
        kind: "skill", id: inventory.skills[0].path, path: inventory.skills[0].path, name: "deploy-helper",
        server: null, place: "/Users/u/Work/proj", snippet: "deploy", rank: -1,
      }],
      total: 1,
    };
    // RepoPane's own empty state reads `assetCounts.total`, not the
    // inventory it is about to be handed (`fetchRepoCounts` in App.tsx) —
    // seeded before scan://complete fires, since `refreshGlobalCounts` reads
    // `mockAssetCounts` synchronously inside that one handler and is never
    // refetched afterward for a plain sidebar switch. Without this the pane
    // would show "Nothing in proj yet" over a real row.
    mockAssetCounts = {
      total_assets: 2,
      skill: { total: 2, global: 0, project: 2 },
      tool: zeroCat(),
      rule: zeroCat(),
      subagent: zeroCat(),
      engines: {},
    };
    const { unmount } = render(<App />);
    await screen.findByTestId("icon-rail");
    eventListeners["scan://complete"]({ payload: { inventory } });

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    fireEvent.change(await screen.findByLabelText("Search assets"), { target: { value: "deploy" } });
    fireEvent.click(await screen.findByText("deploy-helper", { selector: "[cmdk-item] *" }));

    await waitFor(() => expect(mockPreferences.selected_sidebar_item).toBe("/Users/u/Work/proj"));
    expect(mockPreferences.inspector_open).toBe("true");
    expect(screen.queryByRole("dialog", { name: "Search" })).toBeNull();
    // The inspector names the asset it opened on.
    expect(await screen.findByTestId("inspector-header")).toBeTruthy();
    // The picked row is selected and centred, not merely scrolled to the
    // nearest edge (Karthik's ruling, 2026-08-29: a palette pick centres its
    // row; a plain click keeps `nearest`, see below).
    // The spy is global (`Element.prototype`) and other chrome — the
    // category segmented control — also calls `scrollIntoView` with its own
    // options, so the row's own call is found by instance, not by asserting
    // on the spy as a whole.
    const selectedRow = document.querySelector('[data-selected="true"]');
    expect(selectedRow).not.toBeNull();
    expect(selectedRow?.textContent).toContain("deploy-helper");
    const rowCallIndex = scrollIntoViewSpy.mock.instances.indexOf(selectedRow as any);
    expect(rowCallIndex).toBeGreaterThan(-1);
    expect(scrollIntoViewSpy.mock.calls[rowCallIndex]).toEqual([{ block: "center" }]);
    // ...and it lands on the asset's primary tab (Content), not whatever the
    // inspector happened to remember.
    const aside = document.querySelector("aside") as HTMLElement;
    expect(within(aside).getByRole("tab", { name: "Content" }).getAttribute("aria-selected")).toBe("true");
    unmount();
  });

  it("a pick made while Details was open on another asset lands back on Content", async () => {
    searchAnswer = {
      hits: [{
        kind: "skill", id: inventory.skills[0].path, path: inventory.skills[0].path, name: "deploy-helper",
        server: null, place: "/Users/u/Work/proj", snippet: "deploy", rank: -1,
      }],
      total: 1,
    };
    mockAssetCounts = {
      total_assets: 2,
      skill: { total: 2, global: 0, project: 2 },
      tool: zeroCat(),
      rule: zeroCat(),
      subagent: zeroCat(),
      engines: {},
    };
    const { unmount } = render(<App />);
    await screen.findByTestId("icon-rail");
    eventListeners["scan://complete"]({ payload: { inventory } });

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    fireEvent.change(await screen.findByLabelText("Search assets"), { target: { value: "deploy" } });
    fireEvent.click(await screen.findByText("deploy-helper", { selector: "[cmdk-item] *" }));
    await waitFor(() => expect(mockPreferences.selected_sidebar_item).toBe("/Users/u/Work/proj"));

    const aside = document.querySelector("aside") as HTMLElement;
    fireEvent.click(within(aside).getByRole("tab", { name: "Details" }));
    expect(within(aside).getByRole("tab", { name: "Details" }).getAttribute("aria-selected")).toBe("true");

    // A second, different hit — the defect this ruling fixes is the
    // inspector staying on Details because it remembers the last tab, even
    // though the screen never changed.
    searchAnswer = {
      hits: [{
        kind: "skill", id: inventory.skills[1].path, path: inventory.skills[1].path, name: "cleanup-helper",
        server: null, place: "/Users/u/Work/proj", snippet: "cleanup", rank: -1,
      }],
      total: 1,
    };
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    fireEvent.change(await screen.findByLabelText("Search assets"), { target: { value: "cleanup" } });
    fireEvent.click(await screen.findByText("cleanup-helper", { selector: "[cmdk-item] *" }));

    await waitFor(() =>
      expect(within(aside).getByRole("tab", { name: "Content" }).getAttribute("aria-selected")).toBe("true")
    );
    unmount();
  });

  it("a plain click after a palette pick keeps the row's nearest scroll", async () => {
    searchAnswer = {
      hits: [{
        kind: "skill", id: inventory.skills[0].path, path: inventory.skills[0].path, name: "deploy-helper",
        server: null, place: "/Users/u/Work/proj", snippet: "deploy", rank: -1,
      }],
      total: 1,
    };
    mockAssetCounts = {
      total_assets: 2,
      skill: { total: 2, global: 0, project: 2 },
      tool: zeroCat(),
      rule: zeroCat(),
      subagent: zeroCat(),
      engines: {},
    };
    const { unmount } = render(<App />);
    await screen.findByTestId("icon-rail");
    eventListeners["scan://complete"]({ payload: { inventory } });

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    fireEvent.change(await screen.findByLabelText("Search assets"), { target: { value: "deploy" } });
    fireEvent.click(await screen.findByText("deploy-helper", { selector: "[cmdk-item] *" }));
    await waitFor(() => expect(mockPreferences.selected_sidebar_item).toBe("/Users/u/Work/proj"));

    // A plain click on the OTHER row in the same list — a real
    // unselected->selected transition driven by a row click, not a palette
    // pick, so it must use `nearest`.
    scrollIntoViewSpy.mockClear();
    fireEvent.click(screen.getByText("cleanup-helper"));

    const selectedRow = document.querySelector('[data-selected="true"]');
    expect(selectedRow).not.toBeNull();
    expect(selectedRow?.textContent).toContain("cleanup-helper");
    const rowCallIndex = scrollIntoViewSpy.mock.instances.indexOf(selectedRow as any);
    expect(rowCallIndex).toBeGreaterThan(-1);
    expect(scrollIntoViewSpy.mock.calls[rowCallIndex]).toEqual([{ block: "nearest" }]);
    unmount();
  });

  it("re-picking the same asset lands on Content both times", async () => {
    // This is the case landingNonce exists for: re-selecting the very same
    // asset a second time is not a selectedAsset change at all (same path,
    // same object shape), so a reset keyed on the asset itself would miss
    // it. The nonce ticks on every pick regardless.
    searchAnswer = {
      hits: [{
        kind: "skill", id: inventory.skills[0].path, path: inventory.skills[0].path, name: "deploy-helper",
        server: null, place: "/Users/u/Work/proj", snippet: "deploy", rank: -1,
      }],
      total: 1,
    };
    mockAssetCounts = {
      total_assets: 2,
      skill: { total: 2, global: 0, project: 2 },
      tool: zeroCat(),
      rule: zeroCat(),
      subagent: zeroCat(),
      engines: {},
    };
    const { unmount } = render(<App />);
    await screen.findByTestId("icon-rail");
    eventListeners["scan://complete"]({ payload: { inventory } });

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    fireEvent.change(await screen.findByLabelText("Search assets"), { target: { value: "deploy" } });
    fireEvent.click(await screen.findByText("deploy-helper", { selector: "[cmdk-item] *" }));
    await waitFor(() => expect(mockPreferences.selected_sidebar_item).toBe("/Users/u/Work/proj"));

    const aside = document.querySelector("aside") as HTMLElement;
    expect(within(aside).getByRole("tab", { name: "Content" }).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(within(aside).getByRole("tab", { name: "Details" }));
    expect(within(aside).getByRole("tab", { name: "Details" }).getAttribute("aria-selected")).toBe("true");

    // Same hit, picked again.
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    fireEvent.change(await screen.findByLabelText("Search assets"), { target: { value: "deploy" } });
    fireEvent.click(await screen.findByText("deploy-helper", { selector: "[cmdk-item] *" }));

    await waitFor(() =>
      expect(within(aside).getByRole("tab", { name: "Content" }).getAttribute("aria-selected")).toBe("true")
    );
    unmount();
  });

  it("a tool hit opens its server on Global", async () => {
    mockPreferences.selected_sidebar_item = "/Users/u/Work/proj";
    searchAnswer = {
      hits: [{
        kind: "mcp_tool", id: "/home/u/.claude.json:spades", path: "/home/u/.claude.json", name: "set_volume",
        server: "spades", place: "global", snippet: "loudness", rank: -1,
      }],
      total: 1,
    };
    // Same reason as the skill-hit case above: ProfilePane's `storeEmpty`
    // reads `sumGlobalAssets`, which sums each category's `.global` count —
    // seeded here, before scan://complete fires (see the comment there), or
    // the pane shows "No engine folders" over a real row.
    mockAssetCounts = {
      total_assets: 1,
      skill: zeroCat(),
      tool: { total: 1, global: 1, project: 0 },
      rule: zeroCat(),
      subagent: zeroCat(),
      engines: {},
    };
    const { unmount } = render(<App />);
    await screen.findByTestId("icon-rail");
    eventListeners["scan://complete"]({ payload: { inventory } });

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    fireEvent.change(await screen.findByLabelText("Search assets"), { target: { value: "loud" } });
    fireEvent.click(await screen.findByText("set_volume"));

    await waitFor(() => expect(mockPreferences.selected_sidebar_item).toBe("profile"));
    expect(mockPreferences.inspector_open).toBe("true");
    // The tool hit opens its server's row — that row is selected and
    // centred, not merely scrolled to the nearest edge. See the comment on
    // the skill-hit case above for why the row's call is found by instance.
    const selectedRow = document.querySelector('[data-selected="true"]');
    expect(selectedRow).not.toBeNull();
    expect(selectedRow?.textContent).toContain("spades");
    const rowCallIndex = scrollIntoViewSpy.mock.instances.indexOf(selectedRow as any);
    expect(rowCallIndex).toBeGreaterThan(-1);
    expect(scrollIntoViewSpy.mock.calls[rowCallIndex]).toEqual([{ block: "center" }]);
    // An MCP server's primary tab is Tools, not Content — the ruling still
    // applies: it opens on the primary tab regardless of which one that is.
    const aside = document.querySelector("aside") as HTMLElement;
    expect(within(aside).getByRole("tab", { name: "Tools" }).getAttribute("aria-selected")).toBe("true");
    unmount();
  });
});
