// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import ProfilePane from "./ProfilePane";
import { Inventory } from "../App";
import type { KeptSkill, KeptSkills } from "../types/skillSwitch";
import type { EngineContext } from "../types/engineContext";

/**
 * The "Switched off" group under Skills (docs/plans/2026-11-26-skill-switch.md,
 * Task 9): the skills Hanger is keeping, from `get_kept_skills`, each row
 * opening its panel. Shaped like the MCP servers' group, figure and all.
 */

afterEach(cleanup);

const FIGMA: KeptSkill = {
  key: "kept-skill:00000000-0000-4000-8000-000000000001",
  name: "figma",
  at_ms: 1795566217263,
  links_count: 2,
  interrupted: false,
  back_in_store: false,
};
const QUILL: KeptSkill = { ...FIGMA, key: "kept-skill:00000000-0000-4000-8000-000000000002", name: "quill", links_count: 0 };
const kept = (skills: KeptSkill[] = [FIGMA]): KeptSkills => ({ skills, count: skills.length });

const oneSkill: Inventory = {
  agents: [],
  skills: [
    {
      id: "skill-1",
      name: "atlas",
      description: "",
      version: "",
      path: "/home/user/.agents/skills/atlas",
      scope: { Global: { agent: "claude-code" } },
    } as never,
  ],
  tools: [],
  rules: [],
  subagents: [],
  project_scans: [],
};
const nothing: Inventory = { agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [] };
const counts = { total: 1, byCategory: { skill: { global: 1, project: 0 } } } as never;
const zeroCounts = { total: 0, byCategory: {} } as never;

const group = () => screen.queryByTestId("kept-skills-group");
const head = () => within(group()!).getByRole("heading");

function renderPane(over: Partial<Parameters<typeof ProfilePane>[0]> = {}) {
  return render(
    <ProfilePane
      inventory={oneSkill}
      assetCounts={counts}
      loading={false}
      scannedAt={new Date()}
      selectedCategory="Skills"
      keptSkills={kept()}
      onOpenKeptSkill={vi.fn()}
      onSelectAsset={vi.fn()}
      onLinkAsset={vi.fn()}
      {...over}
    />
  );
}

describe("ProfilePane — Switched off, under Skills", () => {
  it("heads the group with the backend's count, on Skills and on All", () => {
    renderPane();
    expect(head().getAttribute("aria-label")).toBe("Switched off · 1");
    cleanup();
    renderPane({ selectedCategory: undefined, keptSkills: kept([FIGMA, QUILL]) });
    expect(head().getAttribute("aria-label")).toBe("Switched off · 2");
  });

  it("leaves the Skills figure to get_asset_counts", () => {
    renderPane({ keptSkills: kept([FIGMA, QUILL]) });
    // The Skills head draws label, hairline and figure apart since Task 1 of
    // docs/plans/2026-11-26-global-list.md; the heading's name keeps the words.
    expect(screen.getByRole("heading", { name: /^Skills · / }).getAttribute("aria-label")).toBe("Skills · 1");
  });

  it("drops the figure when an engine is picked, as the MCP group does", () => {
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
    renderPane({ engines: [ctx], selectedEngine: "codex", engineContexts: [ctx] });
    expect(head().textContent).toBe("Switched off");
  });

  it("each row shows the skill's name and that it is off for every engine, and opens its panel by key", () => {
    const onOpenKeptSkill = vi.fn();
    renderPane({ keptSkills: kept([FIGMA, QUILL]), onOpenKeptSkill });
    const rows = within(group()!).getAllByTestId("list-row");
    expect(rows.map((r) => r.textContent)).toEqual(["figmaOff for every engine", "quillOff for every engine"]);
    fireEvent.click(rows[1]);
    expect(onOpenKeptSkill).toHaveBeenCalledWith(QUILL.key);
  });

  it("reads the row the inspector shows as selected", () => {
    renderPane({ keptSkills: kept([FIGMA, QUILL]), selectedKeptSkillKey: QUILL.key });
    const rows = within(group()!).getAllByTestId("list-row");
    expect(rows.map((r) => r.getAttribute("data-selected"))).toEqual(["false", "true"]);
  });

  it("is hidden under a link-state filter: a kept skill has no link state to match", () => {
    renderPane({ stateFilter: "broken" });
    expect(group()).toBeNull();
  });

  it("is not drawn on another kind's tab, nor with nothing kept", () => {
    renderPane({ selectedCategory: "Rules" });
    expect(group()).toBeNull();
    cleanup();
    renderPane({ keptSkills: { skills: [], count: 0 } });
    expect(group()).toBeNull();
    cleanup();
    renderPane({ keptSkills: null });
    expect(group()).toBeNull();
  });

  it("with only kept skills, Skills shows the group and not the empty state", () => {
    renderPane({ inventory: nothing, assetCounts: zeroCounts, detectedEngines: [{ id: "claude-code", name: "Engine K" }] });
    expect(head().getAttribute("aria-label")).toBe("Switched off · 1");
    expect(screen.queryByText(/^No skills/)).toBeNull();
  });

  it("with only kept skills, All shows the group and not the whole-store empty state", () => {
    renderPane({
      inventory: nothing,
      assetCounts: zeroCounts,
      selectedCategory: undefined,
      detectedEngines: [{ id: "claude-code", name: "Engine K" }],
    });
    expect(head().getAttribute("aria-label")).toBe("Switched off · 1");
    expect(screen.queryByText("Nothing in the global store yet")).toBeNull();
  });
});
