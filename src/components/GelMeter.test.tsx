// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import GelMeter from "./GelMeter";

afterEach(cleanup);

/** The painted segments: the meter's own children. */
function segmentsOf(label: string): HTMLElement[] {
  return Array.from(screen.getByRole("img", { name: label }).children) as HTMLElement[];
}

describe("GelMeter's rank tone (round 14 q1)", () => {
  it("paints one plain ink-1 segment: no gloss and no aqua, even when a segment asks for aqua", () => {
    render(<GelMeter tone="rank" label="rank" segments={[{ key: "a", value: 5, aqua: true }]} />);
    const [seg] = segmentsOf("rank");
    expect(seg.className).toContain("bg-ink-1");
    expect(seg.style.backgroundImage).toBe("");
  });

  it("keeps the gel tone the default, with its gloss", () => {
    render(<GelMeter label="gel" segments={[{ key: "a", value: 5 }]} />);
    const [seg] = segmentsOf("gel");
    expect(seg.style.backgroundImage).toBe("var(--gel-gloss)");
    expect(seg.className).not.toContain("bg-ink-1");
  });

  it("draws the bare track for an empty segments array", () => {
    render(<GelMeter tone="rank" label="empty" segments={[]} />);
    expect(segmentsOf("empty")).toEqual([]);
  });
});

describe("GelMeter's max", () => {
  it("sizes a segment as its share of max, not of the other segments", () => {
    render(<GelMeter tone="rank" max={13598} label="codex" segments={[{ key: "codex", value: 9951 }]} />);
    const [seg] = segmentsOf("codex");
    expect(parseFloat(seg.style.width)).toBeCloseTo((9951 / 13598) * 100, 3);
    expect(seg.style.flex).toBe("");
  });

  it("fills the track for the heaviest figure", () => {
    render(<GelMeter tone="rank" max={13598} label="top" segments={[{ key: "top", value: 13598 }]} />);
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
