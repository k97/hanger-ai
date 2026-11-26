import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { CheckIcon } from "../icons";
import { cn } from "../../lib/utils";

/* shadcn's DropdownMenu on Base UI, added with `shadcn add dropdown-menu`
   (style base-mira) and restyled to Hanger's tokens for the View control
   and the inspector cap's ⋮ menu, both through `OverflowMenu` (Task 3 of
   docs/plans/2026-11-26-global-list.md). Base UI owns the behaviour: a
   click on the trigger opens it, it portals and positions against the
   trigger, ↑/↓ move the highlight, Home and End jump, Enter or a click
   picks, and Esc or a press outside closes it. The Esc it uses is marked
   handled on `document`, before App's own Esc hears it on `window`.

   Changed from the CLI's file:
   - `cn` comes from src/lib/utils, not the `cn` package the registry names,
     and the check mark is Hanger's `CheckIcon` at 12, not lucide's
     (.claude/DESIGN.md §5, shadcn; §4, icons).
   - The panel is Hanger's overlay surface: the page, a --line border, the
     inner radius and `shadow-overlay`, the only elevation the token guard
     allows. No ring and no enter or exit animation: Hanger's popovers open
     and close with nothing moving. Width and padding are the caller's.
   - The quiet highlight is --tint. shadcn's `bg-accent` is Hanger's strong
     fill here (`--accent` is `--fill`), so it is not used.
   - Items are 13px `font-flex`, 28px tall, on the soft radius; the label is
     the 11px muted voice. Callers add to both.
   - The submenu, checkbox item, shortcut and inset parts are gone until
     something needs one, and so are the `destructive` variant and the
     `dark:` rule: themes switch tokens, and nothing here destroys. */

function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  className,
  ...props
}: MenuPrimitive.Popup.Props & Pick<MenuPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            "max-h-(--available-height) overflow-x-hidden overflow-y-auto bg-page text-ink-1 font-sans border border-line rounded-inner shadow-overlay outline-none",
            className
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function DropdownMenuGroup({ ...props }: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

function DropdownMenuLabel({ className, ...props }: MenuPrimitive.GroupLabel.Props) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      className={cn("px-1.5 py-1 font-flex text-micro text-ink-3", className)}
      {...props}
    />
  );
}

const itemClass =
  "flex items-center gap-2 h-7 px-1.5 rounded-soft font-flex text-small text-ink-1 cursor-pointer outline-none select-none transition-colors duration-hover data-highlighted:bg-tint data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0";

function DropdownMenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return <MenuPrimitive.Item data-slot="dropdown-menu-item" className={cn(itemClass, className)} {...props} />;
}

function DropdownMenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props) {
  return <MenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />;
}

function DropdownMenuRadioItem({ className, children, ...props }: MenuPrimitive.RadioItem.Props) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(itemClass, "justify-between", className)}
      {...props}
    >
      {children}
      <MenuPrimitive.RadioItemIndicator data-slot="dropdown-menu-radio-item-indicator">
        <CheckIcon size={12} aria-hidden="true" />
      </MenuPrimitive.RadioItemIndicator>
    </MenuPrimitive.RadioItem>
  );
}

function DropdownMenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("h-px mx-1.5 my-1 bg-line", className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};
