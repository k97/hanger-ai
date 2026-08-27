import { useRef, useState, type KeyboardEvent } from "react";
import BrandIcon from "./BrandIcon";
import ListCard from "./ListCard";
import Tooltip from "./Tooltip";
import type { EngineReachInfo } from "./EngineReachTiles";
import { abbreviateHome } from "../utils/prose";

/* The rows are routes, not engines. Each route is a different fact about
   how (or whether) an engine reads this asset, and stating it once on the
   row is what lets thirteen engines fit in three lines. Derived from the
   fields annotations.rs already returns — a reached engine either has a
   root link to name or reads the store where it lies; a miss is either an
   unlinked root or a format the engine cannot read. Four is the ceiling:
   the backend emits exactly those shapes. Labels: "Root not linked" and
   "Another engine's format" signed off 2026-08-17; the two route labels,
   Karthik's ruling 2026-08-28. */
const ROUTES: { key: string; title: string; holds: (r: EngineReachInfo) => boolean }[] = [
  { key: "linked", title: "Through their own link", holds: (r) => r.reached && !!r.via_root },
  { key: "inplace", title: "Where it lies", holds: (r) => r.reached && !r.via_root },
  { key: "unlinked", title: "Root not linked", holds: (r) => !r.reached && r.reason !== "format" },
  { key: "format", title: "Another engine's format", holds: (r) => !r.reached && r.reason === "format" },
];

/* What the footer says for one engine. The two miss phrases are the Reach
   column's own tip words (EngineReachTiles.tsx, tileTip), in a value slot
   and so lower-cased; "in place" is the value the old per-engine row used. */
function answerFor(r: EngineReachInfo): string {
  if (r.reached) return r.via_root ? abbreviateHome(r.via_root) : "in place";
  return r.reason === "format" ? "cannot read this format" : "root not linked";
}

/* 22px plate, 14px mark, the ruled 6px radius. A reached engine is the mark
   on a plane — a vendor logo carries itself and a ring around it only
   competes; an unreached one is a --line ring at 40% so absence reads as
   absence (the same rule EngineReachTiles states). The selected plate is
   tinted, and an unreached one comes up to full strength when selected so
   the tint is not lost under the dimming. Hover never borrows the selected
   colour, so pointing at a plate does not impersonate pressing it. */
const plateBase =
  "w-[22px] h-[22px] rounded-[6px] grid place-items-center shrink-0 cursor-pointer " +
  "transition-[background-color,opacity,transform] duration-hover ease-spring active:scale-[.94]";
function plateClass(r: EngineReachInfo, selected: boolean): string {
  if (selected) return `${plateBase} bg-tint ${r.reached ? "" : "border border-line-2"}`;
  return r.reached
    ? `${plateBase} bg-plane hover:bg-plane-2`
    : `${plateBase} border border-line opacity-40 hover:opacity-70`;
}

/**
 * The inspector's Reach section: every engine the backend holds a verdict
 * for, grouped by the route it takes to this asset, with one footer that
 * answers for the pressed plate. At rest it answers for the first plate in
 * reading order, so it is never empty and never tells the user what to do.
 *
 * Selection is per asset: the owner keys this component by the asset's
 * path, so moving to another asset unmounts it and the state with it.
 */
export default function ReachCard({ reach }: { reach: EngineReachInfo[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const plates = useRef<Record<number, HTMLButtonElement | null>>({});

  /* `members.length > 0` is a boolean, not a count — the counting contract
     allows the comparison and forbids the tally. */
  const routes = ROUTES.map((route) => ({ ...route, members: reach.filter(route.holds) })).filter(
    (route) => route.members.length > 0,
  );
  const ordered = routes.flatMap((route) => route.members);
  if (ordered.length === 0) return null;
  const selected = ordered.find((r) => r.engine_id === selectedId) ?? ordered[0];

  /* Arrow keys move and select together, the way a radio group does — so
     stepping across the plates scrubs the answer beneath them. Wrapping is
     written as a ternary rather than modulo arithmetic, matching
     SegmentedTrack and keeping `.length` out of a sum. */
  const choose = (index: number) => {
    const next = ordered[index];
    if (!next) return;
    setSelectedId(next.engine_id);
    plates.current[next.engine_id]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        choose(index === ordered.length - 1 ? 0 : index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        choose(index === 0 ? ordered.length - 1 : index - 1);
        break;
      case "Home":
        event.preventDefault();
        choose(0);
        break;
      case "End":
        event.preventDefault();
        choose(ordered.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    /* One composite widget: Tab reaches it once and lands on the selected
       plate, arrows move within it. A radiogroup rather than a tablist
       because the plates are interleaved with the route labels that give
       them meaning, and a tablist should own only tabs. */
    <ListCard data-testid="reach-card" role="radiogroup" aria-label="Which engines reach this asset">
      {routes.map((route) => (
        <div
          key={route.key}
          data-testid={`reach-route-${route.key}`}
          className="flex items-center gap-3 px-3 py-2 min-h-9 text-small text-ink-1"
        >
          <span data-testid={`reach-route-label-${route.key}`} className="flex-1 min-w-0">
            {route.title}
          </span>
          {/* Nine plates on a 4px gap measure 230px; the cap lets nine sit on
              one line and wraps the tenth rather than clipping it. */}
          <span className="ml-auto flex flex-wrap justify-end gap-1 max-w-[236px]">
            {route.members.map((r) => {
              const label = `${r.engine_name} — ${answerFor(r)}`;
              const isSelected = r.engine_id === selected.engine_id;
              // Its position across every route, not within this one: the
              // arrow keys walk the whole group, so the index has to be the
              // group's.
              const index = ordered.indexOf(r);
              return (
                <Tooltip key={r.engine_id} label={label} placement="bottom">
                  <button
                    type="button"
                    role="radio"
                    data-testid={`reach-plate-${r.engine_key}`}
                    aria-label={label}
                    aria-checked={isSelected}
                    /* One tab stop for the group: the selected plate is the
                       one Tab can reach, and arrows move from there. */
                    tabIndex={isSelected ? 0 : -1}
                    ref={(el) => {
                      plates.current[r.engine_id] = el;
                    }}
                    className={plateClass(r, isSelected)}
                    onClick={() => setSelectedId(r.engine_id)}
                    onKeyDown={(event) => onKeyDown(event, index)}
                  >
                    <BrandIcon engineKey={r.engine_key} engineName={r.engine_name} size={14} />
                  </button>
                </Tooltip>
              );
            })}
          </span>
        </div>
      ))}
      <div
        data-testid="reach-answer"
        className="flex items-center gap-2.5 px-3 py-2 min-h-8 text-small bg-plane"
      >
        <span className="w-3.5 h-3.5 shrink-0 grid place-items-center" aria-hidden="true">
          <BrandIcon engineKey={selected.engine_key} engineName={selected.engine_name} size={12} />
        </span>
        <span className={`truncate min-w-0 ${selected.reached ? "text-ink-1" : "text-ink-3"}`}>
          {selected.engine_name}
        </span>
        <span data-testid="reach-answer-value" className="ml-auto font-mono text-micro text-ink-3 shrink-0">
          {answerFor(selected)}
        </span>
      </div>
    </ListCard>
  );
}
