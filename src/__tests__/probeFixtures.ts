import type { ProbeView } from "../utils/probeView";

/**
 * An answered probe. Pass only what the test cares about.
 *
 * `cost` defaults to omitted, not zeroed: `McpServerDetail.tsx` treats
 * "cost present" and "cost absent" as different states, not "cost absent"
 * and "cost zero" -- the Tools tab badge, the two `?? tools.length` count
 * fallbacks, and both ledger gates ("Context per request") all key off
 * `cost === undefined` or truthiness, never a zeroed stand-in. A zeroed
 * default would silently attach a badge/ledger a caller who only set
 * `tools` never asked for. A test that wants a real (possibly zeroed) cost
 * object passes one explicitly.
 */
export function probeAnswered(over: Partial<Extract<ProbeView, { kind: "answered" }>> = {})
  : Extract<ProbeView, { kind: "answered" }> {
  return { kind: "answered", verifiedAt: 1_700_000_000_000, capabilities: [],
           tools: [], ...over };
}

/** A failed probe. Carries no cost, because the failed arm has none. */
export function probeFailed(error = "Probe failed"): Extract<ProbeView, { kind: "failed" }> {
  return { kind: "failed", verifiedAt: 1_700_000_000_000, error };
}
