// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import * as fs from "fs";
import * as path from "path";
import App from "../App";

/** The rail column has no width transition — and the drag never needed one.
 *
 *  Until 2026-08-29 the column eased its collapse (`transition-[width]
 *  duration-nav`) and SourceListShell marked `document.body` for the length of
 *  a drag so a rule in index.css could switch the ease off while the handle
 *  was held. Both went together: the ease made the sheet's corner pop off
 *  the rail (its owner changed at t=0 while the edge travelled for 240ms) and
 *  re-laid out the content column on every frame (~230ms of renderer CPU per
 *  toggle, measured). Instant now: one state change, one layout.
 *
 *  A class contract — happy-dom lays nothing out and animates nothing, so
 *  what this pins is that no width transition exists to fight, on the column
 *  or on the source list inside it, and that index.css carries no rule for a
 *  mark nothing sets any more. */

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

beforeEach(() => {
  cleanup();
  delete document.body.dataset.resizingSidebar;
});

describe("the rail column has no width transition to fight", () => {
  it("the rail column has no width transition, and index.css no rule to suppress one", async () => {
    // Karthik, 2026-08-29: the collapse animated `width` for 240ms while the
    // sheet's corner changed owner at t=0, so the corner popped off the rail,
    // travelled, and popped back — and every frame re-laid out the content
    // column (~230ms of renderer CPU per toggle, measured). The toggle is
    // instant now: state and geometry change in one frame, one layout.
    render(<App />);
    await screen.findByTestId("sidebar");
    const column = document.querySelector("[data-rail-column]");
    expect(column, "no element carries data-rail-column").toBeTruthy();
    expect(column!.className).not.toMatch(/transition-\[width\]/);
    expect(column!.className).not.toMatch(/\bduration-nav\b/);
    expect(INDEX_CSS).not.toMatch(/data-resizing-sidebar/);
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
