// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import App from "../App";

/**
 * Where `Registration.running` comes from, and what happens when it is wrong.
 *
 * `cached_probe` confirms against the live process table before it starts
 * anything, so this snapshot is a hint rather than the thing Rule 2 rests on.
 * It still decides what the panel SHOWS — the pid badge, and whether Hanger
 * pays for a live check at all — and it had two ways of being quietly false:
 * a rejected scan was recorded as "nothing is running", and the answer was
 * fetched once for the life of the process.
 */

let mockPreferences: Record<string, string> = {};
let eventListeners: Record<string, Function> = {};
let processCalls = 0;
let processHandler: () => Promise<unknown> = async () => [];

vi.mock("@tauri-apps/plugin-log", () => ({
  warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), trace: vi.fn(),
  attachConsole: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(), revealItemInDir: vi.fn() }));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, callback: any) => {
    eventListeners[event] = callback;
    return Promise.resolve(() => { delete eventListeners[event]; });
  }),
}));

const serverRow = {
  name: "spades-audio",
  transport: "stdio",
  registration_count: 1,
  distinct_spec_count: 1,
  agreement: "Consistent",
  aliased_with: [],
  plugin: null,
  registrations: ["/Users/x/.claude.json:spades-audio"],
};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === "get_preference") return mockPreferences[args?.key] ?? null;
    if (cmd === "set_preference") {
      if (args?.key) mockPreferences[args.key] = String(args.value);
      return null;
    }
    if (cmd === "get_mcp_processes") {
      processCalls += 1;
      return processHandler();
    }
    if (cmd === "get_linked_directories") return [];
    if (cmd === "get_asset_counts") {
      return { total_assets: 1, tool: { total: 1, global: 1, project: 0 }, engines: {} };
    }
    if (cmd === "get_asset_annotations") return [];
    if (cmd === "get_detected_engines") return [];
    if (cmd === "get_known_engines") return [];
    if (cmd === "get_mcp_servers") return [serverRow];
    if (cmd === "mcp_cached_probe") {
      return { result: null, verifiedAt: null, fromCache: false, declined: false };
    }
    if (cmd === "start_scan") {
      setTimeout(() => {
        eventListeners["scan://complete"]?.({
          payload: {
            inventory: {
              agents: [], skills: [], rules: [], subagents: [], project_scans: [],
              tools: [
                {
                  id: "/Users/x/.claude.json:spades-audio",
                  name: "spades-audio",
                  command: "node",
                  launch_display: "node /App/index.js",
                  transport: "stdio",
                  config_path: "/Users/x/.claude.json",
                  scope: { Global: { agent: "claude-code" } },
                  owning_agent: "claude-code",
                  drifted: false,
                },
              ],
            },
          },
        });
      }, 0);
      return "mock-scan-id";
    }
    return null;
  }),
}));

const enterMcpView = async () => {
  const chip = await screen.findByRole("button", { name: /MCP servers/ });
  fireEvent.click(chip);
  return chip;
};

beforeEach(() => {
  cleanup();
  eventListeners = {};
  processCalls = 0;
  processHandler = async () => [];
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

describe("the running-process snapshot", () => {
  it("does not record a failed scan as 'nothing is running'", async () => {
    // `.catch(() => setMcpProcesses([]))` turned a failure into an answer, and
    // an empty array is an assertion: nothing on this machine is running. The
    // app then held that assertion for the rest of the session and never asked
    // again. A failure has to leave the question open.
    processHandler = async () => {
      throw new Error("run_scan failed");
    };

    render(<App />);
    const chip = await enterMcpView();
    await waitFor(() => expect(processCalls).toBe(1));

    // Leave the view and come back. With a fabricated answer in hand there is
    // nothing to ask for; with the question still open there is.
    fireEvent.click(chip);
    fireEvent.click(chip);
    await waitFor(() => expect(processCalls).toBe(2));
  });

  it("stops asking once it has a real answer, including a genuinely empty one", async () => {
    // The other side: an empty array that came from a scan that actually ran
    // IS an answer, and re-asking on every re-entry would pay for a rescan to
    // learn what is already known.
    processHandler = async () => [];

    render(<App />);
    const chip = await enterMcpView();
    await waitFor(() => expect(processCalls).toBe(1));

    fireEvent.click(chip);
    fireEvent.click(chip);
    await new Promise((r) => setTimeout(r, 20));
    expect(processCalls).toBe(1);
  });

  it("keeps one scan in flight at a time, however fast the panels are opened", async () => {
    // The refresh above calls `get_mcp_processes`, which runs `run_scan` —
    // 11.2s measured. Clicking through servers must not stack one rescan per
    // click; the reading in flight is already the fresh one being waited for.
    processHandler = () => new Promise(() => {});

    render(<App />);
    await enterMcpView();
    await waitFor(() => expect(processCalls).toBe(1));

    fireEvent.click(await screen.findByText("spades-audio"));
    await new Promise((r) => setTimeout(r, 30));
    expect(processCalls).toBe(1);
  });

  it("takes a fresh reading when a server's panel is opened", async () => {
    // The unbounded half. The snapshot was fetched once, on the first look at
    // Tools, for the life of the process — so a server started by a host at
    // 4pm read as stopped all afternoon, and opening its panel was the exact
    // moment Hanger would decide it was safe to start a second copy. A panel
    // open is when the answer matters, so it is when the answer is taken.
    processHandler = async () => [];

    render(<App />);
    await enterMcpView();
    await waitFor(() => expect(processCalls).toBe(1));

    fireEvent.click(await screen.findByText("spades-audio"));
    await waitFor(() => expect(processCalls).toBe(2));
  });
});
