// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import HangerMark from "./HangerMark";
import IconRail from "./IconRail";

afterEach(cleanup);

describe("HangerMark", () => {
  // The dispatch's item 4: the mark is flat --brand, and --brand is the only
  // place the teal exists. The token itself carries the light/dark values
  // (#00c3bf / #2fd8d4, tokens.css), so the component owns no variant logic.
  it("fills with currentColor and takes its colour from the brand token class", () => {
    const { container } = render(<HangerMark />);
    const svg = screen.getByTestId("hanger-mark");
    expect(svg.getAttribute("class")).toContain("text-brand");
    expect(container.querySelector("path")!.getAttribute("fill")).toBe("currentColor");
  });

  it("draws one flat path — no gradients, no per-theme variants", () => {
    const { container } = render(<HangerMark />);
    expect(container.querySelector("linearGradient")).toBeNull();
    expect(container.querySelector("defs")).toBeNull();
    expect(screen.getByTestId("hanger-mark").getAttribute("data-variant")).toBeNull();
  });

  it("crops the viewBox to the glyph so size means the mark, not the icon padding", () => {
    render(<HangerMark size={32} />);
    const svg = screen.getByTestId("hanger-mark");
    expect(svg.getAttribute("viewBox")).toBe("120 120 783 783");
    expect(svg.getAttribute("width")).toBe("32");
  });

  it("defaults to the reference design's 24px", () => {
    render(<HangerMark />);
    const svg = screen.getByTestId("hanger-mark");
    expect(svg.getAttribute("width")).toBe("24");
    expect(svg.getAttribute("height")).toBe("24");
  });

  it("passes a layout className through to the svg without dropping its own attributes", () => {
    render(<HangerMark className="pt-2" size={22} />);
    const svg = screen.getByTestId("hanger-mark");
    expect(svg.getAttribute("class")).toBe("text-brand pt-2");
    expect(svg.getAttribute("width")).toBe("22");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
  });

  it("carries none of the Figma background-blur export cruft", () => {
    const { container } = render(<HangerMark />);
    expect(container.querySelector("foreignObject")).toBeNull();
    expect(container.querySelector("clipPath")).toBeNull();
    expect(container.innerHTML).not.toContain("backdrop-filter");
  });

  it("stays out of the accessibility tree", () => {
    render(<HangerMark />);
    expect(screen.getByTestId("hanger-mark").getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("img")).toBeNull();
  });
});

describe("the rail's brand mark", () => {
  const rail = () =>
    render(
      <IconRail
        active="machine"
        needsReviewCount={0}
        onSelectMachine={() => {}}
        onSelectLinkMap={() => {}}
        onSelectDiscovery={() => {}}
        onSelectReview={() => {}}
        onOpenSettings={() => {}}
      />
    );

  it("sits at the top of the rail, above the section buttons", () => {
    rail();
    const nav = screen.getByTestId("icon-rail");
    const mark = screen.getByTestId("hanger-mark");
    const machine = screen.getByLabelText("My machine");
    expect(nav.contains(mark)).toBe(true);
    expect(mark.compareDocumentPosition(machine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("adds no new interactive target to the rail", () => {
    rail();
    // 5 = the four sections plus settings. The mark itself contributes none
    // of these; this pin moved 4 → 5 when the Link map entry landed, not
    // because the mark grew behaviour.
    expect(screen.getAllByRole("button")).toHaveLength(5);
  });
});
