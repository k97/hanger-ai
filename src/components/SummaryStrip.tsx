import { useEffect, useState } from "react";
import Particles from "./Particles";
import type { StateCounts, StateFilter, LinkState } from "../utils/linkStateCounts";

interface SummaryStripProps {
  /** Backend-owned asset total for the scope — never derived on the frontend. */
  total: number;
  subtitle: string;
  scannedAt: Date | null;
  scanning: boolean;
  counts: StateCounts;
  activeStateFilter: StateFilter;
  onFilterState: (filter: StateFilter) => void;
}

function timeAgo(from: Date, now: Date): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 1000));
  if (seconds < 60) return "moments ago";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

const SEGMENTS: Array<{ state: LinkState; barClass: string; dotClass: string; label: (n: number) => string }> = [
  { state: "linked", barClass: "bg-state-success", dotClass: "bg-state-success", label: () => "linked" },
  { state: "drifted", barClass: "bg-state-warning", dotClass: "bg-state-warning", label: () => "drifted" },
  { state: "broken", barClass: "bg-state-danger", dotClass: "bg-state-danger", label: () => "won't parse" },
  {
    state: "local",
    barClass: "bg-line-2",
    dotClass: "bg-transparent border-2 border-line-2",
    label: () => "local only",
  },
];

/** One large typographic anchor on the tinted plane, with the particle field. */
export default function SummaryStrip({
  total,
  subtitle,
  scannedAt,
  scanning,
  counts,
  activeStateFilter,
  onFilterState,
}: SummaryStripProps) {
  // Re-render every 30s so the scan stamp keeps pace without a scan event.
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  const scanStamp = scanning
    ? "Scanning…"
    : scannedAt
    ? `Scanned ${timeAgo(scannedAt, new Date())}`
    : "Not scanned yet";

  const reviewCount = counts.drifted + counts.broken;
  const barLabel = `${counts.linked} linked, ${counts.drifted} drifted, ${counts.broken} broken, ${counts.local} local only`;

  const toggle = (state: LinkState) =>
    onFilterState(activeStateFilter === state ? null : state);

  return (
    <section
      aria-label="Inventory summary"
      className="px-4 py-3.5 bg-plane border border-line rounded-plane relative overflow-hidden shrink-0"
    >
      <Particles />

      <div className="relative z-[1] flex items-baseline gap-3 mb-3">
        <span className="text-display font-medium tabular tracking-[-0.5px] leading-[1.1] text-ink-1">
          {total}
        </span>
        <span className="text-lg-app text-ink-2">{subtitle}</span>
        <span className="ml-auto text-micro text-ink-3 font-flex">{scanStamp}</span>
      </div>

      {counts.total > 0 && (
        <div className="relative z-[1] flex h-2 gap-[3px]" role="img" aria-label={barLabel}>
          {SEGMENTS.map(
            ({ state, barClass }) =>
              counts[state] > 0 && (
                <span
                  key={state}
                  className={`block h-full rounded-pill ${barClass}`}
                  style={{ flex: counts[state] }}
                />
              )
          )}
        </div>
      )}

      <div className="relative z-[1] flex items-center gap-4 mt-2.5 flex-wrap">
        {SEGMENTS.map(({ state, dotClass, label }) => (
          <button
            key={state}
            onClick={() => toggle(state)}
            aria-pressed={activeStateFilter === state}
            className={`flex items-center gap-2 text-small font-flex cursor-pointer transition-colors duration-hover ease-spring ${
              activeStateFilter === state ? "text-ink-1" : "text-ink-2 hover:text-ink-1"
            }`}
          >
            <i className={`w-2 h-2 rounded-pill shrink-0 ${dotClass}`} />
            <b className="font-medium tabular text-ink-1">{counts[state]}</b> {label(counts[state])}
          </button>
        ))}

        {reviewCount > 0 && (
          <button
            onClick={() =>
              onFilterState(activeStateFilter === "needs-review" ? null : "needs-review")
            }
            aria-pressed={activeStateFilter === "needs-review"}
            className="ml-auto text-small font-medium bg-fill text-on-fill rounded-pill px-[15px] py-1.5 cursor-pointer transition-transform duration-press ease-spring hover:-translate-y-px active:scale-[0.96]"
          >
            Review {reviewCount} →
          </button>
        )}
      </div>
    </section>
  );
}
