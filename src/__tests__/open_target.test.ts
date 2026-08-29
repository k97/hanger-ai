import { describe, it, expect } from "vitest";
import { assetOpenTarget } from "../openTarget";

describe("assetOpenTarget", () => {
  it("opens a skill's folder, which is its own path", () => {
    expect(assetOpenTarget({ category: "Skills", path: "/Users/k/.agents/skills/ui-typography" }))
      .toBe("/Users/k/.agents/skills/ui-typography");
  });

  it("opens a rule's own file", () => {
    expect(assetOpenTarget({ category: "Rules", path: "/Users/k/Work/proj/CLAUDE.md" }))
      .toBe("/Users/k/Work/proj/CLAUDE.md");
  });

  it("opens a subagent's own file", () => {
    expect(assetOpenTarget({ category: "Subagents", path: "/Users/k/.gemini/agents/a11y_agent.md" }))
      .toBe("/Users/k/.gemini/agents/a11y_agent.md");
  });

  it("opens the config file a tool is declared in, not the registration key", () => {
    expect(assetOpenTarget({ category: "Tools", path: "/Users/k/.mcp.json:skill-retrieval" }))
      .toBe("/Users/k/.mcp.json");
  });

  it("splits a tool key on the LAST colon, so a server name may not eat the path", () => {
    expect(assetOpenTarget({ category: "Tools", path: "/Users/k/a:b/.mcp.json:my-server" }))
      .toBe("/Users/k/a:b/.mcp.json");
  });

  it("returns a tool path unchanged when it carries no separator", () => {
    expect(assetOpenTarget({ category: "Tools", path: "/Users/k/.mcp.json" }))
      .toBe("/Users/k/.mcp.json");
  });
});
