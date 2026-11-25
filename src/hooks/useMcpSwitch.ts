import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { EngineContext, SwitchReply } from "../types/engineContext";
import { failureLine, switchedLine } from "../utils/switchCopy";

/**
 * The one place a server is switched off or on, and switched back.
 *
 * Every switch on screen calls this hook and nothing else calls
 * `set_mcp_server_enabled` or `undo_mcp_switch`, so there is one notice, one
 * receipt to undo, and one place that asks for the rescan that keeps the MCP
 * servers list and its counts true.
 */

/** What the notice under the main column says. */
export type SwitchNoticeState =
  | {
      kind: "done";
      line: string;
      /** The engine the receipt was made for; Undo is honoured only there. */
      receiptEngineId: string;
      receiptId: string | null;
      undoable: boolean;
      /** An Undo of this receipt is in flight. */
      pending: boolean;
    }
  | { kind: "failed"; line: string };

export interface SwitchRequest {
  engineId: string;
  engineName: string;
  /** A `ContextItem.key` from that engine's context. */
  key: string;
  serverName: string;
  /** The file it is declared in, for the lines that name one. */
  file?: string;
  enabled: boolean;
}

export interface McpSwitch {
  notice: SwitchNoticeState | null;
  /** `${engineId}\u0000${key}` for every switch with a request in flight. */
  busyKeys: ReadonlySet<string>;
  switchServer(a: SwitchRequest): Promise<EngineContext | null>;
  undo(): Promise<EngineContext | null>;
  dismiss(): void;
}

/** The last switch, so the Undo line and an Undo failure can name it. */
interface LastSwitch {
  engineName: string;
  serverName: string;
  file?: string;
  busyKey: string;
  /** The state the last change left the server in. */
  lastEnabled: boolean;
}

/**
 * One `.mcp.json` registration key can belong to two hosts, so the engine is
 * part of the key. Exported so a switch can ask `busyKeys` about itself.
 */
export function busyKeyOf(engineId: string, key: string): string {
  return `${engineId}\u0000${key}`;
}

/**
 * The backend rejects with a failure code and nothing else; anything that is
 * not a string gets the fallback line rather than its text.
 */
function codeOf(err: unknown): string {
  return typeof err === "string" ? err : "";
}

export function useMcpSwitch({ onChanged }: { onChanged: () => void }): McpSwitch {
  const [notice, setNotice] = useState<SwitchNoticeState | null>(null);
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(() => new Set());
  // The ref is the guard: two clicks in one frame both run before React
  // re-renders, so state alone would let the second through.
  const busyRef = useRef<Set<string>>(new Set());
  const noticeRef = useRef<SwitchNoticeState | null>(null);
  const lastRef = useRef<LastSwitch | null>(null);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  const show = useCallback((next: SwitchNoticeState | null) => {
    noticeRef.current = next;
    setNotice(next);
  }, []);

  const hold = useCallback((key: string): boolean => {
    if (busyRef.current.has(key)) return false;
    busyRef.current.add(key);
    setBusyKeys(new Set(busyRef.current));
    return true;
  }, []);

  const release = useCallback((key: string) => {
    busyRef.current.delete(key);
    setBusyKeys(new Set(busyRef.current));
  }, []);

  const switchServer = useCallback(
    async (a: SwitchRequest): Promise<EngineContext | null> => {
      const busyKey = busyKeyOf(a.engineId, a.key);
      if (!hold(busyKey)) return null;
      const names = { engine: a.engineName, server: a.serverName, file: a.file };
      try {
        const reply = await invoke<SwitchReply>("set_mcp_server_enabled", {
          engineId: a.engineId,
          key: a.key,
          enabled: a.enabled,
        });
        // Already as asked: nothing changed, so there is nothing to say,
        // undo or rescan.
        if (reply.receipt_id === null) return reply.context;
        lastRef.current = {
          engineName: a.engineName,
          serverName: a.serverName,
          file: a.file,
          busyKey,
          lastEnabled: a.enabled,
        };
        show({
          kind: "done",
          line: switchedLine(a.enabled ? "on" : "off", names),
          receiptEngineId: a.engineId,
          receiptId: reply.receipt_id,
          undoable: reply.undoable,
          pending: false,
        });
        onChangedRef.current();
        return reply.context;
      } catch (err) {
        show({ kind: "failed", line: failureLine(codeOf(err), names) });
        return null;
      } finally {
        release(busyKey);
      }
    },
    [hold, release, show]
  );

  const undo = useCallback(async (): Promise<EngineContext | null> => {
    const current = noticeRef.current;
    const last = lastRef.current;
    if (!current || current.kind !== "done" || !current.undoable || current.pending) return null;
    if (current.receiptId === null || !last) return null;
    if (!hold(last.busyKey)) return null;
    show({ ...current, pending: true });
    const names = { engine: last.engineName, server: last.serverName, file: last.file };
    try {
      const reply = await invoke<SwitchReply>("undo_mcp_switch", {
        engineId: current.receiptEngineId,
        receiptId: current.receiptId,
      });
      const nowEnabled = !last.lastEnabled;
      lastRef.current = { ...last, lastEnabled: nowEnabled };
      show({
        kind: "done",
        line: switchedLine(nowEnabled ? "undo_on" : "undo_off", names),
        receiptEngineId: current.receiptEngineId,
        receiptId: reply.receipt_id,
        undoable: reply.undoable,
        pending: false,
      });
      onChangedRef.current();
      return reply.context;
    } catch (err) {
      show({ kind: "failed", line: failureLine(codeOf(err), names) });
      return null;
    } finally {
      release(last.busyKey);
    }
  }, [hold, release, show]);

  const dismiss = useCallback(() => show(null), [show]);

  return { notice, busyKeys, switchServer, undo, dismiss };
}
