// @vitest-environment happy-dom
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import ProfilePane from "./ProfilePane";

afterEach(cleanup);

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

/** One grouped server and a summary — the two things the strip's MCP mode is
 *  gated on (`mcpMode`, ProfilePane). Undeclared processes now reach the
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
const summary = {
  rows: [{ engine_id: "claude-code", engine_name: "Claude Code", server_count: 3, tools_known: 12 }],
  host_count: 1,
  tools_known_total: 12,
  total_server_count: 3,
  answered_server_count: 3,
  unasked_server_count: 0,
  unaskable_server_count: 0,
  conflicting_server_count: 0,
};

const renderPane = (over: Partial<React.ComponentProps<typeof ProfilePane>> = {}) =>
  render(
    <ProfilePane
      {...base}
      inventory={inventory}
      selectedCategory="Tools"
      serverGrouping="server"
      serverSort="name"
      mcpServers={grouped as never}
      mcpEngineSummary={summary as never}
      hostsBandOpen={false}
      onToggleHostsBand={vi.fn()}
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
    fireEvent.click(screen.getByText("Needs review 1"));
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
    expect(screen.queryByText(/Needs review \d/)).toBeNull();
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
    fireEvent.click(screen.getByText("Needs review 1"));
    expect(screen.getByTestId("finding-popover-line").textContent).toContain(
      "3 processes · e.g. pid 100 · uvx mcp-server-fetch"
    );
  });
});
