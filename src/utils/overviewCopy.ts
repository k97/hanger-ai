/**
 * The overview card's strings and its one ordering
 * (docs/plans/2026-11-26-overview-card.md, "Strings", approved by Karthik as
 * written in round 14 q5, 2026-11-26). The engine section's lines are
 * `switchCopy`'s and stay there: `engineStripHeadline`, `budgetCaption` (by
 * way of `engineBandFigures`), `MEASURE_ALL_CAPTION`. No engine name is
 * written here; every figure is the backend's.
 */

import type { EngineContext } from "../types/engineContext";
import { measuredBudget, NOT_MEASURED_FIGURE } from "./switchCopy";

/** The first section's head and its caption. Every figure under it is an
 *  engine's `on_tokens_measured`. */
export const ENGINES_HEAD = "Engines";
export const ENGINES_CAPTION = "tokens every session";

/** A repository card's first section: the engines that reach it, by count. */
export const ENGINE_COUNTS_HEAD = "By engine";

/** The row above the engines, which picks none of them. */
export const ALL_ENGINES = "All engines";

/** The second section's head with All engines picked (round 14 q2). */
export const STORE_HEAD = "The global store";

/** The content cap's button: its tooltip and its accessible name, by what
 *  a press does. ⌘E is the shortcut that does the same. */
export function overviewButtonLabel(open: boolean): string {
  return open ? "Hide overview  ⌘E" : "Show overview  ⌘E";
}

/** The store total, as the old summary's backend-owned figure. */
export function storeAssetsLabel(n: number): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? "asset" : "assets"}`;
}

/**
 * A token figure short enough for an 80px cell: 13598 is "13.6k". One
 * decimal from a thousand up, and millions from the point where the
 * thousands would round to "1000.0k".
 */
export function compactTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 999_950) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** An engine row's value: "≈ 13.6k", or "Not measured" where
 *  `measuredBudget` finds no figure (servers on and none measured). */
export function engineRowValue(ctx: EngineContext): string {
  const tokens = measuredBudget(ctx);
  return tokens === null ? NOT_MEASURED_FIGURE : `≈ ${compactTokens(tokens)}`;
}

/**
 * The engines as the card lists them: heaviest `on_tokens_measured` first,
 * the engines with no figure after every one with a figure (a true zero
 * included), and a tie broken by name. A sort, not a count: no figure is
 * added up here. Returns a new array.
 */
export function rankEngines(engines: EngineContext[]): EngineContext[] {
  return [...engines].sort((a, b) => {
    const ta = measuredBudget(a);
    const tb = measuredBudget(b);
    if (ta !== tb) {
      if (ta === null) return 1;
      if (tb === null) return -1;
      return tb - ta;
    }
    return a.engine_name.localeCompare(b.engine_name);
  });
}
