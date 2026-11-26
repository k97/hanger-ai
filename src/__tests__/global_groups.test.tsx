// @vitest-environment happy-dom
/**
 * Task 3 of docs/plans/2026-11-26-global-list.md: every group on Global draws
 * its rows through ListRow, under quiet heads, and none of those heads is
 * sticky (Review Focus 3: scrolled past MCP servers into Subagents, no stale
 * "MCP servers" head sits over the Subagent rows). "Not loaded by" and
 * "Switched off" fold on shadcn's Collapsible; the View control and the
 * cap's ⋮ menu are shadcn's DropdownMenu; the group heads' hairline is
 * shadcn's Separator.
 *
 * Class contracts and DOM structure only: `happy-dom` lays nothing out, so
 * whether a head actually sticks while scrolling, and where a tick's jump
 * lands, are screenshot claims (Step 6).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within, act } from "@testing-library/react";
import ProfilePane from "../components/ProfilePane";
import ViewControl from "../components/ViewControl";
import OverflowMenu from "../components/OverflowMenu";
import { keptOffOf } from "./keptOffFixtures";
import type { Inventory } from "../App";
import type { KeptOffServer } from "../types/engineContext";
import type { KeptSkills } from "../types/skillSwitch";
import type { EngineContext } from "../types/engineContext";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const asset = (id: string, name: string, kind: string, description = "") =>
  ({
    id,
    name,
    description,
    version: "",
    path: `/home/user/.agents/${kind}/${name}`,
    scope: { Global: { agent: "claude-code" } },
  }) as never;

const inventory: Inventory = {
  agents: [],
  skills: [asset("skill-1", "atlas", "skills")],
  tools: [
    {
      id: "/home/user/.claude.json:lint",
      name: "lint",
      command: "npx",
      transport: "stdio",
      config_path: "/home/user/.claude.json",
      scope: { Global: { agent: "claude-code" } },
      owning_agent: "claude-code",
    } as never,
  ],
  rules: [asset("rule-1", "house-style", "rules")],
  subagents: [{ ...(asset("sub-1", "reviewer", "agents") as object), declared_tools: [] } as never],
  project_scans: [],
};
const counts = {
  total: 4,
  byCategory: {
    skill: { global: 1, project: 0 },
    tool: { global: 1, project: 0 },
    rule: { global: 1, project: 0 },
    subagent: { global: 1, project: 0 },
  },
} as never;

const KEPT_SKILLS: KeptSkills = {
  count: 1,
  skills: [
    {
      key: "kept-skill:00000000-0000-4000-8000-000000000001",
      name: "figma",
      at_ms: 1795566217263,
      links_count: 0,
      interrupted: false,
      back_in_store: false,
    },
  ],
};
const BETA: KeptOffServer = {
  key: "stash:00000000-0000-4000-8000-000000000001",
  name: "beta",
  engine_id: "claude-code",
  engine_name: "Engine K",
  transport: "stdio",
  at_ms: 1795566217263,
  also_declared: false,
};
const PROBLEM = {
  kind: "Unreadable" as const,
  path: "/home/user/.codex/config.toml",
  detail: "permission denied",
  line: null,
  engine: "Codex",
};

function renderPane(over: Partial<Parameters<typeof ProfilePane>[0]> = {}) {
  return render(
    <ProfilePane
      inventory={inventory}
      assetCounts={counts}
      loading={false}
      scannedAt={new Date()}
      keptSkills={KEPT_SKILLS}
      onOpenKeptSkill={vi.fn()}
      keptOff={keptOffOf([BETA])}
      onOpenKeptOff={vi.fn()}
      mcpCoverage={{ checked_file_count: 1, checked_engine_count: 1, checked_files: [], problems: [PROBLEM] }}
      onSelectAsset={vi.fn()}
      onLinkAsset={vi.fn()}
      {...over}
    />
  );
}

const list = () => screen.getByTestId("asset-list-scroll");
/** A row drawn by ListRow, whatever test id its caller gave it. */
const isListRow = (el: Element) =>
  el.hasAttribute("data-kind") && el.querySelector("[data-testid='list-row-name']") !== null;

describe("Global's groups draw their rows through ListRow", () => {
  it("a kept skill's row is a ListRow, its line the detail", () => {
    renderPane();
    const group = screen.getByTestId("kept-skills-group");
    const rows = within(group).getAllByTestId("list-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute("data-kind")).toBe("skill");
    expect(within(rows[0]).getByTestId("list-row-name").textContent).toBe("figma");
    expect(within(rows[0]).getByTestId("list-row-detail").textContent).toBe("Off for every engine");
  });

  it("a kept server's row is a ListRow, with its transport chip and its line the detail", () => {
    renderPane();
    const group = screen.getByTestId("kept-tools-group");
    const rows = within(group).getAllByTestId("list-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute("data-kind")).toBe("server");
    expect(within(rows[0]).getByTestId("list-row-chip").textContent).toBe("stdio");
    expect(within(rows[0]).getByTestId("list-row-detail").textContent).toBe("Off for Engine K");
  });

  it("a config problem's row is a ListRow, its sentence the detail, and selects nothing", () => {
    renderPane();
    const row = screen.getByTestId("mcp-config-problem-row");
    expect(isListRow(row)).toBe(true);
    expect(within(row).getByTestId("list-row-detail").textContent).toBe(
      "/home/user/.codex/config.toml — couldn't be read (permission denied)"
    );
    // No asset behind it: not a stop in the tab order.
    expect(row.hasAttribute("tabindex")).toBe(false);
    expect(row.className).not.toContain("border-t");
  });

  it("a Not loaded row is a ListRow, its reason the detail", () => {
    const ctx: EngineContext = {
      engine_id: "codex",
      engine_key: "codex",
      engine_name: "Codex",
      applies: null,
      switches_by_name: false,
      items: [],
      on_count: 0,
      off_count: 0,
      measured_on_count: 0,
      on_tokens_measured: 0,
    };
    const annotations = [
      {
        asset_path: "/home/user/.agents/skills/atlas",
        mechanism: "none",
        reach: [{ engine_id: 2, engine_key: "codex", engine_name: "Codex", reached: false, reason: "not_linked" }],
        beyond: null,
      },
    ] as never;
    renderPane({ selectedCategory: "Skills", engines: [ctx], selectedEngine: "codex", engineContexts: [ctx], annotations });
    const group = screen.getByTestId("not-loaded-group");
    fireEvent.click(within(group).getByRole("button", { name: /^Not loaded by Codex/ }));
    const row = within(group).getByTestId("not-loaded-row");
    expect(isListRow(row)).toBe(true);
    expect(row.getAttribute("data-kind")).toBe("skill");
    expect(within(row).getByTestId("list-row-detail").textContent).toBe("Not linked");
  });
});

describe("Global's group heads (Review Focus 3)", () => {
  it("no group head on Global is sticky, and nothing in the list is", () => {
    renderPane();
    const stuck = [list(), ...Array.from(list().querySelectorAll("*"))].filter((el) =>
      /(^|\s)sticky(\s|$)/.test(el.getAttribute("class") ?? "")
    );
    expect(stuck.map((el) => el.getAttribute("data-testid") ?? el.tagName)).toEqual([]);
    expect(screen.getByTestId("section-header-tools").className).not.toContain("sticky");
  });

  it("carries no scroll margin for a sticky head that is gone", () => {
    renderPane();
    const margined = Array.from(list().querySelectorAll("*")).filter((el) =>
      /(^|\s)scroll-mt-(8|11)(\s|$)/.test(el.getAttribute("class") ?? "")
    );
    expect(margined.map((el) => el.id || el.tagName)).toEqual([]);
  });

  it("each tick scrolls its group's own head to the top", () => {
    renderPane();
    const spy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function () {});
    const ticks = within(screen.getByRole("navigation", { name: "Jump to a group" })).getAllByRole("button");
    expect(ticks.map((t) => t.getAttribute("aria-label"))).toEqual([
      "Skills · 1",
      "Switched off · 1",
      "MCP servers · 1",
      "Switched off · 1",
      "Rules · 1",
      "Subagents · 1",
    ]);
    for (const tick of ticks) {
      spy.mockClear();
      fireEvent.click(tick);
      expect(spy).toHaveBeenCalledTimes(1);
      const target = spy.mock.instances[0] as unknown as Element;
      expect(spy.mock.calls[0][0]).toEqual({ block: "start" });
      // The element jumped to is the head itself, holding the heading its
      // tick is named for, not a spacer standing in for a stuck header.
      const heading = target.tagName === "H3" ? target : target.querySelector("h3");
      expect(heading, tick.getAttribute("aria-label")!).toBeTruthy();
      expect(heading!.getAttribute("aria-label")).toBe(tick.getAttribute("aria-label"));
    }
  });

  it("a group head's hairline is shadcn's Separator, in --line", () => {
    renderPane();
    const rules = screen.getAllByTestId("group-head-rule");
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule.getAttribute("data-slot")).toBe("separator");
      expect(rule.className).toContain("bg-line");
    }
  });
});

describe("Not loaded and Switched off fold on shadcn's Collapsible", () => {
  it("Switched off, for skills and for servers, is open, with T3's shelf head: label, hairline, figure, chevron", () => {
    renderPane();
    for (const id of ["kept-skills-group", "kept-tools-group"]) {
      const group = screen.getByTestId(id);
      expect(group.getAttribute("data-slot"), id).toBe("collapsible");
      const trigger = group.querySelector("[data-slot='collapsible-trigger']")!;
      expect(trigger, id).toBeTruthy();
      expect(trigger.getAttribute("aria-expanded"), id).toBe("true");
      expect(trigger.textContent, id).toBe("Switched off1");
      expect(within(trigger as HTMLElement).getByTestId("group-head-rule")).toBeTruthy();
      expect(trigger.querySelector("svg"), id).toBeTruthy();
      fireEvent.click(trigger);
      expect(trigger.getAttribute("aria-expanded"), id).toBe("false");
      expect(within(group).queryAllByTestId("list-row"), id).toEqual([]);
    }
  });

  it("Not loaded is folded until asked", () => {
    const ctx: EngineContext = {
      engine_id: "codex",
      engine_key: "codex",
      engine_name: "Codex",
      applies: null,
      switches_by_name: false,
      items: [],
      on_count: 0,
      off_count: 0,
      measured_on_count: 0,
      on_tokens_measured: 0,
    };
    const annotations = [
      {
        asset_path: "/home/user/.agents/skills/atlas",
        mechanism: "none",
        reach: [{ engine_id: 2, engine_key: "codex", engine_name: "Codex", reached: false, reason: "not_linked" }],
        beyond: null,
      },
    ] as never;
    renderPane({ selectedCategory: "Skills", engines: [ctx], selectedEngine: "codex", engineContexts: [ctx], annotations });
    const group = screen.getByTestId("not-loaded-group");
    expect(group.getAttribute("data-slot")).toBe("collapsible");
    const trigger = group.querySelector("[data-slot='collapsible-trigger']")!;
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(within(group).queryAllByTestId("not-loaded-row")).toEqual([]);
  });
});

describe("the menus are shadcn's DropdownMenu", () => {
  it("ViewControl's panel, items and divider come from ui/dropdown-menu, highlighting in --tint", async () => {
    render(<ViewControl grouping="server" sort="attention" onGroupingChange={vi.fn()} onSortChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    await act(async () => {});
    const panel = screen.getByTestId("view-control-panel");
    expect(panel.getAttribute("data-slot")).toBe("dropdown-menu-content");
    const items = within(panel).getAllByRole("menuitemradio");
    expect(items).toHaveLength(4);
    for (const item of items) {
      expect(item.getAttribute("data-slot")).toBe("dropdown-menu-radio-item");
      expect(item.className).toContain("data-highlighted:bg-tint");
      expect(item.className).not.toMatch(/(^|\s)(hover:|focus:|data-highlighted:)?bg-accent/);
    }
    expect(panel.querySelector("[data-slot='dropdown-menu-separator']")).toBeTruthy();
  });

  it("OverflowMenu's panel is ui/dropdown-menu's content", async () => {
    render(
      <OverflowMenu
        trigger={(p) => <button type="button" aria-label="More" {...p} />}
        ariaLabel="Actions"
        align="right"
      >
        {() => <span>Item</span>}
      </OverflowMenu>
    );
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    await act(async () => {});
    expect(screen.getByRole("menu", { name: "Actions" }).getAttribute("data-slot")).toBe("dropdown-menu-content");
  });
});
