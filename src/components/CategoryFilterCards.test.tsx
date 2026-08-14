// @vitest-environment happy-dom
import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import CategoryFilterCards from "./CategoryFilterCards";

// This repo configures no global cleanup, so rendered DOM accumulates within a
// file and queries match across tests.
afterEach(cleanup);

const props = {
  selectedCategory: null,
  onSelectCategory: vi.fn(),
  loading: false,
  allCount: 12,
  skillsCount: 8,
  toolsCount: 4,
  rulesCount: 0,
  subagentsCount: 0,
};

describe("CategoryFilterCards", () => {
  it("hides categories with a known count of zero", () => {
    render(<CategoryFilterCards {...props} />);
    expect(screen.getByText("Skills")).toBeTruthy();
    expect(screen.getByText("MCP servers")).toBeTruthy();
    expect(screen.queryByText("Rules")).toBeNull();
    expect(screen.queryByText("Subagents")).toBeNull();
  });

  it("keeps every chip while counts are still loading", () => {
    // undefined means "not counted yet", not "empty". Hiding on undefined
    // would make chips pop in after every scan.
    render(
      <CategoryFilterCards
        {...props}
        loading
        allCount={undefined}
        skillsCount={undefined}
        toolsCount={undefined}
        rulesCount={undefined}
        subagentsCount={undefined}
      />
    );
    expect(screen.getByText("Rules")).toBeTruthy();
    expect(screen.getByText("Subagents")).toBeTruthy();
  });

  it("keeps the selected chip rendered even at zero", () => {
    // Otherwise selecting a category that later empties removes the only
    // control that can clear the filter, stranding the view.
    render(<CategoryFilterCards {...props} selectedCategory="Rules" />);
    expect(screen.getByText("Rules")).toBeTruthy();
  });

  it("always keeps All, so there is a way back to an unfiltered view", () => {
    render(
      <CategoryFilterCards
        {...props}
        allCount={0}
        skillsCount={0}
        toolsCount={0}
        rulesCount={0}
        subagentsCount={0}
      />
    );
    expect(screen.getByText("All")).toBeTruthy();
    expect(screen.queryByText("Skills")).toBeNull();
  });
});
