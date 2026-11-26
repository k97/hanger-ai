// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { chipBaseClass, chipPressedCheckClass } from "./chipClasses";
import NeedsReviewPane from "./NeedsReviewPane";
import { deriveReviewIssues } from "../utils/reviewIssues";

/**
 * One chip idiom, declared once (Q6 of docs/plans/2026-11-25-t3-code-review.md).
 * Needs review's place chips draw from these constants; Global's engine chips
 * did too until the overview card replaced them (Task 7 of
 * docs/plans/2026-11-26-overview-card.md). The whole strings are the
 * contract, as `miniButton.test.ts` holds its own. The pressed chip leads
 * with a check and takes `pl-2.5`.
 */
const BASE =
  "h-7 px-3.5 rounded-pill border border-line-2 font-flex text-small text-ink-2 whitespace-nowrap inline-flex items-center gap-2 cursor-pointer transition-colors duration-nav ease-spring hover:bg-plane-2";
const PRESSED_TAIL =
  "rounded-pill border border-transparent bg-tint text-tint-ink font-medium whitespace-nowrap inline-flex items-center gap-2 cursor-pointer transition-colors duration-nav ease-spring font-flex text-small";

afterEach(cleanup);

describe("the shared chip classes", () => {
  it("pin each whole class string", () => {
    expect(chipBaseClass).toBe(BASE);
    expect(chipPressedCheckClass).toBe(`h-7 pl-2.5 pr-3.5 ${PRESSED_TAIL}`);
  });

  it("are what Needs review's place chips render", () => {
    const { issues, counts } = deriveReviewIssues({
      agents: [],
      skills: [],
      tools: [],
      rules: [],
      subagents: [],
      project_scans: [],
    });
    render(
      <NeedsReviewPane
        issues={issues}
        counts={counts}
        kind={null}
        place={null}
        selectedId={null}
        onSelectKind={vi.fn()}
        onSelectPlace={vi.fn()}
        onSelectIssue={vi.fn()}
      />
    );
    const row = screen.getByRole("group", { name: "Filter issues" });
    expect(within(row).getByRole("button", { name: /^All/ }).className).toBe(chipPressedCheckClass);
    expect(within(row).getByRole("button", { name: /^Repo-level/ }).className).toBe(chipBaseClass);
  });
});
