/**
 * Where Global's overview card goes: docked at the list's top right, or
 * behind its window-bar button as a popover (Task 2 of
 * docs/plans/2026-11-26-global-list.md; round 16 q2: the app decides, as T3
 * Code does, and the pin goes). T3's numbers, from
 * `threadDetailsCardLayout.ts` and `chatCanvasLayout.ts`: a 280px card, 12px
 * from the edge, a column at least 640px wide that keeps 32px clear of it,
 * and 48px of padding either side of the column.
 */

/** The card's width. */
export const OVERVIEW_CARD_WIDTH = 280;
/** The card's gap from the list area's edge: `right-3 top-3`. */
export const OVERVIEW_CARD_GAP = 12;
/** T3's `DETAILS_CARD_CLEARANCE`: the column's edge to the card's. */
export const OVERVIEW_CARD_CLEARANCE = 32;
/** T3's `minChatWidth`, and the lane's own narrow break (ProfilePane). */
const MIN_COLUMN = 640;
/** The lane's padding, either side (`px-12`). */
const LANE_PADDING = 48;

/** 1060: the narrowest list the card docks beside. */
export const OVERVIEW_DOCK_MIN_WIDTH =
  MIN_COLUMN + OVERVIEW_CARD_WIDTH + OVERVIEW_CARD_GAP + OVERVIEW_CARD_CLEARANCE + 2 * LANE_PADDING;

/** 324: how far the rows' right edge stays from the list area's right edge
 *  while the card is docked, so they keep T3's 32px clear of it. */
export const DOCKED_LANE_CLEARANCE = OVERVIEW_CARD_WIDTH + OVERVIEW_CARD_GAP + OVERVIEW_CARD_CLEARANCE;

/** Whether the card docks. Never beside an open inspector: the list is the
 *  narrow column then, and the inspector already holds the right edge. A
 *  list not yet measured (0, as under happy-dom) does not dock. */
export function shouldDockOverview(listWidth: number, inspectorOpen: boolean): boolean {
  return listWidth >= OVERVIEW_DOCK_MIN_WIDTH && !inspectorOpen;
}
