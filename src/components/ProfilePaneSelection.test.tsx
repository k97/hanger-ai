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
    const selected = document.querySelectorAll('[aria-selected="true"], [data-selected="true"]');
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
  it("discloses them, with the pid and what they are running", () => {
    render(
      <ProfilePane
        {...base}
        inventory={inventory}
        unaccountedProcesses={
          [
            {
              registration_key: "",
              pid: 1649,
              command_line: "macos-mcp serve --transport streamable-http --port 8000",
            },
          ] as any
        }
      />
    );
    expect(screen.getByText(/undeclared MCP server/i)).toBeTruthy();
    // The banner is collapsed by default, so open it before reading the rows.
    fireEvent.click(screen.getByRole("button", { name: /undeclared MCP server/i }));
    expect(screen.getByText(/1649/)).toBeTruthy();
    expect(screen.getByText(/macos-mcp serve/)).toBeTruthy();
  });

  it("says nothing when every running server is accounted for", () => {
    // Silence is the ordinary state. A banner reading "0 unaccounted" on every
    // launch would train the reader to ignore the one that matters.
    render(<ProfilePane {...base} inventory={inventory} unaccountedProcesses={[]} />);
    expect(screen.queryByText(/undeclared MCP server/i)).toBeNull();
  });

  it("groups repeats of one launch instead of listing it eighty times", () => {
    // This machine runs ~79 chroma-mcp instances against a single --data-dir.
    // Eighty identical rows is not a disclosure, it is a wall.
    const many = Array.from({ length: 4 }, (_, i) => ({
      registration_key: "",
      pid: 2000 + i,
      command_line: "chroma-mcp --client-type persistent --data-dir /x",
    }));
    render(<ProfilePane {...base} inventory={inventory} unaccountedProcesses={many as any} />);
    fireEvent.click(screen.getByRole("button", { name: /undeclared MCP server/i }));
    expect(screen.getAllByText(/chroma-mcp --client-type/)).toHaveLength(1);
    expect(screen.getByText(/×\s*4/)).toBeTruthy();
  });
});
