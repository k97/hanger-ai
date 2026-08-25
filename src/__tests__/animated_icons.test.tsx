// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Disc3 as LucideDisc3 } from "lucide-react";
import { Disc3Icon } from "../components/icons";

/** Every drawable element's geometry attrs, order-independent. */
const geometry = (html: string) =>
  Array.from(html.matchAll(/<(path|circle|line|rect|polyline)\s([^>]*?)\/?>(?:<\/\1>)?/g))
    .map(([, tag, attrs]) => {
      const keep = Array.from(attrs.matchAll(/\b(d|cx|cy|r|x1|x2|y1|y2|x|y|width|height|rx|ry|points)="([^"]+)"/g))
        .map(([, k, v]) => `${k}=${v}`)
        .sort()
        .join(" ");
      return `${tag} ${keep}`;
    })
    .sort();

describe("Disc3Icon", () => {
  it("carries exactly the installed lucide disc-3 geometry", () => {
    const ours = geometry(renderToStaticMarkup(<Disc3Icon size={40} />));
    const theirs = geometry(renderToStaticMarkup(<LucideDisc3 size={40} />));
    expect(ours).toEqual(theirs);
  });

  it("is stroke-compensated by the same table as every other mark", () => {
    const html = renderToStaticMarkup(<Disc3Icon size={12} />);
    expect(html).toMatch(/stroke-width="2.2"/); // strokeFor(12), icons.tsx
  });

  it("loops only while active, and only the arcs move", () => {
    const active = renderToStaticMarkup(<Disc3Icon size={40} active />);
    const still = renderToStaticMarkup(<Disc3Icon size={40} />);
    expect(active).toMatch(/<g class="aim-part aim-spin aim-loop">/);
    // the group holds the two arcs; rim and hub sit outside it
    const group = active.match(/<g class="aim-part aim-spin aim-loop">([\s\S]*?)<\/g>/)![1];
    expect(group.match(/<path/g)?.length).toBe(2);
    expect(group).not.toMatch(/<circle/);
    expect(still).not.toMatch(/aim-loop/);
  });

  it("is hidden from the accessibility tree", () => {
    expect(renderToStaticMarkup(<Disc3Icon size={40} />)).toMatch(/aria-hidden="true"/);
  });
});
