// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import LinkMapPane from "./LinkMapPane";
import LinkMapInspector from "./LinkMapInspector";
import { layoutLinkGraph, type LinkGraph, type LinkMapSelection } from "../utils/linkMapLayout";

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

interface Callbacks {
  onSelect: ReturnType<typeof vi.fn>;
  onToggleProjects: ReturnType<typeof vi.fn>;
  onOpenProject: ReturnType<typeof vi.fn>;
}

const renderPane = (
  g: LinkGraph | null,
  { showProjects = true }: { showProjects?: boolean } = {},
): Callbacks => {
  const callbacks: Callbacks = {
    onSelect: vi.fn(),
    onToggleProjects: vi.fn(),
    onOpenProject: vi.fn(),
  };
  render(
    <LinkMapPane
      graph={g}
      loading={false}
      selection={null}
      onSelect={callbacks.onSelect}
      showProjects={showProjects}
      onToggleProjects={callbacks.onToggleProjects}
      onOpenProject={callbacks.onOpenProject}
      onRescan={() => {}}
    />,
  );
  return callbacks;
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

  it("hides projects until the chip asks for them, and their edges go too", () => {
    const callbacks = renderPane(graph(), { showProjects: false });
    expect(screen.queryByTestId("map-node-4")).toBeNull();
    // Only the store→engine edge survives; the three project edges left
    // with their column.
    expect(screen.getAllByTestId("map-edge")).toHaveLength(1);

    const chip = screen.getByTestId("chip-projects");
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(chip);
    expect(callbacks.onToggleProjects).toHaveBeenCalledTimes(1);
  });

  it("opens a popover on edge click; its Details action reports the selection", () => {
    const callbacks = renderPane(graph());
    fireEvent.click(screen.getAllByTestId("map-edge-hit")[0]);
    const popover = screen.getByTestId("map-popover");
    expect(popover.textContent).toContain("symlink");
    expect(callbacks.onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Details"));
    expect(callbacks.onSelect).toHaveBeenCalledTimes(1);
    expect(callbacks.onSelect.mock.calls[0][0].kind).toBe("edge");
    expect(screen.queryByTestId("map-popover")).toBeNull();
  });

  it("opens a popover on node click with the full untruncated path", () => {
    renderPane(graph());
    fireEvent.click(screen.getByTestId("map-node-2"));
    const popover = screen.getByTestId("map-popover");
    expect(popover.textContent).toContain("Claude Code");
    expect(popover.textContent).toContain("/u/k/.claude");
    expect(popover.textContent).toContain("Engine root · linked");
  });

  it("offers Open project on project nodes, wired to the callback", () => {
    const callbacks = renderPane(graph());
    fireEvent.click(screen.getByTestId("map-node-4"));
    fireEvent.click(screen.getByText("Open project"));
    expect(callbacks.onOpenProject).toHaveBeenCalledWith("/u/k/w/metrics-board");
  });

  it("shows zoom controls that never obscure what they operate on", () => {
    renderPane(graph());
    for (const id of ["zoom-in", "zoom-out", "zoom-fit"]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
  });

  it("explains the no-links-at-all state in words, not blankness", () => {
    renderPane(graph({ edges: [], empty_state: "no_links_at_all" }));
    expect(screen.getByText(/Nothing is linked yet/i)).toBeTruthy();
    expect(screen.getAllByTestId(/^map-node-/)).toHaveLength(4);
  });

  it("says plainly when project links are unrecorded — but only while projects show", () => {
    renderPane(
      graph({
        edges: [{ source: 1, dest: 2, mechanism: "symlink", state: "linked", count: 2, dest_path: null }],
        empty_state: "no_project_edges",
      }),
    );
    expect(screen.getByText(/project links.*not been recorded/i)).toBeTruthy();
    cleanup();

    renderPane(
      graph({
        edges: [{ source: 1, dest: 2, mechanism: "symlink", state: "linked", count: 2, dest_path: null }],
        empty_state: "no_project_edges",
      }),
      { showProjects: false },
    );
    expect(screen.queryByText(/project links.*not been recorded/i)).toBeNull();
  });
});

describe("LinkMapInspector", () => {
  const layout = layoutLinkGraph(graph(), 880);
  const edgeSel = (predicate: (e: (typeof layout.edges)[number]) => boolean): LinkMapSelection => ({
    kind: "edge",
    edge: layout.edges.find(predicate)!,
  });

  it("shows what the edge is, where it goes, how it travels, and its state", () => {
    render(
      <LinkMapInspector
        selection={edgeSel((e) => e.dest === 4 && e.state === "drifted")}
        nodes={graph().nodes}
        onOpenProject={() => {}}
      />,
    );
    expect(screen.getByText(".agents → metrics-board")).toBeTruthy();
    expect(screen.getAllByText(/Tracked copy/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/no longer matches/i)).toBeTruthy();
  });

  it("labels the count by what actually travels: assets to a project, root links to an engine", () => {
    const { unmount } = render(
      <LinkMapInspector
        selection={edgeSel((e) => e.dest === 4 && e.state === "linked")}
        nodes={graph().nodes}
        onOpenProject={() => {}}
      />,
    );
    expect(screen.getByText("Assets travelling")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    unmount();

    render(
      <LinkMapInspector
        selection={edgeSel((e) => e.dest === 2)}
        nodes={graph().nodes}
        onOpenProject={() => {}}
      />,
    );
    expect(screen.getByText("Root-level symlinks")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("inspects a node: its facts, and Open project for projects", () => {
    const onOpenProject = vi.fn();
    const projectNode = graph().nodes.find((n) => n.id === 4)!;
    render(
      <LinkMapInspector
        selection={{ kind: "node", node: projectNode }}
        nodes={graph().nodes}
        onOpenProject={onOpenProject}
      />,
    );
    expect(screen.getByText("metrics-board")).toBeTruthy();
    expect(screen.getByText("82")).toBeTruthy();
    fireEvent.click(screen.getByText("Open project"));
    expect(onOpenProject).toHaveBeenCalledWith("/u/k/w/metrics-board");
  });

  it("says whether an engine root actually reaches the store", () => {
    const unlinked = graph().nodes.find((n) => n.id === 3)!;
    render(
      <LinkMapInspector
        selection={{ kind: "node", node: unlinked }}
        nodes={graph().nodes}
        onOpenProject={() => {}}
      />,
    );
    expect(screen.getByText(/Nothing at this root points into the store/i)).toBeTruthy();
  });

  it("invents no provenance — nothing records who created a link or when", () => {
    render(
      <LinkMapInspector
        selection={edgeSel(() => true)}
        nodes={graph().nodes}
        onOpenProject={() => {}}
      />,
    );
    for (const phantom of [/created/i, /last verified/i, /by whom/i]) {
      expect(screen.queryByText(phantom)).toBeNull();
    }
  });

  it("asks for a selection when nothing is chosen", () => {
    render(<LinkMapInspector selection={null} nodes={[]} onOpenProject={() => {}} />);
    expect(screen.getByText(/Nothing selected/i)).toBeTruthy();
  });
});
