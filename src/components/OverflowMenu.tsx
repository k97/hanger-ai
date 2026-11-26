import { useState, type HTMLAttributes, type ReactElement, type ReactNode, type Ref } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "./ui/dropdown-menu";

export const menuLabelClass =
  "font-flex text-micro tracking-[.06em] uppercase text-ink-3 px-1.5 pt-1 pb-1";

/** An option row: label left, check mark right (ViewControl). The highlight
 *  is `ui/dropdown-menu`'s --tint. */
export const menuItemClass = "w-full justify-between";

/** An action row: icon, then label (the cap's ⋮ menu). */
export const menuActionClass = "w-full h-8 px-2.5 gap-2.5 text-left";

/** The props a trigger must spread: Base UI's ARIA, handlers and ref. */
export type OverflowMenuTriggerProps = HTMLAttributes<HTMLElement> & { ref?: Ref<any> };

export interface OverflowMenuProps {
  /** The trigger, rendered by the caller; receives the props it must spread
   *  onto its <button>. */
  trigger: (props: OverflowMenuTriggerProps) => ReactElement;
  /** `role="menu"`'s accessible name. */
  ariaLabel: string;
  /** Which edge the panel hangs from. ViewControl opens from its left edge;
   *  the cap's ⋮ opens from its right, inward, because the aside clips. */
  align: "left" | "right";
  /** Closes the menu; a caller's plain item calls it after acting. Items
   *  drawn with `ui/dropdown-menu`'s `DropdownMenuItem` close it themselves. */
  children: (close: () => void) => ReactNode;
  /** Panel width and padding: ViewControl keeps w-[224px] p-1.5, the cap's
   *  menu is min-w-[184px] p-1. */
  className?: string;
  "data-testid"?: string;
}

/**
 * The menu behind `ViewControl`'s "View" control and the inspector cap's ⋮
 * overflow, drawn with shadcn's DropdownMenu on Base UI (`ui/dropdown-menu`;
 * Task 3 of docs/plans/2026-11-26-global-list.md): a trigger the caller
 * renders, and a flat panel 6px beneath it, hung from the edge `align`
 * names. Base UI opens it on a click, moves the highlight with ↑/↓, and
 * closes it on Esc, a press outside, or a picked item. Its Esc is marked
 * handled, so App's Esc (which clears Global's selection) leaves it alone.
 */
export default function OverflowMenu({
  trigger,
  ariaLabel,
  align,
  children,
  className,
  "data-testid": dataTestId,
}: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger render={(props) => trigger(props)} />
      {/* Rendered only while open, as OverviewPopover's is: Base UI
          otherwise holds a closed popup in the page until its exit
          animations finish, and this one has none. */}
      {open && (
        <DropdownMenuContent
          align={align === "left" ? "start" : "end"}
          sideOffset={6}
          aria-label={ariaLabel}
          data-testid={dataTestId}
          className={className}
        >
          {children(() => setOpen(false))}
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
}
