import { describe, it, expect } from "vitest";
import { DOCKED_LANE_CLEARANCE, OVERVIEW_DOCK_MIN_WIDTH, shouldDockOverview } from "./overviewLayout";

/** Task 2 of docs/plans/2026-11-26-global-list.md: the card docks when the
 *  list has room for T3's 640px column, its two 48px paddings, the 32px
 *  clearance, the 12px gap and the 280px card, and never beside an open
 *  inspector (round 16 q2). */
describe("shouldDockOverview", () => {
  it("does not dock at 1059px", () => {
    expect(shouldDockOverview(1059, false)).toBe(false);
  });

  it("docks at 1060px: 640 + 280 + 12 + 32 + 2 × 48", () => {
    expect(OVERVIEW_DOCK_MIN_WIDTH).toBe(1060);
    expect(shouldDockOverview(1060, false)).toBe(true);
  });

  it("never docks beside an open inspector, however wide the list", () => {
    expect(shouldDockOverview(1060, true)).toBe(false);
    expect(shouldDockOverview(4000, true)).toBe(false);
  });

  it("does not dock on an unmeasured list (0px, as under happy-dom)", () => {
    expect(shouldDockOverview(0, false)).toBe(false);
  });
});

describe("the docked lane's clearance", () => {
  it("is the card, its 12px gap and T3's 32px: 324px from the list's right edge", () => {
    expect(DOCKED_LANE_CLEARANCE).toBe(280 + 12 + 32);
  });
});
