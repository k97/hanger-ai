// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import App from "../App";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/plugin-log", () => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  attachConsole: vi.fn(() => Promise.resolve(() => {})),
}));

const mockPreferences: Record<string, string> = {
  onboarding_complete: "true",
  consent_crash: "true",
  consent_usage: "true",
  sidebar_collapsed: "false",
  sidebar_width: "240",
  selected_sidebar_item: "profile",
  inspector_open: "false",
};

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
    if (cmd === "get_preference") {
      return mockPreferences[args?.key] ?? null;
    }
    if (cmd === "set_preference") {
      if (args?.key) {
        mockPreferences[args.key] = String(args.value);
      }
      return null;
    }
    if (cmd === "get_linked_directories") return [];
    if (cmd === "get_asset_counts") {
      return { total: 0, byCategory: {}, engines: {} };
    }
    if (cmd === "start_scan") {
      setTimeout(() => {
        if (eventListeners["scan://complete"]) {
          eventListeners["scan://complete"]({
            payload: {
              inventory: { agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [] },
            },
          });
        }
      }, 0);
      return "mock-scan-id";
    }
    return null;
  }),
}));

const flaggedInventory = {
  agents: [],
  rules: [],
  subagents: [],
  project_scans: [],
  skills: [
    { id: "1", name: "drifty-one", description: "", version: "1", path: "/g/one", drifted: true, scope: { Global: { agent: "claude" } } },
    { id: "2", name: "drifty-two", description: "", version: "1", path: "/g/two", drifted: true, scope: { Global: { agent: "claude" } } },
  ],
  tools: [
    { id: "3", name: "broken-tool", command: "x", transport: "stdio", config_path: "/g/tool", scope: { Global: { agent: "claude" } }, owning_agent: "claude", parse_status: "failed" },
  ],
};

describe("Icon rail", () => {
  beforeEach(() => {
    cleanup();
    eventListeners = {};
    mockPreferences.selected_sidebar_item = "profile";
  });

  it("renders the four rail sections", async () => {
    const { unmount } = render(<App />);
    await screen.findByLabelText("My machine");
    expect(screen.getByLabelText("Discovery")).toBeTruthy();
    expect(screen.getByLabelText(/Needs review/)).toBeTruthy();
    expect(screen.getByLabelText("Settings")).toBeTruthy();
    unmount();
  });

  it("switches to Discovery and persists the selection", async () => {
    const { unmount } = render(<App />);
    const discovery = await screen.findByLabelText("Discovery");
    fireEvent.click(discovery);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("set_preference", {
        key: "selected_sidebar_item",
        value: "discovery",
      });
    });
    expect(discovery.getAttribute("aria-current")).toBe("true");
    unmount();
  });

  it("the hanger mark is the home button: any inner screen back to Global", async () => {
    // Karthik's ruling, 2026-08-15: the mark and the crumb's "My machine"
    // always land on My machine › Global.
    mockPreferences.selected_sidebar_item = "discovery";
    const { unmount } = render(<App />);
    await screen.findByText("Where the ecosystem publishes agent assets");

    fireEvent.click(screen.getByLabelText("Hanger"));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("set_preference", {
        key: "selected_sidebar_item",
        value: "profile",
      });
    });
    expect(await screen.findByTestId("sidebar")).toBeTruthy();
    unmount();
  });

  it("the crumb's My machine is the same home button", async () => {
    const { within } = await import("@testing-library/react");
    mockPreferences.selected_sidebar_item = "review";
    const { unmount } = render(<App />);
    await screen.findByText(/needs? a decision from you/);

    // Scoped to the sidebar cap, where the crumb lives since 2026-08-28
    // (crumb_in_band.test.tsx): the rail's machine button shares the name.
    const cap = document.querySelector("[data-rail-column] > div") as HTMLElement;
    fireEvent.click(within(cap).getByRole("button", { name: "My machine" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("set_preference", {
        key: "selected_sidebar_item",
        value: "profile",
      });
    });
    expect(await screen.findByTestId("sidebar")).toBeTruthy();
    unmount();
  });

  it("Design system: a dev-build entry beside Settings that opens the page whole", async () => {
    // vitest runs with import.meta.env.DEV = true, so this is the dev rail.
    const { unmount } = render(<App />);
    const entry = await screen.findByLabelText("Design system");
    fireEvent.click(entry);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("set_preference", {
        key: "selected_sidebar_item",
        value: "design",
      });
    });
    expect(entry.getAttribute("aria-current")).toBe("true");
    // The TOC replaces the machine sidebar; the page has no search field and
    // no inspector — nothing on it is an asset to filter or inspect.
    // Both arrive through lazy imports (dev-only chunks), so await them.
    expect(await screen.findByTestId("design-sidebar")).toBeTruthy();
    expect(screen.queryByTestId("sidebar")).toBeNull();
    expect(await screen.findByText("The system, rendered by the app that uses it")).toBeTruthy();
    // The rail's Search button is on every screen; what the design page
    // lacks is a search *field* of its own and an inspector.
    expect(screen.queryByLabelText("Search assets")).toBeNull();
    // "No inspector" is the column, not the button: the page renders the
    // real InspectorCap as a specimen (2026-08-28), so a "Toggle inspector"
    // button legitimately exists inside a figure. The <aside> is the
    // inspector column (App.tsx) and nothing else in the app is an aside.
    expect(document.querySelector("aside")).toBeNull();
    unmount();
  });

  it("outside dev builds the entry does not exist, and a stale preference lands on Global", async () => {
    vi.stubEnv("DEV", false);
    mockPreferences.selected_sidebar_item = "design";
    try {
      const { unmount } = render(<App />);
      expect(await screen.findByTestId("sidebar")).toBeTruthy();
      expect(screen.queryByLabelText("Design system")).toBeNull();
      expect(screen.queryByTestId("design-sidebar")).toBeNull();
      unmount();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("shows the flagged-asset count badge only when something needs review", async () => {
    const { unmount } = render(<App />);
    const needsReview = await screen.findByLabelText(/Needs review/);
    expect(needsReview.textContent).toBe("");

    eventListeners["scan://complete"]({ payload: { inventory: flaggedInventory } });

    await waitFor(() => {
      expect(screen.getByLabelText("Needs review — 3 flagged").textContent).toBe("3");
    });
    unmount();
  });

  it("switches to Needs review as a section, and persists the selection", async () => {
    const { unmount } = render(<App />);
    const needsReview = await screen.findByLabelText(/Needs review/);
    expect(needsReview.getAttribute("aria-current")).toBeNull();

    fireEvent.click(needsReview);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("set_preference", {
        key: "selected_sidebar_item",
        value: "review",
      });
    });
    expect(needsReview.getAttribute("aria-current")).toBe("true");
    // The second column becomes the issue filter list, not the repository list.
    expect(screen.getByTestId("review-sidebar")).toBeTruthy();
    expect(screen.queryByTestId("sidebar")).toBeNull();
    unmount();
  });

  it("counts duplicates in the badge, not just faults", async () => {
    const { unmount } = render(<App />);
    await screen.findByLabelText(/Needs review/);

    eventListeners["scan://complete"]({
      payload: {
        inventory: {
          ...flaggedInventory,
          skills: [
            ...flaggedInventory.skills,
            { id: "4", name: "shared", description: "", version: "1", path: "/one/shared", scope: { Project: { agent: "claude", root: "/one" } } },
            { id: "5", name: "shared", description: "", version: "1", path: "/two/shared", scope: { Project: { agent: "claude", root: "/two" } } },
          ],
        },
      },
    });

    // 2 drifted + 1 unparsed + 1 duplicate that spans two repositories
    await waitFor(() => {
      expect(screen.getByLabelText("Needs review — 4 flagged").textContent).toBe("4");
    });
    unmount();
  });

  it("Discovery swaps My machine's columns for its own source list", async () => {
    // Discovery once dropped the second column entirely; Karthik reversed
    // that on 2026-08-15 — the category facets are now its source list.
    // The machine sidebar must still go, replaced rather than joined.
    mockPreferences.inspector_open = "true";
    const { unmount } = render(<App />);

    expect(await screen.findByTestId("sidebar")).toBeTruthy();
    expect(screen.getByLabelText("Toggle inspector")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Discovery"));

    await screen.findByText("Where the ecosystem publishes agent assets");

    // The machine's repository list is gone; the catalogue's facets are in.
    expect(screen.queryByTestId("sidebar")).toBeNull();
    expect(screen.queryByTestId("review-sidebar")).toBeNull();
    expect(screen.queryByText("Repositories")).toBeNull();
    expect(screen.getByTestId("discovery-sidebar")).toBeTruthy();
    expect(screen.getByText("Categories")).toBeTruthy();

    // A source list means the sidebar toggle earns its place again; the
    // inspector still has nothing to inspect, so it stays gone.
    expect(screen.getByLabelText(/Toggle sidebar/)).toBeTruthy();
    expect(screen.queryByText("Nothing selected")).toBeNull();
    expect(screen.queryByLabelText("Toggle inspector")).toBeNull();
    unmount();
  });

  it("carries a Search button directly beneath Needs review that opens the palette", async () => {
    const { unmount } = render(<App />);
    const rail = await screen.findByTestId("icon-rail");
    const buttons = Array.from(rail.querySelectorAll("button")).map((b) => b.getAttribute("aria-label"));
    const review = buttons.findIndex((l) => l?.startsWith("Needs review"));
    expect(review).toBeGreaterThan(-1);
    expect(buttons[review + 1]).toBe("Search");
    // Scoped to the rail: the cap's own field (Task 9 removes it) carries
    // the same aria-label until then, so an unscoped query is ambiguous.
    const search = within(rail).getByLabelText("Search");
    // An action, not a place: never current.
    expect(search.getAttribute("aria-current")).toBeNull();
    fireEvent.click(search);
    expect(await screen.findByRole("dialog", { name: "Search" })).toBeTruthy();
    unmount();
  });

  it("⌘K opens the palette and Escape closes it", async () => {
    const { unmount } = render(<App />);
    await screen.findByTestId("icon-rail");
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(await screen.findByRole("dialog", { name: "Search" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Search" })).toBeNull());
    unmount();
  });

  it("the cap carries no search field on any screen — the palette replaced it", async () => {
    for (const item of ["profile", "discovery", "review"]) {
      mockPreferences.selected_sidebar_item = item;
      const { unmount } = render(<App />);
      await screen.findByTestId("icon-rail");
      expect(screen.queryByLabelText("Search assets")).toBeNull();
      expect(screen.queryByLabelText("Clear search")).toBeNull();
      expect(screen.queryByPlaceholderText(/^Search /)).toBeNull();
      unmount();
    }
  });
});
