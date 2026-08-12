import type { CategoryCounts } from "../App";

// The single formula for "how many global assets" — used by both the
// sidebar profile badge and the profile pane so they cannot disagree.
export function sumGlobalAssets(counts: CategoryCounts | null | undefined): number {
  if (!counts) return 0;
  return (
    (counts.byCategory.skill?.global ?? 0) +
    (counts.byCategory.tool?.global ?? 0) +
    (counts.byCategory.rule?.global ?? 0) +
    (counts.byCategory.subagent?.global ?? 0)
  );
}
