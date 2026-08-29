import type { ReactNode } from "react";
import BrandIcon from "./BrandIcon";
import { ChevronRightIcon } from "./icons";
import { captionClass, rowMonoClass } from "./typeRoles";

/**
 * The hero's foldable band — by host on the Global MCP hero, by engine on
 * a project pane (Karthik's ruling, 2026-08-28). Collapsed, it is one line
 * of marks and figures; open, it is the inspector's key-value rows without
 * the card, two across. Every figure arrives from the backend; nothing
 * here is a `.length` on screen — which is why the collapsed line shows
 * every row rather than "the first four and N more".
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
  /** The figure; null renders "—". */
  value: number | null;
  /** The word after the figure when open: "tools" / "assets"; for null, "can't be asked". */
  word: string;
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
}

export default function HeroBand({ label, open, onToggle, rows, note, foot }: HeroBandProps) {
  return (
    <div data-testid="hero-band" className="mt-3 pt-3 border-t border-line">
      <button
        type="button"
        data-testid="hero-band-toggle"
        aria-expanded={open}
        onClick={onToggle}
        className="w-full h-[26px] flex items-center gap-2 text-left cursor-pointer focus:outline-none"
      >
        <ChevronRightIcon size={14} className={`shrink-0 text-ink-3 transition-transform duration-hover ease-spring ${open ? "rotate-90" : ""}`} />
        <span className="text-small font-medium text-ink-1 shrink-0">{label}</span>
        {open ? (
          note && <span className={captionClass}>{note}</span>
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

      {open && (
        <div className="mt-2.5 grid grid-cols-2 gap-x-6">
          {rows.map((r, i) => (
            <div
              key={r.key}
              data-testid={`hero-band-row-${r.key}`}
              className={`flex items-center gap-2.5 min-h-8 py-[7px] border-t border-line ${i < 2 ? "border-t-0" : ""}`}
            >
              <BrandIcon engineKey={r.engineKey} engineName={r.engineName} size={14} />
              <span className="text-base-app text-ink-1 truncate">{r.engineName}</span>
              {r.secondary && <span className={captionClass}>{r.secondary}</span>}
              <span className="ml-auto shrink-0 flex items-baseline gap-1.5">
                <span className={rowMonoClass}>{r.value === null ? "—" : r.value}</span>
                <span className={captionClass}>{r.word}</span>
              </span>
            </div>
          ))}
          {foot && (
            <div data-testid="hero-band-foot" className="col-span-2 flex items-center gap-2.5 min-h-8 py-[7px] border-t border-line">
              {foot}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
