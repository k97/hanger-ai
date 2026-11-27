// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import RepoPane from "./RepoPane";
import type { Inventory, CategoryCounts } from "../App";

/**
 * A repository's list draws as Global's does (Task 4 of
 * docs/plans/2026-11-26-global-list.md; round 18 q4): a centred lane with
 * tick marks, two-line ListRows under quiet group heads, and no column
 * labels. Line 2 keeps the repository's own words: the Engine column's word
 * on the left and the State column's on the right, moved, not rewritten.
 * Since Task 6 of docs/plans/2026-11-27-repo-view-parity.md the summary
 * strip is gone: the overview card is the repository's summary too, drawn
 * only into a cap slot, as on Global.
 */

afterEach(() => cleanup());

const ROOT = "/home/user/project";
const proj = (agent: string) => ({ Project: { agent, root: ROOT } });

const inventory: Inventory = {
  agents: [],
  skills: [
    {
      id: "s1",
      name: "linked-skill",
      description: "A linked skill",
      version: "1",
      path: `${ROOT}/.claude/skills/linked-skill`,
      scope: proj("Claude Code"),
      is_symlink: true,
      source_path: "/home/user/.claude/skills/linked-skill",
    },
    {
      id: "s2",
      name: "local-skill",
      description: "A local skill",
      version: "1",
      path: `${ROOT}/.claude/skills/local-skill`,
      scope: proj("unknown"),
    },
    {
      id: "s3",
      name: "broken-skill",
      description: "",
      version: "1",
      path: `${ROOT}/.claude/skills/broken-skill`,
      scope: proj("Codex"),
      parse_status: "failed",
      parse_error: "bad frontmatter",
    },
  ],
  tools: [
    {
      id: `${ROOT}/.mcp.json:alpha`,
      name: "alpha",
      command: "npx",
      transport: "stdio",
      config_path: `${ROOT}/.mcp.json`,
      scope: proj("Claude Code"),
      owning_agent: "Claude Code",
    },
  ],
  rules: [
    {
      id: "r1",
      name: "AGENTS.md",
      path: `${ROOT}/AGENTS.md`,
      content: "",
      scope: proj("Codex"),
      drifted: true,
    },
  ],
  subagents: [
    {
      id: "a1",
      name: "reviewer",
      description: "Reviews diffs",
      path: `${ROOT}/.claude/agents/reviewer.md`,
      declared_tools: [],
      scope: proj("Claude Code"),
    },
  ],
  project_scans: [],
};

const counts: CategoryCounts = {
  total: 6,
  byCategory: {
    skill: { total: 3, global: 0, project: 3 },
    tool: { total: 1, global: 0, project: 1 },
    rule: { total: 1, global: 0, project: 1 },
    subagent: { total: 1, global: 0, project: 1 },
  },
};

function renderPane(over: Partial<ComponentProps<typeof RepoPane>> = {}) {
  const onSelectAsset = vi.fn();
  const { container } = render(
    <RepoPane
      repoPath={ROOT}
      inventory={inventory}
      assetCounts={counts}
      loading={false}
      scannedAt={new Date()}
      onRefresh={vi.fn()}
      onSelectAsset={onSelectAsset}
      onLinkFromProfile={vi.fn()}
      {...over}
    />
  );
  return { onSelectAsset, container };
}

/** A cap slot for the overview card's button, as App's content cap gives. */
const slot = () => {
  const cap = document.createElement("span");
  document.body.appendChild(cap);
  return { overviewSlots: { cap } };
};

const rowNamed = (name: string) =>
  screen.getAllByTestId("list-row").find((r) => within(r).getByTestId("list-row-name").textContent === name)!;

describe("a repository's list", () => {
  it("has no column labels", () => {
    renderPane();
    for (const label of ["Name", "Kind", "Engine", "State", "Registered in", "Tools"]) {
      expect(screen.queryByText(label), label).toBeNull();
    }
    expect(screen.queryByRole("button", { name: "Name" })).toBeNull();
  });

  it("draws every row as a ListRow, of its own kind", () => {
    renderPane();
    const kinds = screen.getAllByTestId("list-row").map((r) => r.getAttribute("data-kind"));
    expect(kinds).toEqual(["skill", "skill", "skill", "server", "rule", "subagent"]);
  });

  it("keeps the Engine word as line 2's detail and the State word as its figure", () => {
    renderPane();
    const line2 = (name: string) => {
      const row = rowNamed(name);
      return [within(row).queryByTestId("list-row-detail")?.textContent, within(row).queryByTestId("list-row-figure")?.textContent];
    };
    expect(line2("linked-skill")).toEqual(["Claude Code", "Symlinked"]);
    expect(line2("local-skill")).toEqual(["Any agent", "Local only"]);
    expect(line2("broken-skill")).toEqual(["Codex", "Won't parse"]);
    expect(line2("alpha")).toEqual(["Claude Code", "Local only"]);
    expect(line2("AGENTS.md")).toEqual(["Codex", "Drifted · review"]);
    expect(line2("reviewer")).toEqual(["Claude Code", "Local only"]);
  });

  it("colours the State word as its column did: danger for broken, warning for drifted", () => {
    renderPane();
    expect(within(rowNamed("broken-skill")).getByTestId("list-row-figure").className).toContain("text-state-danger");
    expect(within(rowNamed("AGENTS.md")).getByTestId("list-row-figure").className).toContain("text-state-warning");
    expect(within(rowNamed("local-skill")).getByTestId("list-row-figure").className).toContain("text-ink-3");
  });

  it("mutes a file that won't parse", () => {
    renderPane();
    expect(within(rowNamed("broken-skill")).getByTestId("list-row-name").className).toContain("text-ink-3");
  });

  it("gives a server its transport chip", () => {
    renderPane();
    expect(within(rowNamed("alpha")).getByTestId("list-row-chip").textContent).toBe("stdio");
  });

  // Moved from AssetRow.test.tsx (F4, 2026-11-25): a remote server's chip
  // shows its domain, never the full address, which the inspector shows.
  it("shows a remote server's domain in its chip, never the path", () => {
    const transport = "https://hmc-zohomail-12345678901.zohomcp.in/mcp/0123456789abcdef0123456789abcdef/message";
    renderPane({ inventory: { ...inventory, tools: [{ ...inventory.tools[0], transport }] } });
    const row = rowNamed("alpha");
    expect(within(row).getByTestId("list-row-chip").textContent).toBe("zohomcp.in");
    expect(row.textContent).not.toContain("0123456789abcdef0123456789abcdef");
  });

  it("selects a row by click and by Enter", () => {
    const { onSelectAsset } = renderPane();
    fireEvent.click(rowNamed("AGENTS.md"));
    expect(onSelectAsset).toHaveBeenLastCalledWith({ name: "AGENTS.md", category: "Rules", path: `${ROOT}/AGENTS.md` });
    fireEvent.keyDown(rowNamed("alpha"), { key: "Enter" });
    expect(onSelectAsset).toHaveBeenLastCalledWith({
      id: `${ROOT}/.mcp.json:alpha`,
      name: "alpha",
      category: "Tools",
      path: `${ROOT}/.mcp.json`,
    });
  });

  it("marks the selected row", () => {
    renderPane({ selectedAsset: { path: `${ROOT}/AGENTS.md` } });
    expect(rowNamed("AGENTS.md").getAttribute("data-selected")).toBe("true");
    expect(rowNamed("local-skill").getAttribute("data-selected")).toBe("false");
  });

  it("heads each group quietly, in the backend's figure", () => {
    renderPane();
    for (const name of ["Skills · 3", "MCP servers · 1", "Rules · 1", "Subagents · 1"]) {
      expect(screen.getByRole("heading", { level: 3, name })).toBeTruthy();
    }
    const head = document.getElementById("group-skills")!;
    expect(head.className).toContain("h-8");
    expect(head.className).toContain("text-ink-3");
    expect(head.querySelector("[data-testid='group-head-rule']")).toBeTruthy();
    expect(head.className).not.toContain("sticky");
  });

  it("sits in a centred lane of at most 736px, flat on the page", () => {
    renderPane();
    const lane = screen.getByTestId("list-lane").className;
    expect(lane).toContain("mx-auto");
    expect(lane).toContain("max-w-[736px]");
    expect(lane).toContain("px-12");
    const list = screen.getByTestId("asset-list-scroll").className;
    expect(list).not.toContain("border");
  });

  it("draws the tick marks while the lane is wide, one per group", () => {
    renderPane();
    const nav = screen.getByRole("navigation", { name: "Jump to a group" });
    expect(within(nav).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Skills · 3",
      "MCP servers · 1",
      "Rules · 1",
      "Subagents · 1",
    ]);
  });

  it("uses static list semantics and stable repository group items", () => {
    renderPane();
    const content = screen.getByRole("list");
    const children = Array.from(content.children);
    const spacers = children.filter((child) => child.hasAttribute("data-message-scroller-spacer"));
    const items = children.filter((child) => !child.hasAttribute("data-message-scroller-spacer"));

    expect(content.getAttribute("aria-live")).toBe("off");
    expect(spacers).toHaveLength(1);
    expect(spacers[0]?.getAttribute("aria-hidden")).toBe("true");
    expect(spacers[0]?.hasAttribute("hidden")).toBe(true);
    expect(items.map((item) => item.getAttribute("data-message-id"))).toEqual([
      "group-skills",
      "group-tools",
      "group-rules",
      "group-subagents",
    ]);
    expect(items.every((item) => item.getAttribute("role") === "listitem")).toBe(true);
    expect(content.querySelector('[data-scroll-anchor="true"]')).toBeNull();
    expect(screen.getByTestId("asset-list-scroll").getAttribute("aria-label")).toBe("project");
  });

  it("narrows the lane's padding and drops the ticks below 640px", () => {
    renderPane({ forceLane: "narrow" });
    const lane = screen.getByTestId("list-lane").className;
    expect(lane).toContain("px-3");
    expect(lane).not.toContain("px-12");
    expect(screen.queryByRole("navigation", { name: "Jump to a group" })).toBeNull();
  });

  it("puts the kind tabs in the list's lane, so they share the rows' left edge", () => {
    renderPane();
    const box = screen.getByRole("tablist").closest('[class*="max-w-[736px]"]');
    expect(box).not.toBeNull();
    expect(box!.className).toContain("px-12");
  });
  it("narrows the tabs' lane with the list's", () => {
    renderPane({ forceLane: "narrow" });
    expect(screen.getByRole("tablist").closest('[class*="max-w-[736px]"]')!.className).toContain("px-3");
  });
  it("is its own positioned box, so a docked card anchors to the pane and not to the window", () => {
    const { container } = renderPane();
    expect((container.firstElementChild as HTMLElement).className.split(/\s+/)).toContain("relative");
  });

  it("draws the overview card docked, headed by the repository, with no summary strip", () => {
    renderPane({ ...slot(), forceDock: true });
    const dock = screen.getByTestId("overview-dock");
    expect(within(dock).getByText("project")).toBeTruthy();
    expect(document.querySelector('section[aria-label="Inventory summary"]')).toBeNull();
  });

  it("keeps the macOS access panel inside the lane box when the card docks", () => {
    const blocked: Inventory = {
      ...inventory,
      project_scans: [
        { path: ROOT, layered: false, rule_chains: {}, parse_warnings: [`macOS blocked access to ${ROOT}`] },
      ] as unknown as Inventory["project_scans"],
    };
    renderPane({ ...slot(), forceDock: true, inventory: blocked });
    const panel = screen.getByText("macOS Folder Scan Access Denied");
    expect(panel.closest('[class~="mr-[306px]"]')).not.toBeNull();
  });
});
