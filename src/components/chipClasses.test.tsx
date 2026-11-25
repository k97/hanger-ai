// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { chipBaseClass, chipPressedCheckClass, chipPressedClass } from "./chipClasses";
import EngineChipRow from "./EngineChipRow";
import NeedsReviewPane from "./NeedsReviewPane";
import { deriveReviewIssues } from "../utils/reviewIssues";

/**
 * One chip idiom, declared once (Q6 of docs/plans/2026-11-25-t3-code-review.md):
 * Global's engine chips and Needs review's place chips draw from the same
 * constants. The whole strings are the contract, as `miniButton.test.ts`
 * holds its own: these are the strings both rows rendered before the move,
 * so no chip looks any different. The two pressed variants differ only in
 * left padding: an engine chip leads with its mark and keeps the even
 * `px-3.5`; a Needs review chip leads with a check and takes `pl-2.5`.
 */
const BASE =
  "h-7 px-3.5 rounded-pill border border-line-2 font-flex text-small text-ink-2 whitespace-nowrap inline-flex items-center gap-2 cursor-pointer transition-colors duration-nav ease-spring hover:bg-plane-2";
const PRESSED_TAIL =
  "rounded-pill border border-transparent bg-tint text-tint-ink font-medium whitespace-nowrap inline-flex items-center gap-2 cursor-pointer transition-colors duration-nav ease-spring font-flex text-small";

afterEach(cleanup);

describe("the shared chip classes", () => {
  it("pin each whole class string", () => {
    expect(chipBaseClass).toBe(BASE);
    expect(chipPressedClass).toBe(`h-7 px-3.5 ${PRESSED_TAIL}`);
    expect(chipPressedCheckClass).toBe(`h-7 pl-2.5 pr-3.5 ${PRESSED_TAIL}`);
  });

  it("are what Global's engine chips render", () => {
    render(
      <EngineChipRow
        engines={[{ engine_id: "codex", engine_name: "Codex" }]}
        selected={null}
        onSelect={vi.fn()}
      />
    );
    const row = screen.getByRole("group", { name: "Engines" });
    expect(within(row).getByRole("button", { name: "All engines" }).className).toBe(chipPressedClass);
    expect(within(row).getByRole("button", { name: /Codex/ }).className).toBe(chipBaseClass);
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
