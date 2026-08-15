import { ArrowRightIcon, Square2StackIcon, XMarkIcon } from "./icons";
import Tooltip from "./Tooltip";
import EngineLabel from "./EngineLabel";
import type {
  EdgeState,
  GraphNode,
  LinkMapSelection,
  PositionedEdge,
} from "../utils/linkMapLayout";

interface LinkMapDetailCardProps {
  selection: LinkMapSelection;
  nodes: GraphNode[];
  onClose: () => void;
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

function Facts({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="mx-4 my-3 px-3 py-2.5 bg-plane rounded-inner grid grid-cols-[110px_1fr] gap-y-1.5 gap-x-2.5 text-small">
      {rows.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="font-flex text-ink-3">{key}</dt>
          <dd className="text-ink-1 min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The Maps-style detail card: docked inside the canvas, next to whatever
 * was clicked — the map's only detail surface, since the map view carries
 * no inspector column. Deliberately NO provenance on either body: nothing
 * records who created a link or when, and inventing that was a defect in
 * the prototype this view replaced.
 */
export default function LinkMapDetailCard({
  selection,
  nodes,
  onClose,
  onOpenProject,
}: LinkMapDetailCardProps) {
  const closeButton = (
    <button
      onClick={onClose}
      aria-label="Close details"
      className="shrink-0 w-[27px] h-[27px] rounded-pill grid place-items-center text-ink-3 hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover ease-spring cursor-pointer"
    >
      <XMarkIcon size={13} aria-hidden="true" />
    </button>
  );

  if (selection.kind === "edge") {
    const edge: PositionedEdge = selection.edge;
    const source = nodes.find((n) => n.id === edge.source);
    const dest = nodes.find((n) => n.id === edge.dest);
    const mechanismName = edge.mechanism === "symlink" ? "Symlink" : "Tracked copy";
    const pathLine = edge.dest_path ?? `${source?.path ?? "?"} → ${dest?.path ?? "?"}`;
    const countLabel = dest?.kind === "engine_root" ? "Root-level symlinks" : "Assets travelling";

    return (
      <div
        data-testid="map-detail-card"
        className="absolute left-3 top-3 bottom-3 w-[300px] z-20 flex flex-col bg-page border border-line rounded-plane overflow-hidden shadow-overlay"
      >
        <div className="px-4 pt-3.5 pb-3 border-b border-line shrink-0">
          <div className="flex items-center gap-2 font-flex text-micro tracking-[.06em] uppercase text-ink-3 mb-1.5">
            <span>Edge</span>
            <span>·</span>
            <span>{mechanismName}</span>
            <span className="ml-auto">{closeButton}</span>
          </div>
          <h2 className="text-base-app font-medium tracking-[-0.2px] text-ink-1 mb-1.5">
            {source?.label ?? "?"} → {dest?.label ?? "?"}
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
          <Facts
            rows={[
              [
                "Kind",
                edge.mechanism === "symlink"
                  ? "Symlink — one copy, no drift"
                  : "Tracked copy — can be edited, can drift",
              ],
              [countLabel, <span className="tabular">{edge.count}</span>],
              ["From", <span className="font-mono text-micro break-all">{source?.path ?? "?"}</span>],
              [
                "Into",
                <span className="font-mono text-micro break-all">
                  {edge.dest_path ?? dest?.path ?? "?"}
                </span>,
              ],
            ]}
          />
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
      data-testid="map-detail-card"
      className="absolute left-3 top-3 bottom-3 w-[300px] z-20 flex flex-col bg-page border border-line rounded-plane overflow-hidden shadow-overlay"
    >
      <div className="px-4 pt-3.5 pb-3 border-b border-line shrink-0">
        <div className="flex items-center gap-2 font-flex text-micro tracking-[.06em] uppercase text-ink-3 mb-1.5">
          <span>Node</span>
          <span>·</span>
          <span>{NODE_KIND_LABEL[node.kind]}</span>
          <span className="ml-auto">{closeButton}</span>
        </div>
        <h2 className="text-base-app font-medium tracking-[-0.2px] text-ink-1 mb-1.5">
          {node.kind === "engine_root" ? (
            <EngineLabel engineKey={node.label} size={14}>
              {node.label}
            </EngineLabel>
          ) : (
            node.label
          )}
        </h2>
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
        <Facts
          rows={[
            ["Kind", NODE_KIND_LABEL[node.kind]],
            ["Assets", <span className="tabular">{node.asset_count}</span>],
            ...(node.kind === "engine_root"
              ? ([["Linked", node.linked ? "Yes — at the root" : "No"]] as Array<
                  [string, React.ReactNode]
                >)
              : []),
          ]}
        />
        {node.kind === "project" && (
          <div className="mx-4 mb-3.5 flex">
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
