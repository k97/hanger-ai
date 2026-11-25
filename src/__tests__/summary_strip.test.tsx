// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import SummaryStrip from "../components/SummaryStrip";
import type { StateCounts } from "../utils/linkStateCounts";
import type { FindingLine } from "../components/FindingPopover";

const counts: StateCounts = { linked: 9, drifted: 2, broken: 1, local: 109, total: 121 };
const cleanCounts: StateCounts = { linked: 0, drifted: 0, broken: 0, local: 5, total: 5 };

/** Three issue lines, the shape a pane hands the pill in asset mode. */
const reviewLines: FindingLine[] = [
  { severity: "danger", text: "Target is gone", detail: "CLAUDE.md" },
  { severity: "warning", text: "Diverged from its source", detail: "math" },
  { severity: "warning", text: "Diverged from its source", detail: "prose" },
];

/** Engine mode's figures, as ProfilePane passes them for one engine. */
const ENGINE = {
  segments: [
    { key: "Tools", label: "MCP servers", value: "≈ 12,400", measured: true, caption: "2 of 3 servers measured · 1 off", pressed: false, onSelect: vi.fn() },
    { key: "Skills", label: "Skills", value: "Not measured", measured: false, pressed: false, onSelect: vi.fn() },
    { key: "Rules", label: "Rules", value: "Not measured", measured: false, pressed: false, onSelect: vi.fn() },
    { key: "Subagents", label: "Subagents", value: "Not measured", measured: false, pressed: false, onSelect: vi.fn() },
  ],
  measuring: false,
  onMeasure: vi.fn(),
  measureCaption: "Starts each server that's on and has no recent answer, and reads its tool list.",
};

function renderStrip(overrides: Partial<Parameters<typeof SummaryStrip>[0]> = {}) {
  const onFilterState = vi.fn();
  const utils = render(
    <SummaryStrip
      total={121}
      subtitle="assets in the global store · 2 engines"
      scannedAt={new Date(Date.now() - 4 * 60_000)}
      scanning={false}
      counts={counts}
      activeStateFilter={null}
      onFilterState={onFilterState}
      review={{ count: 3, lines: reviewLines }}
      {...overrides}
    />
  );
  return { onFilterState, ...utils };
}

describe("SummaryStrip", () => {
  beforeEach(() => cleanup());

  it("renders the total, subtitle and state bar, and keeps the age out of the banner", () => {
    renderStrip();
    expect(screen.getByText("121")).toBeTruthy();
    expect(screen.getByText("assets in the global store · 2 engines")).toBeTruthy();
    expect(
      screen.getByRole("img", { name: "9 linked, 2 drifted, 1 broken, 109 local only" })
    ).toBeTruthy();
    // The age moved to the foot line on 2026-08-29 (Karthik's ruling): the
    // banner should not carry a line whose only job is to grow older.
    expect(screen.queryByText("Scanned 4 min ago")).toBeNull();
  });

  it("the headline is one line whatever the width, clipped rather than wrapped", () => {
    renderStrip();
    const subtitle = screen.getByText("assets in the global store · 2 engines");
    // A class contract, not a measurement: happy-dom lays nothing out, so
    // no test here can see a second line (verification.md). `truncate` is
    // nowrap + overflow-hidden + ellipsis; `min-w-0` is what lets a flex
    // item shrink below its text at all, and without it the row still wraps.
    expect(subtitle.className).toContain("truncate");
    expect(subtitle.className).toContain("min-w-0");
    // Clipped text keeps its full reading on hover.
    expect(subtitle.getAttribute("title")).toBe("assets in the global store · 2 engines");
  });

  it("keeps both controls in the legend row, under the meter", () => {
    renderStrip({ onRescan: () => {} });
    // They were tried in the headline row on 2026-08-29 and sent back the
    // same day (Karthik), so this pins the position rather than assuming it.
    const headline = screen.getByText("121").parentElement!;
    expect(headline.contains(screen.getByLabelText("Refresh scan"))).toBe(false);
    const legendRow = screen.getByText("drifted").closest("div")!;
    expect(legendRow.contains(screen.getByLabelText("Refresh scan"))).toBe(true);
    expect(legendRow.contains(screen.getByText("Needs review 3"))).toBe(true);
    const meter = screen.getByRole("img");
    expect(
      meter.compareDocumentPosition(legendRow) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("shrinks both controls below the width the full headline needs", () => {
    renderStrip({ onRescan: () => {} });
    const btn = screen.getByLabelText("Refresh scan");
    const label = btn.querySelector("[data-rescan-label]");
    // Class contract — the container query is unobservable here. 640px is
    // where the legend, Rescan and the pill stop fitting on one row.
    expect(label?.className).toContain("hidden");
    expect(label?.className).toContain("@[640px]:inline");
    expect(btn.className).toContain("@[640px]:min-w-[108px]");
    // The pill drops "Needs" at the same threshold.
    const long = screen.getByText("Needs review 3");
    const short = screen.getByText("Review 3");
    expect(long.className).toContain("hidden");
    expect(long.className).toContain("@[640px]:inline");
    expect(short.className).toContain("@[640px]:hidden");
    // Both spellings sit in one button, so the accessible name is whichever
    // one is displayed. `happy-dom` applies no CSS and sees both, so the
    // name itself is not assertable here (verification.md) — only that the
    // pill is one control and neither span is a separate button.
    expect(long.closest("button")).toBe(short.closest("button"));
    // And the strip is the container those widths are measured against.
    expect(btn.closest("section")?.className).toContain("@container");
  });

  it("omits zero-count bar segments", () => {
    renderStrip({ counts: cleanCounts });
    const bar = screen.getByRole("img");
    expect(bar.children).toHaveLength(1);
  });

  it("shows the review pill only when the caller has lines for it", () => {
    renderStrip({ counts: cleanCounts, review: { count: 0, lines: [] } });
    expect(screen.queryByText(/Needs review \d/)).toBeNull();
    cleanup();
    renderStrip();
    expect(screen.getByText("Needs review 3")).toBeTruthy();
  });

  it("legend buttons toggle their state filter", () => {
    const { onFilterState } = renderStrip();
    fireEvent.click(screen.getByText("drifted"));
    expect(onFilterState).toHaveBeenCalledWith("drifted");
  });

  it("clicking the active legend state clears the filter", () => {
    const { onFilterState } = renderStrip({ activeStateFilter: "drifted" });
    fireEvent.click(screen.getByText("drifted"));
    expect(onFilterState).toHaveBeenCalledWith(null);
  });

  it("in asset mode the pill opens the popover and the preset is an action inside it", () => {
    const showInList = vi.fn();
    const { onFilterState } = renderStrip({
      review: {
        count: 3,
        lines: reviewLines,
        actions: (
          <button type="button" onClick={() => showInList("needs-review")}>
            Show in list
          </button>
        ),
      },
    });
    // The pill alone must not filter: that behaviour moved into the popover,
    // and a pill that still filtered would pass a test that only clicked it.
    fireEvent.click(screen.getByText("Needs review 3"));
    expect(onFilterState).not.toHaveBeenCalled();
    expect(screen.getByTestId("finding-popover")).toBeTruthy();
    fireEvent.click(screen.getByText("Show in list"));
    expect(showInList).toHaveBeenCalledWith("needs-review");
  });

  it("says a scan is running exactly once, in the button", () => {
    const scannedAt = new Date(Date.now() - 4 * 60_000);
    renderStrip({ scanning: true, scannedAt, onRescan: () => {} });

    // The button carries the live state…
    expect(screen.getByLabelText("Refresh scan").textContent).toContain("Scanning");
    // …and its tooltip keeps answering the other question: how old is the
    // figure. It is the only place the age is left in the banner, and it
    // stays an age rather than restating that a scan is running.
    expect(screen.getByLabelText("Refresh scan").getAttribute("title")).toBe("Scanned 4 min ago");
    // One banner, one statement that a scan is running.
    expect(screen.getAllByText(/Scanning/)).toHaveLength(1);
    // v5 mark: RotateCcwIcon turns while the rescan it names is running.
    const btn = screen.getByLabelText("Refresh scan");
    expect(btn.querySelector('path[d="M3 3v5h5"]')).toBeTruthy();
    expect(btn.querySelector("g.aim-spin-ccw.aim-loop")).toBeTruthy();
  });

  it("keeps the Rescan tooltip an age, never a status", () => {
    renderStrip({
      scanning: false,
      scannedAt: new Date(Date.now() - 4 * 60_000),
      onRescan: () => {},
    });
    expect(screen.getByLabelText("Refresh scan").getAttribute("title")).toBe("Scanned 4 min ago");
    expect(screen.queryByText("Scanning…")).toBeNull();
    // v5 mark: idle render carries the same glyph, not mid-loop.
    const btn = screen.getByLabelText("Refresh scan");
    expect(btn.querySelector('path[d="M3 3v5h5"]')).toBeTruthy();
    expect(btn.querySelector("g.aim-loop")).toBeNull();
  });

  it("in engine mode: no meter, no legend; one MCP segment, a quiet line for the rest, Measure all, Rescan and the pill", () => {
    // The MCP mode this replaced drew one caption in the legend's place
    // (docs/plans/2026-11-25-ia-global-by-engine.md). Q1 of
    // docs/plans/2026-11-25-decisions-round-2.md shortened it: one segment
    // for the kind with a figure, one quiet line for the kinds without.
    renderStrip({
      total: "≈ 12,400",
      subtitle: "tokens every session · Claude Code",
      onRescan: vi.fn(),
      engine: ENGINE,
      review: {
        count: 2,
        lines: [
          { severity: "warning", text: "Running with no config behind it." },
          { severity: "warning", text: "Running with no config behind it." },
        ],
      },
    });
    expect(document.querySelector(".text-display")?.textContent).toBe("≈ 12,400");
    expect(screen.getByText("tokens every session · Claude Code")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();                     // no GelMeter
    expect(screen.getByTestId("strip-segments").textContent).toBe(
      "MCP servers ≈ 12,400 · 2 of 3 servers measured · 1 off"
    );
    expect(
      screen.getByRole("button", { name: "MCP servers ≈ 12,400 · 2 of 3 servers measured · 1 off" })
    ).toBeTruthy();
    expect(screen.getByTestId("strip-unmeasured").textContent).toBe("Skills · Rules · Subagents: Not measured");
    expect(screen.getByRole("button", { name: "Measure all" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh scan" })).toBeTruthy();
    expect(screen.getByText("Needs review 2")).toBeTruthy();
    expect(screen.queryByText("local only")).toBeNull();
  });

  it("Measure all's caption is its tooltip and description, never a visible line", () => {
    renderStrip({ onRescan: vi.fn(), engine: ENGINE });
    const measure = screen.getByRole("button", { name: "Measure all" });
    expect(measure.getAttribute("title")).toBe(ENGINE.measureCaption);
    const describedBy = measure.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const description = document.getElementById(describedBy!);
    expect(description?.textContent).toBe(ENGINE.measureCaption);
    // happy-dom applies no CSS, so "not visible" is pinned as the `hidden`
    // attribute: every node carrying the caption sits inside one.
    for (const el of screen.getAllByText(ENGINE.measureCaption)) expect(el.closest("[hidden]")).not.toBeNull();
  });

  it("Rescan and the pill share Measure all's row", () => {
    renderStrip({ onRescan: vi.fn(), engine: ENGINE, review: { count: 1, lines: reviewLines.slice(0, 1) } });
    const row = screen.getByRole("button", { name: "Measure all" }).closest("[data-testid='strip-actions']");
    expect(row).not.toBeNull();
    expect(row!.contains(screen.getByRole("button", { name: "Refresh scan" }))).toBe(true);
    expect(row!.contains(screen.getByText("Needs review 1"))).toBe(true);
  });

  it("each kind in the quiet line is a button that opens its tab", () => {
    const onRules = vi.fn();
    renderStrip({
      engine: {
        ...ENGINE,
        segments: ENGINE.segments.map((s) => (s.key === "Rules" ? { ...s, pressed: true, onSelect: onRules } : s)),
      },
    });
    const line = screen.getByTestId("strip-unmeasured");
    const kinds = Array.from(line.querySelectorAll("button"));
    expect(kinds.map((b) => b.textContent)).toEqual(["Skills", "Rules", "Subagents"]);
    expect(kinds.map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]);
    fireEvent.click(kinds[1]);
    expect(onRules).toHaveBeenCalledTimes(1);
  });

  it("a kind with a figure gets its own segment, and leaves the quiet line", () => {
    renderStrip({
      engine: {
        ...ENGINE,
        segments: ENGINE.segments.map((s) =>
          s.key === "Skills" ? { ...s, value: "≈ 800", measured: true } : s
        ),
      },
    });
    expect(screen.getByTestId("strip-segments").textContent).toBe(
      "MCP servers ≈ 12,400 · 2 of 3 servers measured · 1 offSkills ≈ 800"
    );
    expect(screen.getByTestId("strip-unmeasured").textContent).toBe("Rules · Subagents: Not measured");
  });

  it("draws no quiet line when every kind has a figure", () => {
    renderStrip({ engine: { ...ENGINE, segments: ENGINE.segments.slice(0, 1) } });
    expect(screen.queryByTestId("strip-unmeasured")).toBeNull();
  });

  it("the pill opens the finding popover with the caller's lines and actions", () => {
    const onShow = vi.fn();
    renderStrip({
      engine: ENGINE,
      review: {
        count: 1,
        lines: [{ severity: "danger", text: "context7: 2 different launch specs" }],
        actions: <button type="button" onClick={onShow}>Show disagreeing servers</button>,
      },
    });
    expect(screen.queryByTestId("finding-popover")).toBeNull();
    fireEvent.click(screen.getByText("Needs review 1"));
    expect(screen.getByTestId("finding-popover")).toBeTruthy();
    expect(screen.getByText("context7: 2 different launch specs")).toBeTruthy();
    fireEvent.click(screen.getByText("Show disagreeing servers"));
    expect(onShow).toHaveBeenCalledTimes(1);
  });

  it("no pill at zero, in either mode", () => {
    renderStrip({ engine: ENGINE, review: { count: 0, lines: [] } });
    expect(screen.queryByText(/Needs review \d/)).toBeNull();
    cleanup();
    renderStrip({ review: { count: 0, lines: [] } });
    expect(screen.queryByText(/Needs review \d/)).toBeNull();
  });

  it("renders its children as the band, inside the section", () => {
    renderStrip({ engine: ENGINE, children: <div data-testid="band">band</div> });
    const section = screen.getByRole("region", { name: "Inventory summary" });
    expect(section.contains(screen.getByTestId("band"))).toBe(true);
  });
});
