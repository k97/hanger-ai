// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import App from "../App";
import { invoke } from "@tauri-apps/api/core";
import { openInEditor } from "../openInEditor";

// Whole-branch review findings #1, #2 and #5 (2026-08-29). The plan had the
// `editorNotice` DisclosureBanner render only inside the Settings modal's
// own `showSettingsModal &&` conditional, but both producers -- the
// first-use/Option picker's `applyEditorChoice` and the steady-state open on
// the cap -- are reachable from the inspector with Settings closed, which is
// the common case (every open after the first never opens Settings at all).
// A component-only test of InspectorCap or EditorPicker can't see this: the
// bug is in App.tsx's placement of the banner relative to its two
// producers, so these mount the real App and assert the notice reaches the
// screen (and clears, and doesn't clobber a route's remember choice) rather
// than asserting anything about where the JSX lives.
vi.mock("../openInEditor", () => ({ openInEditor: vi.fn(async () => ({ ok: true })) }));

vi.mock("@tauri-apps/plugin-log", () => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  attachConsole: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(async () => "/Applications/Cursor.app"),
  save: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
  openPath: vi.fn(),
  revealItemInDir: vi.fn(async () => {}),
}));

let eventListeners: Record<string, (evt: any) => void> = {};
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, callback: any) => {
    eventListeners[event] = callback;
    return Promise.resolve(() => {
      delete eventListeners[event];
    });
  }),
}));

const SKILL_PATH = "~/Work/demo/skills/inspector-skill-1";
const mockInventoryData = {
  agents: [],
  skills: [
    {
      id: "skill-1",
      name: "Inspector Skill One",
      description: "Sample skill for the notice-visibility test",
      version: "1.0.0",
      path: SKILL_PATH,
      source_origin: "~/Source/skills/inspector-skill-1",
      is_symlink: true,
      scope: { Project: { agent: "claude", root: "~/Work/demo" } },
    },
  ],
  tools: [],
  rules: [],
  subagents: [],
  project_scans: [{ path: "~/Work/demo", layered: false, rule_chains: {}, parse_warnings: [] }],
};

const countsObj = { total: 1, global: 0, project: 1 };
const zeroObj = { total: 0, global: 0, project: 0 };
const mockAssetCounts = {
  total_assets: 1,
  total: 1,
  skill: countsObj,
  tool: zeroObj,
  rule: zeroObj,
  subagent: zeroObj,
  byCategory: { skill: countsObj, tool: zeroObj, rule: zeroObj, subagent: zeroObj },
  engines: {},
};

let mockPreferences: Record<string, string> = {};
let knownEditorNames: string[] = [];
let detectedEditors: { name: string; bundleId: string; path: string }[] = [];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === "get_preference") return mockPreferences[args?.key] ?? null;
    if (cmd === "set_preference") {
      if (args?.key) mockPreferences[args.key] = String(args.value);
      return null;
    }
    if (cmd === "get_linked_directories") return ["~/Work/demo"];
    if (cmd === "get_asset_counts") return mockAssetCounts;
    if (cmd === "get_inventory") return mockInventoryData;
    if (cmd === "start_scan") {
      if (eventListeners["scan://complete"]) {
        eventListeners["scan://complete"]({ payload: { inventory: mockInventoryData } });
      }
      return "scan-1";
    }
    if (cmd === "detect_editors") return detectedEditors;
    if (cmd === "known_editor_names") return knownEditorNames;
    return null;
  }),
}));

const selectSkill = async () => {
  const row = await screen.findByText("Inspector Skill One");
  fireEvent.click(row);
};

const openMoreActions = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "More actions" }));
};

const basePreferences = () => ({
  onboarding_complete: "true",
  consent_crash: "true",
  consent_usage: "true",
  sidebar_collapsed: "false",
  sidebar_width: "240",
  selected_sidebar_item: "~/Work/demo",
  inspector_open: "true",
  inspector_width: "280",
});

describe("Editor launch failures reach the screen (App.tsx)", () => {
  beforeEach(() => {
    cleanup();
    eventListeners = {};
    knownEditorNames = ["Cursor"];
    detectedEditors = [{ name: "Cursor", bundleId: "c1", path: "/Applications/Cursor.app" }];
    mockPreferences = basePreferences();
    // `invoke`'s mock.calls accumulate across every test in this file (its
    // implementation is set once, in the module-level vi.mock factory, so
    // clearing history here does not lose it) -- without this, an earlier
    // test's set_preference call is still in the spy's history when a later
    // test asserts against it.
    vi.clearAllMocks();
    vi.mocked(openInEditor).mockResolvedValue({ ok: true } as any);
  });

  afterEach(cleanup);

  it("finding #1: the first-use picker's failure shows up with Settings never opened", async () => {
    render(<App />);
    await selectSkill();

    vi.mocked(openInEditor).mockResolvedValueOnce({ ok: false, reason: "missing" } as any);

    await openMoreActions();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Open in editor" }));
    // First use (no chosen editor yet): the picker opens on the one
    // detected editor, box ticked by default -- exactly the brief's
    // failure scenario ("picks Cursor, ticks the box").
    fireEvent.click(await screen.findByRole("button", { name: "Cursor" }));

    await screen.findByText(`Hanger couldn't find ${SKILL_PATH}.`);
    // Settings was never touched in this flow -- the notice does not
    // depend on it having been opened.
    expect(screen.queryByText("Hanger Settings & Maintenance")).toBeNull();
  });

  it("finding #2: the steady-state open (every open after the first) surfaces a failure too", async () => {
    mockPreferences.editor_app = "Cursor";
    render(<App />);
    await selectSkill();

    vi.mocked(openInEditor).mockResolvedValueOnce({ ok: false, reason: "failed" } as any);

    await openMoreActions();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Open in Cursor" }));

    await screen.findByText(`Hanger couldn't open ${SKILL_PATH} in Cursor.`);
    expect(screen.queryByText("Hanger Settings & Maintenance")).toBeNull();
  });

  it("clears the notice once a subsequent open succeeds", async () => {
    mockPreferences.editor_app = "Cursor";
    render(<App />);
    await selectSkill();

    vi.mocked(openInEditor).mockResolvedValueOnce({ ok: false, reason: "failed" } as any);
    await openMoreActions();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Open in Cursor" }));
    await screen.findByText(`Hanger couldn't open ${SKILL_PATH} in Cursor.`);

    vi.mocked(openInEditor).mockResolvedValueOnce({ ok: true } as any);
    await openMoreActions();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Open in Cursor" }));

    await waitFor(() => {
      expect(screen.queryByText(`Hanger couldn't open ${SKILL_PATH} in Cursor.`)).toBeNull();
    });
  });

  it("clears the notice when the user dismisses it", async () => {
    mockPreferences.editor_app = "Cursor";
    render(<App />);
    await selectSkill();

    vi.mocked(openInEditor).mockResolvedValueOnce({ ok: false, reason: "failed" } as any);
    await openMoreActions();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Open in Cursor" }));
    await screen.findByText(`Hanger couldn't open ${SKILL_PATH} in Cursor.`);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByText(`Hanger couldn't open ${SKILL_PATH} in Cursor.`)).toBeNull();
  });
});

describe("chooseOtherApp respects the route's remember default (App.tsx)", () => {
  beforeEach(() => {
    cleanup();
    eventListeners = {};
    knownEditorNames = ["Cursor"];
    // Empty: forces the picker's editors-empty "Choose an app…" branch,
    // which renders no checkbox at all -- the exact shape the bug hid in,
    // since chooseOtherApp had no checkbox state to read and hard-coded
    // remember=true instead.
    detectedEditors = [];
    mockPreferences = { ...basePreferences(), editor_app: "Zed" };
    // `invoke`'s mock.calls accumulate across every test in this file (its
    // implementation is set once, in the module-level vi.mock factory, so
    // clearing history here does not lose it) -- without this, an earlier
    // test's set_preference call is still in the spy's history when a later
    // test asserts against it.
    vi.clearAllMocks();
    vi.mocked(openInEditor).mockResolvedValue({ ok: true } as any);
  });

  afterEach(cleanup);

  it("finding #5: an Option-route pick through 'Choose an app…' opens once but does not overwrite the default", async () => {
    render(<App />);
    await selectSkill();

    await openMoreActions();
    fireEvent.keyDown(window, { key: "Alt", altKey: true });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Open in…" }));
    fireEvent.click(await screen.findByRole("button", { name: "Choose an app…" }));

    // The one-off open still happens, with the newly chosen app...
    await waitFor(() => {
      expect(openInEditor).toHaveBeenCalledWith(SKILL_PATH, "Cursor");
    });
    // ...but the Option route's unticked default is never asked to
    // overwrite the standing "Zed" default.
    expect(invoke).not.toHaveBeenCalledWith("set_preference", {
      key: "editor_app",
      value: "Cursor",
    });

    fireEvent.keyUp(window, { key: "Alt", altKey: false });
    await openMoreActions();
    expect(await screen.findByRole("menuitem", { name: "Open in Zed" })).toBeTruthy();
  });
});
