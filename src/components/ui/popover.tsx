import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "../../lib/utils";

/* shadcn's Popover on Base UI, added with `shadcn add popover` (style
   base-mira) and restyled to Hanger's tokens for the overview card's popover
   (Task 2 of docs/plans/2026-11-26-global-list.md). Base UI owns the
   behaviour: it portals to document.body, positions against its trigger or
   an `anchor`, closes on Esc and on a press outside, and names its popup a
   dialog.

   Changed from the CLI's file:
   - `cn` comes from src/lib/utils, not the `cn` package the registry names
     (.claude/DESIGN.md §5, shadcn).
   - The popup is Hanger's one overlay surface: the page, the plane radius
     and the overlay elevation (`shadow-overlay`, the only one the token
     guard allows). The ring, the padding, the 12px type and the
     enter and exit animations are gone: Hanger's popovers open and close
     with nothing moving.
   - `anchor` is passed through to the positioner, so a popover can hang
     from a control that is not its trigger.
   - `PopoverHeader`, `PopoverTitle` and `PopoverDescription` are left out
     until something has a heading to give one. */

const Popover = PopoverPrimitive.Root;

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  anchor,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset" | "anchor">) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        anchor={anchor}
        className="isolate z-50"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn("bg-page text-ink-1 rounded-plane shadow-overlay outline-none", className)}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
