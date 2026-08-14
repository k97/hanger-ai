// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import Tooltip from "../components/Tooltip";

function Subject({ label = "My machine" }: { label?: string }) {
  return (
    <Tooltip label={label}>
      <button aria-label={label}>icon</button>
    </Tooltip>
  );
}

describe("Tooltip", () => {
  beforeEach(() => {
    cleanup();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits before appearing, so a passing cursor does not trigger it", () => {
    render(<Subject />);
    const button = screen.getByLabelText("My machine");

    fireEvent.pointerEnter(button);
    expect(screen.queryByTestId("tooltip")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(80);
    });
    expect(screen.getByTestId("tooltip").textContent).toBe("My machine");
  });

  it("never appears at all if the cursor leaves within the delay", () => {
    render(<Subject />);
    const button = screen.getByLabelText("My machine");

    fireEvent.pointerEnter(button);
    act(() => {
      vi.advanceTimersByTime(40);
    });
    fireEvent.pointerLeave(button);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByTestId("tooltip")).toBeNull();
  });

  it("opens the next one instantly and without animation once one has been seen", () => {
    render(
      <>
        <Subject label="First" />
        <Subject label="Second" />
      </>
    );

    const first = screen.getByLabelText("First");
    fireEvent.pointerEnter(first);
    act(() => {
      vi.advanceTimersByTime(80);
    });
    expect(screen.getByTestId("tooltip").className).toContain("animate-tip");
    fireEvent.pointerLeave(first);

    // Moving straight along the rail: no second wait, and no second animation.
    fireEvent.pointerEnter(screen.getByLabelText("Second"));
    const tip = screen.getByTestId("tooltip");
    expect(tip.textContent).toBe("Second");
    expect(tip.className).not.toContain("animate-tip");
  });

  it("appears on keyboard focus, not only on hover", () => {
    render(<Subject />);

    fireEvent.focus(screen.getByLabelText("My machine"));
    act(() => {
      vi.advanceTimersByTime(80);
    });

    expect(screen.getByTestId("tooltip")).toBeTruthy();
  });

  it("stays out of the accessibility tree, since the control is already named", () => {
    render(<Subject />);
    fireEvent.pointerEnter(screen.getByLabelText("My machine"));
    act(() => {
      vi.advanceTimersByTime(80);
    });

    // The button carries the name; a tip that repeated it would be read twice.
    expect(screen.getByTestId("tooltip").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getAllByLabelText("My machine")).toHaveLength(1);
  });

  it("dismisses on Escape and on press, so it never sits over what you clicked", () => {
    render(<Subject />);
    const button = screen.getByLabelText("My machine");

    fireEvent.pointerEnter(button);
    act(() => {
      vi.advanceTimersByTime(80);
    });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("tooltip")).toBeNull();

    fireEvent.pointerEnter(button);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByTestId("tooltip")).toBeTruthy();
    fireEvent.pointerDown(button);
    expect(screen.queryByTestId("tooltip")).toBeNull();
  });

  it("leaves the child's layout alone", () => {
    const { container } = render(<Subject />);
    // A display:contents wrapper keeps the button a direct flex child of the
    // rail — a tooltip must not change how the thing it describes is laid out.
    expect(container.firstElementChild?.className).toBe("contents");
  });
});
