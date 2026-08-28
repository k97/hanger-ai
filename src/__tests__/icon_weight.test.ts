// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import React, { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { strokeFor } from "../components/icons";
import IconRail from "../components/IconRail";
import Sidebar from "../components/Sidebar";
import InspectorCap from "../components/InspectorCap";
import type { CategoryCounts } from "../App";
import type { AssetFindings } from "../utils/reviewIssues";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => null),
}));

// Karthik's ruling I1, 2026-08-28: a mark's stroke lands at 1.0px on
// screen (Codex measures exactly 2 device px at 2×) and is never thinner
// than the family's native 1.5. Attribute arithmetic only — the screen
// weight itself is proven by the frames in docs/evidence.
describe("strokeFor", () => {
  it.each([
    [12, 2],
    [13, 1.85],
    [14, 1.71],
    [15, 1.6],
    [16, 1.5],
  ])("box %i → stroke %f (1.0px on screen)", (box, stroke) => {
    expect(strokeFor(box)).toBe(stroke);
    expect((strokeFor(box) * box) / 24).toBeCloseTo(1.0, 1);
  });

  it.each([17, 18, 20, 24, 36])("box %i keeps the native 1.5 floor", (box) => {
    expect(strokeFor(box)).toBe(1.5);
  });
});

// Karthik's ruling I2, 2026-08-28: one box per surface — 16 in the shell
// (rail, sidebar rows, the cap's ellipsis and its panel toggles), 14 for
// row marks and cap actions, 12-13 for chevrons/inline. Class/attribute
// contract only — happy-dom lays out nothing, so these read `width`
// attributes, never geometry.
describe("shell marks are 16px boxes (I2)", () => {
  it("every rail mark pins its own width — 16 × its optical factor", () => {
    // Attribute contract, per mark, not a band: a band wide enough to hold
    // every factor (1 to 1.2) also holds a reverted 17px box for any mark
    // whose factor exceeds 16/17 ≈ 0.94 — ComputerDesktop, GlobeAlt,
    // ExclamationTriangle and Cog6Tooth (1.12/1.09/1.04/1.12) all render
    // inside [16, 19.2] at size 17 too. Pinning each mark's exact width by
    // its button's aria-label means a revert of any one mark fails its own
    // row, not a shared range every factor happens to fit.
    render(
      React.createElement(IconRail, {
        active: "machine",
        needsReviewCount: 0,
        onSelectMachine: () => {},
        onSelectLinkMap: () => {},
        onSelectDiscovery: () => {},
        onSelectReview: () => {},
        onOpenSearch: () => {},
        onSelectDesign: () => {},
        onOpenSettings: () => {},
      })
    );
    const expected: [string, string][] = [
      ["My machine", "17.92"], // ComputerDesktopIcon, factor 1.12
      ["Link map", "16"], // FolderSymlinkIcon, factor 1
      ["Discovery", "17.44"], // GlobeAltIcon, factor 1.09
      ["Needs review — 0 flagged", "16.64"], // ExclamationTriangleIcon, factor 1.04
      ["Search", "16"], // MagnifyingGlassIcon, factor 1
      ["Design system", "16"], // SwatchIcon, factor 1
      ["Settings", "17.92"], // Cog6ToothIcon, factor 1.12
    ];
    for (const [label, width] of expected) {
      const svg = screen.getByLabelText(label).querySelector("svg");
      expect(svg?.getAttribute("width"), label).toBe(width);
    }
  });

  it("Sidebar's folder mark is a plain 16px box, the Global globe is 16 × its 1.09 factor, and a watched repo's tree mark is a plain 16px box", () => {
    const assetCounts: CategoryCounts = {
      total: 3,
      byCategory: {
        skill: { total: 3, global: 3, project: 0 },
        tool: { total: 0, global: 0, project: 0 },
        rule: { total: 0, global: 0, project: 0 },
        subagent: { total: 0, global: 0, project: 0 },
      },
      engines: {},
    };
    render(
      React.createElement(Sidebar, {
        width: 260,
        setWidth: () => {},
        collapsed: false,
        setCollapsed: () => {},
        selectedItem: "profile",
        setSelectedItem: () => {},
        inventory: null,
        assetCounts,
        detectedEngines: [],
        // "/repo/two" holds "/repo/two/child", so it renders as a container
        // (FolderTreeIcon) while "/repo/one" stays a plain, childless row
        // (FolderIcon) — both a 16px box at factor 1, same width by
        // coincidence, but different marks and different render branches.
        linkedRepos: ["/repo/one", "/repo/two", "/repo/two/child"],
        loadLinkedRepos: async () => {},
        setError: () => {},
        onOpenSearch: () => {},
      })
    );
    const row = screen.getByText("one").closest('[tabindex="0"]');
    expect(row).toBeTruthy();
    const svg = row!.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("16");

    // GlobeAltIcon, factor 1.09: 16 * 1.09 = 17.44.
    const globalRow = screen.getByText("Global").closest('[tabindex="0"]');
    expect(globalRow).toBeTruthy();
    const globe = globalRow!.querySelector("svg");
    expect(globe?.getAttribute("width")).toBe("17.44");

    // FolderTreeIcon, factor 1, on the container row for the watched folder.
    const containerRow = screen.getByText("two").closest('[tabindex="0"]');
    expect(containerRow).toBeTruthy();
    const tree = containerRow!.querySelector("svg");
    expect(tree?.getAttribute("width")).toBe("16");
  });

  it("InspectorCap's panel toggle is a plain 16px box", () => {
    const host = createRef<HTMLDivElement>();
    const findings: AssetFindings = { issues: [], count: 0, severity: "warning" };
    render(
      React.createElement(
        "div",
        { ref: host },
        React.createElement(InspectorCap, {
          asset: { category: "Skills" },
          place: "Global",
          findings,
          inspectorExpanded: false,
          clampTo: host,
          onLink: () => {},
          onOpenInEditor: () => {},
          onCopyPath: () => {},
          onReveal: () => {},
          onReview: () => {},
          onToggleExpanded: () => {},
          onToggleInspector: () => {},
        })
      )
    );
    const button = screen.getByLabelText("Toggle inspector");
    const svg = button.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("16");

    // EllipsisVerticalIcon, factor 1.2: 16 * 1.2 = 19.2.
    const moreActions = screen.getByLabelText("More actions");
    const ellipsis = moreActions.querySelector("svg");
    expect(ellipsis?.getAttribute("width")).toBe("19.2");

    // ExpandIcon (inspectorExpanded: false above), factor 1: a plain 16px box.
    const expandButton = screen.getByLabelText("Expand inspector");
    const expand = expandButton.querySelector("svg");
    expect(expand?.getAttribute("width")).toBe("16");
  });

  // App.tsx's three panel toggles (left rail, right rail, MCP details) have
  // no render fixture in this file, so their box is not pinned here.
});
