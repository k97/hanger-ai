// @vitest-environment happy-dom
/** The overview card pinned into the inspector, and Esc bringing it back
 *  (Task 6 of docs/plans/2026-11-26-overview-card.md, on the amendment's
 *  slot design). Pinned on Global with nothing selected, the inspector's
 *  empty state is the card. Esc on Global clears the inspector's selection
 *  so the card returns (round 14 q4), unless something open took the Esc
 *  first: a menu, a popover, the search palette (Review Focus 4). */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import App from "../App";
import type { EngineContext } from "../types/engineContext";

vi.mock("@tauri-apps/plugin-log", () => ({
  warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), trace: vi.fn(),
  attachConsole: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(), openPath: vi.fn(), revealItemInDir: vi.fn() }));

let mockPreferences: Record<string, string> = {};
let eventListeners: Record<string, Function> = {};

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, callback: any) => {
    eventListeners[event] = callback;
    return Promise.resolve(() => { delete eventListeners[event]; });
  }),
}));

const REPO = "/home/user/work";

const inventory = {
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
    {
      id: "skill-2",
      name: "Work Repo Skill",
      description: "",
      version: "1.0.0",
      path: `${REPO}/.claude/skills/repo`,
      scope: { Project: { agent: "claude-code", root: REPO } },
    },
  ],
  tools: [
    {
      id: "/home/user/.claude/tools.json:node-runner",
      name: "Node Runner Tool",
      command: "node",
      launch_display: "node runner.js",
      transport: "stdio",
      config_path: "/home/user/.claude/tools.json",
      scope: { Global: { agent: "claude-code" } },
      owning_agent: "claude-code",
      drifted: false,
    },
  ],
  rules: [],
  subagents: [],
  project_scans: [],
};

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

/** One process nothing on disk accounts for: the card's Needs review line. */
const STRAY_PROCESS = { registration_keys: [], pid: 24149, command_line: "node dist/index.js --port 3002" };

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === "get_preference") return mockPreferences[args?.key] ?? null;
    if (cmd === "set_preference") {
      if (args?.key) mockPreferences[args.key] = String(args.value);
      return null;
    }
    if (cmd === "get_linked_directories") return [REPO];
    if (cmd === "get_asset_counts")
      return {
        total_assets: 2,
        skill: { total: 2, global: 1, project: 1 },
        tool: { total: 1, global: 1, project: 0 },
        rule: { total: 0, global: 0, project: 0 },
        subagent: { total: 0, global: 0, project: 0 },
        engines: {},
      };
    if (cmd === "get_asset_annotations") return [];
    if (cmd === "get_engine_contexts") return [CONTEXT];
    if (cmd === "get_detected_engines" || cmd === "get_known_engines") return [{ id: "claude-code", name: "Claude Code" }];
    if (cmd === "get_mcp_processes") return [STRAY_PROCESS];
    if (cmd === "mcp_cached_probe") return { result: null, verifiedAt: null, fromCache: false, declined: false };
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

const named = (label: string) => label.replace(/\s+/g, " ");
const SHOW = named("Show overview  ⌘E");
const cap = () => document.querySelector("main > header") as HTMLElement;
const aside = () => document.querySelector("aside") as HTMLElement | null;
const pinnedCard = () => aside()?.querySelector('[data-testid="overview-card"]') ?? null;
const popover = () => screen.queryByRole("dialog", { name: "Overview" });
/** The inspector renders a tab row only while it has a subject. */
const inspecting = () => screen.queryByRole("tablist", { name: "Inspector view" }) !== null;
const table = () => within(document.querySelector("main")!);
/** A real Esc targets the focused element, or the body: never the window. */
const pressEsc = (target: Element = document.activeElement ?? document.body) =>
  fireEvent.keyDown(target, { key: "Escape" });

beforeEach(() => {
  cleanup();
  eventListeners = {};
  mockPreferences = {
    onboarding_complete: "true",
    consent_crash: "true",
    consent_usage: "true",
    sidebar_collapsed: "false",
    selected_sidebar_item: "profile",
    inspector_open: "true",
  };
});
afterEach(cleanup);

describe("pinned in the inspector", () => {
  it("on Global with nothing selected, the inspector shows the card, not Nothing selected", async () => {
    mockPreferences.overview_pinned = "true";
    render(<App />);
    await screen.findByText("Claude Math Skill");
    await waitFor(() => expect(pinnedCard()).not.toBeNull());
    expect(within(aside()!).queryByText("Nothing selected")).toBeNull();
    // Pinned, the window bar carries no button and opens no popover.
    expect(within(cap()).queryByRole("button", { name: SHOW })).toBeNull();
    expect(popover()).toBeNull();
  });

  it("selecting an asset shows its details; Esc clears the selection and the card returns", async () => {
    mockPreferences.overview_pinned = "true";
    render(<App />);
    fireEvent.click(await screen.findByText("Claude Math Skill"));
    await waitFor(() => expect(inspecting()).toBe(true));
    expect(pinnedCard()).toBeNull();
    pressEsc(document.body);
    await waitFor(() => expect(inspecting()).toBe(false));
    expect(pinnedCard()).not.toBeNull();
  });

  it("pinning from the popover opens a closed inspector, persists overview_pinned, and survives a remount", async () => {
    mockPreferences.inspector_open = "false";
    const first = render(<App />);
    await screen.findByText("Claude Math Skill");
    fireEvent.click(await waitFor(() => within(cap()).getByRole("button", { name: SHOW })));
    fireEvent.click(within(popover()!).getByRole("button", { name: "Pin to the inspector" }));
    await waitFor(() => expect(pinnedCard()).not.toBeNull());
    expect(popover()).toBeNull();
    expect(mockPreferences.overview_pinned).toBe("true");
    expect(mockPreferences.inspector_open).toBe("true");

    first.unmount();
    render(<App />);
    await screen.findByText("Claude Math Skill");
    await waitFor(() => expect(pinnedCard()).not.toBeNull());
  });

  it("unpinning from the card returns it to the window bar and the inspector to Nothing selected", async () => {
    mockPreferences.overview_pinned = "true";
    render(<App />);
    await screen.findByText("Claude Math Skill");
    await waitFor(() => expect(pinnedCard()).not.toBeNull());
    fireEvent.click(within(pinnedCard() as HTMLElement).getByRole("button", { name: "Unpin from the inspector" }));
    await waitFor(() => expect(pinnedCard()).toBeNull());
    expect(mockPreferences.overview_pinned).toBe("false");
    expect(within(aside()!).getByText("Nothing selected")).toBeTruthy();
    expect(within(cap()).getByRole("button", { name: SHOW })).toBeTruthy();
  });
});

describe("Esc leaves the selection alone when something else takes it (Review Focus 4)", () => {
  it("with the inspector's More actions menu open, Esc closes the menu and keeps the asset", async () => {
    mockPreferences.overview_pinned = "true";
    render(<App />);
    fireEvent.click(await screen.findByText("Claude Math Skill"));
    await waitFor(() => expect(inspecting()).toBe(true));
    const more = within(aside()!).getByRole("button", { name: "More actions" });
    fireEvent.click(more);
    await waitFor(() => expect(screen.getByRole("menu")).toBeTruthy());
    pressEsc(more);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(inspecting()).toBe(true);
    expect(pinnedCard()).toBeNull();
  });

  it("with the search palette open, Esc closes the palette and keeps the asset", async () => {
    mockPreferences.overview_pinned = "true";
    render(<App />);
    fireEvent.click(await screen.findByText("Claude Math Skill"));
    await waitFor(() => expect(inspecting()).toBe(true));
    fireEvent.keyDown(document.body, { key: "k", metaKey: true });
    const field = await screen.findByRole("combobox");
    pressEsc(field);
    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull());
    expect(inspecting()).toBe(true);
  });

  it("Esc inside the card's Needs review popover closes that popover and leaves the card open", async () => {
    mockPreferences.selected_sidebar_item = "global:Tools";
    render(<App />);
    await screen.findByText("Node Runner Tool");
    fireEvent.click(await waitFor(() => within(cap()).getByRole("button", { name: SHOW })));
    const card = popover()!;
    const needsReview = await waitFor(() => within(card).getByRole("button", { name: /Needs review/ }));
    fireEvent.click(needsReview);
    await waitFor(() => expect(within(card).getByRole("dialog", { name: /^Needs review/ })).toBeTruthy());
    pressEsc(needsReview);
    expect(within(card).queryByRole("dialog", { name: /^Needs review/ })).toBeNull();
    expect(popover()).not.toBeNull();
    // A second Esc, with nothing inside open, closes the card itself.
    pressEsc(document.body);
    expect(popover()).toBeNull();
  });

  it("Esc that closes the unpinned popover does not also clear the asset under it", async () => {
    render(<App />);
    fireEvent.click(await screen.findByText("Claude Math Skill"));
    await waitFor(() => expect(inspecting()).toBe(true));
    fireEvent.click(within(cap()).getByRole("button", { name: SHOW }));
    expect(popover()).not.toBeNull();
    pressEsc(document.body);
    expect(popover()).toBeNull();
    expect(inspecting()).toBe(true);
  });
});

describe("Esc is Global's alone (round 14 q4)", () => {
  it("on a repository screen, Esc leaves the selection alone", async () => {
    mockPreferences.selected_sidebar_item = REPO;
    render(<App />);
    fireEvent.click(await waitFor(() => table().getByText("Work Repo Skill")));
    await waitFor(() => expect(inspecting()).toBe(true));
    pressEsc(document.body);
    // Give any listener a chance to act before asserting it did not.
    await new Promise((r) => setTimeout(r, 0));
    expect(inspecting()).toBe(true);
  });
});
