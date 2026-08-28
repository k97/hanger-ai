// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import ReachCard from "./ReachCard";
import type { EngineReachInfo } from "./EngineReachTiles";

afterEach(cleanup);

// Minimal fixture, replicated from ReachCard.test.tsx's shape (not exported
// there): one linked route so a route label and the answer value both
// render. Class-contract test only -- this is not a plate-state control,
// which is ReachCard.test.tsx's job; do not add route-shape assertions here.
const reach: EngineReachInfo[] = [
  {
    engine_id: 1,
    engine_key: "claude_code",
    engine_name: "Claude Code",
    reached: true,
    via_root: "/Users/test/.claude/skills",
    via_store: "/Users/test/.agents",
  },
];

describe("ReachCard — inspector type roles", () => {
  it("the route label carries rowLabelClass", () => {
    render(<ReachCard reach={reach} />);
    const label = screen.getByTestId("reach-route-label-linked");
    expect(label.className).toContain("text-base-app");
    expect(label.className).toContain("text-ink-3");
  });

  it("the answer value carries rowMonoClass, not the old caption/mono treatment", () => {
    render(<ReachCard reach={reach} />);
    const value = screen.getByTestId("reach-answer-value");
    expect(value.className).toContain("font-mono");
    expect(value.className).toContain("text-small");
    expect(value.className).toContain("text-ink-1");
    expect(value.className).toContain("tabular");
    expect(value.className.split(" ")).not.toContain("text-micro");
    expect(value.className.split(" ")).not.toContain("text-ink-3");
  });
});
