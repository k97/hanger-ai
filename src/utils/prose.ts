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

/**
 * A path with the home directory folded to `~`, for columns too narrow to
 * carry the whole thing. `/Users/karthik/.claude/agents` is 29 characters
 * against roughly 24 the Reach card's root column can hold at 11px mono;
 * under a tilde it is 16 and does not truncate.
 *
 * The frontend has no `$HOME`, so this matches the shape rather than the
 * value: one segment under `/Users` or `/home`. That is deliberately narrow —
 * a looser rule would fold `/Users` alone, or eat the first four characters of
 * a directory genuinely named `/Usersomething`. A path that is not somebody's
 * home comes back untouched, which is the honest outcome for a shared or
 * system location.
 */
export function abbreviateHome(path: string): string {
  return path.replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, "~");
}
