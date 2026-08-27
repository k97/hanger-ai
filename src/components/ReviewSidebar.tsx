import SourceListShell from "./SourceListShell";
import type { IssueKind, ReviewCounts, ReviewPlace } from "../utils/reviewIssues";

interface ReviewSidebarProps {
  width: number;
  setWidth: (w: number) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  counts: ReviewCounts;
  places: ReviewPlace[];
  kind: IssueKind | null;
  place: string | null;
  onSelectKind: (kind: IssueKind | null) => void;
  onSelectPlace: (place: string | null) => void;
}

const grpClass =
  "flex items-center justify-between px-2.5 pt-[11px] pb-[5px] font-flex text-micro font-medium tracking-[.06em] uppercase text-ink-3";

const ISSUE_ROWS: { kind: IssueKind | null; label: string; of: keyof ReviewCounts }[] = [
  { kind: null, label: "Everything", of: "total" },
  { kind: "broken", label: "Broken links", of: "broken" },
  { kind: "drifted", label: "Drifted copies", of: "drifted" },
  { kind: "duplicate", label: "Duplicates", of: "duplicate" },
  { kind: "parse", label: "Won't parse", of: "parse" },
];

/**
 * Under Needs review the second column stops being a source list and becomes a
 * filter list: what kind of problem, and where it lives. "Across repositories"
 * is a place in its own right — the issues that no single repository owns.
 */
export default function ReviewSidebar({
  width,
  setWidth,
  collapsed,
  setCollapsed,
  counts,
  places,
  kind,
  place,
  onSelectKind,
  onSelectPlace,
}: ReviewSidebarProps) {
  const row = (active: boolean) =>
    `flex items-center gap-2 h-8 px-3 rounded-pill cursor-pointer transition-colors duration-nav ease-spring ${
      active ? "bg-sidebar-sel text-sidebar-sel-ink" : "text-sidebar-ink hover:bg-sidebar-sel"
    }`;

  const tally = (active: boolean) =>
    `text-micro tabular font-flex shrink-0 ${active ? "text-sidebar-sel-ink opacity-70" : "text-ink-3"}`;

  return (
    <SourceListShell
      testId="review-sidebar"
      width={width}
      setWidth={setWidth}
      collapsed={collapsed}
      setCollapsed={setCollapsed}
    >
      <div className={grpClass}>Issues</div>
      {ISSUE_ROWS.map((entry) => {
        const active = kind === entry.kind;
        return (
          <div
            key={entry.label}
            role="button"
            tabIndex={0}
            aria-current={active ? "true" : undefined}
            onClick={() => onSelectKind(entry.kind)}
            className={row(active)}
          >
            <span className={`flex-1 min-w-0 truncate text-base-app ${active ? "font-medium" : ""}`}>
              {entry.label}
            </span>
            <span className={tally(active)}>{counts[entry.of]}</span>
          </div>
        );
      })}

      <div className={grpClass}>Where</div>
      <div
        role="button"
        tabIndex={0}
        aria-current={place === null ? "true" : undefined}
        onClick={() => onSelectPlace(null)}
        className={row(place === null)}
      >
        <span
          className={`flex-1 min-w-0 truncate text-base-app ${place === null ? "font-medium" : ""}`}
        >
          Everywhere
        </span>
        <span className={tally(place === null)}>{counts.total}</span>
      </div>

      {counts.crossRepo > 0 && (
        <div
          role="button"
          tabIndex={0}
          aria-current={place === "cross" ? "true" : undefined}
          onClick={() => onSelectPlace("cross")}
          className={row(place === "cross")}
        >
          <span
            className={`flex-1 min-w-0 truncate text-base-app ${
              place === "cross" ? "font-medium" : ""
            }`}
          >
            Across repositories
          </span>
          <span className={tally(place === "cross")}>{counts.crossRepo}</span>
        </div>
      )}

      {places.map((entry) => {
        const active = place === entry.key;
        return (
          <div
            key={entry.key}
            role="button"
            tabIndex={0}
            aria-current={active ? "true" : undefined}
            onClick={() => onSelectPlace(entry.key)}
            title={entry.key === "global" ? undefined : entry.key}
            className={row(active)}
          >
            <span
              className={`flex-1 min-w-0 truncate text-base-app ${active ? "font-medium" : ""}`}
            >
              {entry.label}
            </span>
            <span className={tally(active)}>{entry.count}</span>
          </div>
        );
      })}
    </SourceListShell>
  );
}
