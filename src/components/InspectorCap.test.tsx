// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { createRef } from "react";
import InspectorCap, { type InspectorCapProps } from "./InspectorCap";
import type { AssetFindings, ReviewIssue } from "../utils/reviewIssues";

afterEach(cleanup);

function makeIssue(overrides: Partial<ReviewIssue> = {}): ReviewIssue {
  return {
    id: "Skills:broken:/repo/.claude/skills/code-review/SKILL.md",
    name: "code-review",
    category: "Skills",
    kind: "broken",
    problem: "Target missing",
    path: "/repo/.claude/skills/code-review/SKILL.md",
    whereLabel: "Global",
    whereKeys: ["global"],
    crossRepo: false,
    ...overrides,
  };
}

const ASSET = {
  name: "code-review",
  category: "Skills" as const,
  path: "/repo/.claude/skills/code-review/SKILL.md",
};

const NO_FINDINGS: AssetFindings = { issues: [], count: 0, severity: "warning" };
const ONE_FINDING: AssetFindings = { issues: [makeIssue()], count: 1, severity: "warning" };

/** The four everyday callbacks a fully-wired asset (not an MCP server) gets. */
function renderCap(over: Partial<InspectorCapProps> = {}) {
  const host = createRef<HTMLDivElement>();
  const callbacks = {
    onLink: vi.fn(),
    onOpenInEditor: vi.fn(),
    onCopyPath: vi.fn(),
    onReveal: vi.fn(),
    onReview: vi.fn(),
    onToggleExpanded: vi.fn(),
    onToggleInspector: vi.fn(),
  };
  render(
    <div ref={host}>
      <InspectorCap
        asset={ASSET}
        place="Global"
        findings={NO_FINDINGS}
        inspectorExpanded={false}
        clampTo={host}
        {...callbacks}
        {...over}
      />
    </div>
  );
  return callbacks;
}

/** aria-label when the control is icon-only, otherwise its visible text. */
function accessibleName(el: Element): string {
  return el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "";
}

describe("InspectorCap", () => {
  it("renders the eyebrow as kind · place, uppercased by class", () => {
    renderCap({ place: "Global" });
    const eyebrow = screen.getByTestId("inspector-cap-eyebrow");
    expect(eyebrow.textContent).toBe("Skill · Global");
    expect(eyebrow.className).toContain("uppercase");
  });

  it("marks the kind glyph with a state dot only when the asset has findings", () => {
    renderCap({ findings: NO_FINDINGS });
    expect(screen.queryByTestId("inspector-cap-glyph-dot")).toBeNull();
    cleanup();
    renderCap({ findings: ONE_FINDING });
    expect(screen.getByTestId("inspector-cap-glyph-dot").className).toContain("bg-state-warning");
  });

  it("wires the finding chip to the asset's issues: count, and popover lines from problem", () => {
    renderCap({ findings: ONE_FINDING });
    const chip = screen.getByRole("button", { name: "1 flagged" });
    fireEvent.click(chip);
    const pop = screen.getByRole("dialog", { name: "1 flagged" });
    expect(pop.querySelector("li")?.textContent).toBe("Target missing");
  });

  it("routes the chip's Needs review action to onReview with the first issue", () => {
    const { onReview } = renderCap({ findings: ONE_FINDING });
    fireEvent.click(screen.getByRole("button", { name: "1 flagged" }));
    fireEvent.click(screen.getByRole("button", { name: "Needs review →" }));
    expect(onReview).toHaveBeenCalledTimes(1);
    expect(onReview).toHaveBeenCalledWith(ONE_FINDING.issues[0]);
  });

  it("orders the trailing cluster Link to…, More actions, Expand inspector, Toggle inspector", () => {
    renderCap();
    const trailing = screen.getByTestId("inspector-cap-trailing");
    const names = within(trailing)
      .getAllByRole("button")
      .map((b) => accessibleName(b));
    expect(names).toEqual(["Link to…", "More actions", "Expand inspector", "Toggle inspector"]);
  });

  it("collapses nothing into the menu at rest (forceShed=0)", () => {
    renderCap({ forceShed: 0 });
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const menu = screen.getByRole("menu", { name: "More actions" });
    const items = within(menu)
      .getAllByRole("menuitem")
      .map((b) => b.textContent);
    expect(items).toEqual(["Copy path", "Reveal in Finder", "Open in editor"]);
    expect(within(menu).queryByRole("separator")).toBeNull();
  });

  it("sheds Link to… into the menu first, with a separator, and off the surface (forceShed=1)", () => {
    renderCap({ forceShed: 1 });
    expect(screen.queryByRole("button", { name: "Link to…" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const menu = screen.getByRole("menu", { name: "More actions" });
    const items = within(menu)
      .getAllByRole("menuitem")
      .map((b) => b.textContent);
    expect(items).toEqual(["Link to…", "Copy path", "Reveal in Finder", "Open in editor"]);
    expect(within(menu).getByRole("separator")).toBeTruthy();
  });

  it("sheds Needs review · {n} into the menu and removes the chip from the surface (forceShed=2)", () => {
    renderCap({ forceShed: 2, findings: ONE_FINDING });
    expect(screen.queryByRole("button", { name: "1 flagged" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const menu = screen.getByRole("menu", { name: "More actions" });
    const items = within(menu)
      .getAllByRole("menuitem")
      .map((b) => b.textContent);
    expect(items).toEqual(["Link to…", "Needs review · 1", "Copy path", "Reveal in Finder", "Open in editor"]);
  });

  it("wires the menu's Copy path item to onCopyPath, and only onCopyPath", () => {
    const callbacks = renderCap({ forceShed: 0 });
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const menu = screen.getByRole("menu", { name: "More actions" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Copy path" }));

    expect(callbacks.onCopyPath).toHaveBeenCalledTimes(1);
    expect(callbacks.onReveal).not.toHaveBeenCalled();
    expect(callbacks.onOpenInEditor).not.toHaveBeenCalled();
    expect(callbacks.onLink).not.toHaveBeenCalled();
  });

  it("wires the menu's Reveal in Finder item to onReveal, and only onReveal", () => {
    const callbacks = renderCap({ forceShed: 0 });
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const menu = screen.getByRole("menu", { name: "More actions" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Reveal in Finder" }));

    expect(callbacks.onReveal).toHaveBeenCalledTimes(1);
    expect(callbacks.onCopyPath).not.toHaveBeenCalled();
    expect(callbacks.onOpenInEditor).not.toHaveBeenCalled();
    expect(callbacks.onLink).not.toHaveBeenCalled();
  });

  it("wires the menu's Open in editor item to onOpenInEditor, and only onOpenInEditor", () => {
    const callbacks = renderCap({ forceShed: 0 });
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const menu = screen.getByRole("menu", { name: "More actions" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Open in editor" }));

    expect(callbacks.onOpenInEditor).toHaveBeenCalledTimes(1);
    expect(callbacks.onCopyPath).not.toHaveBeenCalled();
    expect(callbacks.onReveal).not.toHaveBeenCalled();
    expect(callbacks.onLink).not.toHaveBeenCalled();
  });

  it("wires the menu's shed-in Link to… item to onLink, and only onLink (forceShed=1)", () => {
    const callbacks = renderCap({ forceShed: 1 });
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const menu = screen.getByRole("menu", { name: "More actions" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Link to…" }));

    expect(callbacks.onLink).toHaveBeenCalledTimes(1);
    expect(callbacks.onCopyPath).not.toHaveBeenCalled();
    expect(callbacks.onReveal).not.toHaveBeenCalled();
    expect(callbacks.onOpenInEditor).not.toHaveBeenCalled();
  });

  it("wires the menu's shed-in Needs review · {n} item to onReview with the first issue, and only onReview (forceShed=2)", () => {
    const callbacks = renderCap({ forceShed: 2, findings: ONE_FINDING });
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const menu = screen.getByRole("menu", { name: "More actions" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Needs review · 1" }));

    expect(callbacks.onReview).toHaveBeenCalledTimes(1);
    expect(callbacks.onReview).toHaveBeenCalledWith(ONE_FINDING.issues[0]);
    expect(callbacks.onCopyPath).not.toHaveBeenCalled();
    expect(callbacks.onReveal).not.toHaveBeenCalled();
    expect(callbacks.onOpenInEditor).not.toHaveBeenCalled();
    expect(callbacks.onLink).not.toHaveBeenCalled();
  });

  it("renders no Link to… and no overflow menu for an MCP asset with none of the menu callbacks", () => {
    renderCap({
      asset: { name: "spades-audio", category: "Tools", path: "/repo/.mcp.json" },
      onLink: undefined,
      onOpenInEditor: undefined,
      onCopyPath: undefined,
      onReveal: undefined,
    });
    expect(screen.queryByRole("button", { name: "Link to…" })).toBeNull();
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
  });

  it("renders only Expand and Hide with no asset selected", () => {
    renderCap({ asset: null });
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(["Expand inspector", "Toggle inspector"]);
  });

  it("gives the kind glyph an accessible tooltip only for a project-scoped asset", () => {
    renderCap({ place: "Global" });
    expect(screen.queryByRole("img", { name: "Skill · Global" })).toBeNull();
    cleanup();
    renderCap({ place: "hanger-ai" });
    expect(screen.getByRole("img", { name: "Skill · hanger-ai" })).toBeTruthy();
  });

  it("never sheds an MCP server's cap: findings do not open a dangling ⋮ menu (forceShed=2)", () => {
    renderCap({
      asset: { name: "spades-audio", category: "Tools", path: "/repo/.mcp.json" },
      onLink: undefined,
      onOpenInEditor: undefined,
      onCopyPath: undefined,
      onReveal: undefined,
      findings: ONE_FINDING,
      forceShed: 2,
    });
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
    expect(screen.getByRole("button", { name: "1 flagged" })).toBeTruthy();
  });

  it("never sheds an MCP server's cap: still no ⋮ at forceShed=1", () => {
    renderCap({
      asset: { name: "spades-audio", category: "Tools", path: "/repo/.mcp.json" },
      onLink: undefined,
      onOpenInEditor: undefined,
      onCopyPath: undefined,
      onReveal: undefined,
      findings: ONE_FINDING,
      forceShed: 1,
    });
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
  });

  it("still sheds Needs review · {n} for a non-server asset (forceShed=2) — regression guard for the server-cap fix", () => {
    renderCap({ forceShed: 2, findings: ONE_FINDING });
    expect(screen.queryByRole("button", { name: "1 flagged" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const menu = screen.getByRole("menu", { name: "More actions" });
    const items = within(menu)
      .getAllByRole("menuitem")
      .map((b) => b.textContent);
    expect(items).toEqual(["Link to…", "Needs review · 1", "Copy path", "Reveal in Finder", "Open in editor"]);
  });
});
