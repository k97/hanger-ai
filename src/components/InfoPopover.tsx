import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { InformationCircleIcon } from "./icons";

interface InfoPopoverProps {
  /** The trigger's accessible name, and what a screen reader announces before
   *  the note itself. */
  label: string;
  /** The note. Prose, not controls — nothing in here is focusable. */
  children: ReactNode;
}

/**
 * A footnote that stays out of the way until it is asked for.
 *
 * The ledgers it sits beside carry a sentence or two explaining how their
 * figures were derived — true, worth having, and read once. Left on the page
 * that prose outweighs the numbers it qualifies; behind this it is one glyph
 * until someone wants it.
 *
 * Deliberately not `Tooltip`: that one is `whitespace-nowrap` and opens on
 * hover, which suits a control's name and nothing longer. A paragraph needs
 * to wrap, and needs to stay put while it is read — so this opens on click
 * and dismisses the way `OverflowMenu` does, on Escape or an outside
 * pointerdown. The panel wears that same surface: page fill, --line border,
 * --radius-inner, the overlay elevation and `animate-tip`.
 */
export default function InfoPopover({ label, children }: InfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  // Two ledgers render at once on a multi-spec server, so the id that ties a
  // trigger to its own prose cannot be a constant.
  const noteId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

  return (
    <span ref={rootRef} className="relative inline-block shrink-0 leading-none">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? noteId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={`block p-1 -m-1 rounded-pill text-ink-3 hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover cursor-pointer ${
          open ? "bg-plane-2 text-ink-1" : ""
        }`}
      >
        <InformationCircleIcon size={14} aria-hidden="true" />
      </button>
      {open && (
        <span
          id={noteId}
          role="note"
          className="absolute right-0 top-[calc(100%+8px)] z-[20] block w-[276px] p-3 normal-case tracking-normal text-left bg-page border border-line rounded-inner shadow-overlay origin-top-right animate-tip font-flex text-micro font-normal text-ink-2 leading-[1.5]"
        >
          {children}
        </span>
      )}
    </span>
  );
}
