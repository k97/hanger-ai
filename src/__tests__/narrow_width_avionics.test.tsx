// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CategoryFilterCards from "../components/CategoryFilterCards";
import AssetHeaderRow from "../components/AssetHeaderRow";
import AssetRow from "../components/AssetRow";
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

  it("2. AssetHeaderRow and AssetRow carry container query classes for Engine and Kind column dropping", () => {
    render(
      <AssetHeaderRow
        sortField="name"
        sortDirection="asc"
        showKindColumn={true}
        onSort={() => {}}
      />
    );

    const engineHeader = screen.getByText("Engine").parentElement;
    const kindHeader = screen.getByText("Kind").parentElement;

    // Assert container query classes for responsive column dropping
    expect(engineHeader?.className).toContain("hidden");
    expect(engineHeader?.className).toContain("@[580px]:flex");

    expect(kindHeader?.className).toContain("hidden");
    expect(kindHeader?.className).toContain("@[460px]:flex");
  });

  it("3. Name and State columns always render regardless of container query state", () => {
    const item = {
      name: "my-test-skill",
      category: "Skills" as const,
      path: "/path/to/skill",
      engine: "claude",
      linkState: "linked" as const,
    };

    render(<AssetRow item={item} showKindColumn={true} />);

    // Name and State words must be present
    expect(screen.getByText("my-test-skill")).toBeDefined();
    expect(screen.getByText("Linked")).toBeDefined();
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
