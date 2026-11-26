import { useId, useRef, useState, type ReactNode } from "react";
import GelMeter from "./GelMeter";
import BrandIcon from "./BrandIcon";
import Tooltip from "./Tooltip";
import FindingPopover from "./FindingPopover";
import { LinkStateLegend, type EngineStripFigures, type StripReview } from "./SummaryStrip";
import { useScanStampText } from "./ScanStamp";
import { ExclamationTriangleIcon, PinIcon, PinOffIcon, RotateCcwIcon } from "./icons";
import { miniBtnClass } from "./miniButton";
import type { EngineContext } from "../types/engineContext";
import type { StateCounts, StateFilter } from "../utils/linkStateCounts";
import { engineBandFigures, engineStripHeadline, measuredBudget, NOT_MEASURED_FIGURE } from "../utils/switchCopy";
import {
  ALL_ENGINES,
  ENGINES_CAPTION,
  ENGINES_HEAD,
  STORE_HEAD,
  engineRowValue,
  pinLabel,
  rankEngines,
  storeAssetsLabel,
} from "../utils/overviewCopy";

export interface OverviewCardProps {
  /** App's `engineContexts`, in `get_engine_contexts`' order: the card ranks. */
  engines: EngineContext[];
  /** `null` is All engines. */
  selectedEngineId: string | null;
  onSelectEngine: (id: string | null) => void;
  /** The old summary's backend-owned total. */
  storeTotal: number;
  /** The link-state meter and legend, drawn with All engines picked. */
  linkLegend: { counts: StateCounts; active: StateFilter; onFilter: (s: StateFilter) => void };
  /** The chosen engine's kinds and Measure all, as the strip's engine mode
   *  takes them; `null` with All engines. */
  engineFigures: EngineStripFigures | null;
  review: StripReview | null;
  /** `scannedAt` in epoch ms, `null` before the first scan. */
  scan: { scannedAt: number | null; scanning: boolean; onRescan: () => void };
  pinned: boolean;
  onTogglePin: () => void;
}

/* The rows' grids, from prototype F (docs/plans/2026-11-26-global-top-prototypes.html):
   mark, name, meter, value for an engine; name, meter, value for a kind. The
   value cell is fixed at 80px and never wraps; the name truncates; the meter
   takes what is left, so a narrow inspector shortens the bars first. */
const ROW =
  "w-full h-7 items-center gap-2 pl-2.5 pr-2 rounded-control text-left text-base-app cursor-pointer transition-colors duration-hover ease-spring";
const ENGINE_GRID = "grid grid-cols-[16px_128px_minmax(0,1fr)_80px]";
const KIND_GRID = "grid grid-cols-[110px_minmax(0,1fr)_80px]";
const VALUE = "text-right text-small tabular whitespace-nowrap";
const ACTION_ROW =
  "w-full h-[30px] flex items-center gap-[9px] px-2.5 rounded-control text-left text-base-app text-ink-1 cursor-pointer transition-[background-color,transform] duration-hover ease-spring hover:bg-plane-2 active:scale-[0.97] disabled:cursor-default disabled:opacity-50";

/** A section's head: its name, its caption at the right, and the pin when
 *  this is the card's first section (round 14 q3). */
function SectionHead({ id, name, caption, pin }: { id: string; name: string; caption?: string; pin?: ReactNode }) {
  return (
    <div data-section-head className="flex items-center gap-2 min-h-[22px] pl-2.5 pr-1 pt-1.5 pb-0.5 text-small text-ink-3">
      <span id={id} className="font-medium text-ink-2 truncate">
        {name}
      </span>
      {caption && <span className="ml-auto min-w-0 truncate">{caption}</span>}
      {pin && <span className={caption ? "shrink-0" : "ml-auto shrink-0"}>{pin}</span>}
    </div>
  );
}

/** A ranked bar: the figure over the heaviest one, or the bare track for
 *  no figure. Hidden from assistive tech: the row it sits in already reads
 *  the value it draws. */
function RankBar({ label, value, max }: { label: string; value: number | null; max: number | null }) {
  return (
    <span aria-hidden="true" className="min-w-0">
      <GelMeter
        tone="rank"
        label={label}
        max={max ?? undefined}
        segments={value === null || max === null ? [] : [{ key: label, value }]}
      />
    </span>
  );
}

/**
 * The overview card (docs/plans/2026-11-26-overview-card.md, Task 3): every
 * engine ranked by its tokens every session, then the chosen engine by kind
 * or, with All engines, the store's link state, then Needs review and
 * Rescan. Purely presentational — it calls nothing; the window bar's
 * popover and the pinned inspector both draw it from App's figures. It
 * draws no border or elevation of its own: whichever surface holds it does.
 */
export default function OverviewCard({
  engines,
  selectedEngineId,
  onSelectEngine,
  storeTotal,
  linkLegend,
  engineFigures,
  review,
  scan,
  pinned,
  onTogglePin,
}: OverviewCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const reviewRef = useRef<HTMLSpanElement>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const enginesHeadId = useId();
  const secondHeadId = useId();
  const measureCaptionId = useId();
  const stampText = useScanStampText(scan.scannedAt === null ? null : new Date(scan.scannedAt));

  const ranked = rankEngines(engines);
  const hasEngines = ranked.length > 0;
  // Every bar is scaled to the first engine's figure: the ranking puts the
  // heaviest there, and an engine with no figure there means none has one.
  const top = hasEngines ? measuredBudget(ranked[0]) : null;
  const chosen = selectedEngineId === null ? null : engines.find((e) => e.engine_id === selectedEngineId) ?? null;
  const showEngine = chosen !== null && engineFigures !== null;

  const pinButton = (
    <Tooltip label={pinLabel(pinned)} placement="bottom">
      <button
        type="button"
        aria-label={pinLabel(pinned)}
        onClick={onTogglePin}
        className={`w-[22px] h-[22px] grid place-items-center rounded-control cursor-pointer transition-[background-color,color,transform] duration-hover ease-spring hover:bg-plane-2 hover:text-ink-1 active:scale-[0.97] ${
          pinned ? "text-ink-1" : "text-ink-2"
        }`}
      >
        {pinned ? <PinOffIcon size={14} aria-hidden="true" /> : <PinIcon size={14} aria-hidden="true" />}
      </button>
    </Tooltip>
  );

  const rowTone = (selected: boolean) => (selected ? "bg-tint" : "hover:bg-plane-2");

  return (
    <div ref={cardRef} data-testid="overview-card" className="flex flex-col font-flex">
      {/* Engines. Before the first scan has listed any, the section is not
          drawn at all: a head over nothing would read as "no engines"
          (Review Focus 1). */}
      {hasEngines && (
        <section aria-labelledby={enginesHeadId} className="px-1.5 pb-1.5">
          <SectionHead id={enginesHeadId} name={ENGINES_HEAD} caption={ENGINES_CAPTION} pin={pinButton} />
          <div role="group" aria-labelledby={enginesHeadId}>
            <button
              type="button"
              data-engine-name={ALL_ENGINES}
              aria-current={selectedEngineId === null ? "true" : undefined}
              onClick={() => onSelectEngine(null)}
              className={`${ROW} ${ENGINE_GRID} ${rowTone(selectedEngineId === null)}`}
            >
              <span />
              <span data-cell="name" className={`truncate text-ink-1 ${selectedEngineId === null ? "font-medium" : ""}`}>
                {ALL_ENGINES}
              </span>
              <span />
              <span data-cell="value" className={`${VALUE} text-ink-2`}>
                {storeAssetsLabel(storeTotal)}
              </span>
            </button>
            {ranked.map((ctx) => {
              const selected = ctx.engine_id === selectedEngineId;
              const value = engineRowValue(ctx);
              const tokens = measuredBudget(ctx);
              return (
                <button
                  key={ctx.engine_id}
                  type="button"
                  data-engine-name={ctx.engine_name}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => onSelectEngine(ctx.engine_id)}
                  className={`${ROW} ${ENGINE_GRID} ${rowTone(selected)}`}
                >
                  <BrandIcon engineKey={ctx.engine_id} engineName={ctx.engine_name} size={14} />
                  <span data-cell="name" className={`truncate text-ink-1 ${selected ? "font-medium" : ""}`}>
                    {ctx.engine_name}
                  </span>
                  <RankBar label={`${ctx.engine_name}: ${value}`} value={tokens} max={top} />
                  <span data-cell="value" className={`${VALUE} ${tokens === null ? "text-ink-3" : "text-ink-2"}`}>
                    {value}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {showEngine ? (
        <EngineSection
          headId={secondHeadId}
          ctx={chosen}
          figures={engineFigures}
          measureCaptionId={measureCaptionId}
          pin={hasEngines ? undefined : pinButton}
          divided={hasEngines}
        />
      ) : (
        <section aria-labelledby={secondHeadId} className={`px-1.5 pb-2.5 ${hasEngines ? "border-t border-line" : ""}`}>
          <SectionHead
            id={secondHeadId}
            name={STORE_HEAD}
            caption={storeAssetsLabel(storeTotal)}
            pin={hasEngines ? undefined : pinButton}
          />
          <div className="px-2.5 pt-1.5">
            <LinkStateLegend counts={linkLegend.counts} active={linkLegend.active} onFilter={linkLegend.onFilter} />
          </div>
        </section>
      )}

      {/* Actions. Needs review opens the same FindingPopover the strip's
          pill does, from the same `review`; Rescan carries the scan's age
          where the strip kept it in a tooltip. */}
      <div className="px-1.5 py-1.5 border-t border-line">
        {review && review.count > 0 && (
          <span ref={reviewRef} className="relative block">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={reviewOpen}
              onClick={() => setReviewOpen((v) => !v)}
              className={ACTION_ROW}
            >
              <ExclamationTriangleIcon size={14} aria-hidden="true" className="text-ink-2 shrink-0" />
              <span>Needs review</span>
              <span className="ml-auto text-small text-ink-3 tabular">{review.count}</span>
            </button>
            <FindingPopover
              open={reviewOpen}
              onClose={() => setReviewOpen(false)}
              lines={review.lines}
              actions={review.actions}
              align="right"
              top={34}
              elevated
              clampTo={cardRef}
              anchorRef={reviewRef}
              ariaLabel={`Needs review ${review.count}`}
            />
          </span>
        )}
        <button type="button" onClick={scan.onRescan} disabled={scan.scanning} className={ACTION_ROW}>
          <RotateCcwIcon size={14} active={scan.scanning} className="text-ink-2 shrink-0" />
          <span>{scan.scanning ? "Scanning" : "Rescan"}</span>
          <span className="ml-auto min-w-0 truncate text-small text-ink-3 tabular">{stampText}</span>
        </button>
      </div>
    </div>
  );
}

/** The chosen engine: its caption, its figure and Measure all, then one row
 *  per kind. Phase 1 measures MCP alone, so the one measured kind is the
 *  engine's whole figure and fills its track; the others are bare. */
function EngineSection({
  headId,
  ctx,
  figures,
  measureCaptionId,
  pin,
  divided,
}: {
  headId: string;
  ctx: EngineContext;
  figures: EngineStripFigures;
  measureCaptionId: string;
  pin?: ReactNode;
  divided: boolean;
}) {
  const headline = engineStripHeadline(ctx, ctx.engine_name);
  const tokens = measuredBudget(ctx);
  return (
    <section aria-labelledby={headId} className={`px-1.5 pb-1.5 ${divided ? "border-t border-line" : ""}`}>
      <SectionHead id={headId} name={ctx.engine_name} caption={engineBandFigures(ctx).secondary} pin={pin} />
      <div className="flex items-center gap-2 pl-2.5 pr-1 pt-1 pb-1.5">
        {headline.figure === null ? (
          <span className="text-lg-app font-medium text-ink-3">{NOT_MEASURED_FIGURE}</span>
        ) : (
          <>
            <span className="text-lg-app font-medium tabular text-ink-1">{headline.figure}</span>
            <span className="text-small text-ink-2">{ENGINES_CAPTION}</span>
          </>
        )}
        {figures.onMeasure && (
          <>
            <button
              type="button"
              onClick={figures.onMeasure}
              disabled={figures.measuring}
              title={figures.measureCaption}
              aria-describedby={measureCaptionId}
              className={`${miniBtnClass} ml-auto shrink-0 active:scale-[0.97] disabled:cursor-default disabled:opacity-50`}
            >
              {figures.measuring ? "Measuring…" : "Measure all"}
            </button>
            <span id={measureCaptionId} hidden>
              {figures.measureCaption}
            </span>
          </>
        )}
      </div>
      <div data-testid="overview-kinds">
        {figures.segments.map((seg) => (
          <button
            key={seg.key}
            type="button"
            data-kind={seg.key}
            aria-pressed={seg.pressed}
            onClick={seg.onSelect}
            className={`${ROW} ${KIND_GRID} ${seg.pressed ? "bg-tint" : "hover:bg-plane-2"}`}
          >
            <span data-cell="name" className={`truncate ${seg.pressed ? "text-ink-1 font-medium" : "text-ink-2"}`}>
              {seg.label}
            </span>
            <RankBar label={`${seg.label}: ${seg.value}`} value={seg.measured ? tokens : null} max={seg.measured ? tokens : null} />
            <span data-cell="value" className={`${VALUE} ${seg.measured ? "text-ink-2" : "text-ink-3"}`}>
              {seg.value}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
