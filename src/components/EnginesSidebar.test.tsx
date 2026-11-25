// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import EnginesSidebar from "./EnginesSidebar";

/**
 * The Engines screen's source list: one row per engine, named by the
 * backend, and no figure beside it (P7 of
 * docs/plans/2026-11-25-context-control-finish.md: the summary's
 * `server_count` counts distinct names and leaves out kept servers, so it
 * would contradict the rows the pane lists). Nothing is claimed before the
 * first scan.
 */

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

afterEach(cleanup);

const ENGINES = [
  { engine_id: "codex", engine_name: "Engine C" },
  { engine_id: "claude-code", engine_name: "Engine K" },
];

const props = (over: Partial<Parameters<typeof EnginesSidebar>[0]> = {}) => ({
  engines: ENGINES,
  scannedAt: new Date(),
  selected: "codex",
  onSelect: () => {},
  width: 240,
  setWidth: () => {},
  collapsed: false,
  setCollapsed: () => {},
  ...over,
});

describe("EnginesSidebar", () => {
  it("lists each engine by its backend name under the Engines heading, with no figure", () => {
    render(<EnginesSidebar {...props()} />);
    const list = screen.getByTestId("engines-sidebar");
    expect(within(list).getByText("Engines")).toBeTruthy();
    const rows = within(list).getAllByRole("button");
    expect(rows.map((r) => r.textContent)).toEqual(["Engine C", "Engine K"]);
    // No digit anywhere: the list carries no count (P7).
    expect(list.textContent).not.toMatch(/\d/);
  });

  it("marks the selected engine current and reports a click with its id", () => {
    const onSelect = vi.fn();
    render(<EnginesSidebar {...props({ onSelect })} />);
    const codex = screen.getByRole("button", { name: "Engine C" });
    const claude = screen.getByRole("button", { name: "Engine K" });
    expect(codex.getAttribute("aria-current")).toBe("true");
    expect(claude.getAttribute("aria-current")).toBeNull();
    fireEvent.click(claude);
    expect(onSelect).toHaveBeenCalledWith("claude-code");
    fireEvent.keyDown(codex, { key: "Enter" });
    expect(onSelect).toHaveBeenLastCalledWith("codex");
  });

  it("claims nothing before the first scan, then says so when no engine declares a server", () => {
    const { rerender } = render(<EnginesSidebar {...props({ engines: [], scannedAt: null, selected: null })} />);
    expect(screen.queryByText("No engine declares an MCP server.")).toBeNull();
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.getByText("Engines")).toBeTruthy();

    rerender(<EnginesSidebar {...props({ engines: null, scannedAt: new Date(), selected: null })} />);
    expect(screen.queryByText("No engine declares an MCP server.")).toBeNull();

    rerender(<EnginesSidebar {...props({ engines: [], scannedAt: new Date(), selected: null })} />);
    expect(screen.getByText("No engine declares an MCP server.")).toBeTruthy();
  });

  it("renders nothing while collapsed, as every source list does", () => {
    render(<EnginesSidebar {...props({ collapsed: true })} />);
    expect(screen.queryByTestId("engines-sidebar")).toBeNull();
  });
});
