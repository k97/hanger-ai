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
  it("the rail's marks are 16 × their optical factor, none a lingering 17", () => {
    const { container } = render(
      React.createElement(IconRail, {
        active: "machine",
        needsReviewCount: 0,
        onSelectMachine: () => {},
        onSelectLinkMap: () => {},
        onSelectDiscovery: () => {},
        onSelectReview: () => {},
        onOpenSearch: () => {},
        onOpenSettings: () => {},
      })
    );
    // HangerMark (the brand mark, width 22) is not a sized() box — excluded
    // by width, per the brief.
    const widths = Array.from(container.querySelectorAll("nav svg"))
      .map((s) => Number(s.getAttribute("width")))
      .filter((w) => w !== 22);
    expect(widths.length).toBeGreaterThan(3);
    for (const w of widths) {
      expect(w).toBeGreaterThanOrEqual(16);
      expect(w).toBeLessThanOrEqual(16 * 1.2 + 0.01);
      expect(w).not.toBeCloseTo(17, 1);
    }
  });

  it("Sidebar's folder mark is a plain 16px box", () => {
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
        linkedRepos: ["/repo/one"],
        loadLinkedRepos: async () => {},
        setError: () => {},
      })
    );
    const row = screen.getByText("one").closest('[tabindex="0"]');
    expect(row).toBeTruthy();
    const svg = row!.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("16");
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
  });
});
