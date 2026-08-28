import { describe, expect, it } from "vitest";
import { strokeFor } from "../components/icons";

// Karthik's ruling I1, 2026-08-28: a mark's stroke lands at 1.0px on
// screen (Codex measures exactly 2 device px at 2×) and is never thinner
// than the family's native 1.5. Attribute arithmetic only — the screen
// weight itself is proven by the frames in docs/evidence.
describe("strokeFor", () => {
  it.each([
    [12, 2],
    [13, 1.85],
    [14, 1.71],
    [15, 1.6],
    [16, 1.5],
  ])("box %i → stroke %f (1.0px on screen)", (box, stroke) => {
    expect(strokeFor(box)).toBe(stroke);
    expect((strokeFor(box) * box) / 24).toBeCloseTo(1.0, 1);
  });

  it.each([17, 18, 20, 24, 36])("box %i keeps the native 1.5 floor", (box) => {
    expect(strokeFor(box)).toBe(1.5);
  });
});
