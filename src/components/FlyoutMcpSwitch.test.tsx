// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within, act } from "@testing-library/react";
import Flyout from "./Flyout";
import { Inventory } from "../App";
import { useMcpSwitch } from "../hooks/useMcpSwitch";
import type { ContextItem, EngineContext, SwitchReply } from "../types/engineContext";

/**
 * The MCP server inspector's switches, joined up: which engines the panel
 * asks, how a registration finds its item in an engine's reply, and what a
 * click sends. `McpServerDetail.test.tsx` covers how a row draws what it is
 * handed; this covers what `Flyout` hands it.
 */

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (cmd: string, args?: unknown) => invoke(cmd, args) }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(), revealItemInDir: vi.fn() }));

const CLAUDE_JSON = "/Users/x/.claude.json:spades-audio";
const MCP_JSON = "/Users/x/.mcp.json:spades-audio";
const CODEX = "/Users/x/.codex/config.toml:spades-audio";

/** One server, declared twice by one engine (in two files whose tiers its
 *  engine names differently), once by another, and once in a repository. */
const inventory: Inventory = {
  agents: [],
  skills: [],
  tools: [
    {
      id: CLAUDE_JSON,
      name: "spades-audio",
      command: "node",
      launch_display: "node /opt/spades/index.js",
      transport: "stdio",
      config_path: "/Users/x/.claude.json",
      scope: { Global: { agent: "claude-code" } },
      owning_agent: "claude-code",
      drifted: false,
    },
    {
      id: MCP_JSON,
      name: "spades-audio",
      command: "node",
      launch_display: "node /opt/spades/index.js",
      transport: "stdio",
      config_path: "/Users/x/.mcp.json",
      scope: { Global: { agent: "claude-code" } },
      owning_agent: "claude-code",
      drifted: false,
    },
    {
      id: CODEX,
      name: "spades-audio",
      command: "node",
      launch_display: "node /opt/spades/index.js",
      transport: "stdio",
      config_path: "/Users/x/.codex/config.toml",
      scope: { Global: { agent: "codex" } },
      owning_agent: "codex",
      drifted: false,
    },
    // As the scanner's project sweep emits one: the scope's agent is the
    // engine's display name there, not an id. (No tool is emitted with a
    // Local scope; the machine pass drops that tier.)
    {
      id: "/Users/x/repo/.mcp.json:spades-audio",
      name: "spades-audio",
      command: "node",
      launch_display: "node /opt/spades/index.js",
      transport: "stdio",
      config_path: "/Users/x/repo/.mcp.json",
      scope: { Project: { agent: "Claude Code", root: "/Users/x/repo" } },
      owning_agent: "Claude Code",
      drifted: false,
    },
  ] as never,
  rules: [],
  subagents: [],
  project_scans: [],
};

const selected = { name: "spades-audio", category: "Tools", path: "/Users/x/.claude.json" };

// Items shaped as `get_engine_context` sends them (docs/ipc.md entry 15):
// Claude Code calls `~/.claude.json` its user tier and `~/.mcp.json` global;
// the panel calls both "global".
const item = (over: Partial<ContextItem> & Pick<ContextItem, "key" | "tier" | "config_path">): ContextItem => ({
  name: "spades-audio",
  state: "on",
  read_only: null,
  estimated_tokens: null,
  tool_count: null,
  ...over,
} as ContextItem);

const context = (engine_id: string, engine_name: string, items: ContextItem[]): EngineContext => ({
  engine_id,
  engine_key: engine_id.replace(/-/g, "_"),
  engine_name,
  applies: null,
  switches_by_name: false,
  items,
  on_count: 1,
  off_count: 1,
  measured_on_count: 0,
  on_tokens_measured: 0,
});

const claudeContext = (userState: "on" | "off") =>
  context("claude-code", "Claude Code", [
    item({ key: CLAUDE_JSON, tier: "user", config_path: "~/.claude.json", state: userState }),
    item({ key: MCP_JSON, tier: "global", config_path: "~/.mcp.json", state: "off" }),
  ]);
const codexContext = context("codex", "Codex", [
  item({ key: CODEX, tier: "global", config_path: "~/.codex/config.toml", read_only: "file_unparseable" }),
]);

const engineCalls = () => invoke.mock.calls.filter(([cmd]) => cmd === "get_engine_context");
const callsFor = (engineId: string) => engineCalls().filter(([, a]) => (a as { engineId: string }).engineId === engineId);

let answerContext: (engineId: string) => Promise<EngineContext | null>;

beforeEach(() => {
  invoke.mockReset();
  answerContext = (engineId) =>
    Promise.resolve(engineId === "claude-code" ? claudeContext("on") : engineId === "codex" ? codexContext : null);
  invoke.mockImplementation((cmd: string, args?: { engineId: string }) => {
    if (cmd === "get_engine_context") return answerContext(args!.engineId);
    if (cmd === "set_mcp_server_enabled") {
      const reply: SwitchReply = { context: claudeContext("off"), receipt_id: "r1", undoable: true };
      return Promise.resolve(reply);
    }
    if (cmd === "mcp_cached_probe") {
      return Promise.resolve({ result: null, verifiedAt: null, fromCache: false, declined: false });
    }
    return Promise.resolve(null);
  });
});

afterEach(cleanup);

/** App's part: the one switch state, and the nonce a scan bumps. */
function Harness({ refreshNonce = 0 }: { refreshNonce?: number }) {
  const switcher = useMcpSwitch({ onChanged: () => {} });
  return (
    <Flyout
      onOpenConfig={() => {}}
      inventory={inventory}
      selectedAsset={selected as never}
      mcpProcesses={[]}
      linkedProjects={[]}
      onRefresh={() => {}}
      switcher={switcher}
      refreshNonce={refreshNonce}
    />
  );
}

const openDetails = () => fireEvent.click(screen.getByRole("tab", { name: "Details" }));
const rows = () => screen.getAllByTestId("registration-row");

describe("Flyout — switching an MCP server from its inspector", () => {
  it("asks each engine once, even when it declares the server twice, and asks no engine for a repository row", async () => {
    render(<Harness />);
    openDetails();
    await screen.findByRole("button", { name: "Claude Code, /Users/x/.claude.json" });
    expect(callsFor("claude-code")).toHaveLength(1);
    expect(callsFor("codex")).toHaveLength(1);
    expect(engineCalls()).toHaveLength(2);
  });

  it("claims no state on any row before that engine's first reply lands", async () => {
    let release: (c: EngineContext) => void = () => {};
    answerContext = (engineId) =>
      engineId === "claude-code" ? new Promise((r) => (release = r)) : new Promise(() => {});
    render(<Harness />);
    openDetails();
    await waitFor(() => expect(engineCalls()).toHaveLength(2));
    for (const row of rows()) {
      expect(within(row).queryByTestId("layer-switch")).toBeNull();
      expect(within(row).queryByText(/^(On|Off)$/)).toBeNull();
    }

    await act(async () => release(claudeContext("on")));
    expect(within(rows()[0]).getByTestId("layer-switch")).toBeTruthy();
    // Codex has not answered: its row still claims nothing.
    expect(within(rows()[2]).queryByText(/^(On|Off)$/)).toBeNull();
  });

  it("matches each row to its own item by key, not by tier", async () => {
    render(<Harness />);
    openDetails();
    const user = await screen.findByRole("button", { name: "Claude Code, /Users/x/.claude.json" });
    const global = screen.getByRole("button", { name: "Claude Code, /Users/x/.mcp.json" });
    expect(user.getAttribute("aria-pressed")).toBe("true");
    expect(global.getAttribute("aria-pressed")).toBe("false");
    expect(within(rows()[0]).getByRole("button", { name: /^Claude Code, / })).toBe(user);
  });

  it("a click asks that row's engine with that row's key, and the row follows the reply", async () => {
    render(<Harness />);
    openDetails();
    const sw = await screen.findByRole("button", { name: "Claude Code, /Users/x/.claude.json" });
    fireEvent.click(sw);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Claude Code, /Users/x/.claude.json" }).getAttribute("aria-pressed")
      ).toBe("false")
    );
    const switches = invoke.mock.calls.filter(([cmd]) => cmd === "set_mcp_server_enabled");
    expect(switches).toEqual([["set_mcp_server_enabled", { engineId: "claude-code", key: CLAUDE_JSON, enabled: false }]]);
  });

  it("a read-only item shows its state and why, and a repository row shows neither", async () => {
    render(<Harness />);
    openDetails();
    const codexRow = rows()[2];
    await within(codexRow).findByText("On");
    expect(within(codexRow).queryByRole("button", { name: /^Codex, / })).toBeNull();
    expect(
      within(codexRow).getByText("Hanger can't read ~/.codex/config.toml, so it can't switch this server.")
    ).toBeTruthy();

    const projectRow = rows()[3];
    expect(within(projectRow).queryByTestId("layer-switch")).toBeNull();
    expect(within(projectRow).queryByText(/^(On|Off)$/)).toBeNull();
  });

  it("asks again after a scan", async () => {
    const { rerender } = render(<Harness refreshNonce={0} />);
    openDetails();
    await waitFor(() => expect(engineCalls()).toHaveLength(2));
    rerender(<Harness refreshNonce={1} />);
    await waitFor(() => expect(engineCalls()).toHaveLength(4));
    expect(callsFor("claude-code")).toHaveLength(2);
  });
});
