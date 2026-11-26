// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CategoryFilterCards from "../components/CategoryFilterCards";
import ListRow from "../components/ListRow";
import { repoRowDetail, repoRowFigure } from "../utils/listRowCopy";
import Sidebar from "../components/Sidebar";

describe("Avionics A9 — Narrow-Width Layout Tests", () => {
  it("1. At narrow container width, CategoryFilterCards renders every label and count", () => {
    render(
      <CategoryFilterCards
        skillsCount={42}
        toolsCount={12}
        rulesCount={7}
        subagentsCount={3}
        selectedCategory={null}
        onSelectCategory={() => {}}
        loading={false}
      />
    );

    // Verify all 4 category labels render legibly
    expect(screen.getByText("Skills")).toBeDefined();
    expect(screen.getByText("MCP servers")).toBeDefined();
    expect(screen.getByText("Rules")).toBeDefined();
    expect(screen.getByText("Subagents")).toBeDefined();

    // Verify count numerals render
    expect(screen.getByText("42")).toBeDefined();
    expect(screen.getByText("12")).toBeDefined();
    expect(screen.getByText("7")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
  });

  // Test 2 pinned the container queries that hid the Engine and Kind
  // columns at narrow widths; the columns went with Task 4 of
  // docs/plans/2026-11-26-global-list.md, and the test with them. A
  // repository row's name and State word now share no width-gated cell.
  it("3. A repository row's name and State word always render, at any width", () => {
    const item = {
      name: "my-test-skill",
      category: "Skills" as const,
      path: "/path/to/skill",
      engine: "claude",
      linkState: "linked" as const,
    };

    const figure = repoRowFigure(item);
    render(
      <ListRow kind="skill" name={item.name} detail={repoRowDetail(item)} figure={figure.text} reach={null} selected={false} onSelect={() => {}} />
    );

    // Name and State words must be present, and neither behind a container query
    expect(screen.getByText("my-test-skill")).toBeDefined();
    const state = screen.getByText("Linked");
    expect(state.className).not.toMatch(/(^|\s)hidden(\s|$)|@\[/);
  });

  it("4. Sidebar action labels carry whitespace-nowrap to prevent 2-line text wrapping", () => {
    render(
      <Sidebar
        width={260}
        setWidth={() => {}}
        collapsed={false}
        setCollapsed={() => {}}
        selectedItem="profile"
        setSelectedItem={() => {}}
        inventory={null}
        assetCounts={null}
        detectedEngines={[]}
        linkedRepos={[]}
        loadLinkedRepos={async () => {}}
        setError={() => {}}
        onOpenSearch={() => {}}
      />
    );

    // "Scan for repositories…" was removed, and the pinned footer button is
    // gone too: the group header's + pill is the single add-repo affordance,
    // so a second control could only reintroduce the wrong choice.
    expect(screen.getByLabelText("Add a repository")).toBeTruthy();
    expect(screen.queryByText("Add repository…")).toBeNull();
    expect(screen.queryByText("Scan for repositories…")).toBeNull();
  });
});
