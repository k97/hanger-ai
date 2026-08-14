// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import App from "../App";

vi.mock("@tauri-apps/plugin-log", () => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  attachConsole: vi.fn(() => Promise.resolve(() => {})),
}));

// Mock preferences store — seeded per test to model a fresh install or an
// upgrade from the old two-state switcher.
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
    if (cmd === "get_asset_counts") return { total: 0, byCategory: {}, engines: {} };
    if (cmd === "get_inventory") {
      return { agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [] };
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

// happy-dom re-evaluates `matches` when the device setting changes but never
// dispatches `change`, so the live-flip path needs a query list we can drive.
let realMatchMedia: typeof window.matchMedia;
let queriedFor: string[] = [];
let emit: ((matches: boolean) => void) | null = null;

function stubSystemDark(initial: boolean) {
  queriedFor = [];
  const listeners = new Set<(e: any) => void>();
  let matches = initial;
  emit = (next: boolean) => {
    matches = next;
    for (const l of listeners) l({ matches: next });
  };
  window.matchMedia = ((query: string) => {
    queriedFor.push(query);
    return {
      get matches() {
        return matches;
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, l: (e: any) => void) => listeners.add(l),
      removeEventListener: (_: string, l: (e: any) => void) => listeners.delete(l),
      addListener: (l: (e: any) => void) => listeners.add(l),
      removeListener: (l: (e: any) => void) => listeners.delete(l),
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}

const isDark = () => document.documentElement.classList.contains("dark");
const pressed = (label: string) =>
  screen.getByText(label).closest("button")?.getAttribute("aria-pressed");
const openSettings = async () => {
  fireEvent.click(screen.getByLabelText("Settings"));
  await screen.findByText("Auto");
};

describe("Auto theme follows the system", () => {
  beforeEach(() => {
    cleanup();
    eventListeners = {};
    document.documentElement.classList.remove("dark");
    realMatchMedia = window.matchMedia;
    mockPreferences = {
      onboarding_complete: "true",
      consent_crash: "true",
      consent_usage: "true",
      sidebar_collapsed: "false",
      sidebar_width: "240",
      selected_sidebar_item: "profile",
      inspector_open: "false",
    };
  });

  afterEach(() => {
    window.matchMedia = realMatchMedia;
    emit = null;
  });

  it("defaults a fresh install to Auto and paints the system's dark appearance", async () => {
    stubSystemDark(true);
    const { unmount } = render(<App />);
    await screen.findByLabelText("Refresh scan");

    await waitFor(() => expect(isDark()).toBe(true));
    expect(queriedFor).toContain("(prefers-color-scheme: dark)");

    await openSettings();
    expect(pressed("Auto")).toBe("true");
    expect(pressed("Light")).toBe("false");
    expect(pressed("Dark")).toBe("false");
    unmount();
  });

  it("repaints live when the system appearance flips while Auto is active", async () => {
    stubSystemDark(false);
    const { unmount } = render(<App />);
    await screen.findByLabelText("Refresh scan");
    await waitFor(() => expect(isDark()).toBe(false));

    emit!(true);
    await waitFor(() => expect(isDark()).toBe(true));

    emit!(false);
    await waitFor(() => expect(isDark()).toBe(false));
    unmount();
  });

  it("stops following the system once Light is chosen explicitly", async () => {
    stubSystemDark(true);
    const { unmount } = render(<App />);
    await screen.findByLabelText("Refresh scan");
    await waitFor(() => expect(isDark()).toBe(true));

    await openSettings();
    fireEvent.click(screen.getByText("Light"));

    await waitFor(() => expect(isDark()).toBe(false));
    expect(mockPreferences.theme).toBe("light");

    // A later system flip must not override the explicit choice.
    emit!(false);
    emit!(true);
    await waitFor(() => expect(isDark()).toBe(false));
    unmount();
  });

  it("persists Auto explicitly so it survives a restart after a manual choice", async () => {
    stubSystemDark(true);
    mockPreferences.theme = "light";
    const { unmount } = render(<App />);
    await screen.findByLabelText("Refresh scan");
    await waitFor(() => expect(isDark()).toBe(false));

    await openSettings();
    fireEvent.click(screen.getByText("Auto"));

    await waitFor(() => expect(mockPreferences.theme).toBe("auto"));
    await waitFor(() => expect(isDark()).toBe(true));
    unmount();
  });

  it("honours a pre-existing dark_mode choice from the old two-state switcher", async () => {
    stubSystemDark(false);
    mockPreferences.dark_mode = "true";
    const { unmount } = render(<App />);
    await screen.findByLabelText("Refresh scan");

    await waitFor(() => expect(isDark()).toBe(true));
    await openSettings();
    expect(pressed("Dark")).toBe("true");
    unmount();
  });

  it("honours a pre-existing light choice rather than falling through to Auto", async () => {
    stubSystemDark(true);
    mockPreferences.dark_mode = "false";
    const { unmount } = render(<App />);
    await screen.findByLabelText("Refresh scan");

    await waitFor(() => expect(isDark()).toBe(false));
    await openSettings();
    expect(pressed("Light")).toBe("true");
    unmount();
  });

  it("falls back to light when the webview has no matchMedia", async () => {
    // @ts-expect-error — modelling an environment without media query support
    window.matchMedia = undefined;
    const { unmount } = render(<App />);
    await screen.findByLabelText("Refresh scan");

    await waitFor(() => expect(isDark()).toBe(false));
    unmount();
  });
});
