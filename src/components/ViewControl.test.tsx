// @vitest-environment happy-dom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import ViewControl from "./ViewControl";

afterEach(cleanup);

describe("ViewControl", () => {
  it("switches the list between one row per server and one per registration", async () => {
    const onGroupingChange = vi.fn();
    render(<ViewControl grouping="server" sort="attention" onGroupingChange={onGroupingChange} onSortChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    fireEvent.click(screen.getByText("One per registration"));
    expect(onGroupingChange).toHaveBeenCalledWith("registration");
  });

  it("is a popover, not a blocking dialog", () => {
    // window.confirm/alert/prompt are banned across src/ by
    // no-blocking-dialogs.test.ts; this pins the intent at the call site too.
    render(<ViewControl grouping="server" sort="attention" onGroupingChange={vi.fn()} onSortChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    expect(screen.getByRole("button", { name: "View" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("opens on the Rows and Sort section labels, with the signed-off copy", () => {
    render(<ViewControl grouping="server" sort="attention" onGroupingChange={vi.fn()} onSortChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    expect(screen.getByText("Rows")).toBeTruthy();
    expect(screen.getByText("One per server")).toBeTruthy();
    expect(screen.getByText("One per registration")).toBeTruthy();
    expect(screen.getByText("Sort")).toBeTruthy();
    expect(screen.getByText("Needs attention first")).toBeTruthy();
    expect(screen.getByText("Name")).toBeTruthy();
  });

  it("does not offer 'Tools, most first' — no field carries a per-server tool count yet", () => {
    render(<ViewControl grouping="server" sort="attention" onGroupingChange={vi.fn()} onSortChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    expect(screen.queryByText("Tools, most first")).toBeNull();
  });

  it("calls onSortChange and closes the popover when a sort option is picked", () => {
    const onSortChange = vi.fn();
    render(<ViewControl grouping="server" sort="attention" onGroupingChange={vi.fn()} onSortChange={onSortChange} />);
    const trigger = screen.getByRole("button", { name: "View" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByText("Name"));
    expect(onSortChange).toHaveBeenCalledWith("name");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes on Escape without calling either callback", () => {
    const onGroupingChange = vi.fn();
    const onSortChange = vi.fn();
    render(<ViewControl grouping="server" sort="attention" onGroupingChange={onGroupingChange} onSortChange={onSortChange} />);
    const trigger = screen.getByRole("button", { name: "View" });
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(onGroupingChange).not.toHaveBeenCalled();
    expect(onSortChange).not.toHaveBeenCalled();
  });

  it("marks the current grouping and sort as checked", () => {
    render(<ViewControl grouping="registration" sort="name" onGroupingChange={vi.fn()} onSortChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    expect(screen.getByText("One per registration").closest("button")?.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("One per server").closest("button")?.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Name").closest("button")?.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Needs attention first").closest("button")?.getAttribute("aria-checked")).toBe("false");
  });
});
