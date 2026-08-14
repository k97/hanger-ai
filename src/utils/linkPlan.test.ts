import { describe, it, expect } from "vitest";
import {
  actionable,
  allowsManyDestinations,
  footLine,
  planFor,
  projectName,
  selectable,
  shortPath,
  tagFor,
  type DestinationPlan,
  type PreflightResult,
} from "./linkPlan";

function preflight(over: Partial<PreflightResult> = {}): PreflightResult {
  return {
    target_exists: false,
    collision: false,
    has_permissions: true,
    warning: null,
    target_path: "/work/mei-recipes/.claude/skills/agent-browser",
    already_linked: false,
    ...over,
  };
}

describe("planFor — reading one destination's preflight", () => {
  it("calls an empty destination new", () => {
    const plan = planFor("/work/mei-recipes", preflight());
    expect(plan.disposition).toBe("new");
    expect(tagFor(plan.disposition)).toBe("New");
  });

  it("calls an occupied destination a replacement", () => {
    const plan = planFor("/work/skills", preflight({ target_exists: true, collision: true }));
    expect(plan.disposition).toBe("replaces");
    expect(tagFor(plan.disposition)).toBe("Replaces a copy");
  });

  it("recognises work already done", () => {
    const plan = planFor("/work/skills", preflight({ target_exists: true, already_linked: true }));
    expect(plan.disposition).toBe("already-linked");
    expect(tagFor(plan.disposition)).toBe("Already linked");
  });

  it("will not offer to replace a file it cannot write", () => {
    // Checked before target_exists: offering an overwrite here would be a
    // promise the app cannot keep.
    const plan = planFor(
      "/work/readonly",
      preflight({ target_exists: true, collision: true, has_permissions: false })
    );
    expect(plan.disposition).toBe("unwritable");
  });

  it("carries the path the backend resolved, rather than guessing one", () => {
    const plan = planFor(
      "/work/mei-recipes",
      preflight({ target_path: "/work/mei-recipes/.agents/skills/agent-browser/SKILL.md" })
    );
    expect(plan.targetPath).toBe("/work/mei-recipes/.agents/skills/agent-browser/SKILL.md");
  });

  it("names a destination by its folder, not its whole path", () => {
    expect(planFor("/Users/me/Work/mei-recipes", preflight()).name).toBe("mei-recipes");
    expect(projectName("/Users/me/Work/skills/")).toBe("skills");
    expect(projectName("skills")).toBe("skills");
  });
});

describe("shortPath — the path with the shared prefix removed", () => {
  it("writes the destination the way the panel shows it", () => {
    const plan = planFor(
      "/Users/me/Work/mei-recipes",
      preflight({ target_path: "/Users/me/Work/mei-recipes/.claude/skills/agent-browser" })
    );
    // Truncating the absolute path from the right would show only the prefix
    // every row shares.
    expect(shortPath(plan)).toBe("mei-recipes/.claude/skills/agent-browser");
  });

  it("leaves a path it cannot place inside the root alone", () => {
    const plan = planFor("/Users/me/Work/skills", preflight({ target_path: "/elsewhere/x" }));
    expect(shortPath(plan)).toBe("/elsewhere/x");
  });

  it("survives a root written with a trailing slash", () => {
    const plan = planFor("/work/skills", preflight({ target_path: "/work/skills//.claude/a" }));
    expect(shortPath(plan)).toBe("skills/.claude/a");
  });
});

describe("actionable — what the button would really touch", () => {
  const plans: DestinationPlan[] = [
    { root: "/a", name: "a", targetPath: "/a/x", disposition: "new" },
    { root: "/b", name: "b", targetPath: "/b/x", disposition: "replaces" },
    { root: "/c", name: "c", targetPath: "/c/x", disposition: "already-linked" },
    { root: "/d", name: "d", targetPath: "/d/x", disposition: "unwritable" },
  ];

  it("acts on new and replaced destinations only", () => {
    expect(actionable(plans).map((p) => p.name)).toEqual(["a", "b"]);
  });

  it("keeps the untouchable rows readable but unselectable", () => {
    expect(selectable(plans[0])).toBe(true);
    expect(selectable(plans[1])).toBe(true);
    expect(selectable(plans[2])).toBe(false);
    expect(selectable(plans[3])).toBe(false);
  });
});

describe("allowsManyDestinations", () => {
  it("lets ordinary assets fan out", () => {
    for (const kind of ["Skills", "Subagents", "Tools"]) {
      expect(allowsManyDestinations(kind), kind).toBe(true);
    }
  });

  it("holds Rules to one destination, because a merge is per-destination", () => {
    expect(allowsManyDestinations("Rules")).toBe(false);
  });
});

describe("footLine", () => {
  const pending = (name: string): DestinationPlan => ({
    root: `/${name}`,
    name,
    targetPath: `/${name}/x`,
    disposition: "new",
  });

  it("states intent before anything has been attempted", () => {
    expect(footLine([pending("a"), pending("b"), pending("c")])).toBe("3 projects");
    expect(footLine([pending("a")])).toBe("1 project");
    expect(footLine([])).toBe("0 projects");
  });

  it("reports outcomes once the work has run", () => {
    expect(
      footLine([
        { ...pending("a"), outcome: { ok: true } },
        { ...pending("b"), outcome: { ok: true } },
      ])
    ).toBe("2 linked");
  });

  it("does not hide a partial failure behind a success", () => {
    expect(
      footLine([
        { ...pending("a"), outcome: { ok: true } },
        { ...pending("b"), outcome: { ok: true } },
        { ...pending("c"), outcome: { ok: false, reason: "Permission denied" } },
      ])
    ).toBe("2 linked · 1 failed");
  });

  it("still accounts for rows that have not run yet", () => {
    expect(
      footLine([{ ...pending("a"), outcome: { ok: true } }, pending("b"), pending("c")])
    ).toBe("1 linked · 2 pending");
  });
});
