/**
 * What the four switch commands hand back: `get_engine_context`,
 * `set_mcp_server_enabled`, `undo_mcp_switch` and `measure_engine_context`.
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
  engine_name: string;
  /**
   * When a switch takes effect. `null` for every engine today: nothing has
   * been observed yet.
   */
  applies: string | null;
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
 * The reply to a switch or an Undo. A switch that found the server already
 * as asked changed nothing, and has no receipt.
 */
export type SwitchReply = { context: EngineContext } & (
  | { receipt_id: string; undoable: true }
  | { receipt_id: null; undoable: false }
);

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
