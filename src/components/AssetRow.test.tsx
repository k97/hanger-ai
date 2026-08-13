// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import AssetRow, { AssetItem } from "./AssetRow";

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
});
