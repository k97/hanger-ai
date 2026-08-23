// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ArchiveBoxIcon, SkillIcon } from "../components/icons";

describe("v4 marks", () => {
  it("ArchiveBoxIcon is a Heroicons outline mark on the 24 grid, stroke-compensated at 14px", () => {
    const html = renderToStaticMarkup(<ArchiveBoxIcon size={14} />);
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain('width="14"');
    // strokeFor(14) is 1.9 (icons.tsx:76-81)
    expect(html).toContain('stroke-width="1.9"');
  });

  it("SkillIcon is the hand-drawn document-with-sparkle on the same grid", () => {
    const html = renderToStaticMarkup(<SkillIcon size={14} />);
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain('stroke="currentColor"');
    expect(html).toContain('stroke-width="1.9"');
    // The sparkle path is what makes it a skill and not a document.
    expect(html).toContain("M18.25 2.75c.45 1.85 1.15 2.55 3 3");
  });
});
