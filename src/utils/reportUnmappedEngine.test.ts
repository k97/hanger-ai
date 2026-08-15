import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => undefined) }));

import { invoke } from "@tauri-apps/api/core";
import { reportUnmappedEngine, resetUnmappedEngineReports } from "./reportUnmappedEngine";

beforeEach(() => {
  vi.mocked(invoke).mockClear();
  vi.mocked(invoke).mockImplementation(async () => undefined);
  resetUnmappedEngineReports();
});

describe("reportUnmappedEngine", () => {
  it("sends the normalised key once per session, with the readable name", () => {
    reportUnmappedEngine("Kiro IDE", "Kiro IDE");
    reportUnmappedEngine("kiro-ide");
    reportUnmappedEngine(" KIRO IDE ");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("report_unmapped_engine", {
      engineKey: "kiroide",
      engineName: "Kiro IDE",
    });
  });

  it("uses the raw identifier as the name when no name is given", () => {
    reportUnmappedEngine("trae");
    expect(invoke).toHaveBeenCalledWith("report_unmapped_engine", { engineKey: "trae", engineName: "trae" });
  });

  it("never reports the any-agent values", () => {
    for (const k of ["", "  ", "none", "unknown", "NONE"]) reportUnmappedEngine(k);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("never reports anything path-shaped", () => {
    for (const k of ["/Users/k/.claude/agents/x.md", "~/.kiro", "C:\\Users\\k", "a/b"]) reportUnmappedEngine(k);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("swallows a rejected invoke", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error("no tauri"));
    expect(() => reportUnmappedEngine("kiro")).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
