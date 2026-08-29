// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import EditorSetting from "../components/EditorSetting";

afterEach(cleanup);

const EDITORS = [
  { name: "Cursor", bundleId: "a", path: "/Applications/Cursor.app" },
  { name: "Zed", bundleId: "b", path: "/Applications/Zed.app" },
];

describe("EditorSetting", () => {
  it("marks the chosen editor as pressed and the others as not", () => {
    render(<EditorSetting editors={EDITORS} chosen="Zed" onChoose={vi.fn()} onChooseOther={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Zed" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Cursor" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("reports a change", () => {
    const onChoose = vi.fn();
    render(<EditorSetting editors={EDITORS} chosen="Zed" onChoose={onChoose} onChooseOther={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Cursor" }));
    expect(onChoose).toHaveBeenCalledWith("Cursor");
  });

  it("asserts no absence when nothing was detected", () => {
    render(<EditorSetting editors={[]} chosen={null} onChoose={vi.fn()} onChooseOther={vi.fn()} />);
    expect(screen.queryByText(/no editor/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Choose an app…" })).toBeTruthy();
  });

  it("routes the empty state's Choose an app… to onChooseOther", () => {
    const onChooseOther = vi.fn();
    render(<EditorSetting editors={[]} chosen={null} onChoose={vi.fn()} onChooseOther={onChooseOther} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose an app…" }));
    expect(onChooseOther).toHaveBeenCalledTimes(1);
  });
});

// The wiring these prove lives in App.tsx's applyEditorChoice/chooseOtherApp,
// not in EditorSetting itself (which only ever calls onChoose/onChooseOther
// and knows nothing about launching). No existing App.tsx-level test file
// owns the editor-choice flow, so this mounts the real App the way
// toolbar_avionics.test.tsx does for its own settings-panel control.
//
// Asserting on `openInEditor` itself, not `openPath`: `openInEditor` returns
// early on a falsy path before it ever reaches `path_exists` or `openPath`,
// so those two are unreached in both the buggy and the fixed code -- an
// assertion against either would pass before the fix as readily as after
// it. `applyEditorChoice` is synchronous and calls `invoke("set_preference",
// ...)` and (pre-fix) `openInEditor(...)` in the same tick, so waiting for
// the former is enough to know the latter has already happened or not --
// no race between this assertion and the code under test.
import App from "../App";
import { invoke } from "@tauri-apps/api/core";
import { openInEditor } from "../openInEditor";

vi.mock("../openInEditor", () => ({ openInEditor: vi.fn(async () => ({ ok: true })) }));

vi.mock("@tauri-apps/plugin-log", () => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  attachConsole: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(async () => "/Applications/Cursor.app"),
  save: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
  openPath: vi.fn(),
  revealItemInDir: vi.fn(),
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

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === "get_preference") return mockPreferences[args?.key] ?? null;
    if (cmd === "set_preference") {
      if (args?.key) mockPreferences[args.key] = String(args.value);
      return null;
    }
    if (cmd === "get_linked_directories") return [];
    if (cmd === "get_asset_counts") return { total: 0, byCategory: {}, engines: {} };
    if (cmd === "get_inventory") {
      return { agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [] };
    }
    if (cmd === "detect_editors") return [];
    if (cmd === "known_editor_names") return ["Cursor"];
    return null;
  }),
}));

describe("Settings row wiring (App.tsx): chooseOtherApp with no asset in hand", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persists the editor choice and launches nothing, when reached from Settings", async () => {
    render(<App />);
    await screen.findByLabelText("Refresh scan");

    fireEvent.click(screen.getByLabelText("Settings"));
    const chooseButton = await screen.findByRole("button", { name: "Choose an app…" });
    fireEvent.click(chooseButton);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("set_preference", { key: "editor_app", value: "Cursor" });
    });
    expect(openInEditor).not.toHaveBeenCalled();
  });
});
