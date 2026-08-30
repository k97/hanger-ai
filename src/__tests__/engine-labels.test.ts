import { describe, it, expect } from "vitest";
import { hostLabel } from "../utils/mcpServerView";
import { engineLabel } from "../utils/assetProvenance";
import { read, block } from "./rustTables";

/**
 * A mark without a name is half a row.
 *
 * `brand-coverage.test.ts` pins the drawing; this pins the words beside it.
 * Both read the Rust registries as text — the same idiom, for the same reason:
 * the backend can name an engine on a machine this suite never runs on, and a
 * label added by hand for the ids someone happened to think of is a label that
 * goes stale on the next table row. Seven hosts shipped rendering as raw
 * lower-case ids because the ruling that fixed `windsurf` was applied to
 * `windsurf` and nothing else.
 */
/** Every MCP host id `mcpServerView` can be handed. */
function hostIds(): string[] {
  const hosts = block(read("src-tauri/src/mcp/registry.rs"), "pub const HOSTS", "];", "registry.rs HOSTS");
  return [...hosts.matchAll(/McpHost \{ id: "([^"]+)"/g)].map((m) => m[1]);
}

/** Every id the backend can put in an asset's `scope.agent`. */
function scopeAgentIds(): string[] {
  const agentsSource = read("src-tauri/src/agents.rs");
  const configs = block(agentsSource, "pub const AGENT_CONFIGS", "];", "agents.rs AGENT_CONFIGS");
  const owners = block(agentsSource, "pub const RULE_FILE_OWNERS", "];", "agents.rs RULE_FILE_OWNERS");
  return [
    ...[...configs.matchAll(/\bid: "([^"]+)"/g)].map((m) => m[1]),
    ...[...owners.matchAll(/\("[^"]+", "([^"]+)", "[^"]+"\)/g)].map((m) => m[1]),
  ];
}

describe("engine and host labels", () => {
  it("every MCP host the registry declares has a display name", () => {
    const ids = hostIds();
    // A floor, not a count: the regex above is the thing most likely to
    // under-collect after a reformat, and an empty list would otherwise pass
    // this file while proving nothing. Counted from registry.rs HOSTS.
    expect(ids.length, "registry.rs HOSTS under-collected — check the regex").toBeGreaterThanOrEqual(16);

    const raw = ids.filter((id) => hostLabel(id) === id);
    expect(
      raw,
      `add a HOST_NAMES entry in src/utils/mcpServerView.ts for: ${raw.join(", ")} — use the display_name already in registry.rs`,
    ).toEqual([]);
  });

  it("every agent the backend can attribute an asset to has a display name", () => {
    const ids = scopeAgentIds();
    expect(ids.length, "agents.rs tables under-collected — check the regexes").toBeGreaterThanOrEqual(13);

    const raw = ids.filter(
      (id) => engineLabel({ scope: { Global: { agent: id } } } as never) === id,
    );
    expect(
      raw,
      `add a NAMES entry in src/utils/assetProvenance.ts for: ${raw.join(", ")}`,
    ).toEqual([]);
  });

  it("still passes an id from nowhere through untouched", () => {
    // The guards above must not be satisfiable by labelling everything. An id
    // the backend cannot emit has no name to give, and inventing one would be
    // worse than showing the id.
    expect(hostLabel("an-id-from-nowhere")).toBe("an-id-from-nowhere");
    expect(engineLabel({ scope: { Global: { agent: "an-id-from-nowhere" } } } as never)).toBe(
      "an-id-from-nowhere",
    );
  });
});
