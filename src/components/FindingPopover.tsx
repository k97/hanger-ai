import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";

/**
 * The finding popover: what is behind a count, and what to do about it
 * (Karthik, 2026-08-23). Drawn once here for its two anchors — the 26px
 * FindingChip in the inspector cap and the 30px Needs review pill in the
 * strip. The panel clamps to a surface rather than being hand-placed
 * (see FindingChip's original note): it measures its own box, shifts back
 * inside `clampTo` and moves the arrow by the same amount.
 */
export interface FindingLine {
  severity: "warning" | "danger";
  text: string;
  detail?: string;
}

export interface FindingPopoverProps {
  open: boolean;
  onClose: () => void;
  lines: FindingLine[];
  /** The caller's action row — a miniSetClass of mini buttons. */
  actions?: ReactNode;
  align: "left" | "right";
  elevated: boolean;
  clampTo: RefObject<HTMLElement | null>;
  /** The trigger's own root, for outside-click detection. */
  anchorRef: RefObject<HTMLElement | null>;
  ariaLabel: string;
  /** Offset from the anchor's bottom edge. The chip is 26px tall and rests
   *  at 30px (a 4px gap); the strip's pill is 30px and passes 34. */
  top?: number;
}

const REST = 14;
const ARROW_REST = 30;
const POP_MARGIN = 12;

export default function FindingPopover({ open, onClose, lines, actions, align, elevated, clampTo, anchorRef, ariaLabel, top = 30 }: FindingPopoverProps) {
  const [shift, setShift] = useState(0);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) onClose();
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

  // Clamp once the box exists. A zero-size rect (no layout, as under a test
  // runner) means there is nothing to correct. A right-aligned panel clamps
  // against the host's LEFT edge instead.
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
    const h = host.getBoundingClientRect();
    const over = align === "left" ? r.right + shift - (h.right - POP_MARGIN) : h.left + POP_MARGIN - (r.left - shift);
    setShift(over > 0 ? over : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clampTo, align]);

  if (!open) return null;

  // Cast each branch on its own, not the ternary as a whole: a union of two
  // differently-shaped object literals (left vs. right present) does not
  // "sufficiently overlap" CSSProperties as a single assertion under this
  // csstype version, even though each individual literal does.
  const style: CSSProperties =
    align === "left"
      ? ({ top: `${top}px`, left: `${-REST - shift}px`, "--arrow": `${ARROW_REST + shift}px` } as CSSProperties)
      : ({ top: `${top}px`, right: `${-REST - shift}px`, "--arrow": `${ARROW_REST + shift}px` } as CSSProperties);
  const arrow = align === "left" ? "before:left-[var(--arrow)]" : "before:right-[var(--arrow)]";
  const side = align === "left" ? "left-[-14px]" : "right-[-14px]";

  return (
    <div
      ref={popRef}
      role="dialog"
      aria-label={ariaLabel}
      data-testid="finding-popover"
      style={style}
      className={`absolute z-40 w-[264px] p-3 flex flex-col gap-2.5 bg-page border border-line rounded-inner ${side} before:content-[''] before:absolute before:-top-1.5 ${arrow} before:w-2.5 before:h-2.5 before:bg-page before:border-l before:border-t before:border-line before:rotate-45 ${
        elevated ? "shadow-overlay" : ""
      }`}
    >
      {/* 240px with its own scroll, the cap `DisclosureBanner.tsx:88-89` gave
          the bodies that moved in here (DESIGN.md's Scroll caps entry records
          it as stated behaviour; a section name does not go stale the way the
          line number this cited did). These lists are unbounded in principle —
          one root can raise dozens of scan warnings. The cap is on the list,
          not the panel, so the action row below stays visible while it
          scrolls. */}
      <ul className="flex flex-col max-h-[240px] overflow-y-auto">
        {lines.map((line, i) => (
          <li key={i} data-testid="finding-popover-line" className={`flex items-start gap-2 text-small leading-[1.5] ${i > 0 ? "mt-2.5 pt-2.5 border-t border-line" : ""}`}>
            <i aria-hidden="true" className={`mt-[5px] w-2 h-2 rounded-pill shrink-0 not-italic ${line.severity === "danger" ? "bg-state-danger" : "bg-state-warning"}`} />
            <span className="min-w-0">
              {line.text}
              {line.detail && <span className="block text-micro font-mono text-ink-3 break-all">{line.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
      {actions}
    </div>
  );
}
