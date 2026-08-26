import type { ProbeView } from "../utils/probeView";

/**
 * An answered probe. Pass only what the test cares about.
 *
 * `cost` defaults to omitted, not zeroed: `McpServerDetail.tsx` treats
 * "cost present" and "cost absent" as different states, not "cost absent"
 * and "cost zero" -- the Tools tab badge (`:705`) and the two `?? tools.length`
 * fallbacks (`:767`, `:864`) all key off `cost === undefined`, and the
 * "Context per request" ledger (`:730`, `:886`) renders only when `cost` is
 * truthy at all. A zeroed default would silently attach a badge/ledger a
 * caller who only set `tools` never asked for. A test that wants a real
 * (possibly zeroed) cost object passes one explicitly.
 */
export function probeAnswered(over: Partial<Extract<ProbeView, { kind: "answered" }>> = {})
  : ProbeView {
  return { kind: "answered", verifiedAt: 1_700_000_000_000, capabilities: [],
           tools: [], ...over };
}

/** A failed probe. Carries no cost, because the failed arm has none. */
export function probeFailed(error = "Probe failed"): ProbeView {
  return { kind: "failed", verifiedAt: 1_700_000_000_000, error };
}
