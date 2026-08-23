// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import UnderlineTabs from "./UnderlineTabs";

afterEach(cleanup);

const tabs = [
  { id: "tools", label: "Tools", count: 17 },
  { id: "details", label: "Details" },
];

describe("UnderlineTabs", () => {
  it("is a tablist of tabs; the active one is ink-1 medium, the others ink-2", () => {
    render(<UnderlineTabs tabs={tabs} active="tools" onChange={vi.fn()} ariaLabel="Inspector view" />);
    const list = screen.getByRole("tablist", { name: "Inspector view" });
    expect(list.className).toContain("border-b");
    expect(list.className).toContain("border-line");
    const tools = screen.getByRole("tab", { name: "Tools 17" });
    const details = screen.getByRole("tab", { name: "Details" });
    expect(tools.getAttribute("aria-selected")).toBe("true");
    expect(tools.className).toContain("text-ink-1");
    expect(tools.className).toContain("font-medium");
    expect(details.getAttribute("aria-selected")).toBe("false");
    expect(details.className).toContain("text-ink-2");
    expect(tools.getAttribute("aria-controls")).toBe("panel-tools");
    expect(tools.id).toBe("tab-tools");
  });

  it("draws the count beside the label in tabular ink-3, and no count when none is given", () => {
    render(<UnderlineTabs tabs={tabs} active="tools" onChange={vi.fn()} ariaLabel="Inspector view" />);
    const count = screen.getByRole("tab", { name: "Tools 17" }).querySelector("span")!;
    expect(count.textContent).toBe("17");
    expect(count.className).toContain("tabular");
    expect(count.className).toContain("text-ink-3");
    expect(screen.getByRole("tab", { name: "Details" }).querySelector("span")).toBeNull();
  });

  it("reports a click and carries one sliding indicator on the nav beat", () => {
    const onChange = vi.fn();
    render(<UnderlineTabs tabs={tabs} active="tools" onChange={onChange} ariaLabel="Inspector view" />);
    fireEvent.click(screen.getByRole("tab", { name: "Details" }));
    expect(onChange).toHaveBeenCalledWith("details");
    const indicator = screen.getByTestId("tab-indicator");
    expect(indicator.className).toContain("bg-ink-1");
    expect(indicator.className).toContain("h-0.5");
    expect(indicator.className).toContain("duration-nav");
  });
});
