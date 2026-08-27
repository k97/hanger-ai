// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import * as fs from "fs";
import * as path from "path";
import App from "../App";
import { MAIN_MIN_WIDTH } from "../utils/inspectorLayout";

/**
 * WHAT THIS FILE DOES NOT VERIFY.
 *
 * The change these tests accompany is entirely geometric: the inspector's
 * drag runs past its old 480px ceiling, resists at main-content's floor,
 * snaps to the expanded state ~60px further, and drags back out again, while
 * main-content grows a horizontal scrollbar below MAIN_MIN_WIDTH.
 *
 * `happy-dom` lays nothing out. Every `offsetWidth`, `scrollWidth`,
 * `clientWidth` and `getBoundingClientRect()` here reads 0, there is no paint
 * order, and `ResizeObserver.observe()` is a no-op that never fires. So NO
 * test in this repo can observe the resist point, the snap, the restore, the
 * refit on window resize, or whether anything actually scrolls. A test that
 * appeared to would be asserting against constants it fed itself.
 *
 * Only a screenshot from a running build covers that behaviour
 * (`.claude/rules/verifying-ui.md`); Karthik verifies it by dragging the
 * handle in the real window.
 *
 * What survives without layout, and is all that is pinned below:
 *   1. The drag handle exists while the inspector is expanded — the gate that
 *      previously made the expanded state a one-way door.
 *   2. The pane wrapper carries `overflow-x-auto` and takes its minimum width
 *      from the MAIN_MIN_WIDTH constant, not a second hardcoded copy.
 *   3. The old 480px ceiling is gone from App.tsx.
 */

vi.mock("@tauri-apps/plugin-log", () => ({
  warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), trace: vi.fn(),
  attachConsole: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(), openPath: vi.fn(), revealItemInDir: vi.fn() }));

let mockPreferences: Record<string, string> = {};
let eventListeners: Record<string, Function> = {};

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, callback: any) => {
    eventListeners[event] = callback;
    return Promise.resolve(() => { delete eventListeners[event]; });
  }),
}));

const inventory = {
  agents: [],
  skills: [
    {
      id: "skill-1",
      name: "Claude Math Skill",
      description: "Math Solver",
      version: "1.0.0",
      path: "/home/user/.claude/skills/math",
      scope: { Global: { agent: "claude-code" } },
    },
  ],
  tools: [],
  rules: [],
  subagents: [],
  project_scans: [],
};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === "get_preference") return mockPreferences[args?.key] ?? null;
    if (cmd === "set_preference") {
      if (args?.key) mockPreferences[args.key] = String(args.value);
      return null;
    }
    if (cmd === "get_linked_directories") return [];
    if (cmd === "get_asset_counts")
      return {
        total_assets: 1,
        skill: { total: 1, global: 1, project: 0 },
        tool: { total: 0, global: 0, project: 0 },
        rule: { total: 0, global: 0, project: 0 },
        subagent: { total: 0, global: 0, project: 0 },
        engines: {},
      };
    if (cmd === "get_asset_annotations") return [];
    if (cmd === "get_detected_engines" || cmd === "get_known_engines")
      return [{ id: "claude-code", name: "Claude Code" }];
    if (cmd === "get_mcp_processes") return [];
    if (cmd === "mcp_cached_probe") return { result: null, verifiedAt: null, fromCache: false, declined: false };
    if (cmd === "read_asset_body")
      return {
        path: "/home/user/.claude/skills/math/SKILL.md",
        text: "# math",
        bytes: 7, lines: 1, estimated_tokens: 2,
        always_on_bytes: null, always_on_estimated_tokens: null, modified_ms: null,
      };
    if (cmd === "list_asset_dir") return [];
    if (cmd === "start_scan") {
      setTimeout(() => {
        eventListeners["scan://complete"]?.({ payload: { inventory } });
      }, 0);
      return "mock-scan-id";
    }
    return null;
  }),
}));

beforeEach(() => {
  cleanup();
  eventListeners = {};
  mockPreferences = {
    onboarding_complete: "true",
    consent_crash: "true",
    consent_usage: "true",
    sidebar_collapsed: "false",
    selected_sidebar_item: "profile",
    inspector_open: "true",
  };
});

afterEach(cleanup);

describe("The inspector's resize handle survives the expanded state", () => {
  it("still renders the handle after the cap's Expand button is used", async () => {
    render(<App />);

    // Nothing selected: the column is open and its cap is rendered regardless.
    const expand = await screen.findByRole("button", { name: "Expand inspector" });
    fireEvent.click(expand);

    // The cap flips to Collapse — the state actually changed.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Collapse inspector" })).toBeTruthy()
    );

    // ...and the handle is still there, so the drag can come back out again.
    expect(screen.getByTestId("inspector-resize-handle")).toBeTruthy();
  });
});

describe("Main-content's pane wrapper scrolls horizontally below its floor", () => {
  it("wraps the panes in an overflow-x-auto column with MAIN_MIN_WIDTH as its floor", async () => {
    render(<App />);
    await screen.findByText("Claude Math Skill");

    const scroller = document.querySelector("main > div.overflow-x-auto") as HTMLElement | null;
    expect(scroller).not.toBeNull();

    const floor = scroller!.firstElementChild as HTMLElement | null;
    expect(floor).not.toBeNull();
    // The constant reaches the DOM, never a second literal (Karthik's ruling 6,
    // 2026-08-27): MAIN_MIN_WIDTH is his to tune in one place.
    expect(floor!.style.minWidth).toBe(`${MAIN_MIN_WIDTH}px`);

    // The wrapper has to contain the panes, not merely exist beside them: a
    // refactor that emptied it and put the panes back under <main> would pass
    // every assertion above unchanged.
    expect(within(floor!).getByText("Claude Math Skill")).toBeTruthy();
    // ...and the content cap stays outside it, pinned. It carries the window
    // drag region; inside the scroller it would slide away horizontally.
    expect(scroller!.querySelector("header")).toBeNull();
    expect(document.querySelector("main > header")).not.toBeNull();
  });
});

describe("A press on the resize handle that never moved is not a resize", () => {
  it("persists nothing on a bare click, and does persist once the pointer moves", async () => {
    render(<App />);
    await screen.findByText("Claude Math Skill");
    const handle = screen.getByTestId("inspector-resize-handle");

    // Press and release with no movement in between. The stored width is an
    // intent that may be wider than what currently fits; recomputing it from
    // a stationary pointer would overwrite that intent with whatever happens
    // to fit right now and persist it, and widening the window would never
    // bring the chosen width back.
    // clientX 0 on purpose. `askedFor` is `window.innerWidth - ev.clientX`,
    // so a press at the far left asks for the whole window — comfortably past
    // the snap margin. If the guard sat after the setters instead of before
    // them, this click alone would flip the panel to expanded, and <main>
    // would go `hidden`. That is the half the preference assertion cannot see.
    fireEvent.mouseDown(handle, { clientX: 0 });
    fireEvent.mouseUp(window, { clientX: 0 });
    expect(mockPreferences.inspector_width).toBeUndefined();
    // classList, not a substring match: the non-expanded className carries
    // `overflow-hidden`, which contains "hidden".
    expect(document.querySelector("main")!.classList.contains("hidden")).toBe(false);

    // Its own control: the same gesture WITH a move does write. Without this
    // half, the assertion above would pass just as happily for a handler that
    // had stopped persisting anything at all.
    fireEvent.mouseDown(handle, { clientX: 0 });
    fireEvent.mouseMove(window, { clientX: 600 });
    fireEvent.mouseUp(window, { clientX: 600 });
    await waitFor(() => expect(mockPreferences.inspector_width).toBeDefined());
    // The value written is deliberately not asserted. It is a function of the
    // measured layout, and happy-dom has none — see the file header.
  });
});

describe("The expanded state does not outlive the panel that can undo it", () => {
  it("gives <main> back when the screen no longer renders the inspector", async () => {
    render(<App />);
    await screen.findByText("Claude Math Skill");
    const main = () => document.querySelector("main")!;

    fireEvent.click(screen.getByRole("button", { name: "Expand inspector" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Collapse inspector" })).toBeTruthy()
    );
    // Expanded takes the content column off the screen entirely.
    expect(main().classList.contains("hidden")).toBe(true);

    // Link map is one of the three screens the inspector column does not
    // render on, and the Collapse control lives in that column's cap. Left
    // expanded, this navigation would leave the rail beside a blank page with
    // no way back to the content.
    fireEvent.click(screen.getByRole("button", { name: "Link map" }));

    await waitFor(() => expect(main().classList.contains("hidden")).toBe(false));
    expect(screen.queryByRole("button", { name: "Collapse inspector" })).toBeNull();
  });
});

describe("The old resize ceiling is gone", () => {
  it("leaves no Math.min(480 in App.tsx", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../App.tsx"), "utf-8");
    const offenders = source
      .split("\n")
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => line.includes("Math.min(480"));
    expect(offenders.map((o) => `${o.n}: ${o.line.trim()}`)).toEqual([]);
  });
});

describe("The inspector's cap leads the window when it is the leftmost column", () => {
  /**
   * WHAT THIS DESCRIBE DOES NOT VERIFY — the file header's caveat, restated
   * because it bites hardest here. macOS's traffic lights are drawn by the
   * window server and are not in the DOM, and `happy-dom` gives every element
   * a zero-sized rect, so NO test below shows that the cap's glyph and
   * eyebrow actually clear the green light. That is Karthik's screenshot of
   * the running build (`.claude/rules/verifying-ui.md`).
   *
   * What is assertable is the class contract: a className reaches the DOM
   * verbatim whether or not anything is laid out.
   */
  const capRow = () =>
    screen.getByRole("button", { name: "Collapse inspector" }).closest("div.select-none")!;

  it("leads with 51px when the source list is collapsed and the inspector is expanded", async () => {
    mockPreferences.sidebar_collapsed = "true";
    render(<App />);
    await screen.findByText("Claude Math Skill");

    fireEvent.click(screen.getByRole("button", { name: "Expand inspector" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Collapse inspector" })).toBeTruthy()
    );

    // The same measured 51px <main>'s header uses in this exact position
    // (`App.tsx`, the breadcrumb's three-case lead): the collapsed rail's
    // toggle overflows its 56px into whichever column comes next, and
    // expanded, that column is this one.
    expect(capRow().className).toContain("pl-[51px]");
    expect(capRow().className).not.toContain("pl-[18px]");
  });

  it("keeps its 18px lead when the source list is open", async () => {
    mockPreferences.sidebar_collapsed = "false";
    render(<App />);
    await screen.findByText("Claude Math Skill");

    fireEvent.click(screen.getByRole("button", { name: "Expand inspector" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Collapse inspector" })).toBeTruthy()
    );

    // Without this half, the assertion above passes just as happily for a cap
    // that always leads with 51 — including one whose new prop is ignored.
    expect(capRow().className).toContain("pl-[18px]");
    expect(capRow().className).not.toContain("pl-[51px]");
  });
});
