// @vitest-environment happy-dom
/** Every pixel of the 36px band that is not a control drags the window.
 *
 *  Karthik, 2026-11-28: "it's very patchy the drag, if i click when the
 *  inspect is open or around or near titles, it doesnt work". The caps used a
 *  bare `data-tauri-drag-region`, which Tauri's drag.js honours only when the
 *  pointer's exact target carries it — so the crumb, the inspector cap's
 *  title and every other painted child swallowed the drag. `"deep"` makes the
 *  whole subtree drag while clickable elements still block it.
 *
 *  `startsDrag` mirrors `isDragRegion` from tauri 2.12.7
 *  `src/window/scripts/drag.js` (bare/"true" → exact target only, "deep" →
 *  subtree, clickable without the attribute → blocks). happy-dom has no hit
 *  testing, so this proves which element the walk accepts, not that the OS
 *  moves the window — that is a running-build claim (`verifying-ui.md`). */
import * as fs from "fs";
import * as path from "path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import App from "../App";

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

const CLICKABLE = new Set(["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "LABEL", "SUMMARY"]);
const ROLES = new Set(["button", "link", "menuitem", "tab", "checkbox", "radio", "switch", "option"]);
const clickable = (el: HTMLElement) =>
  CLICKABLE.has(el.tagName) ||
  (el.hasAttribute("contenteditable") && el.getAttribute("contenteditable") !== "false") ||
  (el.hasAttribute("tabindex") && el.getAttribute("tabindex") !== "-1") ||
  ROLES.has(el.getAttribute("role") ?? "");

function startsDrag(target: HTMLElement): boolean {
  for (let el: HTMLElement | null = target; el; el = el.parentElement) {
    const attr = el.getAttribute("data-tauri-drag-region");
    if (clickable(el) && attr === null) return false;
    if (attr === null) continue;
    if (attr === "false") return false;
    if (attr === "deep") return true;
    if (attr === "" || attr === "true") return el === target;
  }
  return false;
}

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

describe("The band drags the window from anywhere that is not a control", () => {
  it("a title in the sidebar cap drags; the toggle beside it does not", async () => {
    render(<App />);
    const toggle = await screen.findByRole("button", { name: /toggle sidebar/i });
    const crumbLeaf = screen.getByText("Needs review", { selector: "b" });
    expect(startsDrag(crumbLeaf)).toBe(true);
    expect(startsDrag(toggle)).toBe(false);
  });

  it("every cap row is a deep region, and its controls still refuse the drag", async () => {
    render(<App />);
    await screen.findByRole("button", { name: /toggle sidebar/i });
    const sidebarCap = document.querySelector("[data-rail-column] > div") as HTMLElement;
    const contentCap = document.querySelector("main > header") as HTMLElement;
    const inspectorCap = screen.getByRole("button", { name: "Expand inspector" }).closest("[data-tauri-drag-region]") as HTMLElement;
    for (const cap of [sidebarCap, contentCap, inspectorCap]) {
      expect(cap.getAttribute("data-tauri-drag-region")).toBe("deep");
    }
    expect(startsDrag(screen.getByRole("button", { name: "Expand inspector" }))).toBe(false);
  });
});

/** A drag must also work while another app is frontmost. Without
 *  `acceptFirstMouse` macOS spends the first mousedown on activating the
 *  window, so drag.js never sees it — measured 2026-11-28 with Finder in
 *  front: the strip did not move the window. Karthik took the trade the same
 *  day: a first click into a background Hanger also acts. The config is read
 *  at build time, so only a rebuilt app shows it. */
describe("The main window takes the first mouse", () => {
  it("declares acceptFirstMouse, so a background window drags on the first press", () => {
    const conf = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src-tauri", "tauri.conf.json"), "utf8"));
    expect(conf.app.windows[0].acceptFirstMouse).toBe(true);
  });
});
