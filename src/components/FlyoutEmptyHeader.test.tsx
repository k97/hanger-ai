// @vitest-environment happy-dom
//
// The inspector's empty state carries no eyebrow. It never did until
// 2026-08-18, when Karthik signed off a plural one — "MCP servers · Global" —
// shown only when the pane's filter was MCP, so a Skills-filtered view could
// not claim "MCP servers" over its own empty list.
//
// He reversed that on 2026-08-30. The eyebrow's scope word was
// `crumbSegments[crumbSegments.length - 1]` (App.tsx), and the chrome work
// this release moved the breadcrumb into the cap band — so the same word
// rendered twice on one screen, a thousand pixels apart. The empty body
// already says nothing is selected and the filter chip already names the
// kind. Removing it restores the pre-2026-08-18 shape exactly: the header
// block mounts only when linking, targetAsset or selectedBubble is truthy.
//
// Three tests here pinned the eyebrow and were removed with it. What is left
// is the one that never depended on it: `McpEngineSummary` is retired (Task 8,
// 2026-08-28), its rows moved into the hero's band, and the Tools-tab empty
// state is the generic "Nothing selected" body in both panes. That test mocks
// `get_mcp_engine_summary` with real rows anyway, to prove the body no longer
// reads that answer rather than merely not asking for it.
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

describe("Flyout empty inspector", () => {
  it("renders no eyebrow at all — the crumb in the cap band already names the scope", () => {
    render(
      <Flyout onOpenConfig={() => {}} inventory={emptyInventory} linkedProjects={[]} onRefresh={vi.fn()} />
    );

    expect(screen.getByText("Nothing selected")).toBeTruthy();
    // The eyebrow named the kind and the scope. Neither is this panel's job.
    expect(screen.queryByText("MCP servers")).toBeNull();
    expect(screen.queryByText("Global")).toBeNull();
    // The header block does not mount at all, so there is no title either.
    expect(screen.queryByTestId("inspector-header")).toBeNull();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("nothing selected in the Tools tab is the generic empty body, in the global pane and a repository pane alike", () => {
    invoke.mockImplementation((cmd: string) =>
      cmd === "get_mcp_engine_summary" ? Promise.resolve(realSummary) : Promise.resolve(null)
    );

    render(
      <Flyout onOpenConfig={() => {}} inventory={emptyInventory} linkedProjects={[]} onRefresh={vi.fn()} />
    );
    expect(screen.getByText("Nothing selected")).toBeTruthy();
    expect(screen.queryByText("What every request carries")).toBeNull();
    expect(screen.queryByText("Claude Code")).toBeNull();
    expect(invoke.mock.calls.some((call) => call[0] === "get_mcp_engine_summary")).toBe(false);
  });
});
