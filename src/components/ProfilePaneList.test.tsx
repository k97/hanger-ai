// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => undefined) }));

import ProfilePane from "./ProfilePane";
import type { Inventory } from "../App";

/**
 * Global's list after T3 Code (Task 1 of docs/plans/2026-11-26-global-list.md):
 * no table, two-line rows in a centred lane, quiet group heads, and the ticks
 * at T3's 24 × 2.
 *
 * happy-dom lays nothing out, so the lane's width and the ticks' margin are
 * class contracts here; the screenshots check the geometry.
 */

afterEach(cleanup);

const at = (kind: string, name: string) => `/home/user/.agents/${kind}/${name}`;

const inventory: Inventory = {
  agents: [],
  skills: [
    {
      id: "s1",
      name: "xlsx",
      description: "Read and write spreadsheets",
      version: "",
      path: at("skills", "xlsx"),
      scope: { Global: { agent: "claude-code" } },
    },
  ],
  tools: [
    {
      id: "t1",
      name: "cua",
      command: "npx",
      transport: "stdio",
      config_path: "/home/user/.claude.json",
      scope: { Global: { agent: "claude-code" } },
      owning_agent: "claude-code",
    },
  ],
  rules: [{ id: "r1", name: "house-style", path: at("rules", "house-style"), content: "", scope: { Global: { agent: "claude-code" } } }],
  subagents: [
    {
      id: "a1",
      name: "reviewer",
      description: "Reviews a diff before it lands",
      path: at("agents", "reviewer"),
      declared_tools: [],
      scope: { Global: { agent: "claude-code" } },
    },
  ],
  project_scans: [],
};

const counts = {
  total: 4,
  byCategory: {
    skill: { total: 1, global: 1, project: 0 },
    tool: { total: 1, global: 1, project: 0 },
    rule: { total: 1, global: 1, project: 0 },
    subagent: { total: 1, global: 1, project: 0 },
  },
};

const reach = [{ engine_id: 1, engine_key: "claude_code", engine_name: "Claude Code", reached: true }];
const annotations = [
  { asset_path: at("skills", "xlsx"), mechanism: "none" as const, reach, beyond: { kind: "projects", count: 3, places: [] } },
  { asset_path: at("rules", "house-style"), mechanism: "none" as const, reach, beyond: null },
  { asset_path: at("agents", "reviewer"), mechanism: "none" as const, reach, beyond: null },
];

function renderPane(over: Partial<Parameters<typeof ProfilePane>[0]> = {}) {
  const onSelectAsset = vi.fn();
  render(
    <ProfilePane
      inventory={inventory}
      annotations={annotations}
      assetCounts={counts}
      loading={false}
      scannedAt={new Date()}
      onSelectAsset={onSelectAsset}
      onLinkAsset={vi.fn()}
      {...over}
    />
  );
  return { onSelectAsset };
}

const rowNamed = (name: string) =>
  screen.getAllByTestId("list-row").find((r) => within(r).queryByTestId("list-row-name")?.textContent === name)!;

describe("Global's list", () => {
  it("has no column labels", () => {
    renderPane();
    for (const label of ["Name", "Kind", "Reach", "Registered in", "Tools", "Beyond the store"]) {
      expect(screen.queryByText(label, { exact: true }), label).toBeNull();
    }
  });

  it("draws every skill, server, rule and subagent as a two-line row", () => {
    renderPane();
    const names = screen.getAllByTestId("list-row").map((r) => within(r).getByTestId("list-row-name").textContent);
    expect(names).toEqual(["xlsx", "cua", "house-style", "reviewer"]);
  });

  it("carries a skill's and a subagent's description through to line 2", () => {
    renderPane();
    expect(within(rowNamed("xlsx")).getByTestId("list-row-detail").textContent).toBe("Read and write spreadsheets");
    expect(within(rowNamed("reviewer")).getByTestId("list-row-detail").textContent).toBe("Reviews a diff before it lands");
  });

  it("gives a rule with no description no detail, and Global only on the right (Review Focus 5)", () => {
    renderPane();
    const rule = rowNamed("house-style");
    expect(within(rule).queryByTestId("list-row-detail")).toBeNull();
    expect(within(rule).getByTestId("list-row-figure").textContent).toBe("Global only");
    expect(within(rowNamed("xlsx")).getByTestId("list-row-figure").textContent).toBe("In 3 projects");
  });

  it("gives a server its transport chip", () => {
    renderPane();
    expect(within(rowNamed("cua")).getByTestId("list-row-chip").textContent).toBe("stdio");
  });

  it("selects a row with Enter (Review Focus 4)", () => {
    const { onSelectAsset } = renderPane();
    fireEvent.keyDown(rowNamed("xlsx"), { key: "Enter" });
    expect(onSelectAsset).toHaveBeenCalledWith({ name: "xlsx", category: "Skills", path: at("skills", "xlsx") });
  });

  it("puts the list in a centred lane of at most 736px", () => {
    renderPane();
    const lane = screen.getByTestId("list-lane").className;
    expect(lane).toContain("mx-auto");
    expect(lane).toContain("max-w-[736px]");
    expect(lane).toContain("px-12");
  });

  it("narrows the lane's padding below 640px, and hides the ticks with it", () => {
    renderPane({ forceLane: "narrow" });
    const lane = screen.getByTestId("list-lane").className;
    expect(lane).toContain("px-3");
    expect(lane).not.toContain("px-12");
    expect(screen.queryByRole("navigation", { name: "Jump to a group" })).toBeNull();
  });

  it("heads each group quietly: label, hairline, then the figure", () => {
    renderPane();
    const head = document.getElementById("group-skills")!;
    expect(head.className).toContain("h-8");
    expect(head.className).toContain("text-small");
    expect(head.className).toContain("text-ink-3");
    expect(head.querySelector("[data-testid='group-head-rule']")?.className).toContain("h-px");
    expect(head.textContent).toBe("Skills1");
  });

  it("moves the View control into the first group head, and drops header-click sorting", () => {
    renderPane();
    const head = document.getElementById("group-skills")!;
    expect(within(head).getByRole("button", { name: "View" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Name" })).toBeNull();
    expect(screen.queryByTestId("sort-chevron-asc")).toBeNull();
  });

  it("draws the ticks at 24 × 2", () => {
    renderPane();
    const nav = screen.getByRole("navigation", { name: "Jump to a group" });
    const bars = nav.querySelectorAll("button > span");
    expect(bars.length).toBe(4);
    for (const bar of bars) {
      expect(bar.className).toContain("w-6");
      expect(bar.className).toContain("h-0.5");
    }
    expect(nav.className).toContain("left-3");
  });
});
