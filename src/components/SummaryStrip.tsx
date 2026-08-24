import { ArrowPathIcon } from "./icons";
import GelMeter from "./GelMeter";
import ScanStamp from "./ScanStamp";
import { REQUEST_CARRIES } from "./McpEngineSummary";
import type { StateCounts, StateFilter, LinkState } from "../utils/linkStateCounts";

/** The strip's second mode: MCP probe coverage instead of link state. When
 *  given, it replaces the entire link-state branch — meter, legend and the
 *  Needs review pill — with these figures; `total`/`subtitle` still render
 *  as passed by the caller. */
export interface McpStripFigures {
  /** McpEngineSummaryData's three buckets. */
  answered: number;
  unasked: number;
  unaskable: number;
  /** mcpCoverage.checked_file_count. */
  checkedFileCount: number;
  /** conflicting_server_count — servers whose hosts disagree. */
  conflicting: number;
  reviewActive: boolean;
  onToggleReview: () => void;
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
}: SummaryStripProps) {
  const reviewCount = counts.drifted + counts.broken;
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
      <ArrowPathIcon size={13} className={scanning ? "animate-spin" : ""} />
      {scanning ? "Scanning" : "Rescan"}
    </button>
  );

  return (
    <section
      aria-label="Inventory summary"
      // Background dropped by Karthik's ruling (2026-08-15): the hero sits
      // flat on the page; the --line border and radius still draw its edge.
      className="px-4 py-3.5 border border-line rounded-plane shrink-0"
    >
      <div className="flex items-baseline gap-3 mb-3">
        <span className="text-display font-medium tabular tracking-[-0.5px] leading-[1.1] text-ink-1">
          {total}
        </span>
        <span className="text-lg-app text-ink-2">{subtitle}</span>
        <ScanStamp scannedAt={scannedAt} className="ml-auto text-micro text-ink-3 font-flex" />
      </div>

      {mcp ? (
        <>
          {mcp.answered + mcp.unasked + mcp.unaskable > 0 && (
            <GelMeter
              label={`${mcp.answered} answered, ${mcp.unasked} not yet asked, ${mcp.unaskable} can't be asked`}
              segments={[
                { key: "answered", value: mcp.answered, aqua: true },
                { key: "unasked", value: mcp.unasked },
                {
                  key: "unaskable",
                  value: mcp.unaskable,
                  barClass: "border border-dashed border-line-2",
                },
              ]}
            />
          )}

          <div className="flex items-center gap-4 mt-2.5 flex-wrap">
            <span className="flex items-center gap-2 text-small font-flex text-ink-2">
              <i
                className="w-2 h-2 rounded-pill shrink-0"
                style={{ backgroundImage: "var(--gel-aqua)" }}
              />
              <b className="font-medium tabular text-ink-1">{mcp.answered}</b> answered
            </span>
            <span className="flex items-center gap-2 text-small font-flex text-ink-2">
              <i className="w-2 h-2 rounded-pill shrink-0 bg-transparent border-2 border-line-2" />
              <b className="font-medium tabular text-ink-1">{mcp.unasked}</b> not yet asked
            </span>
            <span className="flex items-center gap-2 text-small font-flex text-ink-2">
              <i className="w-2 h-2 rounded-pill shrink-0 bg-transparent border-2 border-dashed border-line-2" />
              <b className="font-medium tabular text-ink-1">{mcp.unaskable}</b> can't be asked
            </span>

            <div className="ml-auto flex items-center gap-2">
              {rescanButton}

              {mcp.conflicting > 0 && (
                <button
                  onClick={mcp.onToggleReview}
                  aria-pressed={mcp.reviewActive}
                  className="h-[30px] px-[15px] inline-flex items-center text-small font-medium tabular bg-fill text-on-fill rounded-pill cursor-pointer transition-[transform] duration-press ease-spring hover:-translate-y-px active:scale-[0.96]"
                >
                  Needs review {mcp.conflicting}
                </button>
              )}
            </div>
          </div>

          <p className="text-micro text-ink-3 font-flex mt-2.5">{REQUEST_CARRIES}</p>
        </>
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

              {reviewCount > 0 && (
                <button
                  onClick={() =>
                    onFilterState(activeStateFilter === "needs-review" ? null : "needs-review")
                  }
                  aria-pressed={activeStateFilter === "needs-review"}
                  className="h-[30px] px-[15px] inline-flex items-center text-small font-medium tabular bg-fill text-on-fill rounded-pill cursor-pointer transition-[transform] duration-press ease-spring hover:-translate-y-px active:scale-[0.96]"
                >
                  Needs review {reviewCount}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
