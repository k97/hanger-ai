// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => undefined) }));

import ListRow from "./ListRow";
import type { EngineReachInfo } from "./EngineReachTiles";

/**
 * Global's two-line row (Task 1 of docs/plans/2026-11-26-global-list.md),
 * after T3 Code's PullRequestListRow: line 1 is the name, then the chip and
 * the engine marks on the right; line 2 is the muted detail, then one figure
 * on the right.
 *
 * happy-dom lays nothing out, so truncation and the right slot holding its
 * width are pinned here as class contracts only; the screenshots check them.
 */

afterEach(cleanup);

const reach: EngineReachInfo[] = [
  { engine_id: 1, engine_key: "claude_code", engine_name: "Claude Code", reached: true },
];

function renderRow(over: Partial<Parameters<typeof ListRow>[0]> = {}) {
  const onSelect = vi.fn();
  render(
    <ListRow
      kind="server"
      name="a-very-long-server-name-that-should-truncate-before-the-right-slot-moves"
      chip="stdio"
      detail="Registered in 2 engines"
      figure="12 tools"
      reach={reach}
      selected={false}
      onSelect={onSelect}
      {...over}
    />
  );
  return { onSelect, row: screen.getByTestId("list-row") };
}

describe("ListRow", () => {
  it("shows name, chip, marks, detail and figure, in that order", () => {
    const { row } = renderRow();
    const order = ["list-row-name", "list-row-chip", "engine-reach-tiles", "list-row-detail", "list-row-figure"].map(
      (id) => screen.getByTestId(id)
    );
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING, `${i}`).toBeTruthy();
    }
    expect(row.textContent).toContain("stdio");
    expect(row.textContent).toContain("Registered in 2 engines");
    expect(row.textContent).toContain("12 tools");
  });

  it("renders only what exists on line 2, and no dash in its place", () => {
    const { row } = renderRow({ kind: "rule", chip: undefined, detail: undefined, figure: undefined });
    expect(screen.queryByTestId("list-row-detail")).toBeNull();
    expect(screen.queryByTestId("list-row-figure")).toBeNull();
    expect(screen.queryByTestId("list-row-chip")).toBeNull();
    expect(row.textContent).not.toContain("—");
  });

  it("truncates the name, and keeps the right slot from wrapping or shrinking (Review Focus 1)", () => {
    renderRow();
    expect(screen.getByTestId("list-row-name").className).toContain("truncate");
    const trail = screen.getByTestId("list-row-trail").className;
    expect(trail).toContain("shrink-0");
    expect(trail).toContain("whitespace-nowrap");
    const figure = screen.getByTestId("list-row-figure").className;
    expect(figure).toContain("shrink-0");
    expect(figure).toContain("whitespace-nowrap");
  });

  it("names at 13px medium, details at 12px in ink-3 (round 18 q3)", () => {
    renderRow();
    expect(screen.getByTestId("list-row-name").className).toContain("text-base-app");
    expect(screen.getByTestId("list-row-name").className).toContain("font-medium");
    expect(screen.getByTestId("list-row-detail").className).toContain("text-small");
    expect(screen.getByTestId("list-row-detail").className).toContain("text-ink-3");
  });

  it("is focusable, and Enter or a click selects it (Review Focus 4)", () => {
    const { row, onSelect } = renderRow();
    expect(row.tabIndex).toBe(0);
    fireEvent.keyDown(row, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(1);
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledTimes(2);
    // Focus shows through index.css's unlayered `:focus-visible` ring, so
    // the row must not opt out of it.
    expect(row.className).not.toContain("outline-none");
  });

  it("draws selection as T3 does: the page colour and an inset line-2 ring", () => {
    const { row } = renderRow({ selected: true });
    expect(row.getAttribute("data-selected")).toBe("true");
    expect(row.className).toContain("bg-page");
    expect(row.className).toContain("ring-line-2");
    expect(row.className).toContain("ring-inset");
  });

  it("toggling a tile does not select the row", () => {
    const onToggle = vi.fn();
    const { onSelect } = renderRow({
      switchFor: () => ({
        engineName: "Claude Code",
        serverName: "lint",
        file: "~/.claude.json",
        state: "on",
        readOnly: null,
        busy: false,
        onToggle,
      }),
    });
    fireEvent.click(screen.getByTestId("reach-tile-claude_code"));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
