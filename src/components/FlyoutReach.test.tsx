// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockImplementation(() => Promise.resolve(null)),
}));

import Flyout from "./Flyout";
import type { AssetAnnotationView } from "./AssetRow";
import { Inventory } from "../App";

afterEach(cleanup);

const inventory: Inventory = {
  agents: [],
  skills: [
    {
      id: "skill-1",
      name: "writing-great-skills",
      path: "/Users/test/.agents/skills/writing-great-skills/SKILL.md",
      scope: "Global",
      drifted: false,
    } as never,
  ],
  tools: [],
  rules: [],
  subagents: [],
  project_scans: [],
};

/* The seven a real machine reported on 2026-08-17. The row can only draw three
   of these, so the panel is the only place the other four are answerable —
   which is the whole reason the cap is safe to make. */
const annotation: AssetAnnotationView = {
  asset_path: "/Users/test/.agents/skills/writing-great-skills/SKILL.md",
  mechanism: "symlink",
  beyond: { kind: "projects", count: 3, places: ["metrics-board", "mei-recipes", "skills"] },
  reach: [
    { engine_id: 1, engine_key: "claude_code", engine_name: "Claude Code", reached: true },
    { engine_id: 2, engine_key: "codex", engine_name: "Codex", reached: false, reason: "root_not_linked" },
    { engine_id: 3, engine_key: "gemini", engine_name: "Gemini CLI", reached: true },
    { engine_id: 4, engine_key: "claude_desktop", engine_name: "Claude Desktop", reached: false, reason: "format" },
    { engine_id: 5, engine_key: "vscode", engine_name: "VS Code", reached: false, reason: "format" },
    { engine_id: 6, engine_key: "opencode", engine_name: "OpenCode", reached: true },
    { engine_id: 7, engine_key: "zed", engine_name: "Zed", reached: false, reason: "root_not_linked" },
  ],
} as never;

const props = {
  selectedBubble: null,
  selectedAsset: {
    name: "writing-great-skills",
    category: "Skills",
    path: "/Users/test/.agents/skills/writing-great-skills/SKILL.md",
  },
  inventory,
  linkedProjects: [] as string[],
  onRefresh: () => {},
};

describe("Flyout — engine reach detail", () => {
  it("answers for every engine, including the four the row cannot draw", () => {
    render(<Flyout {...props} annotation={annotation} />);
    for (const key of [
      "claude_code",
      "codex",
      "gemini",
      "claude_desktop",
      "vscode",
      "opencode",
      "zed",
    ]) {
      expect(screen.getByTestId(`reach-detail-${key}`)).toBeTruthy();
    }
  });

  it("reuses the row's signed verdict copy rather than restating it", () => {
    render(<Flyout {...props} annotation={annotation} />);
    expect(screen.getByTestId("reach-detail-gemini").textContent).toContain("reads it in place");
    expect(screen.getByTestId("reach-detail-codex").textContent).toContain("root not linked");
    expect(screen.getByTestId("reach-detail-vscode").textContent).toContain("cannot read this format");
  });

  it("says nothing at all when the backend had no verdict for the asset", () => {
    render(<Flyout {...props} annotation={null} />);
    expect(screen.queryByTestId("reach-detail")).toBeNull();
  });
});
