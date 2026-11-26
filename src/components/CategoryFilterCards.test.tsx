// @vitest-environment happy-dom
import { render, screen, cleanup, within, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import CategoryFilterCards from "./CategoryFilterCards";

// This repo configures no global cleanup, so rendered DOM accumulates within a
// file and queries match across tests.
afterEach(cleanup);

const props = {
  selectedCategory: null,
  onSelectCategory: vi.fn(),
  loading: false,
  allCount: 12,
  skillsCount: 8,
  toolsCount: 4,
  rulesCount: 0,
  subagentsCount: 0,
};

describe("CategoryFilterCards", () => {
  it("hides categories with a known count of zero", () => {
    render(<CategoryFilterCards {...props} />);
    expect(screen.getByText("Skills")).toBeTruthy();
    expect(screen.getByText("MCP servers")).toBeTruthy();
    expect(screen.queryByText("Rules")).toBeNull();
    expect(screen.queryByText("Subagents")).toBeNull();
  });

  it("keeps every chip while counts are still loading", () => {
    // undefined means "not counted yet", not "empty". Hiding on undefined
    // would make chips pop in after every scan.
    render(
      <CategoryFilterCards
        {...props}
        loading
        allCount={undefined}
        skillsCount={undefined}
        toolsCount={undefined}
        rulesCount={undefined}
        subagentsCount={undefined}
      />
    );
    expect(screen.getByText("Rules")).toBeTruthy();
    expect(screen.getByText("Subagents")).toBeTruthy();
  });

  it("keeps the selected chip rendered even at zero", () => {
    // Otherwise selecting a category that later empties removes the only
    // control that can clear the filter, stranding the view.
    render(<CategoryFilterCards {...props} selectedCategory="Rules" />);
    expect(screen.getByText("Rules")).toBeTruthy();
  });

  it("always keeps All, so there is a way back to an unfiltered view", () => {
    render(
      <CategoryFilterCards
        {...props}
        allCount={0}
        skillsCount={0}
        toolsCount={0}
        rulesCount={0}
        subagentsCount={0}
      />
    );
    expect(screen.getByText("All")).toBeTruthy();
    expect(screen.queryByText("Skills")).toBeNull();
  });

  it("keeps the MCP servers chip at zero, because zero servers is a finding no other category can make", () => {
    // Spec §6.2's Tools exemption: an engine installed with no server
    // configured has no tool surface, and that reading is actionable in a
    // way "Rules 0" or "Subagents 0" is not. Every other count here is
    // non-zero so only the Tools exemption is under test.
    render(<CategoryFilterCards {...props} toolsCount={0} />);
    const chip = screen.getByText("MCP servers").closest("button");
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain("0");
  });

  it("still hides Skills, Rules and Subagents at zero once Tools is exempt", () => {
    // Pins the other side of the exemption: it is Tools-specific, not a
    // general reversal of hide-at-zero.
    render(
      <CategoryFilterCards
        {...props}
        toolsCount={0}
        skillsCount={0}
        rulesCount={0}
        subagentsCount={0}
      />
    );
    expect(screen.getByText("MCP servers")).toBeTruthy();
    expect(screen.queryByText("Skills")).toBeNull();
    expect(screen.queryByText("Rules")).toBeNull();
    expect(screen.queryByText("Subagents")).toBeNull();
  });

  it("keeps the MCP servers chip while its count is still loading, same as any other chip", () => {
    // undefined ("not counted yet") is a separate rule from the zero
    // exemption above -- pinned here so the two don't collapse into one.
    render(<CategoryFilterCards {...props} loading toolsCount={undefined} />);
    expect(screen.getByText("MCP servers")).toBeTruthy();
  });

  // Global's Engines tab (T1 of docs/plans/2026-11-25-ia-engines-into-global.md)
  // is gone: an engine is a lens on these tabs, chosen with the engine chips
  // in the strip (docs/plans/2026-11-25-ia-global-by-engine.md).
  it("has no Engines tab, even while counts load", () => {
    render(<CategoryFilterCards {...props} loading rulesCount={undefined} />);
    expect(screen.queryByRole("tab", { name: "Engines" })).toBeNull();
    const labels = screen.getAllByRole("tab").map((t) => t.textContent?.replace(/\d+$/, ""));
    expect(labels).toEqual(["All", "Skills", "MCP servers", "Rules"]);
  });

  // Class contract only: happy-dom applies no container queries. Counts are
  // part of each choice at every width; the track scrolls as the last resort.
  it("keeps counts visible and lets the tab track scroll in a narrow pane", () => {
    const { container } = render(<CategoryFilterCards {...props} />);
    const root = container.querySelector("section")!;
    expect(root.className).toContain("w-full");
    expect(root.className).toContain("min-w-0");
    const skills = screen.getByRole("tab", { name: /^Skills/ });
    expect(skills.className).toContain("shrink-0");
    const count = within(skills).getByText("8");
    expect(count.className.split(/\s+/)).not.toContain("hidden");
    expect(count.className).not.toMatch(/@\[.*\]:inline/);
    expect(screen.getByRole("tablist", { name: "Filter by category" }).className).toContain("overflow-x-auto");
  });
});

// The kind tabs on shadcn's Tabs (Task 1b of docs/plans/2026-11-26-global-list.md,
// round 19). `data-slot` is how shadcn marks each part, so it is what proves
// the markup comes from src/components/ui/tabs.tsx and not a hand-built track.
describe("CategoryFilterCards on shadcn Tabs", () => {
  it("draws its tablist, tabs and capsule from ui/tabs", () => {
    render(<CategoryFilterCards {...props} />);
    const list = screen.getByRole("tablist", { name: "Filter by category" });
    expect(list.getAttribute("data-slot")).toBe("tabs-list");
    for (const tab of within(list).getAllByRole("tab")) {
      expect(tab.getAttribute("data-slot")).toBe("tabs-trigger");
    }
    expect(list.querySelector('[data-slot="tabs-indicator"]')).not.toBeNull();
    // The root is the @container section itself, so the tablist's parent is
    // still the section the panes' class contracts walk up from.
    expect(list.parentElement!.tagName).toBe("SECTION");
    expect(list.parentElement!.getAttribute("data-slot")).toBe("tabs");
  });

  // Class contract only: happy-dom lays nothing out, so the capsule's real
  // position under the selected tab is a screenshot claim (verification.md).
  it("keeps today's pill track and its raised capsule, which follows the tab Base UI measures", () => {
    render(<CategoryFilterCards {...props} />);
    const list = screen.getByRole("tablist", { name: "Filter by category" });
    for (const c of ["bg-plane", "rounded-pill", "border-line", "p-1", "overflow-x-auto"]) {
      expect(list.className.split(/\s+/), c).toContain(c);
    }
    const capsule = list.querySelector('[data-slot="tabs-indicator"]')!;
    for (const c of [
      "capsule-raised",
      "rounded-pill",
      "h-7",
      "duration-nav",
      "ease-spring",
      "left-0",
      "translate-x-(--active-tab-left)",
      "top-(--active-tab-top)",
      "w-(--active-tab-width)",
    ]) {
      expect(capsule.className.split(/\s+/), c).toContain(c);
    }
    expect(capsule.className).not.toContain("left-(--active-tab-left)");
  });

  it("shows each count inside its tab, and marks the selected tab", () => {
    render(<CategoryFilterCards {...props} selectedCategory="Tools" />);
    expect(screen.getByRole("tab", { name: "All 12" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Skills 8" })).toBeTruthy();
    const tools = screen.getByRole("tab", { name: "MCP servers 4" });
    expect(tools.getAttribute("aria-selected")).toBe("true");
    expect(tools.hasAttribute("data-active")).toBe(true);
    expect(tools.className.split(/\s+/)).toContain("data-active:font-medium");
    expect(within(tools).getByText("4").className.split(/\s+/)).toContain("text-ink-2");
    expect(within(screen.getByRole("tab", { name: "Skills 8" })).getByText("8").className.split(/\s+/)).toContain("text-ink-3");
  });

  it("moves between tabs with the arrow keys, wrapping at both ends; each tab is a native button", async () => {
    const onSelectCategory = vi.fn();
    render(<CategoryFilterCards {...props} onSelectCategory={onSelectCategory} />);
    const all = screen.getByRole("tab", { name: "All 12" });
    const skills = screen.getByRole("tab", { name: "Skills 8" });
    const tools = screen.getByRole("tab", { name: "MCP servers 4" });
    // One tab stop: the selected tab.
    expect(all.tabIndex).toBe(0);
    expect(skills.tabIndex).toBe(-1);
    // Base UI moves focus a microtask after the key, so each landing is awaited.
    const press = async (from: HTMLElement, key: string, to: HTMLElement) => {
      fireEvent.keyDown(from, { key });
      await waitFor(() => expect(document.activeElement).toBe(to));
    };
    all.focus();
    await press(all, "ArrowRight", skills);
    // Focus alone does not select, as before.
    expect(onSelectCategory).not.toHaveBeenCalled();
    await press(skills, "ArrowLeft", all);
    // The two steps a non-wrapping walk cannot take.
    await press(all, "ArrowLeft", tools);
    await press(tools, "ArrowRight", all);
    // Enter and Space select through the native button: a browser fires
    // click on them, and the click is what selects (the next test). happy-dom
    // does not synthesise that click from a keydown, so what this environment
    // can pin is that each tab IS a native button; the keys themselves are a
    // check in the running app.
    for (const tab of [all, skills, tools]) {
      expect(tab.tagName).toBe("BUTTON");
      expect(tab.getAttribute("type")).toBe("button");
    }
  });

  it("selects on click, and a click on the selected tab goes back to All", () => {
    const onSelectCategory = vi.fn();
    const { rerender } = render(<CategoryFilterCards {...props} onSelectCategory={onSelectCategory} />);
    fireEvent.click(screen.getByRole("tab", { name: "Skills 8" }));
    expect(onSelectCategory).toHaveBeenLastCalledWith("Skills");
    expect(onSelectCategory).toHaveBeenCalledTimes(1);
    rerender(<CategoryFilterCards {...props} selectedCategory="Skills" onSelectCategory={onSelectCategory} />);
    fireEvent.click(screen.getByRole("tab", { name: "Skills 8" }));
    expect(onSelectCategory).toHaveBeenLastCalledWith(null);
    expect(onSelectCategory).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("tab", { name: "All 12" }));
    expect(onSelectCategory).toHaveBeenLastCalledWith(null);
  });

  it("draws the 12px spinner for a count that has not arrived, while loading", () => {
    render(<CategoryFilterCards {...props} loading skillsCount={undefined} />);
    const skills = screen.getByRole("tab", { name: /^Skills/ });
    expect(skills.querySelector("g.aim-loop")).toBeTruthy();
    expect(skills.querySelector("svg")?.getAttribute("width")).toBe("12");
  });
});
