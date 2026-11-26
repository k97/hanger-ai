// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { useRef } from "react";
import GroupTicks, { type TickGroup } from "./GroupTicks";

/**
 * happy-dom has no IntersectionObserver and lays nothing out, so this file
 * stands in for both: a stub observer whose callback the test fires by hand,
 * and a `getBoundingClientRect` per header that says where the test wants it.
 * What it pins is the wiring (which tick reads current for a given set of
 * header positions), not geometry; where the ticks sit is a screenshot.
 */

let observerCallbacks: IntersectionObserverCallback[] = [];
let observed: Element[] = [];

class StubObserver {
  root: Element | null;
  constructor(cb: IntersectionObserverCallback, opts?: IntersectionObserverInit) {
    observerCallbacks.push(cb);
    this.root = (opts?.root as Element | null) ?? null;
  }
  observe(el: Element) {
    observed.push(el);
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

function rect(top: number): DOMRect {
  return { top, bottom: top + 20, left: 0, right: 400, width: 400, height: 20, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
}

const GROUPS: TickGroup[] = [
  { id: "group-skills", label: "Skills", count: 554 },
  { id: "group-tools", label: "MCP servers", count: 33 },
  { id: "group-rules", label: "Rules", count: 3 },
];

function Harness({ groups = GROUPS }: { groups?: TickGroup[] }) {
  const root = useRef<HTMLDivElement>(null);
  return (
    <>
      <GroupTicks groups={groups} scrollRoot={root} />
      <div ref={root} data-testid="root">
        {groups.map((g) => (
          <h3 key={g.id} id={g.id}>
            {g.label}
          </h3>
        ))}
      </div>
    </>
  );
}

describe("GroupTicks", () => {
  beforeEach(() => {
    observerCallbacks = [];
    observed = [];
    vi.stubGlobal("IntersectionObserver", StubObserver);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is a nav named 'Jump to a group'", () => {
    render(<Harness />);
    expect(screen.getByRole("navigation", { name: "Jump to a group" })).toBeTruthy();
  });

  it("names each tick with its header's own label and count", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Skills · 554" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "MCP servers · 33" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rules · 3" })).toBeTruthy();
  });

  it("names a tick with the label alone when its header shows no figure", () => {
    render(
      <Harness
        groups={[
          { id: "group-skills", label: "Skills", count: null },
          { id: "group-not-loaded", label: "Not loaded by Codex", count: null },
        ]}
      />
    );
    expect(screen.getByRole("button", { name: "Skills" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Not loaded by Codex" })).toBeTruthy();
  });

  it("scrolls the group's header to the top on click", () => {
    const spy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "MCP servers · 33" }));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ block: "start" });
    expect(spy.mock.instances[0]).toBe(document.getElementById("group-tools"));
  });

  it("marks the group nearest the top of the scroll root as current", () => {
    render(<Harness />);
    const root = screen.getByTestId("root");
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue({ ...rect(100), height: 600, bottom: 700 } as DOMRect);
    // Skills has scrolled above the top, MCP servers sits just under it, Rules
    // is far below: MCP servers is the group in view.
    vi.spyOn(document.getElementById("group-skills")!, "getBoundingClientRect").mockReturnValue(rect(-400));
    vi.spyOn(document.getElementById("group-tools")!, "getBoundingClientRect").mockReturnValue(rect(110));
    vi.spyOn(document.getElementById("group-rules")!, "getBoundingClientRect").mockReturnValue(rect(650));

    expect(observerCallbacks).toHaveLength(1);
    expect(observed.map((el) => el.id)).toEqual(["group-skills", "group-tools", "group-rules"]);
    act(() => observerCallbacks[0]([], {} as IntersectionObserver));

    expect(screen.getByRole("button", { name: "MCP servers · 33" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("button", { name: "Skills · 554" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("button", { name: "Rules · 3" }).getAttribute("aria-current")).toBeNull();
  });

  it("marks the first group current before anything has scrolled", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Skills · 554" }).getAttribute("aria-current")).toBe("true");
  });

  it("draws nothing for a single group, which has nowhere to jump", () => {
    render(<Harness groups={[GROUPS[0]]} />);
    expect(screen.queryByRole("navigation", { name: "Jump to a group" })).toBeNull();
  });

  it("shows the tick's name in the app's tooltip on hover", async () => {
    render(<Harness />);
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Rules · 3" }));
    expect((await screen.findByTestId("tooltip")).textContent).toBe("Rules · 3");
  });
});
