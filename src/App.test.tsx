// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import App, { reconciledDiscoveryKind } from "./App";
import { DIRECTORIES } from "./data/directories";

interface RuleItem {
  path: string;
  name: string;
}

function sortRulesByDepth(rules: RuleItem[]): RuleItem[] {
  return [...rules].sort((a, b) => {
    return a.path.split("/").length - b.path.split("/").length;
  });
}

describe("App Target Rules Path Sorting", () => {
  it("should sort rules root-to-deepest", () => {
    const rulesList: RuleItem[] = [
      { path: "/users/karthik/project/subfolder/deep/AGENTS.md", name: "AGENTS.md" },
      { path: "/users/karthik/project/AGENTS.md", name: "AGENTS.md" },
      { path: "/users/karthik/project/subfolder/AGENTS.md", name: "AGENTS.md" }
    ];

    const sorted = sortRulesByDepth(rulesList);

    expect(sorted[0].path).toBe("/users/karthik/project/AGENTS.md");
    expect(sorted[1].path).toBe("/users/karthik/project/subfolder/AGENTS.md");
    expect(sorted[2].path).toBe("/users/karthik/project/subfolder/deep/AGENTS.md");
  });
});

// reconciledDiscoveryKind is the pure predicate behind the effect that
// resets Discovery's facet when the Favourites list empties out from
// underneath it (whole-branch review finding #1, 2026-08-16).
describe("reconciledDiscoveryKind", () => {
  it("falls back to All once the last favourite is gone while Favourites is active", () => {
    expect(reconciledDiscoveryKind("Favourites", 0)).toBe("All");
  });

  it("leaves Favourites alone while it still has something in it", () => {
    expect(reconciledDiscoveryKind("Favourites", 1)).toBe("Favourites");
  });

  it("never touches any other facet, empty or not", () => {
    expect(reconciledDiscoveryKind("All", 0)).toBe("All");
    expect(reconciledDiscoveryKind("Rules", 0)).toBe("Rules");
  });
});

vi.mock("@tauri-apps/plugin-log", () => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  attachConsole: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(async () => {}),
}));

let mockPreferences: Record<string, string> = {};
let eventListeners: Record<string, Function> = {};

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, callback: any) => {
    eventListeners[event] = callback;
    return Promise.resolve(() => {
      delete eventListeners[event];
    });
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === "get_preference") return mockPreferences[args?.key] ?? null;
    if (cmd === "set_preference") {
      if (args?.key) mockPreferences[args.key] = String(args.value);
      return null;
    }
    if (cmd === "get_linked_directories") return [];
    if (cmd === "get_asset_counts") return { total_assets: 0, engines: {} };
    if (cmd === "get_asset_annotations") return [];
    if (cmd === "get_detected_engines") return [];
    if (cmd === "start_scan") {
      setTimeout(() => {
        eventListeners["scan://complete"]?.({
          payload: {
            inventory: { agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [] },
          },
        });
      }, 0);
      return "mock-scan-id";
    }
    return null;
  }),
}));

/**
 * Reproduces finding #1 of the whole-branch review end to end: favourite a
 * listing, follow it into the sidebar's Favourites view, and unfavourite it
 * from inside that view. Only App.tsx sits at the seam between
 * DiscoverySidebar's favouritesCount gate and DiscoveryPane's `kind` prop —
 * a test of either component alone would re-verify what they already do
 * correctly in isolation and miss the coordination bug between them.
 */
describe("Discovery favourites — the facet doesn't strand the user at zero", () => {
  beforeEach(() => {
    cleanup();
    eventListeners = {};
    mockPreferences = {
      onboarding_complete: "true",
      consent_crash: "true",
      consent_usage: "true",
      sidebar_collapsed: "false",
      selected_sidebar_item: "discovery",
      inspector_open: "false",
      discovery_confirm_open: "true",
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("falls back to All instead of stranding on an empty Favourites view", async () => {
    render(<App />);

    // Land on Discovery with the catalogue rendered.
    await screen.findByText("Smithery");

    // Favourite Smithery from the browse view.
    fireEvent.click(screen.getByRole("button", { name: "Add Smithery to favourites" }));

    // Follow it into the sidebar's Favourites section.
    const favouritesRow = await screen.findByRole("button", { name: "Favourites 1" });
    fireEvent.click(favouritesRow);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Remove Smithery from favourites" })
      ).toBeTruthy();
    });

    // Unfavourite the last item from inside the Favourites view.
    fireEvent.click(screen.getByRole("button", { name: "Remove Smithery from favourites" }));

    // The sidebar section disappears (already correct) ...
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /^Favourites/ })).toBeNull();
    });

    // ... and the pane must not be left showing the empty Favourites state —
    // it should fall back to browsing the whole catalogue.
    expect(screen.queryByText("No favourite matches that filter.")).toBeNull();
    await screen.findByText(`${DIRECTORIES.length} directories`);
    expect(
      screen.getByRole("button", { name: /^All /}).getAttribute("aria-current")
    ).toBe("true");
  });
});
