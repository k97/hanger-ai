// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LinkStateLegend } from "../components/SummaryStrip";
import type { StateCounts } from "../utils/linkStateCounts";

const counts: StateCounts = { linked: 9, drifted: 2, broken: 1, local: 109, total: 121 };

function renderLegend(active: "drifted" | null = null) {
  const onFilter = vi.fn();
  render(<LinkStateLegend counts={counts} active={active} onFilter={onFilter} />);
  return { onFilter };
}

describe("LinkStateLegend", () => {
  beforeEach(() => cleanup());

  it("legend buttons toggle their state filter", () => {
    const { onFilter } = renderLegend();
    fireEvent.click(screen.getByText("drifted"));
    expect(onFilter).toHaveBeenCalledWith("drifted");
  });

  it("clicking the active legend state clears the filter", () => {
    const { onFilter } = renderLegend("drifted");
    fireEvent.click(screen.getByText("drifted"));
    expect(onFilter).toHaveBeenCalledWith(null);
  });
});
