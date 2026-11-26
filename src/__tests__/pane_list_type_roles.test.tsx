// @vitest-environment happy-dom
// Class-contract guard only: happy-dom lays nothing out, so this pins
// className membership, never geometry (verification.md).
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import GroupHead from "../components/GroupHead";

// The column headers this file pinned (AssetHeaderRow) were retired with
// Task 4 of docs/plans/2026-11-26-global-list.md; the pane lists' only
// labels now are their group heads, and they keep the role the headers had.
describe("pane list type roles", () => {
  it("group heads are sentence-case caption-size medium in --ink-3", () => {
    render(<GroupHead id="g" label="Skills" figure={3} />);
    const head = document.getElementById("g") as HTMLElement;
    expect(screen.getByRole("heading", { level: 3, name: "Skills · 3" })).toBeTruthy();
    expect(head.className).toContain("text-small");
    expect(head.className).toContain("font-medium");
    expect(head.className).toContain("text-ink-3");
    expect(head.className).not.toContain("uppercase");
    expect(head.className).not.toContain("tracking-[.06em]");
  });
});
