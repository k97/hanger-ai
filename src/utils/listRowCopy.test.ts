import { describe, it, expect } from "vitest";
import { listRowDetail, listRowFigure } from "./listRowCopy";
import type { AssetAnnotationView, AssetItem } from "../components/AssetRow";

/**
 * Line 2 of a Global row (Task 1 of docs/plans/2026-11-26-global-list.md):
 * the description or status sentence on the left, one figure on the right.
 * Wording from docs/plans/2026-11-26-decisions-round-18.md: q1 (a server's
 * tool count with All engines, its tokens once an engine is picked) and q2
 * ("Global only" for an asset used in no project). A row with nothing to say
 * says nothing: no "—".
 */

const skill = (over: Partial<AssetItem> = {}): AssetItem => ({
  name: "xlsx",
  category: "Skills",
  path: "/home/user/.agents/skills/xlsx",
  ...over,
});

const server = (over: Partial<AssetItem> = {}): AssetItem => ({
  name: "cua",
  category: "Tools",
  id: "/home/user/.claude.json:cua",
  path: "/home/user/.claude.json:cua",
  transport: "stdio",
  ...over,
});

const note = (beyond: AssetAnnotationView["beyond"], reach: AssetAnnotationView["reach"] = []): AssetAnnotationView => ({
  asset_path: "/home/user/.agents/skills/xlsx",
  mechanism: "none",
  reach,
  beyond,
});

describe("listRowDetail", () => {
  it("is a skill's or subagent's own description", () => {
    expect(listRowDetail(skill({ description: "Read and write spreadsheets" }))).toBe("Read and write spreadsheets");
    expect(listRowDetail(skill({ category: "Subagents", description: "Reviews diffs" }))).toBe("Reviews diffs");
  });

  it("is nothing for an asset with no description, never a placeholder", () => {
    expect(listRowDetail(skill())).toBeUndefined();
    expect(listRowDetail(skill({ description: "   " }))).toBeUndefined();
    expect(listRowDetail(skill({ category: "Rules" }))).toBeUndefined();
  });

  it("is a server's status sentence", () => {
    expect(listRowDetail(server({ agreementLine: "Registered in 2 engines" }))).toBe("Registered in 2 engines");
    expect(listRowDetail(server())).toBeUndefined();
  });
});

describe("listRowFigure", () => {
  it("says Global only for an asset no project uses", () => {
    expect(listRowFigure(skill(), note(null))).toEqual({ text: "Global only" });
  });

  it("keeps the beyond-the-store words the table printed", () => {
    expect(listRowFigure(skill(), note({ kind: "projects", count: 3, places: [] }))).toEqual({ text: "In 3 projects" });
    expect(listRowFigure(skill(), note({ kind: "projects", count: 1, places: [] }))).toEqual({ text: "In 1 project" });
    expect(listRowFigure(skill(), note({ kind: "copies", count: 2, places: [] }))).toEqual({ text: "Tracked copy in 2 projects" });
    expect(listRowFigure(skill(), note({ kind: "broken", count: 0, places: [] }))).toEqual({ text: "Target missing", tone: "danger" });
    expect(listRowFigure(skill(), note({ kind: "drifted", count: 1, places: ["hanger"] }))).toEqual({
      text: "Drifted in hanger",
      tone: "warning",
    });
  });

  it("names the only readers of a format-limited asset", () => {
    const reach = [
      { engine_id: 1, engine_key: "claude_code", engine_name: "Claude Code", reached: true },
      { engine_id: 2, engine_key: "codex", engine_name: "Codex", reached: false, reason: "format" },
    ];
    expect(listRowFigure(skill(), note(null, reach))).toEqual({ text: "Claude Code only" });
  });

  it("says nothing when the backend gave no verdict", () => {
    expect(listRowFigure(skill(), null)).toBeUndefined();
  });

  it("is a server's tool count with All engines (round 18 q1)", () => {
    expect(listRowFigure(server({ toolCount: 12 }), null)).toEqual({ text: "12 tools" });
    expect(listRowFigure(server({ toolCount: 1 }), null)).toEqual({ text: "1 tool" });
    expect(listRowFigure(server({ toolCount: null }), null)).toBeUndefined();
  });

  it("is the picked engine's token figure once an engine is picked", () => {
    expect(listRowFigure(server({ toolCount: 12, engineFigure: "≈ 7,294 tokens" }), null)).toEqual({
      text: "≈ 7,294 tokens",
    });
  });
});
