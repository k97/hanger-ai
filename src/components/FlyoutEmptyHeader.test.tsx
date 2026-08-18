// @vitest-environment happy-dom
//
// The inspector's empty state (nothing selected) previously rendered no
// eyebrow at all — the "Inspector" literal it once fell back to is
// unreachable, since the header block only mounts when linking, targetAsset
// or selectedBubble is truthy. Karthik signed off a plural eyebrow for this
// state, but only when the MCP category is the pane's active filter: a user
// filtered to Skills must not be told "MCP servers" over an empty Skills
// list. `activeCategory` and `paneScope` are owned by App.tsx (the crumb's
// last segment); this component only composes them.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import Flyout from "./Flyout";
import { Inventory } from "../App";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));

afterEach(() => {
  cleanup();
});

const emptyInventory: Inventory = {
  agents: [],
  skills: [],
  tools: [],
  rules: [],
  subagents: [],
  project_scans: [],
};

describe("Flyout empty-inspector eyebrow", () => {
  it("MCP filter active, nothing selected, shows the plural eyebrow with the pane's scope", () => {
    render(
      <Flyout
        activeCategory="Tools"
        paneScope="Global"
        inventory={emptyInventory}
        linkedProjects={[]}
        onRefresh={vi.fn()}
      />
    );

    expect(screen.getByText("MCP servers")).toBeTruthy();
    expect(screen.getByText("Global")).toBeTruthy();
    // Nothing is selected, so there is no title beneath the eyebrow.
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("MCP filter active in a repository view, nothing selected, shows the repo's folder name", () => {
    render(
      <Flyout
        activeCategory="Tools"
        paneScope="my-repo"
        inventory={emptyInventory}
        linkedProjects={[]}
        onRefresh={vi.fn()}
      />
    );

    expect(screen.getByText("MCP servers")).toBeTruthy();
    expect(screen.getByText("my-repo")).toBeTruthy();
    expect(screen.queryByText("Global")).toBeNull();
  });

  it("a non-MCP filter active, nothing selected, leaves today's empty state unchanged", () => {
    render(
      <Flyout
        activeCategory="Skills"
        paneScope="Global"
        inventory={emptyInventory}
        linkedProjects={[]}
        onRefresh={vi.fn()}
      />
    );

    expect(screen.queryByText("MCP servers")).toBeNull();
    expect(screen.getByText("Nothing selected")).toBeTruthy();
  });
});
