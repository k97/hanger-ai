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
  /** Backend-owned: the number of DISTINCT config files declaring this
   *  server (`mcp::servers::group_servers`), never the same as
   *  `registration_count`. One physical file can hold several registrations
   *  of one name — Claude Code's own `~/.claude.json` is named by three
   *  separate `SOURCES` rows — so this may not equal `registration_count`
   *  even though every fixture on this machine happens to have them agree.
   *  `agreementLine` renders this number; nothing here may recompute it by
   *  counting `registrations`. */
  file_count: number;
  agreement: "Consistent" | "Conflicting" | "Duplicate";
  aliased_with: string[];
  /** Always `null` today — no fixture carries a plugin marketplace path yet
   *  (Task 5's disclosure). Render its chip only when non-null. */
  plugin: string | null;
  /** `{config_path}:{server_name}` per registration — the same
   *  `RegistrationKey` format `Tool.id` uses, so these strings can be
   *  cross-referenced against annotations keyed by registration. */
  registrations: string[];
  /** The project a Local-tier (Claude Code's own per-project scope)
   *  registration in this group is keyed to, set by the backend only when
   *  the group ALSO carries a wider (machine-wide) registration of the same
   *  name — §6.3 state 9's "project-scope override of a user-scope name."
   *  Optional so fixtures written before this field existed keep
   *  typechecking; absent reads the same as `null` (no override). */
  project_override?: string | null;
  /** Backend-owned and cache-only: `mcp::probe`'s cache, keyed per launch,
   *  read once per group by `mcp::servers::apply_tool_counts` — never
   *  counted or derived here (`.claude/rules/invariants.md`, "Counts come
   *  from the backend"). `null`/absent means no probe has cached that
   *  launch yet, OR the row is `Conflicting`: two or more DISTINCT launches
   *  share this name, and the backend deliberately withholds a count rather
   *  than summing two alternative definitions' tools (false) or picking one
   *  arbitrarily (a coin flip presented as fact). Optional for the same
   *  reason `project_override` is: fixtures written before this field
   *  existed keep typechecking. */
  tool_count?: number | null;
}

import type { ServerSort } from "../components/ViewControl";
import type { EngineReachInfo } from "../components/EngineReachTiles";

/**
 * The card row's second line — one sentence built entirely from fields the
 * backend already computed, never recounted here. Absent below two
 * registrations: a lone registration has nothing to agree or conflict with,
 * so stating "Declared in 1 file, all identical" would assert a comparison
 * that never happened. The suppression guard reads `registration_count`, not
 * `file_count` — even a single file cannot yield a lone *registration*
 * agreeing with itself.
 *
 * The count in the sentence is `file_count`, never `registration_count`:
 * "declared in N files" must stay true even where a config format lets one
 * file carry several registrations of the same name (`file_count`'s own doc
 * comment on `McpServerRow`).
 */
export function agreementLine(row: McpServerRow): string | undefined {
  if (row.registration_count <= 1) return undefined;
  const noun = row.file_count === 1 ? "file" : "files";
  const filePhrase = `Declared in ${row.file_count} ${noun}`;
  switch (row.agreement) {
    case "Conflicting":
      return `${filePhrase} that disagree`;
    case "Duplicate":
      return `${filePhrase} by one engine`;
    case "Consistent":
    default:
      return `${filePhrase}, all identical`;
  }
}

/**
 * §6.3 state 9: a project-scope override of a user-scope name is a finding
 * to surface, never left to look like an ordinary duplicate or conflict.
 * `agreement_for` (backend) groups by engine alone, so a machine-wide and a
 * project-specific declaration of the same name already fold into
 * `agreementLine`'s `Duplicate` ("declared twice by the same engine") or
 * `Conflicting` verdict — neither of which says WHY there are two, and
 * `Duplicate` actively misnames a deliberate two-tier structure as a
 * redundant copy. `row.project_override` is the backend's own resolution of
 * which project's declaration is in play (`mcp::servers::group_servers`);
 * this only composes the sentence fragment around it.
 */
export function projectOverrideNote(row: McpServerRow): string | undefined {
  if (!row.project_override) return undefined;
  return `also declared for ${row.project_override} — the version used there`;
}

/**
 * The card row's whole second line: the agreement sentence, plus the
 * project-override note when one applies, joined the way a single sentence
 * with two clauses would be. Composing here (rather than folding the note
 * into `agreementLine` itself) keeps each function single-purpose —
 * `agreementLine` is purely the verdict, `projectOverrideNote` is purely the
 * scope finding — while the row still gets one combined line, matching
 * §5.6's "card rows, two lines" constraint.
 */
export function cardSecondLine(row: McpServerRow): string | undefined {
  const parts = [agreementLine(row), projectOverrideNote(row)].filter(
    (s): s is string => !!s
  );
  return parts.length > 0 ? parts.join(" · ") : undefined;
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
