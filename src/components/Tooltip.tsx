import { useEffect, useRef, useState, type ReactNode } from "react";

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
export default function Tooltip({ label, placement = "right", children }: TooltipProps) {
  const anchor = useRef<HTMLSpanElement>(null);
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
            className={`block whitespace-nowrap bg-fill text-on-fill font-flex text-micro px-2 py-1 rounded-[6px] ${
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
