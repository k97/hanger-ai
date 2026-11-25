import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import ListCard, { ListCardRow } from "./ListCard";
import LayerSwitch from "./LayerSwitch";
import {
  captionClass,
  monoLabelClass,
  rowMonoClass,
  rowValueClass,
  sectionHeadClass,
} from "./typeRoles";
import { miniBtnClass } from "./miniButton";
import { busyKeyOf, type McpSwitch } from "../hooks/useMcpSwitch";
import type { ContextItem, EngineContext } from "../types/engineContext";
import {
  budgetCaption,
  budgetHeadline,
  costLabel,
  mechanismLine,
  readOnlyLine,
  stateLabel,
} from "../utils/switchCopy";

interface EnginesPaneProps {
  /** The engine the source list has selected; `null` when there is none. */
  engineId: string | null;
  /** App's `lastScanAt`: no absence is asserted before it is set. */
  scannedAt: Date | null;
  /** App's one switch state (`useMcpSwitch`). */
  switcher: McpSwitch;
  /** Bumped by App on every `scan://complete`, so the pane reads again. */
  refreshNonce: number;
}

// A switch is the button, labelled by the server and pressed by its state,
// holding the decorative track (DESIGN.md §7).
const switchBtnClass =
  "shrink-0 grid place-items-center rounded-pill cursor-pointer disabled:cursor-default disabled:opacity-50";
const measureBtnClass = `${miniBtnClass} shrink-0 disabled:cursor-default disabled:opacity-50`;
const itemClass = "px-3 py-[9px]";
const itemLineClass = `mt-1 ${captionClass}`;

/**
 * One engine's Context: what it loads on every request, what that costs by the
 * probe cache's estimate, and a switch for each server Hanger can switch.
 *
 * Every figure is the backend's (`get_engine_context`, docs/ipc.md entry 15):
 * the budget is `on_tokens_measured`, which counts a launch the engine
 * declares twice once, so it is never a sum of the rows. A switch goes
 * through `switcher` and nothing else; its reply's context replaces this one
 * straight away, and App's rescan brings the refetch that follows.
 */
export default function EnginesPane({ engineId, scannedAt, switcher, refreshNonce }: EnginesPaneProps) {
  const [context, setContext] = useState<EngineContext | null>(null);
  const [measuringFor, setMeasuringFor] = useState<string | null>(null);
  // The engine on screen now, for replies that land after it has changed.
  const currentRef = useRef(engineId);
  currentRef.current = engineId;

  const accept = (next: EngineContext | null) => {
    if (next && next.engine_id === currentRef.current) setContext(next);
  };

  useEffect(() => {
    // Another engine's rows never stand under this one's name; a refetch of
    // the same engine keeps its rows until the answer lands.
    setContext((prev) => (prev && prev.engine_id === engineId ? prev : null));
    if (engineId === null) return;
    let cancelled = false;
    invoke<EngineContext>("get_engine_context", { engineId })
      .then((reply) => {
        if (!cancelled) accept(reply);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [engineId, refreshNonce]);

  const measure = async () => {
    if (!context) return;
    const id = context.engine_id;
    setMeasuringFor(id);
    try {
      accept(await invoke<EngineContext>("measure_engine_context", { engineId: id }));
    } catch {
      // The command does not fail (docs/ipc.md entry 18); the figures stay.
    } finally {
      setMeasuringFor((prev) => (prev === id ? null : prev));
    }
  };

  const toggle = async (item: ContextItem) => {
    if (!context) return;
    accept(
      await switcher.switchServer({
        engineId: context.engine_id,
        engineName: context.engine_name,
        key: item.key,
        serverName: item.name,
        file: item.config_path,
        enabled: item.state !== "on",
      })
    );
  };

  const shown = context !== null && context.engine_id === engineId ? context : null;
  const measuring = shown !== null && measuringFor === shown.engine_id;

  return (
    // No ground of its own: <main>'s sheet is the ground (DESIGN.md §6).
    <div data-testid="engines-pane" className="flex-1 min-h-0 overflow-y-auto pt-[18px] pb-[18px] font-sans">
      {shown && (
        <div className="mx-[18px] flex flex-col">
          <h2 className="text-lg-app font-medium tracking-[-0.3px] text-ink-1 truncate">{shown.engine_name}</h2>

          {shown.items.length === 0 ? (
            scannedAt !== null && (
              <p className={`mt-3.5 ${captionClass}`}>{shown.engine_name} declares no MCP servers.</p>
            )
          ) : (
            <>
              <div className="mt-3.5">
                <ListCard data-testid="engine-budget">
                  <ListCardRow
                    label={
                      <span className="min-w-0 flex flex-col">
                        <span className={rowValueClass}>{budgetHeadline(shown.on_tokens_measured)}</span>
                        <span className={captionClass}>
                          {budgetCaption(shown.measured_on_count, shown.on_count, shown.off_count)}
                        </span>
                      </span>
                    }
                    trailing={
                      <button
                        type="button"
                        onClick={() => void measure()}
                        disabled={measuring}
                        className={measureBtnClass}
                      >
                        {measuring ? "Measuring…" : "Measure all"}
                      </button>
                    }
                  />
                </ListCard>
                <p className={`mt-1.5 ${captionClass}`}>
                  Starts each server that's on and has no recent answer, and reads its tool list.
                </p>
              </div>

              <h3 className={`mt-[18px] mb-2 ${sectionHeadClass}`}>Context</h3>
              <ListCard data-testid="engine-items">
                {shown.items.map((item) => {
                  const names = { engine: shown.engine_name, server: item.name, file: item.config_path };
                  const kept = item.key.startsWith("stash:");
                  const busy = switcher.busyKeys.has(busyKeyOf(shown.engine_id, item.key));
                  return (
                    <div key={item.key} data-testid="engine-item" className={itemClass}>
                      <div className="flex items-center gap-2.5">
                        <div className="min-w-0 flex-1 flex flex-col">
                          <span data-testid="engine-item-name" className={`truncate ${rowValueClass}`}>
                            {item.name}
                          </span>
                          <span className={`truncate ${monoLabelClass}`}>
                            {kept ? item.tier : `${item.tier} · ${item.config_path}`}
                          </span>
                        </div>
                        <span className={`shrink-0 ${item.estimated_tokens === null ? captionClass : rowMonoClass}`}>
                          {costLabel(item.estimated_tokens)}
                        </span>
                        {item.read_only === null ? (
                          <button
                            type="button"
                            aria-pressed={item.state === "on"}
                            aria-label={item.name}
                            disabled={busy}
                            onClick={() => void toggle(item)}
                            className={switchBtnClass}
                          >
                            <LayerSwitch on={item.state === "on"} />
                          </button>
                        ) : (
                          <span className={`shrink-0 w-[26px] text-right ${captionClass}`}>
                            {stateLabel(item.state)}
                          </span>
                        )}
                      </div>
                      {item.read_only !== null && (
                        <p className={itemLineClass}>{readOnlyLine(item.read_only, names)}</p>
                      )}
                      {kept && <p className={itemLineClass}>{mechanismLine("claude_kept", names)}</p>}
                      {shown.switches_by_name && (
                        <p className={itemLineClass}>{mechanismLine("gemini_by_name", names)}</p>
                      )}
                    </div>
                  );
                })}
              </ListCard>
            </>
          )}
        </div>
      )}
    </div>
  );
}
