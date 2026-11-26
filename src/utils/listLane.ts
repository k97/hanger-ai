/**
 * The centred lane a pane's list sits in, on Global and on a repository
 * (Tasks 1 and 4 of docs/plans/2026-11-26-global-list.md), after T3 Code's
 * chat column (`.chat-content-lane`, index.css:979-984): at most 736px, with
 * 48px padding while there is room and 12px once there is not.
 */

/** Below this lane area the padding drops from 48px to 12px, and the tick
 *  marks, which need that margin, go (T3's `minChatWidth`,
 *  chatCanvasLayout.ts). */
export const LANE_MIN_WIDTH = 640;

/** The list's inset from the pane's edge (`mx-[18px]`, `px-[18px]`). */
export const LIST_INSET = 18;

/** The lane's classes. A literal per width, because Tailwind reads classes
 *  as text. */
export const laneClass = (wide: boolean) => `mx-auto w-full max-w-[736px] ${wide ? "px-12" : "px-3"}`;

/** Whether a lane with this much room keeps its 48px padding. A pane not yet
 *  measured (0, as under happy-dom) counts as wide. */
export function laneIsWide(paneWidth: number, laneArea: number): boolean {
  return paneWidth === 0 || laneArea >= LANE_MIN_WIDTH;
}
