// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import Flyout from "./Flyout";
import { Inventory } from "../App";

/**
 * The inspector's tab is the user's question, not the asset's: opening
 * Details and walking down a table should keep answering it, including
 * across the point where the panel component itself changes — an MCP server
 * renders `McpServerDetail`, everything else `AssetDetail`, and the swap
 * unmounts whichever was mounted. Neither panel's own suite can see that,
 * because neither is ever the other.
 *
 * A screen change is the boundary the memory does not cross (Karthik,
 * 2026-08-27: "moving between tabs, but not screens").
 */

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (cmd: string, args?: unknown) => invoke(cmd, args) }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(), openPath: vi.fn(), revealItemInDir: vi.fn() }));

const SKILL = "/Users/x/.claude/skills/agent-browser";

const inventory: Inventory = {
  agents: [],
  skills: [
    { id: "1", name: "agent-browser", description: "", version: "1", path: SKILL, scope: { Global: { agent: "claude" } } },
  ] as never,
  tools: [
    {
      id: "/Users/x/.claude.json:spades-audio",
      name: "spades-audio",
      command: "node",
      launch_display: "node index.js",
      transport: "stdio",
      config_path: "/Users/x/.claude.json",
      scope: { Global: { agent: "claude-code" } },
      owning_agent: "claude-code",
      drifted: false,
    },
    {
      id: "/Users/x/.claude.json:mei-recipes",
      name: "mei-recipes",
      command: "node",
      launch_display: "node recipes.js",
      transport: "stdio",
      config_path: "/Users/x/.claude.json",
      scope: { Global: { agent: "claude-code" } },
      owning_agent: "claude-code",
      drifted: false,
    },
  ] as never,
  rules: [],
  subagents: [],
  project_scans: [],
};

const skill = { name: "agent-browser", category: "Skills", path: SKILL };
const server = { name: "spades-audio", category: "Tools", path: "/Users/x/.claude.json" };

/** The panel as App mounts it, with only the two things these tests vary. */
const panel = (asset: unknown, screen_: string) => (
  <Flyout
    onOpenConfig={() => {}}
    inventory={inventory}
    selectedAsset={asset as never}
    screen={screen_}
    mcpProcesses={[]}
    linkedProjects={[]}
    onRefresh={() => {}}
  />
);

const detailsTab = () => screen.getByRole("tab", { name: "Details" });
const detailsOpen = () => detailsTab().getAttribute("aria-selected") === "true";

beforeEach(() => {
  invoke.mockReset();
  invoke.mockImplementation((cmd: string) => {
    if (cmd === "mcp_cached_probe")
      return Promise.resolve({ result: null, verifiedAt: null, fromCache: false, declined: false });
    if (cmd === "read_asset_body")
      return Promise.resolve({
        path: `${SKILL}/SKILL.md`,
        text: "# agent-browser",
        bytes: 16,
        lines: 1,
        estimated_tokens: 4,
        always_on_bytes: null,
        always_on_estimated_tokens: null,
        modified_ms: null,
      });
    if (cmd === "list_asset_dir") return Promise.resolve([]);
    return Promise.resolve(null);
  });
});

afterEach(cleanup);

describe("Flyout — the inspector's tab across a change of subject", () => {
  it("keeps Details open when the subject moves from a skill to an MCP server and back", async () => {
    const { rerender } = render(panel(skill, "profile"));
    await screen.findByRole("tab", { name: "Details" });
    fireEvent.click(detailsTab());
    expect(detailsOpen()).toBe(true);

    // AssetDetail unmounts, McpServerDetail mounts. The tab is the only
    // thing that should survive that.
    rerender(panel(server, "profile"));
    await waitFor(() => expect(detailsOpen()).toBe(true));

    rerender(panel(skill, "profile"));
    await waitFor(() => expect(detailsOpen()).toBe(true));
  });

  it("opens the next server on Details too, once Details is what was asked for", async () => {
    const { rerender } = render(panel(server, "profile"));
    fireEvent.click(detailsTab());
    expect(detailsOpen()).toBe(true);

    rerender(panel({ ...server, name: "mei-recipes" }, "profile"));
    await waitFor(() => expect(detailsOpen()).toBe(true));
  });

  it("forgets it on a screen change, which is where the memory stops", async () => {
    const { rerender } = render(panel(skill, "profile"));
    await screen.findByRole("tab", { name: "Details" });
    fireEvent.click(detailsTab());
    expect(detailsOpen()).toBe(true);

    // App clears the selection when the sidebar moves (App.tsx,
    // handleSelectSidebarItem), so a screen change arrives here as both at
    // once: nothing selected, and a new screen.
    rerender(panel(null, "/Users/x/mei-recipes"));
    rerender(panel(skill, "/Users/x/mei-recipes"));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Content" }).getAttribute("aria-selected")).toBe("true"));
    expect(detailsOpen()).toBe(false);
  });
});
