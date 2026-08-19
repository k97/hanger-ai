// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import Flyout from "./Flyout";
import { Inventory } from "../App";

/**
 * The wiring between the panel's two questions and the one command that
 * answers them.
 *
 * `McpServerDetail.test.tsx` covers what the panel decides; the Rust suite
 * covers what the backend does with the answer. Neither can see this: that
 * opening a server reaches `mcp_cached_probe` at all, that the re-check sets
 * `force`, and that a declined answer leaves the panel explaining itself
 * rather than showing an empty tool list. That gap is where a probe path can
 * be perfectly correct on both sides and never joined up.
 */

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (cmd: string, args?: unknown) => invoke(cmd, args) }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(), revealItemInDir: vi.fn() }));

const inventory: Inventory = {
  agents: [],
  skills: [],
  tools: [
    {
      id: "/Users/x/.claude.json:spades-audio",
      name: "spades-audio",
      command: "node",
      launch_display: "node /Applications/Spades Audio.app/index.js",
      transport: "stdio",
      config_path: "/Users/x/.claude.json",
      scope: { Global: { agent: "claude-code" } },
      owning_agent: "claude-code",
      drifted: false,
    },
  ] as never,
  rules: [],
  subagents: [],
  project_scans: [],
};

const selected = { name: "spades-audio", category: "Tools", path: "/Users/x/.claude.json" };

const probeCalls = () => invoke.mock.calls.filter(([cmd]) => cmd === "mcp_cached_probe");

beforeEach(() => {
  invoke.mockReset();
  invoke.mockImplementation((cmd: string) => {
    if (cmd === "mcp_cached_probe") {
      return Promise.resolve({ result: null, verifiedAt: null, fromCache: false });
    }
    return Promise.resolve(null);
  });
});

afterEach(cleanup);

describe("Flyout — asking an MCP server what it provides", () => {
  it("asks on open, without force, and never calls the old always-spawning command", async () => {
    render(
      <Flyout
        inventory={inventory}
        selectedAsset={selected as never}
        mcpProcesses={[]}
        linkedProjects={[]}
        onRefresh={() => {}}
      />
    );

    await waitFor(() => expect(probeCalls()).toHaveLength(1));
    expect(probeCalls()[0][1]).toEqual({
      registrationKey: "/Users/x/.claude.json:spades-audio",
      force: false,
      running: false,
    });
    // Task 6 replaces the always-spawning path for the panel. Task 7 decides
    // whether `mcp_probe` still has any caller at all; what must be true here
    // is that opening a panel is not one.
    expect(invoke.mock.calls.some(([cmd]) => cmd === "mcp_probe")).toBe(false);
  });

  it("declines to spawn while it does not yet know what is running", async () => {
    // `mcpProcesses` is null until `get_mcp_processes` answers, and that call
    // rescans. Asking with `running: false` in that window would start a
    // second copy of every running server on the machine.
    render(
      <Flyout
        inventory={inventory}
        selectedAsset={selected as never}
        mcpProcesses={null}
        linkedProjects={[]}
        onRefresh={() => {}}
      />
    );

    await waitFor(() => expect(probeCalls()).toHaveLength(1));
    expect(probeCalls()[0][1]).toMatchObject({ force: false, running: true });
  });

  it("carries the running fact the panel is rendering, not one it recomputes", async () => {
    render(
      <Flyout
        inventory={inventory}
        selectedAsset={selected as never}
        mcpProcesses={[
          {
            registration_key: "/Users/x/.claude.json:spades-audio",
            pid: 4242,
            command_line: "node /Applications/Spades Audio.app/index.js",
            spawning_host: "Claude Code",
          },
        ]}
        linkedProjects={[]}
        onRefresh={() => {}}
      />
    );

    await waitFor(() => expect(probeCalls()).toHaveLength(1));
    expect(probeCalls()[0][1]).toMatchObject({ force: false, running: true });
    // The badge and the spawn decision come from one fact. If they ever
    // disagree, the panel is claiming one thing and doing another.
    expect(screen.getByText(/running · pid 4242/)).toBeTruthy();
  });

  it("explains itself rather than showing an empty list when the backend declines", async () => {
    render(
      <Flyout
        inventory={inventory}
        selectedAsset={selected as never}
        mcpProcesses={[
          {
            registration_key: "/Users/x/.claude.json:spades-audio",
            pid: 4242,
            command_line: "node",
            spawning_host: "Claude Code",
          },
        ]}
        linkedProjects={[]}
        onRefresh={() => {}}
      />
    );

    await waitFor(() => expect(screen.getByText(/already running/i)).toBeTruthy());
    expect(screen.getByText(/left it alone/i)).toBeTruthy();
  });

  it("sets force when the user asks again, which is the whole point of the control", async () => {
    invoke.mockImplementation((cmd: string) => {
      if (cmd === "mcp_cached_probe") {
        return Promise.resolve({
          result: { capabilities: [], tools: [{ name: "get_system_volume" }] },
          verifiedAt: 1_700_000_000_000,
          fromCache: true,
        });
      }
      return Promise.resolve(null);
    });

    render(
      <Flyout
        inventory={inventory}
        selectedAsset={selected as never}
        mcpProcesses={[]}
        linkedProjects={[]}
        onRefresh={() => {}}
      />
    );

    await waitFor(() => expect(screen.getByText("get_system_volume")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));

    await waitFor(() => expect(probeCalls()).toHaveLength(2));
    expect(probeCalls()[1][1]).toMatchObject({ force: true });
  });

  it("dates a cached answer from when it was learned, not from when it was read back", async () => {
    // Three days old. Stamping Date.now() here — which is what the panel did
    // before there was a cache to read — would have rendered it as
    // "verified 0s ago" every time the panel opened.
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    invoke.mockImplementation((cmd: string) => {
      if (cmd === "mcp_cached_probe") {
        return Promise.resolve({
          result: { capabilities: [], tools: [{ name: "get_system_volume" }] },
          verifiedAt: threeDaysAgo,
          fromCache: true,
        });
      }
      return Promise.resolve(null);
    });

    render(
      <Flyout
        inventory={inventory}
        selectedAsset={selected as never}
        mcpProcesses={[]}
        linkedProjects={[]}
        onRefresh={() => {}}
      />
    );

    await waitFor(() => expect(screen.getByText(/verified 3d ago/)).toBeTruthy());
  });
});
