import { miniBtnClass, miniSetClass } from "./miniButton";
import type { StateFilter } from "../utils/linkStateCounts";
import type { ReviewIssue } from "../utils/reviewIssues";

/**
 * The review pill's action row, on both heroes.
 *
 * Extracted at the final review's Recommendation 2 (2026-08-28), once
 * Important 2's gate made ProfilePane's row and RepoPane's byte-identical
 * for the third time — `everyIssueFilterable` was already the second.
 *
 * The gate is the point of the component, not a detail of it. A pill can be
 * showing lines that no `ReviewIssue` produced: undeclared processes on the
 * Global hero, scan warnings on a project's. Those lines have no asset
 * behind them and nothing to open, so there is nowhere for `Needs review →`
 * to go — it used to route to a Needs review pane that then answered
 * "Nothing needs a decision". The popover IS their disclosure (the banners
 * they replace said the same, 2026-08-20), so with no issues this renders
 * nothing at all.
 */
export interface ReviewPillActionsProps {
  /** The issues behind the pill — NOT its lines. Empty renders nothing. */
  issues: ReviewIssue[];
  stateFilter?: StateFilter;
  onStateFilterChange?: (filter: StateFilter) => void;
  onReview?: (issue: ReviewIssue | null) => void;
}

export default function ReviewPillActions({ issues, stateFilter, onStateFilterChange, onReview }: ReviewPillActionsProps) {
  if (issues.length === 0) return null;

  /* `Show in list` applies `stateFilter = "needs-review"`, and `needsReview`
     (`linkStateCounts.ts:45-48`) is broken-or-drifted only. A duplicate is a
     relationship between assets, not a state one asset is in, so the filter
     cannot reach it — the button would offer to show a line it then filters
     out. It is withheld rather than the filter widened: `linkStateCounts.ts`
     states the position that `reviewIssues.ts` is the sole authority for how
     many need review, and two functions answering that would diverge
     (coordinator review, 2026-08-28, finding 1). */
  const everyIssueFilterable = !issues.some((i) => i.kind === "duplicate");

  return (
    <div className={miniSetClass}>
      {everyIssueFilterable && (
        <button
          type="button"
          aria-pressed={stateFilter === "needs-review"}
          onClick={() => onStateFilterChange?.(stateFilter === "needs-review" ? null : "needs-review")}
          className={miniBtnClass}
        >
          Show in list
        </button>
      )}
      <button type="button" onClick={() => onReview?.(issues[0] ?? null)} className={miniBtnClass}>
        Needs review →
      </button>
    </div>
  );
}
