import type { Inventory } from "../App";

/** The classification an asset row carries; mirrors AssetRow's getRowState
 *  so the rail badge, summary strip and rows can never disagree. */
export interface ReviewableAsset {
  link_state?: "linked" | "drifted" | "foreign" | "broken" | null;
  parse_status?: string;
  drifted?: boolean;
}

/** True when the asset would render as drifted, foreign or broken. */
export function needsReview(asset: ReviewableAsset): boolean {
  const state = asset.link_state;
  return (
    state === "broken" ||
    state === "drifted" ||
    state === "foreign" ||
    asset.parse_status === "failed" ||
    asset.drifted === true
  );
}

/** How many assets across the whole inventory need attention. */
export function needsReviewCount(inventory: Inventory | null): number {
  if (!inventory) return 0;
  return [
    ...inventory.skills,
    ...inventory.tools,
    ...inventory.rules,
    ...inventory.subagents,
  ].filter(needsReview).length;
}
