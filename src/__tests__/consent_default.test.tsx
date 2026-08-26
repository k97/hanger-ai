// @vitest-environment happy-dom
/**
 * `consent_usage` defaults to on, and the onboarding box shows it.
 *
 * The backend half is pinned by `src-tauri/tests/consent_default_tests.rs`.
 * This is the half the user actually sees: the preference is unset on a first
 * run, and the checkbox has to arrive ticked so the choice is visible and
 * refusable before the Continue button writes it.
 *
 * The second test is the one that matters for anyone who already said no —
 * a stored "false" must survive, not be overwritten by the new default.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import App from "../App";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-log", () => ({
  warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), trace: vi.fn(),
  attachConsole: vi.fn(() => Promise.resolve(() => {})),
}));

import { invoke } from "@tauri-apps/api/core";

function mountWith(consentUsage: string | null) {
  (invoke as any).mockImplementation((cmd: string, args?: any) => {
    if (cmd === "get_preference") {
      if (args?.key === "onboarding_complete") return Promise.resolve("false");
      if (args?.key === "consent_crash") return Promise.resolve(null);
      if (args?.key === "consent_usage") return Promise.resolve(consentUsage);
      return Promise.resolve(null);
    }
    if (cmd === "get_linked_directories") return Promise.resolve([]);
    return Promise.resolve();
  });
  return render(<App />);
}

async function usageCheckbox() {
  await waitFor(() => expect(screen.getByText("Welcome to Hanger")).toBeDefined());
  fireEvent.click(screen.getByText("Get started"));
  const label = screen.getByText("Enable usage analytics").closest("label");
  return label!.querySelector('input[type="checkbox"]') as HTMLInputElement;
}

describe("usage consent default", () => {
  beforeEach(() => vi.clearAllMocks());
  // happy-dom keeps the previous render mounted without this, so the second
  // test finds two of every label and fails on ambiguity rather than value.
  afterEach(() => cleanup());

  it("arrives pre-ticked when the preference has never been set", async () => {
    mountWith(null);
    expect((await usageCheckbox()).checked).toBe(true);
  });

  it("stays unticked for a user who previously declined", async () => {
    mountWith("false");
    expect((await usageCheckbox()).checked).toBe(false);
  });

  it("crash reporting is NOT changed by this — it stays off by default", async () => {
    mountWith(null);
    await waitFor(() => expect(screen.getByText("Welcome to Hanger")).toBeDefined());
    fireEvent.click(screen.getByText("Get started"));
    const label = screen.getByText("Enable crash reporting").closest("label");
    const box = label!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(box.checked).toBe(false);
  });
});
