import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import OverviewPopover from "./OverviewPopover";
import { GaugeIcon } from "./icons";
import { Toggle } from "./ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { overviewButtonLabel } from "../utils/overviewCopy";
import { isTextEntryTarget } from "../utils/textEntry";

/** The overview card's chrome, shared by the panes that carry one: its
 *  button, portalled into App's cap slot; the popover it opens when the card
 *  does not dock; the docked frame; and ⌘E. The pane decides whether the card
 *  docks and whether it is put away; this owns the popover's open state.
 *  Without a cap slot it draws nothing and binds no key, so leaving the pane
 *  (which unmounts it) closes everything. */
export default function OverviewHost({
  card,
  capSlot,
  docked,
  hidden,
  onToggleHidden,
}: {
  card: ReactNode;
  capSlot: HTMLElement | null;
  docked: boolean;
  hidden: boolean;
  onToggleHidden?: () => void;
}) {
  const [overviewOpen, setOverviewOpen] = useState(false);
  const overviewButtonRef = useRef<HTMLButtonElement>(null);
  const available = capSlot !== null;
  // The button's state: docked, whether the card shows; otherwise whether
  // the popover is open.
  const overviewOn = docked ? !hidden : overviewOpen;
  const toggleOverview = useCallback(() => {
    if (docked) onToggleHidden?.();
    else setOverviewOpen((v) => !v);
  }, [docked, onToggleHidden]);
  // A popover open when the card docks closes, so it cannot reopen unasked
  // when the window narrows again (T3's ThreadDetailsCard does the same).
  useEffect(() => {
    if (docked) setOverviewOpen(false);
  }, [docked]);
  // ⌘E does what the button does. A keystroke into a text field (search,
  // rename) is typing, not a shortcut (Review Focus 3).
  useEffect(() => {
    if (!available) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "e") return;
      if (isTextEntryTarget(e.target)) return;
      e.preventDefault();
      toggleOverview();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [available, toggleOverview]);

  return (
    <>
      {/* The overview card's button, portalled into App's cap slot: shadcn's
          Toggle with its Tooltip (Task 2 of
          docs/plans/2026-11-26-global-list.md). Docked, it shows and hides
          the card; otherwise it opens the popover, portalled onto
          document.body. The wrapper's `relative` lifts it over the cap's
          drag overlay. */}
      {available &&
        createPortal(
          <Tooltip>
            {/* The tip hangs from a wrapper, as T3 wraps its toggles
                (PanelLayoutControls.tsx), so the trigger's props do not
                land on the Toggle itself. */}
            <TooltipTrigger render={<span className="relative flex shrink-0" />}>
              <Toggle
                ref={overviewButtonRef}
                pressed={overviewOn}
                onPressedChange={toggleOverview}
                aria-label={overviewButtonLabel(overviewOn)}
                aria-haspopup={docked ? undefined : "dialog"}
                aria-expanded={docked ? undefined : overviewOpen}
              >
                <GaugeIcon size={16} aria-hidden="true" />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent side="bottom">{overviewButtonLabel(overviewOn)}</TooltipContent>
          </Tooltip>,
          capSlot
        )}
      <OverviewPopover
        open={available && !docked && overviewOpen}
        onClose={() => setOverviewOpen(false)}
        anchorRef={overviewButtonRef}
      >
        {card}
      </OverviewPopover>
      {/* Docked, as T3 docks its card: at the pane's top right, over the
          list, whose lane box keeps clear of it (`laneBoxClass`). */}
      {available && docked && !hidden && (
        <div
          data-testid="overview-dock"
          className="absolute right-3 top-3 z-10 w-[280px] max-h-[calc(100%-24px)] overflow-y-auto rounded-plane"
        >
          {card}
        </div>
      )}
    </>
  );
}
