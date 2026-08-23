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
