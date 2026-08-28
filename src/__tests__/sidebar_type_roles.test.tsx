// @vitest-environment happy-dom
import { render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, afterEach, vi } from "vitest";
import DiscoverySidebar from "../components/DiscoverySidebar";
import Sidebar from "../components/Sidebar";
import ReviewSidebar from "../components/ReviewSidebar";
import DesignSystemSidebar from "../components/DesignSystemSidebar";
import type { CategoryCounts } from "../App";
import type { ReviewCounts } from "../utils/reviewIssues";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => null),
}));

afterEach(cleanup);

// Class-contract guard. DiscoverySidebar is the smallest of the four and
// carries both the group label and the count; the other three share the
// same strings by import, which Task 8's guard then holds. happy-dom lays
// out nothing, so this asserts className membership only, never geometry.
describe("sidebar type roles", () => {
  it("group labels are sentence-case body in --ink-3; counts are caption size", () => {
    // use the props the existing DiscoverySidebar/DiscoveryPane tests render with
    render(
      <DiscoverySidebar
        width={216}
        setWidth={() => {}}
        collapsed={false}
        setCollapsed={() => {}}
        kind="All"
        onSelectKind={() => {}}
      />
    );
    const group = screen.getByText("Categories");
    expect(group.className).toContain("text-base-app");
    expect(group.className).toContain("text-ink-3");
    expect(group.className).not.toContain("uppercase");
    expect(group.className).not.toContain("tracking-[.06em]");
    const count = screen.getAllByText(/^\d+$/)[0];
    expect(count.className).toContain("text-small");
    expect(count.className).not.toContain("text-micro");
  });
});

/* The claim above ("the other three share the same strings by import, which
 * Task 8's guard then holds") is not true of `type-roles.test.ts`'s
 * line-anchored guard: a revert of Sidebar.tsx/ReviewSidebar.tsx/
 * DesignSystemSidebar.tsx's group-label site to the pre-migration
 * `text-micro font-medium text-ink-3` (dropping only `uppercase`) still
 * contains `text-ink-3` and `font-medium`, so the guard's substring match
 * keeps passing -- it only catches `uppercase` reappearing, not the size
 * and weight regressing with it. `groupLabelClass` is a module-local const
 * re-declared as `grpClass` in each file, so there is no shared identity to
 * assert on either; the only way to pin these three is to render each one
 * (fixtures per `grep -rl "ReviewSidebar\|DesignSystemSidebar\|<Sidebar"
 * src/__tests__ src/components/*.test.tsx`: Sidebar's are
 * container_rows.test.tsx's, DesignSystemSidebar's are
 * design_system_pane.test.tsx's; ReviewSidebar has no existing render, so
 * this constructs a minimal one from its props). Class-contract tests only,
 * not behaviour. */
describe("sidebar group labels — the three DiscoverySidebar's guard cannot reach", () => {
  const assetCounts: CategoryCounts = {
    total: 3,
    byCategory: {
      skill: { total: 3, global: 3, project: 0 },
      tool: { total: 0, global: 0, project: 0 },
      rule: { total: 0, global: 0, project: 0 },
      subagent: { total: 0, global: 0, project: 0 },
    },
    engines: {},
  };

  const reviewCounts: ReviewCounts = {
    broken: 1,
    drifted: 2,
    duplicate: 4,
    parse: 8,
    crossRepo: 0,
    total: 7,
  };

  function assertGroupLabel(el: Element | null) {
    expect(el).toBeTruthy();
    const classes = el!.className.split(" ");
    expect(classes).toContain("text-base-app");
    expect(classes).toContain("text-ink-3");
    expect(classes).not.toContain("uppercase");
    expect(classes).not.toContain("text-micro");
  }

  it("Sidebar's group label is body-size, receding, sentence case", () => {
    render(
      <Sidebar
        width={260}
        setWidth={() => {}}
        collapsed={false}
        setCollapsed={() => {}}
        selectedItem="profile"
        setSelectedItem={() => {}}
        inventory={null}
        assetCounts={assetCounts}
        detectedEngines={[]}
        linkedRepos={[]}
        loadLinkedRepos={async () => {}}
        setError={() => {}}
        onOpenSearch={() => {}}
      />
    );
    assertGroupLabel(screen.getByText("Scope"));
    // The global assets badge (sumGlobalAssets over `assetCounts`, the same
    // formula ProfilePane uses) is the one count on this sidebar; it reads
    // as a count, not a caption, so it takes text-small.
    const badge = screen.getByText("3");
    expect(badge.className.split(" ")).toContain("text-small");
  });

  it("ReviewSidebar's group label is body-size, receding, sentence case", () => {
    render(
      <ReviewSidebar
        width={260}
        setWidth={() => {}}
        collapsed={false}
        setCollapsed={() => {}}
        counts={reviewCounts}
        places={[]}
        kind={null}
        place={null}
        onSelectKind={() => {}}
        onSelectPlace={() => {}}
      />
    );
    assertGroupLabel(screen.getByText("Issues"));
    assertGroupLabel(screen.getByText("Where"));
    const tally = screen.getByText("Everything").nextElementSibling;
    expect(tally).toBeTruthy();
    expect(tally!.className.split(" ")).toContain("text-small");
    expect(tally!.textContent).toBe("7");
  });

  it("DesignSystemSidebar's group label is body-size, receding, sentence case", () => {
    render(
      <DesignSystemSidebar
        width={260}
        setWidth={() => {}}
        collapsed={false}
        setCollapsed={() => {}}
        section="colour"
        onSelectSection={() => {}}
      />
    );
    // The TOC grouped on 2026-08-28 (Foundations · Styles · Components);
    // every eyebrow wears the same group-label role the machine sidebar's do.
    assertGroupLabel(screen.getByText("Foundations"));
    assertGroupLabel(screen.getByText("Styles"));
    assertGroupLabel(screen.getByText("Components"));
  });
});
