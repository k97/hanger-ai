import { describe, it, expect } from "vitest";
import type { Inventory } from "../App";
import { engineLabel, provenanceOf, originRow } from "./assetProvenance";

const SOURCE = "/home/me/.agents/skills/agent-browser";

const skill = (over: Record<string, unknown>) =>
  ({ id: "x", name: "agent-browser", description: "", version: "1", path: "/p", ...over }) as never;

function inventoryOf(skills: unknown[]): Inventory {
  return {
    agents: [],
    tools: [],
    rules: [],
    subagents: [],
    project_scans: [],
    skills: skills as Inventory["skills"],
  };
}

describe("provenanceOf", () => {
  it("counts the projects a source has been symlinked into", () => {
    const inventory = inventoryOf([
      skill({ path: SOURCE, scope: { Global: { agent: "claude" } } }),
      skill({ path: "/one/.claude/skills/agent-browser", scope: { Project: { agent: "claude", root: "/one" } }, is_symlink: true, source_path: SOURCE }),
      skill({ path: "/two/.claude/skills/agent-browser", scope: { Project: { agent: "claude", root: "/two" } }, is_symlink: true, source_path: SOURCE }),
      skill({ path: "/three/.claude/skills/agent-browser", scope: { Project: { agent: "claude", root: "/three" } }, is_symlink: true, source_path: SOURCE }),
    ]);

    const source = provenanceOf(inventory.skills[0] as never, inventory);
    expect(source.linkedInto).toEqual(["one", "two", "three"]);
    expect(source.statement).toBe("The source for 3 copies");
    expect(source.place).toBe("Global");
  });

  it("reads the same relationship from the link's end", () => {
    const inventory = inventoryOf([
      skill({ path: SOURCE, scope: { Global: { agent: "claude" } } }),
      skill({ path: "/one/x", scope: { Project: { agent: "claude", root: "/one" } }, is_symlink: true, source_path: SOURCE }),
      skill({ path: "/two/x", scope: { Project: { agent: "claude", root: "/two" } }, is_symlink: true, source_path: SOURCE }),
    ]);

    const link = provenanceOf(inventory.skills[1] as never, inventory);
    expect(link.statement).toBe("Symlinked into 2 projects");
    expect(link.source).toBe(SOURCE);
    expect(link.place).toBe("one");
  });

  it("names the single project rather than counting to one", () => {
    const inventory = inventoryOf([
      skill({ path: SOURCE, scope: { Global: { agent: "claude" } } }),
      skill({ path: "/metrics-board/x", scope: { Project: { agent: "claude", root: "/metrics-board" } }, is_symlink: true, source_path: SOURCE }),
    ]);
    expect(provenanceOf(inventory.skills[0] as never, inventory).statement).toBe(
      "The source for the copy in metrics-board"
    );
  });

  it("says plainly when nothing links to a local file", () => {
    const inventory = inventoryOf([skill({ path: "/solo", scope: { Global: { agent: "claude" } } })]);
    const p = provenanceOf(inventory.skills[0] as never, inventory);
    expect(p.state).toBe("local");
    expect(p.statement).toBe("Local only · nothing links to it");
    expect(p.linkedInto).toEqual([]);
  });

  it("leads with the fault when there is one", () => {
    const inventory = inventoryOf([
      skill({ path: "/one/x", scope: { Project: { agent: "claude", root: "/one" } }, link_state: "broken", source_path: SOURCE }),
    ]);
    expect(provenanceOf(inventory.skills[0] as never, inventory).statement).toBe(
      "Symlink points at a file that no longer exists"
    );

    const drifted = inventoryOf([
      skill({ path: "/one/x", scope: { Project: { agent: "claude", root: "/one" } }, link_state: "drifted" }),
    ]);
    expect(provenanceOf(drifted.skills[0] as never, drifted).statement).toBe(
      "The copy no longer matches the source it came from"
    );
  });

  it("counts a project once even when it holds several copies", () => {
    const inventory = inventoryOf([
      skill({ path: SOURCE, scope: { Global: { agent: "claude" } } }),
      skill({ path: "/one/.claude/x", scope: { Project: { agent: "claude", root: "/one" } }, source_path: SOURCE }),
      skill({ path: "/one/.gemini/x", scope: { Project: { agent: "gemini", root: "/one" } }, source_path: SOURCE }),
    ]);
    expect(provenanceOf(inventory.skills[0] as never, inventory).linkedInto).toEqual(["one"]);
  });

  it("copes with no inventory at all", () => {
    const p = provenanceOf(skill({ path: "/a", scope: { Global: { agent: "claude" } } }), null);
    expect(p.linkedInto).toEqual([]);
    expect(p.place).toBe("Global");
  });
});

describe("engineLabel", () => {
  it("gives an engine its product name", () => {
    expect(engineLabel(skill({ scope: { Global: { agent: "claude" } } }))).toBe("Claude Code");
    expect(engineLabel(skill({ scope: { Project: { agent: "gemini", root: "/r" } } }))).toBe("Gemini CLI");
  });

  it("passes an unknown engine through rather than inventing a name", () => {
    // Deliberately an id no table can ever claim. "zed" stood here, which
    // read as a rule about unknown ids and was really a record of a missing
    // label — the moment Zed got one the case tested nothing it meant to.
    expect(engineLabel(skill({ scope: { Global: { agent: "an-agent-that-does-not-exist" } } }))).toBe(
      "an-agent-that-does-not-exist",
    );
  });

  it("says any agent when nothing claims it", () => {
    expect(engineLabel(skill({}))).toBe("Any agent");
  });
});

describe("originRow", () => {
  it("declared: links and says the asset declares it", () => {
    // Non-null: an origin was passed, so `originRow` cannot take the
    // null-returning branch — narrowed for tsc, not a runtime check.
    const v = originRow({ label: "owner/repo", url: "https://github.com/owner/repo", kind: "declared" }, undefined)!;
    expect(v.value).toBe("owner/repo");
    expect(v.url).toBe("https://github.com/owner/repo");
    expect(v.tooltip).toBe("The asset declares this");
    expect(v.subRows).toEqual([]);
    expect(v.muted).toBe(false);
  });

  it("declared without a url stays label-only", () => {
    const v = originRow({ label: "community", kind: "declared" }, undefined)!;
    expect(v.url).toBeUndefined();
  });

  it("delivered: carries the three sub-rows", () => {
    const v = originRow(
      {
        label: "owner/market-repo",
        url: "https://github.com/owner/market-repo",
        kind: "delivered",
        commit: "b0b9f02b0581696da41e20d6c536ec639b44080f",
        delivered_by: "tool-x",
        installed_at_ms: 1784500208089,
      },
      undefined
    )!;
    expect(v.tooltip).toBe("Hanger read this from the plugin that installed it");
    expect(v.subRows.map((r) => r.label)).toEqual(["Pinned at", "Delivered by", "Installed"]);
    expect(v.subRows[0].value).toBe("b0b9f02");
    expect(v.subRows[1].value).toBe("tool-x");
    // Hardcoded literal, not a re-derived toLocaleDateString call: computing
    // the expectation with the same options the implementation uses would
    // pass under any format the implementation happens to pick, and could
    // never catch a divergence from the Modified row's format.
    expect(v.subRows[2].value).toBe("Jul 20, 2026");
  });

  it("delivered with none of the three fields: value and tooltip still correct, no sub-rows", () => {
    // The real shape for PluginIndex::origin_for's marketplaces_prefix branch
    // (plugin: None forces commit/delivered_by/installed_at_ms all to None) —
    // the only origin shape that reaches production on this machine today,
    // per the coordinator's fix-round-1 note. This pins that specific shape;
    // it does not by itself prove the three guards are independent — a
    // combined `if (commit && delivered_by && installed_at_ms)` guard also
    // yields [] here and would pass undetected. The "only delivered_by" case
    // below is what actually distinguishes independent guards from a
    // combined one.
    const v = originRow(
      { label: "everything-claude-code", url: "https://github.com/owner/everything-claude-code", kind: "delivered" },
      undefined
    )!;
    expect(v.value).toBe("everything-claude-code");
    expect(v.tooltip).toBe("Hanger read this from the plugin that installed it");
    expect(v.subRows).toEqual([]);
  });

  it("delivered with only delivered_by: exactly one sub-row, the right one", () => {
    // PluginIndex::origin_for's cache_prefix branch: delivered_by can be
    // Some(name) while commit and installed_at_ms stay None.
    const v = originRow(
      { label: "owner/cache-repo", kind: "delivered", delivered_by: "tool-y" },
      undefined
    )!;
    expect(v.subRows).toEqual([{ label: "Delivered by", value: "tool-y", mono: false }]);
  });

  it("checked_out and launched carry no sub-rows", () => {
    expect(originRow({ label: "owner/dotfiles", url: "https://github.com/owner/dotfiles", kind: "checked_out" }, undefined)!.subRows).toEqual([]);
    expect(originRow({ label: "npm: pkg", url: "https://www.npmjs.com/package/pkg", kind: "launched" }, undefined)!.tooltip).toBe("Hanger read this from the launch command");
  });

  // Changed 2026-08-27: the ordinary no-origin case used to render a row
  // ("Written here") that only restated what the Path row already says two
  // lines down. `originRow` now returns null so callers drop the row
  // entirely — this asserts the absence, which fails again the moment
  // something reintroduces a row for the plain no-origin case.
  it("returns null when nothing was found and the check was not blocked", () => {
    expect(originRow(undefined, undefined)).toBeNull();
    expect(originRow(undefined, false)).toBeNull();
  });

  it("blocked still returns a row, worded differently from none-found", () => {
    const v = originRow(undefined, true);
    expect(v).not.toBeNull();
    expect(v!.value).toBe("Not determined");
    expect(v!.tooltip).toBe("Hanger couldn't check every place a source is named");
    expect(v!.muted).toBe(true);
  });
});
