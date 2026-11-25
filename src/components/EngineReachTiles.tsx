import Tooltip from "./Tooltip";
import BrandIcon from "./BrandIcon";
import { joinNames } from "../utils/prose";
import { paletteActionLabel, readOnlyLine, stateLabel } from "../utils/switchCopy";
import { sameEngine } from "../utils/switchTargets";
import type { ItemState, ReadOnlyReason } from "../types/engineContext";

/** One engine's verdict on one asset, as the backend derived it. The
 *  frontend renders the list verbatim (dispatch item 8). */
export interface EngineReachInfo {
  engine_id: number;
  engine_key: string;
  engine_name: string;
  reached: boolean;
  via_root?: string | null;
  via_store?: string | null;
  reason?: string | null;
}

/* Copy signed off 2026-08-15 (naming brief). Private again as of 2026-08-17:
   the inspector briefly rendered these same strings, then moved each reason
   onto a group heading, so the tile tip is once more the only caller. */
function tileTip(r: EngineReachInfo): string {
  if (r.reached) {
    return r.via_root && r.via_store
      ? `${r.engine_name} — reaches it via ${r.via_root} → ${r.via_store}`
      : `${r.engine_name} — reads it in place`;
  }
  return r.reason === "format"
    ? `${r.engine_name} — cannot read this format`
    : `${r.engine_name} — root not linked`;
}

/* The cell is 100px and a tile is 16px on a 4px gap, so N marks measure
   20N − 4: four fit at 76px, five do not at 96px once the chip is allowed for.
   Uncapped, seven marks measured 133px in the running window and painted 21px
   into Beyond the store, landing on the project count and hiding it.
   Four is therefore the largest set drawn whole, and above it three marks plus
   one chip come to 84px. */
const FITS_WHOLE = 4;
const SHOWN_WHEN_CAPPED = 3;

/* Copy pass 2026-08-17. Names the engines rather than counting them, and does
   not tell the reader to open anything: the chip is not a control. */
function overflowTip(hidden: EngineReachInfo[]): string {
  return `${joinNames(hidden.map((r) => r.engine_name))} — the panel answers for each one`;
}

/** One tile's switch, on Global's MCP servers rows only (T2 of
 *  docs/plans/2026-11-25-ia-engines-into-global.md): the tile's engine has an
 *  item for the row, in this state. The names are the engine context's, so
 *  the tile says what the switch notice will. */
export interface TileSwitch {
  engineName: string;
  serverName: string;
  file?: string;
  state: ItemState;
  /** `null`: Hanger can switch it. */
  readOnly: ReadOnlyReason | null;
  /** Its request is in flight. */
  busy: boolean;
  onToggle: () => void;
}

/* The action the click takes, named for the state it leads to: ⌘K's label
   (switchCopy), so the tile and the palette offer one action in one phrase. */
function switchTip(t: TileSwitch): string {
  return paletteActionLabel(t.state !== "on", { engine: t.engineName, server: t.serverName });
}

/* The tile tip's `name — statement` shape, holding the state and its
   read-only line from switchCopy. */
function readOnlyTip(t: TileSwitch, reason: ReadOnlyReason): string {
  const line = readOnlyLine(reason, { engine: t.engineName, server: t.serverName, file: t.file });
  return `${t.engineName} — ${stateLabel(t.state)}. ${line}`;
}

const tileClass = "w-4 h-4 rounded-[6px] grid place-items-center text-ink-1 not-italic";
/* Off is an outline: an --ink-3 ring, no fill, the tile itself unfaded and
   only the mark inside dimmed. --ink-3 rather than the --line-2 it was, so
   off reads as a ring at a glance and not as one more faded tile: another
   engine's tile (`opacity-40`) and a read-only one (`opacity-60`) are the
   faded looks, and off must not be mistaken for either (Q3 of
   docs/plans/2026-11-25-decisions-round-2.md). It also stays apart from the
   unreached slot's faint --line ring at `opacity-40`. On is the mark alone,
   as a reached engine is. */
const offClass = "border border-ink-3";

/** The Reach column: a 16px slot per engine up to four, and above that three
 *  slots plus an ellipsis chip, each carrying that engine's
 *  own mark (BrandIcon). Each mark is its owner's trademark, drawn only to
 *  identify the third-party product the user has installed (nominative use),
 *  unmodified from source — provenance and licence for every mark are in
 *  src/assets/brand/SOURCES.md.
 *
 *  A reached engine is the mark alone — a vendor logo carries itself and a ring
 *  around it only competes. An unreached one is an empty slot: a thin --line
 *  ring plus a dimmed mark, so absence reads as absence rather than as a
 *  slightly fainter presence. --line (~0.1 alpha) rather than --line-2 (~0.2):
 *  a dark line on a light page reads heavier than its alpha suggests.
 */
/** `switchFor`, given only on Global's MCP servers rows, makes a tile whose
 *  engine has an item for the row that engine's switch for the server: a
 *  `<button aria-pressed>`, as the Engines tab's switch is. A read-only item
 *  keeps its state's look — the mark, or the off ring — faded to
 *  `opacity-60` and inert, with its reason as the tip. A tile with no item,
 *  and every tile without `switchFor`, draws as today.
 *
 *  `leadEngine`, given on every Global row while Global is seen by one
 *  engine (an MCP host id, matched across formats by `sameEngine`), draws
 *  that engine's tile first and dims every other one to `opacity-40`
 *  (`data-dimmed`): the row is being read for that engine. The dimmed tiles
 *  keep their switches. */
export default function EngineReachTiles({
  reach,
  switchFor,
  leadEngine,
}: {
  reach: EngineReachInfo[];
  switchFor?: (r: EngineReachInfo) => TileSwitch | null;
  leadEngine?: string | null;
}) {
  /* Reached first. Nothing orders the backend's list, so a cap that kept
     declaration order could draw three engines that cannot read the asset
     while hiding three that can — the column would be stating the opposite of
     the truth. Array.sort is stable, so each group keeps its arrival order.
     A lead engine goes before both, so the cap never hides it. */
  const leads = (r: EngineReachInfo) => (leadEngine ? sameEngine(leadEngine, r.engine_key) : false);
  const dimmed = (r: EngineReachInfo) => (leadEngine ? !leads(r) : false);
  const ordered = [...reach].sort(
    (a, b) => Number(leads(b)) - Number(leads(a)) || Number(b.reached) - Number(a.reached)
  );
  const capped = reach.length > FITS_WHOLE;
  const shown = capped ? ordered.slice(0, SHOWN_WHEN_CAPPED) : ordered;
  const hidden = capped ? ordered.slice(SHOWN_WHEN_CAPPED) : [];

  return (
    <span className="flex items-center gap-1" data-testid="engine-reach-tiles">
      {shown.map((r) => {
        const sw = switchFor?.(r) ?? null;
        if (sw && sw.readOnly === null) {
          const label = switchTip(sw);
          const on = sw.state === "on";
          return (
            <Tooltip key={r.engine_id} label={label} placement="bottom">
              <button
                type="button"
                data-testid={`reach-tile-${r.engine_key}`}
                data-reached={r.reached ? "true" : "false"}
                data-state={sw.state}
                data-dimmed={dimmed(r) ? "true" : undefined}
                aria-label={label}
                aria-pressed={on}
                disabled={sw.busy}
                onClick={(e) => {
                  // The row under the tile opens the inspector; a switch is
                  // not a choice of subject.
                  e.stopPropagation();
                  sw.onToggle();
                }}
                className={`${tileClass} cursor-pointer hover:bg-plane-2 transition-colors duration-hover ease-spring disabled:cursor-default disabled:opacity-50 ${
                  on ? "" : offClass
                } ${dimmed(r) ? "opacity-40" : ""}`}
              >
                <BrandIcon
                  engineKey={r.engine_key}
                  engineName={r.engine_name}
                  size={12}
                  className={on ? undefined : "opacity-40"}
                />
              </button>
            </Tooltip>
          );
        }
        if (sw && sw.readOnly !== null) {
          const label = readOnlyTip(sw, sw.readOnly);
          const on = sw.state === "on";
          return (
            <Tooltip key={r.engine_id} label={label} placement="bottom">
              <i
                data-testid={`reach-tile-${r.engine_key}`}
                data-reached={r.reached ? "true" : "false"}
                data-state={sw.state}
                data-read-only="true"
                data-dimmed={dimmed(r) ? "true" : undefined}
                aria-label={label}
                className={`${tileClass} cursor-default ${dimmed(r) ? "opacity-40" : "opacity-60"} ${on ? "" : offClass}`}
              >
                <BrandIcon
                  engineKey={r.engine_key}
                  engineName={r.engine_name}
                  size={12}
                  className={on ? undefined : "opacity-40"}
                />
              </i>
            </Tooltip>
          );
        }
        return (
        <Tooltip key={r.engine_id} label={tileTip(r)} placement="bottom">
          <i
            data-testid={`reach-tile-${r.engine_key}`}
            data-reached={r.reached ? "true" : "false"}
            data-dimmed={dimmed(r) ? "true" : undefined}
            aria-label={tileTip(r)}
            className={`w-4 h-4 rounded-[6px] grid place-items-center text-ink-1 not-italic cursor-default ${
              r.reached
                ? dimmed(r)
                  ? "opacity-40"
                  : ""
                : "border border-line opacity-40"
            }`}
          >
            <BrandIcon engineKey={r.engine_key} engineName={r.engine_name} size={12} />
          </i>
        </Tooltip>
        );
      })}
      {hidden.length > 0 && (
        /* An ellipsis rather than a number: "+4" would be a count the backend
           never gave us, and the ellipsis says "there is more" without one.
           The label names every engine it stands in for, so the answer is one
           hover away rather than only one click away.
           It does not say "open the panel" — the chip has no handler and is not
           a control. The row's own click opens the inspector, which lists every
           engine with its verdict. Phrased as `names — statement` to match the
           tile tips beside it. */
        <Tooltip label={overflowTip(hidden)} placement="bottom">
          <i
            data-testid="reach-overflow"
            aria-label={overflowTip(hidden)}
            className="w-4 h-4 rounded-[6px] flex items-center justify-center gap-0.5 border border-line text-ink-3 not-italic cursor-default"
          >
            {/* Three drawn dots, not the "…" character. That glyph sits on the
                baseline, so centring its line box still renders the dots low in
                a 16px slot, and the correction would be an offset tuned to one
                font's metrics — wrong the moment the stack falls back. Three
                2px dots are centred by the flex box itself, at any font.
                aria-hidden because the label on the parent carries the meaning. */}
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                aria-hidden="true"
                className="w-0.5 h-0.5 rounded-pill bg-current"
              />
            ))}
          </i>
        </Tooltip>
      )}
    </span>
  );
}
