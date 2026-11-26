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
   *  `line`: T3 Code's usage meter (`ThreadDetailsUsage.tsx`), for the
   *  overview card's kind rows (Task 2 of
   *  docs/plans/2026-11-26-global-list.md): a 3px bar on a --line-2 track,
   *  one --ink-1 fill with no gloss and no aqua, and a 1px tick at the
   *  fill's end. It draws the first segment only: a figure against a whole,
   *  not shares of one. */
  tone?: "gel" | "line";
  /** Given, each segment is sized as its value's share of `max` instead of
   *  sharing the track with the others: the line tone's figure over its
   *  whole. A width ratio, not a count. */
  max?: number;
}

/**
 * The design system's one meter: a glassy retro-Aqua gel on a recessed
 * track. Every proportional bar in the app draws through this component —
 * a second meter styled by hand is a divergence, not a variant.
 *
 * The glass is painted, not cast: stacked background-image gradients from
 * the tokens --gel-gloss, --gel-aqua and --bar-track, because the system
 * has exactly one elevation and this is not it. The line tone is the one
 * meter that is not glass: a thin bar in flat ink.
 */
export default function GelMeter({ segments, label, tone = "gel", max }: GelMeterProps) {
  const widthOf = (value: number) =>
    max !== undefined && max > 0 ? `${Math.min(100, (value / max) * 100)}%` : undefined;
  if (tone === "line") {
    const seg = segments.find((s) => s.value > 0);
    const width = seg ? widthOf(seg.value) ?? "100%" : null;
    return (
      <div role="img" aria-label={label} className="relative h-[3px] rounded-pill bg-line-2">
        {width !== null && (
          <>
            <span data-meter-fill className="absolute inset-y-0 left-0 rounded-pill bg-ink-1" style={{ width }} />
            {/* The end tick, as T3 marks a bar: 9px tall, centred on the
                fill's end, and kept inside the track at 100%. */}
            <span
              data-meter-tick
              aria-hidden="true"
              className="absolute -top-[3px] w-px h-[9px] -translate-x-1/2 bg-ink-1"
              style={{ left: width }}
            />
          </>
        )}
      </div>
    );
  }
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
              className={`block h-full rounded-pill ${barClass ?? ""}`}
              style={{
                ...(widthOf(value) !== undefined ? { width: widthOf(value) } : { flex: value }),
                backgroundImage: aqua ? "var(--gel-gloss), var(--gel-aqua)" : "var(--gel-gloss)",
              }}
            />
          )
      )}
    </div>
  );
}
