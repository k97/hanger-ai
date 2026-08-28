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
  "SegmentedTrack",
  "UnderlineTabs",
  "ViewControl",
  "OverflowMenu",
  "InfoPopover",
  "Mini button",
  "FindingChip",
  "FindingPopover",
  "InspectorCap",
  "ListCard · ListCardRow",
  "ReachCard",
  "OriginValue",
  "ScanStamp",
  "HeroBand",
  "SearchPalette",
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
    // The TOC is layered: one eyebrow per group, in reading order, each
    // directly above its own rows — Typography and Iconography under Styles.
    const list = screen.getByTestId("design-sidebar");
    const texts = Array.from(list.querySelectorAll("[data-testid='design-toc-group'], [role='button']")).map(
      (el) => el.textContent
    );
    expect(texts).toEqual([
      "Foundations", "Colour", "Geometry", "Motion",
      "Styles", "Typography", "Iconography",
      "Components", "Controls", "Composites",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Motion" }));
    expect(onSelectSection).toHaveBeenCalledWith("motion");
  });
});

/* Typography and Iconography — Karthik's ask, 2026-08-28: the Type section
 * takes its full name and covers the font families; the icon system (§4 of
 * DESIGN.md) gets a section of its own, between Motion and Controls where
 * §4 sits between §3 and §5. */
describe("Design system — Typography and Iconography", () => {
  beforeEach(() => cleanup());

  /* Grouped, Karthik's ruling 2026-08-28 after the atomic-design read:
   * Material's three words. Tokens read from the theme are Foundations;
   * fonts and marks — the first things you can see — are Styles; what is
   * built from them is Components, and the section that used to carry the
   * group's own name is Composites so the group does not name one member. */
  it("the sections read Typography and Iconography, grouped Foundations · Styles · Components", () => {
    const labels = DESIGN_SECTIONS.map((s) => s.label);
    expect(labels).toEqual(["Colour", "Geometry", "Motion", "Typography", "Iconography", "Controls", "Composites"]);
    expect(DESIGN_SECTIONS.map((s) => s.group)).toEqual([
      "Foundations", "Foundations", "Foundations", "Styles", "Styles", "Components", "Components",
    ]);
    render(<DesignSystemPane section="colour" />);
    expect(screen.getByRole("heading", { level: 2, name: "Typography" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Iconography" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2, name: "Type" })).toBeNull();
    expect(document.getElementById("ds-iconography")).toBeTruthy();
  });

  it("Typography names the three font stacks and says the two sans stacks are one", () => {
    render(<DesignSystemPane section="type" />);
    const section = document.getElementById("ds-type")!;
    for (const token of ["--font-sans", "--font-flex", "--font-mono"]) {
      expect(within(section).getByText(token), token).toBeTruthy();
    }
    // tokens.css:65-66 declare --font-flex with the same stack as --font-sans;
    // the page states it rather than implying a second face exists.
    expect(within(section).getByText(/same stack/i)).toBeTruthy();
    // The scale rows carry the role §2's table gives each size.
    expect(within(section).getByText("display")).toBeTruthy();
    expect(within(section).getByText("body")).toBeTruthy();
  });

  it("Iconography rosters the marks by export name, shows the stroke per size band, and the brand sprite", () => {
    render(<DesignSystemPane section="iconography" />);
    const section = document.getElementById("ds-iconography")!;
    // Rendered from the module, so a mark added to icons.tsx appears here
    // without anyone listing it: one Heroicons mark, one lucide static mark,
    // one animated mark, the hand-drawn one.
    for (const name of ["FolderIcon", "GitMergeIcon", "GitPullRequestClosedIcon", "RevealInFileManagerIcon"]) {
      expect(within(section).getByText(name), name).toBeTruthy();
    }
    // strokeFor (icons.tsx) is one continuous rule; the ladder's six bands
    // (12/13/14/16/20/24) render four distinct values, 2, 1.85, 1.71 and
    // 1.5 — 1.5 repeats across three bands (16, 20, 24). A bare stroke
    // value cannot fail here: the size label sits beside it in the same
    // string ("12 · 2"), so a query for "2" with exact:false matches the
    // "12" alone regardless of what the stroke renders. Assert the whole
    // label instead. getAllByText, not getByText, because "16 · 1.5"
    // repeats at 20 and 24.
    for (const label of ["12 · 2", "13 · 1.85", "14 · 1.71", "16 · 1.5"]) {
      expect(within(section).getAllByText(label).length, label).toBeGreaterThan(0);
    }
    // Every BrandId draws from the sprite; Codex carries its dark twin.
    expect(section.querySelector('use[href="#brand-devin"]')).toBeTruthy();
    expect(section.querySelector('use[href="#brand-codex-dark"]')).toBeTruthy();
  });
});
