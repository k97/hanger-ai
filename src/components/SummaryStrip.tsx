import { Fragment, useId, useRef, useState, type ReactNode } from "react";
import { RotateCcwIcon } from "./icons";
import GelMeter from "./GelMeter";
import { useScanStampText } from "./ScanStamp";
import FindingPopover, { type FindingLine } from "./FindingPopover";
import { captionClass } from "./typeRoles";
import { miniBtnClass } from "./miniButton";
import type { StateCounts, StateFilter, LinkState } from "../utils/linkStateCounts";

/** One kind's share of an engine's budget: a button that opens that kind's
 *  tab. Every string arrives formatted from the caller (`switchCopy`). A
 *  segment with a figure or a caption is drawn whole; one with neither joins
 *  the quiet line, by its label (Q1 of
 *  docs/plans/2026-11-25-decisions-round-2.md). */
export interface StripSegment {
  key: string;
  /** The kind, by its tab's label. */
  label: string;
  /** "≈ 12,400", or "Not measured". */
  value: string;
  /** `false` for "Not measured", which recedes to --ink-3. */
  measured: boolean;
  /** The MCP segment's "M of K servers measured · J off". */
  caption?: string;
  /** Its tab is the one open. */
  pressed: boolean;
  onSelect: () => void;
}

/** The strip's second mode: Global seen by one engine
 *  (docs/plans/2026-11-25-ia-global-by-engine.md). It replaces the
 *  link-state branch — meter and legend — with the engine's budget by kind
 *  and Measure all; `total`/`subtitle` still render as passed by the caller,
 *  and Rescan and the pill stay. It replaced the MCP mode, whose caption was
 *  "Described to the model on every request, used or not." */
export interface EngineStripFigures {
  segments: StripSegment[];
  measuring: boolean;
  /** Absent for an engine with nothing Hanger can measure (every server
   *  runs on the vendor's, `runsOnVendorServersOnly`), when no Measure all
   *  is drawn. */
  onMeasure?: () => void;
  /** Measure all's tooltip and description (`MEASURE_ALL_CAPTION`). */
  measureCaption: string;
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
  /** Backend-owned asset total for the scope — never derived on the frontend.
   *  In engine mode a formatted figure ("≈ 12,400"), or `null` for none, when
   *  the numeral is left out and the subtitle carries the line alone. */
  total: number | string | null;
  subtitle: string;
  scannedAt: Date | null;
  scanning: boolean;
  counts: StateCounts;
  activeStateFilter: StateFilter;
  onFilterState: (filter: StateFilter) => void;
  /** Rescan lives here rather than in the toolbar: it is the control that
   *  changes the figure directly above it. Given, it also carries `scannedAt`
   *  as its tooltip — the age left the headline on 2026-08-29 and the foot
   *  line prints it now. */
  onRescan?: () => void;
  /** Engine mode when given — see EngineStripFigures. */
  engine?: EngineStripFigures;
  /** The Needs review pill, in either mode. Absent, or zero, draws nothing. */
  review?: StripReview;
  /** A project pane's hero band, rendered inside the section below the
   *  second row. Global's engine chips left this slot for a row above the
   *  strip (Q2 of docs/plans/2026-11-25-decisions-round-2.md). */
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

interface LinkStateLegendProps {
  /** Backend-owned, as the strip's own `counts`. */
  counts: StateCounts;
  active: StateFilter;
  /** A state, or `null` when the pressed one is pressed again. */
  onFilter: (filter: StateFilter) => void;
  /** Drawn at the end of the legend's row: the strip's Rescan and pill. */
  trailing?: ReactNode;
}

/**
 * The link-state meter and its legend: linked, drifted, broken, local only,
 * each a toggle that filters the list. One drawing for the two places that
 * show the store's link state — this strip with no engine picked, and the
 * overview card's store section (round 14 q2,
 * docs/plans/2026-11-26-decisions-round-14.md) — so the labels and the look
 * cannot drift apart.
 */
export function LinkStateLegend({ counts, active, onFilter, trailing }: LinkStateLegendProps) {
  const barLabel = `${counts.linked} linked, ${counts.drifted} drifted, ${counts.broken} broken, ${counts.local} local only`;
  const toggle = (state: LinkState) => onFilter(active === state ? null : state);
  return (
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
            aria-pressed={active === state}
            className={`flex items-center gap-2 text-small font-flex cursor-pointer transition-colors duration-hover ease-spring ${
              active === state ? "text-ink-1" : "text-ink-2 hover:text-ink-1"
            }`}
          >
            <i
              className={`w-2 h-2 rounded-pill shrink-0 ${dotClass}`}
              style={aqua ? { backgroundImage: "var(--gel-aqua)" } : undefined}
            />
            <b className="font-medium tabular text-ink-1">{counts[state]}</b> {label(counts[state])}
          </button>
        ))}

        {trailing}
      </div>
    </>
  );
}

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
  engine,
  review,
  children,
}: SummaryStripProps) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const pillRef = useRef<HTMLSpanElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const stampText = useScanStampText(scannedAt);
  const measureCaptionId = useId();
  // A kind is drawn whole when it has a figure or a caption; the rest share
  // the quiet line. A partition of the caller's list — nothing is counted.
  const drawnWhole = (seg: StripSegment) => seg.measured || seg.caption !== undefined;
  const figured = engine ? engine.segments.filter(drawnWhole) : [];
  const unfigured = engine ? engine.segments.filter((seg) => !drawnWhole(seg)) : [];

  // Rescan is the one control both modes keep — unchanged in either. Its
  // tooltip is the age of the figure above it: the stamp that used to print
  // that age in the headline moved to the foot line on 2026-08-29 (Karthik's
  // ruling), and the control that changes the figure is where the age stays
  // reachable without a line of its own.
  //
  // Below 640px the label goes and the mark stands alone — the pill drops
  // "Needs" at the same threshold. 640 is where the legend, this button and
  // the pill stop fitting on one row: measured off the running app at
  // 1024×700, legend 362px + Rescan 108 + pill 127, plus the gaps and the
  // strip's `px-4`. Shrunk, the same row fits down to about 533px, which
  // covers the default window with the inspector open. `aria-label` is
  // unchanged, so the narrow button is named the same to a screen reader.
  const rescanButton = onRescan && (
    <button
      onClick={onRescan}
      disabled={scanning}
      aria-label="Refresh scan"
      title={stampText}
      className="h-[30px] w-[30px] px-0 @[640px]:w-auto @[640px]:min-w-[108px] @[640px]:px-3.5 inline-flex items-center justify-center gap-2 rounded-pill border border-line-2 text-small font-medium text-ink-1 cursor-pointer transition-[background-color,transform] duration-hover ease-spring hover:bg-plane-2 active:scale-[0.96] disabled:opacity-50 disabled:cursor-default"
    >
      <RotateCcwIcon size={13} active={scanning} />
      <span data-rescan-label className="hidden @[640px]:inline">
        {scanning ? "Scanning" : "Rescan"}
      </span>
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
        {/* Two spellings; the accessible name is whichever one is displayed,
            because name-follows-visible-label is the property to keep (WCAG
            2.5.3) and `display: none` is already excluded from the name
            computation. No `aria-label` here on purpose: one would pin the
            name to "Needs review ‹n›" at both widths AND make this pill a
            second `getByLabelText(/^Needs review/)` match beside the rail's
            own nav item, which `inspector_avionics.test.tsx:439` queries.
            `happy-dom` applies no CSS, so it sees both spans and no test
            here can assert the name — only that both spellings exist and
            carry the classes that choose between them. */}
        <span className="hidden @[640px]:inline whitespace-nowrap">
          Needs review {review.count}
        </span>
        <span className="@[640px]:hidden whitespace-nowrap">
          Review {review.count}
        </span>
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
      // `@container`: the Rescan label and any width the strip drops are
      // measured against the strip itself, not the window — the inspector
      // column moves this box without moving the viewport.
      className="@container px-4 py-3.5 border border-line rounded-plane shrink-0"
    >
      {/* One line, always. `min-w-0` is what lets the subtitle shrink below
          its own text — a flex item's `min-width` is `auto` otherwise — and
          `truncate` clips it with an ellipsis rather than wrapping, which
          used to make the whole banner a line taller as the pane narrowed.
          The controls were tried here on 2026-08-29 and sent back down the
          same day (Karthik) — they stay in the row under the meter. */}
      <div className="flex items-baseline gap-3 mb-3">
        {total !== null && (
          <span className="text-display font-medium tabular tracking-[-0.5px] leading-display text-ink-1 shrink-0">
            {total}
          </span>
        )}
        <span className="text-lg-app text-ink-2 min-w-0 truncate" title={subtitle}>
          {subtitle}
        </span>
      </div>

      {engine ? (
        <>
          {/* The kinds with a figure, each its own button: Phase 1 measures
              MCP alone, so one segment, label · value · caption on one line.
              The row wraps, and the caption truncates inside its button, so
              F1's ~534px list (inspector open) never scrolls sideways. */}
          <div data-testid="strip-segments" className="flex flex-wrap items-center gap-2">
            {figured.map((seg) => (
              <button
                key={seg.key}
                type="button"
                aria-pressed={seg.pressed}
                onClick={seg.onSelect}
                className={`min-w-0 max-w-full flex items-baseline gap-1.5 px-3 py-1.5 rounded-inner border text-left font-flex text-small cursor-pointer transition-colors duration-hover ease-spring ${
                  seg.pressed ? "border-transparent bg-tint" : "border-line hover:bg-plane-2"
                }`}
              >
                <span className={`shrink-0 ${seg.pressed ? "text-tint-ink font-medium" : "text-ink-2"}`}>{seg.label}</span>{" "}
                <b className={`shrink-0 font-medium tabular ${seg.measured ? "text-ink-1" : "text-ink-3"}`}>{seg.value}</b>
                {seg.caption && (
                  <>
                    {" "}
                    <span className="text-ink-3 min-w-0 truncate" title={seg.caption}>
                      · {seg.caption}
                    </span>
                  </>
                )}
              </button>
            ))}
          </div>
          {/* The kinds with nothing measured, as one quiet line built from
              their labels: "Skills · Rules · Subagents: Not measured". Each
              name still opens its tab, as its segment did. Inline text, so
              a narrow strip wraps it at a separator. */}
          {unfigured.length > 0 && (
            <p data-testid="strip-unmeasured" className={`${captionClass} font-flex mt-1.5`}>
              {unfigured.map((seg, i) => (
                <Fragment key={seg.key}>
                  {i > 0 && " · "}
                  <button
                    type="button"
                    aria-pressed={seg.pressed}
                    onClick={seg.onSelect}
                    className={`cursor-pointer transition-colors duration-hover ease-spring hover:text-ink-1 ${
                      seg.pressed ? "text-ink-1 font-medium" : ""
                    }`}
                  >
                    {seg.label}
                  </button>
                </Fragment>
              ))}
              : {unfigured[0].value}
            </p>
          )}
          {/* Measure all, Rescan and the pill on one row. The caption that
              sat beside Measure all is its tooltip and its description now. */}
          <div data-testid="strip-actions" className="flex items-center gap-3 mt-2.5 flex-wrap">
            {engine.onMeasure && (
              <>
                <button
                  type="button"
                  onClick={engine.onMeasure}
                  disabled={engine.measuring}
                  title={engine.measureCaption}
                  aria-describedby={measureCaptionId}
                  className={`${miniBtnClass} shrink-0 disabled:cursor-default disabled:opacity-50`}
                >
                  {engine.measuring ? "Measuring…" : "Measure all"}
                </button>
                <span id={measureCaptionId} hidden>
                  {engine.measureCaption}
                </span>
              </>
            )}
            <div className="ml-auto flex items-center gap-2">
              {rescanButton}
              {reviewPill}
            </div>
          </div>
        </>
      ) : (
        <LinkStateLegend
          counts={counts}
          active={activeStateFilter}
          onFilter={onFilterState}
          trailing={
            <div className="ml-auto flex items-center gap-2">
              {rescanButton}

              {reviewPill}
            </div>
          }
        />
      )}

      {children}
    </section>
  );
}
