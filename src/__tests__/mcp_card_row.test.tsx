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

  it("rules off its column labels the way the shared table header does", () => {
    // The MCP tab has no `AssetHeaderRow` — `toolsOnlyView` suppresses it —
    // so this inline header IS the table header there, and it was the one
    // header on any tab with no separator under its column names (Karthik,
    // 2026-08-29). A class contract: `happy-dom` paints no borders.
    render(<ProfilePane {...base} inventory={inventoryWithOneServer} />);
    const header = screen.getByTestId("section-header-tools");
    expect(header.className).toContain("border-b");
    expect(header.className).toContain("border-line");
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

  // §6.3 state 3 ("one engine only"): verify-and-pin, not a build — see
  // task-13-report.md for the full trace. `agreement_for` forces `Duplicate`
  // whenever every registration of a server shares one host_id, so
  // `Consistent` ("… agree") cannot render for a single-engine machine; the
  // sentence is also phrased entirely around registrations, never engines,
  // so there is no engine-count claim to overpromise with.
  it("state 3 — a one-engine machine's own repeated declaration reads as a duplicate, never a cross-engine agreement", () => {
    render(
      <ProfilePane
        {...base}
        // `mcpServers` (below) drives the grouped card row; `inventory.tools`
        // only needs to be non-empty so `storeEmpty`/`isCategoryEmpty` (which
        // read the raw inventory, not `mcpServers`) don't route to the
        // empty-store plane before the grouped list ever gets a chance.
        inventory={inventoryWithOneServer}
        scannedAt={new Date()}
        detectedEngines={[{ id: "claude-code", name: "Claude Code" }]}
        mcpServers={[
          {
            name: "tauri",
            transport: "stdio",
            registration_count: 2,
            distinct_spec_count: 1,
            agreement: "Duplicate",
            aliased_with: [],
            plugin: null,
            registrations: ["/home/.claude.json:tauri", "/home/.claude.json:tauri"],
          },
        ]}
      />
    );
    expect(screen.getByText("2 registrations · declared twice by the same engine")).toBeTruthy();
    expect(screen.queryByText(/agree/)).toBeNull();
  });

  // §6.3 state 4 (remote-only): every server a connector or remote URL, no
  // local config launches. Verify-and-pin, not a build — see
  // task-13-report.md's "State 4" section for the full trace: A.1's empty
  // state gates on the raw `Tool[]` array, which a remote registration
  // populates like any other; and the card row (`AssetRow.tsx`) never reads
  // `command` or a file path at all, so an empty command has nothing to leak
  // through.
  describe("state 4 — remote-only servers", () => {
    const remoteOnlyInventory = {
      skills: [], agents: [], rules: [], subagents: [], project_scans: [],
      tools: [
        {
          id: "/home/.claude.json:weather",
          name: "weather",
          command: "",
          transport: "https://mcp.example.com/weather",
          config_path: "/home/.claude.json",
          scope: { Global: { agent: "claude-code" } },
          owning_agent: "claude-code",
        },
        {
          id: "/home/.claude.json:notion-connector",
          name: "notion-connector",
          command: "",
          transport: "claude.ai",
          config_path: "/home/.claude.json",
          scope: { Global: { agent: "claude-code" } },
          owning_agent: "claude-code",
        },
      ],
    } as any;

    it("never renders A.1's zero-servers empty state — remote registrations are real servers", () => {
      render(
        <ProfilePane
          {...base}
          inventory={remoteOnlyInventory}
          scannedAt={new Date()}
          selectedCategory="Tools"
          detectedEngines={[{ id: "claude-code", name: "Claude Code" }]}
          mcpCoverage={{ checked_file_count: 1, checked_engine_count: 1, checked_files: [] }}
        />
      );
      expect(screen.queryByText("No MCP servers registered")).toBeNull();
      expect(screen.getByText("weather")).toBeTruthy();
      expect(screen.getByText("notion-connector")).toBeTruthy();
    });

    it("shows the transport chip, never a bare command or a file path, for a remote-only row", () => {
      render(<ProfilePane {...base} inventory={remoteOnlyInventory} scannedAt={new Date()} />);
      expect(screen.getByText("weather")).toBeTruthy();
      expect(screen.getByText("https://mcp.example.com/weather")).toBeTruthy();
      expect(screen.getByText("claude.ai")).toBeTruthy();
      expect(screen.queryByText(/Command:/)).toBeNull();
      expect(screen.queryByText("/home/.claude.json")).toBeNull();
    });
  });

  // §6.3 state 8 (50+ servers): sticky headers hold and the tile column does
  // not reflow. A jsdom test cannot see CSS stickiness taking effect during
  // scroll, so this pins the structural facts a rendered check CAN see —
  // every row renders (no silent cap), the Tools section header carries the
  // sticky classname, and the scroll container carries the overflow class
  // sticky positioning depends on. The visual half is Task 14's screenshot.
  describe("state 8 — 50+ servers", () => {
    const manyServerRows = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        name: `server-${String(i).padStart(3, "0")}`,
        transport: "stdio",
        registration_count: 1,
        distinct_spec_count: 1,
        agreement: "Consistent" as const,
        aliased_with: [],
        plugin: null,
        registrations: [`/home/.claude.json:server-${i}`],
      }));

    it("renders every one of 55 servers — no silent cap or virtualisation", () => {
      render(
        <ProfilePane
          {...base}
          inventory={inventoryWithOneServer}
          scannedAt={new Date()}
          selectedCategory="Tools"
          mcpServers={manyServerRows(55)}
        />
      );
      expect(screen.getByText("server-000")).toBeTruthy();
      expect(screen.getByText("server-054")).toBeTruthy();
      expect(screen.getAllByText(/^server-\d{3}$/)).toHaveLength(55);
    });

    it("the Tools section header carries the sticky classname", () => {
      render(
        <ProfilePane
          {...base}
          inventory={inventoryWithOneServer}
          scannedAt={new Date()}
          selectedCategory="Tools"
          mcpServers={manyServerRows(55)}
        />
      );
      const header = screen.getByTestId("section-header-tools");
      expect(header.className).toContain("sticky");
      expect(header.className).toContain("top-0");
    });

    it("the list's scroll container carries the overflow class sticky positioning requires", () => {
      render(
        <ProfilePane
          {...base}
          inventory={inventoryWithOneServer}
          scannedAt={new Date()}
          selectedCategory="Tools"
          mcpServers={manyServerRows(55)}
        />
      );
      const container = screen.getByTestId("asset-list-scroll");
      expect(container.className).toContain("overflow-y-auto");
    });

    it("the tile and tool-count columns keep their fixed width regardless of row count — the column never reflows", () => {
      const { container: few } = render(
        <ProfilePane {...base} inventory={inventoryWithOneServer} scannedAt={new Date()} mcpServers={manyServerRows(3)} />
      );
      const { container: many } = render(
        <ProfilePane {...base} inventory={inventoryWithOneServer} scannedAt={new Date()} mcpServers={manyServerRows(55)} />
      );
      const widthClass = (root: HTMLElement) =>
        Array.from(root.querySelectorAll(".w-\\[100px\\]")).length > 0 &&
        Array.from(root.querySelectorAll(".w-\\[150px\\]")).length > 0;
      expect(widthClass(few)).toBe(true);
      expect(widthClass(many)).toBe(true);
    });
  });

  // §6.3 state 9 (project-scope override) — the load-bearing test for this
  // task: a project-scope override of a user-scope name must be surfaced on
  // the row, never silently folded into an indistinguishable "2
  // registrations · declared twice by the same engine" sentence. See
  // task-13-report.md's "State 9" section for the full trace: the backend
  // (`mcp::servers::group_servers`) now carries `project_override`, and the
  // frontend (`cardSecondLine`) appends the override note to whatever
  // agreement sentence the verdict already produces.
  it("state 9 — a project-scope override renders on the row, not a silent merge into a plain duplicate", () => {
    render(
      <ProfilePane
        {...base}
        inventory={inventoryWithOneServer}
        scannedAt={new Date()}
        mcpServers={[
          {
            name: "tauri",
            transport: "stdio",
            registration_count: 2,
            distinct_spec_count: 1,
            agreement: "Duplicate",
            aliased_with: [],
            plugin: null,
            registrations: ["/home/.claude.json:tauri", "/home/.claude.json:tauri"],
            project_override: "/Users/karthik/Work/hanger-ai",
          },
        ]}
      />
    );
    // Nothing lost: the registration count is still on screen.
    expect(screen.getByText(/2 registrations/)).toBeTruthy();
    // The override is visible, named by project — not collapsed into a bare
    // "declared twice" with no explanation of why there are two.
    expect(
      screen.getByText(
        "2 registrations · declared twice by the same engine · also declared for /Users/karthik/Work/hanger-ai — the version used there"
      )
    ).toBeTruthy();
  });

  it("state 9 — no override note when the backend found none, even with the same agreement shape", () => {
    // Companion to the load-bearing test above: the note is conditional on
    // the real backend signal, not always-on for every Duplicate row.
    render(
      <ProfilePane
        {...base}
        inventory={inventoryWithOneServer}
        scannedAt={new Date()}
        mcpServers={[
          {
            name: "tauri",
            transport: "stdio",
            registration_count: 2,
            distinct_spec_count: 1,
            agreement: "Duplicate",
            aliased_with: [],
            plugin: null,
            registrations: ["/home/.claude.json:tauri", "/home/.claude.json:tauri"],
          },
        ]}
      />
    );
    expect(screen.getByText("2 registrations · declared twice by the same engine")).toBeTruthy();
    expect(screen.queryByText(/also declared for/)).toBeNull();
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
