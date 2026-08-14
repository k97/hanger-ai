import { XMarkIcon, Square2StackIcon } from "./icons";
import Tooltip from "./Tooltip";
import type { EdgeState, GraphNode, PositionedEdge } from "../utils/linkMapLayout";

interface LinkMapInspectorProps {
  edge: PositionedEdge | null;
  nodes: GraphNode[];
  onClose: () => void;
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

/**
 * What the edge could not say on the canvas: what it is, where it goes, how
 * many links travel it, and its state. Deliberately NO provenance — nothing
 * records who created a link or when, and inventing that was a defect in
 * the prototype this view replaced.
 */
export default function LinkMapInspector({ edge, nodes, onClose }: LinkMapInspectorProps) {
  if (!edge) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 px-6 text-center bg-page">
        <span className="text-base-app font-medium text-ink-1">Nothing selected</span>
        <span className="text-small text-ink-3 leading-[1.6]">
          Pick an edge to see what travels it and whether it still resolves.
        </span>
      </div>
    );
  }

  const source = nodes.find((n) => n.id === edge.source);
  const dest = nodes.find((n) => n.id === edge.dest);
  const title = `${source?.label ?? "?"} → ${dest?.label ?? "?"}`;
  const mechanismName = edge.mechanism === "symlink" ? "Symlink" : "Tracked copy";
  const pathLine = edge.dest_path ?? `${source?.path ?? "?"} → ${dest?.path ?? "?"}`;
  const countLabel = dest?.kind === "engine_root" ? "Root-level symlinks" : "Assets travelling";

  return (
    <div className="h-full flex flex-col bg-page min-h-0">
      <div className="px-[18px] pt-4 pb-3 border-b border-line shrink-0">
        <div className="flex items-center gap-2 font-flex text-micro tracking-[.06em] uppercase text-ink-3 mb-2">
          <span>Edge</span>
          <span>·</span>
          <span>{mechanismName}</span>
          <span className="ml-auto">
            <Tooltip label="Close inspector" placement="bottom">
              <button
                onClick={onClose}
                aria-label="Close inspector"
                className="w-[27px] h-[27px] rounded-pill grid place-items-center text-ink-3 hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover ease-spring cursor-pointer"
              >
                <XMarkIcon size={13} aria-hidden="true" />
              </button>
            </Tooltip>
          </span>
        </div>

        <h2 className="text-lg-app font-medium tracking-[-0.3px] text-ink-1 mb-2">{title}</h2>

        <div className="flex items-center gap-[7px] mb-3">
          <i className={`w-2 h-2 rounded-pill shrink-0 ${STATE_DOT[edge.state]}`} />
          <span className={`font-flex text-small ${STATE_INK[edge.state]}`}>
            {STATE_LINE[edge.state]}
          </span>
        </div>

        <div className="flex items-center gap-2 bg-plane rounded-inner pl-2.5 pr-1.5 py-2 font-mono text-micro text-ink-2">
          <span className="flex-1 min-w-0 truncate">{pathLine}</span>
          <Tooltip label="Copy path" placement="bottom">
            <button
              aria-label="Copy path"
              onClick={() => navigator.clipboard?.writeText(pathLine).catch(() => {})}
              className="p-1 rounded-pill grid place-items-center text-ink-3 hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover cursor-pointer"
            >
              <Square2StackIcon size={13} aria-hidden="true" />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <dl className="mx-[18px] my-3.5 px-3.5 py-3 bg-plane rounded-plane grid grid-cols-[132px_1fr] gap-y-2 gap-x-3 text-small">
          <dt className="font-flex text-ink-3">Kind</dt>
          <dd className="text-ink-1">
            {edge.mechanism === "symlink"
              ? "Symlink — one copy, no drift"
              : "Tracked copy — can be edited, can drift"}
          </dd>
          <dt className="font-flex text-ink-3">{countLabel}</dt>
          <dd className="text-ink-1 tabular">{edge.count}</dd>
          <dt className="font-flex text-ink-3">From</dt>
          <dd className="text-ink-1 font-mono text-micro break-all self-center">
            {source?.path ?? "?"}
          </dd>
          <dt className="font-flex text-ink-3">Into</dt>
          <dd className="text-ink-1 font-mono text-micro break-all self-center">
            {edge.dest_path ?? dest?.path ?? "?"}
          </dd>
        </dl>

        {dest?.kind === "engine_root" && (
          <p className="mx-[18px] px-3.5 py-2.5 bg-plane rounded-plane text-small text-ink-2 leading-[1.6]">
            One symlink at the root does the work of many individual deployments: anything added
            to the store is visible to {dest.label} immediately, with nothing to re-run.
          </p>
        )}
      </div>
    </div>
  );
}
