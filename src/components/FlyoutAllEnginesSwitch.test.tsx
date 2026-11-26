// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import Flyout from "./Flyout";
import SwitchNotice from "./SwitchNotice";
import { Inventory } from "../App";
import { useMcpSwitch } from "../hooks/useMcpSwitch";
import type { ContextItem, EngineContext, SwitchReply } from "../types/engineContext";

/**
 * The switch in an MCP server's inspector header that covers every engine
 * (docs/plans/2026-11-25-decisions-round-5.md, -round-6.md), joined up: what
 * it reads from App's one copy of the contexts, what a click sends, and the
 * Undo that puts every engine back.
 */

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (cmd: string, args?: unknown) => invoke(cmd, args) }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(), revealItemInDir: vi.fn() }));

const tool = (id: string, config_path: string, agent: string) => ({
  id,
  name: "cua",
  command: "node",
  launch_display: "node /opt/cua/index.js",
  transport: "stdio",
  config_path,
  scope: { Global: { agent } },
  owning_agent: agent,
  drifted: false,
});

const CODEX_KEY = "/Users/x/.codex/config.toml:cua";
const CLAUDE_KEY = "/Users/x/.claude.json:cua";
const CURSOR_KEY = "/Users/x/.cursor/mcp.json:cua";

const inventory: Inventory = {
  agents: [],
  skills: [],
  tools: [
    tool(CODEX_KEY, "/Users/x/.codex/config.toml", "codex"),
    tool(CLAUDE_KEY, "/Users/x/.claude.json", "claude-code"),
    tool(CURSOR_KEY, "/Users/x/.cursor/mcp.json", "cursor"),
  ] as never,
  rules: [],
  subagents: [],
  project_scans: [],
};

const selected = { name: "cua", category: "Tools", path: "/Users/x/.codex/config.toml" };

const item = (over: Partial<ContextItem> & Pick<ContextItem, "key">): ContextItem =>
  ({
    name: "cua",
    tier: "user",
    config_path: "~/x",
    state: "on",
    read_only: null,
    estimated_tokens: null,
    tool_count: null,
    ...over,
  }) as ContextItem;

const context = (engine_id: string, engine_name: string, items: ContextItem[]): EngineContext => ({
  engine_id,
  engine_key: engine_id.replace(/-/g, "_"),
  engine_name,
  applies: null,
  switches_by_name: false,
  items,
  on_count: 0,
  off_count: 0,
  measured_on_count: 0,
  on_tokens_measured: 0,
});

const codex = (state: "on" | "off") =>
  context("codex", "Codex", [item({ key: CODEX_KEY, config_path: "~/.codex/config.toml", state })]);
const claude = (state: "on" | "off") =>
  context("claude-code", "Claude Code", [item({ key: CLAUDE_KEY, config_path: "~/.claude.json", state })]);
const cursor = context("cursor", "Cursor", [item({ key: CURSOR_KEY, read_only: "engine_not_confirmed" })]);

/** The backend: a switch or Undo flips that engine's item and replies with
 *  the new context and a fresh receipt. */
function backend(start: Record<string, "on" | "off">) {
  const state = { ...start };
  let n = 0;
  const ctxOf = (id: string) => (id === "codex" ? codex(state.codex) : claude(state["claude-code"]));
  invoke.mockImplementation((cmd: string, args: { engineId: string; enabled?: boolean }) => {
    if (cmd === "set_mcp_server_enabled") {
      state[args.engineId] = args.enabled ? "on" : "off";
    } else if (cmd === "undo_mcp_switch") {
      state[args.engineId] = state[args.engineId] === "on" ? "off" : "on";
    } else if (cmd === "mcp_cached_probe") {
      return Promise.resolve({ result: null, verifiedAt: null, fromCache: false, declined: false });
    } else {
      return Promise.resolve(null);
    }
    n += 1;
    const reply: SwitchReply = { context: ctxOf(args.engineId), receipt_id: `r${n}`, undoable: true };
    return Promise.resolve(reply);
  });
}

/** App's part: the one switch state, the one copy of the contexts every reply
 *  replaces, and the notice with its Undo. */
function Harness({ contexts }: { contexts: EngineContext[] }) {
  const [held, setHeld] = useState(contexts);
  const record = (next: EngineContext | null) => {
    if (next) setHeld((prev) => prev.map((c) => (c.engine_id === next.engine_id ? next : c)));
  };
  const switcher = useMcpSwitch({ onChanged: () => {}, onContext: record });
  return (
    <>
      <Flyout
        onOpenConfig={() => {}}
        inventory={inventory}
        selectedAsset={selected as never}
        mcpProcesses={[]}
        linkedProjects={[]}
        onRefresh={() => {}}
        switcher={switcher}
        engineContexts={held}
        onEngineContext={record}
      />
      <SwitchNotice notice={switcher.notice} onUndo={() => void switcher.undo().then(record)} onDismiss={switcher.dismiss} />
    </>
  );
}

const header = () => screen.getByTestId("inspector-header");
// Off everywhere, the switch says it turns cua on (Karthik, 2026-11-26).
const headerSwitch = () => within(header()).getByRole("button", { name: /^Switch cua (off|on) in every engine$/ });
const setCalls = () => invoke.mock.calls.filter(([c]) => c === "set_mcp_server_enabled").map(([, a]) => a);

beforeEach(() => {
  invoke.mockReset();
});
afterEach(cleanup);

describe("Flyout — the switch for every engine in the server's header", () => {
  it("reads On when every switchable registration is on", () => {
    backend({ codex: "on", "claude-code": "on" });
    render(<Harness contexts={[codex("on"), claude("on"), cursor]} />);
    expect(headerSwitch().getAttribute("aria-pressed")).toBe("true");
    expect(within(header()).getByText("On")).toBeTruthy();
  });

  it("reads Off when all are off", () => {
    backend({ codex: "off", "claude-code": "off" });
    render(<Harness contexts={[codex("off"), claude("off"), cursor]} />);
    expect(headerSwitch().getAttribute("aria-pressed")).toBe("false");
    expect(within(header()).getByText("Off")).toBeTruthy();
    expect(headerSwitch().getAttribute("aria-label")).toBe("Switch cua on in every engine");
  });

  it("reads On in some when they disagree, and says it is mixed", () => {
    backend({ codex: "on", "claude-code": "off" });
    render(<Harness contexts={[codex("on"), claude("off"), cursor]} />);
    expect(headerSwitch().getAttribute("aria-pressed")).toBe("mixed");
    expect(within(header()).getByText("On in some")).toBeTruthy();
  });

  it("draws no switch when nothing of the server can be switched", () => {
    backend({});
    render(<Harness contexts={[cursor]} />);
    expect(within(header()).queryByRole("button", { name: /in every engine/ })).toBeNull();
    expect(within(header()).queryByTestId("layer-switch")).toBeNull();
    expect(within(header()).queryByText(/^(On|Off|On in some)$/)).toBeNull();
  });

  it("draws no switch before any context has arrived", () => {
    backend({});
    render(<Harness contexts={[]} />);
    expect(within(header()).queryByRole("button", { name: /in every engine/ })).toBeNull();
  });

  it("On in some: a click switches off only the ones that are on, and names who is left on", async () => {
    backend({ codex: "on", "claude-code": "off" });
    render(<Harness contexts={[codex("on"), claude("off"), cursor]} />);
    fireEvent.click(headerSwitch());
    await screen.findByText("cua is off for Codex. Still on for Cursor. Hanger can't switch those yet.");
    expect(setCalls()).toEqual([{ engineId: "codex", key: CODEX_KEY, enabled: false }]);
    await waitFor(() => expect(within(header()).getByText("Off")).toBeTruthy());
  });

  it("On: a click switches every engine off, in context order, one at a time", async () => {
    backend({ codex: "on", "claude-code": "on" });
    render(<Harness contexts={[codex("on"), claude("on"), cursor]} />);
    fireEvent.click(headerSwitch());
    await screen.findByText(
      "cua is off for Codex and Claude Code. Still on for Cursor. Hanger can't switch those yet."
    );
    expect(setCalls()).toEqual([
      { engineId: "codex", key: CODEX_KEY, enabled: false },
      { engineId: "claude-code", key: CLAUDE_KEY, enabled: false },
    ]);
  });

  it("Off: a click switches every one back on", async () => {
    backend({ codex: "off", "claude-code": "off" });
    render(<Harness contexts={[codex("off"), claude("off"), cursor]} />);
    fireEvent.click(headerSwitch());
    await screen.findByText("cua is back on for Codex and Claude Code.");
    expect(setCalls().map((a) => (a as { enabled: boolean }).enabled)).toEqual([true, true]);
    await waitFor(() => expect(within(header()).getByText("On")).toBeTruthy());
  });

  it("is disabled while the group runs", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    backend({ codex: "on", "claude-code": "on" });
    const answer = invoke.getMockImplementation()!;
    invoke.mockImplementation(async (cmd: string, args: never) => {
      if (cmd === "set_mcp_server_enabled") await gate;
      return answer(cmd, args);
    });
    render(<Harness contexts={[codex("on"), claude("on"), cursor]} />);
    fireEvent.click(headerSwitch());
    await waitFor(() => expect((headerSwitch() as HTMLButtonElement).disabled).toBe(true));
    release();
    await waitFor(() => expect((headerSwitch() as HTMLButtonElement).disabled).toBe(false));
  });

  it("one Undo puts every engine back, last first", async () => {
    backend({ codex: "on", "claude-code": "on" });
    render(<Harness contexts={[codex("on"), claude("on"), cursor]} />);
    fireEvent.click(headerSwitch());
    await screen.findByText(/^cua is off for Codex and Claude Code\./);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await screen.findByText("cua is back on for Codex and Claude Code.");
    const undos = invoke.mock.calls.filter(([c]) => c === "undo_mcp_switch").map(([, a]) => a);
    expect(undos).toEqual([
      { engineId: "claude-code", receiptId: "r2" },
      { engineId: "codex", receiptId: "r1" },
    ]);
    await waitFor(() => expect(within(header()).getByText("On")).toBeTruthy());
  });
});

// Karthik, 2026-11-26 (Agentation): a remote server's full URL chip sat in the
// title row, could not shrink, squeezed the name to nothing and pushed the
// switch out of the header. The chip now has its own row under the name, cut
// short with an ellipsis, and the full transport shows on hover.
describe("Flyout — the server header keeps its name and switch beside a long transport", () => {
  it("draws the transport on its own row, truncating, with the name and switch on the row above", () => {
    backend({ codex: "on", "claude-code": "on" });
    render(<Harness contexts={[codex("on"), claude("on"), cursor]} />);
    const title = within(header()).getByRole("heading", { level: 2 });
    const titleRow = title.parentElement!;
    const chip = within(header()).getByTestId("inspector-transport");
    expect(titleRow.contains(chip)).toBe(false);
    expect(titleRow.contains(headerSwitch())).toBe(true);
    expect(chip.className).toMatch(/\btruncate\b/);
    expect(title.className).toMatch(/\bmin-w-0\b/);
  });

  it("shows the full transport on hover", async () => {
    backend({ codex: "on", "claude-code": "on" });
    render(<Harness contexts={[codex("on"), claude("on"), cursor]} />);
    fireEvent.pointerEnter(within(header()).getByTestId("inspector-transport"));
    expect((await screen.findByTestId("tooltip")).textContent).toBe("stdio");
  });
});
