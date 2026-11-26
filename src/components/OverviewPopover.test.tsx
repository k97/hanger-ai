// @vitest-environment happy-dom
/** The overview card's window-bar popover (Task 5 of
 *  docs/plans/2026-11-26-overview-card.md, as amended; on shadcn's Popover
 *  since Task 2 of docs/plans/2026-11-26-global-list.md): a dialog portalled
 *  out of its host, right-aligned under its anchor, that closes on Esc and
 *  on a press outside both itself and the anchor. */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useRef } from "react";
import OverviewPopover from "./OverviewPopover";

afterEach(cleanup);

/** A whole mouse press. Base UI closes a popover on the click that ends a
 *  press outside it, not on the pointerdown that starts it. */
function press(el: Element) {
  fireEvent.pointerDown(el);
  fireEvent.mouseDown(el);
  fireEvent.pointerUp(el);
  fireEvent.mouseUp(el);
  fireEvent.click(el);
}

function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <div data-testid="host">
      <button ref={anchorRef} type="button">
        Anchor
      </button>
      <span>Elsewhere</span>
      <OverviewPopover open={open} onClose={onClose} anchorRef={anchorRef}>
        <button type="button">Inside</button>
      </OverviewPopover>
    </div>
  );
}

describe("OverviewPopover", () => {
  it("draws nothing while closed", () => {
    render(<Harness open={false} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is a dialog named Overview, portalled out of its host, with the overlay elevation", () => {
    render(<Harness open onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Overview" });
    // Base UI portals into a container of its own on document.body and
    // positions the popup from its positioner's inline style.
    expect(screen.getByTestId("host").contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
    expect(dialog.className).toContain("shadow-overlay");
    expect(dialog.className).toContain("rounded-plane");
    // No animation opens or closes it (Global Constraints).
    expect(dialog.className).not.toMatch(/animate-|transition/);
  });

  it("closes on Esc", () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    // A real Esc targets the focused element or the body, never the window.
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on a press outside, and not on one inside it or on its anchor", () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    press(screen.getByText("Inside"));
    press(screen.getByText("Anchor"));
    expect(onClose).not.toHaveBeenCalled();
    press(screen.getByText("Elsewhere"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
