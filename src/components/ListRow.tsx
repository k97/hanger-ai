import { useContext, useEffect, useRef, type KeyboardEvent } from "react";
import EngineReachTiles, { type EngineReachInfo, type TileSwitch } from "./EngineReachTiles";
import { KIND_ICON } from "./InspectorCap";
import { SelectionOriginContext } from "./selectionOrigin";

export type ListRowKind = "skill" | "rule" | "subagent" | "server";

const ICON_FOR = {
  skill: KIND_ICON.Skills,
  rule: KIND_ICON.Rules,
  subagent: KIND_ICON.Subagents,
  server: KIND_ICON.Tools,
} as const;

/** A server's transport, beside its engine marks. Capped at 160px and cut
 *  with an ellipsis, so a long URL's domain gives way before the name does
 *  (the card row's F4 rule, 2026-11-25, kept). */
const chipClass =
  "max-w-40 truncate text-micro font-mono bg-plane border border-line px-2 py-px rounded-pill text-ink-2";

const toneClass = {
  danger: "text-state-danger font-medium",
  warning: "text-state-warning font-medium",
} as const;

export interface ListRowProps {
  kind: ListRowKind;
  name: string;
  /** Servers only: the transport chip. */
  chip?: string;
  /** Line 2, left: a description or a status sentence. Absent draws nothing. */
  detail?: string;
  /** Line 2, right: where else the asset is, or a server's figure. */
  figure?: string;
  figureTone?: "danger" | "warning";
  /** The engine marks, line 1 right. `null`: the backend gave no verdict. */
  reach: EngineReachInfo[] | null;
  /** Given on MCP servers rows only: each tile's switch (EngineReachTiles). */
  switchFor?: (r: EngineReachInfo) => TileSwitch | null;
  /** The engine Global is seen by, whose tile leads. */
  leadEngine?: string | null;
  /** A file that will not parse: the name recedes, as the table's did. */
  muted?: boolean;
  selected: boolean;
  onSelect: () => void;
}

/**
 * One row of Global's list (Task 1 of docs/plans/2026-11-26-global-list.md),
 * after T3 Code's two-line PullRequestListRow and its sidebar rows: the kind's
 * icon, then line 1, the name (13px medium, round 18 q3) and on the right the
 * transport chip and the engine marks; line 2, muted, the detail and on the
 * right one figure. No column headers name any of it.
 *
 * The name truncates; the right slot and the figure never wrap or shrink
 * (Review Focus 1). Hover is `plane`; selected is T3's: the page colour and
 * an inset `line-2` ring. Focus shows through the global `:focus-visible`
 * ring, and Enter selects (Review Focus 4).
 */
export default function ListRow({
  kind,
  name,
  chip,
  detail,
  figure,
  figureTone,
  reach,
  switchFor,
  leadEngine,
  muted = false,
  selected,
  onSelect,
}: ListRowProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const origin = useContext(SelectionOriginContext);

  // A selection made elsewhere (the search palette, a restored selection)
  // brings its row into view, as AssetRow's did: `nearest` never scrolls a
  // row already on screen, and a palette pick centres it.
  useEffect(() => {
    if (selected && typeof rootRef.current?.scrollIntoView === "function") {
      rootRef.current.scrollIntoView({ block: origin === "search" ? "center" : "nearest" });
    }
  }, [selected]);

  // Only the row's own key: Enter on a tile switch inside it is the tile's.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" && e.target === e.currentTarget) {
      e.preventDefault();
      onSelect();
    }
  };

  const Icon = ICON_FOR[kind];

  return (
    <div
      ref={rootRef}
      data-testid="list-row"
      data-kind={kind}
      data-selected={selected ? "true" : "false"}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={`flex items-start gap-2.5 px-2.5 py-[7px] rounded-[6px] cursor-pointer font-sans transition-colors duration-hover ease-spring ${
        selected ? "bg-page ring-1 ring-inset ring-line-2" : "hover:bg-plane"
      }`}
    >
      <span className="flex items-center h-[22px] shrink-0 text-ink-3">
        <Icon size={16} aria-hidden="true" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 h-[22px] min-w-0">
          <span
            data-testid="list-row-name"
            className={`flex-1 min-w-0 truncate text-base-app font-medium ${muted ? "text-ink-3" : "text-ink-1"}`}
          >
            {name}
          </span>
          <span data-testid="list-row-trail" className="flex items-center gap-2 shrink-0 whitespace-nowrap">
            {chip && (
              <span data-testid="list-row-chip" className={chipClass}>
                {chip}
              </span>
            )}
            {reach && <EngineReachTiles reach={reach} switchFor={switchFor} leadEngine={leadEngine} />}
          </span>
        </div>
        {(detail || figure) && (
          <div className="flex items-center gap-1.5 mt-px min-w-0">
            {detail && (
              <span data-testid="list-row-detail" className="min-w-0 truncate text-small text-ink-3">
                {detail}
              </span>
            )}
            {figure && (
              <span
                data-testid="list-row-figure"
                className={`ml-auto shrink-0 whitespace-nowrap tabular text-small ${figureTone ? toneClass[figureTone] : "text-ink-3"}`}
              >
                {figure}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
