// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
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

// Task 11's boot and toolbar icon swaps were reported unasserted on the
// premise that App.test.tsx could not reach either site. That premise did
// not hold: onboardingComplete starts `null` (App.tsx:659) and only flips
// once the mocked, necessarily-async `get_preference` resolves, so a
// synchronous read right after `render()` still sees the boot gate. The
// toolbar rescan control is gated only on `selectedSidebarItem === "linkmap"`
// (App.tsx:1513), independent of the link graph itself.
describe("App shell v5 marks", () => {
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

  // `mockPreferences`/`eventListeners` are module-level `let`s shared by
  // every test in this file (`:65-66`). `initializeApp`'s async chain keeps
  // running in the background for as long as it takes to settle, whether or
  // not the test that triggered it is still executing — a test that asserts
  // mid-flight and returns without draining that chain leaves it to finish
  // during the NEXT test, racing that test's own instance for the same
  // shared listener registrations. Every test below drains its own instance
  // to a fully-settled, unmounted rest state before returning, so nothing
  // it started can fire during a later test.
  const settle = async () => {
    for (let i = 0; i < 200; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  };

  it("shows the boot mark, turning, before onboarding state has resolved", async () => {
    vi.useFakeTimers();
    try {
      const { container, unmount } = render(<App />);
      // No `await` above this line: `invoke` in the mock is declared
      // `async`, so "get_preference" cannot have resolved yet —
      // onboardingComplete is still null and the boot screen, not the app
      // shell, is what's on screen right now.
      // v5 mark: Disc3Icon — the record turns while startup state loads.
      expect(
        container.querySelector('g.aim-loop path[d="M6 12c0-1.7.7-3.2 1.8-4.2"]')
      ).toBeTruthy();

      // Drain this instance to rest (frozen timer released, never re-armed
      // since `vi.useRealTimers()` below discards anything still pending)
      // and unmount before the next test's instance registers its own
      // listeners into the same shared object.
      await settle();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("turns the rescan mark while the startup scan is in flight, and drops it once the scan completes", async () => {
    mockPreferences.selected_sidebar_item = "linkmap";
    vi.useFakeTimers();
    try {
      const { unmount } = render(<App />);
      // initializeApp's `await invoke("get_preference", ...)` chain is a
      // long sequence of plain microtasks — draining it costs no real timer.
      // The only thing separating "scanning" from "rest" is the fake timer
      // behind the mocked start_scan's scan://complete event, which stays
      // frozen until we explicitly advance it below. Flushing microtasks
      // this way (rather than `waitFor`/`findBy`, whose polling can itself
      // cross a timer boundary) lands deterministically mid-scan.
      for (let i = 0; i < 200 && !screen.queryByLabelText("Rescan"); i++) {
        await act(async () => {
          await Promise.resolve();
        });
      }
      const button = screen.getByLabelText("Rescan");
      // v5 mark: RotateCcwIcon, looping while `loading || scanning` holds.
      expect(button.querySelector('g.aim-loop path[d="M3 3v5h5"]')).toBeTruthy();

      // Release only the mocked start_scan's 0ms timer — not
      // `vi.runAllTimersAsync()`, which never returns here: ScanStamp
      // re-arms a 30s tick (`ScanStamp.tsx:24`) that "run all" chases
      // forever. Advancing by 0ms fires the pending scan://complete without
      // reaching that interval's next tick.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(button.querySelector("g.aim-loop")).toBeNull();

      // Drain the scan-complete handler's own follow-up awaits
      // (refreshGlobalCounts and friends) before unmounting, for the same
      // reason as the boot test above.
      await settle();
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
