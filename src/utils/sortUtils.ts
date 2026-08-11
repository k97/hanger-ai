import { AssetItem, getSingularType, getRowState } from "../components/AssetRow";
import { SortField, SortDirection } from "../components/AssetHeaderRow";

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
