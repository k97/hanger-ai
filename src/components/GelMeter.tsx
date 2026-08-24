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
}

/**
 * The design system's one meter: a glassy retro-Aqua gel on a recessed
 * track. Every proportional bar in the app draws through this component —
 * a second meter styled by hand is a divergence, not a variant.
 *
 * The glass is painted, not cast: stacked background-image gradients from
 * the tokens --gel-gloss, --gel-aqua and --bar-track, because the system
 * has exactly one elevation and this is not it.
 */
export default function GelMeter({ segments, label }: GelMeterProps) {
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
                flex: value,
                backgroundImage: aqua
                  ? "var(--gel-gloss), var(--gel-aqua)"
                  : "var(--gel-gloss)",
              }}
            />
          )
      )}
    </div>
  );
}
