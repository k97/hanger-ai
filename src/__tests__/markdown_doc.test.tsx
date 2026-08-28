// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MarkdownDoc from "../components/MarkdownDoc";
import { toBlocks } from "../utils/skillDocument"; // the app's own parser, skillDocument.ts:205

// Class-contract guard; the rendering is proven by screenshot.
describe("MarkdownDoc type roles", () => {
  it("body is 13px --ink-1 on body leading; heading is 16 medium; code is 12 mono", () => {
    render(<MarkdownDoc blocks={toBlocks("# Title\n\nA paragraph with `code`.\n\n```\nblock\n```")} />);
    const body = screen.getByText(/A paragraph/).closest("div")!;
    expect(body.className).toContain("text-base-app");
    expect(body.className).toContain("text-ink-1");
    expect(body.className).toContain("leading-body");
    expect(body.className).not.toContain("leading-[1.55]");
    // `getByText` matches on a node's own direct text (see
    // `getNodeText` in @testing-library/dom), and the heading's text sits one
    // level down in the `Spans` wrapper — so the match is the inner span, and
    // `closest("h3")` is what actually carries the classes under test.
    const h = screen.getByText("Title").closest("h3")!;
    expect(h.className).toContain("text-lg-app");
    expect(h.className).toContain("font-medium");
    expect(screen.getByText("code").className).toContain("text-small");
    expect(screen.getByText("block").closest("pre")!.className).toContain("leading-code");
  });
});
