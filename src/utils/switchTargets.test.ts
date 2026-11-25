import { describe, it, expect } from "vitest";
import type { ContextItem, EngineContext } from "../types/engineContext";
import { sameEngine, switchRequestFor, switchableNamed, tileTarget } from "./switchTargets";

/** docs/ipc.md entry 15's item shape. */
const item = (over: Partial<ContextItem> & Pick<ContextItem, "key" | "name">): ContextItem =>
  ({
    tier: "global",
    config_path: "~/.codex/config.toml",
    state: "on",
    read_only: null,
    estimated_tokens: null,
    tool_count: null,
    ...over,
  }) as ContextItem;

const context = (engine_id: string, items: ContextItem[], switches_by_name = false): EngineContext => ({
  engine_id,
  engine_name: `Engine ${engine_id}`,
  applies: null,
  switches_by_name,
  items,
  on_count: 0,
  off_count: 0,
  measured_on_count: 0,
  on_tokens_measured: 0,
});

const CODEX = context("codex", [
  item({ key: "/u/.codex/config.toml:alpha", name: "alpha" }),
  item({ key: "/u/.codex/config.toml:beta", name: "beta", state: "off" }),
  item({ key: "/u/.codex/config.toml:alpine", name: "alpine", read_only: "managed_by_plugin" }),
]);
const GEMINI = context(
  "gemini",
  [
    item({ key: "/u/.gemini/settings.json:alpha", name: "alpha", config_path: "~/.gemini/settings.json" }),
    item({ key: "/w/.gemini/settings.json:alpha", name: "alpha", tier: "project", read_only: "switches_by_name_everywhere" }),
  ],
  true
);
const CLAUDE = context("claude-code", [
  item({ key: "/u/.claude.json:alpha", name: "alpha", tier: "user", config_path: "~/.claude.json" }),
  item({ key: "/u/.mcp.json:alpha", name: "alpha", config_path: "~/.mcp.json" }),
]);

describe("switchRequestFor", () => {
  it("asks for the other state, naming the engine, the key, the server and its file", () => {
    expect(switchRequestFor({ ctx: CODEX, item: CODEX.items[0] })).toEqual({
      engineId: "codex",
      engineName: "Engine codex",
      key: "/u/.codex/config.toml:alpha",
      serverName: "alpha",
      file: "~/.codex/config.toml",
      enabled: false,
    });
    expect(switchRequestFor({ ctx: CODEX, item: CODEX.items[1] }).enabled).toBe(true);
  });
});

describe("switchableNamed (⌘K)", () => {
  it("finds every switchable item whose name holds the query, in any case, in context order", () => {
    const found = switchableNamed([CODEX, GEMINI], "AL");
    expect(found.map((t) => `${t.ctx.engine_id}:${t.item.key}`)).toEqual([
      "codex:/u/.codex/config.toml:alpha",
      "gemini:/u/.gemini/settings.json:alpha",
    ]);
  });

  it("finds nothing for an empty query", () => {
    expect(switchableNamed([CODEX], "")).toEqual([]);
  });
});

describe("sameEngine", () => {
  it("matches an MCP host id to the asset engine key the scanner maps it to", () => {
    // scanner.rs → get_engine_key: "claude-code" → "claude_code", the rest as is.
    expect(sameEngine("claude-code", "claude_code")).toBe(true);
    expect(sameEngine("claude-code", "claude-code")).toBe(true);
    expect(sameEngine("codex", "codex")).toBe(true);
    expect(sameEngine("codex", "claude_code")).toBe(false);
    expect(sameEngine("claude-desktop", "claude_code")).toBe(false);
  });
});

describe("tileTarget (a reach tile on an MCP servers row)", () => {
  const all = [CODEX, GEMINI, CLAUDE];

  it("is the tile engine's item whose key is the row's registration", () => {
    const t = tileTarget(all, "codex", ["/u/.codex/config.toml:beta"]);
    expect(t?.ctx.engine_id).toBe("codex");
    expect(t?.item.key).toBe("/u/.codex/config.toml:beta");
  });

  it("finds the engine through the scanner's key, not the host id", () => {
    expect(tileTarget(all, "claude_code", ["/u/.claude.json:alpha"])?.item.key).toBe("/u/.claude.json:alpha");
  });

  it("is nothing when the engine has no context yet, or no item for the row", () => {
    expect(tileTarget([], "codex", ["/u/.codex/config.toml:alpha"])).toBeNull();
    expect(tileTarget(all, "cursor", ["/u/.codex/config.toml:alpha"])).toBeNull();
    expect(tileTarget(all, "codex", ["/u/.gemini/settings.json:alpha"])).toBeNull();
  });

  it("never matches on name alone: a kept server's stash key is no registration", () => {
    const kept = context("claude-code", [item({ key: "stash:1", name: "alpha", config_path: "", state: "off" })]);
    expect(tileTarget([kept], "claude_code", ["/u/.codex/config.toml:alpha"])).toBeNull();
  });

  it("keeps a read-only item, so the tile can say why", () => {
    expect(tileTarget(all, "codex", ["/u/.codex/config.toml:alpine"])?.item.read_only).toBe("managed_by_plugin");
  });

  it("for an engine that switches by name, takes a switchable item when the row holds several", () => {
    const t = tileTarget(all, "gemini", ["/w/.gemini/settings.json:alpha", "/u/.gemini/settings.json:alpha"]);
    expect(t?.item.key).toBe("/u/.gemini/settings.json:alpha");
  });

  it("for any other engine, is nothing when the row holds two of its items: one tile cannot switch both", () => {
    expect(tileTarget(all, "claude_code", ["/u/.claude.json:alpha", "/u/.mcp.json:alpha"])).toBeNull();
  });
});
