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

const groupTitles = (): string[] =>
  Array.from(document.querySelectorAll('[data-testid^="reach-group-"]')).map(
    (g) => (g.textContent ?? "").trim(),
  );

describe("Flyout — engine reach detail", () => {
  it("answers for every engine, including the ones the row cannot draw", () => {
    render(<Flyout {...props} annotation={annotation} />);
    openDetails();
    for (const key of ["claude_code", "claude_desktop", "codex", "vscode", "opencode", "zed"]) {
      expect(screen.getByTestId(`reach-detail-${key}`)).toBeTruthy();
    }
  });

  it("groups by verdict, in the order a reader wants them", () => {
    render(<Flyout {...props} annotation={annotation} />);
    openDetails();
    expect(groupTitles()).toEqual(["Reaches it", "Root not linked", "Another engine's format"]);
  });

  it("states each reason once, on its group, not on every row", () => {
    render(<Flyout {...props} annotation={annotation} />);
    openDetails();
    // The rows under a reason carry identity and nothing else. Two engines
    // miss for the same reason; the words appear once between them.
    expect(screen.getByTestId("reach-detail-claude_desktop").textContent).not.toContain("not linked");
    expect(screen.getByTestId("reach-detail-opencode").textContent).not.toContain("not linked");
    expect(document.body.textContent?.match(/Root not linked/g)).toHaveLength(1);
  });

  it("a format miss is a different group from an unlinked root", () => {
    render(<Flyout {...props} annotation={annotation} />);
    openDetails();
    const fmt = screen.getByTestId("reach-group-format");
    expect(fmt.textContent).toContain("Another engine's format");
    // VS Code sits under it; the two unlinked engines do not.
    expect(screen.getByTestId("reach-members-format").textContent).toContain("VS Code");
    expect(screen.getByTestId("reach-members-format").textContent).not.toContain("OpenCode");
  });

  it("shows each reached engine's own root, under a tilde", () => {
    render(<Flyout {...props} annotation={annotation} />);
    openDetails();
    expect(screen.getByTestId("reach-detail-claude_code").textContent).toContain("~/.claude/agents");
    expect(screen.getByTestId("reach-detail-codex").textContent).toContain("~/.codex/skills");
    // No absolute home survives anywhere in the card.
    expect(document.body.textContent).not.toContain("/Users/test/.claude");
  });

  it("says 'in place' for an engine that reaches it with no link at all", () => {
    render(<Flyout {...props} annotation={annotation} />);
    openDetails();
    expect(screen.getByTestId("reach-detail-zed").textContent).toContain("in place");
  });

  it("names the store once, in the cap, because every reached engine shares it", () => {
    render(<Flyout {...props} annotation={annotation} />);
    openDetails();
    expect(screen.getByTestId("reach-store").textContent).toContain("~/.agents");
    expect(document.body.textContent?.match(/~\/\.agents/g)).toHaveLength(1);
  });

  it("omits a group nobody is in", () => {
    const allReached = {
      ...annotation,
      reach: annotation.reach.filter((r) => r.reached),
    } as never;
    render(<Flyout {...props} annotation={allReached} />);
    openDetails();
    expect(groupTitles()).toEqual(["Reaches it"]);
  });

  it("says nothing at all when the backend had no verdict for the asset", () => {
    render(<Flyout {...props} annotation={null} />);
    openDetails();
    expect(screen.queryByTestId("reach-detail")).toBeNull();
  });

  it("each verdict is an eyebrow above one bordered card, on the page, not a plane", () => {
    render(<Flyout {...props} annotation={annotation} />);
    openDetails();
    const section = screen.getByTestId("reach-detail");
    expect(section.className).not.toContain("bg-plane");
    const members = screen.getByTestId("reach-members-reached");
    expect(members.className).toContain("border-line");
    expect(members.className).toContain("rounded-inner");
    expect(section.querySelector("ul")).toBeNull();
  });
});
