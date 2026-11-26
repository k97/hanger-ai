// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { busyKeyOf, useMcpSwitch, type SwitchRequest } from "./useMcpSwitch";
import { failureLine } from "../utils/switchCopy";
import type { EngineContext, SwitchReply } from "../types/engineContext";

/**
 * One click that switches a server in every engine
 * (docs/plans/2026-11-25-decisions-round-5.md, -round-6.md): the requests go
 * one at a time, the notice names every engine switched, and one Undo puts
 * them all back, last first. The single switch is `useMcpSwitch.test.ts`'s.
 */

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (cmd: string, args?: unknown) => invoke(cmd, args) }));

const context = (engine_id: string, engine_name: string): EngineContext => ({
  engine_id,
  engine_key: engine_id.replace(/-/g, "_"),
  engine_name,
  applies: null,
  switches_by_name: false,
  items: [],
  on_count: 0,
  off_count: 0,
  measured_on_count: 0,
  on_tokens_measured: 0,
});

const CODEX = context("codex", "Codex");
const CLAUDE = context("claude-code", "Claude Code");
const GEMINI = context("gemini", "Gemini");
const BY_ID: Record<string, EngineContext> = { codex: CODEX, "claude-code": CLAUDE, gemini: GEMINI };

const req = (engineId: string, engineName: string, enabled = false): SwitchRequest => ({
  engineId,
  engineName,
  key: `${engineId}:cua`,
  serverName: "cua",
  file: `~/${engineId}`,
  enabled,
});

const OFF = [req("codex", "Codex"), req("claude-code", "Claude Code"), req("gemini", "Gemini")];

/** Each call answers with the engine's context and a receipt named after the
 *  engine and the call's number, unless `refuse` names that engine. */
function backend(refuse: Record<string, string> = {}) {
  let n = 0;
  invoke.mockImplementation((cmd: string, args: { engineId: string }) => {
    n += 1;
    const code = refuse[args.engineId];
    if (cmd === "set_mcp_server_enabled" && code) return Promise.reject(code);
    const reply: SwitchReply = { context: BY_ID[args.engineId], receipt_id: `${args.engineId}#${n}`, undoable: true };
    return Promise.resolve(reply);
  });
}

function setup() {
  const onChanged = vi.fn();
  const onContext = vi.fn();
  const hook = renderHook(() => useMcpSwitch({ onChanged, onContext }));
  return { onChanged, onContext, result: hook.result };
}

const calls = (cmd: string) => invoke.mock.calls.filter(([c]) => c === cmd).map(([, a]) => a);

describe("useMcpSwitch — every engine at once", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("sends one request per registration, one after another, in the order given", async () => {
    const order: string[] = [];
    let inFlight = 0;
    let most = 0;
    invoke.mockImplementation(async (_cmd: string, args: { engineId: string }) => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      order.push(args.engineId);
      await Promise.resolve();
      await Promise.resolve();
      inFlight -= 1;
      return { context: BY_ID[args.engineId], receipt_id: `${args.engineId}#1`, undoable: true };
    });
    const { result } = setup();
    await act(async () => {
      await result.current.switchAll({ serverName: "cua", requests: OFF, stillOn: [] });
    });
    expect(most).toBe(1);
    expect(order).toEqual(["codex", "claude-code", "gemini"]);
    expect(calls("set_mcp_server_enabled")).toEqual([
      { engineId: "codex", key: "codex:cua", enabled: false },
      { engineId: "claude-code", key: "claude-code:cua", enabled: false },
      { engineId: "gemini", key: "gemini:cua", enabled: false },
    ]);
  });

  it("names every engine switched, hands each reply's context on, and asks for one rescan", async () => {
    backend();
    const { result, onChanged, onContext } = setup();
    await act(async () => {
      await result.current.switchAll({ serverName: "cua", requests: OFF, stillOn: [] });
    });
    expect(result.current.notice).toMatchObject({
      kind: "done",
      line: "cua is off for Codex, Claude Code and Gemini.",
      undoable: true,
      pending: false,
    });
    expect(onContext.mock.calls.map(([c]) => c)).toEqual([CODEX, CLAUDE, GEMINI]);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("switching every one back on uses the back-on line", async () => {
    backend();
    const { result } = setup();
    await act(async () => {
      await result.current.switchAll({
        serverName: "cua",
        requests: OFF.map((r) => ({ ...r, enabled: true })),
        stillOn: ["Cursor"],
      });
    });
    expect(result.current.notice).toMatchObject({ kind: "done", line: "cua is back on for Codex, Claude Code and Gemini." });
  });

  it("adds the engines it could not switch after an off", async () => {
    backend();
    const { result } = setup();
    await act(async () => {
      await result.current.switchAll({ serverName: "cua", requests: OFF, stillOn: ["Cursor", "VS Code"] });
    });
    expect(result.current.notice).toMatchObject({
      kind: "done",
      line: "cua is off for Codex, Claude Code and Gemini. Still on for Cursor and VS Code. Hanger can't switch those yet.",
    });
  });

  it("an engine that refused gets today's refusal line, and the rest are still switched", async () => {
    backend({ "claude-code": "would_not_come_back" });
    const { result } = setup();
    await act(async () => {
      await result.current.switchAll({ serverName: "cua", requests: OFF, stillOn: ["Cursor"] });
    });
    expect(calls("set_mcp_server_enabled")).toHaveLength(3);
    expect(result.current.notice).toMatchObject({
      kind: "done",
      line:
        "cua is off for Codex and Gemini. Still on for Cursor. Hanger can't switch those yet. " +
        "Claude Code wouldn't give this server back unchanged, so Hanger left it on. Its own command drops settings it doesn't recognise.",
      undoable: true,
    });
  });

  it("when every switch fails, shows the failure copy and no Undo", async () => {
    backend({ codex: "cli_failed" });
    const { result, onChanged } = setup();
    await act(async () => {
      await result.current.switchAll({ serverName: "cua", requests: [OFF[0]], stillOn: ["Cursor"] });
    });
    expect(result.current.notice).toEqual({
      kind: "failed",
      line: failureLine("cli_failed", { engine: "Codex", server: "cua", file: "~/codex" }),
    });
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("holds every registration busy while the group runs", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    invoke.mockImplementation(async (_cmd: string, args: { engineId: string }) => {
      await gate;
      return { context: BY_ID[args.engineId], receipt_id: `${args.engineId}#1`, undoable: true };
    });
    const { result } = setup();
    let run!: Promise<void>;
    act(() => {
      run = result.current.switchAll({ serverName: "cua", requests: OFF, stillOn: [] });
    });
    for (const r of OFF) expect(result.current.busyKeys.has(busyKeyOf(r.engineId, r.key))).toBe(true);
    await act(async () => {
      release();
      await run;
    });
    expect(result.current.busyKeys.size).toBe(0);
  });

  it("one Undo puts back every engine, last switched first, with each receipt", async () => {
    backend();
    const { result, onChanged } = setup();
    await act(async () => {
      await result.current.switchAll({ serverName: "cua", requests: OFF, stillOn: ["Cursor"] });
    });
    await act(async () => {
      await result.current.undo();
    });
    expect(calls("undo_mcp_switch")).toEqual([
      { engineId: "gemini", receiptId: "gemini#3" },
      { engineId: "claude-code", receiptId: "claude-code#2" },
      { engineId: "codex", receiptId: "codex#1" },
    ]);
    expect(result.current.notice).toMatchObject({
      kind: "done",
      line: "cua is back on for Codex, Claude Code and Gemini.",
      undoable: true,
      pending: false,
    });
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it("an Undo of the Undo switches them all off again, in the order first switched", async () => {
    backend();
    const { result } = setup();
    await act(async () => {
      await result.current.switchAll({ serverName: "cua", requests: OFF, stillOn: [] });
    });
    await act(async () => {
      await result.current.undo();
    });
    invoke.mockClear();
    backend();
    await act(async () => {
      await result.current.undo();
    });
    expect(calls("undo_mcp_switch").map((a) => (a as { engineId: string }).engineId)).toEqual([
      "codex",
      "claude-code",
      "gemini",
    ]);
    expect(result.current.notice).toMatchObject({ line: "cua is off for Codex, Claude Code and Gemini." });
  });

  it("an Undo that fails part way says so and stops", async () => {
    backend();
    const { result } = setup();
    await act(async () => {
      await result.current.switchAll({ serverName: "cua", requests: OFF, stillOn: [] });
    });
    invoke.mockImplementation((_cmd: string, args: { engineId: string }) =>
      args.engineId === "claude-code"
        ? Promise.reject("not_undoable")
        : Promise.resolve({ context: BY_ID[args.engineId], receipt_id: "u", undoable: true })
    );
    await act(async () => {
      await result.current.undo();
    });
    expect(calls("undo_mcp_switch").map((a) => (a as { engineId: string }).engineId)).toEqual([
      "gemini",
      "claude-code",
    ]);
    expect(result.current.notice).toEqual({
      kind: "failed",
      line: "This can't be undone now. The file has changed since.",
    });
  });

  it("the group's Undo is pending while it runs", async () => {
    backend();
    const { result } = setup();
    await act(async () => {
      await result.current.switchAll({ serverName: "cua", requests: OFF, stillOn: [] });
    });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    invoke.mockImplementation(async (_cmd: string, args: { engineId: string }) => {
      await gate;
      return { context: BY_ID[args.engineId], receipt_id: "u", undoable: true };
    });
    let run!: Promise<EngineContext | null>;
    act(() => {
      run = result.current.undo();
    });
    expect(result.current.notice).toMatchObject({ kind: "done", pending: true });
    await act(async () => {
      release();
      await run;
    });
    expect(result.current.notice).toMatchObject({ pending: false });
  });

  it("a single switch after a group undoes only itself", async () => {
    backend();
    const { result } = setup();
    await act(async () => {
      await result.current.switchAll({ serverName: "cua", requests: OFF, stillOn: [] });
    });
    await act(async () => {
      await result.current.switchServer(OFF[0]);
    });
    invoke.mockClear();
    backend();
    await act(async () => {
      await result.current.undo();
    });
    expect(calls("undo_mcp_switch")).toHaveLength(1);
    expect(result.current.notice).toMatchObject({ line: "cua is back on for Codex." });
  });
});
