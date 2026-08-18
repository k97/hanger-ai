// @vitest-environment happy-dom
import { render, screen, cleanup, within } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import AssetRow from "../components/AssetRow";
import ProfilePane from "../components/ProfilePane";
import RepoPane from "../components/RepoPane";

afterEach(cleanup);

const base = { loading: false, onSelectAsset: vi.fn(), onLinkAsset: vi.fn() };

/** One server, the shape of ~/.claude.json. */
const inventoryWithOneServer = {
  skills: [], agents: [], rules: [], subagents: [], project_scans: [],
  tools: [
    {
      id: "/home/.claude.json:tauri",
      name: "tauri",
      command: "npx",
      transport: "stdio",
      config_path: "/home/.claude.json",
      scope: { Global: { agent: "claude-code" } },
      owning_agent: "claude-code",
    },
  ],
} as any;

/** Project-scoped, not Global: `filterRepoAssets` keys a repo's Tools on
 *  `isRepoScope`, which a Global registration never satisfies. */
const inventoryWithOneRepoServer = {
  skills: [], agents: [], rules: [], subagents: [], project_scans: [],
  tools: [
    {
      id: "/Users/test/Work/.mcp.json:tauri",
      name: "tauri",
      command: "npx",
      transport: "stdio",
      config_path: "/Users/test/Work/.mcp.json",
      scope: { Project: { agent: "claude-code", root: "/Users/test/Work" } },
      owning_agent: "claude-code",
    },
  ],
} as any;

describe("the MCP card row", () => {
  it("renders a server as one card row with its agreement sentence", () => {
    render(
      <AssetRow
        variant="card"
        item={{
          id: "/home/.claude.json:tauri",
          name: "tauri",
          category: "Tools",
          path: "/home/.claude.json",
          transport: "stdio",
          agreementLine: "3 registrations · 2 different launch specs",
        } as any}
        isSelected={false}
      />
    );
    expect(screen.getByText("tauri")).toBeTruthy();
    expect(screen.getByText("stdio")).toBeTruthy();
    expect(screen.getByText("3 registrations · 2 different launch specs")).toBeTruthy();
  });

  it("puts the column labels on the section header, not on a row above every section", () => {
    render(<ProfilePane {...base} inventory={inventoryWithOneServer} />);
    const header = screen.getByTestId("section-header-tools");
    expect(within(header).getByText("Registered in")).toBeTruthy();
    expect(within(header).getByText("Tools")).toBeTruthy();
  });

  it("does not render Beyond the store anywhere in the default view when Tools is the only section present", () => {
    // The shared `AssetHeaderRow` is `sticky` over the WHOLE scrollable
    // list, not scoped to whichever section sits beneath it — so scoping
    // this assertion to `section-header-tools` (the MCP section's own
    // inline header, built from three literals that never carried this
    // string) could never fail no matter what the shared header above it
    // rendered. `inventoryWithOneServer` has no selectedCategory and no
    // rows besides Tools, which is exactly the case the old
    // `selectedCategory !== "Tools"` guard let through: null is not
    // "Tools", so the shared header rendered anyway, Reach and Beyond the
    // store both, over card rows those columns do not describe. Asserting
    // against the whole document is what actually pins the fix.
    render(<ProfilePane {...base} inventory={inventoryWithOneServer} />);
    expect(screen.queryByText("Beyond the store")).toBeNull();
  });

  it("gives RepoPane the same section header treatment as ProfilePane", () => {
    // Task 6's brief was corrected before dispatch specifically because an
    // earlier draft named only ProfilePane — RepoPane renders the identical
    // structure and was left inconsistent. This is that pane.
    render(
      <RepoPane
        repoPath="/Users/test/Work"
        inventory={inventoryWithOneRepoServer}
        loading={false}
        onRefresh={vi.fn()}
        onSelectAsset={vi.fn()}
        onLinkFromProfile={vi.fn()}
      />
    );
    const header = screen.getByTestId("section-header-tools");
    expect(within(header).getByText("Registered in")).toBeTruthy();
    expect(within(header).getByText("Tools")).toBeTruthy();
    expect(within(header).queryByText("Beyond the store")).toBeNull();
  });

  it("does not duplicate the header when the Tools chip is the active filter, ProfilePane", () => {
    // The state a user actually lands in by clicking the MCP servers chip:
    // selectedCategory "Tools", a non-empty tools array. Both existing
    // ProfilePane/RepoPane integration tests that set this filter pass
    // `tools: []`, so the Tools section — and the header-suppression
    // conditional that keeps the shared AssetHeaderRow off it — has never
    // rendered anything under either. This is the first test that does.
    render(
      <ProfilePane {...base} inventory={inventoryWithOneServer} selectedCategory="Tools" />
    );
    expect(screen.queryByTestId("asset-header-row")).toBeNull();
    const header = screen.getByTestId("section-header-tools");
    expect(within(header).getByText("Registered in")).toBeTruthy();
    expect(within(header).getByText("Tools")).toBeTruthy();
    expect(within(header).queryByText("Beyond the store")).toBeNull();
    expect(screen.getByText("tauri")).toBeTruthy();
  });

  it("does not duplicate the header when the Tools chip is the active filter, RepoPane", () => {
    render(
      <RepoPane
        repoPath="/Users/test/Work"
        inventory={inventoryWithOneRepoServer}
        loading={false}
        selectedCategory="Tools"
        onRefresh={vi.fn()}
        onSelectAsset={vi.fn()}
        onLinkFromProfile={vi.fn()}
      />
    );
    expect(screen.queryByTestId("asset-header-row")).toBeNull();
    const header = screen.getByTestId("section-header-tools");
    expect(within(header).getByText("Registered in")).toBeTruthy();
    expect(within(header).getByText("Tools")).toBeTruthy();
    expect(within(header).queryByText("Beyond the store")).toBeNull();
    expect(screen.getByText("tauri")).toBeTruthy();
  });
});
