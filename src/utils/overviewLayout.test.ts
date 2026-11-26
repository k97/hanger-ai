import { describe, it, expect } from "vitest";
import { DOCKED_LANE_CLEARANCE, OVERVIEW_DOCK_MIN_WIDTH, shouldDockOverview } from "./overviewLayout";

/** The card docks when the column beside it can stay at least 560px wide
 *  (round 21, docs/plans/2026-11-26-decisions-round-21.md, which replaced
 *  Task 2's 640px column and its two 48px paddings): 560 + the 280px card,
 *  its 12px gap and T3's 32px clearance is 884px of list. Never beside an
 *  open inspector (round 16 q2). */
describe("shouldDockOverview", () => {
  it("does not dock at 883px", () => {
    expect(shouldDockOverview(883, false)).toBe(false);
  });

  it("docks at 884px: 560 + 280 + 12 + 32", () => {
    expect(OVERVIEW_DOCK_MIN_WIDTH).toBe(884);
    expect(shouldDockOverview(884, false)).toBe(true);
  });

  it("docks at 968px, the list area of Karthik's 1,024px window with nothing selected", () => {
    expect(shouldDockOverview(968, false)).toBe(true);
  });

  it("never docks beside an open inspector, however wide the list", () => {
    expect(shouldDockOverview(968, true)).toBe(false);
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
