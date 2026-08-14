import { isGlobalScope, isRepoScope, type Scope } from "./scopeAccess";
import { Inventory, Skill, Tool, Rule, Agent, Subagent } from "../App";

export type CategoryType = "Skills" | "Agents" | "Tools" | "Rules" | "Subagents";

export interface FilteredProfileResult {
  skills: Skill[];
  tools: Tool[];
  rules: Rule[];
  agents: Agent[];
  subagents: Subagent[];
  flatAgents: boolean;
}

function deduplicateSkills(skills: Skill[]): Skill[] {
  const seen = new Set<string>();
  return skills.filter((s) => {
    if (seen.has(s.path)) return false;
    seen.add(s.path);
    return true;
  });
}

/**
 * Deduplicate MCP server rows by *registration*, not by config file.
 *
 * This keyed on `config_path`, which meant one file declaring three servers
 * rendered as a single row — `~/.codex/config.toml` has three, `~/.claude.json`
 * has three. A config file is not an asset; each server declared in it is.
 *
 * `Tool.id` is the backend's own identity for a registration
 * (`{config_path}-{name}`), so the same server registered by two different
 * hosts stays two rows. That cross-host coverage is the feature.
 */
function deduplicateTools(tools: Tool[]): Tool[] {
  const seen = new Set<string>();
  return tools.filter((t) => {
    const key = t.id ?? `${t.config_path}-${t.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deduplicateRules(rules: Rule[]): Rule[] {
  const seen = new Set<string>();
  return rules.filter((r) => {
    if (seen.has(r.path)) return false;
    seen.add(r.path);
    return true;
  });
}

function deduplicateAgents(agents: Agent[]): Agent[] {
  const seen = new Set<string>();
  return agents.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}

function deduplicateSubagents(subagents: Subagent[]): Subagent[] {
  const seen = new Set<string>();
  return subagents.filter((sa) => {
    if (seen.has(sa.path)) return false;
    seen.add(sa.path);
    return true;
  });
}

export function filterProfileAssets(
  inventory: Inventory | null,
  selectedCategory: CategoryType | null
): FilteredProfileResult {
  const agents = deduplicateAgents(inventory?.agents || []);
  const globalSkills = deduplicateSkills(inventory?.skills.filter((s) => isGlobalScope(s.scope as Scope)) || []);
  const globalTools = deduplicateTools(inventory?.tools.filter((t) => isGlobalScope(t.scope as Scope)) || []);
  const globalRules = deduplicateRules(inventory?.rules.filter((r) => isGlobalScope(r.scope as Scope)) || []);
  const globalSubagents = deduplicateSubagents(inventory?.subagents.filter((sa) => isGlobalScope(sa.scope as Scope)) || []);

  if (selectedCategory === "Skills") {
    return {
      skills: globalSkills,
      tools: [],
      rules: [],
      agents,
      subagents: [],
      flatAgents: false,
    };
  }
  if (selectedCategory === "Tools") {
    return {
      skills: [],
      tools: globalTools,
      rules: [],
      agents,
      subagents: [],
      flatAgents: false,
    };
  }
  if (selectedCategory === "Rules") {
    return {
      skills: [],
      tools: [],
      rules: globalRules,
      agents,
      subagents: [],
      flatAgents: false,
    };
  }
  if (selectedCategory === "Agents") {
    return {
      skills: [],
      tools: [],
      rules: [],
      agents,
      subagents: [],
      flatAgents: true,
    };
  }
  if (selectedCategory === "Subagents") {
    return {
      skills: [],
      tools: [],
      rules: [],
      agents,
      subagents: globalSubagents,
      flatAgents: false,
    };
  }

  // selectedCategory === null (All)
  return {
    skills: globalSkills,
    tools: globalTools,
    rules: globalRules,
    subagents: globalSubagents,
    agents: [],
    flatAgents: false,
  };
}

export interface FilteredRepoResult {
  skills: Skill[];
  tools: Tool[];
  rules: Rule[];
  agents: Agent[];
  subagents: Subagent[];
}

export function filterRepoAssets(
  inventory: Inventory | null,
  repoPath: string,
  selectedCategory: CategoryType | null
): FilteredRepoResult {
  const repoSkills = deduplicateSkills(inventory?.skills.filter(
    (s) => isRepoScope(s.scope as Scope, repoPath)
  ) || []);

  const repoTools = deduplicateTools(inventory?.tools.filter(
    (t) => isRepoScope(t.scope as Scope, repoPath)
  ) || []);

  const repoRules = deduplicateRules(inventory?.rules.filter(
    (r) => isRepoScope(r.scope as Scope, repoPath)
  ) || []);

  const repoAgents = deduplicateAgents(inventory?.agents.filter(
    (a) => a.project_footprints.includes(repoPath)
  ) || []);

  const repoSubagents = deduplicateSubagents(inventory?.subagents.filter(
    (sa) => isRepoScope(sa.scope as Scope, repoPath)
  ) || []);

  if (selectedCategory === "Skills") {
    return {
      skills: repoSkills,
      tools: [],
      rules: [],
      agents: [],
      subagents: [],
    };
  }
  if (selectedCategory === "Tools") {
    return {
      skills: [],
      tools: repoTools,
      rules: [],
      agents: [],
      subagents: [],
    };
  }
  if (selectedCategory === "Rules") {
    return {
      skills: [],
      tools: [],
      rules: repoRules,
      agents: [],
      subagents: [],
    };
  }
  if (selectedCategory === "Agents") {
    return {
      skills: [],
      tools: [],
      rules: [],
      agents: repoAgents,
      subagents: [],
    };
  }
  if (selectedCategory === "Subagents") {
    return {
      skills: [],
      tools: [],
      rules: [],
      agents: [],
      subagents: repoSubagents,
    };
  }

  // selectedCategory === null (All)
  return {
    skills: repoSkills,
    tools: repoTools,
    rules: repoRules,
    agents: repoAgents,
    subagents: repoSubagents,
  };
}
