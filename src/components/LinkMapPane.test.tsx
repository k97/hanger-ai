// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import LinkMapPane from "./LinkMapPane";
import LinkMapInspector from "./LinkMapInspector";
import { layoutLinkGraph, type LinkGraph } from "../utils/linkMapLayout";

afterEach(cleanup);

const graph = (overrides: Partial<LinkGraph> = {}): LinkGraph => ({
  nodes: [
    { id: 1, kind: "store", label: ".agents", path: "/u/k/.agents", asset_count: 117, linked: null },
    { id: 2, kind: "engine_root", label: "Claude Code", path: "/u/k/.claude", asset_count: 10, linked: true },
    { id: 3, kind: "engine_root", label: "Claude Desktop", path: "/u/k/Library/Claude", asset_count: 1, linked: false },
    { id: 4, kind: "project", label: "metrics-board", path: "/u/k/w/metrics-board", asset_count: 82, linked: null },
  ],
  edges: [
    { source: 1, dest: 2, mechanism: "symlink", state: "linked", count: 2, dest_path: null },
    { source: 1, dest: 4, mechanism: "symlink", state: "linked", count: 3, dest_path: null },
    { source: 1, dest: 4, mechanism: "tracked_copy", state: "drifted", count: 1, dest_path: null },
    { source: 1, dest: 4, mechanism: "symlink", state: "dangling", count: 1, dest_path: null },
  ],
  warnings: [],
  empty_state: null,
  ...overrides,
});

const renderPane = (g: LinkGraph | null, onSelectEdge = vi.fn()) => {
  render(
    <LinkMapPane
      graph={g}
      loading={false}
      selectedEdge={null}
      onSelectEdge={onSelectEdge}
      onRescan={() => {}}
    />,
  );
  return onSelectEdge;
};

describe("LinkMapPane", () => {
  it("draws one box per node and one visible path per edge", () => {
    renderPane(graph());
    expect(screen.getAllByTestId(/^map-node-/)).toHaveLength(4);
    expect(screen.getAllByTestId("map-edge")).toHaveLength(4);
  });

  it("carries mechanism in the stroke style: solid symlink, dashed tracked copy", () => {
    renderPane(graph());
    const edges = screen.getAllByTestId("map-edge");
    const dashes = edges.map((e) => e.getAttribute("stroke-dasharray"));
    // Three symlinks solid, one tracked copy dashed.
    expect(dashes.filter((d) => d === null)).toHaveLength(3);
    expect(dashes.filter((d) => d !== null)).toHaveLength(1);
  });

  it("carries state in colour, via tokens only", () => {
    renderPane(graph());
    const edges = screen.getAllByTestId("map-edge");
    const classes = edges.map((e) => e.getAttribute("class") ?? "");
    expect(classes.filter((c) => c.includes("text-state-warning"))).toHaveLength(1);
    expect(classes.filter((c) => c.includes("text-state-danger"))).toHaveLength(1);
    expect(classes.some((c) => /#|red-500/.test(c))).toBe(false);
  });

  it("renders the legend from the same enums the renderer matches on", () => {
    renderPane(graph());
    const legend = screen.getByTestId("map-legend");
    for (const label of ["Symlink", "Tracked copy", "Linked", "Drifted", "Dangling"]) {
      expect(legend.textContent).toContain(label);
    }
  });

  it("marks an unlinked engine root instead of inventing an edge to it", () => {
    renderPane(graph());
    const node = screen.getByTestId("map-node-3");
    expect(node.textContent).toContain("not linked");
  });

  it("reports selection when an edge is clicked", () => {
    const onSelectEdge = renderPane(graph());
    fireEvent.click(screen.getAllByTestId("map-edge-hit")[0]);
    expect(onSelectEdge).toHaveBeenCalledTimes(1);
    expect(onSelectEdge.mock.calls[0][0]).toMatchObject({ source: 1 });
  });

  it("explains the no-links-at-all state in words, not blankness", () => {
    renderPane(graph({ edges: [], empty_state: "no_links_at_all" }));
    expect(screen.getByText(/Nothing is linked yet/i)).toBeTruthy();
    // The world still renders — columns are real even with no edges.
    expect(screen.getAllByTestId(/^map-node-/)).toHaveLength(4);
  });

  it("says plainly when per-asset project links are unrecorded, while engine edges still draw", () => {
    renderPane(
      graph({
        edges: [{ source: 1, dest: 2, mechanism: "symlink", state: "linked", count: 2, dest_path: null }],
        empty_state: "no_project_edges",
      }),
    );
    expect(screen.getByText(/project links.*not been recorded/i)).toBeTruthy();
    expect(screen.getAllByTestId("map-edge")).toHaveLength(1);
  });
});

describe("LinkMapInspector", () => {
  const layout = layoutLinkGraph(graph(), 880);

  it("shows what the edge is, where it goes, how it travels, and its state", () => {
    const edge = layout.edges.find((e) => e.dest === 4 && e.state === "drifted")!;
    render(<LinkMapInspector edge={edge} nodes={graph().nodes} />);
    expect(screen.getByText(".agents → metrics-board")).toBeTruthy();
    // Named in the eyebrow AND spelled out in the detail row.
    expect(screen.getAllByText(/Tracked copy/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/no longer matches/i)).toBeTruthy();
  });

  it("labels the count by what actually travels: assets to a project, root links to an engine", () => {
    const projectEdge = layout.edges.find((e) => e.dest === 4 && e.state === "linked")!;
    const { unmount } = render(
      <LinkMapInspector edge={projectEdge} nodes={graph().nodes} />,
    );
    expect(screen.getByText("Assets travelling")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    unmount();

    const engineEdge = layout.edges.find((e) => e.dest === 2)!;
    render(<LinkMapInspector edge={engineEdge} nodes={graph().nodes} />);
    expect(screen.getByText("Root-level symlinks")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("invents no provenance — nothing records who created a link or when", () => {
    const edge = layout.edges[0];
    render(<LinkMapInspector edge={edge} nodes={graph().nodes} />);
    for (const phantom of [/created/i, /last verified/i, /by whom/i]) {
      expect(screen.queryByText(phantom)).toBeNull();
    }
  });

  it("asks for a selection when no edge is chosen", () => {
    render(<LinkMapInspector edge={null} nodes={[]} />);
    expect(screen.getByText(/Nothing selected/i)).toBeTruthy();
  });
});
