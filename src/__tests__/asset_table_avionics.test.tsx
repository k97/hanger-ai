// @vitest-environment happy-dom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import ProfilePane from "../components/ProfilePane";
import AssetRow from "../components/AssetRow";
import { Inventory } from "../App";

// Mock Tauri invoke for preference calls
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string, args?: any) => {
    if (cmd === "get_preference") {
      if (args?.key === "sort_field") return Promise.resolve("engine");
      if (args?.key === "sort_direction") return Promise.resolve("desc");
    }
    return Promise.resolve(null);
  }),
}));

describe("Avionics A6 Asset Table Spec Compliance", () => {
  afterEach(() => {
    cleanup();
  });

  const sampleInventory: Inventory = {
    skills: [
      {
        id: "skill-b",
        name: "Bravo Skill",
        description: "Bravo description",
        version: "v1.0.0",
        path: "/path/to/bravo/SKILL.md",
        scope: { Global: { agent: "Codex" } },
        is_symlink: true,
        parse_status: "ok",
      },
      {
        id: "skill-a",
        name: "Alpha Skill",
        description: "Alpha description",
        version: "v1.0.0",
        path: "/path/to/alpha/SKILL.md",
        scope: { Global: { agent: "Claude" } },
        is_symlink: false,
        parse_status: "ok",
      },
      {
        id: "skill-failed",
        name: "Failed Skill",
        description: "Failed description",
        version: "v1.0.0",
        path: "/path/to/failed/SKILL.md",
        scope: { Global: { agent: "" } },
        parse_status: "failed",
        parse_error: "YAML parsing failed: mapping values are not allowed at line 3 column 454",
      },
    ],
    agents: [],
    tools: [
      {
        id: "tool-z",
        name: "Zebra Tool",
        command: "zebra",
        transport: "stdio",
        config_path: "/path/to/zebra/config.json",
        scope: { Global: { agent: "Claude" } },
        owning_agent: "Claude",
        parse_status: "ok",
      },
    ],
    rules: [],
    subagents: [],
    project_scans: [],
  };

  // Column set ruled 2026-08-15 (item 8): the Global pane renders Reach and
  // Beyond the store in place of Engine and State; those two live on in the
  // repo pane's legacy variant.
  it("1. Header row renders all four column labels when unfiltered", () => {
    render(
      <ProfilePane
        inventory={sampleInventory}
        loading={false}
        onSelectAsset={() => {}}
        onLinkAsset={() => {}}
      />
    );

    const header = screen.getByTestId("asset-header-row");
    expect(header).not.toBeNull();
    expect(header.textContent).toContain("Name");
    expect(header.textContent).toContain("Kind");
    expect(header.textContent).toContain("Reach");
    expect(header.textContent).toContain("Beyond the store");
    expect(header.textContent).not.toContain("Engine");
    expect(header.textContent).not.toContain("State");
  });

  // Annotated rows carry a mechanism slot, not a state dot, so row order is
  // read from the rows themselves (the name span is the row's first cell).
  const rowNames = () =>
    Array.from(document.querySelectorAll("div[data-selected]")).map(
      (row) => row.querySelector("span.truncate")?.textContent?.trim()
    );

  it("2. Clicking a header sorts; clicking again reverses. Assert row ORDER.", () => {
    render(
      <ProfilePane
        inventory={sampleInventory}
        selectedCategory="Skills"
        loading={false}
        onSelectAsset={() => {}}
        onLinkAsset={() => {}}
      />
    );

    // Initial Skills order (Name asc): Alpha Skill, Bravo Skill, Failed Skill
    let names = rowNames();
    expect(names[0]).toBe("Alpha Skill");
    expect(names[2]).toBe("Failed Skill");

    // Click Name header to toggle to descending
    const nameHeader = screen.getByRole("button", { name: /Name/i });
    fireEvent.click(nameHeader);

    // Order reverses (Name desc): Failed Skill, Bravo Skill, Alpha Skill
    names = rowNames();
    expect(names[0]).toBe("Failed Skill");
    expect(names[2]).toBe("Alpha Skill");
  });

  it("3. Sort persists across a simulated restart", () => {
    // Render with sortField="engine" and sortDirection="desc"
    render(
      <ProfilePane
        inventory={sampleInventory}
        selectedCategory="Skills"
        sortField="engine"
        sortDirection="desc"
        loading={false}
        onSelectAsset={() => {}}
        onLinkAsset={() => {}}
      />
    );

    // Engine descending for Skills: "Codex" (Bravo Skill), "Claude" (Alpha
    // Skill), "Any agent" (Failed Skill). The engine column left the Global
    // pane by ruling, but a persisted engine sort still orders the rows.
    const names = rowNames();
    expect(names[0]).toBe("Bravo Skill");
    expect(names[1]).toBe("Alpha Skill");
    expect(names[2]).toBe("Failed Skill");
  });

  it("4. Changing category filter preserves sort order", () => {
    const { rerender } = render(
      <ProfilePane
        inventory={sampleInventory}
        selectedCategory={null}
        sortField="name"
        sortDirection="desc"
        loading={false}
        onSelectAsset={() => {}}
        onLinkAsset={() => {}}
      />
    );

    // Change category filter to "Skills" while maintaining sortField="name", sortDirection="desc"
    rerender(
      <ProfilePane
        inventory={sampleInventory}
        selectedCategory="Skills"
        sortField="name"
        sortDirection="desc"
        loading={false}
        onSelectAsset={() => {}}
        onLinkAsset={() => {}}
      />
    );

    // Skills sorted name desc: Failed Skill, Bravo Skill, Alpha Skill
    const names = rowNames();
    expect(names[0]).toBe("Failed Skill");
    expect(names[1]).toBe("Bravo Skill");
    expect(names[2]).toBe("Alpha Skill");
  });

  it("5. Kind column absent when filtered to a single category", () => {
    render(
      <ProfilePane
        inventory={sampleInventory}
        selectedCategory="Skills"
        loading={false}
        onSelectAsset={() => {}}
        onLinkAsset={() => {}}
      />
    );

    const header = screen.getByTestId("asset-header-row");
    expect(header.textContent).toContain("Name");
    expect(header.textContent).not.toContain("Kind");
    expect(header.textContent).toContain("Reach");
    expect(header.textContent).toContain("Beyond the store");
  });

  it("6. An asset with NULL engine renders 'Any agent' in the legacy variant, not blank", () => {
    // The engine column left the Global pane by ruling; the behaviour lives
    // on in the un-annotated variant the repo pane renders.
    render(
      <AssetRow
        item={{
          name: "Anyone Skill",
          category: "Skills",
          path: "/path/to/anyone/SKILL.md",
          engine: null,
        }}
      />
    );

    expect(screen.getAllByText("Any agent").length).toBeGreaterThan(0);
  });

  it("7. A parse-failed asset renders as a row with a dimmed name and no raw error text", () => {
    render(
      <ProfilePane
        inventory={sampleInventory}
        selectedCategory="Skills"
        loading={false}
        onSelectAsset={() => {}}
        onLinkAsset={() => {}}
      />
    );

    // The row is present, dimmed — the state word moved to the review pane
    // when the Global pane's State column became Beyond the store (ruling).
    const failedName = screen.getByText("Failed Skill");
    expect(failedName.className).toContain("text-ink-3");

    // Raw parse_error string is not rendered in visible text
    expect(screen.queryByText(/mapping values are not allowed/i)).toBeNull();
  });

  it("8. Selecting a row still drives the inspector — A5-R behaviour intact", () => {
    const handleSelectAsset = vi.fn();
    render(
      <ProfilePane
        inventory={sampleInventory}
        selectedCategory="Skills"
        loading={false}
        onSelectAsset={handleSelectAsset}
        onLinkAsset={() => {}}
      />
    );

    const alphaNameSpan = screen.getByText("Alpha Skill");
    const rowElement = alphaNameSpan.closest("div[data-selected]");
    expect(rowElement).not.toBeNull();
    fireEvent.click(rowElement!);

    expect(handleSelectAsset).toHaveBeenCalledWith({
      name: "Alpha Skill",
      category: "Skills",
      path: "/path/to/alpha/SKILL.md",
    });
  });
});
