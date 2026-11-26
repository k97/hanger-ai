export interface MeterSegment {
  /** Stable identity for the segment within its meter. */
  key: string;
  /** Backend-owned count; sets the segment's share of the track width.
   *  Zero-count segments are omitted entirely rather than collapsed. */
  value: number;
  /** Token class painting the segment's ground under the gloss — a state
   *  colour, or nothing for plain glass. */
  barClass?: string;
  /** The linked share wears the aqua gel — and, in SummaryStrip's MCP mode,
   *  the answered share. Aqua is the PROGRESS fill and nothing else
   *  (Karthik's ruling, 2026-08-15): it may only mark a share that is
   *  actually true — linked, or answered — never an all-quiet or empty
   *  state. */
  aqua?: boolean;
}

interface GelMeterProps {
  segments: MeterSegment[];
  /** Read to assistive tech in place of the painted bar. */
  label: string;
  /** `gel`, the default: the glossed gel, aqua where a segment asks.
   *  `rank`: one plain --ink-1 bar with no gloss and no aqua, for a figure
   *  ranked against its neighbours rather than a share of a whole — the
   *  overview card's engines and kinds (round 14 q1,
   *  docs/plans/2026-11-26-decisions-round-14.md). */
  tone?: "gel" | "rank";
  /** Given, each segment is sized as its value's share of `max` instead of
   *  sharing the track with the others: a ranked bar is the engine's figure
   *  over the heaviest engine's. A width ratio, not a count. */
  max?: number;
}

/**
 * The design system's one meter: a glassy retro-Aqua gel on a recessed
 * track. Every proportional bar in the app draws through this component —
 * a second meter styled by hand is a divergence, not a variant.
 *
 * The glass is painted, not cast: stacked background-image gradients from
 * the tokens --gel-gloss, --gel-aqua and --bar-track, because the system
 * has exactly one elevation and this is not it. The rank tone is the one
 * fill that is not glass: flat ink on the same track.
 */
export default function GelMeter({ segments, label, tone = "gel", max }: GelMeterProps) {
  const rank = tone === "rank";
  return (
    <div
      role="img"
      aria-label={label}
      className="flex h-2.5 gap-[3px] p-px rounded-pill border border-line"
      style={{ background: "var(--bar-track)" }}
    >
      {segments.map(
        ({ key, value, barClass, aqua }) =>
          value > 0 && (
            <span
              key={key}
              className={`block h-full rounded-pill ${rank ? "bg-ink-1" : barClass ?? ""}`}
              style={{
                ...(max !== undefined && max > 0
                  ? { width: `${Math.min(100, (value / max) * 100)}%` }
                  : { flex: value }),
                // Unset for the rank tone: flat ink, never the gloss or the
                // aqua, whatever a segment asks for.
                backgroundImage: rank
                  ? undefined
                  : aqua
                    ? "var(--gel-gloss), var(--gel-aqua)"
                    : "var(--gel-gloss)",
              }}
            />
          )
      )}
    </div>
  );
}
