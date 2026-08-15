// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import DiscoverySidebar from "../components/DiscoverySidebar";
import { DIRECTORIES } from "../data/directories";
import { kindCounts } from "../utils/directoryFacets";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => null),
}));

function renderSidebar(overrides: Partial<Parameters<typeof DiscoverySidebar>[0]> = {}) {
  const onSelectKind = vi.fn();
  render(
    <DiscoverySidebar
      width={216}
      setWidth={() => {}}
      collapsed={false}
      setCollapsed={() => {}}
      kind="All"
      onSelectKind={onSelectKind}
      {...overrides}
    />
  );
  return { onSelectKind };
}

describe("DiscoverySidebar — the catalogue's facets as a source list", () => {
  beforeEach(() => cleanup());

  it("renders one row per facet with the tallies kindCounts hands it", () => {
    renderSidebar();
    for (const facet of kindCounts(DIRECTORIES)) {
      const row = screen.getByRole("button", {
        name: new RegExp(`^${facet.kind} ${facet.count}$`),
      });
      expect(row, `${facet.kind} row`).toBeTruthy();
    }
  });

  it("marks the selected facet and only it", () => {
    renderSidebar({ kind: "Rules" });
    const current = screen.getAllByRole("button").filter(
      (el) => el.getAttribute("aria-current") === "true"
    );
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain("Rules");
  });

  it("reports a facet choice rather than owning it", () => {
    const { onSelectKind } = renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: /^Rules/ }));
    expect(onSelectKind).toHaveBeenCalledWith("Rules");
  });

  it("collapsed, it renders nothing at all", () => {
    renderSidebar({ collapsed: true });
    expect(screen.queryByTestId("discovery-sidebar")).toBeNull();
  });
});
