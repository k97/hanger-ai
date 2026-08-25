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
    // No mark renders here at all (every segment has a count), so the only
    // svg this could ever tolerate is a live loading spinner — one whose
    // motion now lives on an inner <g class="aim-loop">, not on the <svg>
    // itself, since animate-spin never lands on the <svg> after the mark
    // swap. `svg:not(.animate-spin)` stopped encoding that and would match
    // the very spinner it was written to exclude.
    expect(list.querySelector("svg") === null || list.querySelector("g.aim-loop") !== null).toBe(
      true
    );
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

  it("wraps the arrow keys around both ends of the track", () => {
    render(<SegmentedTrack segments={segments} selectedId="all" onSelect={vi.fn()} ariaLabel="Filter by category" />);
    const first = screen.getByRole("tab", { name: "All 144" });
    const last = screen.getByRole("tab", { name: "MCP servers 19" });
    // The two steps the non-wrapping walk cannot take. Deleting wraparound
    // leaves focus where it was, so asserting the landing — not merely that
    // focus moved — is what makes this fail.
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: "ArrowRight" });
    expect(document.activeElement).toBe(first);
  });

  it("hands the selected tab's measured box to the capsule, each offset to its own property", () => {
    // happy-dom lays nothing out: every offset reads 0, so the capsule's real
    // geometry cannot be asserted here (verification.md, "a green test in
    // happy-dom is not evidence about geometry"). Shadowing the three offsets
    // with three DISTINCT values proves the part that is assertable — that
    // offsetTop reaches `top`, offsetLeft reaches `left`, and offsetWidth
    // reaches `width`, rather than each other. That the capsule then lands
    // under the selected tab on screen is a screenshot claim, not this one.
    const { rerender } = render(
      <SegmentedTrack segments={segments} selectedId="all" onSelect={vi.fn()} ariaLabel="Filter by category" />,
    );
    const skills = screen.getByRole("tab", { name: "Skills 110" });
    // None of these equals another, and none equals the resting {top:4,left:4,width:0}.
    Object.defineProperty(skills, "offsetTop", { value: 6, configurable: true });
    Object.defineProperty(skills, "offsetLeft", { value: 96, configurable: true });
    Object.defineProperty(skills, "offsetWidth", { value: 120, configurable: true });
    rerender(
      <SegmentedTrack segments={segments} selectedId="Skills" onSelect={vi.fn()} ariaLabel="Filter by category" />,
    );
    const capsule = screen.getByTestId("track-capsule");
    expect(capsule.style.top).toBe("6px");
    expect(capsule.style.left).toBe("96px");
    expect(capsule.style.width).toBe("120px");
  });

  it("draws a spinner for a count that has not arrived, while loading", () => {
    render(<SegmentedTrack segments={[{ id: "all", label: "All" }]} selectedId="all" onSelect={vi.fn()} ariaLabel="x" loading />);
    // The motion class moved from the <svg> to the inner <g> the mark swap
    // introduced; the loop is still live, just found in a different place.
    expect(screen.getByRole("tab").querySelector("g.aim-loop")).toBeTruthy();
  });

  it("draws the counting-slot spinner at 12px, not 11 — the retired outlier size", () => {
    // docs/v5-animate-icons/00-state-inventory.md ruling 8: 11 was a bespoke
    // size at one animated site (CategoryFilterCards.tsx:110, since moved to
    // 12) and was retired rather than kept as a second small size. This was
    // the app's only other size-11 animated site; pin it so a regression
    // back to 11 fails here rather than being re-discovered by inspection.
    render(<SegmentedTrack segments={[{ id: "all", label: "All" }]} selectedId="all" onSelect={vi.fn()} ariaLabel="x" loading />);
    const svg = screen.getByRole("tab").querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("12");
  });
});
