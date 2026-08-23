import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { miniBtnClass, miniSetClass } from "./miniButton";

/**
 * A finding is a chip with a popover (Karthik, 2026-08-23). The chip says
 * "this wants a decision" and is the thing you click; the popover says what,
 * once, and routes every finding to Needs review (docs/findings.md F34).
 * The dot carries the verdict's severity; the count, when drawn, says how
 * much is behind the chip before it opens.
 *
 * The popover clamps to a surface rather than being hand-placed: anchored to
 * the chip, a 264px panel runs past a 300px placecard, so it measures its own
 * box, shifts back inside and moves the arrow by the same amount so the
 * arrow still points at the chip — Tooltip.tsx's correction against the
 * window, here against the caller's container.
 */

export interface FindingChipProps {
  count?: number;
  severity: "warning" | "danger";
  lines: string[];
  onReview: () => void;
  elevated: boolean;
  clampTo: RefObject<HTMLElement | null>;
}

/** The popover's resting offset from the chip and its arrow's resting inset. */
const REST_LEFT = 14;
const ARROW_REST = 30;
const POP_MARGIN = 12;

export default function FindingChip({ count, severity, lines, onReview, elevated, clampTo }: FindingChipProps) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const rootRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Clamp against the caller's surface once the box exists. A zero-size rect
  // (no layout, as under a test runner) means there is nothing to correct.
  useLayoutEffect(() => {
    if (!open) {
      setShift(0);
      return;
    }
    const pop = popRef.current;
    const host = clampTo.current;
    if (!pop || !host) return;
    const r = pop.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    const over = r.right + shift - (host.getBoundingClientRect().right - POP_MARGIN);
    setShift(over > 0 ? over : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clampTo]);

  const dot = severity === "danger" ? "bg-state-danger" : "bg-state-warning";
  const popStyle = {
    left: `${-REST_LEFT - shift}px`,
    "--arrow": `${ARROW_REST + shift}px`,
  } as CSSProperties;

  return (
    <span ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`${miniBtnClass} ${open ? "bg-plane-2" : ""}`}
      >
        <i aria-hidden="true" className={`w-2 h-2 rounded-pill shrink-0 not-italic ${dot}`} />
        <span>Review</span>
        {count !== undefined && <span className="tabular text-ink-3">{count}</span>}
      </button>
      {open && (
        <div
          ref={popRef}
          role="dialog"
          aria-label="Needs a decision"
          data-testid="finding-popover"
          style={popStyle}
          className={`absolute top-[30px] z-40 w-[264px] p-3 flex flex-col gap-2.5 bg-page border border-line rounded-inner before:content-[''] before:absolute before:-top-1.5 before:left-[var(--arrow)] before:w-2.5 before:h-2.5 before:bg-page before:border-l before:border-t before:border-line before:rotate-45 ${
            elevated ? "shadow-overlay" : ""
          }`}
        >
          <ul className="flex flex-col">
            {lines.map((line, i) => (
              <li key={i} className={`text-small leading-[1.5] ${i > 0 ? "mt-2.5 pt-2.5 border-t border-line" : ""}`}>
                {line}
              </li>
            ))}
          </ul>
          <div className={miniSetClass}>
            <button type="button" onClick={onReview} className={miniBtnClass}>
              Review →
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
