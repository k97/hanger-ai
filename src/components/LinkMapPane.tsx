import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DisclosureBanner from "./DisclosureBanner";
import {
  ArrowPathIcon,
  ArrowRightIcon,
  ArrowsPointingOutIcon,
  CheckIcon,
  MinusIcon,
  PlusIcon,
  XMarkIcon,
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
  toViewport,
  viewBoxOf,
  zoomAt,
  type Camera,
  type Point,
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
  selection: LinkMapSelection | null;
  onSelect: (selection: LinkMapSelection) => void;
  showProjects: boolean;
  onToggleProjects: () => void;
  onOpenProject: (path: string) => void;
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

// CategoryFilterCards' chip anatomy, hoisted for the map's one toggle.
const chipBaseClass =
  "h-7 px-3.5 rounded-pill border border-line-2 font-flex text-small text-ink-2 whitespace-nowrap inline-flex items-center gap-2 cursor-pointer transition-colors duration-nav ease-spring hover:bg-plane-2";
const chipPressedClass =
  "h-7 pl-2.5 pr-3.5 rounded-pill border border-transparent bg-tint text-tint-ink font-medium whitespace-nowrap inline-flex items-center gap-2 cursor-pointer transition-colors duration-nav ease-spring font-flex text-small";

const zoomBtnClass =
  "w-7 h-7 rounded-pill border border-line-2 bg-page grid place-items-center text-ink-2 hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover ease-spring cursor-pointer";

interface Popover {
  selection: LinkMapSelection;
  /** World-coordinate anchor, so the card tracks pan and zoom. */
  world: Point;
}

/**
 * The link map: three columns, edges whose stroke carries mechanism and
 * whose colour carries state, under an Apple-Maps camera — drag pans,
 * ⌘/ctrl-wheel and pinch zoom at the cursor, two-finger scroll pans, and
 * the controls sit in the corner. Pure presentation — the graph arrives
 * computed from the backend's link_graph command, the layout and camera are
 * deterministic geometry. Nothing here counts, aggregates, or derives.
 */
export default function LinkMapPane({
  graph,
  loading,
  selection,
  onSelect,
  showProjects,
  onToggleProjects,
  onOpenProject,
  onRescan,
}: LinkMapPaneProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<Size>({ width: 880, height: 520 });
  const [popover, setPopover] = useState<Popover | null>(null);

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
    setPopover(null);
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
  const dragRef = useRef<{ x: number; y: number; dragged: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { x: e.clientX, y: e.clientY, dragged: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.dragged && Math.hypot(dx, dy) < 4) return;
      drag.dragged = true;
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

  // Escape dismisses a pinned popover.
  useEffect(() => {
    if (!popover) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopover(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popover]);

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
  const selectedKey =
    selection?.kind === "edge" ? edgeKey(selection.edge) : null;
  const selectedNodeId = selection?.kind === "node" ? selection.node.id : null;

  const openPopover = (sel: LinkMapSelection, world: Point) => {
    if (suppressClickRef.current) return;
    setPopover({ selection: sel, world });
  };

  const popoverScreen = popover ? toViewport(popover.world, camera) : null;

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

      {/* What the map includes. Store and engines are the always-on core;
          projects join on request so the first view answers the first
          question — is the store reaching the engines — without noise. */}
      <div className="px-[18px] pt-2.5 shrink-0 flex items-center gap-2">
        <button
          data-testid="chip-projects"
          aria-pressed={showProjects}
          onClick={onToggleProjects}
          className={showProjects ? chipPressedClass : chipBaseClass}
        >
          {showProjects && <CheckIcon size={12} aria-hidden="true" />}
          Projects
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

      {showProjects && graph.empty_state === "no_project_edges" && (
        <div className="mx-[18px] mt-2 px-3.5 py-2.5 rounded-plane shrink-0">
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

      <div className="flex-1 min-h-0 px-[18px] pb-2 pt-3 flex flex-col">
        <div
          ref={viewportRef}
          className="relative flex-1 min-h-0 border border-line rounded-plane overflow-hidden"
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
              if (e.target === e.currentTarget && !suppressClickRef.current) setPopover(null);
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
              const world = {
                x: (edge.x1 + edge.x2) / 2,
                y: (edge.y1 + edge.y2) / 2,
              };
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
                    x={world.x}
                    y={world.y - 6}
                    textAnchor="middle"
                    onClick={() => openPopover({ kind: "edge", edge }, world)}
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
                    onClick={() => openPopover({ kind: "edge", edge }, world)}
                  />
                </g>
              );
            })}

            {layout.nodes.map((node) => (
              <g
                key={node.id}
                data-testid={`map-node-${node.id}`}
                onClick={() =>
                  openPopover(
                    { kind: "node", node },
                    { x: node.x + NODE_W / 2, y: node.y },
                  )
                }
                className="cursor-pointer"
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
                <text
                  x={node.x + 13}
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
              </g>
            ))}
          </svg>

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

          {popover && popoverScreen && (
            <div
              data-testid="map-popover"
              className="absolute z-20 w-[260px] bg-page border border-line rounded-inner px-3.5 py-3"
              style={{
                left: Math.min(Math.max(popoverScreen.x, 138), Math.max(viewport.width - 138, 138)),
                top: Math.max(popoverScreen.y, 8),
                transform: "translate(-50%, calc(-100% - 10px))",
              }}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  {popover.selection.kind === "node" ? (
                    <>
                      <div className="font-flex text-small font-medium text-ink-1 truncate">
                        {popover.selection.node.label}
                      </div>
                      <div className="font-flex text-micro text-ink-3 mt-0.5">
                        {popover.selection.node.kind === "store"
                          ? "Canonical store"
                          : popover.selection.node.kind === "project"
                          ? "Project"
                          : popover.selection.node.linked
                          ? "Engine root · linked"
                          : "Engine root · not linked"}
                        {popover.selection.node.linked === false
                          ? ""
                          : ` · ${popover.selection.node.asset_count} assets`}
                      </div>
                      <div className="font-mono text-micro text-ink-2 mt-1.5 break-all">
                        {tildify(popover.selection.node.path)}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-flex text-small font-medium text-ink-1">
                        {edgeSummary(popover.selection.edge)}
                      </div>
                      <div className={`font-flex text-micro mt-0.5 ${inkFor(popover.selection.edge.state)}`}>
                        {stateLabel(popover.selection.edge.state)}
                      </div>
                      {popover.selection.edge.dest_path && (
                        <div className="font-mono text-micro text-ink-2 mt-1.5 break-all">
                          {tildify(popover.selection.edge.dest_path)}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <button
                  aria-label="Close"
                  onClick={() => setPopover(null)}
                  className="shrink-0 w-6 h-6 rounded-pill grid place-items-center text-ink-3 hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover cursor-pointer"
                >
                  <XMarkIcon size={11} aria-hidden="true" />
                </button>
              </div>

              <div className="flex items-center gap-2 mt-2.5">
                <button
                  onClick={() => {
                    onSelect(popover.selection);
                    setPopover(null);
                  }}
                  className="h-6.5 px-3 rounded-pill border border-line-2 font-flex text-micro font-medium text-ink-1 cursor-pointer transition-colors duration-nav ease-spring hover:bg-plane-2 inline-flex items-center gap-1"
                >
                  Details
                  <ArrowRightIcon size={10} aria-hidden="true" />
                </button>
                {popover.selection.kind === "node" &&
                  popover.selection.node.kind === "project" && (
                    <button
                      onClick={() => onOpenProject((popover.selection as { kind: "node"; node: PositionedNode }).node.path)}
                      className="h-6.5 px-3 rounded-pill border border-line-2 font-flex text-micro font-medium text-ink-1 cursor-pointer transition-colors duration-nav ease-spring hover:bg-plane-2"
                    >
                      Open project
                    </button>
                  )}
              </div>
            </div>
          )}

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
