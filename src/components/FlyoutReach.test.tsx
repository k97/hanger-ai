// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

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

/* The seven a real machine reported, with one engine moved to the `format`
   reason so all three groups are exercised at once. Zed is reached with no
   via_root: it reads the shared store where it lies and there is no link to
   name — the case that would read as a blank cell if the row only ever
   printed a path. */
const annotation: AssetAnnotationView = {
  asset_path: "/Users/test/.agents/skills/writing-great-skills/SKILL.md",
  mechanism: "symlink",
  beyond: { kind: "projects", count: 2, places: ["metrics-board", "mei-recipes"] },
  reach: [
    { engine_id: 1, engine_key: "claude_code", engine_name: "Claude Code", reached: true,
      via_root: "/Users/test/.claude/agents", via_store: "/Users/test/.agents" },
    { engine_id: 2, engine_key: "claude_desktop", engine_name: "Claude Desktop", reached: false, reason: "root_not_linked" },
    { engine_id: 3, engine_key: "codex", engine_name: "Codex", reached: true,
      via_root: "/Users/test/.codex/skills", via_store: "/Users/test/.agents" },
    { engine_id: 4, engine_key: "vscode", engine_name: "VS Code", reached: false, reason: "format" },
    { engine_id: 5, engine_key: "opencode", engine_name: "OpenCode", reached: false, reason: "root_not_linked" },
    { engine_id: 6, engine_key: "zed", engine_name: "Zed", reached: true, via_store: "/Users/test/.agents" },
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

const openDetails = () => fireEvent.click(screen.getByRole("tab", { name: "Details" }));

const plate = (key: string) => screen.getByTestId(`reach-plate-${key}`);

describe("Flyout — engine reach detail", () => {
  it("answers for every engine, including the ones the row cannot draw", () => {
    render(<Flyout {...props} annotation={annotation} />);
    openDetails();
    for (const key of ["claude_code", "claude_desktop", "codex", "vscode", "opencode", "zed"]) {
      expect(plate(key)).toBeTruthy();
    }
  });

  it("groups by route, in the order a reader wants them", () => {
    render(<Flyout {...props} annotation={annotation} />);
    openDetails();
    const keys = Array.from(document.querySelectorAll('[data-testid^="reach-route-"]'))
      .filter((el) => !(el.getAttribute("data-testid") ?? "").startsWith("reach-route-label-"))
      .map((el) => (el.getAttribute("data-testid") ?? "").replace("reach-route-", ""));
    expect(keys).toEqual(["linked", "inplace", "unlinked", "format"]);
  });

  it("the answer follows the pressed plate and folds the root to a tilde", () => {
    render(<Flyout {...props} annotation={annotation} />);
    openDetails();
    expect(screen.getByTestId("reach-answer-value").textContent).toBe("~/.claude/agents");
    fireEvent.click(plate("codex"));
    expect(screen.getByTestId("reach-answer-value").textContent).toBe("~/.codex/skills");
    fireEvent.click(plate("zed"));
    expect(screen.getByTestId("reach-answer-value").textContent).toBe("in place");
    expect(document.body.textContent).not.toContain("/Users/test/.claude");
  });

  it("names the store once, in the cap, because every reached engine shares it", () => {
    render(<Flyout {...props} annotation={annotation} />);
    openDetails();
    expect(screen.getByTestId("reach-store").textContent).toContain("~/.agents");
    expect(document.body.textContent?.match(/~\/\.agents/g)).toHaveLength(1);
  });

  it("forgets the pressed plate when the asset changes", () => {
    const { rerender } = render(<Flyout {...props} annotation={annotation} />);
    openDetails();
    fireEvent.click(plate("zed"));
    expect(plate("zed").getAttribute("aria-checked")).toBe("true");
    const other = {
      ...props,
      selectedAsset: { ...props.selectedAsset, path: "/Users/test/.agents/skills/other/SKILL.md" },
    };
    const otherAnnotation = { ...annotation, asset_path: other.selectedAsset.path } as never;
    rerender(<Flyout {...other} annotation={otherAnnotation} />);
    expect(plate("zed").getAttribute("aria-checked")).toBe("false");
    expect(plate("claude_code").getAttribute("aria-checked")).toBe("true");
  });

  it("says nothing at all when the backend had no verdict for the asset", () => {
    render(<Flyout {...props} annotation={null} />);
    openDetails();
    expect(screen.queryByTestId("reach-detail")).toBeNull();
  });

  it("is an eyebrow above one bordered card on the page, not a plane, with no list markup", () => {
    render(<Flyout {...props} annotation={annotation} />);
    openDetails();
    const section = screen.getByTestId("reach-detail");
    expect(section.className).not.toContain("bg-plane");
    const card = screen.getByTestId("reach-card");
    expect(card.className).toContain("border-line");
    expect(card.className).toContain("rounded-inner");
    expect(section.querySelector("ul")).toBeNull();
  });
});
