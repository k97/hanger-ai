import { describe, it, expect } from "vitest";
import { scopeRoot, scopeAgent, scopeKind, isGlobalScope, isRepoScope, type Scope } from "./scopeAccess";

const global: Scope = { Global: { agent: "claude-code" } };
const project: Scope = { Project: { agent: "claude-code", root: "/repo/a" } };
const local: Scope = { Local: { agent: "claude-code", root: "/repo/a" } };

describe("scopeAccess", () => {
  it("resolves the root for every scope that has one", () => {
    expect(scopeRoot(global)).toBeNull();
    expect(scopeRoot(project)).toBe("/repo/a");
    expect(scopeRoot(local)).toBe("/repo/a");
  });

  it("resolves the agent for every scope", () => {
    expect(scopeAgent(global)).toBe("claude-code");
    expect(scopeAgent(project)).toBe("claude-code");
    expect(scopeAgent(local)).toBe("claude-code");
  });

  it("treats Local as a repo scope, not a global one", () => {
    // The regression this module exists to prevent: a Local-scoped server
    // matches neither `scope?.Global` nor `scope?.Project?.root`, so it was
    // discovered by the scanner and then dropped by every pane -- while
    // get_asset_counts kept counting it.
    expect(isGlobalScope(local)).toBe(false);
    expect(isRepoScope(local, "/repo/a")).toBe(true);
    expect(isRepoScope(project, "/repo/a")).toBe(true);
    expect(isRepoScope(global, "/repo/a")).toBe(false);
    expect(isRepoScope(local, "/repo/other")).toBe(false);
  });

  it("names which of the three a scope is", () => {
    // `scopeRoot` and `placeOf` both fold Project and Local to the same repo
    // name, which loses the distinction the inspector's Scope row wants:
    // committed and shared with the team, versus private to this user.
    expect(scopeKind(global)).toBe("Global");
    expect(scopeKind(project)).toBe("Project");
    expect(scopeKind(local)).toBe("Local");
  });

  it("survives undefined and malformed scopes", () => {
    expect(scopeRoot(undefined)).toBeNull();
    expect(scopeAgent(undefined)).toBeNull();
    expect(scopeKind(undefined)).toBeNull();
    expect(scopeKind({} as Scope)).toBeNull();
    expect(isGlobalScope(undefined)).toBe(false);
    expect(isRepoScope(undefined, "/repo/a")).toBe(false);
    expect(scopeRoot(null)).toBeNull();
    expect(scopeAgent({} as Scope)).toBeNull();
  });
});
