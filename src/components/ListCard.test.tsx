// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import ListCard, { ListCardRow } from "./ListCard";

afterEach(cleanup);

describe("ListCard — the section format", () => {
  it("draws one bordered card on the page with a divider only between rows", () => {
    render(
      <ListCard data-testid="card">
        <ListCardRow data-testid="row-1" label="Assets" value="122" />
        <ListCardRow data-testid="row-2" label="Skills" value="110" />
      </ListCard>
    );
    const card = screen.getByTestId("card");
    expect(card.className).toContain("border-line");
    expect(card.className).toContain("rounded-inner");
    expect(card.className).toContain("bg-page");
    // The divider is the card's own rule on every row after the first, so a
    // one-row card has none and the last row never carries one below it.
    expect(card.className).toContain("[&>*+*]:border-t");
    expect(card.className).toContain("[&>*+*]:border-line");
    expect(screen.getByTestId("row-1").className).not.toContain("border-t");
  });

  /**
   * happy-dom never loads Tailwind's CSS, so whether `[&>*+*]:border-t`
   * compiles to a rule and paints a hairline cannot be asserted here at all.
   * That half is a screenshot claim and stays one.
   *
   * What IS assertable is the structural precondition the selector depends
   * on, and which the class assertion above cannot see: `>` matches DIRECT
   * children only. Wrap the rows in anything — a fragment host, a scroll
   * div, a group per section — and every class string above stays correct
   * while the dividers silently stop being drawn. That is a class of
   * regression a substring check is blind to by construction.
   */
  it("keeps every row a direct child, which is what the >*+* selector needs", () => {
    render(
      <ListCard data-testid="card">
        <ListCardRow data-testid="row-1" label="Assets" value="122" />
        <ListCardRow data-testid="row-2" label="Skills" value="110" />
        <ListCardRow data-testid="row-3" label="Rules" value="2" />
      </ListCard>
    );
    const card = screen.getByTestId("card");
    for (const id of ["row-1", "row-2", "row-3"]) {
      expect(screen.getByTestId(id).parentElement, `${id} is not a direct child of the card`).toBe(card);
    }
    // And the card has no other element children that would take a divider
    // of their own, or displace one from a row.
    expect(Array.from(card.children).map((c) => c.getAttribute("data-testid"))).toEqual([
      "row-1",
      "row-2",
      "row-3",
    ]);
  });

  it("a row is icon · label · right-aligned value, value in mono micro ink-3", () => {
    render(
      <ListCard>
        <ListCardRow data-testid="row" icon={<svg data-testid="mark" />} label="Rules" value="2" />
      </ListCard>
    );
    const row = screen.getByTestId("row");
    expect(row.className).toContain("min-h-9");
    expect(row.className).toContain("px-3");
    expect(row.className).toContain("text-small");
    expect(screen.getByTestId("mark").parentElement?.className).toContain("text-ink-3");
    const value = screen.getByText("2");
    expect(value.className).toContain("ml-auto");
    expect(value.className).toContain("font-mono");
    expect(value.className).toContain("text-micro");
    expect(value.className).toContain("text-ink-3");
  });

  it("a wide value is sans small ink-2, still right-aligned", () => {
    render(
      <ListCard>
        <ListCardRow label="Linked from" wide="3 engine roots" />
      </ListCard>
    );
    const wide = screen.getByText("3 engine roots");
    expect(wide.className).toContain("ml-auto");
    expect(wide.className).toContain("text-small");
    expect(wide.className).toContain("text-ink-2");
    expect(wide.className).not.toContain("font-mono");
  });
});
