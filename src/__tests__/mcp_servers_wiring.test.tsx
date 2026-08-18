// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import App from "../App";

/**
 * Task 7's own wiring, end to end: `get_mcp_servers` reaches the screen, and
 * the View control's grouping choice reaches `get_asset_counts` on the
 * GLOBAL remap site (`refreshGlobalCounts`) — a thing a component test of
 * ProfilePane alone cannot see, because it lives only in App.tsx, which is
 * what actually calls `invoke`.
 *
 * The repo-scoped remap site (`fetchRepoCounts`) deliberately does NOT pass
 * grouping — `get_mcp_servers` is machine-global only, so RepoPane's Tools
 * rows never regroup, and passing grouping to its counts would show a
 * grouped header over ungrouped rows. That correction (coordinator review,
 * 2026-08-18) is pinned below too, not just the thing it fixed.
 */

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
let assetCountsCalls: any[] = [];

const oneServerRow = {
  name: "tauri",
  transport: "stdio",
  registration_count: 3,
  distinct_spec_count: 2,
  agreement: "Conflicting",
  aliased_with: [],
  plugin: null,
  registrations: ["/a/.claude.json:tauri", "/b/.codex/config.toml:tauri", "/c/.gemini/settings.json:tauri"],
};

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
    if (cmd === "get_asset_counts") {
      assetCountsCalls.push(args ?? {});
      return { total_assets: 1, tool: { total: 1, global: 1, project: 0 }, engines: {} };
    }
    if (cmd === "get_asset_annotations") return [];
    if (cmd === "get_detected_engines") return [];
    if (cmd === "get_known_engines") return [];
    if (cmd === "get_mcp_servers") return [oneServerRow];
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

describe("get_mcp_servers reaches the screen", () => {
  beforeEach(() => {
    cleanup();
    eventListeners = {};
    assetCountsCalls = [];
    mockPreferences = {
      onboarding_complete: "true",
      consent_crash: "true",
      consent_usage: "true",
      sidebar_collapsed: "false",
      selected_sidebar_item: "profile",
      inspector_open: "false",
    };
  });

  afterEach(cleanup);

  it("renders the grouped server row's agreement sentence, built from the row's own fields", async () => {
    render(<App />);
    await screen.findByText("tauri");
    expect(screen.getByText("3 registrations · 2 different launch specs")).toBeTruthy();
    expect(screen.getByText("stdio")).toBeTruthy();
  });

  it("passes the active grouping to get_asset_counts, and updates it when Rows changes", async () => {
    render(<App />);
    await screen.findByText("tauri");

    await waitFor(() => {
      expect(assetCountsCalls.some((c) => c.grouping === "grouped")).toBe(true);
    });

    const before = assetCountsCalls.length;
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    fireEvent.click(screen.getByText("One per registration"));

    await waitFor(() => {
      expect(assetCountsCalls.length).toBeGreaterThan(before);
    });
    const latest = assetCountsCalls[assetCountsCalls.length - 1];
    expect(latest.grouping).toBe("per_registration");
  });

  it("persists the grouping choice as a preference the way selected_sidebar_item is persisted", async () => {
    render(<App />);
    await screen.findByText("tauri");

    fireEvent.click(screen.getByRole("button", { name: "View" }));
    fireEvent.click(screen.getByText("One per registration"));

    await waitFor(() => {
      expect(mockPreferences["mcp_server_grouping"]).toBe("registration");
    });
  });
});

describe("RepoPane's counts stay per-registration — no repo-scoped grouping exists", () => {
  beforeEach(() => {
    cleanup();
    eventListeners = {};
    assetCountsCalls = [];
    mockPreferences = {
      onboarding_complete: "true",
      consent_crash: "true",
      consent_usage: "true",
      sidebar_collapsed: "false",
      selected_sidebar_item: "/Users/test/repo",
      inspector_open: "false",
      // "server" is the default anyway; explicit so this test can't pass by
      // accident on account of grouping never having become active.
      mcp_server_grouping: "server",
    };
  });

  afterEach(cleanup);

  it("passes root, but never grouping — a grouped header over ungrouped rows is the bug this pins against", async () => {
    render(<App />);
    await waitFor(() => {
      expect(assetCountsCalls.some((c) => c.root === "/Users/test/repo")).toBe(true);
    });
    const repoCalls = assetCountsCalls.filter((c) => c.root === "/Users/test/repo");
    expect(repoCalls.length).toBeGreaterThan(0);
    expect(repoCalls.every((c) => c.grouping === undefined)).toBe(true);
  });
});
