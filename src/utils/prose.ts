import type { CategoryType } from "../components/CategoryFilterCards";

/**
 * Join names the way a sentence would: "A", "A and B", "A, B and C".
 * No Oxford comma, matching the rest of Hanger's copy ("skills, rules, MCP
 * servers or subagents").
 */
export function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The noun a category goes by in running text, singular and plural. The chip
 * row says "MCP servers", so an empty state must too — "no global tools
 * found" under a chip labelled MCP servers is the mismatch this exists to
 * prevent.
 */
const CATEGORY_NOUNS: Record<CategoryType, { one: string; many: string }> = {
  Skills: { one: "skill", many: "skills" },
  Agents: { one: "agent", many: "agents" },
  Tools: { one: "MCP server", many: "MCP servers" },
  Rules: { one: "rule", many: "rules" },
  Subagents: { one: "subagent", many: "subagents" },
};

export function categoryNoun(category: CategoryType, form: "one" | "many" = "many"): string {
  return CATEGORY_NOUNS[category][form];
}
