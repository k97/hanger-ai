// @vitest-environment happy-dom
/** The overview card's chrome, split out of ProfilePane: the cap button
 *  portalled into App's slot, the popover, the docked frame and ⌘E. */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import OverviewHost from "./OverviewHost";

afterEach(cleanup);

const card = <div data-testid="the-card">Card</div>;

function Harness({
  slot = true,
  docked,
  hidden = false,
  onToggleHidden,
}: {
  slot?: boolean;
  docked: boolean;
  hidden?: boolean;
  onToggleHidden?: () => void;
}) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  return (
    <div>
      <span data-testid="slot" ref={setEl} />
      <OverviewHost card={card} capSlot={slot ? el : null} docked={docked} hidden={hidden} onToggleHidden={onToggleHidden} />
    </div>
  );
}

const button = (label: string) => {
  const b = screen.getByRole("button", { name: /overview/ });
  expect(b.getAttribute("aria-label")).toBe(label);
  return b;
};

const key = (target: Element | Window, init: KeyboardEventInit) => fireEvent.keyDown(target, init);

describe("OverviewHost", () => {
  it("draws nothing, and ignores ⌘E, without a cap slot", () => {
    render(<Harness slot={false} docked={false} />);
    key(window, { key: "e", metaKey: true });
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByTestId("the-card")).toBeNull();
  });

  it("docked, draws the card in the pane and no dialog; the button reads Hide overview  ⌘E and asks to hide it", () => {
    let hides = 0;
    render(<Harness docked onToggleHidden={() => hides++} />);
    expect(screen.getByTestId("overview-dock").contains(screen.getByTestId("the-card"))).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    const hide = button("Hide overview  ⌘E");
    expect(screen.getByTestId("slot").contains(hide)).toBe(true);
    fireEvent.click(hide);
    expect(hides).toBe(1);
  });

  it("docked and hidden, draws no card; the button reads Show overview  ⌘E", () => {
    render(<Harness docked hidden />);
    expect(screen.queryByTestId("overview-dock")).toBeNull();
    expect(screen.queryByTestId("the-card")).toBeNull();
    expect(button("Show overview  ⌘E")).toBeTruthy();
  });

  it("not docked, opens the card in a dialog from the button and from ⌘E, and Esc closes it", () => {
    render(<Harness docked={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(button("Show overview  ⌘E"));
    expect(screen.getByRole("dialog").contains(screen.getByTestId("the-card"))).toBe(true);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    key(window, { key: "e", metaKey: true });
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("closes an open popover when the card docks", () => {
    const { rerender } = render(<Harness docked={false} />);
    fireEvent.click(button("Show overview  ⌘E"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    rerender(<Harness docked />);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<Harness docked={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("leaves ⌘E typed into a text field alone", () => {
    render(
      <>
        <input data-testid="field" />
        <Harness docked={false} />
      </>
    );
    key(screen.getByTestId("field"), { key: "e", metaKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
