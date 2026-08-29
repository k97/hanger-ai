import { useContext, useEffect, useRef } from "react";
import { formatEngineLabel } from "../utils/engineUtils";
import MechanismGlyph, { MechanismWord } from "./MechanismGlyph";
import EngineReachTiles, { EngineReachInfo } from "./EngineReachTiles";
import EngineLabel from "./EngineLabel";
import { SelectionOriginContext } from "./selectionOrigin";
import { ancestorReachNote } from "../utils/serverRows";

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
}

interface AssetRowProps {
  item: AssetItem;
  isSelected?: boolean;
  showKindColumn?: boolean;
  /** Present on panes that fetch backend annotations (the Global pane):
   *  switches the row to glyph + Reach tiles + Beyond the store. Null means
   *  the backend had no verdict for this row — the cells stay empty rather
   *  than invent one. Undefined keeps the legacy dot/state columns. */
  annotation?: AssetAnnotationView | null;
  /** "table" (default) is every other category's row. "card" is the MCP
   *  section's two-line row: name/transport/plugin, then the agreement
   *  sentence, with engine tiles and a tool-count stat pinned on the right
   *  instead of table cells (§5.6). */
  variant?: "table" | "card";
  onClick?: () => void;
  onLink?: () => void;
  onUnlink?: () => void;
}

/** The Beyond the store cell, written from the backend note alone. The
 *  count is the note's own; pluralisation is the only thing decided here. */
function beyondCell(annotation: AssetAnnotationView): { text: string; cls: string } {
  const note = annotation.beyond;
  if (note) {
    switch (note.kind) {
      case "broken":
        return { text: "Target missing", cls: "text-state-danger font-medium" };
      case "drifted":
        return { text: `Drifted in ${note.places.join(", ")}`, cls: "text-state-warning font-medium" };
      case "copies":
        return { text: `Tracked copy in ${note.count === 1 ? "1 project" : `${note.count} projects`}`, cls: "text-ink-2" };
      case "ancestor_reach":
        // Wording lives once, in `serverRows.ts`'s `ancestorReachNote` —
        // this variant's own cell and the card variant's second line
        // (`cardSecondLine`) both call it, so they cannot drift apart.
        return { text: ancestorReachNote(note) ?? "—", cls: "text-ink-2" };
      default:
        return { text: note.count === 1 ? "In 1 project" : `In ${note.count} projects`, cls: "text-ink-2" };
    }
  }
  const formatLimited = annotation.reach.some((r) => r.reason === "format");
  if (formatLimited) {
    const readers = annotation.reach.filter((r) => r.reached).map((r) => r.engine_name);
    if (readers[0]) {
      return { text: `${readers.join(", ")} only`, cls: "text-ink-2" };
    }
  }
  return { text: "—", cls: "text-ink-3" };
}

export function getSingularType(category: string): string {
  if (category.endsWith("s")) {
    return category.slice(0, -1);
  }
  return category;
}

export function getRowState(item: AssetItem) {
  const state = item.linkState ?? item.link_state ?? (
    item.parseStatus === "failed" ? "broken" :
    item.drifted ? "drifted" :
    (item.isSymlink || item.sourcePath) ? "linked" :
    null
  );

  // Rows stay neutral; the state carries all the colour (dot + word only).
  switch (state) {
    case "broken":
      return {
        dotClass: "w-2 h-2 bg-state-danger shrink-0",
        word: item.parseStatus === "failed" ? "Won't parse" : "Target missing",
        wordClass: "text-state-danger font-medium",
        rowClass: "hover:bg-plane-2",
      };
    case "drifted":
      return {
        dotClass: "w-2 h-2 bg-state-warning shrink-0",
        word: "Drifted · review",
        wordClass: "text-state-warning font-medium",
        rowClass: "hover:bg-plane-2",
      };
    case "foreign":
      return {
        dotClass: "w-2 h-2 bg-state-warning shrink-0",
        word: "Foreign",
        wordClass: "text-state-warning font-medium",
        rowClass: "hover:bg-plane-2",
      };
    case "linked":
      return {
        dotClass: "w-2 h-2 bg-state-success shrink-0",
        word: item.isSymlink ? "Symlinked" : (item.sourcePath ? "Tracked copy" : "Linked"),
        wordClass: "text-ink-2 font-normal",
        rowClass: "hover:bg-plane-2",
      };
    default:
      return {
        dotClass: "w-2 h-2 border-2 border-line-2 shrink-0",
        word: "Local only",
        wordClass: "text-ink-3 font-normal",
        rowClass: "hover:bg-plane-2",
      };
  }
}

export default function AssetRow({ item, isSelected, showKindColumn = true, annotation, variant = "table", onClick }: AssetRowProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  // Read at fire time, not tracked as a dependency: it is the origin of
  // whichever selection just happened, and the effect below only needs its
  // current value at the moment isSelected flips.
  const origin = useContext(SelectionOriginContext);

  // A selection made elsewhere — the search palette's pick, a restored
  // selection on mount — must bring its row into view. `nearest` is a no-op
  // for a row already on screen, so a plain click never scrolls. A palette
  // pick centres the row instead, so the landing spot reads as deliberate
  // rather than merely on-screen (Karthik's ruling, 2026-08-29).
  useEffect(() => {
    if (isSelected && typeof rootRef.current?.scrollIntoView === "function") {
      rootRef.current.scrollIntoView({ block: origin === "search" ? "center" : "nearest" });
    }
  }, [isSelected]);

  const { rowClass } = getRowState(item);
  const activeClass = isSelected ? "bg-tint" : rowClass;
  const nameColor = item.parseStatus === "failed"
    ? "text-ink-3"
    : isSelected
    ? "text-tint-ink font-medium"
    : "text-ink-1";

  /* The Tools section's row: two lines, no table cells. Line 1 carries
   * identity — name, transport, an optional plugin badge; line 2 states the
   * one fact worth stating about a server, that its registrations agree or
   * do not, as a sentence a cell cannot hold. The right side stays pinned at
   * the widths the section's own header uses (`Registered in` / `Tools`), so
   * engine marks and the tool-count stat still scan straight down the list.
   * No Kind slot: a card names its own kind by section, the way the diagram
   * in §5.6 has it (§5.6). */
  if (variant === "card") {
    return (
      <div
        ref={rootRef}
        onClick={onClick}
        tabIndex={0}
        data-selected={isSelected ? "true" : "false"}
        className={`flex items-center gap-3 mx-1.5 px-2.5 py-2 rounded-inner transition-colors duration-hover ease-spring cursor-pointer text-small font-sans focus:outline-none ${activeClass}`}
      >
        <div className="flex-1 min-w-0 flex flex-col gap-0.5 overflow-hidden">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`text-base-app ${nameColor} truncate`}>{item.name}</span>
            {item.transport && (
              <span className="shrink-0 text-micro font-mono bg-plane border border-line px-2 py-px rounded-pill text-ink-2">
                {item.transport}
              </span>
            )}
            {item.plugin && (
              <span className="shrink-0 text-micro font-mono bg-plane border border-line px-2 py-px rounded-pill text-ink-2">
                plugin · {item.plugin}
              </span>
            )}
          </div>
          {item.agreementLine && (
            <span className="text-small text-ink-3 truncate">{item.agreementLine}</span>
          )}
        </div>

        {/* Registered in — the same engine-reach tiles the annotated table
            rows use below: which engines register an MCP server is exactly
            what "reach" already means for one, so this reuses that data
            rather than inventing a second source for it. */}
        <span className="shrink-0 w-[100px] text-left hidden @[580px]:flex">
          {annotation ? <EngineReachTiles reach={annotation.reach} /> : null}
        </span>

        {/* Tools — `McpServerRow.tool_count`, filled from the probe cache.
            `null`/`undefined` (no probe cached yet, or a Conflicting row,
            which the backend always withholds a count for rather than
            summing or guessing between two distinct launches) keeps this
            component's existing convention for a cell with nothing to show
            (`beyondCell`'s default case, above), not a fabricated zero. */}
        <span
          className={`shrink-0 w-[150px] text-left text-small ${
            item.toolCount != null ? "text-ink-2" : "text-ink-3"
          }`}
        >
          {item.toolCount != null
            ? item.toolCount === 1
              ? "1 tool"
              : `${item.toolCount} tools`
            : "—"}
        </span>
      </div>
    );
  }

  const { dotClass, word, wordClass } = getRowState(item);
  const engineLabel = formatEngineLabel(item.engine);
  const annotated = annotation !== undefined;
  const beyond = annotation ? beyondCell(annotation) : null;

  return (
    <div
      ref={rootRef}
      onClick={onClick}
      tabIndex={0}
      data-selected={isSelected ? "true" : "false"}
      className={`flex items-center gap-3 h-8 mx-1.5 px-2.5 rounded-pill transition-colors duration-hover ease-spring cursor-pointer text-small font-sans focus:outline-none ${activeClass}`}
    >
      {/* 0: Mechanism glyph (annotated) or state dot + Name */}
      <div className="flex items-center gap-2.5 flex-1 min-w-[180px] overflow-hidden">
        {annotated ? (
          annotation ? (
            <MechanismGlyph mechanism={annotation.mechanism} places={annotation.beyond?.places} />
          ) : (
            /* The backend had no verdict for this row; an empty slot keeps
               the column honest and the names aligned. */
            <span className="w-3.5 shrink-0" aria-hidden="true" />
          )
        ) : (
          <div
            data-testid="state-dot"
            className={dotClass}
            style={{ borderRadius: "9999px" }}
            title={item.parseError || word}
          />
        )}
        <span className={`text-base-app ${nameColor} truncate`}>
          {item.name}
        </span>
      </div>

      {/* 1: Kind Column (90px) */}
      {showKindColumn && (
        <span className="text-small font-normal text-ink-3 font-flex shrink-0 w-[90px] text-left truncate hidden @[460px]:block">
          {getSingularType(item.category)}
        </span>
      )}

      {annotated ? (
        <>
          {/* 2: Reach — engine tiles, rendered from the backend list. */}
          <span className="shrink-0 w-[100px] text-left hidden @[580px]:flex">
            {annotation ? <EngineReachTiles reach={annotation.reach} /> : null}
          </span>

          {/* 3: Beyond the store — the backend note, count and all. */}
          <span className={`text-small font-flex shrink-0 w-[150px] text-left truncate ${beyond?.cls ?? ""}`}>
            {beyond?.text ?? ""}
          </span>
        </>
      ) : (
        <>
          {/* 2: Engine Column (110px) — the engine's mark then its name. */}
          <span className="text-small font-normal text-ink-3 font-flex shrink-0 w-[110px] text-left truncate hidden @[580px]:block">
            <EngineLabel engineKey={item.engine}>{engineLabel}</EngineLabel>
          </span>

          {/* 3: State Column (110px) */}
          <span className={`text-small font-flex shrink-0 w-[110px] text-left ${wordClass} truncate`}>
            {word}
          </span>
        </>
      )}
    </div>
  );
}
