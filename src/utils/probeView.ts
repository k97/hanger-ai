export interface ToolCost {
  toolCount: number;
  describedToolCount: number;
  descriptionBytesTotal: number;
  estimatedTokens: number;
  /** Retained to document the wire shape; nothing in src/ reads it. */
  perTool: Array<{ name: string; descriptionBytes: number }>;
}

export interface ProbedTool {
  name: string;
  description?: string;
}

/**
 * The shape `mcp_cached_probe` returns for one registration — mirrors
 * `Flyout.tsx`'s inline `invoke<...>` type exactly, so a later task can type
 * that call against this instead of re-declaring it. `verifiedAt`,
 * `fromCache` and `declined` are required (the backend always sends them);
 * only `cost` is genuinely optional on the wire.
 */
export interface ProbeWire {
  result: {
    server_name?: string;
    server_version?: string;
    protocol_version?: string;
    capabilities: string[];
    tools: ProbedTool[];
    error?: string;
  } | null;
  verifiedAt: number | null;
  fromCache: boolean;
  declined: boolean;
  cost?: ToolCost | null;
}

export type ProbeView =
  | {
      kind: "answered";
      verifiedAt: number;
      serverVersion?: string;
      protocolVersion?: string;
      capabilities: string[];
      tools: ProbedTool[];
      cost?: ToolCost;
    }
  | { kind: "failed"; verifiedAt: number; error: string };

/**
 * Narrow the probe answer at the one place it crosses IPC.
 *
 * The wire shape carries `error` and `cost` as independent optionals, so it can
 * express four states where the backend produces three: a FAILED probe arrives
 * with both an error AND a zeroed cost, because `tool_cost` is built
 * unconditionally over an empty tool list (`lib.rs:609`, `probe.rs:92-97`).
 * Reading `?.cost` downstream therefore looks like a guard and is not one.
 * Splitting here means the failed arm has no cost to read.
 *
 * Returns null when the backend declined and had nothing cached: that is
 * neither an error nor an empty tool list, and the panel says so itself.
 *
 * Takes only `result` and `cost` — the two fields this function reads — so
 * `ProbeWire` itself can stay faithful to the full wire response (and the
 * `invoke` call can be typed against it) without forcing every fixture here
 * to carry fields this narrowing never looks at.
 */
export function parseProbe(
  wire: Pick<ProbeWire, "result" | "cost">,
  verifiedAt: number
): ProbeView | null {
  const answer = wire?.result ?? null;
  if (!answer) return null;
  if (answer.error) {
    return { kind: "failed", verifiedAt, error: answer.error };
  }
  return {
    kind: "answered",
    verifiedAt,
    serverVersion: answer.server_version,
    protocolVersion: answer.protocol_version,
    capabilities: answer.capabilities ?? [],
    tools: answer.tools ?? [],
    cost: wire.cost ?? undefined,
  };
}
