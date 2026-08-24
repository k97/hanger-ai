// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import SegmentedTrack from "./SegmentedTrack";

afterEach(cleanup);
const segments = [
  { id: "all", label: "All", count: 144 },
  { id: "Skills", label: "Skills", count: 110 },
  { id: "Tools", label: "MCP servers", count: 19 },
];

describe("SegmentedTrack", () => {
  it("is a tablist on a plane track with one raised capsule and no check mark", () => {
    render(<SegmentedTrack segments={segments} selectedId="Tools" onSelect={vi.fn()} ariaLabel="Filter by category" />);
    const list = screen.getByRole("tablist", { name: "Filter by category" });
    expect(list.className).toContain("bg-plane");
    expect(list.className).toContain("rounded-pill");
    expect(list.className).toContain("overflow-x-auto");
    const capsule = screen.getByTestId("track-capsule");
    expect(capsule.className).toContain("capsule-raised");
    expect(capsule.className).toContain("duration-nav");
    expect(list.querySelector("svg:not(.animate-spin)")).toBeNull();
    const tools = screen.getByRole("tab", { name: "MCP servers 19" });
    expect(tools.getAttribute("aria-selected")).toBe("true");
    expect(tools.className).toContain("font-medium");
    expect(tools.textContent).toBe("MCP servers19");
    expect(tools.tabIndex).toBe(0);
    expect(screen.getByRole("tab", { name: "Skills 110" }).tabIndex).toBe(-1);
  });

  it("selects on click and on Enter, moves focus with the arrow keys", () => {
    const onSelect = vi.fn();
    render(<SegmentedTrack segments={segments} selectedId="all" onSelect={onSelect} ariaLabel="Filter by category" />);
    fireEvent.click(screen.getByRole("tab", { name: "Skills 110" }));
    expect(onSelect).toHaveBeenCalledWith("Skills");
    const all = screen.getByRole("tab", { name: "All 144" });
    all.focus();
    fireEvent.keyDown(all, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Skills 110" }));
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(onSelect).toHaveBeenLastCalledWith("Skills");
  });

  it("draws a spinner for a count that has not arrived, while loading", () => {
    render(<SegmentedTrack segments={[{ id: "all", label: "All" }]} selectedId="all" onSelect={vi.fn()} ariaLabel="x" loading />);
    expect(screen.getByRole("tab").querySelector("svg.animate-spin")).toBeTruthy();
  });
});
