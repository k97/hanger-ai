// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act, within } from "@testing-library/react";
import EnginesPane from "./EnginesPane";
import SwitchNotice from "./SwitchNotice";
import { useMcpSwitch } from "../hooks/useMcpSwitch";
import type { ContextItem, EngineContext, SwitchReply } from "../types/engineContext";

/**
 * One engine's Context: what it loads, what that costs, and a switch for each
 * server Hanger can switch (Task A6 of
 * docs/plans/2026-11-25-context-control-finish.md).
 *
 * Every fixture is a shape `mcp::switch::context::build` really produces
 * (docs/ipc.md entries 15 and 16): a read-only item's state comes from the
 * engine's own mechanism, a kept server is a `stash:` key in no file, and the
 * budget counts a launch the engine declares twice once.
 */

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (cmd: string, args?: unknown) => invoke(cmd, args) }));

const CODEX_FILE = "~/.codex/config.toml";

const item = (over: Partial<ContextItem> & Pick<ContextItem, "key" | "name">): ContextItem =>
  ({
    tier: "global",
    config_path: CODEX_FILE,
    state: "on",
    read_only: null,
    estimated_tokens: null,
    tool_count: null,
    ...over,
  }) as ContextItem;

/** Two On servers that share one launch, each estimated at 100, and one Off
 *  server nobody has measured. The backend counts the shared launch once, so
 *  the budget is 100, not 200. */
const CODEX: EngineContext = {
  engine_id: "codex",
  engine_name: "Engine C",
  applies: null,
  switches_by_name: false,
  items: [
    item({ key: "/Users/demo/.codex/config.toml:alpha", name: "alpha", estimated_tokens: 100, tool_count: 4 }),
    item({ key: "/Users/demo/.codex/config.toml:alpha-twin", name: "alpha-twin", estimated_tokens: 100, tool_count: 4 }),
    item({ key: "/Users/demo/.codex/config.toml:beta", name: "beta", state: "off" }),
  ],
  on_count: 2,
  off_count: 1,
  measured_on_count: 2,
  on_tokens_measured: 100,
};

/** CODEX after alpha is switched off. */
const CODEX_ALPHA_OFF: EngineContext = {
  ...CODEX,
  items: [{ ...CODEX.items[0], state: "off" } as ContextItem, CODEX.items[1], CODEX.items[2]],
  on_count: 1,
  off_count: 2,
  measured_on_count: 1,
  on_tokens_measured: 100,
};

/** CODEX after Measure all: the same launch now answers with more tools. */
const CODEX_MEASURED: EngineContext = {
  ...CODEX,
  items: [
    { ...CODEX.items[0], estimated_tokens: 250, tool_count: 9 } as ContextItem,
    { ...CODEX.items[1], estimated_tokens: 250, tool_count: 9 } as ContextItem,
    CODEX.items[2],
  ],
  on_tokens_measured: 250,
};

/** A user-scope server, one Hanger is keeping while it is off, and a project
 *  server the engine cannot be switched for per project yet (always On: the
 *  engine's own command is its only mechanism). */
const CLAUDE: EngineContext = {
  engine_id: "claude-code",
  engine_name: "Engine K",
  applies: null,
  switches_by_name: false,
  items: [
    item({ key: "/Users/demo/.claude.json:gamma", name: "gamma", tier: "user", config_path: "~/.claude.json" }),
    item({
      key: "/Users/demo/work/app/.mcp.json:delta",
      name: "delta",
      tier: "project",
      config_path: "~/work/app/.mcp.json",
      read_only: "per_project_comes_next",
    }),
    item({ key: "stash:00000000-0000-4000-8000-000000000001", name: "kept-one", tier: "user", config_path: "", state: "off" }),
  ],
  on_count: 2,
  off_count: 1,
  measured_on_count: 0,
  on_tokens_measured: 0,
};

/** An engine switched by name: a global server Hanger can switch, and a
 *  project server its state file has off, which Hanger leaves alone. */
const GEMINI: EngineContext = {
  engine_id: "gemini",
  engine_name: "Engine G",
  applies: null,
  switches_by_name: true,
  items: [
    item({ key: "/Users/demo/.gemini/settings.json:eps", name: "eps", config_path: "~/.gemini/settings.json" }),
    item({
      key: "/Users/demo/work/app/.gemini/settings.json:zeta",
      name: "zeta",
      tier: "project",
      config_path: "~/work/app/.gemini/settings.json",
      state: "off",
      read_only: "switches_by_name_everywhere",
    }),
  ],
  on_count: 1,
  off_count: 1,
  measured_on_count: 0,
  on_tokens_measured: 0,
};

const EMPTY: EngineContext = {
  ...CODEX,
  items: [],
  on_count: 0,
  off_count: 0,
  measured_on_count: 0,
  on_tokens_measured: 0,
};

const byEngine: Record<string, EngineContext> = { codex: CODEX, "claude-code": CLAUDE, gemini: GEMINI };

const onChanged = vi.fn();

function Harness(props: { engineId: string | null; scannedAt?: Date | null; refreshNonce?: number }) {
  const switcher = useMcpSwitch({ onChanged });
  return (
    <>
      <EnginesPane
        engineId={props.engineId}
        scannedAt={props.scannedAt === undefined ? new Date() : props.scannedAt}
        switcher={switcher}
        refreshNonce={props.refreshNonce ?? 0}
      />
      <SwitchNotice notice={switcher.notice} onUndo={() => void switcher.undo()} onDismiss={switcher.dismiss} />
    </>
  );
}

const calls = (cmd: string) => invoke.mock.calls.filter((c) => c[0] === cmd);

beforeEach(() => {
  invoke.mockReset();
  onChanged.mockReset();
  invoke.mockImplementation(async (cmd: string, args?: any) => {
    if (cmd === "get_engine_context") return byEngine[args.engineId];
    return null;
  });
});
afterEach(cleanup);

describe("EnginesPane: pending, empty and the budget", () => {
  it("claims nothing while the first reply is pending: no budget, no empty line", async () => {
    invoke.mockImplementation(() => new Promise(() => {}));
    render(<Harness engineId="codex" />);
    await waitFor(() => expect(calls("get_engine_context")).toHaveLength(1));
    expect(screen.queryByText(/tokens of tool descriptions/)).toBeNull();
    expect(screen.queryByText(/declares no MCP servers/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Measure all" })).toBeNull();
  });

  it("renders the budget exactly as the backend counted it: a launch declared twice counts once", async () => {
    render(<Harness engineId="codex" />);
    expect(await screen.findByText("≈ 100 tokens of tool descriptions")).toBeTruthy();
    expect(screen.getByText("2 of 2 servers measured · 1 off")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Engine C" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Context" })).toBeTruthy();
    expect(
      screen.getByText("Starts each server that's on and has no recent answer, and reads its tool list.")
    ).toBeTruthy();
    expect(calls("get_engine_context")[0][1]).toEqual({ engineId: "codex" });
  });

  it("lists every item in the order given, with its tier and file, its cost, or Not measured", async () => {
    render(<Harness engineId="codex" />);
    await screen.findByText("≈ 100 tokens of tool descriptions");
    const rows = screen.getAllByTestId("engine-item");
    expect(rows.map((r) => within(r).getByTestId("engine-item-name").textContent)).toEqual([
      "alpha",
      "alpha-twin",
      "beta",
    ]);
    expect(within(rows[0]).getByText(`global · ${CODEX_FILE}`)).toBeTruthy();
    expect(within(rows[0]).getByText("≈ 100 tokens")).toBeTruthy();
    expect(within(rows[1]).getByText("≈ 100 tokens")).toBeTruthy();
    expect(within(rows[2]).getByText("Not measured")).toBeTruthy();
  });

  it("says the engine declares no servers only after its reply lands and a scan has finished", async () => {
    invoke.mockImplementation(async () => EMPTY);
    const { rerender } = render(<Harness engineId="codex" scannedAt={null} />);
    await waitFor(() => expect(calls("get_engine_context")).toHaveLength(1));
    await act(async () => {});
    expect(screen.queryByText("Engine C declares no MCP servers.")).toBeNull();

    rerender(<Harness engineId="codex" scannedAt={new Date()} />);
    expect(await screen.findByText("Engine C declares no MCP servers.")).toBeTruthy();
    expect(screen.queryByText(/tokens of tool descriptions/)).toBeNull();
  });
});

describe("EnginesPane: switches and read-only servers", () => {
  it("gives a switchable server a button named by the server, pressed by its state", async () => {
    render(<Harness engineId="codex" />);
    const alpha = await screen.findByRole("button", { name: "alpha" });
    expect(alpha.getAttribute("aria-pressed")).toBe("true");
    expect(within(alpha).getByTestId("layer-switch")).toBeTruthy();
    expect(screen.getByRole("button", { name: "beta" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("shows a read-only server's state and its reason, and no switch (On)", async () => {
    render(<Harness engineId="claude-code" />);
    await screen.findByRole("button", { name: "gamma" });
    expect(screen.queryByRole("button", { name: "delta" })).toBeNull();
    const delta = screen.getAllByTestId("engine-item")[1];
    expect(within(delta).getByText("On")).toBeTruthy();
    expect(within(delta).queryByTestId("layer-switch")).toBeNull();
    expect(within(delta).getByText("Hanger can't switch servers declared in ~/work/app/.mcp.json yet.")).toBeTruthy();
  });

  it("shows a read-only server's state and its reason, and no switch (Off)", async () => {
    render(<Harness engineId="gemini" />);
    await screen.findByRole("button", { name: "eps" });
    expect(screen.queryByRole("button", { name: "zeta" })).toBeNull();
    const zeta = screen.getAllByTestId("engine-item")[1];
    expect(within(zeta).getByText("Off")).toBeTruthy();
    expect(
      within(zeta).getByText(
        "Declared in a project. Engine G's switch covers every project, so Hanger leaves this one alone."
      )
    ).toBeTruthy();
  });

  it("switches a server off through the hook, and the row flips from the reply's context", async () => {
    invoke.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === "get_engine_context") return byEngine[args.engineId];
      if (cmd === "set_mcp_server_enabled") {
        const reply: SwitchReply = { context: CODEX_ALPHA_OFF, receipt_id: "file:r1", undoable: true };
        return reply;
      }
      return null;
    });
    render(<Harness engineId="codex" />);
    const alpha = await screen.findByRole("button", { name: "alpha" });
    fireEvent.click(alpha);
    await waitFor(() => expect(screen.getByRole("button", { name: "alpha" }).getAttribute("aria-pressed")).toBe("false"));
    expect(calls("set_mcp_server_enabled")).toHaveLength(1);
    expect(calls("set_mcp_server_enabled")[0][1]).toEqual({
      engineId: "codex",
      key: "/Users/demo/.codex/config.toml:alpha",
      enabled: false,
    });
    expect(screen.getByRole("status").textContent).toContain("alpha is off for Engine C.");
    expect(screen.getByText("1 of 1 servers measured · 2 off")).toBeTruthy();
  });

  it("switches an Off server on", async () => {
    invoke.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === "get_engine_context") return byEngine[args.engineId];
      if (cmd === "set_mcp_server_enabled") return { context: CODEX, receipt_id: "file:r2", undoable: true };
      return null;
    });
    render(<Harness engineId="codex" />);
    fireEvent.click(await screen.findByRole("button", { name: "beta" }));
    await waitFor(() => expect(calls("set_mcp_server_enabled")).toHaveLength(1));
    expect(calls("set_mcp_server_enabled")[0][1]).toEqual({
      engineId: "codex",
      key: "/Users/demo/.codex/config.toml:beta",
      enabled: true,
    });
  });

  it("a rejection shows the failure line in the notice and the row does not flip", async () => {
    invoke.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === "get_engine_context") return byEngine[args.engineId];
      if (cmd === "set_mcp_server_enabled") throw "changed_since_read";
      return null;
    });
    render(<Harness engineId="codex" />);
    fireEvent.click(await screen.findByRole("button", { name: "alpha" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        `${CODEX_FILE} changed while Hanger was working. Nothing was written. Try again.`
      )
    );
    expect(screen.getByRole("button", { name: "alpha" }).getAttribute("aria-pressed")).toBe("true");
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe("EnginesPane: the lines that explain a mechanism", () => {
  it("says a kept server is kept, only on the stash: item", async () => {
    render(<Harness engineId="claude-code" />);
    await screen.findByRole("button", { name: "gamma" });
    const line = "Removed from Engine K. Hanger keeps its configuration and puts it back when you switch it on.";
    expect(screen.getAllByText(line)).toHaveLength(1);
    const kept = screen.getAllByTestId("engine-item")[2];
    expect(within(kept).getByText(line)).toBeTruthy();
    // A kept server is in no file: just its tier.
    expect(within(kept).getByText("user")).toBeTruthy();
    expect(screen.queryByText(/switches by name/)).toBeNull();
  });

  it("puts the by-name line under every item, only when the engine switches by name", async () => {
    render(<Harness engineId="gemini" />);
    await screen.findByRole("button", { name: "eps" });
    const [eps, zeta] = screen.getAllByTestId("engine-item");
    expect(within(eps).getByText("Engine G switches by name, so this covers every server named eps.")).toBeTruthy();
    expect(within(zeta).getByText("Engine G switches by name, so this covers every server named zeta.")).toBeTruthy();
    expect(screen.queryByText(/Removed from/)).toBeNull();
  });
});

describe("EnginesPane: Measure all and refetching", () => {
  it("Measure all disables itself while it runs, asks the backend, and replaces the figures", async () => {
    let finish: (c: EngineContext) => void = () => {};
    invoke.mockImplementation((cmd: string, args?: any) => {
      if (cmd === "get_engine_context") return Promise.resolve(byEngine[args.engineId]);
      if (cmd === "measure_engine_context") return new Promise((resolve) => (finish = resolve));
      return Promise.resolve(null);
    });
    render(<Harness engineId="codex" />);
    fireEvent.click(await screen.findByRole("button", { name: "Measure all" }));
    const running = await screen.findByRole("button", { name: "Measuring…" });
    expect((running as HTMLButtonElement).disabled).toBe(true);
    expect(calls("measure_engine_context")).toHaveLength(1);
    expect(calls("measure_engine_context")[0][1]).toEqual({ engineId: "codex" });

    await act(async () => finish(CODEX_MEASURED));
    expect(await screen.findByText("≈ 250 tokens of tool descriptions")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Measure all" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("asks again when the engine changes and when App bumps the refresh nonce", async () => {
    const { rerender } = render(<Harness engineId="codex" refreshNonce={0} />);
    await screen.findByRole("heading", { level: 2, name: "Engine C" });
    expect(calls("get_engine_context")).toHaveLength(1);

    rerender(<Harness engineId="gemini" refreshNonce={0} />);
    await screen.findByRole("heading", { level: 2, name: "Engine G" });
    expect(screen.queryByRole("heading", { level: 2, name: "Engine C" })).toBeNull();
    expect(calls("get_engine_context")).toHaveLength(2);
    expect(calls("get_engine_context")[1][1]).toEqual({ engineId: "gemini" });

    rerender(<Harness engineId="gemini" refreshNonce={1} />);
    await waitFor(() => expect(calls("get_engine_context")).toHaveLength(3));
  });

  it("drops a reply for an engine that is no longer selected", async () => {
    let finishCodex: (c: EngineContext) => void = () => {};
    invoke.mockImplementation((cmd: string, args?: any) => {
      if (cmd === "get_engine_context" && args.engineId === "codex") return new Promise((r) => (finishCodex = r));
      if (cmd === "get_engine_context") return Promise.resolve(byEngine[args.engineId]);
      return Promise.resolve(null);
    });
    const { rerender } = render(<Harness engineId="codex" />);
    await waitFor(() => expect(calls("get_engine_context")).toHaveLength(1));
    rerender(<Harness engineId="gemini" />);
    await screen.findByRole("heading", { level: 2, name: "Engine G" });
    await act(async () => finishCodex(CODEX));
    expect(screen.queryByRole("heading", { level: 2, name: "Engine C" })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Engine G" })).toBeTruthy();
  });
});
