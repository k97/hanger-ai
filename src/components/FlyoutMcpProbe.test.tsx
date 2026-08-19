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
      return Promise.resolve({ result: null, verifiedAt: null, fromCache: false, declined: false });
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

  it("asks with running: false when it has no process list, and lets the backend confirm", async () => {
    // `mcpProcesses` is null until `get_mcp_processes` answers. The panel used
    // to withhold here; it no longer needs to, because `cached_probe` checks
    // the live process table before spawning. What it must NOT do is claim
    // knowledge it does not have — `false` means "no evidence", and the
    // backend treats it as the direction that has to be confirmed.
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
    expect(probeCalls()[0][1]).toMatchObject({ force: false, running: false });
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

  it("explains itself when the backend declines, even though its own snapshot says nothing is running", async () => {
    // The provenance case, and the one a stale process list produces in the
    // real app: Hanger's snapshot shows nothing, the machine says the server
    // is up, and `cached_probe` declines. Driven from `reg.running` this block
    // would have said "Tools are only known by asking the server" — false, and
    // hiding the only thing worth saying.
    invoke.mockImplementation((cmd: string) => {
      if (cmd === "mcp_cached_probe") {
        return Promise.resolve({ result: null, verifiedAt: null, fromCache: false, declined: true });
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

    await waitFor(() => expect(screen.getByText(/already running/i)).toBeTruthy());
    expect(screen.getByText(/left it alone/i)).toBeTruthy();
    expect(screen.queryByText("Tools are only known by asking the server.")).toBeNull();
  });

  it("says nothing about declining when the backend did not decline", async () => {
    // A running badge on its own is not a decline. The default mock answers
    // `declined: false` with no result, which cannot happen in production but
    // is exactly the input that would expose the panel guessing.
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

    await waitFor(() => expect(probeCalls()).toHaveLength(1));
    expect(screen.queryByText(/already running/i)).toBeNull();
  });

  it("survives an answer it cannot read, instead of taking the inspector down with it", async () => {
    // A state updater is a closure React runs during a later render, outside
    // the try/catch around the invoke — so a field read inside one escapes the
    // error handling entirely. Reading `declined` there unmounted the whole
    // Flyout, and the symptom surfaced three files away as a row that would
    // not highlight (`inspector_avionics.test.tsx` case 10, whose mock answers
    // an unmodelled command with null). The panel must degrade to "no answer".
    invoke.mockImplementation((cmd: string) => {
      if (cmd === "mcp_cached_probe") return Promise.resolve(null);
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

    await waitFor(() => expect(probeCalls()).toHaveLength(1));
    // Still rendering: the registration list is the panel's own content, and
    // it is gone the moment the component throws.
    await waitFor(() => expect(screen.getByText("~/Users/x/.claude.json".slice(1))).toBeTruthy());
    expect(screen.queryByText(/already running/i)).toBeNull();
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
