// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => undefined) }));

import { invoke } from "@tauri-apps/api/core";
import EngineReachTiles, { type EngineReachInfo } from "./EngineReachTiles";
import { resetUnmappedEngineReports } from "../utils/reportUnmappedEngine";

beforeEach(() => {
  vi.mocked(invoke).mockClear();
  resetUnmappedEngineReports();
});
afterEach(cleanup);

const reach: EngineReachInfo[] = [
  { engine_id: 1, engine_key: "claude_code", engine_name: "Claude Code", reached: true, via_root: "~/.claude/skills", via_store: "~/.agents/skills" },
  { engine_id: 2, engine_key: "gemini", engine_name: "Gemini CLI", reached: true },
  { engine_id: 3, engine_key: "codex", engine_name: "Codex", reached: false, reason: "root_not_linked" },
  { engine_id: 4, engine_key: "kiro", engine_name: "Kiro", reached: false, reason: "format" },
];

describe("EngineReachTiles", () => {
  it("draws each engine's mark in its tile, the generic for one it cannot map", () => {
    render(<EngineReachTiles reach={reach} />);
    expect(screen.getByTestId("reach-tile-claude_code").querySelector("svg")?.getAttribute("data-brand")).toBe("claude_code");
    expect(screen.getByTestId("reach-tile-gemini").querySelector("svg")?.getAttribute("data-brand")).toBe("gemini");
    expect(screen.getByTestId("reach-tile-codex").querySelector("svg")?.getAttribute("data-brand")).toBe("codex");
    expect(screen.getByTestId("reach-tile-kiro").querySelector("svg")?.getAttribute("data-brand")).toBe("generic");
    expect(invoke).toHaveBeenCalledWith("report_unmapped_engine", { engineKey: "kiro", engineName: "Kiro" });
  });

  it("no tile carries a letter any more", () => {
    render(<EngineReachTiles reach={reach} />);
    for (const key of ["claude_code", "gemini", "codex", "kiro"]) {
      expect(screen.getByTestId(`reach-tile-${key}`).textContent).toBe("");
    }
  });

  it("reached is full strength, unreached is half, both on the same hairline tile", () => {
    render(<EngineReachTiles reach={reach} />);
    const on = screen.getByTestId("reach-tile-claude_code");
    const off = screen.getByTestId("reach-tile-codex");
    expect(on.getAttribute("data-reached")).toBe("true");
    expect(off.getAttribute("data-reached")).toBe("false");
    expect(on.className).toContain("border-line-2");
    expect(off.className).toContain("border-line-2");
    expect(on.className).not.toContain("opacity-50");
    expect(off.className).toContain("opacity-50");
    expect(on.className).not.toContain("bg-fill");
  });

  it("keeps the signed tooltip copy", () => {
    render(<EngineReachTiles reach={reach} />);
    expect(screen.getByTestId("reach-tile-claude_code").getAttribute("aria-label")).toBe(
      "Claude Code — reaches it via ~/.claude/skills → ~/.agents/skills",
    );
    expect(screen.getByTestId("reach-tile-gemini").getAttribute("aria-label")).toBe("Gemini CLI — reads it in place");
    expect(screen.getByTestId("reach-tile-codex").getAttribute("aria-label")).toBe("Codex — root not linked");
    expect(screen.getByTestId("reach-tile-kiro").getAttribute("aria-label")).toBe("Kiro — cannot read this format");
  });
});
