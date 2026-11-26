import { describe, it, expect, vi, beforeEach } from "vitest";

const openPath = vi.fn();
const exists = vi.fn();
const backendOpen = vi.fn();
vi.mock("@tauri-apps/plugin-opener", () => ({ openPath: (...a: unknown[]) => openPath(...a) }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args: unknown) =>
    cmd === "open_in_editor" ? backendOpen(cmd, args) : exists(cmd, args),
}));

import { openInEditor } from "../openInEditor";

describe("openInEditor", () => {
  beforeEach(() => {
    openPath.mockReset();
    exists.mockReset();
    backendOpen.mockReset();
    openPath.mockResolvedValue(undefined);
    backendOpen.mockResolvedValue(undefined);
  });

  // `openPath(path, "Xcode")` runs `open -a "Xcode"`, which resolves by the
  // app's filename and finds nothing when Xcode is installed as
  // `Xcode_26.6.app`. The backend opens the app it detected instead, so a
  // chosen editor never reaches `openPath` at all.
  it("hands a chosen editor to the backend, which opens the app it found", async () => {
    exists.mockResolvedValue(true);
    const result = await openInEditor("/Users/k/.agents/skills/x", "Cursor");
    expect(backendOpen).toHaveBeenCalledWith("open_in_editor", {
      path: "/Users/k/.agents/skills/x",
      editor: "Cursor",
    });
    expect(openPath).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });

  it("falls back to the system handler when no editor is chosen", async () => {
    exists.mockResolvedValue(true);
    await openInEditor("/Users/k/.agents/skills/x", null);
    expect(openPath).toHaveBeenCalledWith("/Users/k/.agents/skills/x");
    expect(backendOpen).not.toHaveBeenCalled();
  });

  // openPath skips its existence check once an app is named
  // (tauri-plugin-opener-2.5.4/src/open.rs:56), so a bad path becomes a
  // silent no-op rather than a rejection. We must stat first.
  it("does not launch a path that does not exist, and says why", async () => {
    exists.mockResolvedValue(false);
    const result = await openInEditor("/Users/k/.mcp.json:server", "Cursor");
    expect(openPath).not.toHaveBeenCalled();
    expect(backendOpen).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, reason: "missing" });
  });

  it("reports a refused launch instead of swallowing it", async () => {
    exists.mockResolvedValue(true);
    backendOpen.mockRejectedValue("Xcode is not installed");
    const result = await openInEditor("/Users/k/.agents/skills/x", "Xcode");
    expect(result).toEqual({ ok: false, reason: "failed" });
  });

  it("reports a rejected system-handler launch instead of swallowing it", async () => {
    exists.mockResolvedValue(true);
    openPath.mockRejectedValue(new Error("forbidden path"));
    const result = await openInEditor("/Users/k/.agents/skills/x", null);
    expect(result).toEqual({ ok: false, reason: "failed" });
  });
});
