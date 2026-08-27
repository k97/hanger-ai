// Pure-function tests: no window, no DOM, no environment annotation. The
// geometry must be callable from anywhere and give the same answer twice.
import { describe, it, expect } from "vitest";
import {
  INSPECTOR_MIN_WIDTH,
  MAIN_MIN_WIDTH,
  EXPAND_SNAP_MARGIN,
  inspectorCeiling,
  resolveInspectorDrag,
  refitInspectorWidth,
} from "./inspectorLayout";

describe("inspectorCeiling", () => {
  it("is the room when the window can hold both floors", () => {
    expect(inspectorCeiling(900)).toBe(900);
  });

  it("never drops below the inspector's own floor", () => {
    expect(inspectorCeiling(120)).toBe(INSPECTOR_MIN_WIDTH);
  });
});

describe("resolveInspectorDrag", () => {
  it("a width that fits", () => {
    expect(resolveInspectorDrag(420, 900)).toEqual({ width: 420, expanded: false });
  });

  it("the floor still holds", () => {
    expect(resolveInspectorDrag(300, 900)).toEqual({ width: 384, expanded: false });
  });

  it("resisting at the ceiling", () => {
    expect(resolveInspectorDrag(940, 900)).toEqual({ width: 900, expanded: false });
  });

  it("one pixel short of the snap", () => {
    expect(resolveInspectorDrag(959, 900)).toEqual({ width: 900, expanded: false });
  });

  it("the snap", () => {
    expect(resolveInspectorDrag(960, 900)).toEqual({ width: 900, expanded: true });
  });

  it("past the snap", () => {
    expect(resolveInspectorDrag(1200, 900)).toEqual({ width: 900, expanded: true });
  });

  it("dragging back out of expanded", () => {
    expect(resolveInspectorDrag(700, 900)).toEqual({ width: 700, expanded: false });
  });

  it("a window too small for both", () => {
    expect(resolveInspectorDrag(400, 120)).toEqual({ width: 384, expanded: false });
  });
});

describe("refitInspectorWidth", () => {
  it("refit never expands", () => {
    // Karthik ruled on this explicitly (2026-08-27): a shrunken window must
    // never expand the panel. A remembered width is refitted, never read as
    // a gesture.
    expect(refitInspectorWidth(1200, 600)).toBe(600);
  });

  it("refit leaves a fitting width alone", () => {
    expect(refitInspectorWidth(500, 900)).toBe(500);
  });

  it("refit respects the floor", () => {
    expect(refitInspectorWidth(100, 900)).toBe(384);
  });

  it("refit on a tiny window", () => {
    expect(refitInspectorWidth(900, 120)).toBe(384);
  });
});

describe("named constants", () => {
  it("match the values Karthik settled on", () => {
    expect(INSPECTOR_MIN_WIDTH).toBe(384);
    expect(MAIN_MIN_WIDTH).toBe(520);
    expect(EXPAND_SNAP_MARGIN).toBe(60);
  });
});
