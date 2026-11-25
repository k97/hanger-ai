/**
 * What the switch commands hand back: `get_engine_context`,
 * `get_engine_contexts` (a list of contexts), `set_mcp_server_enabled`,
 * `undo_mcp_switch` and `measure_engine_context`; and
 * `get_kept_off_servers`'s report.
 *
 * A hand-written mirror of `mcp::switch::context` and `mcp::switch::ops` in
 * the Rust core, narrowed to what those modules emit. Where the Rust type
 * could express a state the code never produces, the type here leaves it
 * out, so a fixture cannot be built in a shape the backend never sends.
 *
 * No component uses these yet.
 */

export type ItemState = "on" | "off";

/** Why a server shows its state and no switch. */
export type ReadOnlyReason =
  | "engine_not_confirmed"
  | "per_project_comes_next"
  | "switches_by_name_everywhere"
  | "managed_by_plugin"
  | "managed_by_policy"
  | "runs_on_vendor_servers"
  | "file_unparseable";

/**
 * A local-scope server is never an item, so `"local"` does not arrive.
 */
export type ItemTier = "global" | "user" | "project";

/**
 * The probe cache's answer for one server. Both figures are there or neither
 * is: the backend takes them from one cached result.
 *
 * A server that was asked and did not answer is measured, at zero. Only a
 * server nobody has asked is unmeasured.
 */
export type ItemCost =
  | { estimated_tokens: number; tool_count: number }
  | { estimated_tokens: null; tool_count: null };

/** One server, as one engine has it. */
export type ContextItem = {
  /**
   * What `set_mcp_server_enabled` takes. Opaque: `stash:<id>` for a server
   * Hanger is keeping while it is off, otherwise the registration's key.
   */
  key: string;
  name: string;
  tier: ItemTier;
  /** Sanitised by the backend. Empty for a kept server, which is in no file. */
  config_path: string;
  state: ItemState;
  /** `null`: Hanger can switch it. */
  read_only: ReadOnlyReason | null;
} & ItemCost;

/**
 * One engine's servers and the budget they add up to. Every figure is
 * counted by the backend.
 */
export interface EngineContext {
  engine_id: string;
  /**
   * The key the asset annotations use for this engine
   * (`EngineReachInfo.engine_key`): `"claude_code"` where `engine_id` is
   * `"claude-code"`. Compare it exactly. `null` for an id that is no host's.
   */
  engine_key: string | null;
  engine_name: string;
  /**
   * When a switch takes effect. `null` for every engine today: nothing has
   * been observed yet.
   */
  applies: string | null;
  /**
   * The engine is switched by server name alone, so one switch covers every
   * server it declares under that name.
   */
  switches_by_name: boolean;
  items: ContextItem[];
  /** Items that are on. `on_count + off_count` is the number of items. */
  on_count: number;
  off_count: number;
  /** Items that are on and measured. */
  measured_on_count: number;
  /**
   * The estimates of the on, measured items, with a launch the engine
   * declares twice counted once.
   */
  on_tokens_measured: number;
}

/**
 * One of Global's engine chips: an engine's id and the backend's name for it.
 * Every `EngineContext` is one; the chips are `get_engine_contexts`' list.
 */
export type EngineListEntry = Pick<EngineContext, "engine_id" | "engine_name">;

/**
 * The reply to a switch or an Undo. A switch that found the server already
 * as asked changed nothing, and has no receipt.
 */
export type SwitchReply = { context: EngineContext } & (
  | { receipt_id: string; undoable: true }
  | { receipt_id: null; undoable: false }
);

/**
 * A server Hanger is keeping while it is switched off for Claude Code, from
 * `get_kept_off_servers`. Declared in no file, so it is no row of the MCP
 * servers list and in none of its counts.
 */
export interface KeptOffServer {
  /** What `set_mcp_server_enabled` takes to switch it back on. */
  key: `stash:${string}`;
  name: string;
  engine_id: string;
  engine_name: string;
  /** Sanitised by the backend: `"stdio"`, `"unknown"`, or a bare address. */
  transport: string;
  at_ms: number;
  /**
   * Whether some config file still declares a server of this name, so the
   * MCP servers list already has a row for it.
   */
  also_declared: boolean;
}

/** Every kept server, newest first, with figures counted by the backend. */
export interface KeptOff {
  servers: KeptOffServer[];
  /** The number of servers. */
  count: number;
  /** How many have `also_declared: false`. */
  only_kept_count: number;
}

/**
 * What `set_mcp_server_enabled` and `undo_mcp_switch` reject with: one of
 * these strings and nothing else.
 */
export type SwitchFailure =
  | "not_found"
  | "wrong_engine"
  | "read_only"
  | "unparseable"
  | "changed_since_read"
  | "write_failed"
  | "not_verified"
  | "would_not_come_back"
  | "cli_not_found"
  | "cli_failed"
  | "already_there"
  | "not_undoable"
  | "name_refused";
