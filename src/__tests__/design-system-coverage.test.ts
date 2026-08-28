import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Every shared component is on the Design system page, or says why not.
 *
 * `.claude/DESIGN.md` §9 promises "one page shows every component in the
 * current theme". Until 2026-08-28 nothing enforced that: the page was built
 * on 2026-08-16 with a hand-picked inventory, and twelve components landed
 * afterwards without a specimen — `InspectorCap`'s `Link to…` and
 * `FindingChip`'s `1 flagged` among them. `design_system_pane.test.tsx`
 * pins that the page renders its own list; it cannot see a component the
 * list never named. This guard reads the other side: the component
 * directory against the page's imports.
 *
 * A component is covered when `DesignSystemPane.tsx` imports it by its own
 * module — rendering inside another specimen does not count, because the
 * caption names the file and a reader looking for `ScanStamp.tsx` should find
 * it under that name. Everything else must be on the allowlist below with a
 * reason, and an allowlist entry that is now imported, or whose file is
 * gone, fails too — a stale exemption is how a control stops guarding.
 */

const REPO = path.resolve(__dirname, "../..");
const COMPONENTS_DIR = path.join(REPO, "src/components");
const PAGE = path.join(COMPONENTS_DIR, "DesignSystemPane.tsx");

interface Exemption {
  component: string;
  reason: string;
}

// Kept in the order the reasons group, not alphabetically, so a reader sees
// the categories: the page itself, the one landmark rule, the surfaces that
// need live data, and the two that predate the page and are still owed.
const ALLOWLIST: Exemption[] = [
  { component: "DesignSystemPane", reason: "the page itself" },
  { component: "DesignSystemSidebar", reason: "the page's own table of contents" },
  {
    component: "IconRail",
    reason:
      "a second navigation landmark with duplicate control names on one page (DESIGN.md §9, Known gaps)",
  },
  {
    component: "BrandSprite",
    reason: "the SVG symbol sheet mounted once in main.tsx; BrandIcon on the page draws from it",
  },
  // Panes, sidebars and the map: each reads the store or the scan over IPC
  // and has nothing to show without it (DESIGN.md §9, Known gaps).
  { component: "ProfilePane", reason: "reads the global inventory over IPC" },
  { component: "RepoPane", reason: "reads a repository's inventory over IPC" },
  { component: "DiscoveryPane", reason: "reads discovered repositories over IPC" },
  { component: "NeedsReviewPane", reason: "derives its rows from the live inventory" },
  { component: "LinkMapPane", reason: "needs the link graph" },
  { component: "LinkMapPlacecard", reason: "needs a link-graph selection and its nodes" },
  { component: "Sidebar", reason: "the source list, fed by linked roots and scan state" },
  { component: "DiscoverySidebar", reason: "the discovery source list, fed by the walk" },
  { component: "ReviewSidebar", reason: "the review source list, fed by derived issues" },
  {
    component: "SourceListShell",
    reason:
      "the sidebars' shared frame; the page shows its row idiom under Controls with hoisted classes and a caption saying so",
  },
  // Inspectors and modals: each takes a selected asset's full detail body or
  // performs a deploy, neither of which a fixture can stand in for honestly.
  { component: "AssetDetail", reason: "renders a selected asset's detail body from IPC" },
  { component: "McpServerDetail", reason: "renders a probed server's detail body from IPC" },
  { component: "ReviewInspector", reason: "renders a selected review issue against the live inventory" },
  { component: "Flyout", reason: "the inspector shell; hosts the detail bodies above" },
  { component: "LinkPanel", reason: "executes a deploy over IPC" },
  { component: "DiffChooser", reason: "the section-by-section merge chooser inside a deploy" },
  { component: "SidebarScanModal", reason: "a modal that links directories over IPC" },
  // Owed. Both predate the page (2026-08-16) and take only props; they were
  // left off the first inventory and are recorded here rather than hidden.
  { component: "FavouriteHeart", reason: "owed a specimen: three props, no IPC" },
  { component: "MarkdownDoc", reason: "owed a specimen: takes parsed blocks, no IPC" },
  {
    component: "FindingPopover",
    reason:
      "owed a specimen: takes only props, no IPC; extracted from FindingChip by the Task 3 refactor (2026-08-28) and the page's FindingChip specimen renders it, but rendering inside another specimen does not count per this guard's own rule",
  },
  {
    component: "HeroBand",
    reason:
      "owed a specimen: takes only props, no IPC; built standalone by Task 4 (2026-08-28) ahead of its two real callers, the Global MCP hero and a project pane hero, landing in later tasks",
  },
];

function componentNames(): string[] {
  return fs
    .readdirSync(COMPONENTS_DIR)
    .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
    .map((f) => f.replace(/\.tsx$/, ""))
    .sort();
}

function pageImports(): Set<string> {
  const src = fs.readFileSync(PAGE, "utf8");
  const names = new Set<string>();
  for (const m of src.matchAll(/from\s+"\.\/([A-Za-z0-9_]+)"/g)) names.add(m[1]);
  return names;
}

describe("Design system page coverage", () => {
  const components = componentNames();
  const imported = pageImports();
  const exempt = new Map(ALLOWLIST.map((e) => [e.component, e.reason]));

  it("the page imports every component in src/components, or the allowlist says why not", () => {
    const missing = components.filter((c) => !imported.has(c) && !exempt.has(c));
    expect(
      missing,
      `Not on the Design system page and not exempted:\n  ${missing.join("\n  ")}\n` +
        "Add a specimen to DesignSystemPane.tsx, or an allowlist entry with a reason.",
    ).toEqual([]);
  });

  it("every allowlist entry names a component that exists and is still off the page", () => {
    const stale = ALLOWLIST.filter((e) => !components.includes(e.component)).map((e) => e.component);
    expect(stale, `Allowlisted components that no longer exist: ${stale.join(", ")}`).toEqual([]);

    const covered = ALLOWLIST.filter((e) => imported.has(e.component)).map((e) => e.component);
    expect(
      covered,
      `Allowlisted components the page now imports — drop the exemption: ${covered.join(", ")}`,
    ).toEqual([]);
  });

  it("every exemption carries a reason", () => {
    for (const e of ALLOWLIST) {
      expect(e.reason.trim().length, `${e.component} has no reason`).toBeGreaterThan(0);
    }
  });
});
