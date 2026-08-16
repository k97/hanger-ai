import Tooltip from "./Tooltip";
import BrandIcon from "./BrandIcon";

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

/* Copy signed off 2026-08-15 (naming brief). */
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

/** The Reach column: one 16px slot per engine, each carrying that engine's
 *  own mark (BrandIcon; trademark note in the design record, spec §14).
 *
 *  A reached engine is the mark alone — a vendor logo carries itself and a ring
 *  around it only competes. An unreached one is an empty slot: a thin --line
 *  ring plus a dimmed mark, so absence reads as absence rather than as a
 *  slightly fainter presence. --line (~0.1 alpha) rather than --line-2 (~0.2):
 *  a dark line on a light page reads heavier than its alpha suggests.
 */
export default function EngineReachTiles({ reach }: { reach: EngineReachInfo[] }) {
  return (
    <span className="flex items-center gap-1" data-testid="engine-reach-tiles">
      {reach.map((r) => (
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
    </span>
  );
}
