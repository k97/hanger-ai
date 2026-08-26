// @vitest-environment happy-dom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import InfoPopover from "./InfoPopover";

afterEach(cleanup);

const NOTE = "Token figures are bytes divided by four.";

function Subject() {
  return <InfoPopover label="About the context figures">{NOTE}</InfoPopover>;
}

describe("InfoPopover", () => {
  it("keeps the note out of the document until it is asked for", () => {
    render(<Subject />);
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.queryByText(NOTE)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "About the context figures" }));
    expect(screen.getByRole("note").textContent).toBe(NOTE);
  });

  it("flips aria-expanded on the trigger", () => {
    render(<Subject />);
    const trigger = screen.getByRole("button", { name: "About the context figures" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("names the note as the region the trigger controls", () => {
    // aria-controls is what tells a screen reader the button and the prose
    // are one thing. It is only meaningful if it resolves: an id that names
    // no element is worse than no attribute at all.
    render(<Subject />);
    const trigger = screen.getByRole("button", { name: "About the context figures" });
    fireEvent.click(trigger);
    const id = trigger.getAttribute("aria-controls");
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)).toBe(screen.getByRole("note"));
  });

  it("gives two popovers on one screen different ids", () => {
    // Both MCP call sites can render at once -- one ledger per launch spec --
    // so a hardcoded id would have aria-controls on the second trigger
    // resolve to the first one's prose.
    render(
      <div>
        <InfoPopover label="First">one</InfoPopover>
        <InfoPopover label="Second">two</InfoPopover>
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "First" }));
    fireEvent.click(screen.getByRole("button", { name: "Second" }));
    const [a, b] = screen.getAllByRole("note").map((n) => n.id);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it("closes on Escape", () => {
    render(<Subject />);
    fireEvent.click(screen.getByRole("button", { name: "About the context figures" }));
    expect(screen.getByRole("note")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("closes on outside pointerdown", () => {
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <Subject />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "About the context figures" }));
    expect(screen.getByRole("note")).toBeTruthy();
    fireEvent.pointerDown(screen.getByTestId("outside"));
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("survives a pointerdown inside its own prose", () => {
    // Selecting the text to copy it is a pointerdown like any other; closing
    // on it would make the note unselectable.
    render(<Subject />);
    fireEvent.click(screen.getByRole("button", { name: "About the context figures" }));
    fireEvent.pointerDown(screen.getByRole("note"));
    expect(screen.getByRole("note")).toBeTruthy();
  });
});
