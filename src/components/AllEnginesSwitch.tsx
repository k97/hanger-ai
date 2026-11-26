import LayerSwitch from "./LayerSwitch";
import Tooltip from "./Tooltip";
import { captionClass } from "./typeRoles";
import { allEnginesStateLabel, allEnginesSwitchLabel } from "../utils/switchCopy";
import type { AllEnginesState } from "../utils/switchTargets";

/**
 * The switch in an MCP server's inspector header that covers every engine
 * (docs/plans/2026-11-25-decisions-round-5.md, -round-6.md), and its state
 * word beside it: "On", "Off" or "On in some".
 *
 * The Registered in rows' switch, verbatim (`McpServerDetail`'s
 * `switchBtnClass`, DESIGN.md §7): a button holding the shared `LayerSwitch`,
 * pressed by its state. "On in some" is `aria-pressed="mixed"`, the toggle
 * button's own third state, and draws the track on, because a click turns
 * the server off. Disabled while a group runs (`pending`).
 *
 * Draws what it is handed. Which items count, and what a click sends, are
 * `switchTargets`' (`serverSwitchTargets`, `allEnginesRequests`).
 */

const switchBtnClass =
  "shrink-0 grid place-items-center rounded-pill cursor-pointer disabled:cursor-default disabled:opacity-50";

export default function AllEnginesSwitch({
  server,
  state,
  pending,
  onToggle,
}: {
  server: string;
  state: AllEnginesState;
  pending: boolean;
  onToggle: () => void;
}) {
  const label = allEnginesSwitchLabel(server);
  return (
    <span data-testid="all-engines-switch" className="ml-auto shrink-0 flex items-center gap-2">
      <Tooltip label={label} placement="bottom">
        <button
          type="button"
          aria-pressed={state === "some" ? "mixed" : state === "on"}
          aria-label={label}
          aria-busy={pending || undefined}
          disabled={pending}
          onClick={onToggle}
          className={switchBtnClass}
        >
          <LayerSwitch on={state !== "off"} />
        </button>
      </Tooltip>
      <span className={`whitespace-nowrap ${captionClass}`}>{allEnginesStateLabel(state)}</span>
    </span>
  );
}
