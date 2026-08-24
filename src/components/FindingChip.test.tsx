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
  it("is a mini button naming the singular count, the severity dot, closed at rest, naming its popover to match", () => {
    renderChip();
    const chip = screen.getByRole("button", { name: "1 flagged" });
    expect(chip.className).toContain("h-[26px]");
    expect(chip.className).toContain("rounded-control");
    expect(chip.getAttribute("aria-haspopup")).toBe("dialog");
    expect(chip.getAttribute("aria-expanded")).toBe("false");
    expect(chip.querySelector("i")?.className).toContain("bg-state-warning");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens a list of findings with one Needs review → at the foot, and routes", () => {
    const { onReview } = renderChip({ lines: ["2 tracked copies · drifted", "1 symlink · dangling"], severity: "danger" });
    fireEvent.click(screen.getByRole("button", { name: "2 flagged" }));
    const pop = screen.getByRole("dialog", { name: "2 flagged" });
    expect(Array.from(pop.querySelectorAll("li")).map((li) => li.textContent)).toEqual([
      "2 tracked copies · drifted",
      "1 symlink · dangling",
    ]);
    expect(pop.className).toContain("w-[264px]");
    expect(pop.className).not.toContain("shadow-overlay");
    fireEvent.click(screen.getByRole("button", { name: "Needs review →" }));
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it("carries the elevation when told to", () => {
    renderChip({ elevated: true });
    const chip = screen.getByRole("button", { name: "1 flagged" });
    fireEvent.click(chip);
    expect(screen.getByRole("dialog").className).toContain("shadow-overlay");
  });

  it("closes on Escape and on a pointer press outside", () => {
    renderChip();
    const chip = screen.getByRole("button", { name: "1 flagged" });
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(chip.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(chip);
    fireEvent.pointerDown(document.body);
    expect(chip.getAttribute("aria-expanded")).toBe("false");
  });
});
