import { describe, it, expect, vi, beforeEach } from "vitest";

const openPath = vi.fn();
const exists = vi.fn();
vi.mock("@tauri-apps/plugin-opener", () => ({ openPath: (...a: unknown[]) => openPath(...a) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => exists(...a) }));

import { openInEditor } from "../openInEditor";

describe("openInEditor", () => {
  beforeEach(() => { openPath.mockReset(); exists.mockReset(); openPath.mockResolvedValue(undefined); });

  it("names the editor when one is chosen", async () => {
    exists.mockResolvedValue(true);
    await openInEditor("/Users/k/.agents/skills/x", "Cursor");
    expect(openPath).toHaveBeenCalledWith("/Users/k/.agents/skills/x", "Cursor");
  });

  it("falls back to the system handler when no editor is chosen", async () => {
    exists.mockResolvedValue(true);
    await openInEditor("/Users/k/.agents/skills/x", null);
    expect(openPath).toHaveBeenCalledWith("/Users/k/.agents/skills/x");
  });

  // openPath skips its existence check once an app is named
  // (tauri-plugin-opener-2.5.4/src/open.rs:56), so a bad path becomes a
  // silent no-op rather than a rejection. We must stat first.
  it("does not launch a path that does not exist, and says why", async () => {
    exists.mockResolvedValue(false);
    const result = await openInEditor("/Users/k/.mcp.json:server", "Cursor");
    expect(openPath).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, reason: "missing" });
  });

  it("reports a rejected launch instead of swallowing it", async () => {
    exists.mockResolvedValue(true);
    openPath.mockRejectedValue(new Error("forbidden path"));
    const result = await openInEditor("/Users/k/.agents/skills/x", "Cursor");
    expect(result).toEqual({ ok: false, reason: "failed" });
  });
});
