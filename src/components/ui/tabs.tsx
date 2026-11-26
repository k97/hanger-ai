import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

/* shadcn's Tabs on Base UI, added with `shadcn add tabs` (style base-mira)
   and restyled to Hanger's tokens: the pill track and raised capsule that
   SegmentedTrack drew until Task 1b of docs/plans/2026-11-26-global-list.md.
   Base UI owns the behaviour the old track wrote by hand: one tab stop on
   the active tab, ←/→ (wrapping), Home/End, and Enter or Space to select;
   focus alone never selects (`activateOnFocus` is off by default).

   Changed from the CLI's file:
   - `cn` comes from src/lib/utils, not the `cn` package the registry names,
     because Hanger's size and radius names have to be registered with
     tailwind-merge (src/lib/utils.ts).
   - Every colour, size and radius is a Hanger token; the vertical and
     `line` variants, the `dark:` overrides and the focus-ring utilities are
     gone. Hanger has one horizontal track, no `dark:` variant (themes switch
     tokens), and one global focus ring that outranks any utility
     (.claude/rules/invariants.md).
   - `TabsIndicator` is added: Base UI's indicator, drawn as the capsule.
   - `TabsContent` is left out until something has a panel to show. */

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("group/tabs", className)} {...props} />;
}

const tabsListVariants = cva("group/tabs-list relative inline-flex max-w-full", {
  variants: {
    variant: {
      /* The plane track: a pill on the plane, scrolling sideways as a last
         resort with its scrollbar hidden. */
      default:
        "p-1 rounded-pill bg-plane border border-line overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

/** Sits above the capsule (`z-[1]`). The active tab is ink-1 and medium. */
function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative z-[1] h-7 px-4 rounded-pill font-flex text-small whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer transition-colors duration-nav ease-spring text-ink-2 hover:text-ink-1 data-active:text-ink-1 data-active:font-medium",
        className,
      )}
      {...props}
    />
  );
}

/** The raised capsule under the active tab. Base UI measures the tab and
 *  hands its box over as `--active-tab-*`; the capsule slides between tabs
 *  on the nav beat. It stays hidden until there is a box to draw. */
function TabsIndicator({ className, ...props }: TabsPrimitive.Indicator.Props) {
  return (
    <TabsPrimitive.Indicator
      data-slot="tabs-indicator"
      className={cn(
        "absolute h-7 rounded-pill capsule-raised top-(--active-tab-top) left-(--active-tab-left) w-(--active-tab-width) transition-[left,width] duration-nav ease-spring",
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsIndicator, tabsListVariants };
