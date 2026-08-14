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
});
