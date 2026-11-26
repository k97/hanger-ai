import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

/* shadcn's Toggle on Base UI, added with `shadcn add toggle` (style
   base-mira) and restyled to Hanger's tokens. Its first caller is the
   overview card's window-bar button (Task 2 of
   docs/plans/2026-11-26-global-list.md), drawn as T3 Code draws its panel
   toggles (PanelLayoutControls.tsx): 28px square, the 8px control radius,
   a tint while pressed. Base UI owns the behaviour: a native <button> with
   `aria-pressed`, and `data-pressed` while on.

   Changed from the CLI's file:
   - `cn` comes from src/lib/utils, not the `cn` package the registry names
     (.claude/DESIGN.md §5, shadcn).
   - Every colour, size and radius is a Hanger token. Hover is --plane-2,
     as on every window-bar button (App's `tbBtnClass`), and pressed is
     --tint. The CLI's `bg-muted` is --plane here, for hover and pressed
     alike, so an open card would not read as on.
   - The `outline` variant, the `sm`/`lg` sizes, the `aria-invalid` and
     `dark:` rules and the focus-ring utilities are gone: one window-bar
     size, no `dark:` variant (themes switch tokens), and one global focus
     ring that outranks any utility (.claude/rules/invariants.md). */

const toggleVariants = cva(
  "inline-flex items-center justify-center shrink-0 cursor-pointer text-ink-2 transition-colors duration-hover ease-spring hover:bg-plane-2 hover:text-ink-1 data-pressed:bg-tint data-pressed:text-ink-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      size: {
        /** The window bar's icon toggle: 28px, the 8px control radius. */
        icon: "h-7 w-7 rounded-control",
      },
    },
    defaultVariants: {
      size: "icon",
    },
  }
);

function Toggle({ className, size = "icon", ...props }: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return <TogglePrimitive data-slot="toggle" className={cn(toggleVariants({ size }), className)} {...props} />;
}

export { Toggle, toggleVariants };
