import { describe, it, expect } from "vitest";

interface RuleItem {
  path: string;
  name: string;
}

function sortRulesByDepth(rules: RuleItem[]): RuleItem[] {
  return [...rules].sort((a, b) => {
    return a.path.split("/").length - b.path.split("/").length;
  });
}

describe("App Target Rules Path Sorting", () => {
  it("should sort rules root-to-deepest", () => {
    const rulesList: RuleItem[] = [
      { path: "/users/karthik/project/subfolder/deep/AGENTS.md", name: "AGENTS.md" },
      { path: "/users/karthik/project/AGENTS.md", name: "AGENTS.md" },
      { path: "/users/karthik/project/subfolder/AGENTS.md", name: "AGENTS.md" }
    ];

    const sorted = sortRulesByDepth(rulesList);

    expect(sorted[0].path).toBe("/users/karthik/project/AGENTS.md");
    expect(sorted[1].path).toBe("/users/karthik/project/subfolder/AGENTS.md");
    expect(sorted[2].path).toBe("/users/karthik/project/subfolder/deep/AGENTS.md");
  });
});
