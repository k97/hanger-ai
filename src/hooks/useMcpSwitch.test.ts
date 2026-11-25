// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMcpSwitch } from "./useMcpSwitch";
import { failureLine } from "../utils/switchCopy";
import type { EngineContext, SwitchFailure, SwitchReply } from "../types/engineContext";

/**
 * The one place a server is switched: what the notice says, when the app is
 * told to rescan, and how Undo finds its receipt.
 */

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (cmd: string, args?: unknown) => invoke(cmd, args) }));

/** `docs/ipc.md` entry 15's example, after `alpha` was switched off. */
const CONTEXT: EngineContext = {
  engine_id: "codex",
  engine_name: "Codex",
  applies: null,
  switches_by_name: false,
  items: [
    {
      key: "/Users/demo/.codex/config.toml:alpha",
      name: "alpha",
      tier: "global",
      config_path: "~/.codex/config.toml",
      state: "off",
      read_only: null,
      estimated_tokens: 120,
      tool_count: 4,
    },
  ],
  on_count: 0,
  off_count: 1,
  measured_on_count: 0,
  on_tokens_measured: 0,
};

const done = (receipt: string): SwitchReply => ({ context: CONTEXT, receipt_id: receipt, undoable: true });
const unchanged: SwitchReply = { context: CONTEXT, receipt_id: null, undoable: false };

const ALPHA_OFF = {
  engineId: "codex",
  engineName: "Codex",
  key: "/Users/demo/.codex/config.toml:alpha",
  serverName: "alpha",
  file: "~/.codex/config.toml",
  enabled: false,
};

const FAILURES: SwitchFailure[] = [
  "not_found",
  "wrong_engine",
  "read_only",
  "unparseable",
  "changed_since_read",
  "write_failed",
  "not_verified",
  "would_not_come_back",
  "cli_not_found",
  "cli_failed",
  "already_there",
  "not_undoable",
  "name_refused",
];

function setup() {
  const onChanged = vi.fn();
  const hook = renderHook(() => useMcpSwitch({ onChanged }));
  return { onChanged, result: hook.result };
}

describe("useMcpSwitch", () => {
  beforeEach(() => invoke.mockReset());

  it("starts with no notice and nothing in flight", () => {
    const { result } = setup();
    expect(result.current.notice).toBeNull();
    expect(result.current.busyKeys.size).toBe(0);
  });

  it("a switch says what happened, keeps the receipt, returns the reply's context, and asks for one rescan", async () => {
    invoke.mockResolvedValueOnce(done("file:r1"));
    const { result, onChanged } = setup();

    let returned: EngineContext | null = null;
    await act(async () => {
      returned = await result.current.switchServer(ALPHA_OFF);
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("set_mcp_server_enabled", {
      engineId: "codex",
      key: "/Users/demo/.codex/config.toml:alpha",
      enabled: false,
    });
    expect(result.current.notice).toEqual({
      kind: "done",
      line: "alpha is off for Codex.",
      receiptEngineId: "codex",
      receiptId: "file:r1",
      undoable: true,
      pending: false,
    });
    expect(returned).toBe(CONTEXT);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(result.current.busyKeys.size).toBe(0);
  });

  it("switching on says so", async () => {
    invoke.mockResolvedValueOnce(done("file:r1"));
    const { result } = setup();
    await act(async () => {
      await result.current.switchServer({ ...ALPHA_OFF, enabled: true });
    });
    expect(result.current.notice).toMatchObject({ kind: "done", line: "alpha is on for Codex." });
  });

  it("a server already as asked sets no notice and asks for no rescan", async () => {
    invoke.mockResolvedValueOnce(unchanged);
    const { result, onChanged } = setup();
    let returned: EngineContext | null = null;
    await act(async () => {
      returned = await result.current.switchServer(ALPHA_OFF);
    });
    expect(result.current.notice).toBeNull();
    expect(onChanged).not.toHaveBeenCalled();
    expect(returned).toBe(CONTEXT);
  });

  it("each failure code becomes its line, returns null and asks for no rescan", async () => {
    const { result, onChanged } = setup();
    const names = { engine: "Codex", server: "alpha", file: "~/.codex/config.toml" };
    for (const code of FAILURES) {
      invoke.mockRejectedValueOnce(code);
      let returned: EngineContext | null | undefined;
      await act(async () => {
        returned = await result.current.switchServer(ALPHA_OFF);
      });
      expect(returned, code).toBeNull();
      expect(result.current.notice, code).toEqual({ kind: "failed", line: failureLine(code, names) });
    }
    // One literal, so a hook that passed the wrong names would still go red.
    invoke.mockRejectedValueOnce("changed_since_read");
    await act(async () => {
      await result.current.switchServer(ALPHA_OFF);
    });
    expect(result.current.notice).toEqual({
      kind: "failed",
      line: "~/.codex/config.toml changed while Hanger was working. Nothing was written. Try again.",
    });
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("a rejection that is no code gets the fallback, never the error's text", async () => {
    invoke.mockRejectedValueOnce(new Error("/Users/demo/.codex/config.toml: EACCES"));
    const { result } = setup();
    await act(async () => {
      await result.current.switchServer(ALPHA_OFF);
    });
    expect(result.current.notice).toEqual({
      kind: "failed",
      line: "Hanger couldn't make that change. Nothing was changed.",
    });
  });

  it("Undo sends the receipt's engine and id, says the server is back, and asks for a rescan", async () => {
    invoke.mockResolvedValueOnce(done("file:r1"));
    const { result, onChanged } = setup();
    await act(async () => {
      await result.current.switchServer(ALPHA_OFF);
    });

    invoke.mockResolvedValueOnce(done("file:r2"));
    let returned: EngineContext | null = null;
    await act(async () => {
      returned = await result.current.undo();
    });

    expect(invoke).toHaveBeenLastCalledWith("undo_mcp_switch", { engineId: "codex", receiptId: "file:r1" });
    expect(result.current.notice).toEqual({
      kind: "done",
      line: "alpha is back on for Codex.",
      receiptEngineId: "codex",
      receiptId: "file:r2",
      undoable: true,
      pending: false,
    });
    expect(returned).toBe(CONTEXT);
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it("an Undo can itself be undone, with the next receipt and the other direction", async () => {
    invoke.mockResolvedValueOnce(done("file:r1"));
    const { result } = setup();
    await act(async () => {
      await result.current.switchServer(ALPHA_OFF);
    });
    invoke.mockResolvedValueOnce(done("file:r2"));
    await act(async () => {
      await result.current.undo();
    });
    invoke.mockResolvedValueOnce(done("file:r3"));
    await act(async () => {
      await result.current.undo();
    });

    expect(invoke).toHaveBeenLastCalledWith("undo_mcp_switch", { engineId: "codex", receiptId: "file:r2" });
    expect(result.current.notice).toMatchObject({
      kind: "done",
      line: "alpha is off for Codex again.",
      receiptId: "file:r3",
    });
  });

  it("an Undo that fails shows its line, keeps no Undo, and asks for no rescan", async () => {
    invoke.mockResolvedValueOnce(done("file:r1"));
    const { result, onChanged } = setup();
    await act(async () => {
      await result.current.switchServer(ALPHA_OFF);
    });
    invoke.mockRejectedValueOnce("not_undoable");
    let returned: EngineContext | null | undefined;
    await act(async () => {
      returned = await result.current.undo();
    });
    expect(returned).toBeNull();
    expect(result.current.notice).toEqual({
      kind: "failed",
      line: "This can't be undone now. The file has changed since.",
    });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("Undo is pending while it runs, and a second press sends nothing", async () => {
    invoke.mockResolvedValueOnce(done("file:r1"));
    const { result } = setup();
    await act(async () => {
      await result.current.switchServer(ALPHA_OFF);
    });

    let resolveUndo!: (r: SwitchReply) => void;
    invoke.mockReturnValueOnce(new Promise<SwitchReply>((r) => (resolveUndo = r)));
    let first!: Promise<EngineContext | null>;
    let second!: Promise<EngineContext | null>;
    act(() => {
      first = result.current.undo();
      second = result.current.undo();
    });
    expect(result.current.notice).toMatchObject({ kind: "done", pending: true });
    await act(async () => {
      resolveUndo(done("file:r2"));
      await first;
    });
    expect(await second).toBeNull();
    expect(invoke.mock.calls.filter(([cmd]) => cmd === "undo_mcp_switch")).toHaveLength(1);
  });

  it("Undo with nothing to undo sends nothing", async () => {
    const { result } = setup();
    await act(async () => {
      expect(await result.current.undo()).toBeNull();
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("a double click sends one request, and the key is busy until it answers", async () => {
    let resolveSwitch!: (r: SwitchReply) => void;
    invoke.mockReturnValueOnce(new Promise<SwitchReply>((r) => (resolveSwitch = r)));
    const { result, onChanged } = setup();

    let first!: Promise<EngineContext | null>;
    let second!: Promise<EngineContext | null>;
    act(() => {
      first = result.current.switchServer(ALPHA_OFF);
      second = result.current.switchServer(ALPHA_OFF);
    });
    expect(result.current.busyKeys.has("codex\u0000/Users/demo/.codex/config.toml:alpha")).toBe(true);

    await act(async () => {
      resolveSwitch(done("file:r1"));
      await first;
    });
    expect(await second).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(result.current.busyKeys.size).toBe(0);
  });

  it("the same key under another engine is not the same switch", async () => {
    invoke.mockResolvedValue(done("file:r1"));
    const { result } = setup();
    await act(async () => {
      await Promise.all([
        result.current.switchServer(ALPHA_OFF),
        result.current.switchServer({ ...ALPHA_OFF, engineId: "cursor", engineName: "Cursor" }),
      ]);
    });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("dismiss clears the notice", async () => {
    invoke.mockResolvedValueOnce(done("file:r1"));
    const { result } = setup();
    await act(async () => {
      await result.current.switchServer(ALPHA_OFF);
    });
    act(() => result.current.dismiss());
    expect(result.current.notice).toBeNull();
  });
});
