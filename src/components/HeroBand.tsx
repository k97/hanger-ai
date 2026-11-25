import type { ReactNode } from "react";
import BrandIcon from "./BrandIcon";
import { ChevronRightIcon } from "./icons";
import { captionClass, rowMonoClass } from "./typeRoles";

/**
 * The hero's foldable band — "By engine" on the Global MCP hero and on a
 * project pane (Karthik's rulings, 2026-08-28 and, for the Global hero,
 * 2026-11-25). Collapsed, it is one line of marks and figures; open, it is
 * the inspector's key-value rows without the card, two across. Every figure
 * arrives from the backend; nothing here is a `.length` on screen — which is
 * why the collapsed line shows every row rather than "the first four and N
 * more".
 */
export interface HeroBandRow {
  key: string;
  /** Any identifier the UI holds for an engine or host: hyphenated MCP
   *  host ids and underscored asset engine keys are both correct and both
   *  pass straight through to BrandIcon; never normalise them here. */
  engineKey: string;
  engineName: string;
  /** Secondary text under the name in the open rows; nothing on a project pane. */
  secondary?: string;
  /** The figure, as the backend counted it or already formatted ("≈ 12,400"); null renders "—". */
  value: number | string | null;
  /** The word after the figure when open: "tokens" / "assets"; for null, what is unknown. */
  word: string;
  /** Given, the open row is a button that filters by it: `aria-pressed`
   *  while it is the filter, disabled when `onPress` is null. */
  filter?: { pressed: boolean; onPress: (() => void) | null };
}

export interface HeroBandProps {
  label: string;
  open: boolean;
  onToggle: () => void;
  rows: HeroBandRow[];
  /** Shown in the summary line when open. */
  note?: string;
  /** A full-width last row. */
  foot?: ReactNode;
  /** Controls at the right of the header line, beside the fold, in both
   *  states: they cannot sit inside the fold's own button. */
  trailing?: ReactNode;
}

const rowClass = "flex items-center gap-2.5 min-h-8 py-[7px] border-t border-line";
// A filter row: the same row, pressable, with the tint of a pressed chip.
const filterRowClass = `${rowClass} w-full -mx-1.5 px-1.5 text-left font-sans cursor-pointer disabled:cursor-default transition-colors duration-hover ease-spring`;

export default function HeroBand({ label, open, onToggle, rows, note, foot, trailing }: HeroBandProps) {
  return (
    <div data-testid="hero-band" className="@container mt-3 pt-3 border-t border-line">
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="hero-band-toggle"
          aria-expanded={open}
          onClick={onToggle}
          className="flex-1 min-w-0 h-[26px] flex items-center gap-2 text-left cursor-pointer focus:outline-none"
        >
          <ChevronRightIcon size={14} className={`shrink-0 text-ink-3 transition-transform duration-hover ease-spring ${open ? "rotate-90" : ""}`} />
          <span className="text-small font-medium text-ink-1 shrink-0">{label}</span>
          {open ? (
            note && <span className={`min-w-0 truncate ${captionClass}`}>{note}</span>
          ) : (
            <span data-testid="hero-band-collapsed" className="flex items-center gap-3.5 min-w-0 overflow-hidden">
              {rows.map((r) => (
                <span key={r.key} className="flex items-center gap-1.5 shrink-0">
                  <BrandIcon engineKey={r.engineKey} engineName={r.engineName} size={13} />
                  <span className={rowMonoClass}>{r.value === null ? "—" : r.value}</span>
                </span>
              ))}
            </span>
          )}
        </button>
        {trailing}
      </div>

      {/* One column until the band is wide enough for two: two columns at
          the default window with the inspector open cut every engine name
          to "Cla…" (F1, 2026-11-25). */}
      {open && (
        <div className="mt-2.5 grid grid-cols-1 @[680px]:grid-cols-2 gap-x-6">
          {rows.map((r, i) => {
            const body = (
              <>
                <BrandIcon engineKey={r.engineKey} engineName={r.engineName} size={14} />
                <span title={r.engineName} className="text-base-app text-ink-1 truncate">{r.engineName}</span>
                {r.secondary && <span className={`min-w-0 truncate ${captionClass}`}>{r.secondary}</span>}
                <span className="ml-auto shrink-0 flex items-baseline gap-1.5">
                  <span className={rowMonoClass}>{r.value === null ? "—" : r.value}</span>
                  <span className={captionClass}>{r.word}</span>
                </span>
              </>
            );
            // The grid's opening line carries no top border: the first row,
            // and the second as well once there are two columns.
            const edge = i === 0 ? "border-t-0" : i === 1 ? "@[680px]:border-t-0" : "";
            return r.filter ? (
              <button
                key={r.key}
                type="button"
                data-testid={`hero-band-row-${r.key}`}
                aria-pressed={r.filter.pressed}
                disabled={r.filter.onPress === null}
                onClick={r.filter.onPress ?? undefined}
                className={`${filterRowClass} ${edge} ${r.filter.pressed ? "bg-tint" : "hover:bg-plane-2 disabled:hover:bg-transparent"}`}
              >
                {body}
              </button>
            ) : (
              <div key={r.key} data-testid={`hero-band-row-${r.key}`} className={`${rowClass} ${edge}`}>
                {body}
              </div>
            );
          })}
          {foot && (
            <div data-testid="hero-band-foot" className="col-span-full flex items-center gap-2.5 min-h-8 py-[7px] border-t border-line">
              {foot}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
