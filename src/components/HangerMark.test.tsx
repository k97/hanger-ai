// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import HangerMark from "./HangerMark";
import IconRail from "./IconRail";

afterEach(cleanup);

const gradientStops = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("stop")).map((s) => ({
    color: s.getAttribute("stop-color"),
    opacity: s.getAttribute("stop-opacity"),
  }));

describe("HangerMark", () => {
  it("draws the teal glyph on a light rail, where white would be invisible", () => {
    const { container } = render(<HangerMark />);
    expect(screen.getByTestId("hanger-mark").getAttribute("data-variant")).toBe("on-light");
    expect(gradientStops(container)).toEqual([
      { color: "#0EC7C6", opacity: null },
      { color: "#169B9C", opacity: null },
    ]);
  });

  it("draws the white glyph on a dark rail, where teal is the app-icon variant", () => {
    const { container } = render(<HangerMark onDark />);
    expect(screen.getByTestId("hanger-mark").getAttribute("data-variant")).toBe("on-dark");
    expect(gradientStops(container)).toEqual([
      { color: "#ffffff", opacity: null },
      { color: "#ffffff", opacity: "0.5" },
    ]);
  });

  it("points the fill at a gradient that the same document actually defines", () => {
    for (const onDark of [false, true]) {
      cleanup();
      const { container } = render(<HangerMark onDark={onDark} />);
      const fill = container.querySelector("path")!.getAttribute("fill")!;
      const id = fill.replace(/^url\(#/, "").replace(/\)$/, "");
      expect(container.querySelector(`linearGradient#${id}`)).toBeTruthy();
      // Only the variant in use is emitted, so the ids can never collide.
      expect(container.querySelectorAll("linearGradient")).toHaveLength(1);
    }
  });

  it("crops the viewBox to the glyph so size means the mark, not the icon padding", () => {
    render(<HangerMark size={32} />);
    const svg = screen.getByTestId("hanger-mark");
    expect(svg.getAttribute("viewBox")).toBe("120 120 783 783");
    expect(svg.getAttribute("width")).toBe("32");
  });

  // Measured off the reference screenshot: the mark reads at roughly 24px
  // against the rail's 38px-wide selection pill.
  it("defaults to the reference design's 24px", () => {
    render(<HangerMark />);
    const svg = screen.getByTestId("hanger-mark");
    expect(svg.getAttribute("width")).toBe("24");
    expect(svg.getAttribute("height")).toBe("24");
  });

  it("passes a layout className through to the svg without dropping its own attributes", () => {
    render(<HangerMark className="pt-2" size={22} />);
    const svg = screen.getByTestId("hanger-mark");
    expect(svg.getAttribute("class")).toBe("pt-2");
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
  const rail = (darkMode: boolean) =>
    render(
      <IconRail
        active="machine"
        needsReviewCount={0}
        darkMode={darkMode}
        onSelectMachine={() => {}}
        onSelectDiscovery={() => {}}
        onSelectReview={() => {}}
        onOpenSettings={() => {}}
      />
    );

  it("sits at the top of the rail, above the section buttons", () => {
    rail(false);
    const nav = screen.getByTestId("icon-rail");
    const mark = screen.getByTestId("hanger-mark");
    const machine = screen.getByLabelText("My machine");
    expect(nav.contains(mark)).toBe(true);
    expect(mark.compareDocumentPosition(machine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("follows the app's resolved appearance rather than the OS preference", () => {
    rail(false);
    expect(screen.getByTestId("hanger-mark").getAttribute("data-variant")).toBe("on-light");
    cleanup();
    rail(true);
    expect(screen.getByTestId("hanger-mark").getAttribute("data-variant")).toBe("on-dark");
  });

  it("adds no new interactive target to the rail", () => {
    rail(false);
    expect(screen.getAllByRole("button")).toHaveLength(4);
  });
});
