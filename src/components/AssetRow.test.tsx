// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import AssetRow, { AssetItem, AssetAnnotationView } from "./AssetRow";
import MechanismGlyph from "./MechanismGlyph";
import { SelectionOriginContext } from "./selectionOrigin";

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

  // Backend-owned numbers: the component renders what it is given and
  // derives nothing (invariants.md, no-frontend-counting.test.ts). Approved
  // copy, Karthik 2026-08-29.
  it("renders an ancestor-reach note with its shadowed count", () => {
    const annotation: AssetAnnotationView = {
      asset_path: "/path/to/tool",
      mechanism: "none",
      reach: [],
      beyond: { kind: "ancestor_reach", count: 3, places: [], using_count: 2 },
    };
    const { container } = render(
      <AssetRow
        item={{
          name: "ancestor-mcp",
          category: "Tools",
          path: "/path/to/ancestor/.mcp.json",
        }}
        annotation={annotation}
      />
    );
    // Assert the WHOLE rendered string, not a fragment. `getByText(/1/)`
    // would match the "1" inside "1 project" and pass whether or not the
    // shadowed count rendered at all — a green that asserts nothing.
    expect(within(container).getByText("Reaches 2 of 3 projects")).toBeTruthy();
  });

  it("renders an ancestor-reach note with no shadowing", () => {
    const annotation: AssetAnnotationView = {
      asset_path: "/path/to/tool",
      mechanism: "none",
      reach: [],
      beyond: { kind: "ancestor_reach", count: 2, places: [], using_count: 2 },
    };
    const { container } = render(
      <AssetRow
        item={{
          name: "ancestor-mcp-2",
          category: "Tools",
          path: "/path/to/ancestor2/.mcp.json",
        }}
        annotation={annotation}
      />
    );
    // With nothing shadowed the row must not claim an override: it renders
    // the plain total, not "2 of 2".
    expect(within(container).getByText("Reaches 2 projects")).toBeTruthy();
    expect(within(container).queryByText(/overrid|shadow/i)).toBeNull();
  });

  // Class-contract guard only (happy-dom lays nothing out — verification.md).
  // The card variant's own dash -- the Tools column has no per-server tool
  // count field yet, so the cell is this component's existing "nothing to
  // show" convention, not a fabricated zero, and it takes the same
  // --ink-3-no-opacity treatment as the table variant's empty cell above.
  it("the card variant's Tools dash is --ink-3 with no opacity", () => {
    // Scoped to this render's own container: this file has no
    // afterEach(cleanup), so the table variant's dash above and this one
    // both sit in `document.body` at once and an unscoped screen.getByText
    // would find two.
    const { container } = render(
      <AssetRow
        item={{
          name: "some-mcp-server",
          category: "Tools",
          path: "mcp:some-mcp-server",
        }}
        variant="card"
      />
    );
    const dash = within(container).getByText("—");
    expect(dash.className).toContain("text-ink-3");
    expect(dash.className).not.toContain("opacity-45");
  });

  // The Tools cell renders `item.toolCount` when the backend's probe cache
  // (`McpServerRow.tool_count`) actually answered — `null`/`undefined` (a
  // cache miss, or a Conflicting row that never gets one per the backend
  // ruling) keeps the existing dash, asserted above. This is a class-contract
  // guard only, same caveat as the dash test (happy-dom lays nothing out).
  it("renders the probed tool count when the row carries one", () => {
    const { container } = render(
      <AssetRow
        item={{
          name: "some-mcp-server",
          category: "Tools",
          path: "mcp:some-mcp-server",
          toolCount: 7,
        }}
        variant="card"
      />
    );
    expect(within(container).getByText("7 tools")).toBeTruthy();
    expect(within(container).queryByText("—")).toBeNull();
  });

  it("renders the singular form for exactly one tool", () => {
    const { container } = render(
      <AssetRow
        item={{
          name: "some-mcp-server",
          category: "Tools",
          path: "mcp:some-mcp-server",
          toolCount: 1,
        }}
        variant="card"
      />
    );
    expect(within(container).getByText("1 tool")).toBeTruthy();
  });

  // Class-contract guard only (happy-dom lays nothing out — verification.md).
  // A mark takes the ink of the text it sits beside: the mechanism glyph is
  // a row mark like every other, so its geometry carries the mechanism and
  // its ink no longer does (Karthik, 2026-08-28, I4). This file has no
  // afterEach(cleanup), so each case renders into its own container.
  it.each(["symlink", "copy", "none"] as const)(
    "the %s mechanism glyph is a row mark in --ink-3",
    (mechanism) => {
      const annotation: AssetAnnotationView = {
        asset_path: "/path/to/tool",
        mechanism,
        reach: [],
        beyond: null,
      };
      const { container } = render(
        <AssetRow
          item={{
            name: "some-skill",
            category: "Skills",
            path: "/path/to/some/SKILL.md",
          }}
          annotation={annotation}
        />
      );
      const glyph = within(container).getByTestId("mechanism-glyph");
      expect(glyph.getAttribute("class")).toContain("text-ink-3");
      expect(glyph.getAttribute("class")).not.toMatch(/text-ink-[12]|opacity-\[/);
    }
  );

  it.each([
    ["drift", "text-state-warning"],
    ["broken", "text-state-danger"],
  ] as const)("the %s glyph keeps its state colour", (mechanism, cls) => {
    const annotation: AssetAnnotationView = {
      asset_path: "/path/to/tool",
      mechanism,
      reach: [],
      beyond: null,
    };
    const { container } = render(
      <AssetRow
        item={{
          name: "some-skill",
          category: "Skills",
          path: "/path/to/some/SKILL.md",
        }}
        annotation={annotation}
      />
    );
    expect(within(container).getByTestId("mechanism-glyph").getAttribute("class")).toContain(cls);
  });

  // The mechanism glyph is a 14px row mark like every other (icons.tsx's
  // strokeFor), not the retired 1.9 band value it shipped with (Karthik,
  // 2026-08-28, I2). strokeFor(14) is 1.71, not 1.9.
  it("the mechanism glyph's stroke follows strokeFor(14), not the retired 1.9 band", () => {
    const html = renderToStaticMarkup(<MechanismGlyph mechanism="symlink" />);
    expect(html).toContain('stroke-width="1.71"');
    expect(html).not.toContain('stroke-width="1.9"');
  });
});

// A selection made elsewhere (the search palette's pick, a restored
// selection on mount) must scroll its row into view — a plain click never
// needs to, because the row is already on screen when it's clicked.
describe("scrolls a selected row into view", () => {
  const baseItem: AssetItem = {
    name: "deploy-helper",
    category: "Skills",
    path: "~/.agents/skills/deploy-helper/SKILL.md",
  };

  let scrollIntoViewSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    scrollIntoViewSpy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
  });

  afterEach(() => {
    scrollIntoViewSpy.mockRestore();
  });

  it.each(["table", "card"] as const)(
    "calls scrollIntoView({ block: 'nearest' }) on the selected row (%s variant)",
    (variant) => {
      const { container } = render(<AssetRow item={baseItem} isSelected variant={variant} />);
      const row = within(container).getByText("deploy-helper").closest('[data-selected="true"]') as HTMLElement;
      expect(row).not.toBeNull();

      expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);
      expect(scrollIntoViewSpy).toHaveBeenCalledWith({ block: "nearest" });
      expect(scrollIntoViewSpy.mock.instances[0]).toBe(row);
    }
  );

  it("scrolls exactly once when a row becomes selected after mounting unselected", () => {
    const { rerender } = render(<AssetRow item={baseItem} isSelected={false} />);
    expect(scrollIntoViewSpy).not.toHaveBeenCalled();

    rerender(<AssetRow item={baseItem} isSelected />);

    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewSpy).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("never scrolls a row that is not selected", () => {
    render(<AssetRow item={baseItem} isSelected={false} />);
    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
  });

  // A search-palette pick centres its row instead of the click default of
  // "nearest" (Karthik's ruling, 2026-08-29) — read from SelectionOriginContext,
  // which App provides "search" into only for the selection a palette pick
  // just made.
  it("calls scrollIntoView({ block: 'center' }) when the selection's origin is search", () => {
    render(
      <SelectionOriginContext.Provider value="search">
        <AssetRow item={baseItem} isSelected />
      </SelectionOriginContext.Provider>
    );
    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewSpy).toHaveBeenCalledWith({ block: "center" });
  });

  it("still calls scrollIntoView({ block: 'nearest' }) with no provider (a plain click)", () => {
    render(<AssetRow item={baseItem} isSelected />);
    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewSpy).toHaveBeenCalledWith({ block: "nearest" });
  });
});
