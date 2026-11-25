/**
 * Which engine item a switch on screen acts on, and the request it sends.
 *
 * Two surfaces outside an engine's own list find their items here: ⌘K's
 * Switch actions (by name) and the engine tiles on Global's MCP servers rows
 * (by registration key, T2 of docs/plans/2026-11-25-ia-engines-into-global.md).
 * Both send `switchRequestFor`, so a server switched from either is asked for
 * exactly as the inspector's own switch asks for it.
 */

import type { ContextItem, EngineContext } from "../types/engineContext";
import type { SwitchRequest } from "../hooks/useMcpSwitch";

/** One engine's item for a server, with the context it came from. */
export interface SwitchTarget {
  ctx: EngineContext;
  item: ContextItem;
}

/** The request every switch sends for an item: the state it is not in. */
export function switchRequestFor({ ctx, item }: SwitchTarget): SwitchRequest {
  return {
    engineId: ctx.engine_id,
    engineName: ctx.engine_name,
    key: item.key,
    serverName: item.name,
    file: item.config_path,
    enabled: item.state !== "on",
  };
}

/**
 * ⌘K: every item Hanger can switch whose name holds the query, in any case,
 * in context order. Nothing for an empty query.
 */
export function switchableNamed(contexts: readonly EngineContext[], query: string): SwitchTarget[] {
  if (query === "") return [];
  const needle = query.toLowerCase();
  return contexts.flatMap((ctx) =>
    ctx.items
      .filter((item) => item.read_only === null && item.name.toLowerCase().includes(needle))
      .map((item) => ({ ctx, item }))
  );
}

/**
 * "Show it" on a kept server some config file still declares
 * (`KeptOffServer.also_declared`): the inventory's first server with exactly
 * that name. A kept server is declared in no file and has no inventory asset,
 * so any match is a declared one. ⌘K's `switchableNamed` matches substrings
 * among switchable items; this one names a single server, read-only or not.
 */
export function declaredNamed<T extends { name: string }>(tools: readonly T[], name: string): T | null {
  return tools.find((t) => t.name === name) ?? null;
}

/** Lowercase letters and digits only. */
function idOf(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Whether an MCP host id (`EngineContext.engine_id`, `mcp/registry.rs` →
 * `HOSTS`) and an asset engine key (`EngineReachInfo.engine_key`) name one
 * engine. The scanner maps the first to the second in `scanner.rs` →
 * `get_engine_key`, which changes only the separator ("claude-code" →
 * "claude_code"), so the two are compared without it.
 */
export function sameEngine(hostId: string, engineKey: string): boolean {
  return idOf(hostId) === idOf(engineKey);
}

/**
 * The item a reach tile switches: in the context of the tile's engine, the
 * item whose key is one of the row's registrations. Matched on the key both
 * sides mint from `RegistrationKey`, as the inspector matches its rows
 * (`Flyout.tsx`), never on name or tier: a kept server's `stash:` key is no
 * registration, and an engine's tier word is not the panel's.
 *
 * A grouped row stands for every registration of its name. An engine that
 * switches by name covers them all with one switch, so any of its items will
 * do and one Hanger can switch is preferred. Any other engine holding two of
 * them gets no target: one tile cannot switch two registrations, and the
 * inspector lists each.
 */
export function tileTarget(
  contexts: readonly EngineContext[],
  engineKey: string,
  registrationKeys: readonly string[]
): SwitchTarget | null {
  const ctx = contexts.find((c) => sameEngine(c.engine_id, engineKey));
  if (!ctx) return null;
  const keys = new Set(registrationKeys);
  const matches = ctx.items.filter((i) => keys.has(i.key));
  const [first, second] = matches;
  if (!first) return null;
  if (!second) return { ctx, item: first };
  if (!ctx.switches_by_name) return null;
  return { ctx, item: matches.find((i) => i.read_only === null) ?? first };
}
