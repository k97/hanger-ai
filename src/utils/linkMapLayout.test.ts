// Pure-function tests: no window, no DOM, no environment annotation. The
// layout must be callable from anywhere and give the same answer twice.
import { describe, it, expect } from "vitest";
import {
  layoutLinkGraph,
  middleTruncate,
  EDGE_MECHANISMS,
  EDGE_STATES,
  type LinkGraph,
  type GraphNode,
} from "./linkMapLayout";

const node = (
  id: number,
  kind: GraphNode["kind"],
  label: string,
  extras: Partial<GraphNode> = {},
): GraphNode => ({
  id,
  kind,
  label,
  path: `/fake/${label}`,
  asset_count: 0,
  linked: kind === "engine_root" ? false : null,
  skill_count: 0,
  rule_count: 0,
  subagent_count: 0,
  tool_count: 0,
  linked_from: 0,
  rules: [],
  ...extras,
});

const baseGraph = (): LinkGraph => ({
  nodes: [
    node(10, "project", "zeta"),
    node(1, "store", ".agents"),
    node(5, "engine_root", "Claude Code", { linked: true }),
    node(9, "project", "alpha"),
    node(6, "engine_root", "Codex", { linked: false }),
  ],
  edges: [
    { source: 1, dest: 5, mechanism: "symlink", state: "linked", count: 2, dest_path: null },
    { source: 1, dest: 9, mechanism: "symlink", state: "linked", count: 3, dest_path: null },
  ],
  warnings: [],
  empty_state: null,
});

describe("layoutLinkGraph", () => {
  it("places the three kinds in three ordered columns", () => {
    const layout = layoutLinkGraph(baseGraph(), 1280);
    const x = (id: number) => layout.nodes.find((n) => n.id === id)!.x;
    expect(x(1)).toBeLessThan(x(5));
    expect(x(5)).toBeLessThan(x(9));
    // Same-kind nodes share their column.
    expect(x(5)).toBe(x(6));
    expect(x(9)).toBe(x(10));
  });

  it("orders a column by label then id — a stable sort on node fields, not input order", () => {
    const a = layoutLinkGraph(baseGraph(), 1280);
    const shuffled = baseGraph();
    shuffled.nodes.reverse();
    const b = layoutLinkGraph(shuffled, 1280);
    expect(b).toEqual(a);

    const y = (id: number) => a.nodes.find((n) => n.id === id)!.y;
    expect(y(9)).toBeLessThan(y(10)); // alpha above zeta
  });

  it("returns identical output for two calls on the same graph", () => {
    const g = baseGraph();
    expect(layoutLinkGraph(g, 1280)).toEqual(layoutLinkGraph(g, 1280));
  });

  it("derives every edge path from its endpoint coordinates alone", () => {
    const layout = layoutLinkGraph(baseGraph(), 1280);
    for (const edge of layout.edges) {
      const mx = (edge.x1 + edge.x2) / 2;
      expect(edge.path).toBe(
        `M ${edge.x1} ${edge.y1} C ${mx} ${edge.y1}, ${mx} ${edge.y2}, ${edge.x2} ${edge.y2}`,
      );
    }
  });

  it("spreads parallel edges by giving them distinct anchors, not curved guesses", () => {
    const g = baseGraph();
    g.edges = [
      { source: 1, dest: 9, mechanism: "symlink", state: "linked", count: 1, dest_path: null },
      { source: 1, dest: 9, mechanism: "tracked_copy", state: "drifted", count: 1, dest_path: null },
    ];
    const layout = layoutLinkGraph(g, 1280);
    const [e1, e2] = layout.edges;
    expect(e1.y1).not.toBe(e2.y1);
    expect(e1.y2).not.toBe(e2.y2);
  });

  it("still lays out nodes when there are no edges at all", () => {
    const g = baseGraph();
    g.edges = [];
    g.empty_state = "no_links_at_all";
    const layout = layoutLinkGraph(g, 860);
    expect(layout.nodes.length).toBe(5);
    expect(layout.edges.length).toBe(0);
    expect(layout.height).toBeGreaterThan(0);
  });

  it("lays out only the requested kinds, re-spreading the columns", () => {
    const layout = layoutLinkGraph(baseGraph(), 1280, { kinds: ["store", "engine_root"] });
    expect(layout.nodes.every((n) => n.kind !== "project")).toBe(true);

    // Edges to hidden nodes are dropped, not guessed.
    expect(layout.edges).toHaveLength(1);
    expect(layout.edges[0].dest).toBe(5);

    // Two columns spread across the full width, not squeezed into thirds.
    const x = (id: number) => layout.nodes.find((n) => n.id === id)!.x;
    const three = layoutLinkGraph(baseGraph(), 1280);
    const engineXInThree = three.nodes.find((n) => n.id === 5)!.x;
    expect(x(5)).toBeGreaterThan(engineXInThree);

    // Same graph, same kinds, same answer.
    expect(layoutLinkGraph(baseGraph(), 1280, { kinds: ["store", "engine_root"] })).toEqual(layout);
  });

  it("truncates long text in the middle, keeping the tail that identifies it", () => {
    expect(middleTruncate("~/Library/Application Support/Claude", 24)).toBe(
      "~/Library…Support/Claude",
    );
    expect(middleTruncate("short", 24)).toBe("short");
    expect(middleTruncate("~/Work/Projects/rkarthik/mei-recipes", 24).length).toBeLessThanOrEqual(24);
    expect(middleTruncate("~/Work/Projects/rkarthik/mei-recipes", 24).endsWith("mei-recipes")).toBe(
      true,
    );
  });

  it("exports the exhaustive enum lists the legend renders from", () => {
    // The renderer matches on these; the legend maps over them. If a
    // variant is added the compiler and this pin both notice.
    expect(EDGE_MECHANISMS).toEqual(["symlink", "tracked_copy"]);
    expect(EDGE_STATES).toEqual(["linked", "drifted", "dangling"]);
  });
});
