import { AdjustmentsHorizontalIcon } from "./icons";
import OverflowMenu, { menuItemClass, menuLabelClass } from "./OverflowMenu";
import Tooltip from "./Tooltip";
import {
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";

/** Card rows have no clickable column headers, so the MCP section's grouping
 *  and sort live here instead of in `AssetHeaderRow` (spec §5.6: "the
 *  Display control ... owns grouping and sort, so the chip row stays a
 *  filter line and nothing else"). Every other category keeps its header. */
export type ServerGrouping = "server" | "registration";
/** "tools" (Tools, most first) is not offered: no field anywhere carries a
 *  per-server tool count (that needs a live protocol handshake, which this
 *  stage does not do), and Karthik signed off that option assuming data
 *  existed behind it. An option that always degrades to name order is worse
 *  than an absent one. Restore it once Task 8's persisted probe results
 *  (keyed by launch hash) give it something real to sort by. */
export type ServerSort = "attention" | "name";

interface ViewControlProps {
  grouping: ServerGrouping;
  sort: ServerSort;
  onGroupingChange: (grouping: ServerGrouping) => void;
  onSortChange: (sort: ServerSort) => void;
}

/** Copy signed off 2026-08-18 — verbatim. */
const ROWS_OPTIONS: { value: ServerGrouping; label: string }[] = [
  { value: "server", label: "One per server" },
  { value: "registration", label: "One per registration" },
];

const SORT_OPTIONS: { value: ServerSort; label: string }[] = [
  { value: "attention", label: "Needs attention first" },
  { value: "name", label: "Name" },
];

const triggerClass =
  "shrink-0 p-1 rounded-pill grid place-items-center text-ink-3 hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover cursor-pointer";

/**
 * "The Display control" of spec §5.6, signed off as "View". An icon-only
 * trigger — it sits inline in the MCP section header, before the "MCP
 * servers · N" label, so a labelled pill would outweigh the row it's in —
 * plus a flat panel beneath it — same anatomy as the link map's layers
 * panel (`LinkMapPane.tsx`: `shadow-overlay`, `rounded-soft` rows, a
 * `tracking-[.06em]` section label) so a second popover in this app doesn't
 * invent a second visual language for the same idea.
 *
 * The panel opens from the trigger's left edge, not its right: unlike the
 * facet row this used to live in, the trigger now sits at the row's own
 * left edge, and a right-anchored panel would run off the container.
 *
 * The panel is shadcn's DropdownMenu (`ui/dropdown-menu`, through
 * `OverflowMenu`; Task 3 of docs/plans/2026-11-26-global-list.md): each
 * section is a radio group under its label, the current option carries the
 * check mark, ↑/↓ move between options, and picking one closes the menu.
 */
export default function ViewControl({ grouping, sort, onGroupingChange, onSortChange }: ViewControlProps) {
  return (
    <OverflowMenu
      trigger={(triggerProps) => (
        <Tooltip label="View" placement="bottom">
          <button type="button" aria-label="View" className={triggerClass} {...triggerProps}>
            <AdjustmentsHorizontalIcon size={14} aria-hidden="true" />
          </button>
        </Tooltip>
      )}
      ariaLabel="View"
      align="left"
      className="w-[224px] p-1.5"
      data-testid="view-control-panel"
    >
      {() => (
        <>
          {/* Each label sits in its group, as Base UI's Menu requires; a
              radio item closes the menu once picked, and its check mark is
              the item's own indicator. */}
          <DropdownMenuGroup>
            <DropdownMenuLabel className={menuLabelClass}>Rows</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={grouping} onValueChange={(v) => onGroupingChange(v as ServerGrouping)}>
              {ROWS_OPTIONS.map((opt) => (
                <DropdownMenuRadioItem key={opt.value} value={opt.value} closeOnClick className={menuItemClass}>
                  {opt.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>

          <DropdownMenuSeparator className="my-1.5" />

          <DropdownMenuGroup>
            <DropdownMenuLabel className={menuLabelClass}>Sort</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={sort} onValueChange={(v) => onSortChange(v as ServerSort)}>
              {SORT_OPTIONS.map((opt) => (
                <DropdownMenuRadioItem key={opt.value} value={opt.value} closeOnClick className={menuItemClass}>
                  {opt.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </>
      )}
    </OverflowMenu>
  );
}
