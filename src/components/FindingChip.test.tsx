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
        lines={[{ severity: "warning", text: "2 tracked copies · drifted" }]}
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
    const { onReview } = renderChip({
      lines: [
        { severity: "warning" as const, text: "2 tracked copies · drifted" },
        { severity: "danger" as const, text: "1 symlink · dangling" },
      ],
      severity: "danger",
    });
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

  /* Recommendation 1 (final review, 2026-08-28): the chip's popover paints
     each line its own severity, because a FindingLine already carries one.
     Wrong implementation this catches: any chip that maps the aggregate
     `severity` prop over every line — the second dot then comes back
     bg-state-danger. */
  it("paints each popover line the severity that line carries", () => {
    renderChip({
      severity: "danger",
      lines: [
        { severity: "danger" as const, text: "Target missing" },
        { severity: "warning" as const, text: "Copy has diverged" },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "2 flagged" }));
    const lines = screen.getAllByTestId("finding-popover-line");
    expect(lines[0].querySelector("i")!.className).toContain("bg-state-danger");
    expect(lines[1].querySelector("i")!.className).toContain("bg-state-warning");
  });

  it("carries the elevation when told to", () => {
    renderChip({ elevated: true });
    const chip = screen.getByRole("button", { name: "1 flagged" });
    fireEvent.click(chip);
    expect(screen.getByRole("dialog").className).toContain("shadow-overlay");
  });

  /**
   * The clamp had zero tests: its `r.width === 0 && r.height === 0` guard
   * (`FindingChip.tsx:64`) always fires under happy-dom, which lays nothing
   * out, so the correction never executed. Stubbing the two rects the effect
   * reads is what lets it run at all — the arithmetic is then real, and only
   * the measurements are supplied.
   *
   * What this does NOT prove is that a 264px panel genuinely overruns a 300px
   * placecard on screen; that is a screenshot claim. It proves the shift is
   * computed and applied to both the panel and its arrow, by the same amount,
   * which is the part that is arithmetic rather than layout.
   */
  const withRects = (popRight: number, hostRight: number) => {
    const original = Element.prototype.getBoundingClientRect;
    const rect = (left: number, right: number, height: number) =>
      ({ left, right, top: 0, bottom: height, width: right - left, height, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.getAttribute("role") === "dialog") return rect(popRight - 264, popRight, 100);
      if (this === host.current) return rect(hostRight - 300, hostRight, 200);
      return original.call(this);
    };
    return () => {
      Element.prototype.getBoundingClientRect = original;
    };
  };

  it("shifts the panel back inside its surface, and the arrow by the same amount", () => {
    // 420 + 0 - (380 - 12) = 52px past the surface's inner edge.
    const restore = withRects(420, 380);
    try {
      renderChip();
      fireEvent.click(screen.getByRole("button", { name: "1 flagged" }));
      const pop = screen.getByRole("dialog");
      expect(pop.style.left).toBe(`${-14 - 52}px`);
      expect(pop.style.getPropertyValue("--arrow")).toBe(`${30 + 52}px`);
    } finally {
      restore();
    }
  });

  it("leaves a panel that already fits exactly where it rests", () => {
    // 300 + 0 - (380 - 12) is negative: nothing to correct, so no shift.
    const restore = withRects(300, 380);
    try {
      renderChip();
      fireEvent.click(screen.getByRole("button", { name: "1 flagged" }));
      const pop = screen.getByRole("dialog");
      expect(pop.style.left).toBe("-14px");
      expect(pop.style.getPropertyValue("--arrow")).toBe("30px");
    } finally {
      restore();
    }
  });

  it("makes no correction at all when there is no layout to measure", () => {
    // Unstubbed: every rect is 0 here. Without the `width === 0 && height === 0`
    // guard the arithmetic would read `0 - (0 - POP_MARGIN)` and shift the
    // panel 12px for no reason. The two stubbed cases above cannot see that,
    // because supplying real rects is exactly what bypasses the guard.
    renderChip();
    fireEvent.click(screen.getByRole("button", { name: "1 flagged" }));
    const pop = screen.getByRole("dialog");
    expect(pop.style.left).toBe("-14px");
    expect(pop.style.getPropertyValue("--arrow")).toBe("30px");
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
