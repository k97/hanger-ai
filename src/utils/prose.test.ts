import { describe, it, expect } from "vitest";
import { joinNames, categoryNoun, abbreviateHome } from "./prose";

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

describe("abbreviateHome", () => {
  it("gives a path back the room a 168px column actually has", () => {
    // The Reach card shows one root per row at 11px mono in ~168px, roughly
    // 24 characters. "/Users/karthik/.claude/agents" is 29 and truncates;
    // the same path under a tilde is 16 and does not.
    expect(abbreviateHome("/Users/karthik/.claude/agents")).toBe("~/.claude/agents");
    expect(abbreviateHome("/Users/karthik/.agents")).toBe("~/.agents");
    expect(abbreviateHome("/home/karthik/.codex/skills")).toBe("~/.codex/skills");
  });

  it("leaves alone anything that is not somebody's home", () => {
    expect(abbreviateHome("/opt/shared/skills")).toBe("/opt/shared/skills");
    expect(abbreviateHome("/Users")).toBe("/Users");
    // The home directory itself, with nothing under it.
    expect(abbreviateHome("/Users/karthik")).toBe("~");
    expect(abbreviateHome("")).toBe("");
  });

  it("does not mistake a path that merely starts with the same letters", () => {
    // "/Usersomething" is not "/Users/<name>", and a naive prefix strip
    // would silently eat four characters of a real directory name.
    expect(abbreviateHome("/Usersomething/skills")).toBe("/Usersomething/skills");
  });
});
