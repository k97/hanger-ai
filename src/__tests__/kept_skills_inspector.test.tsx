// @vitest-environment happy-dom
/** App's share of the skill switch (docs/plans/2026-11-26-skill-switch.md,
 *  Task 9): it reads the kept skills after every scan and after every skill
 *  switch, a "Switched off" row under Skills opens the kept skill's panel,
 *  switching from the inspector header opens the kept panel in the skill's
 *  place, and every switch asks for the rescan — the one that rebuilds ⌘K's
 *  search index, so a skill switched off stops turning up there. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act, within } from "@testing-library/react";
import App from "../App";
import { invoke } from "@tauri-apps/api/core";
import type { KeptSkills, SkillSwitchReply } from "../types/skillSwitch";

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

const KEY = "kept-skill:00000000-0000-4000-8000-000000000001";
const KEPT: KeptSkills = {
  skills: [{ key: KEY, name: "figma", at_ms: 1795566217263, links_count: 1, interrupted: false, back_in_store: false }],
  count: 1,
};
const NONE: KeptSkills = { skills: [], count: 0 };
const STORE_PATH = "/Users/test/.agents/skills/figma";

const INVENTORY = {
  agents: [],
  skills: [
    {
      id: STORE_PATH,
      name: "figma",
      description: "Draws",
      version: "",
      path: STORE_PATH,
      scope: { Global: { agent: "claude-code" } },
    },
  ],
  tools: [],
  rules: [],
  subagents: [],
  project_scans: [],
};
const EMPTY = { ...INVENTORY, skills: [] };

/** What `get_kept_skills` answers now; a switch moves the skill in or out. */
let keptReply: KeptSkills;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === "get_preference") return mockPreferences[args?.key] ?? null;
    if (cmd === "set_preference") {
      if (args?.key) mockPreferences[args.key] = String(args.value);
      return null;
    }
    if (cmd === "get_linked_directories") return [];
    // `get_asset_counts`' own shape (`domain::AssetCounts`), which App maps.
    if (cmd === "get_asset_counts") return { total_assets: 1, skill: { total: 1, global: 1, project: 0 }, engines: {} };
    if (cmd === "get_kept_off_servers") return { servers: [], count: 0, only_kept_count: 0 };
    if (cmd === "get_kept_skills") return keptReply;
    if (cmd === "get_engine_contexts") return [];
    if (cmd === "get_mcp_processes") return [];
    if (cmd === "get_skill_switch") return args?.skillPath === STORE_PATH ? { key: "skill:figma", read_only: null } : null;
    if (cmd === "set_skill_enabled") {
      keptReply = args.enabled ? NONE : KEPT;
      const reply: SkillSwitchReply = {
        name: "figma",
        receipt_id: args.enabled ? "restored:figma" : "kept:00000000-0000-4000-8000-000000000001",
        undoable: true,
        links_count: 1,
        links_not_restored: [],
        kept: keptReply,
      };
      return reply;
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
const commands = () => vi.mocked(invoke).mock.calls.map((c) => c[0]);

const completeScan = async (inventory: unknown) => {
  await waitFor(() => expect(eventListeners["scan://complete"]).toBeDefined());
  await act(async () => {
    await eventListeners["scan://complete"]({ payload: { inventory } });
  });
};

const aside = () =>
  waitFor(() => {
    const el = document.querySelector("aside");
    expect(el).not.toBeNull();
    return el as HTMLElement;
  });

beforeEach(() => {
  cleanup();
  eventListeners = {};
  vi.mocked(invoke).mockClear();
  mockPreferences = {
    onboarding_complete: "true",
    consent_crash: "true",
    consent_usage: "true",
    sidebar_collapsed: "false",
    selected_sidebar_item: "global:Skills",
    inspector_open: "false",
  };
});
afterEach(cleanup);

describe("App — the skill switch", () => {
  it("reads the kept skills after a scan completes", async () => {
    keptReply = KEPT;
    render(<App />);
    await completeScan(EMPTY);
    await waitFor(() => expect(commands()).toContain("get_kept_skills"));
    const group = await screen.findByTestId("kept-skills-group");
    expect(within(group).getByRole("heading").textContent).toBe("Switched off · 1");
  });

  it("a Switched off row opens the kept skill; its switch puts it back, rescans and reads the kept skills again", async () => {
    keptReply = KEPT;
    render(<App />);
    await completeScan(EMPTY);
    const row = (await screen.findByText("Off for every engine")).closest("button") as HTMLElement;
    fireEvent.click(row);
    const panel = await aside();
    expect(await within(panel).findByRole("heading", { level: 2, name: "figma" })).toBeTruthy();
    await waitFor(() => expect(row.getAttribute("data-selected")).toBe("true"));
    // The cap names a kept skill's kind and place, and offers nothing to open:
    // it has no folder in the store.
    const eyebrow = await screen.findByTestId("inspector-cap-eyebrow");
    expect(eyebrow.textContent).toBe("Skill · Global");
    expect(screen.queryByRole("button", { name: /^Open/ })).toBeNull();

    const scansBefore = calls("start_scan").length;
    const keptReadsBefore = calls("get_kept_skills").length;
    fireEvent.click(within(await within(panel).findByTestId("kept-skill-detail")).getByRole("button", { name: "figma" }));
    await screen.findByText("figma is back on for every engine.");
    expect(calls("set_skill_enabled")).toEqual([{ key: KEY, enabled: true }]);
    // The rescan that rebuilds the search index, and the kept list read again at once.
    await waitFor(() => expect(calls("start_scan").length).toBe(scansBefore + 1));
    await waitFor(() => expect(calls("get_kept_skills").length).toBeGreaterThan(keptReadsBefore));
    // Back on, it leaves the kept list, and nothing is selected.
    await waitFor(() => expect(screen.queryByTestId("kept-skill-detail")).toBeNull());
  });

  it("switching a store skill off from its header opens its kept panel, and rescans", async () => {
    keptReply = NONE;
    mockPreferences.inspector_open = "true";
    render(<App />);
    await completeScan(INVENTORY);
    fireEvent.click(await screen.findByText("figma"));
    const panel = await aside();
    const button = await within(panel).findByRole("button", { name: "Switch figma off for every engine" });
    const scansBefore = calls("start_scan").length;
    fireEvent.click(button);
    await screen.findByText("figma is off for every engine. Hanger removed 1 link to the skill and will put it back.");
    expect(calls("set_skill_enabled")).toEqual([{ key: "skill:figma", enabled: false }]);
    await waitFor(() => expect(calls("start_scan").length).toBe(scansBefore + 1));
    expect(await within(panel).findByTestId("kept-skill-detail")).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Switch figma on for every engine" })).toBeTruthy();
  });
});
