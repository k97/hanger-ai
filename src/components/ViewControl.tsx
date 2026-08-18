import { useEffect, useRef, useState } from "react";
import { CheckIcon, ChevronDownIcon } from "./icons";

/** Card rows have no clickable column headers, so the MCP section's grouping
 *  and sort live here instead of in `AssetHeaderRow` (spec §5.6: "the
 *  Display control ... owns grouping and sort, so the chip row stays a
 *  filter line and nothing else"). Every other category keeps its header. */
export type ServerGrouping = "server" | "registration";
/** "tools" (Tools, most first) is not offered: no field anywhere carries a
 *  per-server tool count (that needs a live protocol handshake, which this
 *  stage does not do), and Karthik signed off that option assuming data
 *  existed behind it. An option that always degrades to name order is worse
 *  than an absent one. Restore it once Task 8's persisted probe results
 *  (keyed by launch hash) give it something real to sort by. */
export type ServerSort = "attention" | "name";

interface ViewControlProps {
  grouping: ServerGrouping;
  sort: ServerSort;
  onGroupingChange: (grouping: ServerGrouping) => void;
  onSortChange: (sort: ServerSort) => void;
}

/** Copy signed off 2026-08-18 — verbatim. */
const ROWS_OPTIONS: { value: ServerGrouping; label: string }[] = [
  { value: "server", label: "One per server" },
  { value: "registration", label: "One per registration" },
];

const SORT_OPTIONS: { value: ServerSort; label: string }[] = [
  { value: "attention", label: "Needs attention first" },
  { value: "name", label: "Name" },
];

const triggerClass =
  "h-7 px-3.5 rounded-pill border border-line-2 font-flex text-small text-ink-2 inline-flex items-center gap-1.5 cursor-pointer transition-colors duration-nav ease-spring hover:bg-plane-2";

const menuLabelClass =
  "font-flex text-micro tracking-[.06em] uppercase text-ink-3 px-1.5 pt-1 pb-1";

const menuItemClass =
  "w-full h-7 px-1.5 rounded-soft flex items-center justify-between font-flex text-small text-ink-1 hover:bg-plane-2 transition-colors duration-hover cursor-pointer";

/**
 * "The Display control" of spec §5.6, signed off as "View". A trigger pill
 * plus a flat panel beneath it — same anatomy as the link map's layers
 * panel (`LinkMapPane.tsx`: `shadow-overlay`, `rounded-soft` rows, a
 * `tracking-[.06em]` section label) so a second popover in this app doesn't
 * invent a second visual language for the same idea.
 *
 * `animate-tip` reuses the tooltip's "nothing appears from nothing" scale —
 * the only entrance motion this design system has for a surface that opens
 * beside its own trigger rather than falling from the title bar or rising
 * from the foot.
 */
export default function ViewControl({ grouping, sort, onGroupingChange, onSortChange }: ViewControlProps) {
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
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={triggerClass}
      >
        <span>View</span>
        <ChevronDownIcon size={12} className="shrink-0" aria-hidden="true" />
      </button>
      {open && (
        <div
          data-testid="view-control-panel"
          role="menu"
          aria-label="View"
          className="absolute right-0 top-[calc(100%+6px)] z-[20] w-[224px] bg-page border border-line rounded-inner p-1.5 shadow-overlay origin-top-right animate-tip"
        >
          <div className={menuLabelClass}>Rows</div>
          {ROWS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="menuitemradio"
              aria-checked={grouping === opt.value}
              onClick={() => {
                onGroupingChange(opt.value);
                setOpen(false);
              }}
              className={menuItemClass}
            >
              {opt.label}
              {grouping === opt.value && <CheckIcon size={12} aria-hidden="true" />}
            </button>
          ))}

          <div className="border-t border-line my-1.5" />

          <div className={menuLabelClass}>Sort</div>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="menuitemradio"
              aria-checked={sort === opt.value}
              onClick={() => {
                onSortChange(opt.value);
                setOpen(false);
              }}
              className={menuItemClass}
            >
              {opt.label}
              {sort === opt.value && <CheckIcon size={12} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
