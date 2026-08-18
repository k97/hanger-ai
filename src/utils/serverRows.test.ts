import { describe, it, expect } from "vitest";
import { agreementLine, sortServerRows, mergeReach, type McpServerRow } from "./serverRows";
import type { EngineReachInfo } from "../components/EngineReachTiles";

function row(overrides: Partial<McpServerRow> & Pick<McpServerRow, "name">): McpServerRow {
  return {
    transport: "stdio",
    registration_count: 1,
    distinct_spec_count: 1,
    agreement: "Consistent",
    aliased_with: [],
    plugin: null,
    registrations: [`/test/config.json:${overrides.name}`],
    ...overrides,
  };
}

describe("agreementLine", () => {
  it("renders nothing for a server with exactly one registration — there is nothing to agree or disagree about", () => {
    expect(agreementLine(row({ name: "tauri", registration_count: 1 }))).toBeUndefined();
  });

  it("states plain agreement for a consistent group", () => {
    expect(
      agreementLine(row({ name: "tauri", registration_count: 3, distinct_spec_count: 1, agreement: "Consistent" }))
    ).toBe("3 registrations · agree");
  });

  it("names the split for a conflicting group", () => {
    expect(
      agreementLine(row({ name: "tauri", registration_count: 3, distinct_spec_count: 2, agreement: "Conflicting" }))
    ).toBe("3 registrations · 2 different launch specs");
  });

  it("names a duplicate declaration distinctly from a conflict", () => {
    expect(
      agreementLine(row({ name: "tauri", registration_count: 2, distinct_spec_count: 1, agreement: "Duplicate" }))
    ).toBe("2 registrations · declared twice by the same engine");
  });

  it("has no singular form — the noun stays plural at every count agreementLine ever renders", () => {
    // Renamed: the previous name promised a singular-noun branch reachable
    // "once distinct_spec_count disagrees with registration_count", but no
    // such branch exists. `regPhrase` in `agreementLine` is unconditionally
    // `${row.registration_count} registrations` — there is no singular
    // alternative anywhere in the function to reach. This pins that
    // non-branching fact instead of a distinction the code never draws.
    expect(agreementLine(row({ name: "tauri", registration_count: 2 }))).toContain("registrations");
  });
});

describe("sortServerRows", () => {
  const rows: McpServerRow[] = [
    row({ name: "zeta", agreement: "Consistent" }),
    row({ name: "alpha", agreement: "Conflicting" }),
    row({ name: "mid", agreement: "Duplicate" }),
  ];

  it("orders by name, case-insensitively", () => {
    const named = [row({ name: "Banana" }), row({ name: "apple" })];
    expect(sortServerRows(named, "name").map((r) => r.name)).toEqual(["apple", "Banana"]);
  });

  it("puts conflicting groups before duplicate groups before consistent ones under 'attention'", () => {
    expect(sortServerRows(rows, "attention").map((r) => r.name)).toEqual(["alpha", "mid", "zeta"]);
  });

  it("does not mutate its input", () => {
    const original = [...rows];
    sortServerRows(rows, "name");
    expect(rows).toEqual(original);
  });
});

describe("mergeReach", () => {
  const claudeCode: EngineReachInfo = {
    engine_id: 1,
    engine_key: "claude-code",
    engine_name: "Claude Code",
    reached: true,
  };
  const codexUnreached: EngineReachInfo = {
    engine_id: 2,
    engine_key: "codex",
    engine_name: "Codex",
    reached: false,
    reason: "format",
  };
  const codexReached: EngineReachInfo = { ...codexUnreached, reached: true, reason: undefined };

  it("returns null when none of the server's registrations have an annotation", () => {
    const byAssetPath = new Map<string, { reach: EngineReachInfo[] }>();
    expect(mergeReach(["/test/config.json:tauri"], byAssetPath)).toBeNull();
  });

  it("unions reach across every registration of the server, by engine", () => {
    const byAssetPath = new Map<string, { reach: EngineReachInfo[] }>([
      ["/a/.claude.json:tauri", { reach: [claudeCode] }],
      ["/b/.codex/config.toml:tauri", { reach: [codexUnreached] }],
    ]);
    const merged = mergeReach(["/a/.claude.json:tauri", "/b/.codex/config.toml:tauri"], byAssetPath);
    expect(merged).not.toBeNull();
    expect(merged!.map((r) => r.engine_key).sort()).toEqual(["claude-code", "codex"]);
  });

  it("prefers a reached verdict over an unreached one for the same engine across registrations", () => {
    // The regression this pins: a server registered via both a bridged and a
    // direct path should read as reached through that engine, not blocked,
    // once ANY of its registrations gets there.
    const byAssetPath = new Map<string, { reach: EngineReachInfo[] }>([
      ["/a:tauri", { reach: [codexUnreached] }],
      ["/b:tauri", { reach: [codexReached] }],
    ]);
    const merged = mergeReach(["/a:tauri", "/b:tauri"], byAssetPath);
    expect(merged!.find((r) => r.engine_key === "codex")?.reached).toBe(true);
  });
});
