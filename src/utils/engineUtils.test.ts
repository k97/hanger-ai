import { describe, it, expect } from "vitest";
import { formatEngineLabel, isAnyAgent } from "./engineUtils";

describe("isAnyAgent", () => {
  it("is true for every value the label treats as Any agent", () => {
    for (const v of [null, undefined, "", "   ", "none", "NONE", "unknown", " Unknown "]) {
      expect(isAnyAgent(v), String(v)).toBe(true);
    }
  });

  it("is true for the label itself, because label sites pass labels", () => {
    // hostLabel() hands "Any agent" to EngineLabel for a loose config.
    for (const v of ["Any agent", "any agent", " ANY AGENT "]) {
      expect(isAnyAgent(v), v).toBe(true);
    }
  });

  it("is false for engine keys, host ids and display names", () => {
    for (const v of ["claude_code", "claude-code", "codex", "Gemini / Antigravity", "kiro"]) {
      expect(isAnyAgent(v), v).toBe(false);
    }
  });
});

describe("formatEngineLabel", () => {
  it("still says Any agent for the same values and passes names through trimmed", () => {
    expect(formatEngineLabel(null)).toBe("Any agent");
    expect(formatEngineLabel("none")).toBe("Any agent");
    expect(formatEngineLabel(" Claude Code ")).toBe("Claude Code");
  });
});
