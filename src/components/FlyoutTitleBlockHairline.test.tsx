// @vitest-environment happy-dom
//
// Decision 13 (docs/superpowers/plans/2026-08-23-v4-phase-2b-inspector-header.md)
// gave the inspector's title block `px-[18px] pt-2 pb-4` and dropped its
// hairline outright, reasoning "the tab row's own bottom border is the only
// line above the body."
//
// The padding half of that decision is superseded (Karthik, 2026-08-28: the
// spacing between the cap, the title and the tabs "feels inconsistent", and
// is to be set by a rule rather than eyeballed). It read `py-2` for a day;
// since later on 2026-08-28 it reads `pt-[18px] pb-1.5`: the inspector
// opens 18px under the sheet's rule like every other screen, and the 6
// below plus the tab row's own `py-2` puts the title 14 above the tabs —
// the rhythm every pane uses under its opener ("make it consistent"). The
// eyebrow-to-title step is a `gap-1` on the column rather than a
// conditional `mt-1` on the title row; `UnderlineTabs.test.tsx`'s "sits
// symmetrically in its band" pins the tab row's 8. The hairline half of
// Decision 13 stands exactly as ruled below. A prior task checked that reasoning against the
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
//   - showEmptyMcpEyebrow — "Nothing selected" in every pane now that
//     McpEngineSummary is retired (Task 8, 2026-08-28) — no tab row.
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
    expect(header.className).toContain("pt-[18px]");
    expect(header.className).toContain("pb-1.5");
    expect(header.className).not.toContain("py-2");
    expect(header.className).not.toContain("pb-4");
    expect(header.className).not.toContain("border-b");
    expect(header.className).not.toContain("border-line");
  });

  // The step between the eyebrow and the title is the column's own `gap-1`,
  // not a margin the title row carries conditionally: with the eyebrow gone
  // for a plain asset selection there is no rule to switch off, because the
  // gap only exists where two children do.
  it("spaces the eyebrow from the title with the column's gap, not a margin on the title", () => {
    render(
      <Flyout
        selectedBubble={{ type: "project", id: "/home/user/project", name: "project" }}
        inventory={emptyInventory}
        linkedProjects={[]}
        onRefresh={() => {}}
      />
    );

    const header = screen.getByTestId("inspector-header");
    expect(header.className).toContain("flex");
    expect(header.className).toContain("flex-col");
    expect(header.className).toContain("gap-1");

    const titleRow = screen.getByRole("heading", { level: 2 }).parentElement!;
    expect(titleRow.className).not.toContain("mt-1");
  });

  // R2: the eyebrow (the scope line) moves below the title, restyled into
  // the caption role — no caps, no tracking, no font-flex. The column's own
  // `gap-1` supplies the step, so the eyebrow carries no margin of its own.
  it("the scope line sits below the title in caption ink, not above it in caps", () => {
    render(
      <Flyout
        selectedBubble={{ type: "agent", id: "claude-code", name: "Claude Code" }}
        inventory={emptyInventory}
        linkedProjects={[]}
        onRefresh={() => {}}
      />
    );

    const header = screen.getByTestId("inspector-header");
    const title = header.querySelector("h2")!;
    const scope = screen.getByText(/scope$/);
    expect(
      title.compareDocumentPosition(scope) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(scope.className).toContain("text-small");
    expect(scope.className).toContain("text-ink-3");
    expect(scope.className).not.toContain("uppercase");
  });
  /* Removed 2026-08-30: "a tabless view (the empty MCP eyebrow)" pinned the
     padding of a header that only the empty-MCP eyebrow could mount. Karthik
     reversed that eyebrow the same day, so nothing selected now mounts no
     header at all and there is nothing left to measure. The eyebrow's own
     contract moved to FlyoutEmptyHeader.test.tsx. */
});
