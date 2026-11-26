import { useState } from "react";
import { ChevronRightIcon } from "./icons";
import { cardChipClass } from "./AssetRow";
import { groupLabelClass } from "./typeRoles";

/** A row of a group in Global's list that is no asset row: the card row's
 *  first line, then one line about it. A button, since the whole row is the
 *  one thing it does. Selected, it takes the card row's selected ground
 *  (`AssetRow.tsx`, `activeClass`). The "Switched off" group's rows are drawn
 *  with it too (ProfilePane), where it was born as `keptRowClass`. */
export const groupRowClass =
  "flex flex-col gap-0.5 min-w-0 mx-1.5 px-2.5 py-2 rounded-inner text-left cursor-pointer font-sans transition-colors duration-hover ease-spring";

export interface NotLoadedRow {
  key: string;
  name: string;
  /** The chip beside the name: an MCP server's transport, else the kind. */
  chip: string;
  /** Why the engine does not reach it, in ReachCard's words (`missTitle`). */
  reason: string;
  selected: boolean;
  onOpen: () => void;
}

/** The group's head, which its tick beside the list repeats (GroupTicks). */
export function notLoadedHead(engineName: string): string {
  return `Not loaded by ${engineName}`;
}

interface NotLoadedGroupProps {
  engineName: string;
  rows: NotLoadedRow[];
  /** Folded until asked (Q4). Given, the fold is the caller's. */
  defaultOpen?: boolean;
  /** Clears the sticky header stuck over the group when its tick jumps to
   *  it (GroupTicks): ProfilePane's call, which knows what is above. */
  scrollMarginClass?: "scroll-mt-8" | "scroll-mt-11";
}

/**
 * "Not loaded by ‹engine›" (Phase 1 of
 * docs/plans/2026-11-25-ia-global-by-engine.md, Q4): the assets in the global
 * store the backend says this engine does not reach (`reached: false` in
 * `get_asset_annotations`), each with its reason. Folded by default, once at
 * the end of Global's list.
 *
 * The header is the "Switched off" group's `h3` shape (`groupLabelClass` at
 * the same padding) made a fold button with HeroBand's chevron. It has **no
 * figure**: no backend command counts these, and a number made here would be
 * a frontend count (`no-frontend-counting.test.ts`). The rows open their
 * asset in the inspector, where the cap's Link to… is the way to act.
 */
export default function NotLoadedGroup({
  engineName,
  rows,
  defaultOpen = false,
  scrollMarginClass = "scroll-mt-8",
}: NotLoadedGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div data-testid="not-loaded-group">
      <h3 id="group-not-loaded" className={`${scrollMarginClass} ${groupLabelClass}`}>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-1.5 px-3.5 pt-[11px] pb-[5px] text-left cursor-pointer hover:text-ink-1 transition-colors duration-hover ease-spring"
        >
          <ChevronRightIcon
            size={12}
            className={`shrink-0 transition-transform duration-hover ease-spring ${open ? "rotate-90" : ""}`}
          />
          {notLoadedHead(engineName)}
        </button>
      </h3>
      {open && (
        <div className="flex flex-col">
          {rows.map((row) => (
            <button
              key={row.key}
              type="button"
              data-testid="not-loaded-row"
              data-selected={row.selected ? "true" : "false"}
              onClick={row.onOpen}
              className={`${groupRowClass} ${row.selected ? "bg-tint" : "hover:bg-plane-2"}`}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <span className={`text-base-app truncate ${row.selected ? "text-tint-ink font-medium" : "text-ink-1"}`}>
                  {row.name}
                </span>
                <span className={cardChipClass}>{row.chip}</span>
              </span>
              <span className="text-small text-ink-3 truncate">{row.reason}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
