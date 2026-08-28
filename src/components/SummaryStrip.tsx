import { useRef, useState, type ReactNode } from "react";
import { RotateCcwIcon } from "./icons";
import GelMeter from "./GelMeter";
import ScanStamp from "./ScanStamp";
import FindingPopover, { type FindingLine } from "./FindingPopover";
import { captionClass } from "./typeRoles";
import type { StateCounts, StateFilter, LinkState } from "../utils/linkStateCounts";

/** The strip's second mode: MCP. It replaces the entire link-state branch —
 *  meter and legend — with one caption line; `total`/`subtitle` still render
 *  as passed by the caller.
 *
 *  The probe-coverage meter it used to draw is gone (Karthik's ruling,
 *  2026-08-28): "answered / not yet asked / can't be asked" measured whether
 *  Hanger had ASKED each server, not whether anything was up, and it
 *  converges to a constant as the probes complete. */
export interface McpStripFigures {
  /** The caption under the headline, passed so the string lives with its
   *  caller's other strings. */
  caption: string;
}

/** What the Needs review pill says, and what its popover shows. One shape
 *  for both modes: the pill only opens the popover, and every action —
 *  filtering the list, routing to Needs review — is a button the caller
 *  puts inside it. */
export interface StripReview {
  /** The number of `lines` — counted where the lines are built, and
   *  allowlisted there, never derived here. */
  count: number;
  lines: FindingLine[];
  /** Mini buttons for the popover's action row; the caller decides. */
  actions?: ReactNode;
}

interface SummaryStripProps {
  /** Backend-owned asset total for the scope — never derived on the frontend. */
  total: number;
  subtitle: string;
  scannedAt: Date | null;
  scanning: boolean;
  counts: StateCounts;
  activeStateFilter: StateFilter;
  onFilterState: (filter: StateFilter) => void;
  /** Rescan lives here rather than in the toolbar: it is the control that
   *  changes the figure directly above it, and the strip already says how old
   *  that figure is. */
  onRescan?: () => void;
  /** MCP mode when given — see McpStripFigures. */
  mcp?: McpStripFigures;
  /** The Needs review pill, in either mode. Absent, or zero, draws nothing. */
  review?: StripReview;
  /** The hero band, rendered inside the section below the second row. */
  children?: ReactNode;
}

/* The meter is the design system's GelMeter. The aqua gel is the PROGRESS
   fill — it paints the linked share, so the bar fills aqua as assets get
   linked and an all-local store reads as quiet neutral glass, never as
   achievement. Drifted and broken keep their semantic colours under the
   same gloss; local is inert glass. */
const SEGMENTS: Array<{ state: LinkState; aqua?: boolean; barClass: string; dotClass: string; label: (n: number) => string }> = [
  { state: "linked", aqua: true, barClass: "", dotClass: "", label: () => "linked" },
  { state: "drifted", barClass: "bg-state-warning", dotClass: "bg-state-warning", label: () => "drifted" },
  { state: "broken", barClass: "bg-state-danger", dotClass: "bg-state-danger", label: () => "broken" },
  {
    state: "local",
    barClass: "",
    dotClass: "bg-transparent border-2 border-line-2",
    label: () => "local only",
  },
];

/** One large typographic anchor on the tinted plane. */
export default function SummaryStrip({
  total,
  subtitle,
  scannedAt,
  scanning,
  counts,
  activeStateFilter,
  onFilterState,
  onRescan,
  mcp,
  review,
  children,
}: SummaryStripProps) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const pillRef = useRef<HTMLSpanElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const barLabel = `${counts.linked} linked, ${counts.drifted} drifted, ${counts.broken} broken, ${counts.local} local only`;

  const toggle = (state: LinkState) =>
    onFilterState(activeStateFilter === state ? null : state);

  // Rescan is the one control both modes keep — unchanged in either.
  const rescanButton = onRescan && (
    <button
      onClick={onRescan}
      disabled={scanning}
      aria-label="Refresh scan"
      className="h-[30px] min-w-[108px] px-3.5 inline-flex items-center justify-center gap-2 rounded-pill border border-line-2 text-small font-medium text-ink-1 cursor-pointer transition-[background-color,transform] duration-hover ease-spring hover:bg-plane-2 active:scale-[0.96] disabled:opacity-50 disabled:cursor-default"
    >
      <RotateCcwIcon size={13} active={scanning} />
      {scanning ? "Scanning" : "Rescan"}
    </button>
  );

  // One pill for both modes. It opens the popover and does nothing else —
  // the needs-review preset that used to be its click is now an action the
  // caller puts inside, so the two modes' pills behave identically.
  const reviewPill = review && review.count > 0 && (
    <span ref={pillRef} className="relative inline-flex">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={reviewOpen}
        onClick={() => setReviewOpen((v) => !v)}
        className="h-[30px] px-[15px] inline-flex items-center text-small font-medium tabular bg-fill text-on-fill rounded-pill cursor-pointer transition-[transform] duration-press ease-spring hover:-translate-y-px active:scale-[0.96]"
      >
        Needs review {review.count}
      </button>
      {/* 34, not the default 30: the chip this popover was drawn for is 26px
          tall and rests at 30 for a 4px gap; the pill is 30px and wants the
          same gap. */}
      <FindingPopover
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        lines={review.lines}
        actions={review.actions}
        align="right"
        top={34}
        elevated
        clampTo={sectionRef}
        anchorRef={pillRef}
        ariaLabel={`Needs review ${review.count}`}
      />
    </span>
  );

  return (
    <section
      ref={sectionRef}
      aria-label="Inventory summary"
      // Background dropped by Karthik's ruling (2026-08-15): the hero sits
      // flat on the page; the --line border and radius still draw its edge.
      className="px-4 py-3.5 border border-line rounded-plane shrink-0"
    >
      <div className="flex items-baseline gap-3 mb-3">
        <span className="text-display font-medium tabular tracking-[-0.5px] leading-display text-ink-1">
          {total}
        </span>
        <span className="text-lg-app text-ink-2">{subtitle}</span>
        <ScanStamp scannedAt={scannedAt} className="ml-auto text-small text-ink-3 font-flex" />
      </div>

      {mcp ? (
        <div className="flex items-center gap-3 min-h-[30px]">
          <p className={`${captionClass} font-flex flex-1`}>{mcp.caption}</p>
          <div className="ml-auto flex items-center gap-2">
            {rescanButton}
            {reviewPill}
          </div>
        </div>
      ) : (
        <>
          {counts.total > 0 && (
            <GelMeter
              label={barLabel}
              segments={SEGMENTS.map(({ state, aqua, barClass }) => ({
                key: state,
                value: counts[state],
                barClass,
                aqua,
              }))}
            />
          )}

          <div className="flex items-center gap-4 mt-2.5 flex-wrap">
            {SEGMENTS.map(({ state, aqua, dotClass, label }) => (
              <button
                key={state}
                onClick={() => toggle(state)}
                aria-pressed={activeStateFilter === state}
                className={`flex items-center gap-2 text-small font-flex cursor-pointer transition-colors duration-hover ease-spring ${
                  activeStateFilter === state ? "text-ink-1" : "text-ink-2 hover:text-ink-1"
                }`}
              >
                <i
                  className={`w-2 h-2 rounded-pill shrink-0 ${dotClass}`}
                  style={aqua ? { backgroundImage: "var(--gel-aqua)" } : undefined}
                />
                <b className="font-medium tabular text-ink-1">{counts[state]}</b> {label(counts[state])}
              </button>
            ))}

            <div className="ml-auto flex items-center gap-2">
              {rescanButton}

              {reviewPill}
            </div>
          </div>
        </>
      )}

      {children}
    </section>
  );
}
