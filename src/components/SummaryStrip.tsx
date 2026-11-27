import type { ReactNode } from "react";
import GelMeter from "./GelMeter";
import type { FindingLine } from "./FindingPopover";
import type { StateCounts, StateFilter, LinkState } from "../utils/linkStateCounts";

/** What the Needs review pill says, and what its popover shows. One shape
 *  for the panes and the overview card: the pill only opens the popover, and every action —
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
  /** Backend-owned. */
  counts: StateCounts;
  active: StateFilter;
  /** A state, or `null` when the pressed one is pressed again. */
  onFilter: (filter: StateFilter) => void;
  /** Drawn at the end of the legend's row. */
  trailing?: ReactNode;
}

/**
 * The link-state meter and its legend: linked, drifted, broken, local only,
 * each a toggle that filters the list. One drawing for the two places that
 * show the store's link state — the repository card and the
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
