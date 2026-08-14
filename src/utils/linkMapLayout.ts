// The link map's layout: pure, deterministic, windowless. Three columns —
// store, engine roots, projects — with vertical order a stable sort on
// (label, id), never input or hash order. Edge paths are cubic béziers
// derived from endpoint coordinates alone: no force simulation, no
// randomness, no animation-derived positions, so the map cannot reshuffle
// between rescans.
//
// Everything here is geometry. The data — counts, states, mechanisms, even
// which empty state the view is in — arrives computed from the backend's
// link_graph command (src-tauri/src/linkmap.rs) and is laid out verbatim.

// ---- Wire types, mirroring src-tauri/src/linkmap.rs ----------------------

export type NodeKind = "store" | "engine_root" | "project";
export type EdgeMechanism = "symlink" | "tracked_copy";
export type EdgeState = "linked" | "drifted" | "dangling";
export type GraphEmptyState = "no_links_at_all" | "no_project_edges";

export interface GraphNode {
  id: number;
  kind: NodeKind;
  label: string;
  path: string;
  asset_count: number;
  /** Engine roots only; null where the question has no meaning. */
  linked: boolean | null;
}

export interface GraphEdge {
  source: number;
  dest: number;
  mechanism: EdgeMechanism;
  state: EdgeState;
  count: number;
  /** Present only on focused (un-aggregated) edges. */
  dest_path: string | null;
}

export interface LinkGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  warnings: string[];
  empty_state: GraphEmptyState | null;
}

// The legend maps over these; the renderer's exhaustive switches match on
// them. One source for both, so the legend can never describe a style that
// is never drawn.
export const EDGE_MECHANISMS: readonly EdgeMechanism[] = ["symlink", "tracked_copy"];
export const EDGE_STATES: readonly EdgeState[] = ["linked", "drifted", "dangling"];

// ---- Geometry -------------------------------------------------------------

export const NODE_W = 192;
export const NODE_H = 52;
const MARGIN_X = 24;
const MARGIN_Y = 24;
const ROW_GAP = 14;
/** Vertical spread between parallel edges' anchors on the same node side. */
const ANCHOR_SPREAD = 7;

export interface PositionedNode extends GraphNode {
  x: number;
  y: number;
}

export interface PositionedEdge extends GraphEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** SVG path, a function of (x1, y1, x2, y2) and nothing else. */
  path: string;
}

export interface LinkMapLayout {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  width: number;
  height: number;
}

const COLUMN_OF: Record<NodeKind, number> = {
  store: 0,
  engine_root: 1,
  project: 2,
};

/** Stable order within a column: label, then id — node fields only. */
function byLabelThenId(a: GraphNode, b: GraphNode): number {
  if (a.label < b.label) return -1;
  if (a.label > b.label) return 1;
  return a.id - b.id;
}

function bezier(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

export function layoutLinkGraph(graph: LinkGraph, width: number): LinkMapLayout {
  const columnX = (column: number): number =>
    MARGIN_X + (column * (width - 2 * MARGIN_X - NODE_W)) / 2;

  const columns: GraphNode[][] = [[], [], []];
  for (const n of graph.nodes) {
    columns[COLUMN_OF[n.kind]].push(n);
  }

  const nodes: PositionedNode[] = [];
  for (const [column, members] of columns.entries()) {
    const ordered = [...members].sort(byLabelThenId);
    ordered.forEach((n, row) => {
      nodes.push({
        ...n,
        x: columnX(column),
        y: MARGIN_Y + row * (NODE_H + ROW_GAP),
      });
    });
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Parallel edges (same source and dest, different mechanism or state)
  // would overlap exactly on a shared anchor. They get distinct anchors —
  // spread deterministically by their order in the backend's sorted edge
  // list — and each path is still a function of its own endpoints only.
  const seenPairs = new Map<string, number>();
  const pairTotals = new Map<string, number>();
  for (const e of graph.edges) {
    const key = `${e.source}->${e.dest}`;
    pairTotals.set(key, (pairTotals.get(key) ?? 0) + 1);
  }

  const edges: PositionedEdge[] = [];
  for (const e of graph.edges) {
    const source = nodeById.get(e.source);
    const dest = nodeById.get(e.dest);
    if (!source || !dest) {
      // The backend names every endpoint it draws; an edge to a node it
      // did not send cannot be placed and is dropped rather than guessed.
      continue;
    }
    const key = `${e.source}->${e.dest}`;
    const index = seenPairs.get(key) ?? 0;
    seenPairs.set(key, index + 1);
    const siblings = pairTotals.get(key) ?? 1;
    const offset = (index - (siblings - 1) / 2) * ANCHOR_SPREAD;

    const x1 = source.x + NODE_W;
    const y1 = source.y + NODE_H / 2 + offset;
    const x2 = dest.x;
    const y2 = dest.y + NODE_H / 2 + offset;
    edges.push({ ...e, x1, y1, x2, y2, path: bezier(x1, y1, x2, y2) });
  }

  const deepestRow = Math.max(0, ...columns.map((c) => c.length - 1));
  const height = MARGIN_Y * 2 + deepestRow * (NODE_H + ROW_GAP) + NODE_H;

  return { nodes, edges, width, height };
}
