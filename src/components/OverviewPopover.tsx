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
 * clips it. Esc closes it, unless something open inside it took the Esc
 * first, and so does a pointerdown outside both the panel and the anchor. It
 * opens and closes with no animation.
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
    // Esc goes to the innermost thing open. Everything that opens inside
    // the card (FindingPopover, a menu, a tip) takes Esc in the capture
    // phase on `window` and marks it handled, so it has run by the time this
    // sees it, and this skips it. This listens in the bubble phase on
    // `document`, which a key event reaches after the window's capture
    // listeners and before its bubble ones: App's Esc (which clears
    // Global's selection) is a window bubble listener, so it runs after this
    // and skips the Esc this marks. Registration order never decides it: App
    // adds its listener at mount, before this one exists.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
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
