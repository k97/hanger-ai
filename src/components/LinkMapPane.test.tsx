// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import LinkMapPane from "./LinkMapPane";
import type { LinkGraph } from "../utils/linkMapLayout";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => undefined) }));

afterEach(cleanup);

const graph = (overrides: Partial<LinkGraph> = {}): LinkGraph => ({
  nodes: [
    { id: 1, kind: "store", label: ".agents", path: "/u/k/.agents", asset_count: 117, linked: null },
    { id: 2, kind: "engine_root", label: "Claude Code", path: "/u/k/.claude", asset_count: 10, linked: true },
    { id: 3, kind: "engine_root", label: "Claude Desktop", path: "/u/k/Library/Claude", asset_count: 1, linked: false },
    { id: 4, kind: "project", label: "metrics-board", path: "/u/k/w/metrics-board", asset_count: 82, linked: null },
  ],
  // Order matters to the tests below: the layout preserves it, so hit-path
  // N is edges[N].
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
  onToggleProjects: ReturnType<typeof vi.fn>;
  onOpenProject: ReturnType<typeof vi.fn>;
  onNoticesSeen: ReturnType<typeof vi.fn>;
}

/** Renders with a handle that re-renders the SAME tree, so state survives. */
const renderPaneRaw = (g: LinkGraph, showProjects: boolean) => {
  const pane = (sp: boolean) => (
    <LinkMapPane
      graph={g}
      loading={false}
      showProjects={sp}
      onToggleProjects={vi.fn()}
      onOpenProject={vi.fn()}
      noticesSeen={null}
      onNoticesSeen={vi.fn()}
    />
  );
  const view = render(pane(showProjects));
  return { setShowProjects: (sp: boolean) => view.rerender(pane(sp)) };
};

const renderPane = (
  g: LinkGraph | null,
  { showProjects = true, noticesSeen = null }: { showProjects?: boolean; noticesSeen?: string | null } = {},
): Callbacks => {
  const callbacks: Callbacks = {
    onToggleProjects: vi.fn(),
    onOpenProject: vi.fn(),
    onNoticesSeen: vi.fn(),
  };
  render(
    <LinkMapPane
      graph={g}
      loading={false}
      showProjects={showProjects}
      onToggleProjects={callbacks.onToggleProjects}
      onOpenProject={callbacks.onOpenProject}
      noticesSeen={noticesSeen}
      onNoticesSeen={callbacks.onNoticesSeen}
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

  it("hides projects until the layers control asks for them, and their edges go too", () => {
    const callbacks = renderPane(graph(), { showProjects: false });
    expect(screen.queryByTestId("map-node-4")).toBeNull();
    // Only the store→engine edge survives; the three project edges left
    // with their column.
    expect(screen.getAllByTestId("map-edge")).toHaveLength(1);

    // The toggle lives on the map, behind the layers button — Maps style.
    expect(screen.queryByTestId("map-layers-panel")).toBeNull();
    fireEvent.click(screen.getByTestId("map-layers"));
    const chip = screen.getByTestId("chip-projects");
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(chip);
    expect(callbacks.onToggleProjects).toHaveBeenCalledTimes(1);
  });

  it("docks the detail card on edge click — the Maps pattern, no popover hop", () => {
    renderPane(graph());
    fireEvent.click(screen.getAllByTestId("map-edge-hit")[0]);
    const card = screen.getByTestId("map-placecard");
    // A store→engine edge: what it is, its state, and what travels it.
    expect(card.textContent).toContain(".agents → Claude Code");
    expect(card.textContent).toContain("Resolves to its source");
    expect(card.textContent).toContain("Root-level symlinks");
    // Edge card: ".agents → Claude Code" — only the engine end is a product.
    const marks = Array.from(card.querySelectorAll("svg[data-brand]")).map((s) => s.getAttribute("data-brand"));
    expect(marks).toEqual(["claude_code"]);
    expect(card.textContent).toContain(".agents");
    expect(card.textContent).toContain("2");
  });

  it("labels a project edge's count by what travels it, and carries drift", () => {
    renderPane(graph());
    fireEvent.click(screen.getAllByTestId("map-edge-hit")[2]);
    const card = screen.getByTestId("map-placecard");
    expect(card.textContent).toContain("Tracked copy");
    expect(card.textContent).toContain("no longer matches");
    expect(card.textContent).toContain("Assets travelling");
  });

  it("still docks the card when the click follows a full pointer sequence", () => {
    // The real bug this pins: pointer capture taken on pointerdown retargets
    // the ensuing click to the svg in WebKit, so no node ever received it.
    // Capture must only be taken once a drag actually starts.
    renderPane(graph());
    const node = screen.getByTestId("map-node-2");
    fireEvent.pointerDown(node, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(node, { clientX: 100, clientY: 100 });
    fireEvent.click(node);
    expect(screen.getByTestId("map-placecard")).toBeTruthy();
  });

  it("shows a node's full untruncated path and its reach in the card", () => {
    renderPane(graph());
    fireEvent.click(screen.getByTestId("map-node-2"));
    const card = screen.getByTestId("map-placecard");
    expect(card.textContent).toContain("Claude Code");
    expect(card.textContent).toContain("/u/k/.claude");
    expect(card.textContent).toContain("Reaches the store through a root-level symlink");
    expect(card.textContent).toContain("10");

    // Paired with the "Claude Code" check above: the node heading's mark
    // must resolve to that engine specifically, not a generic glyph.
    const heading = card.querySelector("h2");
    expect(heading?.textContent).toBe("Claude Code");
    expect(heading?.querySelector("svg")?.getAttribute("data-brand")).toBe("claude_code");
  });

  it("says when an engine root reaches nothing", () => {
    renderPane(graph());
    fireEvent.click(screen.getByTestId("map-node-3"));
    expect(screen.getByTestId("map-placecard").textContent).toContain(
      "Nothing at this root points into the store",
    );
  });

  it("offers Open project on project nodes, wired to the callback", () => {
    const callbacks = renderPane(graph());
    fireEvent.click(screen.getByTestId("map-node-4"));
    fireEvent.click(screen.getByText("Open project"));
    expect(callbacks.onOpenProject).toHaveBeenCalledWith("/u/k/w/metrics-board");
  });

  it("closes the card from its own close control", () => {
    renderPane(graph());
    fireEvent.click(screen.getByTestId("map-node-2"));
    fireEvent.click(screen.getByLabelText("Close details"));
    expect(screen.queryByTestId("map-placecard")).toBeNull();
  });

  it("invents no provenance — nothing records who created a link or when", () => {
    renderPane(graph());
    fireEvent.click(screen.getAllByTestId("map-edge-hit")[0]);
    const card = screen.getByTestId("map-placecard");
    for (const phantom of [/created/i, /last verified/i, /by whom/i]) {
      expect(phantom.test(card.textContent ?? "")).toBe(false);
    }
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

  it("draws an engine-root node's mark inside the node and shifts its label right", () => {
    renderPane(graph());
    const claude = screen.getByTestId("map-node-2");
    const mark = claude.querySelector("svg[data-brand]");
    expect(mark?.getAttribute("data-brand")).toBe("claude_code");
    expect(mark?.querySelector("use")?.getAttribute("href")).toBe("#brand-claude_code");
    const store = screen.getByTestId("map-node-1");
    expect(store.querySelector("svg[data-brand]")).toBeNull();
    // Each node is measured against its OWN rect: store and engine_root sit in
    // different columns (KIND_ORDER in linkMapLayout.ts), so their x values are
    // unrelated. The label moves right of the 12px mark; the path line does not.
    const claudeX = Number(claude.querySelector("rect")!.getAttribute("x"));
    const [claudeLabel, claudePath] = Array.from(claude.querySelectorAll("text"));
    expect(Number(claudeLabel.getAttribute("x"))).toBe(claudeX + 29);
    expect(Number(claudePath.getAttribute("x"))).toBe(claudeX + 13);
    // The store keeps the original inset on both lines.
    const storeX = Number(store.querySelector("rect")!.getAttribute("x"));
    const [storeLabel] = Array.from(store.querySelectorAll("text"));
    expect(Number(storeLabel.getAttribute("x"))).toBe(storeX + 13);
    // The mark sits inside its node's box.
    expect(Number(mark!.getAttribute("x"))).toBe(claudeX + 13);
  });

  it("puts an alert control under the layers button, but only when there is something to say", () => {
    renderPane(graph());
    expect(screen.queryByTestId("map-notices")).toBeNull();

    cleanup();
    renderPane(graph({ warnings: ["link 4 → /gone: destination missing"] }));
    const alert = screen.getByTestId("map-notices");
    expect(alert.getAttribute("class")).toContain("text-state-warning");

    // It sits directly below the layers button in the same corner stack.
    const stack = alert.parentElement!;
    const buttons = Array.from(stack.children).filter((c) => c.tagName === "BUTTON");
    expect(buttons.map((b) => b.getAttribute("data-testid"))).toEqual([
      "map-layers",
      "map-notices",
    ]);

    fireEvent.click(alert);
    expect(screen.getByTestId("map-placecard").textContent).toContain(
      "link 4 → /gone: destination missing",
    );
  });

  it("carries an unread dot until the placecard has actually been opened", () => {
    const warned = () => graph({ warnings: ["link 4 → /gone: destination missing"] });

    const callbacks = renderPane(warned());
    expect(screen.getByTestId("map-notices-dot")).toBeTruthy();
    expect(screen.getByLabelText("Map warnings, unread")).toBeTruthy();

    fireEvent.click(screen.getByTestId("map-notices"));
    // Reading is what clears it, and the signature travels up to be stored.
    expect(callbacks.onNoticesSeen).toHaveBeenCalledTimes(1);
    const signature = callbacks.onNoticesSeen.mock.calls[0][0];
    expect(signature).toContain("undrawable-links");
    cleanup();

    // Coming back with that signature already read: no dot.
    renderPane(warned(), { noticesSeen: signature });
    expect(screen.queryByTestId("map-notices-dot")).toBeNull();
    expect(screen.getByLabelText("Map warnings")).toBeTruthy();
    cleanup();

    // A warning nobody has read is a different notice set, so it raises the
    // dot again even though the notice's id has not changed.
    renderPane(graph({ warnings: ["link 9 → /also-gone: destination missing"] }), {
      noticesSeen: signature,
    });
    expect(screen.getByTestId("map-notices-dot")).toBeTruthy();
  });

  it("lands notices in the docked card, not a second popover of their own", () => {
    renderPane(graph({ warnings: ["link 4 → /gone: destination missing"] }));
    fireEvent.click(screen.getByTestId("map-notices"));

    const card = screen.getByTestId("map-placecard");
    expect(card.textContent).toContain("Not everything could be drawn");
    expect(screen.queryByTestId("map-notices-panel")).toBeNull();

    // The control reads as pressed while its card is up, and the same card
    // gives way to a node — one detail surface, not two stacked.
    expect(screen.getByTestId("map-notices").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByTestId("map-node-2"));
    expect(screen.getByTestId("map-placecard").textContent).toContain("Claude Code");
    expect(screen.getByTestId("map-notices").getAttribute("aria-pressed")).toBe("false");
  });

  it("drops a notices card when a layer toggle takes its last notice away", () => {
    // The info notice belongs to the projects layer. Hiding projects must not
    // leave an empty card docked, claiming the map has something to say.
    const { setShowProjects } = renderPaneRaw(
      graph({ edges: [], empty_state: "no_project_edges" }),
      true,
    );
    fireEvent.click(screen.getByTestId("map-notices"));
    expect(screen.getByTestId("map-placecard")).toBeTruthy();

    setShowProjects(false);
    expect(screen.queryByTestId("map-placecard")).toBeNull();
    expect(screen.queryByTestId("map-notices")).toBeNull();
  });

  it("says plainly when project links are unrecorded — but only while projects show", () => {
    const unrecorded = () =>
      graph({
        edges: [{ source: 1, dest: 2, mechanism: "symlink", state: "linked", count: 2, dest_path: null }],
        empty_state: "no_project_edges",
      });

    renderPane(unrecorded());
    // The map keeps its full height: the explainer waits behind the control
    // rather than sitting in a banner strip above the canvas.
    expect(screen.queryByText(/project links.*not been recorded/i)).toBeNull();
    fireEvent.click(screen.getByTestId("map-notices"));
    expect(screen.getByText(/project links.*not been recorded/i)).toBeTruthy();
    cleanup();

    renderPane(unrecorded(), { showProjects: false });
    expect(screen.queryByTestId("map-notices")).toBeNull();
    expect(screen.queryByText(/project links.*not been recorded/i)).toBeNull();
  });
});
