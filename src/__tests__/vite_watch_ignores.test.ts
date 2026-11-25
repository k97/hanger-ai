import { describe, it, expect } from "vitest";
import { createFilter, type UserConfig } from "vite";
import viteConfig from "../../vite.config";

// The repository tracks `.agents/skills` as a symlink to `~/.agents/skills`,
// which a skills sync rewrites on a timer. While Vite watched it, every sync
// reloaded the page, and a reload cold-starts the frontend into a full scan:
// the dev app rescanned the machine about every ten minutes (found in the dev
// app's log on 2026-11-25). Nothing under `src/` imports from `.agents/`.
//
// `createFilter` matches with picomatch and `{ dot: true }`, the engine and
// options the watcher applies to `server.watch.ignored`.
async function ignoredMatcher(): Promise<(path: string) => boolean> {
  const config = (await (viteConfig as (env: { command: "serve"; mode: string }) => Promise<UserConfig>)({
    command: "serve",
    mode: "development",
  }));
  const ignored = config.server?.watch?.ignored;
  if (!Array.isArray(ignored)) throw new Error("server.watch.ignored is not a list");
  const patterns = ignored.filter((p): p is string => typeof p === "string");
  return createFilter(patterns, null, { resolve: false });
}

describe("vite dev server watch.ignored", () => {
  it("ignores synced skills, by the repository path and by the symlink's target", async () => {
    const isIgnored = await ignoredMatcher();
    // The path through the repository's symlink.
    expect(isIgnored("/repo/hanger-ai/.agents/skills/synced/agent-browser/SKILL.md")).toBe(true);
    // The resolved path, the form the dev app's log printed.
    expect(isIgnored("/home/me/.agents/skills/stage-gate/SKILL.md")).toBe(true);
  });

  it("ignores docs and markdown, which Tailwind's scan turned into page reloads", async () => {
    const isIgnored = await ignoredMatcher();
    expect(isIgnored("/repo/hanger-ai/docs/plans/2026-11-25-ia-global-by-engine.html")).toBe(true);
    expect(isIgnored("/repo/hanger-ai/.claude/DESIGN.md")).toBe(true);
    expect(isIgnored("/repo/hanger-ai/README.md")).toBe(true);
  });

  it("keeps test files watched under Vitest, so watch mode still re-runs", async () => {
    const isIgnored = await ignoredMatcher();
    expect(isIgnored("/repo/hanger-ai/src/components/SearchPalette.test.tsx")).toBe(false);
    expect(isIgnored("/repo/hanger-ai/src/__tests__/engine_lens.test.tsx")).toBe(false);
  });

  it("ignores test files in tauri dev, where nothing imports them", async () => {
    const saved = process.env.VITEST;
    delete process.env.VITEST;
    try {
      const isIgnored = await ignoredMatcher();
      expect(isIgnored("/repo/hanger-ai/src/components/SearchPalette.test.tsx")).toBe(true);
      expect(isIgnored("/repo/hanger-ai/src/__tests__/engine_lens.test.tsx")).toBe(true);
      expect(isIgnored("/repo/hanger-ai/src/components/SearchPalette.tsx")).toBe(false);
    } finally {
      process.env.VITEST = saved;
    }
  });

  it("still watches the frontend", async () => {
    const isIgnored = await ignoredMatcher();
    expect(isIgnored("/repo/hanger-ai/src/App.tsx")).toBe(false);
    expect(isIgnored("/repo/hanger-ai/src/components/LinkMapPane.tsx")).toBe(false);
  });
});
