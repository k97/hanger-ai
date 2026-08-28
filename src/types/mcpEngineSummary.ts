export interface McpEngineSummaryRow {
  engine_id: string;
  engine_name: string;
  /** Distinct servers this engine registers. */
  server_count: number;
  /**
   * Sum of tool counts across this engine's PROBED launches only. `null`
   * means none of them have been asked yet — unknown, never a zero the
   * screen would have to explain away.
   */
  tools_known: number | null;
}

export interface McpEngineSummaryData {
  rows: McpEngineSummaryRow[];
  /** `rows.length`, as a backend field — the strip's subtitle prints it. */
  host_count: number;
  /**
   * Sum of `tools_known` over the rows that have one; `null` when no row
   * has one. A launch two hosts share counts once per host.
   */
  tools_known_total: number | null;
  /**
   * `answered_server_count + unasked_server_count + unaskable_server_count`
   * — a backend field, not a sum this component performs. Fix round 1
   * (2026-08-20): the previous shape asked the frontend to add two backend
   * counts together for its own denominator, which technically passed
   * `no-frontend-counting`'s `.length` guard while still breaking the rule
   * it exists to serve.
   */
  total_server_count: number;
  /** (host, server name) pairs with at least one probed launch. */
  answered_server_count: number;
  /** (host, server name) pairs that could be asked and have not been. */
  unasked_server_count: number;
  /**
   * (host, server name) pairs nothing could ever ask — an account-level
   * connector, or any other declaration with no local process to start and
   * no endpoint to dial. Kept apart from `unasked_server_count`: there is
   * no Verify button that ever changes this one.
   */
  unaskable_server_count: number;
  /** Servers whose registering hosts disagree on the launch spec — the
   *  strip's MCP-mode Review pill filters the grouped list to these
   *  (`row.agreement === "Conflicting"`). A backend field
   *  (`mcp::engine_summary::engine_summary`), not a count of anything the
   *  frontend already has grouped rows for. */
  conflicting_server_count: number;
}
