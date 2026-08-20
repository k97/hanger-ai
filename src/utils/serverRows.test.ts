import { describe, it, expect } from "vitest";
import {
  agreementLine,
  cardSecondLine,
  projectOverrideNote,
  sortServerRows,
  mergeReach,
  type McpServerRow,
} from "./serverRows";
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

  // §6.3 state 3 ("one engine only"): the cross-engine reading is meaningless
  // with a single engine, and the row sentence must not promise it. Traced
  // `agreement_for` (src-tauri/src/mcp/agreement.rs): when every registration
  // of a server shares one host_id, `Consistent` ("… agree") is mathematically
  // unreachable for registration_count >= 2 — that shape can only ever verdict
  // `Duplicate` or `Conflicting`. `agreementLine` never renders "engine(s)" in
  // any of its three branches either, so there is no engine-count claim in the
  // sentence to overpromise with in the first place. Verify-and-pin, not a
  // build — see task-13-report.md's "State 3" section for the full trace.
  it("never says 'engines' (plural) — no branch claims a count of engines agreeing", () => {
    // "the same engine" (singular, Duplicate's own wording) names exactly
    // one and is honest; a plural would claim a cross-engine count the
    // function has no engine data to back — `agreementLine` only ever sees
    // registration counts, never a distinct-engine count.
    const everyShape = [
      row({ name: "a", registration_count: 3, distinct_spec_count: 1, agreement: "Consistent" }),
      row({ name: "b", registration_count: 3, distinct_spec_count: 2, agreement: "Conflicting" }),
      row({ name: "c", registration_count: 2, distinct_spec_count: 1, agreement: "Duplicate" }),
    ];
    for (const r of everyShape) {
      const line = agreementLine(r);
      expect(line).toBeTruthy();
      expect(line!.toLowerCase()).not.toContain("engines");
    }
  });

  it("a lone engine's own repeated declaration reads 'declared twice', never 'agree'", () => {
    // The one shape a single-host machine can actually produce for
    // registration_count >= 2: `agreement_for`'s per-host duplicate check
    // forces `Duplicate` whenever every registration traces to one host_id.
    // `Consistent` never fires for that group, so this is the honest pin for
    // the one-engine case, not a hypothetical.
    const line = agreementLine(
      row({ name: "tauri", registration_count: 2, distinct_spec_count: 1, agreement: "Duplicate" })
    );
    expect(line).toBe("2 registrations · declared twice by the same engine");
    expect(line).not.toContain("agree");
  });
});

// §6.3 state 9: a project-scope override of a user-scope name is a finding
// to surface, never a silent merge. `agreement_for` groups by engine alone,
// so a machine-wide and a project-scoped declaration of the same name
// already fold into `agreementLine`'s ordinary `Duplicate`/`Conflicting`
// wording, which does not say WHY there are two — `project_override` is the
// backend's own signal for that, and `projectOverrideNote`/`cardSecondLine`
// compose the sentence around it.
describe("projectOverrideNote / cardSecondLine", () => {
  it("renders nothing when the backend found no override", () => {
    expect(projectOverrideNote(row({ name: "tauri", project_override: null }))).toBeUndefined();
    expect(projectOverrideNote(row({ name: "tauri" }))).toBeUndefined();
  });

  it("names the project when the backend flags an override", () => {
    expect(
      projectOverrideNote(
        row({ name: "tauri", project_override: "/Users/karthik/Work/hanger-ai" })
      )
    ).toBe("also declared for /Users/karthik/Work/hanger-ai — the version used there");
  });

  it("cardSecondLine appends the override note to the agreement sentence — the load-bearing case, not a silent merge", () => {
    // The exact shape the backend produces for a same-engine User+Local
    // pair with matching specs: `agreement_for` verdicts `Duplicate`
    // (registration_count 2, one host) — the override note is what stops
    // that reading from standing alone as "just a redundant duplicate."
    const line = cardSecondLine(
      row({
        name: "tauri",
        registration_count: 2,
        distinct_spec_count: 1,
        agreement: "Duplicate",
        project_override: "/Users/karthik/Work/hanger-ai",
      })
    );
    expect(line).toBe(
      "2 registrations · declared twice by the same engine · also declared for /Users/karthik/Work/hanger-ai — the version used there"
    );
    // Nothing is lost — the registration count from `agreementLine` is
    // still the whole sentence's prefix, not replaced or collapsed away.
    expect(line).toContain("2 registrations");
  });

  it("cardSecondLine falls back to the plain agreement line when there is no override", () => {
    expect(
      cardSecondLine(row({ name: "tauri", registration_count: 3, agreement: "Consistent" }))
    ).toBe("3 registrations · agree");
  });

  it("cardSecondLine renders nothing when neither an agreement line nor an override applies", () => {
    expect(cardSecondLine(row({ name: "tauri", registration_count: 1 }))).toBeUndefined();
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
