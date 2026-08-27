// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import App from "../App";

/**
 * The inspector holds its subject until another row is chosen (Karthik,
 * 2026-08-27). Filtering the list underneath it is not a new subject: a
 * category card changed what the table shows and nothing about what is being
 * inspected, but it used to clear the selection and leave the panel empty.
 *
 * App.tsx is the only place this is visible — ProfilePane raised the event
 * and App owned the selection, so each was correct on its own and the seam
 * between them was where the panel went blank.
 */

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
        total_assets: 2,
        skill: { total: 1, global: 1, project: 0 },
        tool: { total: 1, global: 1, project: 0 },
        rule: { total: 0, global: 0, project: 0 },
        subagent: { total: 0, global: 0, project: 0 },
        engines: {},
      };
    if (cmd === "get_asset_annotations") return [];
    if (cmd === "get_detected_engines" || cmd === "get_known_engines")
      return [{ id: "claude-code", name: "Claude Code" }];
    if (cmd === "get_mcp_processes") return [];
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

/** The category cards, addressed the way ProfilePaneIntegration does. */
const categoryCard = (label: string) =>
  screen.getAllByText(label).find((el) => el.closest("[tabindex]"))?.closest("[tabindex]")!;

/** The pane's own region — the inspector is an <aside> beside it, and both
 *  can name the same asset at once, which is the whole point here. */
const table = () => within(document.querySelector("main")!);

/** The inspector renders a tab row only while it has a subject. */
const inspecting = () => screen.queryByRole("tablist", { name: "Inspector view" }) !== null;

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

describe("The inspector holds its subject while the table is filtered", () => {
  it("keeps the open skill when the category moves to MCP servers", async () => {
    render(<App />);

    fireEvent.click(await screen.findByText("Claude Math Skill"));
    await waitFor(() => expect(inspecting()).toBe(true));

    // Filtering the list is not choosing a new subject.
    fireEvent.click(categoryCard("MCP servers"));
    // The table did filter: the skill is gone from the list...
    expect(table().queryByText("Claude Math Skill")).toBeNull();
    expect(table().getByText("Node Runner Tool")).toBeTruthy();
    // ...and is still the thing being inspected.
    expect(inspecting()).toBe(true);
    expect(screen.getByRole("tab", { name: "Content" })).toBeTruthy();
  });

  it("lets the next row take the panel over", async () => {
    render(<App />);

    fireEvent.click(await screen.findByText("Claude Math Skill"));
    await waitFor(() => expect(inspecting()).toBe(true));

    fireEvent.click(categoryCard("MCP servers"));
    fireEvent.click(table().getByText("Node Runner Tool"));
    // The MCP panel names its first tab Tools; the skill's named it Content.
    await waitFor(() => expect(screen.getByRole("tab", { name: /^Tools/ })).toBeTruthy());
  });
});
