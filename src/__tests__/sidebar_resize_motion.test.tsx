// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import * as fs from "fs";
import * as path from "path";
import App from "../App";

/**
 * The rail column eases its collapse and must not ease a drag.
 *
 * `sidebarWidth` has two writers that want opposite things. Collapsing is a
 * discrete state change and eases over `--dur-nav`. The resize handle writes
 * the same value on every mousemove, and against a live width transition each
 * write restarts a fresh interpolation — the column eases toward a target the
 * cursor has already left, trailing it for the whole drag and landing only
 * once the mouse stops.
 *
 * SourceListShell marks the drag on `document.body`; a rule in index.css
 * turns the transition off while the mark is set. This pins both halves.
 *
 * WHAT THIS FILE CANNOT SHOW: that the transition actually stops. happy-dom
 * applies no stylesheet and lays nothing out, so no assertion here reaches
 * computed style or a rendered width (verification.md, on geometry in
 * happy-dom). The flag's lifecycle is real behaviour and is tested as such;
 * the CSS that consumes it is pinned as a class contract — the rule exists,
 * and the element it names carries the attribute. Whether the two meet on
 * screen is a screenshot's job.
 */

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === "get_preference") {
      if (args?.key === "onboarding_complete") return "true";
      if (args?.key === "consent_crash") return "true";
      if (args?.key === "consent_usage") return "true";
      if (args?.key === "sidebar_collapsed") return "false";
      if (args?.key === "sidebar_width") return "240";
      if (args?.key === "selected_sidebar_item") return "profile";
      return null;
    }
    if (cmd === "get_linked_directories") return [];
    if (cmd === "get_asset_counts") return { total: 0, byCategory: {}, engines: {} };
    if (cmd === "get_inventory") {
      return { agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [] };
    }
    if (cmd === "get_detected_engines") return [];
    if (cmd === "set_preference") return null;
    return null;
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

const INDEX_CSS = fs.readFileSync(path.resolve(__dirname, "../styles/index.css"), "utf-8");

/** The drag handle carries no role or label — it is a bare cursor affordance. */
async function dragHandle(): Promise<Element> {
  await screen.findByTestId("sidebar");
  const handle = document.querySelector(".cursor-col-resize");
  expect(handle, "no resize handle rendered").toBeTruthy();
  return handle!;
}

beforeEach(() => {
  cleanup();
  delete document.body.dataset.resizingSidebar;
});

describe("sidebar resize suppresses the rail column's width transition", () => {
  it("marks the body for the length of a drag, and only for that length", async () => {
    render(<App />);
    const handle = await dragHandle();

    expect(document.body.dataset.resizingSidebar).toBeUndefined();

    fireEvent.mouseDown(handle, { clientX: 400 });
    expect(document.body.dataset.resizingSidebar, "not marked while dragging").toBe("true");

    // 240 + (420 - 400) = 260, inside the [216, 320] clamp: the ordinary path.
    fireEvent.mouseUp(window, { clientX: 420 });
    expect(document.body.dataset.resizingSidebar, "still marked after mouseup").toBeUndefined();
  });

  it("clears the mark when the drag ends past the snap-shut threshold", async () => {
    // handleMouseUp returns early once the drag crosses 160px, to collapse
    // instead of resizing. Clearing the flag after that return would leave it
    // set for the rest of the session, permanently disabling the very
    // collapse animation the flag exists to protect -- and the collapse it
    // would disable is the one happening on this exact event.
    render(<App />);
    const handle = await dragHandle();

    fireEvent.mouseDown(handle, { clientX: 400 });
    // 240 + (100 - 400) = -60, well under 160.
    fireEvent.mouseUp(window, { clientX: 100 });

    expect(document.body.dataset.resizingSidebar).toBeUndefined();
    await waitFor(() => expect(screen.queryByTestId("sidebar")).toBeNull());
  });

  it("keeps the rule and the element it targets in agreement", async () => {
    // A class contract, and named as one: the rule below is the half this
    // environment cannot execute. If either side is renamed alone the
    // suppression silently stops applying and nothing else goes red.
    expect(INDEX_CSS).toMatch(/body\[data-resizing-sidebar\]\s*\[data-rail-column\]\s*\{\s*transition:\s*none;/);

    render(<App />);
    await screen.findByTestId("sidebar");
    const column = document.querySelector("[data-rail-column]");
    expect(column, "no element carries data-rail-column").toBeTruthy();
    expect(column!.className, "the rail column stopped transitioning its width").toContain(
      "transition-[width]",
    );
  });

  it("leaves the source list itself with no width transition to fight", async () => {
    // The column inside the rail unmounts on collapse, so a width transition
    // there could only ever animate a drag. Removing it is half the fix; the
    // body flag is the other half, for the rail column that does need one.
    render(<App />);
    const list = await screen.findByTestId("sidebar");
    expect(list.className).not.toMatch(/transition-\[width\]/);
  });
});
