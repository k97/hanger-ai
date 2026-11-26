import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { cn } from "../../lib/utils";

/* shadcn's Tooltip on Base UI, added with `shadcn add tooltip` (style
   base-mira) and restyled to Hanger's tokens. Its first caller is the
   overview card's window-bar toggle (Task 2 of
   docs/plans/2026-11-26-global-list.md); Hanger's own `Tooltip.tsx` serves
   every other control until each is swapped (round 19).

   Changed from the CLI's file:
   - `cn` comes from src/lib/utils, not the `cn` package the registry names
     (.claude/DESIGN.md §5, shadcn).
   - The tip wears `Tooltip.tsx`'s look: the strong fill, 11px flex type,
     the 6px radius, one line. The arrow, the animations and the `dark:`
     overrides are gone.
   - The trigger opens after 80ms, `Tooltip.tsx`'s delay, in place of Base
     UI's 600ms; `TooltipProvider` is left out until two tips need to share
     a delay. */

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ delay = 80, ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" delay={delay} {...props} />;
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 8,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-[200] pointer-events-none"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "block whitespace-nowrap bg-fill text-on-fill font-flex text-micro px-2 py-1 rounded-[6px]",
            className
          )}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent };
