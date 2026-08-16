import { describe, it, expect } from "vitest";
import { buildMcpServerView } from "./mcpServerView";

const tools = [
  { name: "spades-audio", command: "node", transport: "stdio",
    config_path: "/home/.claude.json", scope: { Global: { agent: "claude-code" } } },
  { name: "spades-audio", command: "node", transport: "stdio",
    config_path: "/home/Library/Application Support/Claude/claude_desktop_config.json",
    scope: { Global: { agent: "claude-desktop" } } },
  { name: "repo-local", command: "node", transport: "stdio",
    config_path: "/home/.claude.json", scope: { Local: { agent: "claude-code", root: "/repo/a" } } },
  { name: "loose", command: "node", transport: "stdio",
    config_path: "/repo/a/.agents/mcp.json", owning_agent: "", scope: { Project: { agent: "", root: "/repo/a" } } },
];

describe("buildMcpServerView", () => {
  it("gathers every registration of one server across hosts", () => {
    const view = buildMcpServerView(tools, "spades-audio")!;
    expect(view.registrations).toHaveLength(2);
    expect(view.registrations.map((r) => r.host)).toEqual(["Claude Code", "Claude Desktop"]);
  });

  it("does not skip Local-scoped registrations", () => {
    // Reading scope.Project.root directly would drop this one entirely.
    const view = buildMcpServerView(tools, "repo-local")!;
    expect(view.registrations).toHaveLength(1);
    expect(view.registrations[0].tier).toBe("local");
  });

  it("labels an unattributed loose config as Any agent", () => {
    const view = buildMcpServerView(tools, "loose")!;
    expect(view.registrations[0].host).toBe("Any agent");
  });

  it("returns null for a server that is not registered anywhere", () => {
    expect(buildMcpServerView(tools, "nonexistent")).toBeNull();
    expect(buildMcpServerView(undefined, "spades-audio")).toBeNull();
  });

  it("attaches a running process to the registration it belongs to", () => {
    // The key is the backend's own registration_key — (config path, name) —
    // so the process lands on the Claude Code row and not on the Claude
    // Desktop one, even though both declare the same server.
    const view = buildMcpServerView(tools, "spades-audio", [
      {
        registration_key: "/home/.claude.json-spades-audio",
        pid: 8269,
        command_line: "node /Applications/Spades Audio.app/index.js",
        spawning_host: "Claude Code",
      },
    ])!;
    expect(view.registrations[0].running).toEqual({ pid: 8269, spawningHost: "Claude Code" });
    expect(view.registrations[1].running).toBeUndefined();
  });

  it("ignores unaccounted processes when attaching running state", () => {
    // An unaccounted process has an empty registration_key. Matching on it
    // would attach it to whichever registration also stringified to "".
    const view = buildMcpServerView(tools, "spades-audio", [
      { registration_key: "", pid: 1649, command_line: "macos-mcp serve" },
    ])!;
    expect(view.registrations.every((r) => r.running === undefined)).toBe(true);
  });

  it("leaves running state absent when no processes are supplied", () => {
    const view = buildMcpServerView(tools, "spades-audio")!;
    expect(view.registrations.every((r) => r.running === undefined)).toBe(true);
  });

  it("carries the backend's redacted launch onto each registration", () => {
    const view = buildMcpServerView(
      [
        {
          id: "/tmp/mcp.json-protected",
          name: "protected",
          command: "npx",
          launch_display: "npx mcp-remote https://example.com/sse --header Authorization: <redacted>",
          transport: "stdio",
          config_path: "/tmp/mcp.json",
        },
      ],
      "protected"
    );
    expect(view?.registrations[0].launchDisplay).toContain("<redacted>");
  });
});
