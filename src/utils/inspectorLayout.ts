/**
 * The inspector panel's resize geometry, as pure functions.
 *
 * Previously a closure inside `handleInspectorResizeStart` in App.tsx clamped
 * the drag to a fixed 384-480px band. Removing the ceiling means the drag
 * now resists at main-content's own floor instead of a constant, and can
 * snap past that resistance into a fully expanded state. Isolating the math
 * here means App.tsx wires pointer events to it without owning the rules.
 */

/** The inspector's own floor. Below it the link flow's preview paths — the
 *  one thing the panel exists to show — truncate. Unchanged from the value
 *  App.tsx has clamped to since the panel shipped. */
export const INSPECTOR_MIN_WIDTH = 384;

/** The narrowest main-content column the panes are laid out for. Below it
 *  main scrolls horizontally rather than shrinking further (Task 2). Derived
 *  from the table's own narrowest container breakpoint (`@[460px]`,
 *  AssetHeaderRow.tsx) plus its 36px of margins; Karthik will tune it on
 *  screen, so it lives here as one named value. */
export const MAIN_MIN_WIDTH = 520;

/** How far past the resist point a drag must go before the inspector snaps
 *  to fully expanded. */
export const EXPAND_SNAP_MARGIN = 60;

export interface InspectorFit {
  /** The width to render, and the width to return to when leaving the
   *  expanded state. */
  width: number;
  /** Whether this drag has crossed into the fully expanded state — the same
   *  state the inspector cap's Expand/Collapse button toggles. */
  expanded: boolean;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/**
 * The ceiling a drag resists at: the widest the inspector can be while
 * main-content still has its floor. Never below INSPECTOR_MIN_WIDTH — when
 * the window cannot hold both, the inspector keeps its floor and main
 * scrolls instead.
 *
 * @param room  window width minus the left edge of the main column minus
 *              MAIN_MIN_WIDTH. May be negative on a very small window.
 */
export function inspectorCeiling(room: number): number {
  return Math.max(INSPECTOR_MIN_WIDTH, room);
}

/**
 * What a drag in progress means.
 *
 * @param pointerWidth  the width the pointer is asking for (the distance
 *                      from the pointer to the window's right edge)
 * @param room          as above
 */
export function resolveInspectorDrag(pointerWidth: number, room: number): InspectorFit {
  const ceiling = inspectorCeiling(room);
  if (pointerWidth >= ceiling + EXPAND_SNAP_MARGIN) {
    return { width: Math.round(ceiling), expanded: true };
  }
  return { width: Math.round(clamp(pointerWidth, INSPECTOR_MIN_WIDTH, ceiling)), expanded: false };
}

/**
 * What to render for a width the user chose earlier — a persisted
 * preference, or the same width after the window changed size.
 *
 * Never returns the expanded state: a window that shrank is not a gesture.
 * The stored width is the user's intent and is left alone; this only decides
 * what fits right now, so widening the window again restores it.
 */
export function refitInspectorWidth(intent: number, room: number): number {
  return Math.round(clamp(intent, INSPECTOR_MIN_WIDTH, inspectorCeiling(room)));
}
