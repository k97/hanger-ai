// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import DesignSystemPane from "../components/DesignSystemPane";
import DesignSystemSidebar from "../components/DesignSystemSidebar";
import { DESIGN_SECTIONS } from "../data/designSystemFixtures";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => null),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

/** Every component the page promises to render, by the caption it wears.
 *  A component added to the app and not to this list is not on the page —
 *  that is the omission this pins, and the reason the list is explicit. */
const INVENTORY = [
  "SummaryStrip",
  "GelMeter",
  "MechanismGlyph",
  "EngineReachTiles",
  "EngineLabel · BrandIcon",
  "DisclosureBanner",
  "AssetHeaderRow · AssetRow",
  "AssetRow with annotation",
  "ScanStatusIndicator",
  "HangerMark",
  "CategoryFilterCards",
  "Tooltip",
];

describe("Design system — the system, rendered by the app that uses it", () => {
  beforeEach(() => cleanup());

  it("renders every section the sidebar lists, in order, under its anchor", () => {
    render(<DesignSystemPane section="colour" />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(DESIGN_SECTIONS.map((s) => s.label));
    for (const s of DESIGN_SECTIONS) {
      expect(document.getElementById(`ds-${s.id}`), `anchor ds-${s.id}`).toBeTruthy();
    }
  });

  it("renders the real component inventory, each captioned by name", () => {
    render(<DesignSystemPane section="components" />);
    for (const name of INVENTORY) {
      expect(screen.getByText(name), `${name} specimen`).toBeTruthy();
    }
  });

  it("marks fixture-fed specimens as sample, and says so in the foot", () => {
    render(<DesignSystemPane section="components" />);
    // A 142 on this page must never read as the store. The strip and the
    // GelMeter specimen share the split, so both meters carry the label;
    // every figure that holds one must be marked.
    const meters = screen.getAllByRole("img", { name: /105 linked, 6 drifted, 2 broken, 29 local only/ });
    expect(meters.length).toBeGreaterThan(0);
    for (const meter of meters) {
      const figure = meter.closest("figure")!;
      expect(within(figure).getByText("sample")).toBeTruthy();
    }
    expect(screen.getByText(/every figure on this page is sample data/)).toBeTruthy();
  });

  it("names tokens rather than values in source; values are read at runtime", () => {
    render(<DesignSystemPane section="colour" />);
    // The swatch labels are the CSS custom property names.
    for (const token of ["--page", "--plane", "--ink-1", "--fill", "--brand", "--gel-aqua", "--scrim"]) {
      expect(screen.getByText(token), token).toBeTruthy();
    }
  });

  it("interactive specimens interact: a category chip presses, a legend toggles", () => {
    render(<DesignSystemPane section="controls" />);
    const chips = screen.getByRole("tablist", { name: "Filter by category" });
    fireEvent.click(within(chips).getByRole("tab", { name: /^Skills/ }));
    expect(within(chips).getByRole("tab", { name: /^Skills/ }).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByText("drifted"));
    expect(screen.getByText("drifted").closest("button")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("the sidebar lists the same sections and reports a choice rather than owning it", () => {
    const onSelectSection = vi.fn();
    render(
      <DesignSystemSidebar
        width={216}
        setWidth={() => {}}
        collapsed={false}
        setCollapsed={() => {}}
        section="colour"
        onSelectSection={onSelectSection}
      />
    );
    const rows = screen.getAllByRole("button").map((r) => r.textContent);
    expect(rows).toEqual(DESIGN_SECTIONS.map((s) => s.label));
    fireEvent.click(screen.getByRole("button", { name: "Motion" }));
    expect(onSelectSection).toHaveBeenCalledWith("motion");
  });
});
