/**
 * Where Global's overview card goes: docked at the list's top right, or
 * behind its window-bar button as a popover (Task 2 of
 * docs/plans/2026-11-26-global-list.md; round 16 q2: the app decides, as T3
 * Code does, and the pin goes). T3's card, from `threadDetailsCardLayout.ts`
 * and `chatCanvasLayout.ts`: 280px wide, 12px from the edge, with the column
 * keeping 32px clear of it. The column it must leave is Karthik's, not T3's
 * 640px: at least 560px, the column of the approved frame (round 21,
 * docs/plans/2026-11-26-decisions-round-21.md), so at his 1,024px window
 * the card docks while nothing is selected.
 */

/** The card's width. */
export const OVERVIEW_CARD_WIDTH = 280;
/** The card's gap from the list area's edge: `right-3 top-3`. */
export const OVERVIEW_CARD_GAP = 12;
/** T3's `DETAILS_CARD_CLEARANCE`: the column's edge to the card's. */
export const OVERVIEW_CARD_CLEARANCE = 32;
/** The narrowest column the card may leave beside it (round 21). */
const MIN_DOCKED_COLUMN = 560;

/** 324: how far the rows' right edge stays from the list area's right edge
 *  while the card is docked, so they keep T3's 32px clear of it. */
export const DOCKED_LANE_CLEARANCE = OVERVIEW_CARD_WIDTH + OVERVIEW_CARD_GAP + OVERVIEW_CARD_CLEARANCE;

/** 884: the narrowest list the card docks beside, 560 + 324. */
export const OVERVIEW_DOCK_MIN_WIDTH = MIN_DOCKED_COLUMN + DOCKED_LANE_CLEARANCE;

/** Whether the card docks: while the list less the card's 324px keeps the
 *  560px column (`listWidth - 324 >= 560`). Never beside an open inspector:
 *  the list is the narrow column then, and the inspector already holds the
 *  right edge. A list not yet measured (0, as under happy-dom) does not
 *  dock. */
export function shouldDockOverview(listWidth: number, inspectorOpen: boolean): boolean {
  return listWidth >= OVERVIEW_DOCK_MIN_WIDTH && !inspectorOpen;
}
