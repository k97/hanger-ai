import EngineLabel from "./EngineLabel";
import type { EngineListEntry } from "../utils/enginesList";

// Needs review's plain chip row (NeedsReviewPane.tsx, `chipBaseClass` /
// `chipPressedClass`) as the retired Engines tab drew it: a brand mark in
// place of the pressed chip's check, so the pressed chip keeps the even
// `px-3.5`. Moved here from EnginesPane.tsx with the row, not copied.
const chipBaseClass =
  "h-7 px-3.5 rounded-pill border border-line-2 font-flex text-small text-ink-2 whitespace-nowrap inline-flex items-center gap-2 cursor-pointer transition-colors duration-nav ease-spring hover:bg-plane-2";
const chipPressedClass =
  "h-7 px-3.5 rounded-pill border border-transparent bg-tint text-tint-ink font-medium whitespace-nowrap inline-flex items-center gap-2 cursor-pointer transition-colors duration-nav ease-spring font-flex text-small";

interface EngineChipRowProps {
  /** `enginesList`'s answer, in its order. */
  engines: EngineListEntry[];
  /** The engine the list is seen by; `null` is All engines. */
  selected: string | null;
  onSelect: (engineId: string | null) => void;
}

/**
 * Global's engine selector (Phase 1 of
 * docs/plans/2026-11-25-ia-global-by-engine.md, Q1): "All engines", then one
 * chip per engine with its mark, on every Global tab, straight under the kind
 * tabs and above the summary strip (Q2 of
 * docs/plans/2026-11-25-decisions-round-2.md): `mt-3` off the tabs, and no
 * rule, since it no longer sits inside the strip under its controls. One
 * pressed at a time. The row wraps; it never becomes a grid. No chip
 * carries a figure in Phase 1: the per-engine budget is Phase 2's backend
 * command, and no count is made here.
 */
export default function EngineChipRow({ engines, selected, onSelect }: EngineChipRowProps) {
  return (
    <div
      role="group"
      aria-label="Engines"
      data-testid="engine-chip-row"
      className="mt-3 flex flex-wrap items-center gap-[7px]"
    >
      <button
        type="button"
        aria-pressed={selected === null}
        onClick={() => onSelect(null)}
        className={selected === null ? chipPressedClass : chipBaseClass}
      >
        All engines
      </button>
      {engines.map((engine) => {
        const pressed = engine.engine_id === selected;
        return (
          <button
            key={engine.engine_id}
            type="button"
            aria-pressed={pressed}
            onClick={() => onSelect(engine.engine_id)}
            className={pressed ? chipPressedClass : chipBaseClass}
          >
            <EngineLabel engineKey={engine.engine_id} engineName={engine.engine_name}>
              {engine.engine_name}
            </EngineLabel>
          </button>
        );
      })}
    </div>
  );
}
