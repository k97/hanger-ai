import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { EngineContext, SwitchReply } from "../types/engineContext";
import { failureLine, groupSwitchedLine, stillOnLine, switchedLine } from "../utils/switchCopy";

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

/**
 * One click of the switch in a server's inspector header, which covers every
 * engine (docs/plans/2026-11-25-decisions-round-5.md): its requests, each
 * built by `switchRequestFor` and all in one direction, and the engines that
 * carry the server and that Hanger can't switch, named after an off.
 */
export interface GroupSwitchRequest {
  serverName: string;
  requests: readonly SwitchRequest[];
  stillOn: readonly string[];
}

export interface McpSwitch {
  notice: SwitchNoticeState | null;
  /** `${engineId}\u0000${key}` for every switch with a request in flight. */
  busyKeys: ReadonlySet<string>;
  switchServer(a: SwitchRequest): Promise<EngineContext | null>;
  /** Sends a group's requests one at a time and sets one notice for them. */
  switchAll(a: GroupSwitchRequest): Promise<void>;
  /** Undoes the last switch, or every receipt of the last group, last first.
   *  A group's replies go to `onContext`, so it returns null for one. */
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

/** One receipt of a group, with what its Undo line and failure line name. */
interface GroupReceipt {
  engineId: string;
  engineName: string;
  file?: string;
  busyKey: string;
  receiptId: string;
}

/** The last group: its receipts in the order they were made, and the state
 *  they left the server in. */
interface LastGroup {
  serverName: string;
  /** The engines the group switched, in the order first switched: what its
   *  lines name, whichever way round an Undo runs. */
  engines: string[];
  receipts: GroupReceipt[];
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

export function useMcpSwitch({
  onChanged,
  onContext,
}: {
  onChanged: () => void;
  /** Each reply's context in a group, as it lands, for App's one copy. A
   *  single switch returns its own instead. */
  onContext?: (ctx: EngineContext) => void;
}): McpSwitch {
  const [notice, setNotice] = useState<SwitchNoticeState | null>(null);
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(() => new Set());
  // The ref is the guard: two clicks in one frame both run before React
  // re-renders, so state alone would let the second through.
  const busyRef = useRef<Set<string>>(new Set());
  const noticeRef = useRef<SwitchNoticeState | null>(null);
  const lastRef = useRef<LastSwitch | null>(null);
  // The last group, when the last thing switched was one; a single switch
  // clears it, and a group clears `lastRef`, so Undo takes back the last.
  const groupRef = useRef<LastGroup | null>(null);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;
  const onContextRef = useRef(onContext);
  onContextRef.current = onContext;

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
        groupRef.current = null;
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

  /** Holds every key, or none when any is already held. */
  const holdAll = useCallback(
    (keys: readonly string[]): boolean => {
      if (keys.some((k) => busyRef.current.has(k))) return false;
      for (const k of keys) busyRef.current.add(k);
      setBusyKeys(new Set(busyRef.current));
      return true;
    },
    []
  );

  const releaseAll = useCallback((keys: readonly string[]) => {
    for (const k of keys) busyRef.current.delete(k);
    setBusyKeys(new Set(busyRef.current));
  }, []);

  const switchAll = useCallback(
    async ({ serverName, requests, stillOn }: GroupSwitchRequest): Promise<void> => {
      if (requests.length === 0) return;
      const keys = requests.map((r) => busyKeyOf(r.engineId, r.key));
      if (!holdAll(keys)) return;
      const enabled = requests[0].enabled;
      const receipts: GroupReceipt[] = [];
      const failed: string[] = [];
      let undoable = true;
      try {
        // One at a time: each engine's command writes that engine's file.
        for (const [i, r] of requests.entries()) {
          try {
            const reply = await invoke<SwitchReply>("set_mcp_server_enabled", {
              engineId: r.engineId,
              key: r.key,
              enabled: r.enabled,
            });
            onContextRef.current?.(reply.context);
            if (reply.receipt_id === null) continue;
            undoable = undoable && reply.undoable;
            receipts.push({
              engineId: r.engineId,
              engineName: r.engineName,
              file: r.file,
              busyKey: keys[i],
              receiptId: reply.receipt_id,
            });
          } catch (err) {
            failed.push(failureLine(codeOf(err), { engine: r.engineName, server: serverName, file: r.file }));
          }
        }
        if (receipts.length === 0) {
          // Nothing changed: every one failed, or all were already as asked.
          if (failed.length > 0) show({ kind: "failed", line: failed.join(" ") });
          return;
        }
        lastRef.current = null;
        const engines = [...new Set(receipts.map((x) => x.engineName))];
        groupRef.current = { serverName, engines, receipts, lastEnabled: enabled };
        const parts = [groupSwitchedLine(enabled ? "back_on" : "off", serverName, engines)];
        if (!enabled && stillOn.length > 0) parts.push(stillOnLine([...stillOn]));
        parts.push(...failed);
        const lastReceipt = receipts[receipts.length - 1];
        show({
          kind: "done",
          line: parts.join(" "),
          // The receipt Undo starts with; it takes back the whole group.
          receiptEngineId: lastReceipt.engineId,
          receiptId: lastReceipt.receiptId,
          undoable,
          pending: false,
        });
        onChangedRef.current();
      } finally {
        releaseAll(keys);
      }
    },
    [holdAll, releaseAll, show]
  );

  const undoGroup = useCallback(
    async (current: Extract<SwitchNoticeState, { kind: "done" }>, group: LastGroup): Promise<null> => {
      const keys = group.receipts.map((r) => r.busyKey);
      if (!holdAll(keys)) return null;
      show({ ...current, pending: true });
      // Last made, first undone. The Undo's own receipts, in the order it
      // made them, are what an Undo of this Undo takes back, last first.
      const next: GroupReceipt[] = [];
      let undoable = true;
      let changed = false;
      try {
        for (const r of [...group.receipts].reverse()) {
          try {
            const reply = await invoke<SwitchReply>("undo_mcp_switch", {
              engineId: r.engineId,
              receiptId: r.receiptId,
            });
            changed = true;
            onContextRef.current?.(reply.context);
            if (reply.receipt_id === null) continue;
            undoable = undoable && reply.undoable;
            next.push({ ...r, receiptId: reply.receipt_id });
          } catch (err) {
            groupRef.current = null;
            show({
              kind: "failed",
              line: failureLine(codeOf(err), { engine: r.engineName, server: group.serverName, file: r.file }),
            });
            return null;
          }
        }
        const nowEnabled = !group.lastEnabled;
        const line = groupSwitchedLine(nowEnabled ? "back_on" : "off_again", group.serverName, group.engines);
        if (next.length === 0) {
          groupRef.current = null;
          show({ kind: "done", line, receiptEngineId: current.receiptEngineId, receiptId: null, undoable: false, pending: false });
          return null;
        }
        groupRef.current = { ...group, receipts: next, lastEnabled: nowEnabled };
        const lastReceipt = next[next.length - 1];
        show({
          kind: "done",
          line,
          receiptEngineId: lastReceipt.engineId,
          receiptId: lastReceipt.receiptId,
          undoable,
          pending: false,
        });
        return null;
      } finally {
        if (changed) onChangedRef.current();
        releaseAll(keys);
      }
    },
    [holdAll, releaseAll, show]
  );

  const undo = useCallback(async (): Promise<EngineContext | null> => {
    const current = noticeRef.current;
    const group = groupRef.current;
    if (group && current && current.kind === "done" && current.undoable && !current.pending) {
      return undoGroup(current, group);
    }
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
  }, [hold, release, show, undoGroup]);

  const dismiss = useCallback(() => show(null), [show]);

  return { notice, busyKeys, switchServer, switchAll, undo, dismiss };
}
