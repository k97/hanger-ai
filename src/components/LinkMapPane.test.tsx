// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import LinkMapPane from "./LinkMapPane";
import type { LinkGraph } from "../utils/linkMapLayout";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => undefined) }));

afterEach(cleanup);

const graph = (overrides: Partial<LinkGraph> = {}): LinkGraph => ({
  nodes: [
    { id: 1, kind: "store", label: ".agents", path: "/u/k/.agents", asset_count: 117, linked: null,
      skill_count: 110, rule_count: 2, subagent_count: 5, tool_count: 0, linked_from: 1, rules: [] },
    { id: 2, kind: "engine_root", label: "Claude Code", path: "/u/k/.claude", asset_count: 10, linked: true,
      skill_count: 8, rule_count: 0, subagent_count: 2, tool_count: 0, linked_from: 0, rules: [] },
    { id: 3, kind: "engine_root", label: "Claude Desktop", path: "/u/k/Library/Claude", asset_count: 1, linked: false,
      skill_count: 0, rule_count: 0, subagent_count: 0, tool_count: 1, linked_from: 0, rules: [] },
    { id: 4, kind: "project", label: "metrics-board", path: "/u/k/w/metrics-board", asset_count: 16, linked: null,
      skill_count: 9, rule_count: 2, subagent_count: 0, tool_count: 5, linked_from: 0, rules: ["AGENTS.md", "CLAUDE.md"] },
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
  onShowEngineAssets: ReturnType<typeof vi.fn>;
  onReview: ReturnType<typeof vi.fn>;
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
      onShowEngineAssets={vi.fn()}
      onReview={vi.fn()}
    />
  );
  const view = render(pane(showProjects));
  return { setShowProjects: (sp: boolean) => view.rerender(pane(sp)) };
};

const renderPane = (
  g: LinkGraph | null,
  {
    showProjects = true,
    noticesSeen = null,
    loading = false,
  }: { showProjects?: boolean; noticesSeen?: string | null; loading?: boolean } = {},
): Callbacks => {
  const callbacks: Callbacks = {
    onToggleProjects: vi.fn(),
    onOpenProject: vi.fn(),
    onNoticesSeen: vi.fn(),
    onShowEngineAssets: vi.fn(),
    onReview: vi.fn(),
  };
  render(
    <LinkMapPane
      graph={g}
      loading={loading}
      showProjects={showProjects}
      onToggleProjects={callbacks.onToggleProjects}
      onOpenProject={callbacks.onOpenProject}
      noticesSeen={noticesSeen}
      onNoticesSeen={callbacks.onNoticesSeen}
      onShowEngineAssets={callbacks.onShowEngineAssets}
      onReview={callbacks.onReview}
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

  it("shows the frame mark redrawing while the graph is still being read", () => {
    renderPane(null, { loading: true });
    const body = screen.getByText("Reading the link graph…").closest("div")!;
    // v5 mark: frame — the grid that grounds the map redraws itself, looping
    // while the read is in flight. aim-loop sits on the line itself, not a
    // wrapping <g> — frame is one of the ten stagger marks (finding 1,
    // final review), so the class and the geometry it delays are the same
    // element, not ancestor and descendant.
    expect(body.querySelector('line[x1="22"].aim-loop')).toBeTruthy();
  });

  it("shows the closed-connection mark, once, when there is no graph at all", () => {
    renderPane(null, { loading: false });
    const body = screen.getByText("No link graph yet.").closest("div")!;
    // v5 mark: git-pull-request-closed — a connection that terminates rather
    // than resolves, played once since this is a standing fact, not progress.
    // aim-once sits on the circle itself, not a wrapping <g> —
    // git-pull-request-closed is one of the ten stagger marks (finding 1,
    // final review), so the class and the geometry it delays are the same
    // element, not ancestor and descendant.
    expect(body.querySelector('circle[cx="6"].aim-once')).toBeTruthy();
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

  it("hover focus keeps a node, its edges and their other ends; dims the rest; lets go on leave", () => {
    renderPane(graph());
    const claude = screen.getByTestId("map-node-2");
    const desktop = screen.getByTestId("map-node-3");
    const store = screen.getByTestId("map-node-1");
    const edges = screen.getAllByTestId("map-edge").map((p) => p.closest("g")!);

    fireEvent.mouseEnter(claude);
    // Claude Code is hovered; the store is the other end of its one edge.
    expect(claude.getAttribute("class")).not.toContain("opacity-35");
    expect(store.getAttribute("class")).not.toContain("opacity-35");
    // Claude Desktop touches nothing Claude Code touches.
    expect(desktop.getAttribute("class")).toContain("opacity-35");
    // edges[0] is store→Claude Code (stays); edges[1..3] go to the project (dim).
    expect(edges[0].getAttribute("class")).not.toContain("opacity-35");
    expect(edges[1].getAttribute("class")).toContain("opacity-35");
    // Dimming is a transition on the hover beat, never a colour.
    expect(desktop.getAttribute("class")).toContain("transition-opacity");
    expect(desktop.getAttribute("class")).toContain("duration-hover");

    fireEvent.mouseLeave(claude);
    expect(desktop.getAttribute("class")).not.toContain("opacity-35");
    expect(edges[1].getAttribute("class")).not.toContain("opacity-35");
  });

  it("marks the destination of a drifted or dangling edge with a state dot, worst state wins", () => {
    renderPane(graph());
    // Project 4 receives a drifted tracked copy AND a dangling symlink — danger wins.
    const project = screen.getByTestId("map-node-4");
    const dot = project.querySelector('[data-testid="map-state-dot"]')!;
    expect(dot).toBeTruthy();
    expect(dot.getAttribute("class")).toContain("fill-state-danger");
    expect(dot.getAttribute("class")).toContain("stroke-page");
    expect(dot.getAttribute("r")).toBe("4");
    const rect = project.querySelector("rect")!;
    expect(Number(dot.getAttribute("cx"))).toBe(Number(rect.getAttribute("x")) + 192 - 10);
    expect(Number(dot.getAttribute("cy"))).toBe(Number(rect.getAttribute("y")) + 10);
    // Claude Code's only edge is linked: no dot. The store is the SOURCE of
    // every edge and never carries one.
    expect(screen.getByTestId("map-node-2").querySelector('[data-testid="map-state-dot"]')).toBeNull();
    expect(screen.getByTestId("map-node-1").querySelector('[data-testid="map-state-dot"]')).toBeNull();
  });

  it("a drifted edge alone draws the dot in warning", () => {
    renderPane(
      graph({
        edges: [{ source: 1, dest: 4, mechanism: "tracked_copy", state: "drifted", count: 1, dest_path: null }],
      }),
    );
    const dot = screen.getByTestId("map-node-4").querySelector('[data-testid="map-state-dot"]')!;
    expect(dot.getAttribute("class")).toContain("fill-state-warning");
  });

  // The fixture is only useful if the backend could produce it. scanner.rs
  // computes total_assets as exactly the sum of the four kinds, and a project
  // node's rule_count and rules list are read from the same assets rows.
  it("every fixture node describes a state the backend could produce", () => {
    for (const n of graph().nodes) {
      expect({
        node: n.label,
        total: n.asset_count,
      }).toEqual({
        node: n.label,
        total: n.skill_count + n.rule_count + n.subagent_count + n.tool_count,
      });
      if (n.kind === "project") {
        expect({ node: n.label, rules: n.rule_count }).toEqual({
          node: n.label,
          rules: n.rules.length,
        });
      }
    }
  });

  it("the layers panel has three switch rows in order, Unlinked roots on and Only drift off by default", () => {
    renderPane(graph());
    fireEvent.click(screen.getByTestId("map-layers"));
    const panel = screen.getByTestId("map-layers-panel");
    const rows = Array.from(panel.querySelectorAll("button"));
    expect(rows.map((r) => r.textContent)).toEqual(["Projects", "Unlinked roots", "Only drifted and dangling"]);
    expect(rows.map((r) => r.getAttribute("aria-pressed"))).toEqual(["true", "true", "false"]);
    // A switch, not a check mark: every row carries the 26×16 glyph.
    for (const row of rows) {
      const sw = row.querySelector('svg[data-testid="layer-switch"]')!;
      expect(sw.getAttribute("width")).toBe("26");
      expect(sw.getAttribute("height")).toBe("16");
    }
    expect(panel.querySelector('[data-testid="chip-projects"]')).toBeTruthy();
  });

  it("Unlinked roots off removes the unlinked engine root and re-flows the column", () => {
    // The shared fixture cannot show a re-flow: its unlinked root is LAST in
    // the engine column (y=90, with nothing beneath it), so filtering before
    // layout and hiding after layout produce byte-identical output and the
    // old assertions — node 3 gone, node 2 still there — passed either way.
    // A third root BELOW the unlinked one is what makes the two distinguishable
    // (`LinkMapPane.tsx:213-218` filters before `layoutLinkGraph`).
    const g = graph();
    const withThirdRoot = {
      ...g,
      nodes: [
        ...g.nodes,
        { id: 5, kind: "engine_root" as const, label: "Zed", path: "/u/k/.zed", asset_count: 2, linked: true,
          skill_count: 2, rule_count: 0, subagent_count: 0, tool_count: 0, linked_from: 0, rules: [] },
      ],
    };
    const yOf = (id: number) =>
      screen.getByTestId(`map-node-${id}`).querySelector("rect")!.getAttribute("y");

    renderPane(withThirdRoot);
    fireEvent.click(screen.getByTestId("map-layers"));
    expect(screen.getByTestId("map-node-3")).toBeTruthy();
    const zedBefore = yOf(5);
    const unlinkedY = yOf(3);
    // Zed sits below the unlinked root, which is the whole point of the fixture.
    expect(Number(zedBefore)).toBeGreaterThan(Number(unlinkedY));

    fireEvent.click(screen.getByTestId("chip-unlinked"));

    expect(screen.queryByTestId("map-node-3")).toBeNull();
    expect(screen.getByTestId("map-node-2")).toBeTruthy();
    // Re-flow: Zed takes the slot the unlinked root vacated. Post-layout
    // hiding would leave it exactly where it was.
    expect(yOf(5)).toBe(unlinkedY);
    expect(Number(yOf(5))).toBeLessThan(Number(zedBefore));
    expect(screen.getByTestId("chip-unlinked").getAttribute("aria-pressed")).toBe("false");
  });

  it("Only drifted and dangling hides linked edges and keeps the nodes", () => {
    renderPane(graph());
    fireEvent.click(screen.getByTestId("map-layers"));
    expect(screen.getAllByTestId("map-edge")).toHaveLength(4);
    fireEvent.click(screen.getByTestId("chip-faults"));
    // The drifted tracked copy and the dangling symlink survive; two linked edges go.
    expect(screen.getAllByTestId("map-edge")).toHaveLength(2);
    expect(screen.getAllByTestId(/^map-node-\d+$/)).toHaveLength(4);
  });

  it("a node's facts are one list card: Assets, then each kind it holds, hidden at zero", () => {
    renderPane(graph());
    fireEvent.click(screen.getByTestId("map-node-1"));
    const card = screen.getByTestId("map-placecard");
    const rows = Array.from(card.querySelectorAll('[data-testid^="placecard-row-"]')).map((r) => r.textContent);
    // The fixture store holds 110 skills, 2 rules, 5 subagents, 0 MCP servers, and is linked from 1 engine root.
    expect(rows).toEqual(["Assets117", "Skills110", "Rules2", "Subagents5", "Linked from1 engine root"]);
    expect(card.textContent).not.toContain("Kind");
    expect(card.querySelector("dl")).toBeNull();
  });

  it("an engine root lists its kinds and no Linked row — the state line already says it reaches the store", () => {
    renderPane(graph());
    fireEvent.click(screen.getByTestId("map-node-2"));
    const card = screen.getByTestId("map-placecard");
    const rows = Array.from(card.querySelectorAll('[data-testid^="placecard-row-"]')).map((r) => r.textContent);
    expect(rows).toEqual(["Assets10", "Skills8", "Subagents2"]);
    expect(card.textContent).not.toContain("Yes — at the root");
    expect(card.textContent).toContain("Reaches the store through a root-level symlink");
  });

  it("an edge's facts are the same card, without a Kind row", () => {
    renderPane(graph());
    fireEvent.click(screen.getAllByTestId("map-edge-hit")[0]);
    const card = screen.getByTestId("map-placecard");
    expect(card.querySelector("dl")).toBeNull();
    const rows = Array.from(card.querySelectorAll('[data-testid^="placecard-row-"]')).map((r) => r.textContent);
    expect(rows[0]).toBe("Root-level symlinks2");
    expect(rows[1]).toBe("From/u/k/.agents");
    expect(rows[2]).toBe("Into/u/k/.claude");
    expect(card.textContent).not.toContain("Symlink — one copy, no drift");
  });

  it("a project lists its rules by name under 'Rules here'; a project with none draws no section", () => {
    renderPane(graph());
    fireEvent.click(screen.getByTestId("map-node-4"));
    const card = screen.getByTestId("map-placecard");
    expect(within(card).getByText("Rules here")).toBeTruthy();
    const names = Array.from(card.querySelectorAll('[data-testid="placecard-rule"]')).map((r) => r.textContent);
    expect(names).toEqual(["AGENTS.md", "CLAUDE.md"]);
    expect(card.querySelector('[data-testid="placecard-rule"] .font-mono, [data-testid="placecard-rule"] span.font-mono')).toBeTruthy();

    cleanup();
    renderPane(graph({ nodes: graph().nodes.map((n) => (n.id === 4 ? { ...n, rules: [] } : n)) }));
    fireEvent.click(screen.getByTestId("map-node-4"));
    expect(screen.queryByText("Rules here")).toBeNull();
  });

  it("offers Show its assets on an engine root, as a mini, wired to the callback with the engine's name", () => {
    const callbacks = renderPane(graph());
    fireEvent.click(screen.getByTestId("map-node-2"));
    const button = screen.getByRole("button", { name: "Show its assets" });
    expect(button.className).toContain("h-[26px]");
    expect(button.className).toContain("rounded-control");
    expect(button.className).not.toContain("rounded-pill");
    fireEvent.click(button);
    expect(callbacks.onShowEngineAssets).toHaveBeenCalledWith("Claude Code");
    // The store and a project offer no such action.
    fireEvent.click(screen.getByTestId("map-node-1"));
    expect(screen.queryByRole("button", { name: "Show its assets" })).toBeNull();
  });

  it("Open project is the same mini tier now, still wired", () => {
    const callbacks = renderPane(graph());
    fireEvent.click(screen.getByTestId("map-node-4"));
    const button = screen.getByRole("button", { name: "Open project" });
    expect(button.className).toContain("h-[26px]");
    expect(button.className).toContain("rounded-control");
    fireEvent.click(button);
    expect(callbacks.onOpenProject).toHaveBeenCalledWith("/u/k/w/metrics-board");
  });

  it("a node with a faulty edge into it carries the 2 flagged chip; its popover restates the edges the map draws", () => {
    const callbacks = renderPane(graph());
    fireEvent.click(screen.getByTestId("map-node-4"));
    const card = screen.getByTestId("map-placecard");
    const chip = within(card).getByRole("button", { name: "2 flagged" });
    // The chip sits on the head's own row beside the node name.
    expect(chip.closest("div")?.querySelector("h2")?.textContent).toBe("metrics-board");
    expect(chip.querySelector("i")?.className).toContain("bg-state-danger");
    fireEvent.click(chip);
    const pop = screen.getByRole("dialog", { name: "2 flagged" });
    expect(Array.from(pop.querySelectorAll("li")).map((li) => li.textContent)).toEqual([
      "1 tracked copy · drifted",
      "1 symlink · dangling",
    ]);
    // No second elevation inside the card.
    expect(pop.className).not.toContain("shadow-overlay");
    fireEvent.click(within(pop).getByRole("button", { name: "Needs review →" }));
    expect(callbacks.onReview).toHaveBeenCalledTimes(1);
  });

  it("a node with only linked edges, and the store, carry no chip", () => {
    renderPane(graph());
    fireEvent.click(screen.getByTestId("map-node-2"));
    expect(within(screen.getByTestId("map-placecard")).queryByRole("button", { name: /flagged/ })).toBeNull();
    fireEvent.click(screen.getByTestId("map-node-1"));
    expect(within(screen.getByTestId("map-placecard")).queryByRole("button", { name: /flagged/ })).toBeNull();
  });
});
