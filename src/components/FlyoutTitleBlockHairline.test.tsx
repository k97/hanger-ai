// @vitest-environment happy-dom
//
// Decision 13 (docs/superpowers/plans/2026-08-23-v4-phase-2b-inspector-header.md)
// gives the inspector's title block `px-[18px] pt-2 pb-4` and drops its
// hairline outright, reasoning "the tab row's own bottom border is the only
// line above the body." A prior task checked that reasoning against the
// code and found it holds for only one of the four views sharing this
// wrapper (the condition at `Flyout.tsx`'s header block, `linking ||
// targetAsset || selectedBubble || showEmptyMcpEyebrow`):
//   - targetAsset, non-Agents — AssetDetail/McpServerDetail both render
//     `UnderlineTabs` beneath this wrapper (confirmed below: `documentKindFor`
//     returns "none" only for Agents, and UnderlineTabs appears nowhere else
//     in src/components/ except AssetDetail.tsx and McpServerDetail.tsx).
//   - linking's common path (LinkPanel, not the DiffChooser overlay) — no
//     tab row, no top border of its own.
//   - selectedBubble's asset list — no tab row.
//   - showEmptyMcpEyebrow, both sub-cases (McpEngineSummary and "Nothing
//     selected") — no tab row.
// Karthik's ruling, 2026-08-24: the hairline goes only where a tab row
// follows — it honours Decision 13's stated *reason* (something else already
// draws a line) rather than its literal instruction (drop it always), and
// stays wherever nothing else supplies one.
//
// Honest limitation: `happy-dom` lays nothing out, so neither test below can
// observe the visual outcome (a header with or without a line under it) —
// each pins the className that produces it. That is a class-contract guard,
// not proof of the rendered pixel; the running build's screenshot is what
// actually verifies the visual claim (`verifying-ui.md`).
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import Flyout from "./Flyout";
import { Inventory } from "../App";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockImplementation(() => Promise.resolve(null)),
}));

afterEach(cleanup);

const inventoryWithSkill: Inventory = {
  agents: [],
  skills: [
    {
      id: "skill-1",
      name: "writing-great-skills",
      path: "/Users/test/.agents/skills/writing-great-skills/SKILL.md",
      scope: "Global",
      drifted: false,
    } as never,
  ],
  tools: [],
  rules: [],
  subagents: [],
  project_scans: [],
};

const emptyInventory: Inventory = {
  agents: [],
  skills: [],
  tools: [],
  rules: [],
  subagents: [],
  project_scans: [],
};

describe("Flyout title block — the hairline follows the tab row, not the wrapper", () => {
  it("a selected asset with tabs: new padding, and no hairline of its own", () => {
    render(
      <Flyout
        selectedBubble={null}
        selectedAsset={{
          name: "writing-great-skills",
          category: "Skills",
          path: "/Users/test/.agents/skills/writing-great-skills/SKILL.md",
        }}
        inventory={inventoryWithSkill}
        linkedProjects={[]}
        onRefresh={() => {}}
      />
    );

    // A tab row does follow here — AssetDetail renders UnderlineTabs for
    // every category but Agents, so its own bottom border is the line.
    expect(screen.getByRole("tab", { name: "Content" })).toBeTruthy();

    const header = screen.getByTestId("inspector-header");
    expect(header.className).toContain("px-[18px]");
    expect(header.className).toContain("pt-2");
    expect(header.className).toContain("pb-4");
    expect(header.className).not.toContain("border-b");
    expect(header.className).not.toContain("border-line");
  });

  it("a tabless view (the empty MCP eyebrow): same padding, keeps its own hairline", () => {
    render(
      <Flyout
        activeCategory="Tools"
        paneScope="Global"
        inventory={emptyInventory}
        linkedProjects={[]}
        onRefresh={() => {}}
      />
    );

    // No tab row follows this wrapper — the empty-MCP body renders no
    // UnderlineTabs, so nothing else draws a line beneath the header.
    expect(screen.queryByRole("tab")).toBeNull();

    const header = screen.getByTestId("inspector-header");
    expect(header.className).toContain("px-[18px]");
    expect(header.className).toContain("pt-2");
    expect(header.className).toContain("pb-4");
    expect(header.className).toContain("border-b");
    expect(header.className).toContain("border-line");
  });
});
