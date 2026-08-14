import DisclosureBanner from "./DisclosureBanner";
import { ArrowPathIcon } from "./icons";
import {
  layoutLinkGraph,
  EDGE_MECHANISMS,
  EDGE_STATES,
  NODE_W,
  NODE_H,
  type EdgeMechanism,
  type EdgeState,
  type LinkGraph,
  type PositionedEdge,
  type PositionedNode,
} from "../utils/linkMapLayout";

/** The map draws at a fixed logical width and scales to its container via
 *  the viewBox, so the layout stays deterministic whatever the window does. */
const MAP_WIDTH = 880;

interface LinkMapPaneProps {
  graph: LinkGraph | null;
  loading: boolean;
  selectedEdge: PositionedEdge | null;
  onSelectEdge: (edge: PositionedEdge) => void;
  onRescan: () => void;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled graph value: ${String(value)}`);
}

// The renderer's two style axes. The legend maps the SAME enums through the
// SAME functions, so it cannot describe a style that is never drawn.
function dashFor(mechanism: EdgeMechanism): string | undefined {
  switch (mechanism) {
    case "symlink":
      return undefined;
    case "tracked_copy":
      return "5 4";
    default:
      return assertNever(mechanism);
  }
}

function inkFor(state: EdgeState): string {
  switch (state) {
    case "linked":
      return "text-ink-2";
    case "drifted":
      return "text-state-warning";
    case "dangling":
      return "text-state-danger";
    default:
      return assertNever(state);
  }
}

function mechanismLabel(mechanism: EdgeMechanism): string {
  switch (mechanism) {
    case "symlink":
      return "Symlink — one copy, no drift";
    case "tracked_copy":
      return "Tracked copy — can be edited, can drift";
    default:
      return assertNever(mechanism);
  }
}

function stateLabel(state: EdgeState): string {
  switch (state) {
    case "linked":
      return "Linked";
    case "drifted":
      return "Drifted";
    case "dangling":
      return "Dangling";
    default:
      return assertNever(state);
  }
}

/** Home-relative display form; paths render, they are never computed on. */
function tildify(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, "~");
}

const COLUMN_HEADS: { kind: PositionedNode["kind"]; label: string }[] = [
  { kind: "store", label: "Canonical store" },
  { kind: "engine_root", label: "Engine roots · global" },
  { kind: "project", label: "Projects" },
];

function edgeKey(e: PositionedEdge): string {
  return `${e.source}-${e.dest}-${e.mechanism}-${e.state}-${e.dest_path ?? ""}`;
}

/**
 * The link map: three columns, edges whose stroke carries mechanism and
 * whose colour carries state. Pure presentation — the graph arrives
 * computed from the backend's link_graph command, and the layout is
 * deterministic geometry (linkMapLayout.ts). Nothing here counts,
 * aggregates, or derives.
 */
export default function LinkMapPane({
  graph,
  loading,
  selectedEdge,
  onSelectEdge,
  onRescan,
}: LinkMapPaneProps) {
  if (!graph) {
    return (
      <div className="h-full grid place-items-center bg-page">
        <span className="text-small text-ink-3">
          {loading ? "Reading the link graph…" : "No link graph yet."}
        </span>
      </div>
    );
  }

  const layout = layoutLinkGraph(graph, MAP_WIDTH);
  const warningBadge = graph.warnings.length;
  const selectedKey = selectedEdge ? edgeKey(selectedEdge) : null;

  return (
    <div className="h-full flex flex-col bg-page min-h-0">
      <div className="px-[18px] pt-3 shrink-0 flex items-center gap-2">
        <span className="font-flex text-micro tracking-[.06em] uppercase text-ink-3">
          How everything is actually attached
        </span>
        <button
          onClick={onRescan}
          disabled={loading}
          className="ml-auto h-[27px] px-3 rounded-pill border border-line-2 text-small font-medium text-ink-1 cursor-pointer transition-colors duration-nav ease-spring hover:bg-plane-2 disabled:opacity-50 flex items-center gap-1.5"
        >
          <ArrowPathIcon size={12} aria-hidden="true" className={loading ? "animate-spin" : ""} />
          Rescan
        </button>
      </div>

      {warningBadge > 0 && (
        <div className="px-[18px] pt-2 shrink-0">
          <DisclosureBanner
            variant="warning"
            summary="Some recorded links could not be drawn"
            count={warningBadge}
          >
            <ul className="list-none">
              {graph.warnings.map((w) => (
                <li key={w} className="font-mono text-micro text-ink-2 py-0.5 break-all">
                  {w}
                </li>
              ))}
            </ul>
          </DisclosureBanner>
        </div>
      )}

      {graph.empty_state === "no_project_edges" && (
        <div className="mx-[18px] mt-2 px-3.5 py-2.5 bg-plane rounded-plane shrink-0">
          <p className="text-small text-ink-2 leading-[1.6]">
            <span className="text-ink-1 font-medium">
              Per-asset project links have not been recorded yet.
            </span>{" "}
            Hanger records a link when it deploys an asset and when a scan meets a symlink that
            resolves into the store — neither has seen one so far. The store-to-engine edges below
            are real: they come from the engine roots themselves, not from records. Rescan a
            project that contains symlinks into the store to backfill its links.
          </p>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto px-[18px] pb-[18px] pt-3 relative">
        <div className="bg-plane border border-line rounded-plane p-1.5">
          <svg
            viewBox={`0 0 ${MAP_WIDTH} ${Math.max(layout.height, 320)}`}
            className="block w-full h-auto"
            role="img"
            aria-label="Link map"
          >
            {COLUMN_HEADS.map(({ kind, label }) => {
              const first = layout.nodes.find((n) => n.kind === kind);
              if (!first) return null;
              return (
                <text
                  key={kind}
                  x={first.x}
                  y={14}
                  className="font-flex text-micro tracking-[.09em] uppercase fill-ink-3"
                >
                  {label}
                </text>
              );
            })}

            {layout.edges.map((edge) => {
              const active = selectedKey === edgeKey(edge);
              return (
                <g key={edgeKey(edge)} className="group">
                  <path
                    data-testid="map-edge"
                    d={edge.path}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={active ? 2.2 : 1.4}
                    strokeDasharray={dashFor(edge.mechanism)}
                    className={`${inkFor(edge.state)} ${
                      active ? "opacity-100" : "opacity-70"
                    } group-hover:opacity-100 transition-opacity duration-hover`}
                  />
                  <text
                    x={(edge.x1 + edge.x2) / 2}
                    y={(edge.y1 + edge.y2) / 2 - 6}
                    textAnchor="middle"
                    className={`font-flex text-micro ${
                      active ? "fill-ink-1" : "fill-ink-3"
                    } group-hover:fill-ink-1`}
                  >
                    {edge.count} {edge.mechanism === "symlink" ? "symlink" : "tracked copy"}
                    {edge.count === 1 ? "" : edge.mechanism === "symlink" ? "s" : " copies"}
                    {edge.state === "linked" ? "" : ` · ${stateLabel(edge.state).toLowerCase()}`}
                  </text>
                  <path
                    data-testid="map-edge-hit"
                    d={edge.path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    className="cursor-pointer"
                    onClick={() => onSelectEdge(edge)}
                  />
                </g>
              );
            })}

            {layout.nodes.map((node) => (
              <g key={node.id} data-testid={`map-node-${node.id}`}>
                <rect
                  x={node.x}
                  y={node.y}
                  width={NODE_W}
                  height={NODE_H}
                  rx={11}
                  strokeWidth={node.kind === "store" ? 1.5 : 1}
                  strokeDasharray={node.linked === false ? "3 3" : undefined}
                  className={
                    node.linked === false
                      ? "fill-transparent stroke-line-2"
                      : node.kind === "store"
                      ? "fill-page stroke-ink-1"
                      : "fill-page stroke-line-2"
                  }
                />
                <text x={node.x + 13} y={node.y + 21} className="font-flex text-small fill-ink-1">
                  {node.label}
                </text>
                <text x={node.x + 13} y={node.y + 37} className="font-mono text-micro fill-ink-3">
                  {tildify(node.path)}
                </text>
                <text
                  x={node.x + NODE_W - 12}
                  y={node.y + 21}
                  textAnchor="end"
                  className="font-flex text-micro fill-ink-3"
                >
                  {node.linked === false ? "not linked" : `${node.asset_count} assets`}
                </text>
              </g>
            ))}
          </svg>
        </div>

        <div
          data-testid="map-legend"
          className="flex gap-5 flex-wrap pt-3 px-1 font-flex text-micro text-ink-3"
        >
          {EDGE_MECHANISMS.map((mechanism) => (
            <span key={mechanism} className="inline-flex items-center gap-[7px]">
              <svg width="22" height="2" aria-hidden="true" className="text-ink-2">
                <line
                  x1="0"
                  y1="1"
                  x2="22"
                  y2="1"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeDasharray={dashFor(mechanism)}
                />
              </svg>
              {mechanismLabel(mechanism)}
            </span>
          ))}
          {EDGE_STATES.map((state) => (
            <span key={state} className="inline-flex items-center gap-[7px]">
              <svg width="22" height="2" aria-hidden="true" className={inkFor(state)}>
                <line x1="0" y1="1" x2="22" y2="1" stroke="currentColor" strokeWidth="1.4" />
              </svg>
              {stateLabel(state)}
            </span>
          ))}
        </div>

        {graph.empty_state === "no_links_at_all" && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <div className="pointer-events-auto max-w-[380px] bg-page border border-line rounded-plane px-5 py-4 text-center">
              <div className="text-base-app font-medium text-ink-1 mb-1.5">
                Nothing is linked yet
              </div>
              <p className="text-small text-ink-3 leading-[1.6]">
                When an asset is deployed — as a symlink or a tracked copy — an edge appears
                here: stroke carries the mechanism, colour carries whether it still resolves.
                Engine roots join the map the moment one of their folders points into the store.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
