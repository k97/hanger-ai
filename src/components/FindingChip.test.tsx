// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import FindingChip from "./FindingChip";

afterEach(cleanup);

const host = createRef<HTMLDivElement>();
const renderChip = (over: Partial<Parameters<typeof FindingChip>[0]> = {}) => {
  const onReview = vi.fn();
  render(
    <div ref={host}>
      <FindingChip
        severity="warning"
        lines={["2 tracked copies · drifted"]}
        onReview={onReview}
        elevated={false}
        clampTo={host}
        {...over}
      />
    </div>
  );
  return { onReview };
};

describe("FindingChip", () => {
  it("is a mini button with the severity dot, closed at rest, naming its popover", () => {
    renderChip();
    const chip = screen.getByRole("button", { name: /^Review/ });
    expect(chip.className).toContain("h-[26px]");
    expect(chip.className).toContain("rounded-control");
    expect(chip.getAttribute("aria-haspopup")).toBe("dialog");
    expect(chip.getAttribute("aria-expanded")).toBe("false");
    expect(chip.querySelector("i")?.className).toContain("bg-state-warning");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens a list of findings with one Review → at the foot, and routes", () => {
    const { onReview } = renderChip({ lines: ["2 tracked copies · drifted", "1 symlink · dangling"], severity: "danger" });
    fireEvent.click(screen.getByRole("button", { name: /^Review/ }));
    const pop = screen.getByRole("dialog", { name: "Needs a decision" });
    expect(Array.from(pop.querySelectorAll("li")).map((li) => li.textContent)).toEqual([
      "2 tracked copies · drifted",
      "1 symlink · dangling",
    ]);
    expect(pop.className).toContain("w-[264px]");
    expect(pop.className).not.toContain("shadow-overlay");
    fireEvent.click(screen.getByRole("button", { name: "Review →" }));
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it("carries the count beside Review when given one, and the elevation when told to", () => {
    renderChip({ count: 2, elevated: true });
    const chip = screen.getByRole("button", { name: "Review 2" });
    expect(chip.querySelector("span.tabular")?.textContent).toBe("2");
    fireEvent.click(chip);
    expect(screen.getByRole("dialog").className).toContain("shadow-overlay");
  });

  it("closes on Escape and on a pointer press outside", () => {
    renderChip();
    const chip = screen.getByRole("button", { name: /^Review/ });
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(chip.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(chip);
    fireEvent.pointerDown(document.body);
    expect(chip.getAttribute("aria-expanded")).toBe("false");
  });
});
