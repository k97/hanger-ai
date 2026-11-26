import { describe, it, expect } from "vitest";
import type { EngineContext } from "../types/engineContext";
import {
  ALL_ENGINES,
  ENGINES_CAPTION,
  ENGINES_HEAD,
  STORE_HEAD,
  compactTokens,
  engineRowValue,
  overviewButtonLabel,
  pinLabel,
  rankEngines,
  storeAssetsLabel,
} from "./overviewCopy";

/** An engine as `get_engine_contexts` sends it: the figures are the
 *  backend's, so a fixture states them, never derives them. */
function engine(id: string, name: string, tokens: number, counts: { on: number; measured: number }): EngineContext {
  return {
    engine_id: id,
    engine_key: id.replace(/-/g, "_"),
    engine_name: name,
    applies: null,
    switches_by_name: false,
    items: [],
    on_count: counts.on,
    off_count: 0,
    measured_on_count: counts.measured,
    on_tokens_measured: tokens,
  };
}

// The plan's own example engines (docs/plans/2026-11-26-overview-card.md,
// Task 3 Step 1). Claude.ai's figure is "null": servers on, none measured,
// which `measuredBudget` reads as no figure at all.
const CLAUDE_CODE = engine("claude-code", "Claude Code", 13598, { on: 17, measured: 11 });
const CODEX = engine("codex", "Codex", 9951, { on: 9, measured: 9 });
const CLAUDE_AI = engine("claude-ai", "Claude.ai", 0, { on: 3, measured: 0 });

describe("the overview card's strings (round 14 q5)", () => {
  it("names the window-bar button by what a click does, with its shortcut", () => {
    expect(overviewButtonLabel(false)).toBe("Show overview  ⌘E");
    expect(overviewButtonLabel(true)).toBe("Hide overview  ⌘E");
  });

  it("names the pin button by what a click does", () => {
    expect(pinLabel(false)).toBe("Pin to the inspector");
    expect(pinLabel(true)).toBe("Unpin from the inspector");
  });

  it("heads the sections with the approved words", () => {
    expect(ENGINES_HEAD).toBe("Engines");
    expect(ENGINES_CAPTION).toBe("tokens every session");
    expect(STORE_HEAD).toBe("The global store");
    expect(ALL_ENGINES).toBe("All engines");
  });

  it("prints the store total as '{n} assets'", () => {
    expect(storeAssetsLabel(892)).toBe("892 assets");
    expect(storeAssetsLabel(1158)).toBe("1,158 assets");
  });

  it("prints an engine's figure compact, or Not measured", () => {
    expect(engineRowValue(CLAUDE_CODE)).toBe("≈ 13.6k");
    expect(engineRowValue(CODEX)).toBe("≈ 10.0k");
    // Zero with servers on is no figure: "≈ 0" would claim a cost nobody read.
    expect(engineRowValue(CLAUDE_AI)).toBe("Not measured");
    // Nothing on is a true zero.
    expect(engineRowValue(engine("zed", "Zed", 0, { on: 0, measured: 0 }))).toBe("≈ 0");
  });
});

describe("compactTokens", () => {
  it("rounds to one decimal in thousands", () => {
    expect(compactTokens(13598)).toBe("13.6k");
    expect(compactTokens(9951)).toBe("10.0k");
    expect(compactTokens(1000)).toBe("1.0k");
  });

  it("leaves a figure under a thousand whole", () => {
    expect(compactTokens(0)).toBe("0");
    expect(compactTokens(950)).toBe("950");
  });

  it("moves to millions before a thousand thousands", () => {
    expect(compactTokens(999_949)).toBe("999.9k");
    expect(compactTokens(999_950)).toBe("1.0M");
    expect(compactTokens(2_350_000)).toBe("2.4M");
  });
});

describe("rankEngines", () => {
  it("orders by tokens every session, heaviest first, not-measured last", () => {
    expect(rankEngines([CLAUDE_AI, CODEX, CLAUDE_CODE]).map((e) => e.engine_name)).toEqual([
      "Claude Code",
      "Codex",
      "Claude.ai",
    ]);
  });

  it("keeps a zero-with-servers-on engine below every measured one, a true zero included", () => {
    const nothingOn = engine("zed", "Zed", 0, { on: 0, measured: 0 });
    expect(rankEngines([CLAUDE_AI, nothingOn, CODEX]).map((e) => e.engine_id)).toEqual(["codex", "zed", "claude-ai"]);
  });

  it("breaks a tie by name, measured and not alike", () => {
    const a = engine("b-id", "Alpha", 500, { on: 1, measured: 1 });
    const b = engine("a-id", "Beta", 500, { on: 1, measured: 1 });
    const c = engine("c-id", "Delta", 0, { on: 2, measured: 0 });
    const d = engine("d-id", "Charlie", 0, { on: 2, measured: 0 });
    expect(rankEngines([b, c, a, d]).map((e) => e.engine_name)).toEqual(["Alpha", "Beta", "Charlie", "Delta"]);
  });

  it("returns a new array and leaves the caller's order alone", () => {
    const input = [CLAUDE_AI, CODEX, CLAUDE_CODE];
    rankEngines(input);
    expect(input.map((e) => e.engine_id)).toEqual(["claude-ai", "codex", "claude-code"]);
  });
});
