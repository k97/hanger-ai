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
  FolderClock,
  PackageOpen,
  FolderX,
  Search,
  Inbox,
  PlugZap,
  ZapOff,
  Unlink,
  MousePointerClick,
  MonitorCheck,
  FolderPlus,
  GitPullRequestClosed,
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
  FolderClockIcon,
  PackageOpenIcon,
  FolderXIcon,
  SearchIcon,
  InboxIcon,
  PlugZapIcon,
  ZapOffIcon,
  UnlinkIcon,
  MousePointerClickIcon,
  MonitorCheckIcon,
  FolderPlusIcon,
  GitPullRequestClosedIcon,
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

describe("geometry() helper", () => {
  it("extracts real attribute data, not just tag names", () => {
    // If the inner attrs regex ever stops matching, every entry collapses
    // to the bare tag name plus a trailing space (e.g. "path "), and any
    // two marks with the same tag multiset would compare equal above — the
    // identity tests would stay green while transcribing nothing.
    const g = geometry(renderToStaticMarkup(<FileTextIcon size={40} />));
    expect(g.length).toBeGreaterThan(0);
    expect(g.every((entry) => /=/.test(entry))).toBe(true);
    expect(g.join(" ")).toContain("d=");
  });
});

/**
 * Confirms the stagger delay lands on the element that is itself animating
 * — finding 1 of the final branch review. `animation-name` is not
 * inherited, so a wrapping `<g>` carrying the motion class while its
 * children carry `--i` (the shape this shipped as) computes a delay for
 * children with no animation-name of their own to delay; the group's
 * dashoffset just inherits down to every child at once and they all draw
 * together. Fails if the class carrying the animation and the `--i` that
 * delays it ever separate again — either back onto the wrapping `<g>`, or
 * onto different elements than the ones the delay is computed for.
 */
function assertStaggerWired(html: string, motionAndRule: string, count: number) {
  const moving = Array.from(
    html.matchAll(/<(?:path|circle|line|rect|polyline)\b[^>]*>/g),
  ).filter((m) => m[0].includes('pathLength="1"'));
  expect(moving.length).toBe(count);
  for (const [tag] of moving) {
    expect(tag).toContain(`class="${motionAndRule}"`);
    expect(tag).toMatch(/--i:\s*\d/);
  }
  // the class must never be stranded on the wrapping group instead of the
  // element whose --i it is meant to delay
  expect(html).not.toMatch(/<g class="[^"]*aim-/);
}

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
    expect(still).not.toMatch(/aim-/); // no aim-* class at all while inactive
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

  it("loops only while active; each grid line carries its own animation and delay", () => {
    const active = renderToStaticMarkup(<FrameIcon size={40} active />);
    const still = renderToStaticMarkup(<FrameIcon size={40} />);
    expect(active.match(/<line/g)?.length).toBe(4); // every element moves
    assertStaggerWired(active, "aim-part aim-scan aim-stagger aim-loop", 4);
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

  it("loops only while active; the text lines redraw with their own delay, page and fold hold", () => {
    const active = renderToStaticMarkup(<FileTextIcon size={40} active />);
    const still = renderToStaticMarkup(<FileTextIcon size={40} />);
    expect(active.match(/<path/g)?.length).toBe(5); // page, fold, and the 3 grouped lines
    assertStaggerWired(active, "aim-part aim-scan aim-stagger aim-loop", 3);
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

  it("loops only while active; every element redraws with its own delay", () => {
    const active = renderToStaticMarkup(<Link2Icon size={40} active />);
    const still = renderToStaticMarkup(<Link2Icon size={40} />);
    expect(active.match(/<(path|line)/g)?.length).toBe(3); // every element moves
    assertStaggerWired(active, "aim-part aim-draw aim-stagger aim-loop", 3);
    expect(still).not.toMatch(/aim-/);
  });

  it("is hidden from the accessibility tree", () => {
    expect(renderToStaticMarkup(<Link2Icon size={40} />)).toMatch(/aria-hidden="true"/);
  });
});

// ── entering() marks — play once on mount and hold. No `active` prop: every
// render carries `aim-once`, and `aim-loop` never appears.

describe("FolderClockIcon", () => {
  it("carries exactly the installed lucide folder-clock geometry", () => {
    const ours = geometry(renderToStaticMarkup(<FolderClockIcon size={40} />));
    const theirs = geometry(renderToStaticMarkup(<FolderClock size={40} />));
    expect(ours).toEqual(theirs);
  });

  it("plays once on mount; only the clock hands turn", () => {
    const html = renderToStaticMarkup(<FolderClockIcon size={40} />);
    expect(html).toMatch(/<g class="aim-part aim-spin aim-once"/);
    expect(html).not.toMatch(/aim-loop/);
    const group = html.match(/<g class="aim-part aim-spin aim-once"[^>]*>([\s\S]*?)<\/g>/)![1];
    expect(group.match(/<path/g)?.length).toBe(1);
    expect(group).not.toMatch(/<circle/); // the dial sits outside the group
    expect(html.match(/<circle/g)?.length).toBe(1); // the dial, held still
  });

  it("is hidden from the accessibility tree", () => {
    expect(renderToStaticMarkup(<FolderClockIcon size={40} />)).toMatch(/aria-hidden="true"/);
  });

  it("the clock hands turn about the dial's own centre, not the grid's", () => {
    const html = renderToStaticMarkup(<FolderClockIcon size={40} />);
    expect(html).toMatch(/--ox:\s*16px/);
    expect(html).toMatch(/--oy:\s*16px/);
  });
});

describe("PackageOpenIcon", () => {
  it("carries exactly the installed lucide package-open geometry", () => {
    const ours = geometry(renderToStaticMarkup(<PackageOpenIcon size={40} />));
    const theirs = geometry(renderToStaticMarkup(<PackageOpen size={40} />));
    expect(ours).toEqual(theirs);
  });

  it("plays once on mount; the whole package draws, each stroke with its own delay", () => {
    const html = renderToStaticMarkup(<PackageOpenIcon size={40} />);
    expect(html).not.toMatch(/aim-loop/);
    expect(html.match(/<path/g)?.length).toBe(4); // every element moves
    assertStaggerWired(html, "aim-part aim-draw aim-stagger aim-once", 4);
  });

  it("is hidden from the accessibility tree", () => {
    expect(renderToStaticMarkup(<PackageOpenIcon size={40} />)).toMatch(/aria-hidden="true"/);
  });
});

describe("FolderXIcon", () => {
  it("carries exactly the installed lucide folder-x geometry", () => {
    const ours = geometry(renderToStaticMarkup(<FolderXIcon size={40} />));
    const theirs = geometry(renderToStaticMarkup(<FolderX size={40} />));
    expect(ours).toEqual(theirs);
  });

  it("plays once on mount; the folder holds, each X stroke draws with its own delay", () => {
    const html = renderToStaticMarkup(<FolderXIcon size={40} />);
    expect(html).not.toMatch(/aim-loop/);
    expect(html.match(/<path/g)?.length).toBe(3); // folder outline plus the 2 X strokes
    assertStaggerWired(html, "aim-part aim-draw aim-stagger aim-once", 2);
  });

  it("is hidden from the accessibility tree", () => {
    expect(renderToStaticMarkup(<FolderXIcon size={40} />)).toMatch(/aria-hidden="true"/);
  });
});

describe("SearchIcon", () => {
  it("carries exactly the installed lucide search geometry", () => {
    const ours = geometry(renderToStaticMarkup(<SearchIcon size={40} />));
    const theirs = geometry(renderToStaticMarkup(<Search size={40} />));
    expect(ours).toEqual(theirs);
  });

  it("plays once on mount; the whole glass moves", () => {
    const html = renderToStaticMarkup(<SearchIcon size={40} />);
    expect(html).toMatch(/<g class="aim-part aim-seek aim-once"/);
    expect(html).not.toMatch(/aim-loop/);
    const group = html.match(/<g class="aim-part aim-seek aim-once"[^>]*>([\s\S]*?)<\/g>/)![1];
    expect(group.match(/<(circle|path)/g)?.length).toBe(2);
    expect(html.match(/<(circle|path)/g)?.length).toBe(2); // every element moves
  });

  it("is hidden from the accessibility tree", () => {
    expect(renderToStaticMarkup(<SearchIcon size={40} />)).toMatch(/aria-hidden="true"/);
  });
});

describe("InboxIcon", () => {
  it("carries exactly the installed lucide inbox geometry", () => {
    const ours = geometry(renderToStaticMarkup(<InboxIcon size={40} />));
    const theirs = geometry(renderToStaticMarkup(<Inbox size={40} />));
    expect(ours).toEqual(theirs);
  });

  it("plays once on mount; the whole tray draws, each edge with its own delay", () => {
    const html = renderToStaticMarkup(<InboxIcon size={40} />);
    expect(html).not.toMatch(/aim-loop/);
    expect(html.match(/<(polyline|path)/g)?.length).toBe(2); // every element moves
    assertStaggerWired(html, "aim-part aim-draw aim-stagger aim-once", 2);
  });

  it("is hidden from the accessibility tree", () => {
    expect(renderToStaticMarkup(<InboxIcon size={40} />)).toMatch(/aria-hidden="true"/);
  });
});

describe("PlugZapIcon", () => {
  it("carries exactly the installed lucide plug-zap geometry", () => {
    const ours = geometry(renderToStaticMarkup(<PlugZapIcon size={40} />));
    const theirs = geometry(renderToStaticMarkup(<PlugZap size={40} />));
    expect(ours).toEqual(theirs);
  });

  it("plays once on mount; the whole plug draws, each stroke with its own delay", () => {
    const html = renderToStaticMarkup(<PlugZapIcon size={40} />);
    expect(html).not.toMatch(/aim-loop/);
    expect(html.match(/<path/g)?.length).toBe(5); // every element moves
    assertStaggerWired(html, "aim-part aim-draw aim-stagger aim-once", 5);
  });

  it("is hidden from the accessibility tree", () => {
    expect(renderToStaticMarkup(<PlugZapIcon size={40} />)).toMatch(/aria-hidden="true"/);
  });
});

describe("ZapOffIcon", () => {
  it("carries exactly the installed lucide zap-off geometry", () => {
    const ours = geometry(renderToStaticMarkup(<ZapOffIcon size={40} />));
    const theirs = geometry(renderToStaticMarkup(<ZapOff size={40} />));
    expect(ours).toEqual(theirs);
  });

  it("plays once on mount; the whole bolt draws, each stroke with its own delay", () => {
    const html = renderToStaticMarkup(<ZapOffIcon size={40} />);
    expect(html).not.toMatch(/aim-loop/);
    expect(html.match(/<path/g)?.length).toBe(4); // every element moves
    assertStaggerWired(html, "aim-part aim-draw aim-stagger aim-once", 4);
  });

  it("is hidden from the accessibility tree", () => {
    expect(renderToStaticMarkup(<ZapOffIcon size={40} />)).toMatch(/aria-hidden="true"/);
  });
});

describe("UnlinkIcon", () => {
  it("carries exactly the installed lucide unlink geometry", () => {
    const ours = geometry(renderToStaticMarkup(<UnlinkIcon size={40} />));
    const theirs = geometry(renderToStaticMarkup(<Unlink size={40} />));
    expect(ours).toEqual(theirs);
  });

  it("plays once on mount; the hooks hold, the break marks burst", () => {
    const html = renderToStaticMarkup(<UnlinkIcon size={40} />);
    expect(html).toMatch(/<g class="aim-part aim-burst aim-once"/);
    expect(html).not.toMatch(/aim-loop/);
    const group = html.match(/<g class="aim-part aim-burst aim-once"[^>]*>([\s\S]*?)<\/g>/)![1];
    expect(group.match(/<line/g)?.length).toBe(4);
    expect(group).not.toMatch(/<path/); // the two hooks sit outside the group
    expect(html.match(/<path/g)?.length).toBe(2); // the two hooks, held still
    expect(html.match(/<line/g)?.length).toBe(4);
  });

  it("is hidden from the accessibility tree", () => {
    expect(renderToStaticMarkup(<UnlinkIcon size={40} />)).toMatch(/aria-hidden="true"/);
  });
});

describe("MousePointerClickIcon", () => {
  it("carries exactly the installed lucide mouse-pointer-click geometry", () => {
    const ours = geometry(renderToStaticMarkup(<MousePointerClickIcon size={40} />));
    const theirs = geometry(renderToStaticMarkup(<MousePointerClick size={40} />));
    expect(ours).toEqual(theirs);
  });

  it("plays once on mount; only the sparks radiate", () => {
    const html = renderToStaticMarkup(<MousePointerClickIcon size={40} />);
    expect(html).toMatch(/<g class="aim-part aim-burst aim-once"/);
    expect(html).not.toMatch(/aim-loop/);
    const group = html.match(/<g class="aim-part aim-burst aim-once"[^>]*>([\s\S]*?)<\/g>/)![1];
    expect(group.match(/<path/g)?.length).toBe(4);
    expect(html.match(/<path/g)?.length).toBe(5); // the 4 sparks plus the cursor
  });

  it("is hidden from the accessibility tree", () => {
    expect(renderToStaticMarkup(<MousePointerClickIcon size={40} />)).toMatch(/aria-hidden="true"/);
  });

  it("the sparks radiate from the cursor's tip, not the grid's centre", () => {
    const html = renderToStaticMarkup(<MousePointerClickIcon size={40} />);
    expect(html).toMatch(/--ox:\s*9\.3px/);
    expect(html).toMatch(/--oy:\s*9\.3px/);
  });

  it("the cursor itself sits outside the moving group", () => {
    const html = renderToStaticMarkup(<MousePointerClickIcon size={40} />);
    const group = html.match(/<g class="aim-part aim-burst aim-once"[^>]*>([\s\S]*?)<\/g>/)![1];
    expect(group).not.toMatch(/M9\.037/);
    expect(html).toMatch(/<path d="M9\.037/); // present, just outside the group
  });
});

describe("MonitorCheckIcon", () => {
  it("carries exactly the installed lucide monitor-check geometry", () => {
    const ours = geometry(renderToStaticMarkup(<MonitorCheckIcon size={40} />));
    const theirs = geometry(renderToStaticMarkup(<MonitorCheck size={40} />));
    expect(ours).toEqual(theirs);
  });

  it("plays once on mount; the monitor holds, only the tick draws", () => {
    const html = renderToStaticMarkup(<MonitorCheckIcon size={40} />);
    expect(html).toMatch(/<g class="aim-part aim-draw aim-once"/);
    expect(html).not.toMatch(/aim-loop/);
    const group = html.match(/<g class="aim-part aim-draw aim-once"[^>]*>([\s\S]*?)<\/g>/)![1];
    expect(group.match(/<path/g)?.length).toBe(1);
    expect(group).not.toMatch(/<rect/); // the monitor body sits outside the group
    expect(html.match(/<rect/g)?.length).toBe(1); // the monitor body, held still
    expect(html.match(/<path/g)?.length).toBe(3); // tick, plus the stand and base held still
  });

  it("is hidden from the accessibility tree", () => {
    expect(renderToStaticMarkup(<MonitorCheckIcon size={40} />)).toMatch(/aria-hidden="true"/);
  });
});

describe("FolderPlusIcon", () => {
  it("carries exactly the installed lucide folder-plus geometry", () => {
    const ours = geometry(renderToStaticMarkup(<FolderPlusIcon size={40} />));
    const theirs = geometry(renderToStaticMarkup(<FolderPlus size={40} />));
    expect(ours).toEqual(theirs);
  });

  it("plays once on mount; the folder holds, each plus-stroke draws with its own delay", () => {
    const html = renderToStaticMarkup(<FolderPlusIcon size={40} />);
    expect(html).not.toMatch(/aim-loop/);
    expect(html.match(/<path/g)?.length).toBe(3); // folder outline plus the 2 plus-strokes
    assertStaggerWired(html, "aim-part aim-draw aim-stagger aim-once", 2);
  });

  it("is hidden from the accessibility tree", () => {
    expect(renderToStaticMarkup(<FolderPlusIcon size={40} />)).toMatch(/aria-hidden="true"/);
  });
});

describe("GitPullRequestClosedIcon", () => {
  it("carries exactly the installed lucide git-pull-request-closed geometry", () => {
    const ours = geometry(renderToStaticMarkup(<GitPullRequestClosedIcon size={40} />));
    const theirs = geometry(renderToStaticMarkup(<GitPullRequestClosed size={40} />));
    expect(ours).toEqual(theirs);
  });

  it("plays once on mount; the whole graph draws, each element with its own delay", () => {
    const html = renderToStaticMarkup(<GitPullRequestClosedIcon size={40} />);
    expect(html).not.toMatch(/aim-loop/);
    expect(html.match(/<(circle|path)/g)?.length).toBe(6); // every element moves
    assertStaggerWired(html, "aim-part aim-draw aim-stagger aim-once", 6);
  });

  it("is hidden from the accessibility tree", () => {
    expect(renderToStaticMarkup(<GitPullRequestClosedIcon size={40} />)).toMatch(
      /aria-hidden="true"/,
    );
  });
});
