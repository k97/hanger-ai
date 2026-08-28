// @vitest-environment happy-dom
// Class-contract guard only: happy-dom lays nothing out, so this pins
// className membership, never geometry (verification.md).
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AssetHeaderRow from "../components/AssetHeaderRow";

describe("pane list type roles", () => {
  it("column headers are sentence-case caption-size medium in --ink-3", () => {
    render(
      <AssetHeaderRow
        sortField="name"
        sortDirection="asc"
        onSort={vi.fn()}
      />
    );
    // "Name" renders inside a <span> — the button wrapping it carries the
    // role classes, so assert on that ancestor, not the leaf text node.
    const nameButton = screen.getByText("Name").closest("button") as HTMLElement;
    expect(nameButton.className).toContain("text-small");
    expect(nameButton.className).toContain("font-medium");
    expect(nameButton.className).not.toContain("uppercase");
    expect(nameButton.className).not.toContain("tracking-[.06em]");
  });

  it("the static Reach-column labels carry the same role, not the sort labels' classes", () => {
    render(
      <AssetHeaderRow
        sortField="name"
        sortDirection="asc"
        showReachColumns
        onSort={vi.fn()}
      />
    );
    const reach = screen.getByText("Reach");
    expect(reach.className).toContain("text-small");
    expect(reach.className).toContain("font-medium");
    expect(reach.className).not.toContain("uppercase");
    expect(reach.className).not.toContain("tracking-[.06em]");
  });
});
