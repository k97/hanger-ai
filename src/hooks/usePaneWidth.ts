import { useLayoutEffect, useState } from "react";

/**
 * A pane's width, from one ResizeObserver on it (Tasks 2 and 4 of
 * docs/plans/2026-11-26-global-list.md): it decides the list lane's padding,
 * and on Global whether the overview card docks. Give it the pane element
 * once it mounts (a callback ref into state). A zero width is happy-dom, or
 * a pane not yet laid out: no answer, so the last width stands and the
 * first is 0.
 */
export function usePaneWidth(paneEl: HTMLElement | null): number {
  const [paneWidth, setPaneWidth] = useState(0);
  useLayoutEffect(() => {
    if (!paneEl) return;
    const apply = (width: number) => {
      if (width > 0) setPaneWidth(width);
    };
    apply(paneEl.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => apply(entries[0]?.contentRect.width ?? 0));
    observer.observe(paneEl);
    return () => observer.disconnect();
  }, [paneEl]);
  return paneWidth;
}
