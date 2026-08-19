import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

type Placement = "right" | "bottom";

/**
 * Shared across every instance. Once the user has seen one tip, the next one
 * opens immediately and without animation — after the first, the delay has
 * already done its job of filtering out a passing cursor, and re-imposing it
 * makes a row of controls feel sticky.
 */
let lastDismissedAt = 0;
const OPEN_DELAY_MS = 80;
const CHAIN_WINDOW_MS = 320;

interface TooltipProps {
  /** The control's name. The child carries the same string as its aria-label,
   *  so the tip itself is hidden from assistive tech rather than repeating it. */
  label: string;
  placement?: Placement;
  children: ReactNode;
}

interface Tip {
  top: number;
  left: number;
  instant: boolean;
}

/**
 * A tooltip for icon-only controls.
 *
 * Native `title` would be free, but in a desktop window it arrives after about
 * a second, in the operating system's own type and colour. This one arrives in
 * 80ms wearing the app's type, and positions itself with `fixed` so the
 * shell's overflow-hidden columns cannot clip it.
 */
/** Kept clear of the window edge on every side once the tip's real size is known. */
const EDGE_MARGIN = 8;

export default function Tooltip({ label, placement = "right", children }: TooltipProps) {
  const anchor = useRef<HTMLSpanElement>(null);
  const tipEl = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  const place = (instant: boolean) => {
    const el = (anchor.current?.firstElementChild as HTMLElement | null) ?? anchor.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setTip(
      placement === "right"
        ? { top: r.top + r.height / 2, left: r.right + 8, instant }
        : { top: r.bottom + 8, left: r.left + r.width / 2, instant }
    );
  };

  const show = () => {
    clearTimer();
    if (Date.now() - lastDismissedAt < CHAIN_WINDOW_MS) {
      place(true);
      return;
    }
    timer.current = setTimeout(() => place(false), OPEN_DELAY_MS);
  };

  const hide = () => {
    clearTimer();
    setTip((current) => {
      if (current) lastDismissedAt = Date.now();
      return null;
    });
  };

  // A tip is not a dialog, but Escape should still dismiss it — the pointer may
  // be parked over a control the user has stopped caring about.
  useEffect(() => {
    if (!tip) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tip]);

  // `place()` guesses from the anchor alone, before the tip's own width
  // exists in the DOM. A control near the window edge — the toolbar's
  // right-hand icons, an inspector row's trailing button — guesses a box
  // that runs past the edge and gets clipped by the window itself; nothing
  // here is z-index, `fixed` just paints wherever it is told. This corrects
  // the guess against the real box once it has rendered, before paint.
  useLayoutEffect(() => {
    if (!tip || !tipEl.current) return;
    const r = tipEl.current.getBoundingClientRect();
    // jsdom never lays out, so every rect measures 0x0 at (0,0) — that would
    // read as "off the top-left edge" and clamp forever. A real tip always
    // has size once painted, so a zero box means there is nothing to correct.
    if (r.width === 0 && r.height === 0) return;
    const dx =
      r.right > window.innerWidth - EDGE_MARGIN
        ? window.innerWidth - EDGE_MARGIN - r.right
        : r.left < EDGE_MARGIN
        ? EDGE_MARGIN - r.left
        : 0;
    const dy =
      r.bottom > window.innerHeight - EDGE_MARGIN
        ? window.innerHeight - EDGE_MARGIN - r.bottom
        : r.top < EDGE_MARGIN
        ? EDGE_MARGIN - r.top
        : 0;
    if (dx !== 0 || dy !== 0) {
      setTip((current) => (current ? { ...current, left: current.left + dx, top: current.top + dy } : current));
    }
  }, [tip]);

  return (
    <span
      ref={anchor}
      className="contents"
      onPointerEnter={show}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {tip && (
        <span
          ref={tipEl}
          style={{
            top: tip.top,
            left: tip.left,
            transform: placement === "right" ? "translateY(-50%)" : "translateX(-50%)",
          }}
          className="fixed z-[200] pointer-events-none"
        >
          <span
            data-testid="tooltip"
            aria-hidden="true"
            className={`block whitespace-nowrap normal-case bg-fill text-on-fill font-flex text-micro px-2 py-1 rounded-[6px] ${
              placement === "right" ? "origin-left" : "origin-top"
            } ${tip.instant ? "" : "animate-tip"}`}
          >
            {label}
          </span>
        </span>
      )}
    </span>
  );
}
