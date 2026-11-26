// @vitest-environment happy-dom
import { render, within, cleanup } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, afterEach } from "vitest";
import MechanismGlyph from "./MechanismGlyph";

// Moved from AssetRow.test.tsx with Task 4 of
// docs/plans/2026-11-26-global-list.md, when AssetRow was retired: these
// rendered the glyph through AssetRow's annotated row, and now render it
// directly. Class-contract guards only (happy-dom lays nothing out).
afterEach(cleanup);

describe("MechanismGlyph", () => {
  // A mark takes the ink of the text it sits beside: the mechanism glyph is
  // a row mark like every other, so its geometry carries the mechanism and
  // its ink no longer does (Karthik, 2026-08-28, I4).
  it.each(["symlink", "copy", "none"] as const)("the %s mechanism glyph is a row mark in --ink-3", (mechanism) => {
    const { container } = render(<MechanismGlyph mechanism={mechanism} />);
    const glyph = within(container).getByTestId("mechanism-glyph");
    expect(glyph.getAttribute("class")).toContain("text-ink-3");
    expect(glyph.getAttribute("class")).not.toMatch(/text-ink-[12]|opacity-\[/);
  });

  it.each([
    ["drift", "text-state-warning"],
    ["broken", "text-state-danger"],
  ] as const)("the %s glyph keeps its state colour", (mechanism, cls) => {
    const { container } = render(<MechanismGlyph mechanism={mechanism} />);
    expect(within(container).getByTestId("mechanism-glyph").getAttribute("class")).toContain(cls);
  });

  // A 14px row mark like every other (icons.tsx's strokeFor), not the
  // retired 1.9 band value it shipped with (Karthik, 2026-08-28, I2).
  it("the mechanism glyph's stroke follows strokeFor(14), not the retired 1.9 band", () => {
    const html = renderToStaticMarkup(<MechanismGlyph mechanism="symlink" />);
    expect(html).toContain('stroke-width="1.71"');
    expect(html).not.toContain('stroke-width="1.9"');
  });
});
