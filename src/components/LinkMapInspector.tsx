import { ArrowRightIcon, Square2StackIcon } from "./icons";
import Tooltip from "./Tooltip";
import type {
  EdgeState,
  GraphNode,
  LinkMapSelection,
  PositionedEdge,
} from "../utils/linkMapLayout";

interface LinkMapInspectorProps {
  selection: LinkMapSelection | null;
  nodes: GraphNode[];
  /** Project nodes only: jump to the repository's own view. */
  onOpenProject: (path: string) => void;
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

const actionBtnClass =
  "h-[30px] px-4 rounded-pill border border-line-2 text-small font-medium text-ink-1 cursor-pointer transition-colors duration-nav ease-spring hover:bg-plane-2 inline-flex items-center gap-1.5";

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

function EdgeBody({ edge, nodes }: { edge: PositionedEdge; nodes: GraphNode[] }) {
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
        </div>

        <h2 className="text-lg-app font-medium tracking-[-0.3px] text-ink-1 mb-2">{title}</h2>

        <div className="flex items-center gap-[7px] mb-3">
          <i className={`w-2 h-2 rounded-pill shrink-0 ${STATE_DOT[edge.state]}`} />
          <span className={`font-flex text-small ${STATE_INK[edge.state]}`}>
            {STATE_LINE[edge.state]}
          </span>
        </div>

        <PathChip text={pathLine} />
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

function NodeBody({
  node,
  onOpenProject,
}: {
  node: GraphNode;
  onOpenProject: (path: string) => void;
}) {
  const statusLine =
    node.kind === "store"
      ? "The canonical copy of every asset lives here"
      : node.kind === "project"
      ? "A linked directory Hanger scans"
      : node.linked
      ? "Reaches the store through a root-level symlink"
      : "Nothing at this root points into the store";

  return (
    <div className="h-full flex flex-col bg-page min-h-0">
      <div className="px-[18px] pt-4 pb-3 border-b border-line shrink-0">
        <div className="flex items-center gap-2 font-flex text-micro tracking-[.06em] uppercase text-ink-3 mb-2">
          <span>Node</span>
          <span>·</span>
          <span>{NODE_KIND_LABEL[node.kind]}</span>
        </div>

        <h2 className="text-lg-app font-medium tracking-[-0.3px] text-ink-1 mb-2">{node.label}</h2>

        <div className="flex items-center gap-[7px] mb-3">
          {node.kind === "engine_root" && (
            <i
              className={`w-2 h-2 rounded-pill shrink-0 ${
                node.linked ? "bg-state-success" : "border-2 border-line-2"
              }`}
            />
          )}
          <span className="font-flex text-small text-ink-2">{statusLine}</span>
        </div>

        <PathChip text={node.path} />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <dl className="mx-[18px] my-3.5 px-3.5 py-3 bg-plane rounded-plane grid grid-cols-[132px_1fr] gap-y-2 gap-x-3 text-small">
          <dt className="font-flex text-ink-3">Kind</dt>
          <dd className="text-ink-1">{NODE_KIND_LABEL[node.kind]}</dd>
          <dt className="font-flex text-ink-3">Assets</dt>
          <dd className="text-ink-1 tabular">{node.asset_count}</dd>
          {node.kind === "engine_root" && (
            <>
              <dt className="font-flex text-ink-3">Linked</dt>
              <dd className="text-ink-1">{node.linked ? "Yes — at the root" : "No"}</dd>
            </>
          )}
        </dl>

        {node.kind === "project" && (
          <div className="mx-[18px] flex">
            <button onClick={() => onOpenProject(node.path)} className={actionBtnClass}>
              Open project
              <ArrowRightIcon size={12} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * What the canvas could not say in place. Edges keep their original
 * anatomy; nodes get the same shape with their own facts. Deliberately NO
 * provenance on either — nothing records who created a link or when, and
 * inventing that was a defect in the prototype this view replaced.
 */
export default function LinkMapInspector({
  selection,
  nodes,
  onOpenProject,
}: LinkMapInspectorProps) {
  if (!selection) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 px-6 text-center bg-page">
        <span className="text-base-app font-medium text-ink-1">Nothing selected</span>
        <span className="text-small text-ink-3 leading-[1.6]">
          Pick an edge or a box on the map to see what it is and whether it still resolves.
        </span>
      </div>
    );
  }

  if (selection.kind === "edge") {
    return <EdgeBody edge={selection.edge} nodes={nodes} />;
  }
  return <NodeBody node={selection.node} onOpenProject={onOpenProject} />;
}
