// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import ProfilePane from "./ProfilePane";
import { Inventory } from "../App";
import type { KeptSkills } from "../types/skillSwitch";
import type { EngineContext } from "../types/engineContext";

/**
 * ProfilePane's side of the group ticks (Task 2 of
 * docs/plans/2026-11-26-overview-card.md): it passes only the groups it
 * draws, each tick named in its header's own words, and each header carries
 * the id its tick jumps to.
 */

afterEach(cleanup);

const asset = (id: string, name: string, kind: string) =>
  ({
    id,
    name,
    description: "",
    version: "",
    path: `/home/user/.agents/${kind}/${name}`,
    scope: { Global: { agent: "claude-code" } },
  }) as never;

const inventory: Inventory = {
  agents: [],
  skills: [asset("skill-1", "atlas", "skills")],
  tools: [],
  rules: [asset("rule-1", "house-style", "rules")],
  subagents: [],
  project_scans: [],
};
const counts = {
  total: 2,
  byCategory: { skill: { global: 7, project: 0 }, rule: { global: 4, project: 0 } },
} as never;
const kept: KeptSkills = {
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

function renderPane(over: Partial<Parameters<typeof ProfilePane>[0]> = {}) {
  return render(
    <ProfilePane
      inventory={inventory}
      assetCounts={counts}
      loading={false}
      scannedAt={new Date()}
      keptSkills={kept}
      onOpenKeptSkill={vi.fn()}
      onSelectAsset={vi.fn()}
      onLinkAsset={vi.fn()}
      {...over}
    />
  );
}

const ticks = () => screen.queryByRole("navigation", { name: "Jump to a group" });

describe("ProfilePane — group ticks", () => {
  it("names one tick per group drawn, in the header's own words, and each jumps to that header", () => {
    renderPane();
    const names = within(ticks()!)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["Skills · 7", "Switched off · 1", "Rules · 4"]);
    for (const [id, text] of [
      ["group-skills", "Skills · 7"],
      ["group-kept-skills", "Switched off · 1"],
      ["group-rules", "Rules · 4"],
    ]) {
      // The id is on the group head, which holds the heading (and, for the
      // first, the View control) since Task 1 of
      // docs/plans/2026-11-26-global-list.md; a folding group's id is on its
      // heading (Task 3).
      const header = document.getElementById(id);
      const heading = header?.tagName === "H3" ? header : header?.querySelector("h3");
      expect(heading, id).toBeTruthy();
      expect(heading!.getAttribute("aria-label") ?? heading!.textContent, id).toBe(text);
    }
  });

  it("uses static list semantics and stable group items", () => {
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
      "group-kept-skills",
      "group-rules",
    ]);
    expect(items.every((item) => item.getAttribute("role") === "listitem")).toBe(true);
    expect(content.querySelector('[data-scroll-anchor="true"]')).toBeNull();
    expect(screen.getByRole("region", { name: "Global" })).toBeTruthy();
  });

  it("gives the Agents-only section a stable item without adding it to the rail", () => {
    renderPane({
      inventory: {
        ...inventory,
        agents: [
          {
            id: "claude-code",
            name: "Claude Code",
            global_config_path: "/home/user/.claude",
            project_footprints: [],
          },
        ],
      },
      selectedCategory: "Agents",
    });
    const item = screen.getByRole("list").querySelector('[data-message-id="group-agents"]');

    expect(item?.getAttribute("role")).toBe("listitem");
    expect(item?.querySelector("h3")?.textContent).toBe("Agents · 1");
    expect(ticks()).toBeNull();
  });

  // The two scroll-margin cases that stood here went with the sticky MCP
  // servers head (Task 3 of docs/plans/2026-11-26-global-list.md): no head
  // is stuck, so none needs a margin to clear one. global_groups.test.tsx
  // pins that no group head carries one, and that each tick scrolls its own
  // head into view.

  it("draws no ticks with one group on screen", () => {
    renderPane({ selectedCategory: "Rules" });
    expect(ticks()).toBeNull();
  });

  it("drops the figures with an engine picked, as the headers do", () => {
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
    // The backend's verdict that Codex reaches both assets, so their groups draw.
    const annotations = ["skills/atlas", "rules/house-style"].map((p) => ({
      asset_path: `/home/user/.agents/${p}`,
      mechanism: "none",
      reach: [{ engine_id: 2, engine_key: "codex", engine_name: "Codex", reached: true, reason: null }],
      beyond: null,
    })) as never;
    renderPane({ engines: [ctx], selectedEngine: "codex", engineContexts: [ctx], annotations });
    const names = within(ticks()!)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["Skills", "Switched off", "Rules"]);
  });
});
