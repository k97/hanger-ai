// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import SummaryStrip from "../components/SummaryStrip";
import type { StateCounts } from "../utils/linkStateCounts";

const counts: StateCounts = { linked: 9, drifted: 2, broken: 1, local: 109, total: 121 };
const cleanCounts: StateCounts = { linked: 0, drifted: 0, broken: 0, local: 5, total: 5 };

function renderStrip(overrides: Partial<Parameters<typeof SummaryStrip>[0]> = {}) {
  const onFilterState = vi.fn();
  const utils = render(
    <SummaryStrip
      total={121}
      subtitle="assets in your user profile · 2 engines"
      scannedAt={new Date(Date.now() - 4 * 60_000)}
      scanning={false}
      counts={counts}
      activeStateFilter={null}
      onFilterState={onFilterState}
      {...overrides}
    />
  );
  return { onFilterState, ...utils };
}

describe("SummaryStrip", () => {
  beforeEach(() => cleanup());

  it("renders the total, subtitle, scan stamp and state bar", () => {
    renderStrip();
    expect(screen.getByText("121")).toBeTruthy();
    expect(screen.getByText("assets in your user profile · 2 engines")).toBeTruthy();
    expect(screen.getByText("Scanned 4 min ago")).toBeTruthy();
    expect(
      screen.getByRole("img", { name: "9 linked, 2 drifted, 1 broken, 109 local only" })
    ).toBeTruthy();
  });

  it("omits zero-count bar segments", () => {
    renderStrip({ counts: cleanCounts });
    const bar = screen.getByRole("img");
    expect(bar.children).toHaveLength(1);
  });

  it("shows the review pill only when something needs review", () => {
    renderStrip({ counts: cleanCounts });
    expect(screen.queryByText(/Review \d/)).toBeNull();
    cleanup();
    renderStrip();
    expect(screen.getByText("Review 3 →")).toBeTruthy();
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

  it("the review pill applies the needs-review preset", () => {
    const { onFilterState } = renderStrip();
    fireEvent.click(screen.getByText("Review 3 →"));
    expect(onFilterState).toHaveBeenCalledWith("needs-review");
  });

  it("says a scan is running exactly once, in the button", () => {
    const scannedAt = new Date(Date.now() - 4 * 60_000);
    renderStrip({ scanning: true, scannedAt, onRescan: () => {} });

    // The button carries the live state…
    expect(screen.getByLabelText("Refresh scan").textContent).toContain("Scanning");
    // …and the stamp keeps answering its own question: how old is the figure.
    expect(screen.getByText("Scanned 4 min ago")).toBeTruthy();
    // One banner, one statement that a scan is running.
    expect(screen.getAllByText(/Scanning/)).toHaveLength(1);
  });

  it("keeps the stamp an age, never a status", () => {
    renderStrip({ scanning: false, scannedAt: new Date(Date.now() - 4 * 60_000) });
    expect(screen.getByText("Scanned 4 min ago")).toBeTruthy();
    expect(screen.queryByText("Scanning…")).toBeNull();
  });
});
