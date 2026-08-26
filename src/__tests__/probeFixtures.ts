import type { ProbeView, ToolCost } from "../utils/probeView";

const ZERO: ToolCost = { toolCount: 0, describedToolCount: 0,
  descriptionBytesTotal: 0, estimatedTokens: 0, perTool: [] };

/** An answered probe. Pass only what the test cares about. */
export function probeAnswered(over: Partial<Extract<ProbeView, { kind: "answered" }>> = {})
  : ProbeView {
  return { kind: "answered", verifiedAt: 1_700_000_000_000, capabilities: [],
           tools: [], cost: ZERO, ...over };
}

/** A failed probe. Carries no cost, because the failed arm has none. */
export function probeFailed(error = "Probe failed"): ProbeView {
  return { kind: "failed", verifiedAt: 1_700_000_000_000, error };
}
