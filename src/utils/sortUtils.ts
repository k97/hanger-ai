import { getRowState, type AssetItem } from "./listRowCopy";

/** What a list sorts by, and which way. The column header that clicked
 *  through them is gone (Task 4 of docs/plans/2026-11-26-global-list.md);
 *  App still keeps a sort and hands it to both panes. */
export type SortField = "name" | "kind" | "engine" | "state";
export type SortDirection = "asc" | "desc";

/** "Skills" → "Skill": the kind a category names, for sorting by kind. */
export function getSingularType(category: string): string {
  if (category.endsWith("s")) {
    return category.slice(0, -1);
  }
  return category;
}

export function sortAssetItems<T extends AssetItem>(
  items: T[],
  sortField: SortField,
  sortDirection: SortDirection
): T[] {
  const multiplier = sortDirection === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    let valA = "";
    let valB = "";

    switch (sortField) {
      case "name":
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
        break;
      case "kind":
        valA = getSingularType(a.category).toLowerCase();
        valB = getSingularType(b.category).toLowerCase();
        break;
      case "engine":
        valA = (a.engine || "Any agent").toLowerCase();
        valB = (b.engine || "Any agent").toLowerCase();
        break;
      case "state":
        valA = getRowState(a).word.toLowerCase();
        valB = getRowState(b).word.toLowerCase();
        break;
    }

    if (valA < valB) return -1 * multiplier;
    if (valA > valB) return 1 * multiplier;
    // Tie-breaker: Name ascending
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase()) * multiplier;
  });
}
