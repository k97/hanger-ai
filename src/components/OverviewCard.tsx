import { useId, useRef, useState, type ReactNode } from "react";
import GelMeter from "./GelMeter";
import BrandIcon from "./BrandIcon";
import FindingPopover from "./FindingPopover";
import { LinkStateLegend, type StripReview } from "./SummaryStrip";
import { useScanStampText } from "./ScanStamp";
import { ExclamationTriangleIcon, RotateCcwIcon } from "./icons";
import { miniBtnClass } from "./miniButton";
import type { EngineContext } from "../types/engineContext";
import type { StateCounts, StateFilter } from "../utils/linkStateCounts";
import { engineBandFigures, engineStripHeadline, measuredBudget, NOT_MEASURED_FIGURE } from "../utils/switchCopy";
import {
  ALL_ENGINES,
  ENGINES_CAPTION,
  ENGINES_HEAD,
  ENGINE_COUNTS_HEAD,
  STORE_HEAD,
  engineRowValue,
  rankEngines,
  storeAssetsLabel,
} from "../utils/overviewCopy";

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

/** The chosen engine's section of the card: Global seen by one engine
 *  (docs/plans/2026-11-25-ia-global-by-engine.md), its budget by kind and
 *  Measure all. Named for the strip's engine mode, which drew it until Task 7
 *  of docs/plans/2026-11-26-overview-card.md moved it here. */
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

/** One engine's asset count on a repository's card. The card formats the
 *  figure; the backend owns it. */
export interface EngineCountRow {
  key: string;
  engineKey: string;
  engineName: string;
  value: number;
}

export interface OverviewCardProps {
  /** App's `engineContexts`, in `get_engine_contexts`' order: the card ranks. */
  engines: EngineContext[];
  /** `null` is All engines. */
  selectedEngineId: string | null;
  /** Absent on a repository's card, which has no engine to pick. */
  onSelectEngine?: (id: string | null) => void;
  /** The old summary's backend-owned total. */
  storeTotal: number;
  /** The store section's head; `STORE_HEAD` by default. A repository passes
   *  its folder's name. */
  storeHead?: string;
  /** Replaces `storeAssetsLabel(storeTotal)` as that section's caption
   *  (a tab's own noun, "48 skills"). `pending` still wins. */
  storeCaption?: string;
  /** Given, the first section lists these rows (none a button, no All
   *  engines row) and `engines` is ignored. Empty draws no section. */
  engineCounts?: EngineCountRow[];
  /** Its own bordered section between the store and the actions. */
  notice?: ReactNode;
  /** True before the answer is in: no asset figure is printed anywhere. */
  pending?: boolean;
  /** The link-state meter and legend, drawn with All engines picked. */
  linkLegend: { counts: StateCounts; active: StateFilter; onFilter: (s: StateFilter) => void };
  /** The chosen engine's kinds and Measure all, as the strip's engine mode
   *  takes them; `null` with All engines. */
  engineFigures: EngineStripFigures | null;
  review: StripReview | null;
  /** `scannedAt` in epoch ms, `null` before the first scan. */
  scan: { scannedAt: number | null; scanning: boolean; onRescan: () => void };
}

/* T3 Code's card, in Hanger's tokens (Task 2 of
   docs/plans/2026-11-26-global-list.md; ThreadDetailsSection.tsx,
   threadDetailsPanelStyles.ts, ThreadDetailsUsage.tsx), matched against
   approved-HI.png. Rows are 32px with the 8px control radius; a kind's row
   is T3's 24px meter row, its bar GelMeter's line tone. The value cell is
   fixed and never wraps; the name truncates. */
const ROW =
  "w-full h-8 items-center gap-2.5 px-2.5 rounded-control text-left text-base-app cursor-pointer transition-colors duration-hover ease-spring";
const ENGINE_GRID = "grid grid-cols-[14px_minmax(0,1fr)_auto]";
const KIND_ROW =
  "w-full h-6 grid grid-cols-[96px_minmax(48px,1fr)_88px] items-center gap-3 px-2.5 rounded-control text-left text-small cursor-pointer transition-colors duration-hover ease-spring";
const VALUE = "text-right text-small tabular whitespace-nowrap";
const ACTION_ROW =
  "w-full h-8 flex items-center gap-2.5 px-2.5 rounded-control text-left text-base-app text-ink-1 cursor-pointer transition-[background-color,transform] duration-hover ease-spring hover:bg-plane-2 active:scale-[0.97] disabled:cursor-default disabled:opacity-50";
/** T3's section: 8px in, the --line border between sections. */
const SECTION = "px-2 pt-2 pb-2.5";

/** A section's head, as T3 heads one: 11px, medium, muted, 32px tall, its
 *  caption at the right. */
function SectionHead({ id, name, caption }: { id: string; name: string; caption?: string }) {
  return (
    <div data-section-head className="flex items-center gap-2 min-h-8 px-2.5 text-micro font-medium text-ink-3">
      <span id={id} className="truncate">
        {name}
      </span>
      {caption && <span className="ml-auto min-w-0 truncate font-normal">{caption}</span>}
    </div>
  );
}

/** A kind's bar, GelMeter's line tone. Phase 1 measures MCP alone, so the
 *  one measured kind is the engine's whole figure and fills its track; the
 *  others are the bare track. Hidden from assistive tech: the row it sits
 *  in already reads the value it draws. */
function KindBar({ label, value }: { label: string; value: number | null }) {
  return (
    <span aria-hidden="true" className="min-w-0">
      <GelMeter tone="line" label={label} max={value ?? undefined} segments={value === null ? [] : [{ key: label, value }]} />
    </span>
  );
}

/**
 * The overview card (docs/plans/2026-11-26-overview-card.md, Task 3): every
 * engine ranked by its tokens every session, then the chosen engine by kind
 * or, with All engines, the store's link state, then Needs review and
 * Rescan. Purely presentational — it calls nothing. Global's one summary
 * since Task 7: ProfilePane docks it at the list's top right when there is
 * room, or draws it into `OverviewPopover` from the window bar. It draws its
 * own frame, T3's: 280px, the plane radius, frosted (the page token at 86%
 * over a backdrop blur) with a --line border. The popover adds the overlay
 * elevation; docked, it has none.
 */
export default function OverviewCard({
  engines,
  selectedEngineId,
  onSelectEngine,
  storeTotal,
  storeHead = STORE_HEAD,
  storeCaption,
  engineCounts,
  notice,
  pending = false,
  linkLegend,
  engineFigures,
  review,
  scan,
}: OverviewCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const reviewRef = useRef<HTMLSpanElement>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const enginesHeadId = useId();
  const secondHeadId = useId();
  const measureCaptionId = useId();
  const stampText = useScanStampText(scan.scannedAt === null ? null : new Date(scan.scannedAt));

  const ranked = rankEngines(engines);
  const hasEngines = engineCounts ? engineCounts.length > 0 : ranked.length > 0;
  const chosen = selectedEngineId === null ? null : engines.find((e) => e.engine_id === selectedEngineId) ?? null;
  const showEngine = chosen !== null && engineFigures !== null;

  const rowTone = (selected: boolean) => (selected ? "bg-tint" : "hover:bg-plane-2");

  return (
    <div
      ref={cardRef}
      data-testid="overview-card"
      className="w-[280px] flex flex-col font-flex rounded-plane border border-line bg-page/86 backdrop-blur-frost"
    >
      {/* Engines. Before the first scan has listed any, the section is not
          drawn at all: a head over nothing would read as "no engines"
          (Review Focus 1). */}
      {engineCounts && hasEngines && (
        <section aria-labelledby={enginesHeadId} className={SECTION}>
          <SectionHead id={enginesHeadId} name={ENGINE_COUNTS_HEAD} />
          <div role="group" aria-labelledby={enginesHeadId}>
            {engineCounts.map((row) => (
              <div key={row.key} data-engine-name={row.engineName} className={`${ROW} ${ENGINE_GRID}`}>
                <BrandIcon engineKey={row.engineKey} engineName={row.engineName} size={14} />
                <span data-cell="name" className="truncate text-ink-1">
                  {row.engineName}
                </span>
                <span data-cell="value" className={`${VALUE} text-ink-2`}>
                  {pending ? "" : storeAssetsLabel(row.value)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      {!engineCounts && hasEngines && (
        <section aria-labelledby={enginesHeadId} className={SECTION}>
          <SectionHead id={enginesHeadId} name={ENGINES_HEAD} caption={ENGINES_CAPTION} />
          <div role="group" aria-labelledby={enginesHeadId}>
            <button
              type="button"
              data-engine-name={ALL_ENGINES}
              aria-current={selectedEngineId === null ? "true" : undefined}
              onClick={() => onSelectEngine?.(null)}
              className={`${ROW} ${ENGINE_GRID} ${rowTone(selectedEngineId === null)}`}
            >
              <span />
              <span data-cell="name" className={`truncate text-ink-1 ${selectedEngineId === null ? "font-medium" : ""}`}>
                {ALL_ENGINES}
              </span>
              <span data-cell="value" className={`${VALUE} text-ink-2`}>
                {pending ? "" : storeAssetsLabel(storeTotal)}
              </span>
            </button>
            {ranked.map((ctx) => {
              const selected = ctx.engine_id === selectedEngineId;
              const value = engineRowValue(ctx);
              const measured = measuredBudget(ctx) !== null;
              return (
                <button
                  key={ctx.engine_id}
                  type="button"
                  data-engine-name={ctx.engine_name}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => onSelectEngine?.(ctx.engine_id)}
                  className={`${ROW} ${ENGINE_GRID} ${rowTone(selected)}`}
                >
                  <BrandIcon engineKey={ctx.engine_id} engineName={ctx.engine_name} size={14} />
                  <span data-cell="name" className={`truncate text-ink-1 ${selected ? "font-medium" : ""}`}>
                    {ctx.engine_name}
                  </span>
                  <span data-cell="value" className={`${VALUE} ${measured ? "text-ink-2" : "text-ink-3"}`}>
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
          divided={hasEngines}
        />
      ) : (
        <section aria-labelledby={secondHeadId} className={`${SECTION} ${hasEngines ? "border-t border-line" : ""}`}>
          <SectionHead id={secondHeadId} name={storeHead} caption={pending ? undefined : (storeCaption ?? storeAssetsLabel(storeTotal))} />
          <div className="px-2.5 pt-1.5">
            <LinkStateLegend counts={linkLegend.counts} active={linkLegend.active} onFilter={linkLegend.onFilter} />
          </div>
        </section>
      )}

      {notice && <div className="px-2 py-2 border-t border-line">{notice}</div>}

      {/* Actions. Needs review opens the same FindingPopover the strip's
          pill does, from the same `review`; Rescan carries the scan's age
          where the strip kept it in a tooltip. */}
      <div className="px-2 py-2 border-t border-line">
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
  divided,
}: {
  headId: string;
  ctx: EngineContext;
  figures: EngineStripFigures;
  measureCaptionId: string;
  divided: boolean;
}) {
  const headline = engineStripHeadline(ctx, ctx.engine_name);
  const tokens = measuredBudget(ctx);
  return (
    <section aria-labelledby={headId} className={`${SECTION} ${divided ? "border-t border-line" : ""}`}>
      <SectionHead id={headId} name={ctx.engine_name} caption={engineBandFigures(ctx).secondary} />
      <div className="flex items-center gap-2 px-2.5 pb-2">
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
            className={`${KIND_ROW} ${seg.pressed ? "bg-tint" : "hover:bg-plane-2"}`}
          >
            <span data-cell="name" className={`truncate ${seg.pressed ? "text-ink-1 font-medium" : "text-ink-2"}`}>
              {seg.label}
            </span>
            <KindBar label={`${seg.label}: ${seg.value}`} value={seg.measured ? tokens : null} />
            <span data-cell="value" className={`${VALUE} ${seg.measured ? "text-ink-2" : "text-ink-3"}`}>
              {seg.value}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
