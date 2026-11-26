// @vitest-environment happy-dom
/** The overview card's window-bar popover (Task 5 of
 *  docs/plans/2026-11-26-overview-card.md, as amended): a fixed dialog on
 *  document.body, right-aligned under its anchor, that closes on Esc and on
 *  a pointerdown outside both itself and the anchor. */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useRef } from "react";
import OverviewPopover from "./OverviewPopover";

afterEach(cleanup);

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

  it("is a fixed dialog named Overview, portalled to document.body, with the overlay elevation", () => {
    render(<Harness open onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Overview" });
    expect(dialog.parentElement).toBe(document.body);
    expect(screen.getByTestId("host").contains(dialog)).toBe(false);
    expect(dialog.className).toMatch(/(^| )fixed( |$)/);
    expect(dialog.className).toContain("shadow-overlay");
    expect(dialog.className).toContain("rounded-plane");
    // No animation opens or closes it (Global Constraints).
    expect(dialog.className).not.toMatch(/animate-|transition/);
  });

  it("closes on Esc", () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on a pointerdown outside, and not on one inside it or on its anchor", () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    fireEvent.pointerDown(screen.getByText("Inside"));
    fireEvent.pointerDown(screen.getByText("Anchor"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByText("Elsewhere"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
