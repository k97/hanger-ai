import { isGlobalScope, isRepoScope, type Scope } from "./scopeAccess";
import type { Inventory } from "../App";

/** The four render states a row can be in, plus the rail's review preset. */
export type LinkState = "linked" | "drifted" | "broken" | "local";
export type StateFilter = LinkState | "needs-review" | null;

/** The classification an asset row carries; mirrors AssetRow's getRowState
 *  so the rail badge, summary strip and rows can never disagree. Accepts
 *  both backend snake_case and AssetItem camelCase field spellings. */
export interface ReviewableAsset {
  link_state?: "linked" | "drifted" | "foreign" | "broken" | null;
  linkState?: "linked" | "drifted" | "foreign" | "broken" | null;
  parse_status?: string;
  parseStatus?: string;
  drifted?: boolean;
  is_symlink?: boolean;
  isSymlink?: boolean;
  source_path?: string;
  sourcePath?: string;
}

/** Same precedence as AssetRow.getRowState: broken beats drifted beats linked. */
export function classifyAsset(asset: ReviewableAsset): LinkState {
  const state = asset.link_state ?? asset.linkState;
  if (state === "broken" || (asset.parse_status ?? asset.parseStatus) === "failed") {
    return "broken";
  }
  if (state === "drifted" || state === "foreign" || asset.drifted === true) {
    return "drifted";
  }
  if (
    state === "linked" ||
    asset.is_symlink === true ||
    asset.isSymlink === true ||
    Boolean(asset.source_path ?? asset.sourcePath)
  ) {
    return "linked";
  }
  return "local";
}

/** True when the asset would render as drifted, foreign or broken. */
export function needsReview(asset: ReviewableAsset): boolean {
  const cls = classifyAsset(asset);
  return cls === "broken" || cls === "drifted";
}

export function matchesStateFilter(asset: ReviewableAsset, filter: StateFilter): boolean {
  if (filter === null) return true;
  if (filter === "needs-review") return needsReview(asset);
  return classifyAsset(asset) === filter;
}

/* The machine-wide "how many need review" figure lives in reviewIssues.ts —
   it also counts duplicates, which are a relationship between assets rather
   than a state one asset can be in. Two functions answering that question
   would eventually answer it differently. */

export type CountScope = { kind: "global" } | { kind: "repo"; root: string };

export interface StateCounts {
  linked: number;
  drifted: number;
  broken: number;
  local: number;
  total: number;
}

function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Splits the in-scope inventory by link state for the summary strip's bar.
 * This derives only the SPLIT — the authoritative asset total still comes
 * from the backend count command; scope filtering mirrors filterPredicate.
 */
export function linkStateCounts(inventory: Inventory | null, scope: CountScope): StateCounts {
  const counts: StateCounts = { linked: 0, drifted: 0, broken: 0, local: 0, total: 0 };
  if (!inventory) return counts;

  const inScope = (asset: { scope?: unknown }) =>
    scope.kind === "global"
      ? isGlobalScope(asset.scope as Scope)
      : isRepoScope(asset.scope as Scope, scope.root);

  const assets: ReviewableAsset[] = [
    ...dedupeBy(inventory.skills.filter(inScope), (s) => s.path),
    // By registration, not by config file: one file declares many servers.
    ...dedupeBy(inventory.tools.filter(inScope), (t) => t.id ?? `${t.config_path}-${t.name}`),
    ...dedupeBy(inventory.rules.filter(inScope), (r) => r.path),
    ...dedupeBy(inventory.subagents.filter(inScope), (sa) => sa.path),
  ];

  for (const asset of assets) {
    counts[classifyAsset(asset)] += 1;
    counts.total += 1;
  }
  return counts;
}
