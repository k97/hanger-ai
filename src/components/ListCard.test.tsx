// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import ListCard, { ListCardRow } from "./ListCard";
import { rowValueClass } from "./typeRoles";

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

  it("a row is icon · label · right-aligned value, value in mono small ink-1", () => {
    render(
      <ListCard>
        <ListCardRow data-testid="row" icon={<svg data-testid="mark" />} label="Rules" value="2" />
      </ListCard>
    );
    const row = screen.getByTestId("row");
    expect(row.className).toContain("min-h-9");
    expect(row.className).toContain("px-3");
    expect(row.className).toContain("text-base-app");
    expect(screen.getByTestId("mark").parentElement?.className).toContain("text-ink-3");
    const value = screen.getByText("2");
    expect(value.className).toContain("ml-auto");
    expect(value.className).toContain("font-mono");
    expect(value.className).toContain("text-small");
    expect(value.className).toContain("text-ink-1");
  });

  it("a wide value is sans body ink-1, still right-aligned", () => {
    render(
      <ListCard>
        <ListCardRow label="Linked from" wide="3 engine roots" />
      </ListCard>
    );
    const wide = screen.getByText("3 engine roots");
    expect(wide.className).toContain("ml-auto");
    expect(wide.className).toContain("text-base-app");
    expect(wide.className).toContain("text-ink-1");
    expect(wide.className).not.toContain("font-mono");
  });

  // Class-contract guards: happy-dom cannot measure, so these pin the class
  // strings the roles are made of. A screenshot proves the rendering.
  it("sets the label in --ink-3 and the value in --ink-1, both at body size", () => {
    render(
      <ListCard>
        <ListCardRow label="Kind" value="skill" data-testid="row" />
      </ListCard>,
    );
    const row = screen.getByTestId("row");
    expect(row.className).toContain("text-base-app");
    expect(row.className).toContain("text-ink-3");
    expect(row.className).not.toContain("text-small");
    const value = screen.getByText("skill");
    expect(value.className).toContain("text-ink-1");
    expect(value.className).toContain("font-mono");
    expect(value.className).toContain("text-small");
    expect(value.className).not.toContain("text-micro");
    expect(value.className).not.toContain("text-ink-3");
  });

  it("a sans figure passed as value states its own family", () => {
    render(
      <ListCard>
        <ListCardRow label="Always on" value={<span className={rowValueClass}>≈ 67 tokens</span>} />
      </ListCard>,
    );
    expect(screen.getByText("≈ 67 tokens").className).toContain("font-sans");
  });

  it("sets a wide value in --ink-1 at body size", () => {
    render(
      <ListCard>
        <ListCardRow label="Installed" wide="4 min ago" />
      </ListCard>,
    );
    const wide = screen.getByText("4 min ago");
    expect(wide.className).toContain("text-base-app");
    expect(wide.className).toContain("text-ink-1");
    expect(wide.className).not.toContain("text-ink-2");
  });

  /**
   * The bug this pins: `value`/`wide` used to carry `shrink-0` with no
   * truncation while the label box next to them is `min-w-0 flex-1`. A long
   * value's box is then sized to its own max-content width regardless of
   * the row's actual width, anchored to the right edge by `ml-auto` — so it
   * extends leftward UNDER the label rather than being clipped, which is
   * what a 141-character Compatibility value read as "drawn on top of" the
   * label in the real app.
   *
   * happy-dom lays nothing out (`verification.md`), so the overlap itself —
   * two boxes painting over each other — cannot be asserted here. What CAN
   * be pinned is the class contract that prevents it: the item must be
   * allowed to shrink (no `shrink-0`) and must ellipsize rather than wrap or
   * overflow when it does (`min-w-0 truncate`, the same pairing this file's
   * own docblock already prescribes for a label that wants one). The actual
   * "does not overlap" claim is a screenshot from a running build.
   */
  it("the value slot can shrink and truncates instead of overflowing into the label", () => {
    const long = "A".repeat(141);
    render(
      <ListCard>
        <ListCardRow label="Compatibility" value={long} />
      </ListCard>
    );
    const value = screen.getByText(long);
    expect(value.className).not.toContain("shrink-0");
    expect(value.className).toContain("min-w-0");
    expect(value.className).toContain("truncate");
  });

  it("the wide slot gets the same treatment as value", () => {
    const long = "B".repeat(141);
    render(
      <ListCard>
        <ListCardRow label="Compatibility" wide={long} />
      </ListCard>
    );
    const wide = screen.getByText(long);
    expect(wide.className).not.toContain("shrink-0");
    expect(wide.className).toContain("min-w-0");
    expect(wide.className).toContain("truncate");
  });
});
