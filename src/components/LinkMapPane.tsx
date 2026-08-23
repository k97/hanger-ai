import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LinkMapPlacecard, { type MapNotice } from "./LinkMapPlacecard";
import BrandIcon from "./BrandIcon";
import {
  ArrowsPointingOutIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  MapIcon,
  MinusIcon,
  PlusIcon,
} from "./icons";
import {
  layoutLinkGraph,
  middleTruncate,
  EDGE_MECHANISMS,
  EDGE_STATES,
  NODE_W,
  NODE_H,
  type EdgeMechanism,
  type EdgeState,
  type LinkGraph,
  type LinkMapSelection,
  type NodeKind,
  type PositionedEdge,
  type PositionedNode,
} from "../utils/linkMapLayout";
import {
  fitCamera,
  panBy,
  viewBoxOf,
  zoomAt,
  type Camera,
  type Size,
} from "../utils/linkMapCamera";

/** The layout's fixed logical width; the camera decides what of it shows. */
const MAP_WIDTH = 880;

/** Character budgets for text inside a 192px node box; display only. */
const LABEL_CHARS = 16;
const PATH_CHARS = 25;

interface LinkMapPaneProps {
  graph: LinkGraph | null;
  loading: boolean;
  showProjects: boolean;
  onToggleProjects: () => void;
  onOpenProject: (path: string) => void;
  /** Signature of the notice set last read, persisted by App. */
  noticesSeen: string | null;
  onNoticesSeen: (signature: string) => void;
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

function edgeSummary(edge: PositionedEdge): string {
  const noun =
    edge.mechanism === "symlink"
      ? edge.count === 1
        ? "symlink"
        : "symlinks"
      : edge.count === 1
      ? "tracked copy"
      : "tracked copies";
  const state = edge.state === "linked" ? "" : ` · ${stateLabel(edge.state).toLowerCase()}`;
  return `${edge.count} ${noun}${state}`;
}

// One control shape for every corner button; only the ink differs, so a
// warning can tint its own control without redefining the affordance.
const mapCtlClass =
  "w-7 h-7 rounded-pill border border-line-2 bg-page grid place-items-center hover:bg-plane-2 transition-colors duration-hover ease-spring cursor-pointer";
const zoomBtnClass = `${mapCtlClass} text-ink-2 hover:text-ink-1`;
const zoomBtnActiveClass =
  "w-7 h-7 rounded-pill border border-transparent bg-tint grid place-items-center text-tint-ink transition-colors duration-hover ease-spring cursor-pointer";
const alertBtnClass = `${mapCtlClass} text-state-warning`;

/**
 * The link map: three columns, edges whose stroke carries mechanism and
 * whose colour carries state, under an Apple-Maps camera — drag pans,
 * ⌘/ctrl-wheel and pinch zoom at the cursor, two-finger scroll pans, and
 * the controls sit in the corners. Selecting a box or an edge docks a
 * detail card inside the canvas, Maps-style; the map view has no inspector
 * column. Pure presentation — the graph arrives computed from the
 * backend's link_graph command, the layout and camera are deterministic
 * geometry. Nothing here counts, aggregates, or derives.
 */
export default function LinkMapPane({
  graph,
  loading,
  showProjects,
  onToggleProjects,
  onOpenProject,
  noticesSeen,
  onNoticesSeen,
}: LinkMapPaneProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<Size>({ width: 880, height: 520 });
  const [selection, setSelection] = useState<LinkMapSelection | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  // Hover focus: the hovered node, its edges and their other endpoints stay;
  // everything else dims. Read at render, never fed to the layout.
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const kinds: readonly NodeKind[] = showProjects
    ? ["store", "engine_root", "project"]
    : ["store", "engine_root"];

  const layout = useMemo(
    () => (graph ? layoutLinkGraph(graph, MAP_WIDTH, { kinds }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, showProjects],
  );

  const content: Size = useMemo(
    () => ({ width: MAP_WIDTH, height: Math.max(layout?.height ?? 0, 320) }),
    [layout],
  );

  const [camera, setCamera] = useState<Camera>(() => fitCamera(content, viewport));

  // Refit when the world or the window changes shape.
  useEffect(() => {
    setCamera(fitCamera(content, viewport));
    setSelection(null);
  }, [content, viewport.width, viewport.height]);

  // Track the viewport element's real size.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        setViewport({ width: rect.width, height: rect.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Wheel: pinch / ⌘-wheel zooms at the cursor, plain scroll pans. Native
  // listener because React's synthetic wheel cannot preventDefault.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.01);
        setCamera((c) => zoomAt(c, factor, cursor, content, viewport));
      } else {
        setCamera((c) => panBy(c, e.deltaX, e.deltaY, content, viewport));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [content, viewport]);

  // Drag to pan. A drag past the threshold swallows the click it ends with,
  // so panning never selects.
  //
  // Pointer capture is taken only once the threshold is crossed, never on
  // pointerdown: capturing immediately retargets the ensuing click to the
  // svg in WebKit, so no node or edge ever receives it — a plain click
  // opened nothing and the detail card was unreachable in the running app
  // while every synthetic-click test stayed green.
  const dragRef = useRef<{ x: number; y: number; dragged: boolean; pointerId: number } | null>(
    null,
  );
  const suppressClickRef = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { x: e.clientX, y: e.clientY, dragged: false, pointerId: e.pointerId };
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.dragged && Math.hypot(dx, dy) < 4) return;
      if (!drag.dragged) {
        drag.dragged = true;
        (e.currentTarget as Element).setPointerCapture?.(drag.pointerId);
      }
      drag.x = e.clientX;
      drag.y = e.clientY;
      setCamera((c) => panBy(c, -dx, -dy, content, viewport));
    },
    [content, viewport],
  );

  const onPointerUp = useCallback(() => {
    suppressClickRef.current = dragRef.current?.dragged ?? false;
    dragRef.current = null;
  }, []);

  // Escape dismisses the detail card.
  useEffect(() => {
    if (!selection) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection]);

  if (!graph || !layout) {
    return (
      <div className="h-full grid place-items-center bg-page">
        <span className="text-small text-ink-3">
          {loading ? "Reading the link graph…" : "No link graph yet."}
        </span>
      </div>
    );
  }

  const warningBadge = graph.warnings.length;

  // What the map has to say about itself. It says it in one place — the
  // alert control on the canvas, opening the docked card — and not in a
  // banner strip above the map: the map view trades height for canvas, and
  // a notice that is always expanded is a notice nobody reads twice.
  const notices: MapNotice[] = [];
  if (warningBadge > 0) {
    notices.push({
      id: "undrawable-links",
      variant: "warning",
      summary: "Some recorded links could not be drawn",
      detail: (
        <ul className="list-none">
          {graph.warnings.map((w) => (
            <li key={w} className="font-mono text-micro text-ink-2 py-0.5 break-all">
              {w}
            </li>
          ))}
        </ul>
      ),
    });
  }
  if (showProjects && graph.empty_state === "no_project_edges") {
    notices.push({
      id: "no-project-edges",
      variant: "info",
      summary: "Per-asset project links have not been recorded yet",
      detail: (
        <p className="text-small text-ink-2 leading-[1.6]">
          Hanger records a link when it deploys an asset and when a scan meets a symlink that
          resolves into the store — neither has seen one so far. The store-to-engine edges below
          are real: they come from the engine roots themselves, not from records. Rescan a
          project that contains symlinks into the store to backfill its links.
        </p>
      ),
    });
  }
  const hasWarningNotice = notices.some((n) => n.variant === "warning");
  // A notices selection outlives its notices when a layer toggle removes the
  // last one, so what shows is derived, never assumed from the selection.
  const noticesShown = selection?.kind === "notices" && notices.length > 0;

  // What "seen" means, macOS-badge style: this exact set of notices, by
  // identity AND content. Reading them clears the dot; a rescan that turns
  // up a warning nobody has read raises it again, because the signature
  // changed. Persisted by App, so the dot does not return on every visit.
  const noticeSignature = `${notices.map((n) => n.id).join("|")}#${graph.warnings.join("|")}`;
  const noticesUnread = notices.length > 0 && noticeSignature !== noticesSeen;

  const selectedKey = selection?.kind === "edge" ? edgeKey(selection.edge) : null;
  const selectedNodeId = selection?.kind === "node" ? selection.node.id : null;

  const select = (target: LinkMapSelection) => {
    if (suppressClickRef.current) return;
    setSelection(target);
  };

  // The focus set is a boolean per element, derived from the edge list —
  // no count, no layout.
  const focusedEdge = (e: PositionedEdge) =>
    hoveredId !== null && (e.source === hoveredId || e.dest === hoveredId);
  const focusedNode = (id: number) =>
    hoveredId !== null &&
    (id === hoveredId || layout.edges.some((e) => focusedEdge(e) && (e.source === id || e.dest === id)));
  const dimClass = (focused: boolean) =>
    `transition-opacity duration-hover ease-spring ${hoveredId !== null && !focused ? "opacity-35" : ""}`;

  // The worst faulty edge INTO a node — the place where a copy drifted or a
  // link dangles. The store is every edge's source and never carries a dot.
  const worstStateInto = (id: number): "dangling" | "drifted" | null => {
    const into = layout.edges.filter((e) => e.dest === id && e.state !== "linked");
    if (into.some((e) => e.state === "dangling")) return "dangling";
    if (into.some((e) => e.state === "drifted")) return "drifted";
    return null;
  };

  return (
    <div className="h-full flex flex-col bg-page min-h-0">
      <div className="flex-1 min-h-0 px-[18px] pb-2 pt-2.5 flex flex-col">
        <div
          ref={viewportRef}
          className="relative flex-1 min-h-0 border border-line rounded-plane overflow-hidden bg-page"
          style={{
            // A quiet dot grid gives the camera something to move against.
            // Dots are drawn in --line, so the grid follows the theme.
            backgroundImage: "radial-gradient(var(--line) 1px, transparent 0)",
            backgroundSize: "15px 15px",
            backgroundPosition: "-5px -5px",
          }}
        >
          <svg
            viewBox={viewBoxOf(camera, viewport)}
            className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
            style={{ touchAction: "none" }}
            role="img"
            aria-label="Link map"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onClick={(e) => {
              if (e.target === e.currentTarget && !suppressClickRef.current) setSelection(null);
            }}
          >
            {COLUMN_HEADS.map(({ kind, label }) => {
              const first = layout.nodes.find((n) => n.kind === kind);
              if (!first) return null;
              return (
                <text
                  key={kind}
                  x={first.x}
                  y={14}
                  className="font-flex text-micro tracking-[.09em] uppercase fill-ink-3 select-none"
                >
                  {label}
                </text>
              );
            })}

            {layout.edges.map((edge) => {
              const active = selectedKey === edgeKey(edge);
              const mid = { x: (edge.x1 + edge.x2) / 2, y: (edge.y1 + edge.y2) / 2 };
              return (
                <g key={edgeKey(edge)} className={`group ${dimClass(focusedEdge(edge))}`}>
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
                    x={mid.x}
                    y={mid.y - 6}
                    textAnchor="middle"
                    onClick={() => select({ kind: "edge", edge })}
                    className={`font-flex text-micro cursor-pointer select-none ${
                      active ? "fill-ink-1" : "fill-ink-3"
                    } group-hover:fill-ink-1`}
                  >
                    {edgeSummary(edge)}
                  </text>
                  <path
                    data-testid="map-edge-hit"
                    d={edge.path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    className="cursor-pointer"
                    onClick={() => select({ kind: "edge", edge })}
                  />
                </g>
              );
            })}

            {layout.nodes.map((node) => (
              <g
                key={node.id}
                data-testid={`map-node-${node.id}`}
                onClick={() => select({ kind: "node", node })}
                onMouseEnter={() => setHoveredId(node.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`cursor-pointer ${dimClass(focusedNode(node.id))}`}
              >
                <rect
                  x={node.x}
                  y={node.y}
                  width={NODE_W}
                  height={NODE_H}
                  rx={11}
                  strokeWidth={
                    node.kind === "store" || selectedNodeId === node.id ? 1.5 : 1
                  }
                  strokeDasharray={node.linked === false ? "3 3" : undefined}
                  className={
                    selectedNodeId === node.id
                      ? "fill-page stroke-ink-1"
                      : node.linked === false
                      ? "fill-transparent stroke-line-2"
                      : node.kind === "store"
                      ? "fill-page stroke-ink-1"
                      : "fill-page stroke-line-2"
                  }
                />
                {node.kind === "engine_root" && (
                  // Engine-root labels are the engines table's display_name,
                  // which the brand map resolves. A nested <svg> positions
                  // itself with x/y inside the canvas; no foreignObject.
                  <BrandIcon engineKey={node.label} x={node.x + 13} y={node.y + 12} size={12} />
                )}
                <text
                  x={node.x + (node.kind === "engine_root" ? 29 : 13)}
                  y={node.y + 21}
                  className="font-flex text-small fill-ink-1 select-none"
                >
                  {middleTruncate(node.label, LABEL_CHARS)}
                </text>
                <text
                  x={node.x + 13}
                  y={node.y + 37}
                  className="font-mono text-micro fill-ink-3 select-none"
                >
                  {middleTruncate(tildify(node.path), PATH_CHARS)}
                </text>
                <text
                  x={node.x + NODE_W - 12}
                  y={node.y + 21}
                  textAnchor="end"
                  className="font-flex text-micro fill-ink-3 select-none"
                >
                  {node.linked === false ? "not linked" : `${node.asset_count} assets`}
                </text>
                {(() => {
                  const worst = worstStateInto(node.id);
                  if (!worst) return null;
                  return (
                    <circle
                      data-testid="map-state-dot"
                      aria-hidden="true"
                      cx={node.x + NODE_W - 10}
                      cy={node.y + 10}
                      r={4}
                      strokeWidth={2}
                      className={`stroke-page ${
                        worst === "dangling" ? "fill-state-danger" : "fill-state-warning"
                      }`}
                    />
                  );
                })()}
              </g>
            ))}
          </svg>

          {/* Layers, the Maps way: what the map includes lives on the map.
              Store and engines are the always-on core; projects join on
              request, so the first view answers the first question — is the
              store reaching the engines — without noise. */}
          <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
            <button
              aria-label="Map layers"
              aria-expanded={layersOpen}
              data-testid="map-layers"
              onClick={() => setLayersOpen((v) => !v)}
              className={layersOpen ? zoomBtnActiveClass : zoomBtnClass}
            >
              <MapIcon size={14} aria-hidden="true" />
            </button>
            {/* The alert sits under layers and appears only when the map has
                something to say. A control that is always lit says nothing.
                It opens the same docked card a node or an edge opens — the
                map has one detail surface, not one per kind of thing. */}
            {notices.length > 0 && (
              <button
                aria-label={`${hasWarningNotice ? "Map warnings" : "Map notices"}${
                  noticesUnread ? ", unread" : ""
                }`}
                aria-pressed={noticesShown}
                data-testid="map-notices"
                onClick={() => {
                  if (!noticesShown) onNoticesSeen(noticeSignature);
                  setSelection((s) => (s?.kind === "notices" ? null : { kind: "notices" }));
                }}
                className={`relative ${
                  noticesShown ? zoomBtnActiveClass : hasWarningNotice ? alertBtnClass : zoomBtnClass
                }`}
              >
                {hasWarningNotice ? (
                  <ExclamationTriangleIcon size={14} aria-hidden="true" />
                ) : (
                  <InformationCircleIcon size={14} aria-hidden="true" />
                )}
                {/* The unread dot, macOS notification style: red regardless
                    of variant, ringed in the ground so it reads as sitting
                    above the control. Same anatomy as the rail's count
                    badge (IconRail.tsx), one size down and without a
                    numeral — how many notices there are is not the point,
                    that you have not read them is. */}
                {noticesUnread && (
                  <span
                    data-testid="map-notices-dot"
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-pill bg-state-danger ring-2 ring-page"
                  />
                )}
              </button>
            )}
            {layersOpen && (
              <div
                data-testid="map-layers-panel"
                className="w-[190px] bg-page border border-line rounded-inner p-2 shadow-overlay"
              >
                <div className="font-flex text-micro tracking-[.06em] uppercase text-ink-3 px-1.5 pt-0.5 pb-1.5">
                  Show on map
                </div>
                <button
                  data-testid="chip-projects"
                  aria-pressed={showProjects}
                  onClick={onToggleProjects}
                  className="w-full h-7 px-1.5 rounded-soft flex items-center justify-between font-flex text-small text-ink-1 hover:bg-plane-2 transition-colors duration-hover cursor-pointer"
                >
                  Projects
                  {showProjects && <CheckIcon size={12} aria-hidden="true" />}
                </button>
              </div>
            )}
          </div>

          {/* Camera controls, Maps corner. */}
          <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
            <button
              aria-label="Zoom in"
              data-testid="zoom-in"
              onClick={() =>
                setCamera((c) =>
                  zoomAt(c, 1.4, { x: viewport.width / 2, y: viewport.height / 2 }, content, viewport),
                )
              }
              className={zoomBtnClass}
            >
              <PlusIcon size={13} aria-hidden="true" />
            </button>
            <button
              aria-label="Zoom out"
              data-testid="zoom-out"
              onClick={() =>
                setCamera((c) =>
                  zoomAt(c, 1 / 1.4, { x: viewport.width / 2, y: viewport.height / 2 }, content, viewport),
                )
              }
              className={zoomBtnClass}
            >
              <MinusIcon size={13} aria-hidden="true" />
            </button>
            <button
              aria-label="Fit to view"
              data-testid="zoom-fit"
              onClick={() => setCamera(fitCamera(content, viewport))}
              className={zoomBtnClass}
            >
              <ArrowsPointingOutIcon size={13} aria-hidden="true" />
            </button>
          </div>

          {/* The Maps-style detail card, docked in the canvas. It replaces
              both the popover and the inspector column for this view, and it
              is where notices land too — one detail surface, three bodies. */}
          {selection && (selection.kind !== "notices" || noticesShown) && (
            <LinkMapPlacecard
              selection={selection}
              nodes={graph.nodes}
              notices={notices}
              onClose={() => setSelection(null)}
              onOpenProject={onOpenProject}
            />
          )}

          {graph.empty_state === "no_links_at_all" && (
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <div className="pointer-events-auto max-w-[380px] bg-page border border-line rounded-plane px-5 py-4 text-center">
                <div className="text-base-app font-medium text-ink-1 mb-1.5">
                  Nothing is linked yet
                </div>
                <p className="text-small text-ink-3 leading-[1.6]">
                  When an asset is deployed as a symlink or a tracked copy, an edge appears here.
                  The stroke shows the mechanism and the colour shows whether it still resolves.
                  Engine roots join the map once one of their folders points into the store.
                </p>
              </div>
            </div>
          )}
        </div>

        <div
          data-testid="map-legend"
          className="flex gap-5 flex-wrap pt-2.5 px-1 pb-1.5 shrink-0 font-flex text-micro text-ink-3"
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
      </div>
    </div>
  );
}
