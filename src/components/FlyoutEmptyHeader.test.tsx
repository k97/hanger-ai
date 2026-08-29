// @vitest-environment happy-dom
//
// The inspector's empty state (nothing selected) previously rendered no
// eyebrow at all — the "Inspector" literal it once fell back to is
// unreachable, since the header block only mounts when linking, targetAsset
// or selectedBubble is truthy. Karthik signed off a plural eyebrow for this
// state, but only when the MCP category is the pane's active filter: a user
// filtered to Skills must not be told "MCP servers" over an empty Skills
// list. `activeCategory` and `paneScope` are owned by App.tsx (the crumb's
// last segment); this component only composes them.
//
// Fix round 1, item 5 gated a machine-wide `McpEngineSummary` table on
// `isRepoScope` so it never rendered under a repository's own eyebrow with
// data that both omitted that repo's real registrations and included every
// other repo's. `McpEngineSummary` is retired (Task 8, 2026-08-28): its
// rows moved into the hero's band, and the Tools-tab empty state is now the
// generic "Nothing selected" body everywhere, so `isRepoScope` is no longer
// a Flyout prop at all. The eyebrow chrome still stays identical between
// the two panes (still names the repo via `paneScope`); the test below
// mocks `get_mcp_engine_summary` with real rows anyway, to prove the body
// no longer reads that answer rather than merely not asking for it.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import Flyout from "./Flyout";
import { Inventory } from "../App";
import type { McpEngineSummaryData } from "../types/mcpEngineSummary";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invoke(cmd, args),
}));

const realSummary: McpEngineSummaryData = {
  rows: [{ engine_id: "claude-code", engine_name: "Claude Code", server_count: 1, tools_known: 4 }],
  host_count: 1,
  tools_known_total: 4,
  total_server_count: 1,
  answered_server_count: 1,
  unasked_server_count: 0,
  unaskable_server_count: 0,
  conflicting_server_count: 0,
};

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
});

const emptyInventory: Inventory = {
  agents: [],
  skills: [],
  tools: [],
  rules: [],
  subagents: [],
  project_scans: [],
};

describe("Flyout empty-inspector eyebrow", () => {
  it("MCP filter active, nothing selected, shows the plural eyebrow with the pane's scope", () => {
    render(
      <Flyout
        activeCategory="Tools"
        paneScope="Global"
        inventory={emptyInventory}
        linkedProjects={[]}
        onRefresh={vi.fn()}
      />
    );

    expect(screen.getByText("MCP servers")).toBeTruthy();
    expect(screen.getByText("Global")).toBeTruthy();
    // Nothing is selected, so there is no title beneath the eyebrow.
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("MCP filter active in a repository view, nothing selected, shows the repo's folder name", () => {
    render(
      <Flyout
        activeCategory="Tools"
        paneScope="my-repo"
        inventory={emptyInventory}
        linkedProjects={[]}
        onRefresh={vi.fn()}
      />
    );

    expect(screen.getByText("MCP servers")).toBeTruthy();
    expect(screen.getByText("my-repo")).toBeTruthy();
    expect(screen.queryByText("Global")).toBeNull();
  });

  it("a non-MCP filter active, nothing selected, leaves today's empty state unchanged", () => {
    render(
      <Flyout
        activeCategory="Skills"
        paneScope="Global"
        inventory={emptyInventory}
        linkedProjects={[]}
        onRefresh={vi.fn()}
      />
    );

    expect(screen.queryByText("MCP servers")).toBeNull();
    expect(screen.getByText("Nothing selected")).toBeTruthy();
  });

  /**
   * McpEngineSummary is retired (Task 8, 2026-08-28): its rows moved into
   * the hero's band, and the Tools-tab empty state is now the generic
   * "Nothing selected" body in both panes — the fold of what were two
   * separate cases (a global pane that used to fetch and render the
   * machine-wide table, and a repo pane that already asserted its
   * absence). `get_mcp_engine_summary` is never invoked from here at all
   * now; data that WOULD have rendered a real summary is still on offer
   * from the mocked backend, to prove the body no longer reads it rather
   * than merely not being asked for it.
   */
  it("nothing selected in the Tools tab is the generic empty body, in the global pane and a repository pane alike", () => {
    invoke.mockImplementation((cmd: string) =>
      cmd === "get_mcp_engine_summary" ? Promise.resolve(realSummary) : Promise.resolve(null)
    );

    const { unmount } = render(
      <Flyout
        activeCategory="Tools"
        paneScope="Global"
        inventory={emptyInventory}
        linkedProjects={[]}
        onRefresh={vi.fn()}
      />
    );
    expect(screen.getByText("Nothing selected")).toBeTruthy();
    expect(screen.queryByText("What every request carries")).toBeNull();
    expect(screen.queryByText("Claude Code")).toBeNull();
    unmount();

    render(
      <Flyout
        activeCategory="Tools"
        paneScope="my-repo"
        inventory={emptyInventory}
        linkedProjects={[]}
        onRefresh={vi.fn()}
      />
    );
    expect(screen.getByText("Nothing selected")).toBeTruthy();
    expect(screen.queryByText("What every request carries")).toBeNull();
    expect(screen.queryByText("Claude Code")).toBeNull();
    expect(invoke.mock.calls.some((call) => call[0] === "get_mcp_engine_summary")).toBe(false);
  });
});
