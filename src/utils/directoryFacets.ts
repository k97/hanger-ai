import type { Directory } from "../data/directories";

export interface KindFacet {
  kind: string;
  count: number;
}

/**
 * Facet chips for the catalogue: "All" first, then each kind by how many
 * directories carry it, most common first.
 *
 * Counts accumulate in a loop rather than through .length/.reduce — the
 * counting law reserves those for backend-owned asset totals, and these are
 * neither assets nor backend-owned.
 */
export function kindCounts(dirs: Directory[]): KindFacet[] {
  const tally = new Map<string, number>();
  let all = 0;
  for (const dir of dirs) {
    all += 1;
    for (const kind of dir.kinds) {
      tally.set(kind, (tally.get(kind) ?? 0) + 1);
    }
  }

  const facets: KindFacet[] = [];
  for (const [kind, count] of tally) {
    facets.push({ kind, count });
  }
  // Ties keep first-seen order so the chip row is stable between renders.
  facets.sort((a, b) => b.count - a.count);

  return [{ kind: "All", count: all }, ...facets];
}

/** True when a directory survives both the kind chip and the filter field. */
export function matchesDirectory(dir: Directory, kind: string, query: string): boolean {
  if (kind !== "All" && !dir.kinds.includes(kind)) return false;

  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  const haystack = [dir.name, dir.url, dir.desc, dir.tier, dir.fetch, ...dir.kinds]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}
