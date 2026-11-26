import type { MechanismWord } from "../components/MechanismGlyph";
import type { EngineReachInfo } from "../components/EngineReachTiles";
import { formatEngineLabel } from "./engineUtils";
import { ancestorReachNote } from "./serverRows";

/** One asset's backend-derived annotation: the glyph word, the reach list,
 *  and the beyond-the-store note whose count is backend-owned. Arrives from
 *  get_asset_annotations and is rendered verbatim — the frontend never
 *  derives mechanism or reach from paths or link state (dispatch item 8). */
export interface AssetAnnotationView {
  asset_path: string;
  mechanism: MechanismWord;
  reach: EngineReachInfo[];
  beyond: { kind: string; count: number; places: string[]; using_count?: number } | null;
}

export interface AssetItem {
  /** A row identity, not an asset key. For an MCP row it is the registration
   *  key; the design-system samples use "sample-1". Anything resolving an
   *  asset by it must say which, per category — see `annotationFor` in
   *  ProfilePane. */
  id?: string;
  name: string;
  category: "Skills" | "Agents" | "Tools" | "Rules" | "Subagents" | "Skill" | "Tool" | "Rule" | "Agent" | "Subagent";
  path: string;
  engine?: string | null;
  version?: string;
  /** A skill's or subagent's own description, from its file
   *  (`Skill.description`, `Subagent.description`): ListRow's line 2. */
  description?: string;
  details?: string;
  drifted?: boolean;
  isSymlink?: boolean;
  scopeBadge?: string;
  sourcePath?: string;
  declaredTools?: string[];
  parseStatus?: string;
  parseError?: string;
  linkState?: "linked" | "drifted" | "foreign" | "broken" | null;
  link_state?: "linked" | "drifted" | "foreign" | "broken" | null;
  /** Card variant only (the MCP section): the connection type — a chip
   *  beside the name, never a column, because transport is a type, not a
   *  state (§5.6). Sourced from `Tool.transport` / `McpServerRow.transport`. */
  transport?: string;
  /** Card variant only: line 2 of the card, the agreement sentence
   *  ("Declared in 2 files that disagree"). The words are composed in
   *  `serverRows.ts`'s `agreementLine`, but only from a number and the
   *  verdict the backend already computed (`McpServerRow.file_count` /
   *  `.agreement`) — the frontend never counts or re-derives a verdict, only
   *  assembles the sentence around them. Absent renders no second line
   *  rather than a fabricated one. */
  agreementLine?: string;
  /** Card variant only: the plugin marketplace this server came bundled
   *  with, when known. Renders a chip only when present — `McpServerRow.plugin`
   *  is `None` for every row today, so no real data populates this yet. */
  plugin?: string;
  /** Card variant only: the Tools column stat, sourced straight from
   *  `McpServerRow.tool_count` — backend-owned and cache-only, never counted
   *  here. `null`/`undefined` means the backend has no answer (no probe has
   *  cached this launch yet, or the row is Conflicting and the backend
   *  deliberately withholds a count rather than summing or guessing between
   *  two distinct launches) and renders the existing dash convention, not a
   *  fabricated zero. */
  toolCount?: number | null;
  /** Card variant only, while Global is seen by one engine: that engine's
   *  cost for this server, as `switchCopy`'s `costLabel` prints it ("≈ 9,000
   *  tokens", or "Not measured"). Given, it takes the Tools column's place. */
  engineFigure?: string;
}


/** Line 2's right-hand figure, and the colour a state carries in it. */
export interface ListRowFigure {
  text: string;
  tone?: "danger" | "warning";
}

/**
 * A Global row's line 2, left side (Task 1 of
 * docs/plans/2026-11-26-global-list.md): a server's status sentence, or a
 * skill's or subagent's own description from its file. Nothing when there is
 * nothing to say, never a "—" (Review Focus 5).
 */
export function listRowDetail(item: AssetItem): string | undefined {
  const text = item.category === "Tools" || item.category === "Tool" ? item.agreementLine : item.description;
  const trimmed = text?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * A Global row's line 2, right side.
 *
 * A server's is the picked engine's token figure, or its tool count with All
 * engines (round 18 q1): both backend-owned, passed through, never counted
 * here. No figure when the backend has none.
 *
 * Every other row's is the beyond-the-store words the table's column printed,
 * moved here unchanged, except that an asset used in no project now says
 * "Global only" (round 18 q2) where the column printed "—". The count is the
 * backend note's own; pluralisation is the only thing decided here.
 */
export function listRowFigure(item: AssetItem, annotation: AssetAnnotationView | null): ListRowFigure | undefined {
  if (item.category === "Tools" || item.category === "Tool") {
    if (item.engineFigure !== undefined) return { text: item.engineFigure };
    if (item.toolCount == null) return undefined;
    return { text: item.toolCount === 1 ? "1 tool" : `${item.toolCount} tools` };
  }
  if (!annotation) return undefined;
  const note = annotation.beyond;
  if (note) {
    switch (note.kind) {
      case "broken":
        return { text: "Target missing", tone: "danger" };
      case "drifted":
        return { text: `Drifted in ${note.places.join(", ")}`, tone: "warning" };
      case "copies":
        return { text: `Tracked copy in ${note.count === 1 ? "1 project" : `${note.count} projects`}` };
      case "ancestor_reach": {
        const text = ancestorReachNote(note);
        return text ? { text } : undefined;
      }
      default:
        return { text: note.count === 1 ? "In 1 project" : `In ${note.count} projects` };
    }
  }
  if (annotation.reach.some((r) => r.reason === "format")) {
    const readers = annotation.reach.filter((r) => r.reached).map((r) => r.engine_name);
    if (readers[0]) return { text: `${readers.join(", ")} only` };
  }
  return { text: "Global only" };
}

/**
 * A row's link state, as the State column printed it, and the colour its
 * word carried. Moved from `AssetRow.tsx` with Task 4 of
 * docs/plans/2026-11-26-global-list.md: the words and the precedence are
 * unchanged (broken beats drifted beats linked; `linkStateCounts`'
 * `classifyAsset` reads the same order). The class strings it returned
 * (a dot, a word colour, a hover) drew the retired table's cells; a list
 * row needs only the word and whether it is a danger or a warning.
 */
export function getRowState(item: AssetItem): { word: string; tone?: "danger" | "warning" } {
  const state = item.linkState ?? item.link_state ?? (
    item.parseStatus === "failed" ? "broken" :
    item.drifted ? "drifted" :
    (item.isSymlink || item.sourcePath) ? "linked" :
    null
  );

  switch (state) {
    case "broken":
      return { word: item.parseStatus === "failed" ? "Won't parse" : "Target missing", tone: "danger" };
    case "drifted":
      return { word: "Drifted · review", tone: "warning" };
    case "foreign":
      return { word: "Foreign", tone: "warning" };
    case "linked":
      return { word: item.isSymlink ? "Symlinked" : (item.sourcePath ? "Tracked copy" : "Linked") };
    default:
      return { word: "Local only" };
  }
}

/** A repository row's line 2, left side (Task 4): the Engine column's word,
 *  "Any agent" where no engine owns the asset (`formatEngineLabel`). */
export function repoRowDetail(item: AssetItem): string {
  return formatEngineLabel(item.engine);
}

/** A repository row's line 2, right side (Task 4): the State column's word,
 *  in its colour. A repository has no backend annotation to read, so the
 *  row's own link state is what it says, as the column did. */
export function repoRowFigure(item: AssetItem): ListRowFigure {
  const { word, tone } = getRowState(item);
  return tone ? { text: word, tone } : { text: word };
}
