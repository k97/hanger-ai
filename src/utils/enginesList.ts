import type { McpEngineSummaryData } from "../types/mcpEngineSummary";
import type { KeptOff } from "../types/engineContext";

/** One row of the Engines screen's source list: an id and the backend's name. */
export interface EngineListEntry {
  engine_id: string;
  engine_name: string;
}

/**
 * The engines the Engines screen lists: every engine that declares an MCP
 * server, in the summary's order, then any engine Hanger is keeping a
 * switched-off server for that the summary does not list — so an engine whose
 * servers are all off can still be reached (P8 of
 * docs/plans/2026-11-25-context-control-finish.md).
 *
 * `null` while neither reply has landed. It builds a list and counts nothing.
 */
export function enginesList(
  summary: McpEngineSummaryData | null,
  keptOff: KeptOff | null
): EngineListEntry[] | null {
  if (summary === null && keptOff === null) return null;
  const list: EngineListEntry[] = (summary?.rows ?? []).map((row) => ({
    engine_id: row.engine_id,
    engine_name: row.engine_name,
  }));
  const listed = new Set(list.map((e) => e.engine_id));
  for (const server of keptOff?.servers ?? []) {
    if (listed.has(server.engine_id)) continue;
    listed.add(server.engine_id);
    list.push({ engine_id: server.engine_id, engine_name: server.engine_name });
  }
  return list;
}
