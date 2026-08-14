// @vitest-environment happy-dom
import { render, screen, cleanup } from "@testing-library/react";
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
