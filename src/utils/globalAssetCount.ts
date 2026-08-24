import type { CategoryCounts } from "../App";
import type { CategoryType } from "./filterPredicate";

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

/** Maps a facet category to its `CategoryCounts.byCategory` key — the same
 *  four arrays `filterPredicate` itself filters on. Shared by ProfilePane
 *  and RepoPane so the strip's per-category total reads the same backend
 *  field both places. "Agents" has no key of its own in `byCategory` (it
 *  rolls up skills/tools/rules already counted under their own keys), so it
 *  maps to `null` — callers fall back to the all-categories total for it. */
export function categoryCountKey(category: CategoryType): keyof CategoryCounts["byCategory"] | null {
  switch (category) {
    case "Skills":
      return "skill";
    case "Tools":
      return "tool";
    case "Rules":
      return "rule";
    case "Subagents":
      return "subagent";
    case "Agents":
      return null;
  }
}
