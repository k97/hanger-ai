import { useRef, type ReactNode } from "react";
import {
  ArchiveBoxIcon,
  ArrowRightIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  LinkIcon,
  ServerIcon,
  SkillIcon,
  Square2StackIcon,
  UserIcon,
  XMarkIcon,
} from "./icons";
import ListCard, { ListCardRow } from "./ListCard";
import Tooltip from "./Tooltip";
import EngineLabel from "./EngineLabel";
import FindingChip from "./FindingChip";
import { miniBtnClass, miniSetClass } from "./miniButton";
import type {
  EdgeState,
  GraphNode,
  LinkMapSelection,
  PositionedEdge,
} from "../utils/linkMapLayout";

/**
 * A thing the map has to say about itself. Built where the graph is read;
 * this card and the banner strip are the two places it renders, so neither
 * restates the other's copy.
 */
export interface MapNotice {
  id: string;
  variant: "warning" | "info";
  summary: string;
  detail: ReactNode;
}

interface LinkMapPlacecardProps {
  selection: LinkMapSelection;
  nodes: GraphNode[];
  /** Read only by the notices body; the pane owns the list. */
  notices: MapNotice[];
  onClose: () => void;
  /** Project nodes only: jump to the repository's own view. */
  onOpenProject: (path: string) => void;
  /** Engine roots only: Global, filtered to this engine, in the inspector. */
  onShowEngineAssets: (engineName: string) => void;
  /** The node's faulty edges, restated as the map already draws them; empty means no chip. */
  findings: string[];
  findingSeverity: "warning" | "danger";
  /** Needs review →: every finding routes there. */
  onReview: () => void;
}

const STATE_LINE: Record<EdgeState, string> = {
  linked: "Resolves to its source",
  drifted: "The copy no longer matches its source",
  dangling: "Points at nothing that exists",
};

const STATE_INK: Record<EdgeState, string> = {
  linked: "text-ink-2",
  drifted: "text-state-warning",
  dangling: "text-state-danger",
};

const STATE_DOT: Record<EdgeState, string> = {
  linked: "bg-state-success",
  drifted: "bg-state-warning",
  dangling: "bg-state-danger",
};

const NODE_KIND_LABEL: Record<GraphNode["kind"], string> = {
  store: "Canonical store",
  engine_root: "Engine root",
  project: "Project",
};

/** One dock, one shape — whatever the card is showing. */
const cardClass =
  "absolute left-3 top-3 bottom-3 w-[300px] z-20 flex flex-col bg-page border border-line rounded-plane overflow-hidden shadow-overlay";

function PathChip({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 bg-plane rounded-inner pl-2.5 pr-1.5 py-2 font-mono text-micro text-ink-2">
      <span className="flex-1 min-w-0 truncate">{text}</span>
      <Tooltip label="Copy path" placement="bottom">
        <button
          aria-label="Copy path"
          onClick={() => navigator.clipboard?.writeText(text).catch(() => {})}
          className="p-1 rounded-pill grid place-items-center text-ink-3 hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover cursor-pointer"
        >
          <Square2StackIcon size={13} aria-hidden="true" />
        </button>
      </Tooltip>
    </div>
  );
}

/**
 * The Maps-style detail card: docked inside the canvas, next to whatever
 * was clicked — the map's only detail surface, since the map view carries
 * no inspector column. Deliberately NO provenance on either body: nothing
 * records who created a link or when, and inventing that was a defect in
 * the prototype this view replaced.
 */
export default function LinkMapPlacecard({
  selection,
  nodes,
  notices,
  onClose,
  onOpenProject,
  onShowEngineAssets,
  findings,
  findingSeverity,
  onReview,
}: LinkMapPlacecardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const closeButton = (
    <button
      onClick={onClose}
      aria-label="Close details"
      className="shrink-0 w-[27px] h-[27px] rounded-pill grid place-items-center text-ink-3 hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover ease-spring cursor-pointer"
    >
      <XMarkIcon size={13} aria-hidden="true" />
    </button>
  );

  // Notices dock in the same card as a node or an edge. They are the map
  // talking about itself, so they get the same surface, not a second one.
  if (selection.kind === "notices") {
    const worst = notices.some((n) => n.variant === "warning") ? "warning" : "info";

    return (
      <div data-testid="map-placecard" className={cardClass}>
        <div className="px-4 pt-3.5 pb-3 border-b border-line shrink-0">
          <div className="flex items-center gap-2 font-flex text-micro tracking-[.06em] uppercase text-ink-3 mb-1.5">
            <span>Map</span>
            <span>·</span>
            <span>Notices</span>
            <span className="ml-auto">{closeButton}</span>
          </div>
          <h2 className="text-base-app font-medium tracking-[-0.2px] text-ink-1 mb-1.5">
            {worst === "warning" ? "Not everything could be drawn" : "About this map"}
          </h2>
          <div className="flex items-center gap-[7px]">
            <i
              className={`w-2 h-2 rounded-pill shrink-0 ${
                worst === "warning" ? "bg-state-warning" : "bg-state-success"
              }`}
            />
            <span className="font-flex text-small text-ink-2">
              {worst === "warning"
                ? "Recorded links the map had to leave out"
                : "Nothing is wrong — context for what you see"}
            </span>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {notices.map((notice) => (
            <div
              key={notice.id}
              data-testid={`map-notice-${notice.id}`}
              className="mx-4 mt-3 last:mb-3.5 px-3 py-2.5 bg-plane rounded-inner"
            >
              <div
                className={`flex items-start gap-1.5 font-flex text-small font-medium ${
                  notice.variant === "warning" ? "text-state-warning" : "text-ink-1"
                }`}
              >
                {notice.variant === "warning" ? (
                  <ExclamationTriangleIcon size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
                ) : (
                  <InformationCircleIcon size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
                )}
                <span>{notice.summary}</span>
              </div>
              <div className="pt-1.5">{notice.detail}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (selection.kind === "edge") {
    const edge: PositionedEdge = selection.edge;
    const source = nodes.find((n) => n.id === edge.source);
    const dest = nodes.find((n) => n.id === edge.dest);
    const mechanismName = edge.mechanism === "symlink" ? "Symlink" : "Tracked copy";
    const pathLine = edge.dest_path ?? `${source?.path ?? "?"} → ${dest?.path ?? "?"}`;
    const countLabel = dest?.kind === "engine_root" ? "Root-level symlinks" : "Assets travelling";

    return (
      <div
        data-testid="map-placecard"
        className={cardClass}
      >
        <div className="px-4 pt-3.5 pb-3 border-b border-line shrink-0">
          <div className="flex items-center gap-2 font-flex text-micro tracking-[.06em] uppercase text-ink-3 mb-1.5">
            <span>Edge</span>
            <span>·</span>
            <span>{mechanismName}</span>
            <span className="ml-auto">{closeButton}</span>
          </div>
          <h2 className="text-base-app font-medium tracking-[-0.2px] text-ink-1 mb-1.5 flex items-center gap-1.5 min-w-0">
            {/* Only an engine root gets a mark — store and project labels are
                directory names, not products. */}
            {source?.kind === "engine_root" ? (
              <EngineLabel engineKey={source.label} size={14}>
                {source.label}
              </EngineLabel>
            ) : (
              <span className="truncate">{source?.label ?? "?"}</span>
            )}{" "}
            <span aria-hidden="true">→</span>{" "}
            {dest?.kind === "engine_root" ? (
              <EngineLabel engineKey={dest.label} size={14}>
                {dest.label}
              </EngineLabel>
            ) : (
              <span className="truncate">{dest?.label ?? "?"}</span>
            )}
          </h2>
          <div className="flex items-center gap-[7px]">
            <i className={`w-2 h-2 rounded-pill shrink-0 ${STATE_DOT[edge.state]}`} />
            <span className={`font-flex text-small ${STATE_INK[edge.state]}`}>
              {STATE_LINE[edge.state]}
            </span>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="mx-4 mt-3">
            <PathChip text={pathLine} />
          </div>
          <ListCard className="mx-4 my-3">
            <ListCardRow
              data-testid="placecard-row-count"
              label={countLabel}
              value={<span className="tabular">{edge.count}</span>}
            />
            <ListCardRow
              data-testid="placecard-row-from"
              label="From"
              value={<span className="break-all whitespace-normal">{source?.path ?? "?"}</span>}
            />
            <ListCardRow
              data-testid="placecard-row-into"
              label="Into"
              value={<span className="break-all whitespace-normal">{edge.dest_path ?? dest?.path ?? "?"}</span>}
            />
          </ListCard>
          {dest?.kind === "engine_root" && (
            <p className="mx-4 mb-3.5 px-3 py-2.5 bg-plane rounded-inner text-small text-ink-2 leading-[1.6]">
              One symlink at the root does the work of many individual deployments: anything
              added to the store is visible to {dest.label} immediately, with nothing to re-run.
            </p>
          )}
        </div>
      </div>
    );
  }

  const node = selection.node;
  const statusLine =
    node.kind === "store"
      ? "The canonical copy of every asset lives here"
      : node.kind === "project"
      ? "A linked directory Hanger scans"
      : node.linked
      ? "Reaches the store through a root-level symlink"
      : "Nothing at this root points into the store";

  return (
    <div
      ref={cardRef}
      data-testid="map-placecard"
      className={cardClass}
    >
      <div className="px-4 pt-3.5 pb-3 border-b border-line shrink-0">
        <div className="flex items-center gap-2 font-flex text-micro tracking-[.06em] uppercase text-ink-3 mb-1.5">
          <span>Node</span>
          <span>·</span>
          <span>{NODE_KIND_LABEL[node.kind]}</span>
          <span className="ml-auto">{closeButton}</span>
        </div>
        <div className="flex items-center gap-2 mb-1.5">
          <h2 className="text-base-app font-medium tracking-[-0.2px] text-ink-1 flex items-center gap-1.5 min-w-0">
            {node.kind === "engine_root" ? (
              <EngineLabel engineKey={node.label} size={14}>
                {node.label}
              </EngineLabel>
            ) : (
              node.label
            )}
          </h2>
          {/* Drawn only for a node with a finding: a chip that is always
              there stops meaning anything. The dot on the canvas says which
              node; the chip states the count; the popover lists what and
              names where it goes. */}
          {findings.length > 0 && (
            <FindingChip
              severity={findingSeverity}
              lines={findings}
              onReview={onReview}
              elevated={false}
              clampTo={cardRef}
            />
          )}
        </div>
        <div className="flex items-center gap-[7px]">
          {node.kind === "engine_root" && (
            <i
              className={`w-2 h-2 rounded-pill shrink-0 ${
                node.linked ? "bg-state-success" : "border-2 border-line-2"
              }`}
            />
          )}
          <span className="font-flex text-small text-ink-2">{statusLine}</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-4 mt-3">
          <PathChip text={node.path} />
        </div>
        {/* The section format: one bordered card of icon · label · value
            rows, a kind row only when the root holds that kind. No Kind row —
            the eyebrow names it — and no Linked row — the state line says it. */}
        <ListCard className="mx-4 my-3">
          <ListCardRow
            data-testid="placecard-row-assets"
            icon={<ArchiveBoxIcon size={14} aria-hidden="true" />}
            label="Assets"
            value={<span className="tabular">{node.asset_count}</span>}
          />
          {node.skill_count > 0 && (
            <ListCardRow
              data-testid="placecard-row-skills"
              icon={<SkillIcon size={14} aria-hidden="true" />}
              label="Skills"
              value={<span className="tabular">{node.skill_count}</span>}
            />
          )}
          {node.rule_count > 0 && (
            <ListCardRow
              data-testid="placecard-row-rules"
              icon={<DocumentTextIcon size={14} aria-hidden="true" />}
              label="Rules"
              value={<span className="tabular">{node.rule_count}</span>}
            />
          )}
          {node.subagent_count > 0 && (
            <ListCardRow
              data-testid="placecard-row-subagents"
              icon={<UserIcon size={14} aria-hidden="true" />}
              label="Subagents"
              value={<span className="tabular">{node.subagent_count}</span>}
            />
          )}
          {node.tool_count > 0 && (
            <ListCardRow
              data-testid="placecard-row-tools"
              icon={<ServerIcon size={14} aria-hidden="true" />}
              label="MCP servers"
              value={<span className="tabular">{node.tool_count}</span>}
            />
          )}
          {node.kind === "store" && (
            <ListCardRow
              data-testid="placecard-row-linked-from"
              icon={<LinkIcon size={14} aria-hidden="true" />}
              label="Linked from"
              wide={`${node.linked_from} engine root${node.linked_from === 1 ? "" : "s"}`}
            />
          )}
        </ListCard>
        {node.kind === "project" && node.rules.length > 0 && (
          <>
            <div className="mx-4 mb-1.5 font-flex text-micro font-medium tracking-[.06em] uppercase text-ink-3">
              Rules here
            </div>
            <ListCard className="mx-4 mb-3">
              {node.rules.map((name) => (
                <ListCardRow
                  key={name}
                  data-testid="placecard-rule"
                  icon={<DocumentTextIcon size={14} aria-hidden="true" />}
                  label={<span className="font-mono">{name}</span>}
                />
              ))}
            </ListCard>
          </>
        )}
        {node.kind === "engine_root" && (
          <div className={`${miniSetClass} mx-4 mb-3.5`}>
            <button onClick={() => onShowEngineAssets(node.label)} className={miniBtnClass}>
              Show its assets
              <ArrowRightIcon size={12} aria-hidden="true" />
            </button>
          </div>
        )}
        {node.kind === "project" && (
          <div className={`${miniSetClass} mx-4 mb-3.5`}>
            <button onClick={() => onOpenProject(node.path)} className={miniBtnClass}>
              Open project
              <ArrowRightIcon size={12} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
