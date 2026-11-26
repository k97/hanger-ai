// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import GelMeter from "./GelMeter";

afterEach(cleanup);

/** The painted segments: the meter's own children. */
function segmentsOf(label: string): HTMLElement[] {
  return Array.from(screen.getByRole("img", { name: label }).children) as HTMLElement[];
}

describe("GelMeter's tones", () => {
  it("keeps the gel tone the default, with its gloss", () => {
    render(<GelMeter label="gel" segments={[{ key: "a", value: 5 }]} />);
    const [seg] = segmentsOf("gel");
    expect(seg.style.backgroundImage).toBe("var(--gel-gloss)");
    expect(seg.className).not.toContain("bg-ink-1");
  });

  it("draws the bare track for an empty segments array", () => {
    render(<GelMeter tone="line" label="empty" segments={[]} />);
    expect(segmentsOf("empty")).toEqual([]);
  });
});

describe("GelMeter's max", () => {
  it("sizes a segment as its share of max, not of the other segments", () => {
    render(<GelMeter tone="line" max={13598} label="codex" segments={[{ key: "codex", value: 9951 }]} />);
    const [seg] = segmentsOf("codex");
    expect(parseFloat(seg.style.width)).toBeCloseTo((9951 / 13598) * 100, 3);
    expect(seg.style.flex).toBe("");
  });

  it("fills the track for the heaviest figure", () => {
    render(<GelMeter tone="line" max={13598} label="top" segments={[{ key: "top", value: 13598 }]} />);
    expect(segmentsOf("top")[0].style.width).toBe("100%");
  });

  it("still shares the track by flex without a max", () => {
    render(<GelMeter label="split" segments={[{ key: "a", value: 3 }, { key: "b", value: 1 }]} />);
    const [a, b] = segmentsOf("split");
    expect(a.style.flex).toMatch(/^3/);
    expect(b.style.flex).toMatch(/^1/);
    expect(a.style.width).toBe("");
  });
});

/* Task 2 of docs/plans/2026-11-26-global-list.md: the overview card's kind
   rows, after T3's usage meter (ThreadDetailsUsage.tsx): a 3px bar on a
   line track, its fill in ink, and a 1px tick at the fill's end. */
describe("GelMeter's line tone (Task 2)", () => {
  it("is a 3px track; one ink fill sized against max; a tick at its end", () => {
    render(<GelMeter tone="line" max={200} label="line" segments={[{ key: "a", value: 50, aqua: true }]} />);
    const meter = screen.getByRole("img", { name: "line" });
    for (const c of ["h-[3px]", "rounded-pill", "bg-line-2"]) expect(meter.className.split(/\s+/)).toContain(c);
    const fill = meter.querySelector("[data-meter-fill]") as HTMLElement;
    expect(fill.className).toContain("bg-ink-1");
    expect(fill.style.width).toBe("25%");
    expect(fill.style.backgroundImage).toBe("");
    const tick = meter.querySelector("[data-meter-tick]") as HTMLElement;
    for (const c of ["w-px", "h-[9px]", "bg-ink-1"]) expect(tick.className.split(/\s+/)).toContain(c);
    expect(tick.style.left).toBe("25%");
  });

  it("is the bare track, with no tick, for no figure", () => {
    render(<GelMeter tone="line" label="bare" segments={[]} />);
    const meter = screen.getByRole("img", { name: "bare" });
    expect(meter.querySelector("[data-meter-fill]")).toBeNull();
    expect(meter.querySelector("[data-meter-tick]")).toBeNull();
  });
});
