import {
  ArrowRightIcon,
  CheckIcon,
  Disc3Icon,
  FolderClockIcon,
  MonitorCheckIcon,
  RotateCcwIcon,
} from "./icons";
import GelMeter from "./GelMeter";
import { ScanStatusIndicator } from "./ScanStatusIndicator";
import {
  matchesIssueFilter,
  type IssueKind,
  type ReviewCounts,
  type ReviewIssue,
} from "../utils/reviewIssues";

interface NeedsReviewPaneProps {
  issues: ReviewIssue[];
  counts: ReviewCounts;
  kind: IssueKind | null;
  place: string | null;
  filterText: string;
  selectedId: string | null;
  onSelectKind: (kind: IssueKind | null) => void;
  onSelectPlace: (place: string | null) => void;
  onSelectIssue: (issue: ReviewIssue) => void;
  /** Same placement as the machine strip: the control that refreshes the
   *  figure sits beside it. */
  onRescan?: () => void;
  scanning?: boolean;
  /** When the last scan completed. "Nothing needs a decision" is a finding
   *  and needs a finished scan behind it; until then the pane says the scan
   *  is what stands between it and an answer. */
  scannedAt?: Date | null;
}

/** Kinds in the order they are worth acting on, with their strip vocabulary. */
const LEGEND: { kind: IssueKind; of: keyof ReviewCounts; word: string; dot: string }[] = [
  { kind: "broken", of: "broken", word: "broken", dot: "bg-state-danger" },
  { kind: "drifted", of: "drifted", word: "drifted", dot: "bg-state-warning" },
  { kind: "duplicate", of: "duplicate", word: "duplicated", dot: "border-2 border-line-2" },
  { kind: "parse", of: "parse", word: "won't parse", dot: "border-2 border-line-2 opacity-60" },
];

const PROBLEM_INK: Record<IssueKind, string> = {
  broken: "text-state-danger",
  drifted: "text-state-warning",
  duplicate: "text-ink-2",
  parse: "text-ink-2",
};

const chipBaseClass =
  "h-7 px-3.5 rounded-pill border border-line-2 font-flex text-small text-ink-2 whitespace-nowrap inline-flex items-center gap-2 cursor-pointer transition-colors duration-nav ease-spring hover:bg-plane-2";
const chipPressedClass =
  "h-7 pl-2.5 pr-3.5 rounded-pill border border-transparent bg-tint text-tint-ink font-medium whitespace-nowrap inline-flex items-center gap-2 cursor-pointer transition-colors duration-nav ease-spring font-flex text-small";

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/**
 * Needs review — every unresolved decision on the machine, in one list.
 *
 * The Source column is where a symlink stops being invisible: a linked asset
 * shows what it points at, so "broken" and "diverged" read as statements about
 * a relationship rather than as an opaque status word.
 */
export default function NeedsReviewPane({
  issues,
  counts,
  kind,
  place,
  filterText,
  selectedId,
  onSelectKind,
  onSelectPlace,
  onSelectIssue,
  onRescan,
  scanning = false,
  scannedAt = null,
}: NeedsReviewPaneProps) {
  const shown = issues.filter((issue) => matchesIssueFilter(issue, kind, place, filterText));
  const hasScanned = scannedAt !== null;

  // Places touched by what is on screen — the foot's second figure.
  const locations = new Set<string>();
  for (const issue of shown) {
    for (const key of issue.whereKeys) locations.add(key);
  }

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-page font-sans">
      <section
        aria-label="Review summary"
        className="mx-[18px] mt-[18px] px-4 py-3.5 border border-line rounded-plane shrink-0"
      >
        <div className="flex items-baseline gap-3 mb-3">
          <span
            data-testid="review-total"
            className="text-display font-medium tabular tracking-[-0.5px] leading-[1.1] text-ink-1"
          >
            {counts.total}
          </span>
          <span className="text-lg-app text-ink-2">
            {counts.total === 1 ? "thing needs a decision from you" : "things need a decision from you"}
          </span>
          {counts.crossRepo > 0 && (
            <span className="ml-auto font-flex text-micro text-ink-3">
              {counts.crossRepo} span more than one repository
            </span>
          )}
        </div>

        {counts.total > 0 && (
          /* The design system's meter. No aqua here on purpose: nothing in
             this strip is a linked share, and every kind keeps the ground it
             had — problems in state colours, the neutral kinds as glass in
             two depths. */
          <GelMeter
            label={`${counts.broken} broken, ${counts.drifted} drifted, ${counts.duplicate} duplicated, ${counts.parse} won't parse`}
            segments={LEGEND.map((entry) => ({
              key: entry.kind,
              value: counts[entry.of],
              barClass:
                entry.kind === "broken"
                  ? "bg-state-danger"
                  : entry.kind === "drifted"
                  ? "bg-state-warning"
                  : entry.kind === "duplicate"
                  ? "bg-line-2"
                  : "bg-line",
            }))}
          />
        )}

        <div className="flex items-center gap-4 mt-2.5 flex-wrap">
          {LEGEND.map((entry) =>
            counts[entry.of] > 0 ? (
              <button
                key={entry.kind}
                onClick={() => onSelectKind(kind === entry.kind ? null : entry.kind)}
                className="flex items-center gap-2 font-flex text-small text-ink-2 hover:text-ink-1 transition-colors duration-hover cursor-pointer"
              >
                <i className={`w-2 h-2 rounded-pill shrink-0 ${entry.dot}`} />
                <b className="font-medium tabular text-ink-1">{counts[entry.of]}</b> {entry.word}
              </button>
            ) : null
          )}

          <div className="ml-auto flex items-center gap-2">
            {onRescan && (
              <button
                onClick={onRescan}
                disabled={scanning}
                aria-label="Refresh scan"
                className="h-[30px] min-w-[108px] px-3.5 inline-flex items-center justify-center gap-2 rounded-pill border border-line-2 text-small font-medium text-ink-1 cursor-pointer transition-[background-color,transform] duration-hover ease-spring hover:bg-plane-2 active:scale-[0.96] disabled:opacity-50 disabled:cursor-default"
              >
                <RotateCcwIcon size={13} active={scanning} />
                {scanning ? "Scanning" : "Rescan"}
              </button>
            )}

            {counts.crossRepo > 0 && (
              <button
                onClick={() => onSelectPlace(place === "cross" ? null : "cross")}
                className="h-[30px] px-4 rounded-pill bg-fill text-on-fill text-small font-medium tabular cursor-pointer transition-[transform] duration-press ease-spring hover:-translate-y-px active:scale-[0.96] inline-flex items-center gap-1.5"
              >
                Show {counts.crossRepo} cross-repo
                <ArrowRightIcon size={13} />
              </button>
            )}
          </div>
        </div>
      </section>

      <div
        className="flex items-center gap-[7px] px-[18px] pt-3 pb-2.5 overflow-x-auto shrink-0"
        role="group"
        aria-label="Filter issues"
      >
        {[
          { id: null as string | null, label: "All", count: counts.total },
          { id: "repo", label: "Repo-level", count: counts.total - counts.crossRepo },
          { id: "cross", label: "Cross-repo", count: counts.crossRepo },
        ].map((chip) => {
          const pressed = place === chip.id;
          return (
            <button
              key={chip.label}
              tabIndex={0}
              aria-pressed={pressed}
              onClick={() => onSelectPlace(pressed ? null : chip.id)}
              className={pressed ? chipPressedClass : chipBaseClass}
            >
              {pressed && <CheckIcon size={14} className="shrink-0" />}
              <span>{chip.label}</span>
              <span
                className={`text-micro tabular ${pressed ? "text-tint-ink opacity-70" : "text-ink-3"}`}
              >
                {chip.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto mx-[18px] border border-line rounded-tl-plane rounded-tr-plane">
        <div
          data-testid="review-header-row"
          className="h-8 sticky top-0 z-[2] bg-page border-b border-line grid grid-cols-[1fr_150px_128px_1fr] gap-3 items-center px-3.5 font-flex text-micro tracking-[.06em] uppercase text-ink-3"
        >
          <span>Asset</span>
          <span>Problem</span>
          <span>Where</span>
          <span>Source</span>
        </div>

        {shown.length === 0 ? (
          <div
            className="py-9 px-3.5 flex flex-col items-center text-center text-small text-ink-3"
            data-testid={counts.total === 0 && !hasScanned ? "scan-pending" : undefined}
          >
            {counts.total === 0 &&
              (hasScanned ? (
                <MonitorCheckIcon size={40} className="text-ink-3 mb-2" />
              ) : scanning ? (
                <Disc3Icon size={40} active className="text-ink-3 mb-2" />
              ) : (
                <FolderClockIcon size={40} className="text-ink-3 mb-2" />
              ))}
            {/* Zero issues before the first scan finishes is not a clean
                machine, it is an unscanned one; the claim waits for scannedAt. */}
            <span>
              {counts.total === 0
                ? hasScanned
                  ? "Nothing needs a decision. Every link resolves and every file parses."
                  : scanning
                  ? "Scanning your machine. Anything that needs a decision shows up here once the scan finishes."
                  : "Not scanned yet. Rescan when you're ready."
                : "No issue matches that filter."}
            </span>
          </div>
        ) : (
          shown.map((issue) => {
            const selected = selectedId === issue.id;
            return (
              <div
                key={issue.id}
                role="row"
                tabIndex={0}
                data-selected={selected ? "true" : "false"}
                onClick={() => onSelectIssue(issue)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectIssue(issue);
                  }
                }}
                className={`h-8 mx-1.5 px-2.5 w-[calc(100%-12px)] grid grid-cols-[1fr_150px_128px_1fr] gap-3 items-center rounded-pill text-small cursor-pointer transition-colors duration-hover ease-spring ${
                  selected ? "bg-tint" : "hover:bg-plane-2"
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <i
                    data-testid="state-dot"
                    className={`w-2 h-2 rounded-pill shrink-0 ${
                      issue.kind === "broken"
                        ? "bg-state-danger"
                        : issue.kind === "drifted"
                        ? "bg-state-warning"
                        : "border-2 border-line-2"
                    }`}
                  />
                  <span
                    className={`truncate text-base-app ${
                      selected ? "font-medium text-tint-ink" : "text-ink-1"
                    }`}
                    title={issue.path}
                  >
                    {issue.name}
                  </span>
                </span>

                <span className={`font-flex truncate ${PROBLEM_INK[issue.kind]}`}>
                  {issue.problem}
                </span>

                <span className="font-flex text-ink-3 truncate" title={issue.whereKeys.join(", ")}>
                  {issue.whereLabel}
                </span>

                <span
                  className="font-flex text-ink-3 truncate"
                  title={issue.sourcePath ?? undefined}
                >
                  {issue.sourcePath ? `→ ${basename(issue.sourcePath)}` : "—"}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="h-[30px] shrink-0 flex items-center px-[18px] gap-4 font-flex text-micro text-ink-3">
        <span>
          {shown.length === counts.total
            ? `${counts.total} issues across ${locations.size} locations`
            : `${shown.length} of ${counts.total} issues`}
        </span>
        <span className="ml-auto">
          <ScanStatusIndicator />
        </span>
      </div>
    </div>
  );
}
