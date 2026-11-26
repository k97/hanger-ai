// @vitest-environment happy-dom
/** Task 7 of docs/plans/2026-11-26-overview-card.md: the overview card
 *  replaces Global's engine chips and inventory summary. The card holds the
 *  engines, the store's link state, Needs review and Rescan, so Global draws
 *  no chip row and no strip. A repository keeps its summary strip. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, act, within } from "@testing-library/react";
import App from "../App";
import type { EngineContext } from "../types/engineContext";

vi.mock("@tauri-apps/plugin-log", () => ({
  warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), trace: vi.fn(),
  attachConsole: vi.fn(() => Promise.resolve(() => {})),
}));

let mockPreferences: Record<string, string> = {};
let eventListeners: Record<string, Function> = {};

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, callback: any) => {
    eventListeners[event] = callback;
    return Promise.resolve(() => { delete eventListeners[event]; });
  }),
}));

const REPO = "/home/user/work";

const INVENTORY = {
  agents: [],
  skills: [
    { id: "g", name: "Global Skill", description: "", version: "1", path: "/home/user/.claude/skills/g", scope: { Global: { agent: "claude-code" } } },
    { id: "r", name: "Repo Skill", description: "", version: "1", path: `${REPO}/.claude/skills/r`, scope: { Project: { agent: "claude-code", root: REPO } } },
  ],
  tools: [],
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
        tool: { total: 0, global: 0, project: 0 },
        rule: { total: 0, global: 0, project: 0 },
        subagent: { total: 0, global: 0, project: 0 },
        engines: {},
      };
    if (cmd === "get_asset_annotations") return [];
    if (cmd === "get_engine_contexts") return [CONTEXT];
    if (cmd === "get_mcp_processes") return [];
    if (cmd === "start_scan") return "mock-scan-id";
    return null;
  }),
}));

const completeScan = async () => {
  await waitFor(() => expect(eventListeners["scan://complete"]).toBeDefined());
  await act(async () => {
    await eventListeners["scan://complete"]({ payload: { inventory: INVENTORY } });
  });
};

const cap = () => document.querySelector("main > header") as HTMLElement;

beforeEach(() => {
  cleanup();
  eventListeners = {};
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

describe("the overview card replaces the chips and the summary", () => {
  it("Global has no engine chips and no inventory summary", async () => {
    render(<App />);
    await completeScan();
    // Global is up and scanned: its list and the card's button are there.
    await screen.findByText("Global Skill");
    await waitFor(() => expect(within(cap()).getByRole("button", { name: "Show overview ⌘E" })).toBeTruthy());
    expect(screen.queryByTestId("engine-chip-row")).toBeNull();
    expect(document.querySelector('section[aria-label="Inventory summary"]')).toBeNull();
  });

  it("a repository still has its summary", async () => {
    mockPreferences.selected_sidebar_item = REPO;
    render(<App />);
    await completeScan();
    await waitFor(() => expect(document.querySelector('section[aria-label="Inventory summary"]')).not.toBeNull());
    expect(within(cap()).queryByRole("button", { name: "Show overview ⌘E" })).toBeNull();
  });
});
