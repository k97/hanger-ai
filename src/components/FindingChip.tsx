import { useRef, useState, type RefObject } from "react";
import { miniBtnClass, miniSetClass } from "./miniButton";
import FindingPopover from "./FindingPopover";

export interface FindingChipProps {
  severity: "warning" | "danger";
  lines: string[];
  onReview: () => void;
  elevated: boolean;
  clampTo: RefObject<HTMLElement | null>;
}

/** A finding is a chip with a popover (Karthik, 2026-08-23) — see
 *  FindingPopover for the panel; this is the 26px trigger. */
export default function FindingChip({ severity, lines, onReview, elevated, clampTo }: FindingChipProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const dot = severity === "danger" ? "bg-state-danger" : "bg-state-warning";
  return (
    <span ref={rootRef} className="relative inline-flex">
      <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={`${miniBtnClass} ${open ? "bg-plane-2" : ""}`}>
        <i aria-hidden="true" className={`w-2 h-2 rounded-pill shrink-0 not-italic ${dot}`} />
        <span>{lines.length} flagged</span>
      </button>
      <FindingPopover
        open={open}
        onClose={() => setOpen(false)}
        lines={lines.map((text) => ({ severity, text }))}
        align="left"
        elevated={elevated}
        clampTo={clampTo}
        anchorRef={rootRef}
        ariaLabel={`${lines.length} flagged`}
        actions={
          <div className={miniSetClass}>
            <button type="button" onClick={onReview} className={miniBtnClass}>Needs review →</button>
          </div>
        }
      />
    </span>
  );
}
