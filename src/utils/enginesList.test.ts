import { describe, it, expect } from "vitest";
import { enginesList } from "./enginesList";
import type { McpEngineSummaryData } from "../types/mcpEngineSummary";
import type { KeptOff } from "../types/engineContext";

/**
 * The Engines screen's source list (P8 of
 * docs/plans/2026-11-25-context-control-finish.md): every engine that
 * declares an MCP server, in the summary's order, then any engine whose
 * servers Hanger is keeping off and that declares none — so an engine with
 * every server switched off can still be reached. It builds a list; it counts
 * nothing.
 */

const summary = (rows: { engine_id: string; engine_name: string }[]): McpEngineSummaryData => ({
  rows: rows.map((r) => ({ ...r, server_count: 1, tools_known: null })),
  host_count: rows.length,
  tools_known_total: null,
  total_server_count: rows.length,
  answered_server_count: 0,
  unasked_server_count: rows.length,
  unaskable_server_count: 0,
  conflicting_server_count: 0,
});

const kept = (servers: { name: string; engine_id: string; engine_name: string }[]): KeptOff => ({
  servers: servers.map((s, i) => ({
    key: `stash:00000000-0000-4000-8000-00000000000${i}` as const,
    name: s.name,
    engine_id: s.engine_id,
    engine_name: s.engine_name,
    transport: "stdio",
    at_ms: 1795566217263,
    also_declared: false,
  })),
  count: servers.length,
  only_kept_count: servers.length,
});

describe("enginesList", () => {
  it("is null while neither reply has landed", () => {
    expect(enginesList(null, null)).toBeNull();
  });

  it("keeps the summary's rows in their order", () => {
    const list = enginesList(
      summary([
        { engine_id: "codex", engine_name: "Engine C" },
        { engine_id: "gemini", engine_name: "Engine G" },
      ]),
      kept([])
    );
    expect(list).toEqual([
      { engine_id: "codex", engine_name: "Engine C" },
      { engine_id: "gemini", engine_name: "Engine G" },
    ]);
  });

  it("adds an engine present only among the kept-off servers, once, after the summary's rows", () => {
    const list = enginesList(
      summary([{ engine_id: "codex", engine_name: "Engine C" }]),
      kept([
        { name: "alpha", engine_id: "claude-code", engine_name: "Engine K" },
        { name: "beta", engine_id: "claude-code", engine_name: "Engine K" },
      ])
    );
    expect(list).toEqual([
      { engine_id: "codex", engine_name: "Engine C" },
      { engine_id: "claude-code", engine_name: "Engine K" },
    ]);
  });

  it("does not repeat an engine the summary already lists", () => {
    const list = enginesList(
      summary([{ engine_id: "claude-code", engine_name: "Engine K" }]),
      kept([{ name: "alpha", engine_id: "claude-code", engine_name: "Engine K" }])
    );
    expect(list).toEqual([{ engine_id: "claude-code", engine_name: "Engine K" }]);
  });

  it("lists the kept engines when the summary could not be read", () => {
    expect(enginesList(null, kept([{ name: "alpha", engine_id: "claude-code", engine_name: "Engine K" }]))).toEqual([
      { engine_id: "claude-code", engine_name: "Engine K" },
    ]);
  });

  it("is an empty list, not null, when both replies are empty", () => {
    expect(enginesList(summary([]), kept([]))).toEqual([]);
  });
});
