// @vitest-environment happy-dom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import OverflowMenu from "./OverflowMenu";

afterEach(cleanup);

function Trigger(props: { "aria-haspopup": "menu"; "aria-expanded": boolean; onClick: () => void }) {
  return (
    <button type="button" {...props}>
      Trigger
    </button>
  );
}

describe("OverflowMenu", () => {
  it("opens on trigger click with role=\"menu\" named by ariaLabel", () => {
    render(
      <OverflowMenu trigger={(p) => <Trigger {...p} />} ariaLabel="Actions" align="left">
        {() => <div>Item</div>}
      </OverflowMenu>,
    );
    expect(screen.queryByRole("menu", { name: "Actions" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Trigger" }));
    expect(screen.getByRole("menu", { name: "Actions" })).toBeTruthy();
  });

  it("flips aria-expanded on the trigger", () => {
    render(
      <OverflowMenu trigger={(p) => <Trigger {...p} />} ariaLabel="Actions" align="left">
        {() => <div>Item</div>}
      </OverflowMenu>,
    );
    const trigger = screen.getByRole("button", { name: "Trigger" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("closes on Escape", () => {
    render(
      <OverflowMenu trigger={(p) => <Trigger {...p} />} ariaLabel="Actions" align="left">
        {() => <div>Item</div>}
      </OverflowMenu>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Trigger" }));
    expect(screen.getByRole("menu", { name: "Actions" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Actions" })).toBeNull();
  });

  it("closes on outside pointerdown", () => {
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <OverflowMenu trigger={(p) => <Trigger {...p} />} ariaLabel="Actions" align="left">
          {() => <div>Item</div>}
        </OverflowMenu>
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Trigger" }));
    expect(screen.getByRole("menu", { name: "Actions" })).toBeTruthy();
    fireEvent.pointerDown(screen.getByTestId("outside"));
    expect(screen.queryByRole("menu", { name: "Actions" })).toBeNull();
  });

  it("hangs the panel from its left edge when align=\"left\"", () => {
    // The value ViewControl actually ships, and the one nothing guarded:
    // hardcoding `right-0` regardless of `align` passed the whole suite.
    // Asserting the absence of `right-0` too is what makes it a choice
    // rather than a presence check — both classes could be emitted at once.
    render(
      <OverflowMenu trigger={(p) => <Trigger {...p} />} ariaLabel="Actions" align="left">
        {() => <div>Item</div>}
      </OverflowMenu>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Trigger" }));
    const menu = screen.getByRole("menu", { name: "Actions" });
    expect(menu.className).toContain("left-0");
    expect(menu.className).not.toContain("right-0");
  });

  it("hangs the panel from its right edge when align=\"right\"", () => {
    render(
      <OverflowMenu trigger={(p) => <Trigger {...p} />} ariaLabel="Actions" align="right">
        {() => <div>Item</div>}
      </OverflowMenu>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Trigger" }));
    const menu = screen.getByRole("menu", { name: "Actions" });
    expect(menu.className).toContain("right-0");
    expect(menu.className).not.toContain("left-0");
  });

  it("puts exactly one padding utility on the panel", () => {
    // The panel used to carry `p-1` from the base string while ViewControl
    // appended `p-1.5`, so both landed on one element and Tailwind's emission
    // order decided — verified empirically to give the intended p-1.5, but
    // declared nowhere and true only by accident of ordering. Padding now
    // belongs to the caller, and this is what stops a second one creeping
    // back in beside it.
    render(
      <OverflowMenu trigger={(p) => <Trigger {...p} />} ariaLabel="Actions" align="left" className="w-[224px] p-1.5">
        {() => <div>Item</div>}
      </OverflowMenu>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Trigger" }));
    const menu = screen.getByRole("menu", { name: "Actions" });
    const padding = menu.className.split(/\s+/).filter((c) => /^p-[\d.]+(?:\[|$)/.test(c));
    expect(padding, `panel padding utilities: ${padding.join(", ")}`).toEqual(["p-1.5"]);
  });

  it("closes when an item calls the close callback it is handed", () => {
    render(
      <OverflowMenu trigger={(p) => <Trigger {...p} />} ariaLabel="Actions" align="left">
        {(close) => (
          <button type="button" onClick={close}>
            Act
          </button>
        )}
      </OverflowMenu>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Trigger" }));
    fireEvent.click(screen.getByRole("button", { name: "Act" }));
    expect(screen.queryByRole("menu", { name: "Actions" })).toBeNull();
  });
});
