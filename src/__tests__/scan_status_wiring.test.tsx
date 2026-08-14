// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import App from "../App";
import { ScanStatus } from "../hooks/useScanStatus";

type EventCallback = (event: { payload: any }) => void;
const eventListeners: Record<string, EventCallback[]> = {};

let mockScanStatus: ScanStatus = {
  phase: "idle",
  activeRootLabel: null,
  queued: 0,
};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === "get_scan_status") {
      return mockScanStatus;
    }
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
    if (cmd === "get_asset_counts") {
      return { total: 0, byCategory: {}, engines: {} };
    }
    if (cmd === "get_inventory") {
      return { agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [] };
    }
    if (cmd === "set_preference") return null;
    return null;
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, callback: EventCallback) => {
    if (!eventListeners[event]) {
      eventListeners[event] = [];
    }
    eventListeners[event].push(callback);
    return () => {
      eventListeners[event] = eventListeners[event].filter((cb) => cb !== callback);
    };
  }),
}));

describe("Scan status wiring", () => {
  beforeEach(() => {
    mockScanStatus = {
      phase: "idle",
      activeRootLabel: null,
      queued: 0,
    };
    for (const k in eventListeners) {
      delete eventListeners[k];
    }
  });

  it("renders status in the foot line, not the title bar, when scanning with a queue", async () => {
    mockScanStatus = {
      phase: "scanning",
      activeRootLabel: "hanger-ai",
      queued: 1,
    };

    const { unmount } = render(<App />);

    const indicator = await screen.findByTestId("scan-status-indicator");
    expect(indicator).toBeTruthy();
    expect(indicator.textContent).toContain("Scanning hanger-ai · 1 queued");

    // It sits with the figures it is in the middle of changing.
    expect(screen.getByRole("banner").contains(indicator)).toBe(false);

    unmount();
  });

  it("updates the foot text when a scan-status event is received by the app", async () => {
    const { unmount } = render(<App />);

    await waitFor(() => {
      expect(screen.queryByTestId("scan-status-indicator")).toBeNull();
    });

    await waitFor(() => {
      expect(eventListeners["scan-status"]?.length).toBeGreaterThan(0);
    });

    act(() => {
      const listeners = eventListeners["scan-status"] || [];
      listeners.forEach((cb) =>
        cb({
          payload: {
            phase: "resolving",
            activeRootLabel: "links",
            queued: 0,
          },
        })
      );
    });

    await waitFor(() => {
      const indicator = screen.getByTestId("scan-status-indicator");
      expect(indicator.textContent).toContain("Resolving links");
    });

    unmount();
  });
});
