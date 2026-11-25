import SourceListShell from "./SourceListShell";
import EngineLabel from "./EngineLabel";
import { captionClass, groupLabelClass } from "./typeRoles";
import type { EngineListEntry } from "../utils/enginesList";

interface EnginesSidebarProps {
  /** `enginesList`'s answer: `null` until the first reply lands. */
  engines: EngineListEntry[] | null;
  /** App's `lastScanAt`; nothing is claimed before it is set. */
  scannedAt: Date | null;
  selected: string | null;
  onSelect: (engineId: string) => void;
  width: number;
  setWidth: (w: number) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

const grpClass = `flex items-center justify-between px-2.5 pt-[11px] pb-[5px] ${groupLabelClass}`;

const rowClass = (active: boolean) =>
  `flex items-center gap-2 h-8 px-3 rounded-pill cursor-pointer transition-colors duration-nav ease-spring ${
    active ? "bg-sidebar-sel text-sidebar-sel-ink" : "text-sidebar-ink hover:bg-sidebar-sel"
  }`;

/**
 * The Engines screen's second column: one row per engine, by the backend's
 * name, and no figure. The summary's `server_count` counts distinct names
 * and leaves out the servers Hanger is keeping, while the pane lists one row
 * per registration plus the kept ones, so a count here would contradict the
 * rows beside it (P7 of docs/plans/2026-11-25-context-control-finish.md).
 *
 * The same shell and row idiom as Discovery's and Needs review's lists.
 */
export default function EnginesSidebar({
  engines,
  scannedAt,
  selected,
  onSelect,
  width,
  setWidth,
  collapsed,
  setCollapsed,
}: EnginesSidebarProps) {
  // Pending is not empty: before the first scan, and before its replies
  // land, the list claims nothing either way.
  const known = scannedAt !== null && engines !== null;

  return (
    <SourceListShell
      testId="engines-sidebar"
      width={width}
      setWidth={setWidth}
      collapsed={collapsed}
      setCollapsed={setCollapsed}
    >
      <div className={grpClass}>Engines</div>
      {known && engines.length === 0 && (
        <p className={`px-3 pt-1 ${captionClass}`}>No engine declares an MCP server.</p>
      )}
      {known &&
        engines.map((engine) => {
          const active = selected === engine.engine_id;
          return (
            <div
              key={engine.engine_id}
              role="button"
              tabIndex={0}
              aria-current={active ? "true" : undefined}
              onClick={() => onSelect(engine.engine_id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(engine.engine_id);
                }
              }}
              className={rowClass(active)}
            >
              <span className={`flex-1 min-w-0 flex text-base-app ${active ? "font-medium" : ""}`}>
                <EngineLabel engineKey={engine.engine_id} engineName={engine.engine_name}>
                  {engine.engine_name}
                </EngineLabel>
              </span>
            </div>
          );
        })}
    </SourceListShell>
  );
}
