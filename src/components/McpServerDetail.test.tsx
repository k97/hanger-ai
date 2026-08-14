// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import McpServerDetail, { McpServerView } from "./McpServerDetail";

const base: McpServerView = {
  name: "spades-audio",
  transport: "stdio",
  registrations: [
    { host: "Claude Code", tier: "user", configPath: "~/.claude.json", command: "node" },
    { host: "Claude Code", tier: "global", configPath: "~/.claude/mcp.json", command: "node" },
    {
      host: "Claude Desktop",
      tier: "global",
      configPath: "~/Library/Application Support/Claude/claude_desktop_config.json",
      command: "node",
    },
  ],
  envKeys: [],
};

// This repo configures no global cleanup, so rendered DOM accumulates
// within a file and role queries match across tests.
afterEach(cleanup);

describe("McpServerDetail", () => {
  it("lists every registration, including two from the same host", () => {
    render(<McpServerDetail server={base} />);
    // Two Claude Code registrations is a real condition, not duplication to
    // collapse -- it is what the config_path dedup bug was hiding.
    expect(screen.getAllByText("Claude Code")).toHaveLength(2);
    expect(screen.getByText("Claude Desktop")).toBeTruthy();
    expect(screen.getByText("~/.claude/mcp.json")).toBeTruthy();
    expect(screen.getByText("3 registrations")).toBeTruthy();
  });

  it("renders tools with their descriptions once verified", () => {
    render(
      <McpServerDetail
        server={{
          ...base,
          verified: {
            serverVersion: "1.0.0",
            protocolVersion: "2025-06-18",
            capabilities: ["tools"],
            tools: [
              {
                name: "get_system_volume",
                description: "Get the current macOS system volume level (0–100) and mute state.",
              },
            ],
            verifiedAt: 1_700_000_000_000,
          },
        }}
      />
    );
    expect(screen.getByText("get_system_volume")).toBeTruthy();
    expect(screen.getByText(/current macOS system volume/)).toBeTruthy();
    expect(screen.getByText("2025-06-18")).toBeTruthy();
    expect(screen.getByText("1.0.0")).toBeTruthy();
  });

  it("offers Verify and explains why tools are unknown when never verified", () => {
    render(<McpServerDetail server={base} />);
    expect(screen.getByRole("button", { name: /verify/i })).toBeTruthy();
    // A config declares how to START a server, never what it provides. Say so,
    // rather than showing an unexplained empty list.
    expect(screen.getByText(/never what it provides/i)).toBeTruthy();
  });

  it("never renders an environment variable value", () => {
    render(<McpServerDetail server={{ ...base, envKeys: ["API_KEY", "NODE_OPTIONS"] }} />);
    expect(screen.getByText("API_KEY")).toBeTruthy();
    expect(screen.getByText("NODE_OPTIONS")).toBeTruthy();
    expect(screen.queryByText(/sk-/)).toBeNull();
  });

  it("reports a failed verification instead of an empty tool list", () => {
    render(
      <McpServerDetail
        server={{
          ...base,
          verified: {
            capabilities: [],
            tools: [],
            verifiedAt: 1_700_000_000_000,
            error: "Timed out after 20s waiting for the server to respond",
          },
        }}
      />
    );
    expect(screen.getByText(/Timed out after 20s/)).toBeTruthy();
  });

  it("flags a server speaking an older protocol revision", () => {
    render(
      <McpServerDetail
        server={{
          ...base,
          name: "tauri",
          verified: {
            serverVersion: "0.12.0",
            protocolVersion: "2024-11-05",
            capabilities: ["prompts", "tools"],
            tools: [{ name: "manage_window" }],
            verifiedAt: 1_700_000_000_000,
          },
        }}
      />
    );
    expect(screen.getByText("2024-11-05")).toBeTruthy();
    expect(screen.getByText("prompts, tools")).toBeTruthy();
  });
});
