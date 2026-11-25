// @vitest-environment happy-dom
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
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

  it("keeps the MCP servers chip at zero, because zero servers is a finding no other category can make", () => {
    // Spec §6.2's Tools exemption: an engine installed with no server
    // configured has no tool surface, and that reading is actionable in a
    // way "Rules 0" or "Subagents 0" is not. Every other count here is
    // non-zero so only the Tools exemption is under test.
    render(<CategoryFilterCards {...props} toolsCount={0} />);
    const chip = screen.getByText("MCP servers").closest("button");
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain("0");
  });

  it("still hides Skills, Rules and Subagents at zero once Tools is exempt", () => {
    // Pins the other side of the exemption: it is Tools-specific, not a
    // general reversal of hide-at-zero.
    render(
      <CategoryFilterCards
        {...props}
        toolsCount={0}
        skillsCount={0}
        rulesCount={0}
        subagentsCount={0}
      />
    );
    expect(screen.getByText("MCP servers")).toBeTruthy();
    expect(screen.queryByText("Skills")).toBeNull();
    expect(screen.queryByText("Rules")).toBeNull();
    expect(screen.queryByText("Subagents")).toBeNull();
  });

  it("keeps the MCP servers chip while its count is still loading, same as any other chip", () => {
    // undefined ("not counted yet") is a separate rule from the zero
    // exemption above -- pinned here so the two don't collapse into one.
    render(<CategoryFilterCards {...props} loading toolsCount={undefined} />);
    expect(screen.getByText("MCP servers")).toBeTruthy();
  });

  // Global's Engines tab (T1 of docs/plans/2026-11-25-ia-engines-into-global.md;
  // second after All by Karthik's ruling, 2026-11-25).
  it("has no Engines tab unless one is given, as on a repository", () => {
    render(<CategoryFilterCards {...props} />);
    expect(screen.queryByRole("tab", { name: "Engines" })).toBeNull();
  });

  it("puts the Engines tab straight after All, with no figure, even while counts load", () => {
    render(
      <CategoryFilterCards
        {...props}
        loading
        rulesCount={undefined}
        enginesTab={{ selected: false, onSelect: vi.fn() }}
      />
    );
    const labels = screen.getAllByRole("tab").map((t) => t.textContent?.replace(/\d+$/, ""));
    expect(labels).toEqual(["All", "Engines", "Skills", "MCP servers", "Rules"]);
    const engines = screen.getByRole("tab", { name: "Engines" });
    expect(engines.textContent).toBe("Engines");
    expect(engines.querySelector("svg")).toBeNull();
  });

  it("selecting Engines asks its own handler and leaves the category alone; while selected, All is not", () => {
    const onSelect = vi.fn();
    const onSelectCategory = vi.fn();
    const { rerender } = render(
      <CategoryFilterCards {...props} onSelectCategory={onSelectCategory} enginesTab={{ selected: false, onSelect }} />
    );
    fireEvent.click(screen.getByRole("tab", { name: "Engines" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelectCategory).not.toHaveBeenCalled();

    rerender(
      <CategoryFilterCards {...props} onSelectCategory={onSelectCategory} enginesTab={{ selected: true, onSelect }} />
    );
    expect(screen.getByRole("tab", { name: "Engines" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: /^All/ }).getAttribute("aria-selected")).toBe("false");
    fireEvent.click(screen.getByRole("tab", { name: /^All/ }));
    expect(onSelectCategory).toHaveBeenCalledWith(null);
  });

  // Class contract only: happy-dom applies no container queries. With the
  // inspector open the six tabs ran past the track's edge and cut
  // "Subagents 302" off (F1, 2026-11-25). The track still scrolls as its
  // last resort; before that, its segments tighten, then drop their counts
  // (the strip below carries the figure for the selected tab).
  it("tightens its segments, then drops their counts, as its own width narrows", () => {
    const { container } = render(<CategoryFilterCards {...props} enginesTab={{ selected: false, onSelect: vi.fn() }} />);
    expect(container.querySelector("section")!.className).toContain("@container");
    const skills = screen.getByRole("tab", { name: /^Skills/ });
    expect(skills.className).toContain("px-3");
    expect(skills.className).toContain("@[576px]:px-4");
    const count = within(skills).getByText("8");
    expect(count.className).toContain("hidden");
    expect(count.className).toContain("@[512px]:inline");
  });
});
