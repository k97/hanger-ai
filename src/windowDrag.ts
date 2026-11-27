import { invoke } from "@tauri-apps/api/core";
import type { MouseEvent as ReactMouseEvent } from "react";

/* Window dragging from the title band.
 *
 * The caps used `data-tauri-drag-region`, whose drag.js asks Rust to drag
 * after the press has already been dispatched; on macOS the Window Server then
 * has no mouse-down to drag from and most drags did nothing (window_drag.rs
 * has the measurements). The caps now call `start_window_drag`, which drags
 * with the genuine press, cached natively as it arrived. The rules for what
 * may start a drag are drag.js's, kept here so nothing the user expects to
 * click turns into a window drag.
 */

const CLICKABLE_TAGS = new Set(["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "LABEL", "SUMMARY"]);
const INTERACTIVE_ROLES = new Set(["button", "link", "menuitem", "tab", "checkbox", "radio", "switch", "option"]);

function isControl(el: HTMLElement): boolean {
  return (
    CLICKABLE_TAGS.has(el.tagName) ||
    (el.hasAttribute("contenteditable") && el.getAttribute("contenteditable") !== "false") ||
    (el.hasAttribute("tabindex") && el.getAttribute("tabindex") !== "-1") ||
    INTERACTIVE_ROLES.has(el.getAttribute("role") ?? "")
  );
}

/** Whether a press on `target` inside the cap `row` should move the window:
 *  nothing between them is a control or opts out with
 *  `data-tauri-drag-region="false"`. A target outside the row in the DOM —
 *  a portalled popup whose React events still bubble here — never drags. */
export function pressMovesWindow(target: EventTarget | null, row: Element): boolean {
  for (let el = target instanceof Element ? target : null; el; el = el.parentElement) {
    if (el instanceof HTMLElement && (isControl(el) || el.getAttribute("data-tauri-drag-region") === "false")) {
      return false;
    }
    if (el === row) return true;
  }
  return false;
}

// Double-click zooms, as drag.js did on macOS: on the second press's release,
// and only if the pointer has not moved, so a press-and-drag never zooms.
let zoomFrom: { x: number; y: number } | null = null;

/** The cap row's `onMouseDown`. */
export function onCapMouseDown(e: ReactMouseEvent<HTMLElement>): void {
  if (e.button !== 0 || !pressMovesWindow(e.target, e.currentTarget)) return;
  if (e.detail === 2) {
    zoomFrom = { x: e.clientX, y: e.clientY };
    return;
  }
  zoomFrom = null;
  e.preventDefault(); // no text cursor or selection from the press
  void invoke("start_window_drag");
}

/** The cap row's `onMouseUp`. */
export function onCapMouseUp(e: ReactMouseEvent<HTMLElement>): void {
  const from = zoomFrom;
  zoomFrom = null;
  if (e.button !== 0 || e.detail !== 2 || !from || from.x !== e.clientX || from.y !== e.clientY) return;
  if (!pressMovesWindow(e.target, e.currentTarget)) return;
  void invoke("plugin:window|internal_toggle_maximize");
}
