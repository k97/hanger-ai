import { useEffect, useRef, useState, type ReactNode } from "react";

export const menuLabelClass =
  "font-flex text-micro tracking-[.06em] uppercase text-ink-3 px-1.5 pt-1 pb-1";

export const menuItemClass =
  "w-full h-7 px-1.5 rounded-soft flex items-center justify-between font-flex text-small text-ink-1 hover:bg-plane-2 transition-colors duration-hover cursor-pointer";

export const menuActionClass =
  "w-full h-8 px-2.5 rounded-soft flex items-center gap-2.5 text-small text-ink-1 hover:bg-plane-2 transition-colors duration-hover cursor-pointer text-left";

/** A divider between menu sections. */
export function MenuSeparator() {
  return <div role="separator" className="h-px mx-1.5 my-1 bg-line" />;
}

export interface OverflowMenuProps {
  /** The trigger, rendered by the caller; receives the props it must spread. */
  trigger: (props: { "aria-haspopup": "menu"; "aria-expanded": boolean; onClick: () => void }) => ReactNode;
  /** `role="menu"`'s accessible name. */
  ariaLabel: string;
  /** Which edge the panel hangs from. ViewControl opens from its left edge;
   *  the cap's ⋮ opens from its right, inward, because the aside clips. */
  align: "left" | "right";
  /** Closes the menu; the caller's items call it after acting. */
  children: (close: () => void) => ReactNode;
  /** Panel width: ViewControl keeps w-[224px], the cap's menu is min-w-[184px]. */
  className?: string;
  "data-testid"?: string;
}

/**
 * The reusable popover behind `ViewControl`'s "View" control and the
 * inspector cap's ⋮ overflow: a trigger the caller renders, and a flat panel
 * beneath it — `shadow-overlay`, `rounded-inner`, `animate-tip` — that opens
 * on click and closes on Escape, an outside pointerdown, or an item calling
 * the `close` callback it is handed.
 */
export default function OverflowMenu({
  trigger,
  ariaLabel,
  align,
  children,
  className,
  "data-testid": dataTestId,
}: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
    <div ref={rootRef} className="relative inline-block shrink-0 font-sans">
      {trigger({
        "aria-haspopup": "menu",
        "aria-expanded": open,
        onClick: () => setOpen((v) => !v),
      })}
      {open && (
        <div
          data-testid={dataTestId}
          role="menu"
          aria-label={ariaLabel}
          className={`absolute top-[calc(100%+6px)] z-[20] bg-page border border-line rounded-inner p-1 shadow-overlay origin-top-left animate-tip ${align === "left" ? "left-0" : "right-0"} ${className ?? ""}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
