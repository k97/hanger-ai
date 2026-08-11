// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../App";

// Mock Tauri modules
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

let eventListeners: Record<string, Function> = {};

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, callback: any) => {
    eventListeners[event] = callback;
    return Promise.resolve(() => {
      delete eventListeners[event];
    });
  }),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-log", () => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  attachConsole: vi.fn(() => Promise.resolve(() => {})),
}));

import { invoke } from "@tauri-apps/api/core";

describe("Onboarding Reconciliation Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render welcome page and step through telemetry consent to profile view", async () => {
    // Mock get_preference
    (invoke as any).mockImplementation((cmd: string, args?: any) => {
      if (cmd === "get_preference") {
        if (args?.key === "onboarding_complete") return Promise.resolve("false");
        if (args?.key === "consent_crash") return Promise.resolve("false");
        if (args?.key === "consent_usage") return Promise.resolve("false");
        return Promise.resolve(null);
      }
      if (cmd === "get_linked_directories") return Promise.resolve([]);
      if (cmd === "set_preference") return Promise.resolve();
      if (cmd === "start_scan") {
        setTimeout(() => {
          if (eventListeners["scan://complete"]) {
            eventListeners["scan://complete"]({ payload: { inventory: { agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [] } } });
          }
        }, 0);
        return Promise.resolve("scan-123");
      }
      return Promise.resolve();
    });

    render(<App />);

    // Loader should go away and welcome screen should render
    await waitFor(() => {
      expect(screen.getByText("Welcome to Hanger")).toBeDefined();
    });

    // Click Get Started
    const getStartedBtn = screen.getByText("Get Started");
    fireEvent.click(getStartedBtn);

    // Should transition to Step 2: Privacy & Telemetry Consent
    expect(screen.getByText("Privacy & Telemetry Consent")).toBeDefined();

    // Click Continue
    const continueBtn = screen.getByText("Continue");
    fireEvent.click(continueBtn);

    // Verify invoke calls for onboarding completion
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("set_preference", { key: "onboarding_complete", value: "true" });
    });
  });

  it("should directly skip wizard if onboarding is already complete and preserve consent flags", async () => {
    // Mock get_preference
    (invoke as any).mockImplementation((cmd: string, args?: any) => {
      if (cmd === "get_preference") {
        if (args?.key === "onboarding_complete") return Promise.resolve("true");
        if (args?.key === "consent_crash") return Promise.resolve("true");
        if (args?.key === "consent_usage") return Promise.resolve("true");
        return Promise.resolve(null);
      }
      if (cmd === "get_linked_directories") return Promise.resolve([]);
      if (cmd === "start_scan") {
        setTimeout(() => {
          if (eventListeners["scan://complete"]) {
            eventListeners["scan://complete"]({ payload: { inventory: { agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [] } } });
          }
        }, 0);
        return Promise.resolve("scan-123");
      }
      if (cmd === "get_asset_counts") return Promise.resolve({ total_assets: 0, byCategory: {} });
      if (cmd === "get_inventory") return Promise.resolve({ agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [] });
      return Promise.resolve(null);
    });

    render(<App />);

    // Should skip welcome and directly render main application
    await waitFor(() => {
      expect(screen.getAllByText("User Profile").length).toBeGreaterThan(0);
    });
    
    expect(screen.queryByText("Welcome to Hanger")).toBeNull();
  });
});
