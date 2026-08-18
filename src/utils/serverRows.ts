/**
 * One row of the grouped MCP server list — the frontend's mirror of Rust's
 * `McpServerRow` (`src-tauri/src/mcp/servers.rs`), returned by the
 * `get_mcp_servers` command. `registration_count` and `distinct_spec_count`
 * are backend-owned; nothing here may call `.length` on `registrations` to
 * recompute either (`.claude/rules/invariants.md`, "Counts come from the
 * backend").
 */
export interface McpServerRow {
  name: string;
  transport: string;
  registration_count: number;
  distinct_spec_count: number;
  agreement: "Consistent" | "Conflicting" | "Duplicate";
  aliased_with: string[];
  /** Always `null` today — no fixture carries a plugin marketplace path yet
   *  (Task 5's disclosure). Render its chip only when non-null. */
  plugin: string | null;
  /** `{config_path}:{server_name}` per registration — the same
   *  `RegistrationKey` format `Tool.id` uses, so these strings can be
   *  cross-referenced against annotations keyed by registration. */
  registrations: string[];
}

import type { ServerSort } from "../components/ViewControl";
import type { EngineReachInfo } from "../components/EngineReachTiles";

/**
 * The card row's second line — one sentence built entirely from fields the
 * backend already computed, never recounted here. Absent below two
 * registrations: a lone registration has nothing to agree or conflict with,
 * so stating "1 registration · agree" would assert a comparison that never
 * happened.
 */
export function agreementLine(row: McpServerRow): string | undefined {
  if (row.registration_count <= 1) return undefined;
  const regPhrase = `${row.registration_count} registrations`;
  switch (row.agreement) {
    case "Conflicting":
      return `${regPhrase} · ${row.distinct_spec_count} different launch specs`;
    case "Duplicate":
      return `${regPhrase} · declared twice by the same engine`;
    case "Consistent":
    default:
      return `${regPhrase} · agree`;
  }
}

/** Worst-first, so a group with something to resolve leads the list. */
function attentionRank(agreement: McpServerRow["agreement"]): number {
  switch (agreement) {
    case "Conflicting":
      return 0;
    case "Duplicate":
      return 1;
    case "Consistent":
    default:
      return 2;
  }
}

/**
 * Sorts the grouped server rows for the View control's "Sort" choice.
 *
 * Only "attention" and "name" exist. A third option, "Tools, most first",
 * was cut before it shipped — see the doc comment on `ServerSort` in
 * `ViewControl.tsx` for why — rather than landing here as a silent fallback
 * to name order that a user could pick and see nothing explain.
 */
export function sortServerRows(rows: McpServerRow[], sort: ServerSort): McpServerRow[] {
  const byName = (a: McpServerRow, b: McpServerRow) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase());

  if (sort === "attention") {
    return [...rows].sort((a, b) => attentionRank(a.agreement) - attentionRank(b.agreement) || byName(a, b));
  }
  return [...rows].sort(byName);
}

/**
 * Unions per-engine reach across every registration one server groups.
 *
 * Annotations arrive keyed by REGISTRATION (`mcp::observe` and the reach
 * pipeline both work one config entry at a time), but a grouped row stands
 * for every registration of one server name at once. Showing only the first
 * registration's reach would under-report a server actually reached by
 * three engines as reached by one — actively wrong, not merely incomplete,
 * since the row's own agreement sentence states the registration count right
 * beside it. This is a set union over booleans the backend already computed,
 * never a new verdict: a reached mark from any registration wins for that
 * engine, matching what "is this server reachable via this engine" means.
 */
export function mergeReach(
  registrationKeys: string[],
  annotationsByAssetPath: Map<string, { reach: EngineReachInfo[] }>
): EngineReachInfo[] | null {
  const byEngine = new Map<number, EngineReachInfo>();
  let found = false;
  for (const key of registrationKeys) {
    const annotation = annotationsByAssetPath.get(key);
    if (!annotation) continue;
    found = true;
    for (const r of annotation.reach) {
      const existing = byEngine.get(r.engine_id);
      if (!existing || (!existing.reached && r.reached)) {
        byEngine.set(r.engine_id, r);
      }
    }
  }
  return found ? [...byEngine.values()] : null;
}
