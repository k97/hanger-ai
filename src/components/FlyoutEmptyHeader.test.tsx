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
// Fix round 1, item 5 added `isRepoScope`: `McpEngineSummary` is a
// machine-wide read (`get_mcp_engine_summary` walks every host's config,
// not one repo's `.mcp.json`), and the reviewer found it rendering under a
// repository's own eyebrow with data that both omitted that repo's real
// registrations and included every other repo's. The eyebrow chrome stays
// identical between the two panes (still names the repo via `paneScope`);
// only the BODY differs, which is why those two tests below mock
// `get_mcp_engine_summary` with real rows rather than the blanket `null`
// the first three tests use — proving the repo case suppresses the summary
// even when the backend has something to show, not merely when it doesn't.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import Flyout from "./Flyout";
import { Inventory } from "../App";
import type { McpEngineSummaryData } from "./McpEngineSummary";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invoke(cmd, args),
}));

const realSummary: McpEngineSummaryData = {
  rows: [{ engine_id: "claude-code", engine_name: "Claude Code", server_count: 1, tools_known: 4 }],
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
        isRepoScope
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

  it("the global pane fetches and renders the machine-wide summary", async () => {
    invoke.mockImplementation((cmd: string) =>
      cmd === "get_mcp_engine_summary" ? Promise.resolve(realSummary) : Promise.resolve(null)
    );

    render(
      <Flyout
        activeCategory="Tools"
        paneScope="Global"
        isRepoScope={false}
        inventory={emptyInventory}
        linkedProjects={[]}
        onRefresh={vi.fn()}
      />
    );

    await screen.findByText("What every request carries");
    expect(screen.getByText("Claude Code")).toBeTruthy();
  });

  /**
   * Fix round 1, item 5's own pin. Data that WOULD render a real summary is
   * on offer from the mocked backend; the repo pane must still show its
   * prior empty body, not the machine-wide table, and must not even ask —
   * `get_mcp_engine_summary` gates on `isRepoScope` before firing, so a
   * repo pane never requests data it will not show.
   */
  it("a repository pane never renders the machine-wide summary, even when the backend has one to give", async () => {
    invoke.mockImplementation((cmd: string) =>
      cmd === "get_mcp_engine_summary" ? Promise.resolve(realSummary) : Promise.resolve(null)
    );

    render(
      <Flyout
        activeCategory="Tools"
        paneScope="my-repo"
        isRepoScope
        inventory={emptyInventory}
        linkedProjects={[]}
        onRefresh={vi.fn()}
      />
    );

    // Give any effect a chance to run before asserting its absence.
    await waitFor(() => {
      expect(screen.getByText("MCP servers")).toBeTruthy();
    });
    expect(screen.queryByText("What every request carries")).toBeNull();
    expect(screen.queryByText("Claude Code")).toBeNull();
    expect(invoke.mock.calls.some((call) => call[0] === "get_mcp_engine_summary")).toBe(false);
  });
});
