// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import AssetRow, { AssetItem, AssetAnnotationView } from "./AssetRow";

describe("AssetRow Shell Spec Compliance", () => {
  const sampleItem: AssetItem = {
    name: "figma-generate-design",
    category: "Skills",
    path: "~/.agents/skills/figma-generate-design/SKILL.md",
    version: "v1.0.0",
    isSymlink: true,
  };

  it("renders in fixed spec order: state dot, name, state word, type", () => {
    const { container } = render(<AssetRow item={sampleItem} />);

    // Row wrapper
    const row = container.firstElementChild as HTMLElement;
    expect(row).not.toBeNull();

    const children = Array.from(row.children) as HTMLElement[];
    // Spec requires 4 main column elements in order: Name (with state dot), Kind, Engine, State
    expect(children.length).toBe(4);

    // Column 0: Name (contains state-dot and name)
    expect(screen.getByTestId("state-dot")).not.toBeNull();
    expect(children[0].textContent).toContain("figma-generate-design");

    // Column 1: Kind ("Skill")
    expect(children[1].textContent).toBe("Skill");

    // Column 2: Engine ("Any agent")
    expect(children[2].textContent).toBe("Any agent");

    // Column 3: State word ("Symlinked")
    expect(children[3].textContent).toBe("Symlinked");
  });

  it("does NOT render path or version chip in the row", () => {
    render(<AssetRow item={sampleItem} />);

    // Path must NOT be in the row (lives in panel)
    expect(screen.queryByText(sampleItem.path)).toBeNull();

    // Version chip must NOT be in the row
    expect(screen.queryByText(sampleItem.version!)).toBeNull();
  });

  it("renders backend link_state directly, including Foreign state", () => {
    const foreignItem: AssetItem = {
      name: "foreign-tool",
      category: "Tools",
      path: "/path/to/tool",
      linkState: "foreign",
    };
    render(<AssetRow item={foreignItem} />);
    expect(screen.getByText("Foreign")).not.toBeNull();
  });

  it("draws the row's own engine mark in the Engine column, not a generic or missing one", () => {
    const codexItem: AssetItem = {
      name: "codex-tool",
      category: "Tools",
      path: "/path/to/codex-tool",
      engine: "codex",
    };
    render(<AssetRow item={codexItem} />);

    // Paired with the existing text check: the Engine column already reads
    // the raw key (formatEngineLabel does not rename it), and the mark next
    // to it must resolve to that same engine, not the generic fallback.
    const engineText = screen.getByText("codex");
    const mark = engineText.parentElement?.querySelector("svg");
    expect(mark?.getAttribute("data-brand")).toBe("codex");
  });

  it("renders failed asset with name in text-ink-3, state 'Won't parse', and no raw parse_error in text", () => {
    const failedItem: AssetItem = {
      name: "broken-skill",
      category: "Skills",
      path: "/path/to/broken/SKILL.md",
      parseStatus: "failed",
      parseError: "YAML parsing failed: invalid character",
    };
    render(<AssetRow item={failedItem} />);

    // State word must read "Won't parse"
    expect(screen.getByText("Won't parse")).not.toBeNull();

    // Name must be rendered with text-ink-3 class per shell spec
    const nameEl = screen.getByText("broken-skill");
    expect(nameEl.className).toContain("text-ink-3");

    // Raw parse_error string must NOT be rendered in the visible text
    expect(screen.queryByText("YAML parsing failed: invalid character")).toBeNull();
  });

  // Class-contract guard only (happy-dom lays nothing out — verification.md).
  it("an empty beyond-the-store cell is --ink-3 with no opacity", () => {
    const annotation: AssetAnnotationView = {
      asset_path: "/path/to/tool",
      mechanism: "none",
      reach: [],
      beyond: null,
    };
    render(
      <AssetRow
        item={{
          name: "unreached-skill",
          category: "Skills",
          path: "/path/to/unreached/SKILL.md",
        }}
        annotation={annotation}
      />
    );
    const dash = screen.getByText("—");
    expect(dash.className).toContain("text-ink-3");
    expect(dash.className).not.toContain("opacity-45");
  });
});
