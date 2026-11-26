import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/** The gap between the anchor's bottom edge and the panel. */
const GAP = 6;

export interface OverviewPopoverProps {
  open: boolean;
  onClose: () => void;
  /** The window-bar button the panel hangs under. A pointerdown on it is
   *  not "outside": the button's own click toggles the card. */
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}

/**
 * The overview card's window-bar popover (Task 5 of
 * docs/plans/2026-11-26-overview-card.md). Portalled to `document.body` and
 * `position: fixed`, right-aligned under its anchor, so no column's overflow
 * clips it. Esc closes it, and so does a pointerdown outside both the panel
 * and the anchor. It opens and closes with no animation.
 */
export default function OverviewPopover({ open, onClose, anchorRef, children }: OverviewPopoverProps) {
  const popRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top: number; right: number } | null>(null);

  // Measured once per opening, from the anchor's box. A zero rect (no
  // layout, as under a test runner) still places it at the top right.
  useLayoutEffect(() => {
    if (!open) return;
    const a = anchorRef.current;
    if (!a) return;
    const r = a.getBoundingClientRect();
    setPlace({ top: r.bottom + GAP, right: Math.max(0, window.innerWidth - r.right) });
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return createPortal(
    <div
      ref={popRef}
      role="dialog"
      aria-label="Overview"
      data-testid="overview-popover"
      style={place ? { top: `${place.top}px`, right: `${place.right}px` } : undefined}
      className="fixed z-50 w-[350px] bg-page rounded-plane shadow-overlay"
    >
      {children}
    </div>,
    document.body
  );
}
