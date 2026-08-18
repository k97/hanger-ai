import { describe, it, expect } from "vitest";
import type { Inventory } from "../App";
import { deriveReviewIssues, matchesIssueFilter } from "./reviewIssues";

const EMPTY: Inventory = {
  skills: [],
  agents: [],
  tools: [],
  rules: [],
  subagents: [],
  project_scans: [],
};

const global = (agent = "claude") => ({ Global: { agent } });
const project = (root: string, agent = "claude") => ({ Project: { agent, root } });

function skill(over: Partial<Inventory["skills"][number]>): Inventory["skills"][number] {
  return {
    id: over.path ?? "id",
    name: "a-skill",
    description: "",
    version: "1",
    path: "/tmp/a-skill",
    ...over,
  } as Inventory["skills"][number];
}

describe("deriveReviewIssues — repo-level problems", () => {
  it("finds nothing in a clean inventory", () => {
    const { issues, counts } = deriveReviewIssues(EMPTY);
    expect(issues).toEqual([]);
    expect(counts.total).toBe(0);
  });

  it("reads a broken link as a missing target, and keeps what it pointed at", () => {
    const inventory: Inventory = {
      ...EMPTY,
      skills: [
        skill({
          name: "chrome-cdp",
          path: "/repo/.claude/skills/chrome-cdp",
          scope: project("/repo"),
          link_state: "broken",
          is_symlink: true,
          source_path: "/home/me/.gemini/skills/chrome-cdp",
        }),
      ],
    };

    const { issues, counts } = deriveReviewIssues(inventory);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("broken");
    expect(issues[0].problem).toBe("Target missing");
    expect(issues[0].sourcePath).toBe("/home/me/.gemini/skills/chrome-cdp");
    expect(issues[0].whereLabel).toBe("repo");
    expect(issues[0].crossRepo).toBe(false);
    expect(counts.broken).toBe(1);
    expect(counts.total).toBe(1);
  });

  it("reads a diverged copy as drift", () => {
    const inventory: Inventory = {
      ...EMPTY,
      skills: [
        skill({
          name: "brand-voice",
          path: "/repo/.claude/skills/brand-voice",
          scope: project("/repo"),
          link_state: "drifted",
          source_path: "/home/me/.agents/skills/brand-voice",
        }),
      ],
    };

    const { issues, counts } = deriveReviewIssues(inventory);
    expect(issues[0].kind).toBe("drifted");
    expect(issues[0].problem).toBe("Copy diverged");
    expect(counts.drifted).toBe(1);
  });

  it("reads a parse failure as invalid front matter, carrying the parser's own words", () => {
    const inventory: Inventory = {
      ...EMPTY,
      skills: [
        skill({
          name: "firebase-basics",
          path: "/repo/.claude/skills/firebase-basics",
          scope: project("/repo"),
          parse_status: "failed",
          parse_error: "missing required key: description",
        }),
      ],
    };

    const { issues, counts } = deriveReviewIssues(inventory);
    expect(issues[0].kind).toBe("parse");
    expect(issues[0].problem).toBe("Front matter invalid");
    expect(issues[0].detail).toBe("missing required key: description");
    expect(counts.parse).toBe(1);
  });

  it("labels a global asset as Global, not as a repository", () => {
    const inventory: Inventory = {
      ...EMPTY,
      skills: [
        skill({
          name: "chrome-cdp",
          path: "/home/me/.agents/skills/chrome-cdp",
          scope: global(),
          link_state: "broken",
        }),
      ],
    };

    const { issues } = deriveReviewIssues(inventory);
    expect(issues[0].whereLabel).toBe("Global");
    expect(issues[0].whereKeys).toEqual(["global"]);
  });

  it("covers every asset kind, not just skills", () => {
    const inventory: Inventory = {
      ...EMPTY,
      tools: [
        {
          id: "t", name: "a-tool", command: "node", transport: "stdio",
          config_path: "/repo/.mcp.json", scope: project("/repo"), owning_agent: "claude",
          link_state: "broken",
        } as Inventory["tools"][number],
      ],
      rules: [
        {
          id: "r", name: "a-rule", path: "/repo/CLAUDE.md", content: "",
          scope: project("/repo"), link_state: "drifted",
        } as Inventory["rules"][number],
      ],
      subagents: [
        {
          id: "s", name: "a-subagent", description: "", path: "/repo/.claude/agents/a.md",
          declared_tools: [], scope: project("/repo"), parse_status: "failed",
        } as Inventory["subagents"][number],
      ],
    };

    const { issues, counts } = deriveReviewIssues(inventory);
    expect(counts.total).toBe(3);
    const categories = issues.map((i) => i.category).sort();
    expect(categories).toEqual(["Rules", "Subagents", "Tools"]);
  });
});

describe("deriveReviewIssues — problems that span repositories", () => {
  it("reports one duplicate issue for a name that exists in two repositories", () => {
    const inventory: Inventory = {
      ...EMPTY,
      skills: [
        skill({ name: "agent-browser", path: "/one/.claude/skills/agent-browser", scope: project("/one") }),
        skill({ name: "agent-browser", path: "/two/.claude/skills/agent-browser", scope: project("/two") }),
      ],
    };

    const { issues, counts } = deriveReviewIssues(inventory);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("duplicate");
    expect(issues[0].crossRepo).toBe(true);
    expect(issues[0].whereLabel).toBe("2 repos");
    expect(issues[0].copies).toEqual([
      "/one/.claude/skills/agent-browser",
      "/two/.claude/skills/agent-browser",
    ]);
    expect(counts.duplicate).toBe(1);
    expect(counts.crossRepo).toBe(1);
  });

  it("counts copies against their sources so consolidation has a target", () => {
    const inventory: Inventory = {
      ...EMPTY,
      skills: [
        skill({
          name: "agent-browser", path: "/one/.claude/skills/agent-browser", scope: project("/one"),
          is_symlink: true, source_path: "/home/me/.agents/skills/agent-browser",
        }),
        skill({
          name: "agent-browser", path: "/two/.claude/skills/agent-browser", scope: project("/two"),
          is_symlink: true, source_path: "/home/me/.agents/skills/agent-browser",
        }),
        skill({
          name: "agent-browser", path: "/three/.claude/skills/agent-browser", scope: project("/three"),
        }),
      ],
    };

    const { issues } = deriveReviewIssues(inventory);
    expect(issues[0].problem).toBe("3 copies, 1 source");
  });

  it("does not call a duplicate cross-repo when both copies live in one repository", () => {
    const inventory: Inventory = {
      ...EMPTY,
      skills: [
        skill({ name: "dup", path: "/one/.claude/skills/dup", scope: project("/one") }),
        skill({ name: "dup", path: "/one/.gemini/skills/dup", scope: project("/one") }),
      ],
    };

    const { issues, counts } = deriveReviewIssues(inventory);
    expect(issues[0].kind).toBe("duplicate");
    expect(issues[0].crossRepo).toBe(false);
    expect(issues[0].whereLabel).toBe("one");
    expect(counts.crossRepo).toBe(0);
  });

  it("treats one asset in one place as no duplicate at all", () => {
    const inventory: Inventory = {
      ...EMPTY,
      skills: [skill({ name: "solo", path: "/one/.claude/skills/solo", scope: project("/one") })],
    };
    expect(deriveReviewIssues(inventory).issues).toEqual([]);
  });

  it("names the other links a broken source also feeds, across repositories", () => {
    const shared = "/home/me/.agents/skills/chrome-cdp";
    const inventory: Inventory = {
      ...EMPTY,
      skills: [
        skill({
          name: "chrome-cdp", path: "/one/.claude/skills/chrome-cdp", scope: project("/one"),
          link_state: "broken", is_symlink: true, source_path: shared,
        }),
        skill({
          name: "chrome-cdp", path: "/two/.claude/skills/chrome-cdp", scope: project("/two"),
          link_state: "linked", is_symlink: true, source_path: shared,
        }),
        skill({
          name: "chrome-cdp", path: "/three/.claude/skills/chrome-cdp", scope: project("/three"),
          link_state: "linked", is_symlink: true, source_path: shared,
        }),
      ],
    };

    const { issues } = deriveReviewIssues(inventory);
    const broken = issues.find((i) => i.kind === "broken")!;
    expect(broken.siblings).toEqual([
      "/two/.claude/skills/chrome-cdp",
      "/three/.claude/skills/chrome-cdp",
    ]);
    expect(broken.crossRepo).toBe(true);
    expect(broken.whereLabel).toBe("one");
  });

  it("leaves a lone broken link alone rather than inventing a fan-out", () => {
    const inventory: Inventory = {
      ...EMPTY,
      skills: [
        skill({
          name: "solo", path: "/one/.claude/skills/solo", scope: project("/one"),
          link_state: "broken", is_symlink: true, source_path: "/home/me/.agents/skills/solo",
        }),
      ],
    };
    const { issues } = deriveReviewIssues(inventory);
    expect(issues[0].siblings).toBeUndefined();
    expect(issues[0].crossRepo).toBe(false);
  });
});

describe("deriveReviewIssues — places", () => {
  it("lists every place carrying an issue, with its own tally", () => {
    const inventory: Inventory = {
      ...EMPTY,
      skills: [
        skill({ name: "a", path: "/one/a", scope: project("/one"), link_state: "broken" }),
        skill({ name: "b", path: "/one/b", scope: project("/one"), link_state: "drifted" }),
        skill({ name: "c", path: "/g/c", scope: global(), parse_status: "failed" }),
      ],
    };

    const { places } = deriveReviewIssues(inventory);
    expect(places).toEqual([
      { key: "/one", label: "one", count: 2 },
      { key: "global", label: "Global", count: 1 },
    ]);
  });
});

describe("matchesIssueFilter", () => {
  const issue = {
    id: "1",
    name: "chrome-cdp",
    category: "Skills" as const,
    kind: "broken" as const,
    problem: "Target missing",
    path: "/one/.claude/skills/chrome-cdp",
    sourcePath: "/home/me/.agents/skills/chrome-cdp",
    whereLabel: "one",
    whereKeys: ["/one"],
    crossRepo: false,
  };

  it("passes everything with no filters", () => {
    expect(matchesIssueFilter(issue, null, null, "")).toBe(true);
  });

  it("narrows by problem kind", () => {
    expect(matchesIssueFilter(issue, "broken", null, "")).toBe(true);
    expect(matchesIssueFilter(issue, "drifted", null, "")).toBe(false);
  });

  it("narrows by place, and 'cross' selects only issues that span repositories", () => {
    expect(matchesIssueFilter(issue, null, "/one", "")).toBe(true);
    expect(matchesIssueFilter(issue, null, "/two", "")).toBe(false);
    expect(matchesIssueFilter(issue, null, "cross", "")).toBe(false);
    expect(matchesIssueFilter({ ...issue, crossRepo: true }, null, "cross", "")).toBe(true);
  });

  it("'repo' selects everything a single repository can resolve on its own", () => {
    expect(matchesIssueFilter(issue, null, "repo", "")).toBe(true);
    expect(matchesIssueFilter({ ...issue, crossRepo: true }, null, "repo", "")).toBe(false);
  });

  it("searches the name, the problem and the paths", () => {
    expect(matchesIssueFilter(issue, null, null, "chrome")).toBe(true);
    expect(matchesIssueFilter(issue, null, null, "missing")).toBe(true);
    expect(matchesIssueFilter(issue, null, null, ".agents")).toBe(true);
    expect(matchesIssueFilter(issue, null, null, "postgres")).toBe(false);
  });
});

/**
 * Candidates were deduplicated by `${category}::${path}`, and for a Tool
 * `path` is the config FILE. `~/.claude.json` declares ten servers and
 * contributed one candidate; the other nine never reached the pane.
 *
 * Both fixtures below are required, and neither is reachable from a
 * global-only inventory — which is why this shipped. The harm is the second
 * test: a server whose config will not parse is not merely miscounted, it is
 * reported as clean.
 */
function mcp(over: Record<string, unknown>): Inventory["tools"][number] {
  const config_path = (over.config_path as string) ?? "/home/.claude.json";
  const name = (over.name as string) ?? "srv";
  return {
    id: `${config_path}:${name}`,
    name,
    command: "npx",
    args: [],
    launch_display: "npx server",
    transport: "stdio",
    config_path,
    scope: global(),
    owning_agent: "claude-code",
    ...over,
  } as Inventory["tools"][number];
}

describe("deriveReviewIssues — many servers, one config file", () => {
  it("sees a project server that the user also declares globally", () => {
    // The real shape: `mei-recipes` is declared in its own repo's .mcp.json
    // and again in ~/.claude.json, where it is the seventh of ten servers.
    // Deduplicating on the config file kept only `chrome-devtools` from that
    // file, so the global copy vanished and the conflict read as a single
    // untroubled registration.
    const inventory: Inventory = {
      ...EMPTY,
      tools: [
        mcp({ name: "chrome-devtools", config_path: "/home/.claude.json" }),
        mcp({ name: "mei-recipes", config_path: "/home/.claude.json" }),
        mcp({
          name: "mei-recipes",
          config_path: "/repo/mei-recipes/.mcp.json",
          scope: project("/repo/mei-recipes"),
        }),
      ],
    };

    const { issues, counts } = deriveReviewIssues(inventory);
    const dupes = issues.filter((i) => i.kind === "duplicate" && i.name === "mei-recipes");

    expect(dupes).toHaveLength(1);
    expect(dupes[0].copies).toEqual([
      "/home/.claude.json",
      "/repo/mei-recipes/.mcp.json",
    ]);
    expect(counts.duplicate).toBe(1);
  });

  it("reports a parse failure in a server that is not the file's first", () => {
    // The dangerous half. A dropped candidate never reaches `faultOf`, so its
    // parse failure is not downgraded or mislabelled — it is absent, and the
    // file reads as clean. Benign on the development machine only because
    // every current failure happens to be a skill or a subagent.
    const inventory: Inventory = {
      ...EMPTY,
      tools: [
        mcp({ name: "alpha", config_path: "/home/.claude.json" }),
        mcp({
          name: "beta",
          config_path: "/home/.claude.json",
          parse_status: "failed",
          parse_error: "expected value at line 3",
        }),
      ],
    };

    const { issues, counts } = deriveReviewIssues(inventory);
    const parse = issues.filter((i) => i.kind === "parse");

    expect(parse).toHaveLength(1);
    expect(parse[0].name).toBe("beta");
    expect(counts.parse).toBe(1);
  });
});

describe("deriveReviewIssues — two faults in one config file", () => {
  it("gives two failing servers in one file two distinct issue ids", () => {
    // Reachable only since the dedup fix: before it, the second server never
    // survived to reach the id expression, so the collision could not fire.
    // `id` is built from `candidate.path`, which for a Tool is the config
    // FILE — so two servers in one file with the same fault stringify
    // identically. That is a React key collision and a filter-identity
    // collision, not a cosmetic one.
    const inventory: Inventory = {
      ...EMPTY,
      tools: [
        mcp({
          name: "alpha", config_path: "/home/.claude.json",
          parse_status: "failed", parse_error: "expected value at line 3",
        }),
        mcp({
          name: "beta", config_path: "/home/.claude.json",
          parse_status: "failed", parse_error: "trailing comma at line 9",
        }),
      ],
    };

    const parse = deriveReviewIssues(inventory).issues.filter((i) => i.kind === "parse");

    expect(parse).toHaveLength(2);
    expect(new Set(parse.map((i) => i.id)).size).toBe(2);
  });
});
