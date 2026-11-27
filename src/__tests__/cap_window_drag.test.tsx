// @vitest-environment happy-dom
/** The title band moves the window from anywhere that is not a control.
 *
 *  Karthik, 2026-11-28: "it's very patchy the drag". Two causes, fixed in
 *  turn. First, a bare `data-tauri-drag-region` honours only the exact
 *  target, so titles swallowed the press. Then, with that fixed, 22 of 30 real
 *  presses still did nothing: drag.js asks Rust to drag after the press was
 *  dispatched, and on macOS the Window Server finds no mouse-down to drag from
 *  (tao#1371). The caps now call `start_window_drag`, which drags with the
 *  press cached natively as it arrived (window_drag.rs).
 *
 *  These cases prove which presses ask for a drag and which do not. Whether
 *  the window then moves is a running-build claim (`verifying-ui.md`). */
import * as fs from "fs";
import * as path from "path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import App from "../App";
import InspectorCap from "../components/InspectorCap";
import type { AssetFindings } from "../utils/reviewIssues";
import { onCapMouseDown, onCapMouseUp } from "../windowDrag";

let mockPreferences: Record<string, string> = {};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === "get_preference") return mockPreferences[args?.key] ?? null;
    if (cmd === "set_preference") return null;
    if (cmd === "get_linked_directories") return [];
    if (cmd === "get_asset_counts") return { total: 0, byCategory: {}, engines: {} };
    if (cmd === "get_inventory")
      return { agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [] };
    if (cmd === "get_detected_engines" || cmd === "get_known_engines") return [];
    if (cmd === "get_asset_annotations") return [];
    if (cmd === "get_mcp_processes") return [];
    if (cmd === "get_link_map") return { nodes: [], edges: [] };
    return null;
  }),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));

const asked = (cmd: string) => vi.mocked(invoke).mock.calls.filter(([c]) => c === cmd).length;

beforeEach(() => {
  cleanup();
  mockPreferences = {
    onboarding_complete: "true",
    consent_crash: "true",
    consent_usage: "true",
    sidebar_collapsed: "false",
    selected_sidebar_item: "review",
    inspector_open: "true",
  };
});
afterEach(cleanup);

async function renderApp() {
  render(<App />);
  const toggle = await screen.findByRole("button", { name: /toggle sidebar/i });
  vi.mocked(invoke).mockClear();
  return toggle;
}

describe("The band moves the window from anywhere that is not a control", () => {
  it("a press on a title asks for a drag; a press on the toggle beside it does not", async () => {
    const toggle = await renderApp();
    fireEvent.mouseDown(screen.getByText("Needs review", { selector: "b" }), { button: 0, detail: 1 });
    expect(asked("start_window_drag")).toBe(1);
    fireEvent.mouseDown(toggle, { button: 0, detail: 1 });
    expect(asked("start_window_drag")).toBe(1);
  });

  it("every cap row asks for a drag on its own empty space, and its controls refuse", async () => {
    await renderApp();
    const sidebarCap = document.querySelector("[data-rail-column] > div") as HTMLElement;
    const contentCap = document.querySelector("main > header") as HTMLElement;
    const expand = screen.getByRole("button", { name: "Expand inspector" });
    const inspectorCap = contentCap.ownerDocument.querySelector('[data-testid="inspector-resize-handle"]')!
      .nextElementSibling as HTMLElement;
    expect(inspectorCap.contains(expand)).toBe(true);
    for (const cap of [sidebarCap, contentCap, inspectorCap]) fireEvent.mouseDown(cap, { button: 0, detail: 1 });
    expect(asked("start_window_drag")).toBe(3);
    fireEvent.mouseDown(expand, { button: 0, detail: 1 });
    expect(asked("start_window_drag")).toBe(3);
  });

  it("only the left button drags", async () => {
    await renderApp();
    fireEvent.mouseDown(document.querySelector("main > header")!, { button: 2, detail: 1 });
    expect(asked("start_window_drag")).toBe(0);
  });

  it("a double-click zooms on the second release where it pressed, and never also drags", async () => {
    await renderApp();
    const cap = document.querySelector("main > header")!;
    fireEvent.mouseDown(cap, { button: 0, detail: 2, clientX: 400, clientY: 18 });
    expect(asked("start_window_drag")).toBe(0);
    fireEvent.mouseUp(cap, { button: 0, detail: 2, clientX: 400, clientY: 18 });
    expect(asked("plugin:window|internal_toggle_maximize")).toBe(1);
    fireEvent.mouseDown(cap, { button: 0, detail: 2, clientX: 400, clientY: 18 });
    fireEvent.mouseUp(cap, { button: 0, detail: 2, clientX: 460, clientY: 18 });
    expect(asked("plugin:window|internal_toggle_maximize")).toBe(1);
  });

  it("leaves drag.js nothing to start: no element opts in to Tauri's own drag region", async () => {
    await renderApp();
    const optedIn = Array.from(document.querySelectorAll("[data-tauri-drag-region]")).filter(
      (el) => el.getAttribute("data-tauri-drag-region") !== "false",
    );
    expect(optedIn.map((el) => el.outerHTML.slice(0, 80))).toEqual([]);
  });
});

/** The finding chip's popover is rendered inside the inspector cap, not
 *  portalled, and its root is role="dialog", which is not a control; without
 *  its opt-out a press on a finding's text would drag the window (--dev
 *  review of 7c4efd4, finding 1). */
describe("The finding popover inside the inspector cap", () => {
  it("does not drag the window: its text and its body refuse", () => {
    const findings: AssetFindings = {
      issues: [{
        id: "Skills:broken:/repo/.claude/skills/code-review/SKILL.md",
        name: "code-review",
        category: "Skills",
        kind: "broken",
        problem: "Target missing",
        path: "/repo/.claude/skills/code-review/SKILL.md",
        whereLabel: "Global",
        whereKeys: ["global"],
        crossRepo: false,
      }],
      count: 1,
      severity: "warning",
    };
    const host = createRef<HTMLDivElement>();
    render(
      <div ref={host} onMouseDown={onCapMouseDown} onMouseUp={onCapMouseUp}>
        <InspectorCap
          asset={{ category: "Skills" }}
          place="Global"
          findings={findings}
          inspectorExpanded={false}
          clampTo={host}
          onLink={vi.fn()}
          onOpenInEditor={vi.fn()}
          onCopyPath={vi.fn()}
          onReveal={vi.fn()}
          onReview={vi.fn()}
          onToggleExpanded={vi.fn()}
          onToggleInspector={vi.fn()}
        />
      </div>,
    );
    fireEvent.click(document.querySelector('button[aria-haspopup="dialog"]')!);
    vi.mocked(invoke).mockClear();
    fireEvent.mouseDown(screen.getByTestId("finding-popover"), { button: 0, detail: 1 });
    fireEvent.mouseDown(screen.getByText("Target missing"), { button: 0, detail: 1 });
    expect(asked("start_window_drag")).toBe(0);
    fireEvent.mouseDown(host.current!, { button: 0, detail: 1 });
    expect(asked("start_window_drag")).toBe(1);
  });
});

/** A drag must also work while another app is frontmost. Without
 *  `acceptFirstMouse` macOS spends the first mousedown on activating the
 *  window, so the page never sees it — measured 2026-11-28 with Finder in
 *  front. Karthik took the trade the same day: a first click into a
 *  background Hanger also acts. The config is read at build time. */
describe("The main window takes the first mouse", () => {
  it("declares acceptFirstMouse, so a background window drags on the first press", () => {
    const conf = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src-tauri", "tauri.conf.json"), "utf8"));
    expect(conf.app.windows[0].acceptFirstMouse).toBe(true);
  });
});
