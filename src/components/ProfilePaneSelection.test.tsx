// @vitest-environment happy-dom
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import ProfilePane from "./ProfilePane";

/** The pill is the overview card's since Task 7 of
 *  docs/plans/2026-11-26-overview-card.md. A standalone pane draws the card
 *  only into a cap slot, so the pill's tests hand the pane one and open it. */
let capSlot: HTMLElement | null = null;
const slots = () => {
  capSlot = document.createElement("div");
  document.body.appendChild(capSlot);
  return { overviewSlots: { cap: capSlot, inspector: null } };
};
const openOverview = () => {
  fireEvent.click(screen.getByLabelText("Show overview ⌘E"));
  return screen.getByRole("dialog", { name: "Overview" });
};
const cardPill = (card: HTMLElement, n: number) =>
  within(card).getByRole("button", { name: new RegExp(`^Needs review\\s*${n}$`) });

afterEach(() => {
  cleanup();
  capSlot?.remove();
  capSlot = null;
});

/** Three servers declared by ONE config file — the shape of ~/.claude.json. */
const inventory = {
  skills: [], agents: [], rules: [], subagents: [], project_scans: [],
  tools: [
    { id: "/home/.claude.json-spades-audio", name: "spades-audio", command: "node", args: [],
      transport: "stdio", config_path: "/home/.claude.json",
      scope: { Global: { agent: "claude-code" } }, owning_agent: "claude-code" },
    { id: "/home/.claude.json-chrome-devtools", name: "chrome-devtools", command: "npx", args: [],
      transport: "stdio", config_path: "/home/.claude.json",
      scope: { Global: { agent: "claude-code" } }, owning_agent: "claude-code" },
    { id: "/home/.claude.json-tauri", name: "tauri", command: "npx", args: [],
      transport: "stdio", config_path: "/home/.claude.json",
      scope: { Global: { agent: "claude-code" } }, owning_agent: "claude-code" },
  ],
} as any;

const base = { loading: false, onSelectAsset: vi.fn(), onLinkAsset: vi.fn() };

/** One grouped server and an engine list — the two things the strip's MCP
 *  mode is gated on (`mcpMode`, ProfilePane). Undeclared processes now reach the
 *  screen through that mode's review pill rather than a banner of their own,
 *  so a fixture that does not enter it has nowhere to put them. */
const grouped = [
  {
    name: "tauri",
    transport: "stdio",
    registration_count: 1,
    distinct_spec_count: 1,
    agreement: "Consistent",
    aliased_with: [],
    plugin: null,
    registrations: ["/home/.claude.json:tauri"],
  },
];
const renderPane = (over: Partial<React.ComponentProps<typeof ProfilePane>> = {}) =>
  render(
    <ProfilePane
      {...base}
      inventory={inventory}
      selectedCategory="Tools"
      serverGrouping="server"
      serverSort="name"
      mcpServers={grouped as never}
      engines={[]}
      {...slots()}
      {...over}
    />
  );

describe("selecting one MCP server", () => {
  it("marks exactly one row, not every server from the same file", () => {
    // Selection compared on config_path, which ten servers in ~/.claude.json
    // all share — so clicking one lit up all ten.
    render(
      <ProfilePane
        {...base}
        inventory={inventory}
        selectedAsset={{ id: "/home/.claude.json-tauri", path: "/home/.claude.json" } as any}
      />
    );
    const selected = document.querySelectorAll('[data-selected="true"]');
    expect(selected.length).toBe(1);
  });

  it("passes an identity that distinguishes servers sharing a config file", () => {
    const onSelectAsset = vi.fn();
    render(<ProfilePane {...base} onSelectAsset={onSelectAsset} inventory={inventory} />);
    (screen.getByText("chrome-devtools").closest("[tabindex]") as HTMLElement)?.click();
    expect(onSelectAsset).toHaveBeenCalled();
    const arg = onSelectAsset.mock.calls[0][0];
    // A file path cannot identify one of three servers inside that file.
    expect(arg.id).toBe("/home/.claude.json-chrome-devtools");
  });
});

describe("servers running with no config behind them", () => {
  it("undeclared processes are the pill's lines: pid, command and spawning host, no route", () => {
    renderPane({
      unaccountedProcesses: [
        {
          registration_key: "",
          pid: 24149,
          command_line: "node dist/index.js --port 3002",
          spawning_host: "Claude Code",
        },
      ] as never,
    });
    expect(screen.queryByText(/undeclared MCP server/i)).toBeNull();
    fireEvent.click(cardPill(openOverview(), 1));
    const line = screen.getByTestId("finding-popover-line");
    expect(line.textContent).toContain("Running with no config behind it.");
    expect(line.textContent).toContain("pid 24149 · node dist/index.js --port 3002 · started by Claude Code");
    // Nothing to route to: there is no registration to open, which is why
    // the banner this replaces offered no action either.
    expect(screen.queryByText("Show disagreeing servers")).toBeNull();
  });

  it("tells the owner when the category changes, so the process fetch can fire", () => {
    // The facet chip sets ProfilePane's INTERNAL category; App's
    // selectedSidebarItem does not move. Without this callback the owner never
    // learns the user is looking at Tools, so it never fetches, and the banner
    // stays invisible until an individual server is opened. Verified against
    // the running app: clicking the chip produced no banner, clicking a row
    // produced "166 undeclared MCP servers".
    const onCategoryChange = vi.fn();
    render(
      <ProfilePane {...base} inventory={inventory} onCategoryChange={onCategoryChange} />
    );
    const chip = [...document.querySelectorAll("button")].find((b) =>
      /MCP servers/i.test(b.textContent ?? "")
    );
    fireEvent.click(chip as HTMLElement);
    expect(onCategoryChange).toHaveBeenCalledWith("Tools");
  });

  it("says nothing when every running server is accounted for", () => {
    // Silence is the ordinary state. A pill reading "0" on every launch would
    // train the reader to ignore the one that matters.
    renderPane({ unaccountedProcesses: [] });
    const card = openOverview();
    expect(within(card).queryByRole("button", { name: /^Needs review/ })).toBeNull();
  });

  it("many processes of one launch are one line, with a count and an example pid", () => {
    // This machine runs ~79 chroma-mcp instances against a single --data-dir.
    // Eighty identical rows is not a disclosure, it is a wall. The banner once
    // printed "79 processes · pid 24149 ×79"; one number, then a pid you can
    // look up.
    renderPane({
      unaccountedProcesses: Array.from({ length: 3 }, (_, i) => ({
        registration_key: "",
        pid: 100 + i,
        command_line: "uvx mcp-server-fetch",
      })) as never,
    });
    fireEvent.click(cardPill(openOverview(), 1));
    expect(screen.getByTestId("finding-popover-line").textContent).toContain(
      "3 processes · e.g. pid 100 · uvx mcp-server-fetch"
    );
  });
});
