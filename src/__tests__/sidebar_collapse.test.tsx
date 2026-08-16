// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../App";

// Overridden per-test; drives get_detected_engines through the invoke mock
// below, since App fetches engines itself and passes them down to Sidebar.
let mockDetectedEngines: { id: string; name: string }[] = [];

// Mock @tauri-apps/api/core
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
    if (cmd === "get_asset_counts") {
      return { total: 0, byCategory: {}, engines: {} };
    }
    if (cmd === "get_inventory") {
      return { agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [] };
    }
    if (cmd === "get_detected_engines") return mockDetectedEngines;
    if (cmd === "set_preference") return null;
    return null;
  }),
}));

// Mock @tauri-apps/api/event
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

afterEach(() => {
  mockDetectedEngines = [];
});

describe("Sidebar collapse and persistence", () => {
  it("exposes a sidebar toggle, hiding the sidebar entirely when clicked, and persisting across remount", async () => {
    const { unmount } = render(<App />);

    // 1. Sidebar toggle button must be rendered in top toolbar
    const toggleButton = await screen.findByRole("button", { name: /toggle sidebar/i });
    expect(toggleButton).toBeTruthy();

    // Initially sidebar is visible
    expect(screen.getByTestId("sidebar")).toBeTruthy();

    // 2. Click toggle button -> hides sidebar entirely
    fireEvent.click(toggleButton);

    await waitFor(() => {
      expect(screen.queryByTestId("sidebar")).toBeNull();
    });

    unmount();
  });

  it("shows one mark per detected engine before the names", async () => {
    mockDetectedEngines = [
      { id: "claude-code", name: "Claude Code" },
      { id: "codex", name: "Codex" },
    ];
    const { unmount } = render(<App />);

    const subtitle = await screen.findByTestId("global-engines-subtitle");
    await waitFor(() => {
      expect(subtitle.querySelectorAll("svg[data-brand]").length).toBeGreaterThan(0);
    });
    const marks = Array.from(subtitle.querySelectorAll("svg[data-brand]")).map((s) =>
      s.getAttribute("data-brand"),
    );
    expect(marks).toEqual(["claude_code", "codex"]);
    expect(subtitle.textContent).toContain("Claude Code, Codex");

    unmount();
  });
});
