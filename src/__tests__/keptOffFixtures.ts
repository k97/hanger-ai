import type { KeptOff, KeptOffServer } from "../types/engineContext";

/**
 * A `get_kept_off_servers` reply built the way the backend builds it.
 *
 * `kept_off_for` (src-tauri/src/mcp/switch/ops.rs) sets `count` to
 * `servers.len()` and `only_kept_count` to the number with
 * `also_declared == false`, so no real reply carries figures its own list
 * contradicts. A fixture typed from `KeptOff` alone can, and a test fed one
 * is asserting against a reply the app never receives. Build the reply from
 * its servers and the figures cannot drift from them.
 */
export function keptOffOf(servers: KeptOffServer[]): KeptOff {
  return {
    servers,
    count: servers.length,
    only_kept_count: servers.filter((server) => !server.also_declared).length,
  };
}
