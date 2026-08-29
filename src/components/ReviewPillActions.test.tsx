// @vitest-environment happy-dom
//
// The review pill's action row, on both heroes. Extracted at the final
// review's Recommendation 2 (2026-08-28) once Important 2's gate made
// ProfilePane's copy and RepoPane's identical for the third time.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import ReviewPillActions from "./ReviewPillActions";
import type { ReviewIssue } from "../utils/reviewIssues";

afterEach(cleanup);

const issue = (over: Partial<ReviewIssue> = {}): ReviewIssue => ({
  id: "Rules:broken:/x/CLAUDE.md",
  name: "CLAUDE.md",
  category: "Rules",
  kind: "broken",
  problem: "Target is gone",
  path: "/x/CLAUDE.md",
  whereLabel: "Global",
  whereKeys: ["global"],
  crossRepo: false,
  ...over,
});

describe("ReviewPillActions", () => {
  /* The reason the component exists. A pill can be showing lines no
     ReviewIssue produced — undeclared processes, scan warnings — and those
     have no asset to open. Wrong implementation this catches: a row that
     renders whenever the pill does, which is what shipped and which routed
     to a Needs review pane answering "Nothing needs a decision". */
  it("renders nothing at all when no issue is behind the pill", () => {
    const { container } = render(<ReviewPillActions issues={[]} onReview={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  /* Wrong implementation this catches: withholding `Show in list`
     unconditionally, or gating it on something other than the issue kinds. */
  it("offers both actions when every issue is one the needs-review filter can reach", () => {
    render(<ReviewPillActions issues={[issue()]} onReview={vi.fn()} />);
    expect(screen.getByText("Show in list")).toBeTruthy();
    expect(screen.getByText("Needs review →")).toBeTruthy();
  });

  /* `needsReview` (linkStateCounts.ts:45-48) is broken-or-drifted, so the
     filter drops a duplicate out of the list the button offers to show it
     in. Wrong implementation this catches: rendering `Show in list` anyway. */
  it("withholds Show in list when a duplicate is among them, and keeps the route", () => {
    render(<ReviewPillActions issues={[issue({ kind: "duplicate" })]} onReview={vi.fn()} />);
    expect(screen.queryByText("Show in list")).toBeNull();
    expect(screen.getByText("Needs review →")).toBeTruthy();
  });

  /* Wrong implementation this catches: a filter toggle that always sets
     "needs-review" and so cannot be switched back off. */
  it("toggles the needs-review filter on, and off again when it is already on", () => {
    const onStateFilterChange = vi.fn();
    render(<ReviewPillActions issues={[issue()]} onStateFilterChange={onStateFilterChange} />);
    fireEvent.click(screen.getByText("Show in list"));
    expect(onStateFilterChange).toHaveBeenCalledWith("needs-review");
    cleanup();

    const again = vi.fn();
    render(<ReviewPillActions issues={[issue()]} stateFilter="needs-review" onStateFilterChange={again} />);
    expect(screen.getByText("Show in list").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByText("Show in list"));
    expect(again).toHaveBeenCalledWith(null);
  });

  /* Wrong implementation this catches: routing with `null`, which lands on
     the Needs review pane with nothing selected. */
  it("routes with the first issue", () => {
    const onReview = vi.fn();
    const first = issue({ id: "first" });
    render(<ReviewPillActions issues={[first, issue({ id: "second" })]} onReview={onReview} />);
    fireEvent.click(screen.getByText("Needs review →"));
    expect(onReview).toHaveBeenCalledWith(first);
  });
});
