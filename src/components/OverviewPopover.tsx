import type { ReactNode, RefObject } from "react";
import { Popover, PopoverContent } from "./ui/popover";

/** The gap between the anchor's bottom edge and the panel. */
const GAP = 6;

export interface OverviewPopoverProps {
  open: boolean;
  onClose: () => void;
  /** The window-bar button the panel hangs under. A press on it is not
   *  "outside": the button's own click toggles the card. */
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}

/**
 * The overview card's window-bar popover, used when there is no room to
 * dock the card (Task 2 of docs/plans/2026-11-26-global-list.md; Task 5 of
 * docs/plans/2026-11-26-overview-card.md before it). Drawn with
 * shadcn's Popover on Base UI (`ui/popover`), which portals it to
 * document.body, names it a dialog, right-aligns it under its anchor and
 * closes it on Esc or a press outside. It opens and closes with no
 * animation. The card inside draws its own frost and border; the popup
 * adds the overlay elevation around it.
 *
 * Esc goes to the innermost thing open. Everything that opens inside the
 * card (FindingPopover, a menu, a tip) takes Esc in the capture phase on
 * `window` and marks it handled, so it has run by the time Base UI sees it,
 * and an Esc already marked is cancelled here rather than closing the card.
 * Base UI marks the Esc it does use, on `document`, before App's Esc (which
 * clears Global's selection) hears it in the bubble phase on `window`.
 */
export default function OverviewPopover({ open, onClose, anchorRef, children }: OverviewPopoverProps) {
  return (
    <Popover
      open={open}
      onOpenChange={(next, details) => {
        if (next) return;
        const event = details.event as Event | undefined;
        if (details.reason === "escape-key" && event?.defaultPrevented) {
          details.cancel();
          return;
        }
        if (
          details.reason === "outside-press" &&
          event?.target instanceof Node &&
          anchorRef.current?.contains(event.target)
        ) {
          details.cancel();
          return;
        }
        onClose();
      }}
    >
      {/* Rendered only while open: Base UI otherwise holds a closed popup
          in the page until its exit animations finish, a frame later, and
          this one has none. Closed, it leaves the page at once. */}
      {open && (
      <PopoverContent
        anchor={anchorRef}
        side="bottom"
        align="end"
        sideOffset={GAP}
        aria-label="Overview"
        data-testid="overview-popover"
        className="bg-transparent"
      >
        {children}
      </PopoverContent>
      )}
    </Popover>
  );
}
