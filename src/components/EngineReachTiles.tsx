import Tooltip from "./Tooltip";
import BrandIcon from "./BrandIcon";
import { joinNames } from "../utils/prose";

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
export default function EngineReachTiles({ reach }: { reach: EngineReachInfo[] }) {
  /* Reached first. Nothing orders the backend's list, so a cap that kept
     declaration order could draw three engines that cannot read the asset
     while hiding three that can — the column would be stating the opposite of
     the truth. Array.sort is stable, so each group keeps its arrival order. */
  const ordered = [...reach].sort((a, b) => Number(b.reached) - Number(a.reached));
  const capped = reach.length > FITS_WHOLE;
  const shown = capped ? ordered.slice(0, SHOWN_WHEN_CAPPED) : ordered;
  const hidden = capped ? ordered.slice(SHOWN_WHEN_CAPPED) : [];

  return (
    <span className="flex items-center gap-1" data-testid="engine-reach-tiles">
      {shown.map((r) => (
        <Tooltip key={r.engine_id} label={tileTip(r)} placement="bottom">
          <i
            data-testid={`reach-tile-${r.engine_key}`}
            data-reached={r.reached ? "true" : "false"}
            aria-label={tileTip(r)}
            className={`w-4 h-4 rounded-[6px] grid place-items-center text-ink-1 not-italic cursor-default ${
              r.reached
                ? ""
                : "border border-line opacity-40"
            }`}
          >
            <BrandIcon engineKey={r.engine_key} engineName={r.engine_name} size={12} />
          </i>
        </Tooltip>
      ))}
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
