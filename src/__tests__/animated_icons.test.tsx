// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Disc3 as LucideDisc3,
  FolderSync,
  LoaderCircle,
  RotateCcw,
  Server,
  Frame,
  FileText,
  Link2,
} from "lucide-react";
import {
  Disc3Icon,
  FolderSyncIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
  ServerRelayIcon,
  FrameIcon,
  FileTextIcon,
  Link2Icon,
} from "../components/icons";

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

describe("FolderSyncIcon", () => {
  it("carries exactly the installed lucide folder-sync geometry", () => {
    const ours = geometry(renderToStaticMarkup(<FolderSyncIcon size={40} />));
    const theirs = geometry(renderToStaticMarkup(<FolderSync size={40} />));
    expect(ours).toEqual(theirs);
  });

  it("loops only while active, and only the arrows move", () => {
    const active = renderToStaticMarkup(<FolderSyncIcon size={40} active />);
    const still = renderToStaticMarkup(<FolderSyncIcon size={40} />);
    expect(active).toMatch(/<g class="aim-part aim-spin aim-loop"/);
    const group = active.match(/<g class="aim-part aim-spin aim-loop"[^>]*>([\s\S]*?)<\/g>/)![1];
    expect(group.match(/<path/g)?.length).toBe(4);
    expect(active.match(/<path/g)?.length).toBe(5); // folder outline plus the 4 arrows
    expect(still).not.toMatch(/aim-/); // no aim-* class at all while inactive
  });

  it("is hidden from the accessibility tree", () => {
    expect(renderToStaticMarkup(<FolderSyncIcon size={40} />)).toMatch(/aria-hidden="true"/);
  });

  it("folder-sync's arrows spin about their own centre, not the grid's", () => {
    const html = renderToStaticMarkup(<FolderSyncIcon size={40} active />);
    expect(html).toMatch(/--ox:\s*17px/);
    expect(html).toMatch(/--oy:\s*16px/);
  });
});

describe("LoaderCircleIcon", () => {
  it("carries exactly the installed lucide loader-circle geometry", () => {
    const ours = geometry(renderToStaticMarkup(<LoaderCircleIcon size={40} />));
    const theirs = geometry(renderToStaticMarkup(<LoaderCircle size={40} />));
    expect(ours).toEqual(theirs);
  });

  it("loops only while active; its single arc is the whole mark", () => {
    const active = renderToStaticMarkup(<LoaderCircleIcon size={40} active />);
    const still = renderToStaticMarkup(<LoaderCircleIcon size={40} />);
    expect(active).toMatch(/<g class="aim-part aim-spin aim-loop">/);
    const group = active.match(/<g class="aim-part aim-spin aim-loop">([\s\S]*?)<\/g>/)![1];
    expect(group.match(/<path/g)?.length).toBe(1);
    expect(active.match(/<path/g)?.length).toBe(1);
    expect(still).not.toMatch(/aim-/);
  });

  it("is hidden from the accessibility tree", () => {
    expect(renderToStaticMarkup(<LoaderCircleIcon size={40} />)).toMatch(/aria-hidden="true"/);
  });
});

describe("RotateCcwIcon", () => {
  it("carries exactly the installed lucide rotate-ccw geometry", () => {
    const ours = geometry(renderToStaticMarkup(<RotateCcwIcon size={40} />));
    const theirs = geometry(renderToStaticMarkup(<RotateCcw size={40} />));
    expect(ours).toEqual(theirs);
  });

  it("loops only while active; both strokes turn together", () => {
    const active = renderToStaticMarkup(<RotateCcwIcon size={40} active />);
    const still = renderToStaticMarkup(<RotateCcwIcon size={40} />);
    expect(active).toMatch(/<g class="aim-part aim-spin-ccw aim-loop">/);
    const group = active.match(/<g class="aim-part aim-spin-ccw aim-loop">([\s\S]*?)<\/g>/)![1];
    expect(group.match(/<path/g)?.length).toBe(2);
    expect(active.match(/<path/g)?.length).toBe(2); // every element moves
    expect(still).not.toMatch(/aim-/);
  });

  it("is hidden from the accessibility tree", () => {
    expect(renderToStaticMarkup(<RotateCcwIcon size={40} />)).toMatch(/aria-hidden="true"/);
  });
});

describe("ServerRelayIcon", () => {
  it("carries exactly the installed lucide server geometry", () => {
    const ours = geometry(renderToStaticMarkup(<ServerRelayIcon size={40} />));
    const theirs = geometry(renderToStaticMarkup(<Server size={40} />));
    expect(ours).toEqual(theirs);
  });

  it("loops only while active; both racks move, none held still", () => {
    const active = renderToStaticMarkup(<ServerRelayIcon size={40} active />);
    const still = renderToStaticMarkup(<ServerRelayIcon size={40} />);
    const groups = Array.from(
      active.matchAll(/<g class="aim-part aim-relay aim-loop"[^>]*>([\s\S]*?)<\/g>/g),
    ).map((m) => m[1]);
    expect(groups.length).toBe(2); // two racks, each its own group
    expect(groups.join("").match(/<(rect|line)/g)?.length).toBe(4);
    expect(active.match(/<(rect|line)/g)?.length).toBe(4); // every element moves
    expect(still).not.toMatch(/aim-/);
  });

  it("is hidden from the accessibility tree", () => {
    expect(renderToStaticMarkup(<ServerRelayIcon size={40} />)).toMatch(/aria-hidden="true"/);
  });

  it("the relay's second rack runs half a cycle out of phase", () => {
    const html = renderToStaticMarkup(<ServerRelayIcon size={12} active />);
    expect(html).toMatch(/animation-delay:\s*-0?\.6s/);
    expect(html.match(/aim-relay/g)?.length).toBe(2); // two racks, both moving
  });
});

describe("FrameIcon", () => {
  it("carries exactly the installed lucide frame geometry", () => {
    const ours = geometry(renderToStaticMarkup(<FrameIcon size={40} />));
    const theirs = geometry(renderToStaticMarkup(<Frame size={40} />));
    expect(ours).toEqual(theirs);
  });

  it("loops only while active; the whole grid redraws", () => {
    const active = renderToStaticMarkup(<FrameIcon size={40} active />);
    const still = renderToStaticMarkup(<FrameIcon size={40} />);
    expect(active).toMatch(/<g class="aim-part aim-scan aim-stagger aim-loop">/);
    const group = active.match(
      /<g class="aim-part aim-scan aim-stagger aim-loop">([\s\S]*?)<\/g>/,
    )![1];
    expect(group.match(/<line/g)?.length).toBe(4);
    expect(active.match(/<line/g)?.length).toBe(4); // every element moves
    expect(group).toMatch(/pathLength="1"/); // drawn: true
    expect(still).not.toMatch(/aim-/);
  });

  it("is hidden from the accessibility tree", () => {
    expect(renderToStaticMarkup(<FrameIcon size={40} />)).toMatch(/aria-hidden="true"/);
  });
});

describe("FileTextIcon", () => {
  it("carries exactly the installed lucide file-text geometry", () => {
    const ours = geometry(renderToStaticMarkup(<FileTextIcon size={40} />));
    const theirs = geometry(renderToStaticMarkup(<FileText size={40} />));
    expect(ours).toEqual(theirs);
  });

  it("loops only while active; the text lines redraw, page and fold hold", () => {
    const active = renderToStaticMarkup(<FileTextIcon size={40} active />);
    const still = renderToStaticMarkup(<FileTextIcon size={40} />);
    expect(active).toMatch(/<g class="aim-part aim-scan aim-stagger aim-loop">/);
    const group = active.match(
      /<g class="aim-part aim-scan aim-stagger aim-loop">([\s\S]*?)<\/g>/,
    )![1];
    expect(group.match(/<path/g)?.length).toBe(3);
    expect(active.match(/<path/g)?.length).toBe(5); // page, fold, and the 3 grouped lines
    expect(still).not.toMatch(/aim-/);
  });

  it("is hidden from the accessibility tree", () => {
    expect(renderToStaticMarkup(<FileTextIcon size={40} />)).toMatch(/aria-hidden="true"/);
  });
});

describe("Link2Icon", () => {
  it("carries exactly the installed lucide link-2 geometry", () => {
    const ours = geometry(renderToStaticMarkup(<Link2Icon size={40} />));
    const theirs = geometry(renderToStaticMarkup(<Link2 size={40} />));
    expect(ours).toEqual(theirs);
  });

  it("loops only while active; the whole link redraws", () => {
    const active = renderToStaticMarkup(<Link2Icon size={40} active />);
    const still = renderToStaticMarkup(<Link2Icon size={40} />);
    expect(active).toMatch(/<g class="aim-part aim-draw aim-stagger aim-loop">/);
    const group = active.match(
      /<g class="aim-part aim-draw aim-stagger aim-loop">([\s\S]*?)<\/g>/,
    )![1];
    expect(group.match(/<(path|line)/g)?.length).toBe(3);
    expect(active.match(/<(path|line)/g)?.length).toBe(3); // every element moves
    expect(still).not.toMatch(/aim-/);
  });

  it("is hidden from the accessibility tree", () => {
    expect(renderToStaticMarkup(<Link2Icon size={40} />)).toMatch(/aria-hidden="true"/);
  });
});
