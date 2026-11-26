import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";
import { cn } from "../../lib/utils";

/* shadcn's Separator on Base UI, added with `shadcn add separator` (style
   base-mira) and restyled to Hanger's tokens (Task 3 of
   docs/plans/2026-11-26-global-list.md). Base UI gives `role="separator"`
   and `data-orientation`.

   Changed from the CLI's file:
   - `cn` comes from src/lib/utils, not the `cn` package the registry names
     (.claude/DESIGN.md §5, shadcn).
   - The rule is --line, Hanger's 1px rule colour, not shadcn's --border.
   - The CLI's `data-horizontal:` and `data-vertical:` variants are
     registered only by shadcn's own stylesheet, which Hanger does not load,
     so the orientation is read from Base UI's `data-orientation`. */

function Separator({ className, orientation = "horizontal", ...props }: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "shrink-0 bg-line data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:self-stretch",
        className
      )}
      {...props}
    />
  );
}

export { Separator };
