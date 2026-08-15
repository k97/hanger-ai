import Tooltip from "./Tooltip";

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

/* Monograms are the fallback until trademark use is cleared; a vendor SVG
   drops into the same 16px slot without a layout change. Keyed by the
   engines table's own keys — first letters collide (three C engines). */
const MONOGRAM: Record<string, string> = {
  claude: "C",
  claude_code: "C",
  codex: "X",
  gemini: "G",
  claude_desktop: "D",
  vscode: "V",
};

function monogram(engineKey: string): string {
  return MONOGRAM[engineKey] ?? engineKey.charAt(0).toUpperCase();
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

/** The Reach column: one 16px tile per engine, filled when the engine can
 *  read the asset through its linked root. */
export default function EngineReachTiles({ reach }: { reach: EngineReachInfo[] }) {
  return (
    <span className="flex items-center gap-1" data-testid="engine-reach-tiles">
      {reach.map((r) => (
        <Tooltip key={r.engine_id} label={tileTip(r)} placement="bottom">
          <i
            data-testid={`reach-tile-${r.engine_key}`}
            data-reached={r.reached ? "true" : "false"}
            aria-label={tileTip(r)}
            className={`w-4 h-4 rounded-[6px] grid place-items-center font-flex text-micro font-medium not-italic cursor-default ${
              r.reached
                ? "bg-fill text-on-fill"
                : "border border-line-2 text-ink-3 opacity-50"
            }`}
          >
            {monogram(r.engine_key)}
          </i>
        </Tooltip>
      ))}
    </span>
  );
}
