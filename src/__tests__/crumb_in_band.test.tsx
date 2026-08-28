// @vitest-environment happy-dom
/** The breadcrumb lives in the band, not in the content column.
 *
 *  Karthik, 2026-08-28: "the breadcrumb moves when the sidebar opens, even
 *  though the menubar is a separate entity. I don't want it to move." It
 *  used to render inside <main>'s header, so it started wherever <main>
 *  started — beside the toggle only while the source list was collapsed.
 *  Now it renders in the sidebar cap, directly after the toggle, and its
 *  position no longer depends on the source list at all. On the link map,
 *  which has no toggle, it clears the traffic lights with its own inset.
 *  While the inspector is expanded it is not rendered: that column's cap
 *  carries the selected asset's identity in the same band.
 *
 *  A class-and-placement contract — happy-dom lays nothing out; the pixel
 *  position is a screenshot claim (DESIGN.md, Window chrome). */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import App from "../App";

let mockPreferences: Record<string, string> = {};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === "get_preference") return mockPreferences[args?.key] ?? null;
    if (cmd === "set_preference") {
      if (args?.key) mockPreferences[args.key] = String(args.value);
      return null;
    }
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

const classes = (el: Element | null) => (el?.className ?? "").toString().split(/\s+/).filter(Boolean);
const sidebarCap = () => document.querySelector("[data-rail-column] > div") as HTMLElement;
const crumbOf = (leaf: string) => screen.getByText(leaf).parentElement!;

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

describe("The breadcrumb lives in the band", () => {
  it("renders in the sidebar cap after the toggle, and stays there when the source list opens and closes", async () => {
    render(<App />);
    const toggle = await screen.findByRole("button", { name: /toggle sidebar/i });
    const crumb = crumbOf("Needs review");
    expect(sidebarCap().contains(crumb)).toBe(true);
    expect(document.querySelector("main > header")!.contains(crumb)).toBe(false);
    expect(toggle.compareDocumentPosition(crumb) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // No inset that depends on the source list: the position is the toggle's.
    for (const c of ["pl-[51px]", "pl-[18px]", "pl-[28px]"]) expect(classes(crumb)).not.toContain(c);

    fireEvent.click(toggle);
    await waitFor(() => expect(screen.queryByTestId("sidebar")).toBeNull());
    const crumbAfter = crumbOf("Needs review");
    expect(crumbAfter).toBe(crumb);
    expect(sidebarCap().contains(crumbAfter)).toBe(true);
    for (const c of ["pl-[51px]", "pl-[18px]", "pl-[28px]"]) expect(classes(crumbAfter)).not.toContain(c);
  });

  it("on the link map, which has no toggle, it clears the traffic lights with its own inset", async () => {
    mockPreferences.selected_sidebar_item = "linkmap";
    render(<App />);
    await screen.findByText("Link map");
    expect(screen.queryByLabelText("Toggle sidebar")).toBeNull();
    const crumb = crumbOf("Link map");
    expect(sidebarCap().contains(crumb)).toBe(true);
    expect(classes(crumb)).toContain("pl-2");
  });

  it("is not rendered while the inspector is expanded — that column's cap carries the identity", async () => {
    mockPreferences.sidebar_collapsed = "true";
    render(<App />);
    await screen.findByRole("button", { name: /toggle sidebar/i });
    expect(screen.queryByText("Needs review", { selector: "b" })).not.toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Expand inspector" }));
    expect(document.querySelector("main")!.classList.contains("hidden")).toBe(true);
    expect(screen.queryByText("Needs review", { selector: "b" })).toBeNull();
  });
});
