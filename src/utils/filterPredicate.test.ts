import { describe, it, expect } from "vitest";
import { filterProfileAssets, filterRepoAssets } from "./filterPredicate";
import { Inventory } from "../App";

// Mock mixed inventory fixture containing elements across all categories
const mockInventory: Inventory = {
  agents: [
    {
      id: "claude-code",
      name: "Claude Code",
      global_config_path: "/home/user/.claude",
      project_footprints: ["/projects/my-project"]
    },
    {
      id: "gemini",
      name: "Gemini",
      global_config_path: "/home/user/.gemini",
      project_footprints: []
    }
  ],
  skills: [
    {
      id: "global-skill",
      name: "Global Skill",
      description: "Global Test Skill",
      version: "1.0.0",
      path: "/home/user/.claude/skills/test",
      scope: { Global: { agent: "claude-code" } }
    },
    {
      id: "project-skill",
      name: "Project Skill",
      description: "Project Test Skill",
      version: "1.0.0",
      path: "/projects/my-project/skills/test",
      scope: { Project: { agent: "claude-code", root: "/projects/my-project" } }
    }
  ],
  tools: [
    {
      id: "global-tool",
      name: "Global Tool",
      command: "node",
      transport: "stdio",
      config_path: "/home/user/.claude/tools.json",
      scope: { Global: { agent: "claude-code" } },
      owning_agent: "claude-code"
    },
    {
      id: "project-tool",
      name: "Project Tool",
      command: "node",
      transport: "stdio",
      config_path: "/projects/my-project/tools.json",
      scope: { Project: { agent: "claude-code", root: "/projects/my-project" } },
      owning_agent: "claude-code"
    }
  ],
  rules: [
    {
      id: "global-rule",
      name: "CLAUDE.md",
      path: "/home/user/.claude/CLAUDE.md",
      content: "global rule content",
      scope: { Global: { agent: "claude-code" } }
    },
    {
      id: "project-rule",
      name: "CLAUDE.md",
      path: "/projects/my-project/CLAUDE.md",
      content: "project rule content",
      scope: { Project: { agent: "claude-code", root: "/projects/my-project" } }
    }
  ],
  subagents: [
    {
      id: "global-subagent",
      name: "Global Researcher",
      description: "research subagent",
      path: "/home/user/.claude/agents/research.md",
      declared_tools: ["read_file"],
      scope: { Global: { agent: "claude-code" } }
    },
    {
      id: "project-subagent",
      name: "Project Assistant",
      description: "local assistant",
      path: "/projects/my-project/agents/assistant.md",
      declared_tools: ["grep_search"],
      scope: { Project: { agent: "claude-code", root: "/projects/my-project" } }
    }
  ],
  project_scans: [
    {
      path: "/projects/my-project",
      layered: false,
      rule_chains: {},
      parse_warnings: []
    }
  ]
};

describe("filterProfileAssets Utility", () => {
  it("should return all global items when selection is null (default view)", () => {
    const result = filterProfileAssets(mockInventory, null);
    expect(result.skills.length).toBe(1);
    expect(result.tools.length).toBe(1);
    expect(result.rules.length).toBe(1);
    expect(result.subagents.length).toBe(1);
    expect(result.flatAgents).toBe(false);
  });

  it("should return ONLY skills and exclude other categories when selectedCategory is Skills", () => {
    const result = filterProfileAssets(mockInventory, "Skills");
    expect(result.skills.length).toBe(1);
    expect(result.tools.length).toBe(0);
    expect(result.rules.length).toBe(0);
    expect(result.flatAgents).toBe(false);
  });

  it("should return ONLY tools and exclude skills when selectedCategory is Tools", () => {
    const result = filterProfileAssets(mockInventory, "Tools");
    expect(result.tools.length).toBe(1);
    expect(result.skills.length).toBe(0);
    expect(result.rules.length).toBe(0);
    expect(result.flatAgents).toBe(false);
  });

  it("should return ONLY rules and exclude skills when selectedCategory is Rules", () => {
    const result = filterProfileAssets(mockInventory, "Rules");
    expect(result.rules.length).toBe(1);
    expect(result.skills.length).toBe(0);
    expect(result.tools.length).toBe(0);
    expect(result.flatAgents).toBe(false);
  });

  it("should signal flatAgents when selectedCategory is Agents", () => {
    const result = filterProfileAssets(mockInventory, "Agents");
    expect(result.skills.length).toBe(0);
    expect(result.tools.length).toBe(0);
    expect(result.rules.length).toBe(0);
    expect(result.agents.length).toBe(2);
    expect(result.flatAgents).toBe(true);
  });

  it("should return ONLY subagents and exclude other categories when selectedCategory is Subagents", () => {
    const result = filterProfileAssets(mockInventory, "Subagents");
    expect(result.subagents.length).toBe(1);
    expect(result.subagents[0].id).toBe("global-subagent");
    expect(result.skills.length).toBe(0);
    expect(result.tools.length).toBe(0);
    expect(result.rules.length).toBe(0);
    expect(result.flatAgents).toBe(false);
  });
});

describe("filterRepoAssets Utility", () => {
  const repoPath = "/projects/my-project";

  it("should return all project items when selection is null", () => {
    const result = filterRepoAssets(mockInventory, repoPath, null);
    expect(result.skills.length).toBe(1);
    expect(result.tools.length).toBe(1);
    expect(result.rules.length).toBe(1);
    expect(result.agents.length).toBe(1); // claude-code has footprint in repo
    expect(result.subagents.length).toBe(1);
  });

  it("should return ONLY repo skills when selectedCategory is Skills", () => {
    const result = filterRepoAssets(mockInventory, repoPath, "Skills");
    expect(result.skills.length).toBe(1);
    expect(result.skills[0].id).toBe("project-skill");
    expect(result.tools.length).toBe(0);
    expect(result.rules.length).toBe(0);
    expect(result.agents.length).toBe(0);
  });

  it("should return ONLY repo tools when selectedCategory is Tools", () => {
    const result = filterRepoAssets(mockInventory, repoPath, "Tools");
    expect(result.tools.length).toBe(1);
    expect(result.tools[0].id).toBe("project-tool");
    expect(result.skills.length).toBe(0);
    expect(result.rules.length).toBe(0);
    expect(result.agents.length).toBe(0);
  });

  it("should return ONLY repo rules when selectedCategory is Rules", () => {
    const result = filterRepoAssets(mockInventory, repoPath, "Rules");
    expect(result.rules.length).toBe(1);
    expect(result.rules[0].id).toBe("project-rule");
    expect(result.skills.length).toBe(0);
    expect(result.tools.length).toBe(0);
    expect(result.agents.length).toBe(0);
  });

  it("should return ONLY repo agents when selectedCategory is Agents", () => {
    const result = filterRepoAssets(mockInventory, repoPath, "Agents");
    expect(result.agents.length).toBe(1);
    expect(result.agents[0].id).toBe("claude-code");
    expect(result.skills.length).toBe(0);
    expect(result.tools.length).toBe(0);
    expect(result.rules.length).toBe(0);
  });

  it("should return ONLY repo subagents when selectedCategory is Subagents", () => {
    const result = filterRepoAssets(mockInventory, repoPath, "Subagents");
    expect(result.subagents.length).toBe(1);
    expect(result.subagents[0].id).toBe("project-subagent");
    expect(result.skills.length).toBe(0);
    expect(result.tools.length).toBe(0);
    expect(result.rules.length).toBe(0);
    expect(result.agents.length).toBe(0);
  });
});

describe("MCP server rows are per registration, not per file", () => {
  const threeInOneFile: Inventory = {
    agents: [], skills: [], rules: [], subagents: [], project_scans: [],
    tools: [
      { id: "/home/.codex/config.toml-node_repl", name: "node_repl", command: "node",
        transport: "stdio", config_path: "/home/.codex/config.toml",
        scope: { Global: { agent: "codex" } }, owning_agent: "codex" },
      { id: "/home/.codex/config.toml-computer-use", name: "computer-use", command: "codex",
        transport: "stdio", config_path: "/home/.codex/config.toml",
        scope: { Global: { agent: "codex" } }, owning_agent: "codex" },
      { id: "/home/.codex/config.toml-tauri", name: "tauri", command: "npx",
        transport: "stdio", config_path: "/home/.codex/config.toml",
        scope: { Global: { agent: "codex" } }, owning_agent: "codex" },
    ],
  } as unknown as Inventory;

  it("keeps every server declared by a single config file", () => {
    // Deduplicating on config_path collapsed a three-server file to one row.
    // A config file is not an asset; each server in it is.
    const { tools } = filterProfileAssets(threeInOneFile, null);
    expect(tools.map((t) => t.name).sort()).toEqual(["computer-use", "node_repl", "tauri"]);
  });

  it("still collapses a genuinely repeated registration", () => {
    const doubled = {
      ...threeInOneFile,
      tools: [...threeInOneFile.tools, threeInOneFile.tools[0]],
    } as unknown as Inventory;
    const { tools } = filterProfileAssets(doubled, null);
    expect(tools.length).toBe(3);
  });

  it("keeps the same server registered by two different files", () => {
    const twoFiles = {
      ...threeInOneFile,
      tools: [
        threeInOneFile.tools[0],
        { ...threeInOneFile.tools[0], id: "/home/.claude/mcp.json-node_repl",
          config_path: "/home/.claude/mcp.json" },
      ],
    } as unknown as Inventory;
    const { tools } = filterProfileAssets(twoFiles, null);
    expect(tools.length).toBe(2);
  });
});
