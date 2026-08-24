import { registrationKey } from "./mcpRegistration";
import { isGlobalScope, isRepoScope, type Scope } from "./scopeAccess";
import type { CategoryType } from "./filterPredicate";
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

/** State split from backend annotations, for panes that receive them: the
 *  same category of derivation as linkStateCounts — a frontend split over
 *  backend-owned rows — but sourced from the backend's own mechanism words
 *  instead of re-classifying inventory fields. Directory-level links (ruled
 *  2026-08-15) only exist in the annotations, so this is what lets the strip
 *  say "linked" for a store mounted wholesale into projects. */
export function annotationStateCounts(
  annotations: Array<{ mechanism: string }>
): StateCounts {
  const counts: StateCounts = { linked: 0, drifted: 0, broken: 0, local: 0, total: 0 };
  for (const a of annotations) {
    if (a.mechanism === "broken") counts.broken += 1;
    else if (a.mechanism === "drift") counts.drifted += 1;
    else if (a.mechanism === "symlink" || a.mechanism === "copy") counts.linked += 1;
    else counts.local += 1;
    counts.total += 1;
  }
  return counts;
}

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
 *
 * `category` restricts the split to one of the four arrays filterPredicate
 * itself filters on ("Skills" | "Tools" | "Rules" | "Subagents"); null or
 * omitted keeps today's behaviour of counting all four. "Agents" is not one
 * of the four arrays this function ever drew from, so it counts nothing —
 * same as any other value outside the four.
 */
export function linkStateCounts(
  inventory: Inventory | null,
  scope: CountScope,
  category?: CategoryType | null
): StateCounts {
  const counts: StateCounts = { linked: 0, drifted: 0, broken: 0, local: 0, total: 0 };
  if (!inventory) return counts;

  const inScope = (asset: { scope?: unknown }) =>
    scope.kind === "global"
      ? isGlobalScope(asset.scope as Scope)
      : isRepoScope(asset.scope as Scope, scope.root);

  const wantsAll = category === undefined || category === null;
  const assets: ReviewableAsset[] = [
    ...(wantsAll || category === "Skills"
      ? dedupeBy(inventory.skills.filter(inScope), (s) => s.path)
      : []),
    ...(wantsAll || category === "Tools"
      ? dedupeBy(inventory.tools.filter(inScope), registrationKey)
      : []),
    ...(wantsAll || category === "Rules"
      ? dedupeBy(inventory.rules.filter(inScope), (r) => r.path)
      : []),
    ...(wantsAll || category === "Subagents"
      ? dedupeBy(inventory.subagents.filter(inScope), (sa) => sa.path)
      : []),
  ];

  for (const asset of assets) {
    counts[classifyAsset(asset)] += 1;
    counts.total += 1;
  }
  return counts;
}
