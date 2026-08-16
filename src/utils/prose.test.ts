import { describe, it, expect } from "vitest";
import { joinNames, categoryNoun } from "./prose";

describe("joinNames", () => {
  it("reads as a sentence would at every length", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Claude Code"])).toBe("Claude Code");
    expect(joinNames(["Claude Code", "Codex"])).toBe("Claude Code and Codex");
    expect(joinNames(["Claude Code", "Codex", "Gemini / Antigravity"])).toBe(
      "Claude Code, Codex and Gemini / Antigravity"
    );
  });
});

describe("categoryNoun", () => {
  it("says MCP servers where the chip row says MCP servers, never 'tools'", () => {
    expect(categoryNoun("Tools")).toBe("MCP servers");
    expect(categoryNoun("Tools", "one")).toBe("MCP server");
  });

  it("lowercases the rest, singular and plural", () => {
    expect(categoryNoun("Skills")).toBe("skills");
    expect(categoryNoun("Skills", "one")).toBe("skill");
    expect(categoryNoun("Rules", "one")).toBe("rule");
    expect(categoryNoun("Subagents")).toBe("subagents");
    expect(categoryNoun("Agents", "one")).toBe("agent");
  });
});
